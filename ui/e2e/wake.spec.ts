import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { json, snapshot, setTheme, THEMES } from './fixtures';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
mkdirSync(OUT, { recursive: true });

const HEADLINE = 'Waking up the server… ☕';
const BODY = 'Free-tier servers sleep when idle. This can take up to a minute.';

/** The API is asleep: /health fails, and nothing else answers either. */
async function asleep(page: Page) {
  await page.route('**/health', (r) => r.abort('connectionrefused'));
  await page.route('**/v1/**', (r) => r.abort('connectionrefused'));
  await page.route('**/ready', (r) => r.abort('connectionrefused'));
}

/** Wake the API: /health and the reads the chat page needs start answering. */
async function wake(page: Page) {
  await page.unroute('**/health');
  await page.unroute('**/v1/**');
  await page.route('**/health', (r) => json(r, { status: 'ok' }));
  await page.route('**/v1/**', (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/v1/demo/status')) return json(r, { demo_mode: false });
    if (path.endsWith('/v1/models')) return json(r, { aligned_model_id: 'ut-aligned', base_model_id: 'base' });
    return json(r, { detail: 'not found' }, 404);
  });
}

test.use({ viewport: { width: 1440, height: 900 } });

for (const theme of THEMES) {
  test(`wake screen → slow → app (${theme})`, async ({ page }) => {
    await page.clock.install();
    await setTheme(page, theme);
    await snapshot(page, { generated_at: null, responses: {} });
    await asleep(page);
    await page.goto('/');

    const status = page.getByRole('status').filter({ hasText: HEADLINE });
    await expect(page.getByRole('heading', { level: 1, name: HEADLINE })).toBeVisible();
    await expect(page.getByText(BODY)).toBeVisible();
    await expect(status).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse saved results meanwhile' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await page.waitForTimeout(500); // entrance fade
    await page.screenshot({ path: join(OUT, `wake-${theme}.png`) });

    await page.clock.fastForward(91_000);
    await expect(page.getByText('Still waking up, retrying…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `wake-slow-${theme}.png`) });

    await wake(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Support Chat' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Enter the demo access code' }).or(page.getByLabel('Customer message'))).toBeVisible();
  });
}

test('Retry resets the timer, pings right away, and the app fades in once up', async ({ page }) => {
  await page.clock.install();
  await snapshot(page, { generated_at: null, responses: {} });
  await asleep(page);
  await page.goto('/compare');
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  await page.clock.fastForward(91_000);
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  const ping = page.waitForRequest('**/health', { timeout: 1_500 });
  await page.getByRole('button', { name: 'Retry' }).click();
  await ping;
  // timer reset: no longer "slow"
  await expect(page.getByText('Still waking up, retrying…')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await wake(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Base vs Aligned' })).toBeVisible({ timeout: 10_000 });
});

test('read-only route renders from the snapshot while the server wakes', async ({ page }) => {
  await setTheme(page, 'dark');
  await snapshot(page);
  await asleep(page);
  await page.goto('/eval');
  await expect(page.getByRole('heading', { level: 1, name: 'Eval Dashboard' })).toBeVisible();
  // the wake screen is only for the live routes
  await expect(page.getByRole('heading', { name: HEADLINE })).toHaveCount(0);
  const banner = page.getByRole('status').filter({ hasText: 'Live server waking up' });
  await expect(banner).toBeVisible({ timeout: 6_000 });
  await expect(banner).toContainText('showing saved snapshot from');
  // data comes from the snapshot fixture, not the (dead) API
  await expect(page.getByTestId('eval-run-label')).toHaveText('Exp 3 + JSON repair (offline re-score, not a new run)');
  await expect(page.getByText('Question-level results').or(page.getByText('No question-level results'))).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'wake-snapshot-eval-dark.png') });
});
