import { API_BASE, API_KEY } from './config';
import { getDemoCode } from './demoCode';
import { serverStatus } from './serverStatus';
import { getSnapshot } from './snapshot';
import type {
  DemoStatus,
  EvalHistoryEntry,
  EvalReport,
  FeedbackBody,
  FeedbackStats,
  FlaggedItem,
  Health,
  JobAccepted,
  ModelKind,
  ModelsInfo,
  PipelineRun,
  RealignDataset,
  Spend,
  SupportResponse,
} from './types';

export { API_BASE, API_KEY };

/** 403 detail the backend returns for paid/state-changing actions in demo mode. */
export const DEMO_DISABLED_DETAIL = 'disabled in demo';
export const DEMO_DISABLED_MESSAGE = 'Disabled in the public demo';

const UNREACHABLE = 'Could not reach the API. Is the backend running?';

export class ApiError extends Error {
  /** HTTP status; 0 means the request never reached the server. */
  readonly status: number;
  readonly path: string;
  /** Raw `detail` string from the response body, when there was one. */
  readonly detail: string | null;

  constructor(status: number, path: string, message: string, detail: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
    this.detail = detail;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isNetwork(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 504;
  }
}

export function detailOf(body: unknown): string | null {
  if (body && typeof body === 'object' && 'detail' in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map((x) => (x as { msg?: string }).msg ?? JSON.stringify(x)).join('; ');
  }
  return null;
}

/**
 * Request headers. `X-API-Key` only when a key is configured (never in public builds);
 * `X-Demo-Code` only for chat calls (`demo: true`) when the visitor has unlocked the demo.
 */
export function headers(extra?: Record<string, string>, opts: { demo?: boolean } = {}): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (API_KEY) h['X-API-Key'] = API_KEY;
  const code = opts.demo ? getDemoCode() : null;
  if (code) h['X-Demo-Code'] = code;
  return { ...h, ...extra };
}

/** Message for a failed response: the server's detail, mapped to friendlier copy where we know it. */
export function errorMessage(status: number, detail: string | null): string {
  if (status === 403 && detail === DEMO_DISABLED_DETAIL) return `${DEMO_DISABLED_MESSAGE}.`;
  if (detail) return detail;
  if (status === 401 || status === 403) return 'The API rejected the request. Check VITE_API_KEY.';
  if (status === 404) return 'Not found.';
  if (status === 429) return 'Rate limited — slow down and retry in a moment.';
  if (status >= 500 && status !== 503) return 'The API returned a server error.';
  return `Request failed (${status}).`;
}

export async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal; demo?: boolean } = {},
): Promise<T> {
  const method = init.method ?? 'GET';
  // While the API is asleep (or not yet confirmed up), answer reads from the static snapshot.
  if (method === 'GET' && serverStatus.getSnapshot().status !== 'up') {
    const saved = await getSnapshot(path);
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (saved !== undefined) return saved as T;
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: headers(init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined, { demo: init.demo }),
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, path, UNREACHABLE);
  }
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    // Vite proxy answers 500 with an empty body when the upstream is down.
    if (res.status === 500 && !text) throw new ApiError(0, path, UNREACHABLE);
    const detail = detailOf(body);
    throw new ApiError(res.status, path, errorMessage(res.status, detail), detail);
  }
  return body as T;
}

type Sig = { signal?: AbortSignal };

export const api = {
  health: ({ signal }: Sig = {}) => request<Health>('/health', { signal }),
  ready: ({ signal }: Sig = {}) => request<Health>('/ready', { signal }),
  models: ({ signal }: Sig = {}) => request<ModelsInfo>('/v1/models', { signal }),
  query: (query: string, model: ModelKind, useCache = true) =>
    request<SupportResponse>('/v1/support/query', { method: 'POST', body: { query, model, use_cache: useCache }, demo: true }),
  runs: ({ signal }: Sig = {}) => request<PipelineRun[]>('/v1/pipeline/runs?limit=25', { signal }),
  align: (confirm: boolean, deploy = false) =>
    request<JobAccepted>('/v1/pipeline/align', { method: 'POST', body: { confirm, deploy } }),
  deploy: () => request<JobAccepted>('/v1/pipeline/deploy', { method: 'POST', body: {} }),
  spend: ({ signal }: Sig = {}) => request<Spend>('/v1/spend', { signal }),
  evalLatest: ({ signal }: Sig = {}) => request<EvalReport>('/v1/eval/latest', { signal }),
  evalHistory: ({ signal }: Sig = {}) => request<EvalHistoryEntry[]>('/v1/eval/history', { signal }),
  evalRun: (id: string, { signal }: Sig = {}) => request<EvalReport>(`/v1/eval/runs/${encodeURIComponent(id)}`, { signal }),
  feedback: (body: FeedbackBody) => request<{ id: string; flagged: boolean }>('/v1/feedback', { method: 'POST', body }),
  flagged: ({ signal }: Sig = {}) => request<FlaggedItem[]>('/v1/feedback/flagged', { signal }),
  feedbackStats: ({ signal }: Sig = {}) => request<FeedbackStats>('/v1/feedback/stats', { signal }),
  realign: (confirm: boolean) => request<JobAccepted>('/v1/realign', { method: 'POST', body: { confirm } }),
  realignDataset: ({ signal }: Sig = {}) => request<RealignDataset>('/v1/realign/dataset', { signal }),
  demoStatus: ({ signal }: Sig = {}) => request<DemoStatus>('/v1/demo/status', { signal }),
  demoVerify: (code: string) => request<{ ok: boolean }>('/v1/demo/verify', { method: 'POST', body: { code } }),
};
