import type {
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

export const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '');
export const API_KEY = import.meta.env.VITE_API_KEY ?? 'dev-key-change-me';

export class ApiError extends Error {
  /** HTTP status; 0 means the request never reached the server. */
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isNetwork(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 504;
  }
}

function detailOf(body: unknown): string | null {
  if (body && typeof body === 'object' && 'detail' in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map((x) => (x as { msg?: string }).msg ?? JSON.stringify(x)).join('; ');
  }
  return null;
}

export function headers(extra?: Record<string, string>): Record<string, string> {
  return { 'X-API-Key': API_KEY, Accept: 'application/json', ...extra };
}

export async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: headers(init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined),
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, path, 'Could not reach the API. Is the backend running on :8000?');
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
    const fallback =
      res.status === 401 || res.status === 403
        ? 'The API rejected the key. Check VITE_API_KEY.'
        : res.status === 404
          ? 'Not found.'
          : res.status === 429
            ? 'Rate limited — slow down and retry in a moment.'
            : res.status >= 500 && res.status !== 503
              ? 'The API returned a server error.'
              : `Request failed (${res.status}).`;
    // Vite proxy answers 500 with an empty body when the upstream is down.
    if (res.status === 500 && !text) throw new ApiError(0, path, 'Could not reach the API. Is the backend running on :8000?');
    throw new ApiError(res.status, path, detailOf(body) ?? fallback);
  }
  return body as T;
}

type Sig = { signal?: AbortSignal };

export const api = {
  health: ({ signal }: Sig = {}) => request<Health>('/health', { signal }),
  ready: ({ signal }: Sig = {}) => request<Health>('/ready', { signal }),
  models: ({ signal }: Sig = {}) => request<ModelsInfo>('/v1/models', { signal }),
  query: (query: string, model: ModelKind, useCache = true) =>
    request<SupportResponse>('/v1/support/query', { method: 'POST', body: { query, model, use_cache: useCache } }),
  runs: ({ signal }: Sig = {}) => request<PipelineRun[]>('/v1/pipeline/runs?limit=25', { signal }),
  align: (confirm: boolean, deploy = false) =>
    request<JobAccepted>('/v1/pipeline/align', { method: 'POST', body: { confirm, deploy } }),
  deploy: () => request<JobAccepted>('/v1/pipeline/deploy', { method: 'POST', body: {} }),
  spend: ({ signal }: Sig = {}) => request<Spend>('/v1/spend', { signal }),
  evalLatest: ({ signal }: Sig = {}) => request<EvalReport>('/v1/eval/latest', { signal }),
  evalHistory: ({ signal }: Sig = {}) => request<EvalHistoryEntry[]>('/v1/eval/history', { signal }),
  feedback: (body: FeedbackBody) => request<{ id: string; flagged: boolean }>('/v1/feedback', { method: 'POST', body }),
  flagged: ({ signal }: Sig = {}) => request<FlaggedItem[]>('/v1/feedback/flagged', { signal }),
  feedbackStats: ({ signal }: Sig = {}) => request<FeedbackStats>('/v1/feedback/stats', { signal }),
  realign: (confirm: boolean) => request<JobAccepted>('/v1/realign', { method: 'POST', body: { confirm } }),
  realignDataset: ({ signal }: Sig = {}) => request<RealignDataset>('/v1/realign/dataset', { signal }),
};
