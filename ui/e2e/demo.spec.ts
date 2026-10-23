import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { HISTORY, evalReport, healthUp, json, setTheme, snapshot } from './fixtures';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
mkdirSync(OUT, { recursive: true });

const CODE = 'open-sesame';
const DISABLED = 'Disabled in the public demo';

type Status = Record<string, unknown>;
const demoStatus = (over: Status = {}): Status => ({
  demo_mode: true,
  access_code_required: true,
  daily_cap_usd: 1,
  spent_today_usd: 0.12,
  limit_reached: false,
  limit_reason: null,
  ip_limit_per_hour: 10,
  base_model_id: 'meta-llama/Llama-3.2-3B-Instruct',
  ...over,
});

/** A fully mocked demo-mode backend. `stream` overrides the /v1/support/stream reply. */
async function demoBackend(page: Page, status: Status = demoStatus(), stream?: { status: number; detail: string }) {
  await healthUp(page);
  await snapshot(page, { generated_at: null, responses: {} });
  await page.route('**/v1/**', async (r) => {
    const req = r.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/v1/demo/status') return json(r, status);
    if (path === '/v1/demo/verify') {
      const body = req.postDataJSON() as { code?: string };
      return body.code === CODE ? json(r, { ok: true }) : json(r, { detail: 'invalid access code' }, 401);
    }
    if (path === '/v1/models')
      return json(r, { aligned_model_id: null, base_model_id: 'meta-llama/Llama-3.2-3B-Instruct', offline_aligned_model_id: 'ut-aligned' });
    if (path === '/v1/pipeline/runs') return json(r, []);
    if (path === '/v1/spend') return json(r, { total_est_usd: 0.4, hard_limit_usd: 5, breakdown: [] });
    if (path === '/v1/feedback/stats') return json(r, { total_inferences: 3, flagged: 1, thumbs_down: 1, corrections: 1, by_flag: {} });
    if (path === '/v1/feedback/flagged') return json(r, []);
    if (path === '/v1/realign/dataset') return json(r, { items: [{ instruction: 'q', response: 'a', source: 'correction' }], count: 1 });
    if (path === '/v1/eval/history')
      return json(r, HISTORY.map(({ acc: _acc, ...h }) => ({ ...h, summary: evalReport(h.id, h.generated_at, _acc).summary })));
    if (path === '/v1/eval/latest') return json(r, evalReport('run-3', HISTORY[2]!.generated_at, 0.78));
    const run = path.match(/^\/v1\/eval\/runs\/(.+)$/);
    if (run) {
      const h = HISTORY.find((x) => x.id === run[1]);
      return h ? json(r, evalReport(h.id, h.generated_at, h.acc, h.label)) : json(r, { detail: 'eval run not found' }, 404);
    }
    if (path === '/v1/support/stream' && stream) return json(r, { detail: stream.detail }, stream.status);
    if (req.method() === 'POST') return json(r, { detail: 'disabled in demo' }, 403);
    return json(r, { detail: 'not found' }, 404);
  });
}

test.use({ viewport: { width: 1440, height: 900 } });

