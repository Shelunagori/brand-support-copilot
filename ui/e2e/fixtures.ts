import type { Page, Route } from '@playwright/test';

/** Shared mocks: every API call in these specs is intercepted; nothing reaches a real backend. */

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export async function setTheme(page: Page, theme: Theme) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('ut-theme', t);
    } catch {
      /* ignore */
    }
  }, theme);
}

export const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** /health answers immediately, so the app never shows the wake-up screen. */
export async function healthUp(page: Page) {
  await page.route('**/health', (r) => json(r, { status: 'ok' }));
  await page.route('**/ready', (r) => json(r, { status: 'ready', checks: { postgres: 'ok', redis: 'ok' } }));
}

export const metrics = (model_id: string, acc: number) => ({
  model_id,
  n: 40,
  factual_accuracy: acc,
  policy_violation_rate: 0.05,
  escalation_accuracy: acc,
  json_validity: 0.98,
  policy_ref_accuracy: acc - 0.1,
  latency_p50_ms: 900,
  latency_p95_ms: 2100,
  total_tokens: 40000,
  est_cost_usd: 0.02,
});

export const evalReport = (id: string, generated_at: string, acc: number, label?: string) => ({
  id,
  ...(label ? { label } : {}),
  generated_at,
  summary: { base: metrics('meta-llama/Llama-3.2-3B-Instruct', 0.5), aligned: metrics('ut-aligned', acc) },
  questions: [],
});

export const HISTORY = [
  { id: 'run-1', label: 'initial alignment', generated_at: '2026-10-21T10:00:00Z', acc: 0.62 },
  { id: 'run-2', label: 'after re-alignment', generated_at: '2026-10-22T10:00:00Z', acc: 0.7 },
  { id: 'run-3', label: 'Exp 3 + JSON repair (offline re-score, not a new run)', generated_at: '2026-10-23T10:00:00Z', acc: 0.78 },
];

/** Small snapshot fixture: what public/demo-snapshot.json looks like, trimmed. */
export const SNAPSHOT = {
  generated_at: '2026-10-23T14:13:25Z',
  source: 'fixture',
  responses: {
    '/v1/eval/latest': evalReport('run-3', HISTORY[2]!.generated_at, 0.78),
    '/v1/eval/history': HISTORY.map(({ acc, ...h }) => ({
      ...h,
      summary: { base: metrics('base', 0.5), aligned: metrics('aligned', acc) },
    })),
    ...Object.fromEntries(HISTORY.map((h) => [`/v1/eval/runs/${h.id}`, evalReport(h.id, h.generated_at, h.acc, h.label)])),
    '/v1/models': { aligned_model_id: null, base_model_id: 'meta-llama/Llama-3.2-3B-Instruct', offline_aligned_model_id: 'ut-aligned' },
    '/v1/demo/status': { demo_mode: true, access_code_required: true, daily_cap_usd: 1, spent_today_usd: 0.12, limit_reached: false, ip_limit_per_hour: 10 },
  },
};

export async function snapshot(page: Page, body: unknown = SNAPSHOT) {
  await page.route('**/demo-snapshot.json', (r) => json(r, body));
}
