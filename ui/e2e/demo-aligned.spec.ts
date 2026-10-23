import { expect, test, type Page } from '@playwright/test';
import { healthUp, json, setTheme, snapshot } from './fixtures';

const m = (model_id: string, acc: number) => ({
  model_id, n: 40, factual_accuracy: acc, policy_violation_rate: 0.05, escalation_accuracy: 0.9,
  model_escalation_accuracy: 0.85, json_validity: 1, json_validity_final: 1, policy_ref_accuracy: 0.3,
  latency_p50_ms: 1000, latency_p95_ms: 2000, total_tokens: 20000, est_cost_usd: 0.8,
});
const QWEN = 'Qwen/Qwen2.5-0.5B-Instruct';
const LLAMA = 'meta-llama/Llama-3.2-3B-Instruct';
const HISTORY = [
  { id: 'e1', label: 'initial alignment', generated_at: '2026-10-22T13:18:00Z', base_model_id: QWEN, rescored: false, summary: { base: m(QWEN, 0.275), aligned: m('a1', 0.25) } },
  { id: 'e2', label: 'after re-alignment', generated_at: '2026-10-22T13:43:00Z', base_model_id: QWEN, rescored: false, summary: { base: m(QWEN, 0.25), aligned: m('a2', 0.225) } },
  { id: 'e3', label: 'exp3', generated_at: '2026-10-22T14:19:00Z', base_model_id: LLAMA, rescored: false, summary: { base: m(LLAMA, 0.3), aligned: m('a3', 0.125) } },
  { id: 'e4', label: 'Exp 3 + JSON repair (offline re-score, not a new run)', generated_at: '2026-10-22T14:24:00Z', base_model_id: LLAMA, rescored: true, summary: { base: m(LLAMA, 0.3), aligned: m('a3', 0.375) } },
];

async function backend(page: Page, alignedId: string | null) {
  await healthUp(page);
  await snapshot(page, { generated_at: null, responses: {} });
  await page.route('**/v1/**', async (r) => {
    const path = new URL(r.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/v1/demo/status') return json(r, { demo_mode: false });
    if (path === '/v1/models')
      return json(r, { aligned_model_id: alignedId, base_model_id: LLAMA, aligned_available: !!alignedId, offline_aligned_model_id: alignedId ? null : 'a3' });
    if (path === '/v1/eval/history') return json(r, HISTORY);
    if (path === '/v1/feedback/flagged') return json(r, []);
    if (path === '/v1/feedback/stats') return json(r, { total_inferences: 0, flagged: 0, thumbs_down: 0, corrections: 0, by_flag: {} });
    if (path === '/v1/realign/dataset') return json(r, { items: [], count: 0 });
    return json(r, {});
  });
}

test('aligned deployed: Aligned is selectable + default, no offline badges', async ({ page }) => {
  await setTheme(page, 'dark');
  await backend(page, 'model_01m5hz9nr9gr5wqv');
  await page.goto('/chat');
  const aligned = page.getByRole('radio', { name: /aligned/i });
  await expect(aligned).toBeEnabled();
  await expect(aligned).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Aligned model offline (undeployed to save credits)')).toHaveCount(0);
  await expect(page.getByText(/aligned offline/i)).toHaveCount(0);
  const note = page.getByTestId('aligned-note');
  await expect(note).toContainText('Exp 3 aligned model: learned the brand');
  await expect(note.getByRole('link', { name: 'See Eval Dashboard' })).toHaveAttribute('href', '/eval');
  await page.getByRole('radio', { name: /base/i }).click();
  await expect(note).toHaveCount(0);
});

test('aligned offline: Base is the default and the badge shows', async ({ page }) => {
  await setTheme(page, 'dark');
  await backend(page, null);
  await page.goto('/chat');
  await expect(page.getByRole('radio', { name: /base/i })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Aligned model offline (undeployed to save credits)')).toBeVisible();
});

test('before/after defaults to a same-base-model pair and blocks cross-model pairs', async ({ page }) => {
  await setTheme(page, 'light');
  await backend(page, null);
  await page.goto('/feedback');
  const before = page.locator('select').nth(0);
  const after = page.locator('select').nth(1);
  await expect(before).toHaveValue('e1');
  await expect(after).toHaveValue('e2');
  await expect(after.locator('option[value="e3"]')).toHaveAttribute("disabled", "");
  await expect(after.locator('option[value="e4"]')).toHaveAttribute("disabled", "");
  await expect(after.locator('option[value="e4"]')).toContainText('different base model');
  // switching "before" to the Llama run snaps "after" to a Llama run
  await before.selectOption('e3');
  await expect(after).toHaveValue('e4');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