test('chat is gated by the access code', async ({ page }) => {
  await setTheme(page, 'dark');
  await demoBackend(page);
  await page.goto('/chat');
  await expect(page.getByRole('heading', { level: 1, name: 'Support Chat' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enter the demo access code' })).toBeVisible();
  await expect(page.getByText('Ask the person who shared this link for the code.')).toBeVisible();
  await expect(page.getByText("Today's demo budget:")).toContainText('$0.12 of $1.00');
  await expect(page.getByLabel('Customer message')).toHaveCount(0);
  await expect(page.getByText('Public demo · read-only')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'demo-gate-dark.png') });

  const input = page.getByRole('textbox', { name: 'Access code' });
  await expect(input).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show code' }).click();
  await expect(input).toHaveAttribute('type', 'text');

  await input.fill('wrong');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toContainText("That code didn't work");

  await input.fill(CODE);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByLabel('Customer message')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ut-demo-code'))).toBe(CODE);

  // Compare shares the unlocked code
  await page.getByRole('link', { name: /Base vs Aligned|Compare/ }).first().click();
  await expect(page.getByLabel('Question for both models')).toBeEnabled();
});

test('a rejected code clears it and shows the gate again', async ({ page }) => {
  await page.addInitScript((c) => localStorage.setItem('ut-demo-code', c), 'stale-code');
  await demoBackend(page, demoStatus(), { status: 401, detail: 'invalid access code' });
  await page.goto('/chat');
  await page.getByLabel('Customer message').fill('Where is my order?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the demo access code' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ut-demo-code'))).toBeNull();
});

test('per-IP limit shows the hourly message', async ({ page }) => {
  await page.addInitScript((c) => localStorage.setItem('ut-demo-code', c), CODE);
  await demoBackend(page, demoStatus(), { status: 429, detail: 'ip_rate_limited' });
  await page.goto('/chat');
  await page.getByLabel('Customer message').fill('Where is my order?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText("You've reached the demo limit of 10 messages per hour. Try again later.")).toBeVisible();
});

test('daily limit reached shows the designed state and disables the composer', async ({ page }) => {
  await setTheme(page, 'dark');
  await page.addInitScript((c) => localStorage.setItem('ut-demo-code', c), CODE);
  await demoBackend(page, demoStatus({ limit_reached: true, limit_reason: 'daily', spent_today_usd: 1.01 }));
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: 'Demo limit reached for today' })).toBeVisible();
  await expect(page.getByText('00:00 UTC')).toBeVisible();
  await expect(page.getByLabel('Customer message')).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Eval Dashboard' }).last()).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'demo-limit-dark.png') });

  await page.goto('/compare');
  await expect(page.getByRole('heading', { name: 'Demo limit reached for today' })).toBeVisible();
  await expect(page.getByLabel('Question for both models')).toBeDisabled();
});

test('total budget used shows the paused state without a reset time', async ({ page }) => {
  await demoBackend(page, demoStatus({ limit_reached: true, limit_reason: 'total' }));
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: "The demo's total budget has been used" })).toBeVisible();
  await expect(page.getByText('Eval, Pipeline and Feedback results are still available.')).toBeVisible();
  await expect(page.getByText('00:00 UTC')).toHaveCount(0);
  await expect(page.getByLabel('Customer message')).toBeDisabled();
});

test('pipeline and feedback actions are disabled in the demo', async ({ page }) => {
  await demoBackend(page);
  await page.goto('/pipeline');
  for (const name of ['Prepare (no cost)', 'Start alignment', 'Deploy']) {
    const b = page.getByRole('button', { name });
    await expect(b).toBeDisabled();
    await expect(b).toHaveAttribute('aria-description', DISABLED);
    await expect(b).toHaveAttribute('title', DISABLED);
  }
  await page.goto('/feedback');
  for (const name of ['Re-align from feedback', 'Re-align']) {
    const b = page.getByRole('button', { name, exact: true });
    await expect(b).toBeDisabled();
    await expect(b).toHaveAttribute('aria-description', DISABLED);
  }
});

test('eval run selector switches runs and shows the label verbatim', async ({ page }) => {
  await demoBackend(page);
  await page.goto('/eval');
  const label = page.getByTestId('eval-run-label');
  await expect(label).toHaveText('Exp 3 + JSON repair (offline re-score, not a new run)');
  const select = page.getByLabel('Eval run');
  await expect(select.locator('option')).toHaveCount(3);
  await select.selectOption('run-1');
  await expect(label).toHaveText('initial alignment');
  await expect(page).toHaveURL(/run=run-1/);
  await expect(page.getByText('Earlier evaluation')).toBeVisible();
});

test('non-demo backend: no gate, controls enabled', async ({ page }) => {
  await healthUp(page);
  await snapshot(page, { generated_at: null, responses: {} });
  await page.route('**/v1/**', (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/v1/demo/status')) return json(r, { demo_mode: false });
    if (path.endsWith('/v1/pipeline/runs')) return json(r, []);
    return json(r, { detail: 'not found' }, 404);
  });
  await page.goto('/chat');
  await expect(page.getByLabel('Customer message')).toBeEnabled();
  await expect(page.getByText('Public demo · read-only')).toHaveCount(0);
  await page.goto('/pipeline');
  await expect(page.getByRole('button', { name: 'Start alignment' })).toBeEnabled();
});
