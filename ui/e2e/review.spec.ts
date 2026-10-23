import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { THEMES, healthUp, json, metrics, setTheme, snapshot, type Theme } from './fixtures';
import { SECTIONS } from '../src/pages/review/content';

/** /review is read-only: it renders from the bundled snapshot and must never call the support API. */

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
mkdirSync(OUT, { recursive: true });

const QWEN = 'Qwen/Qwen2.5-0.5B-Instruct';
const LLAMA = 'meta-llama/Llama-3.2-3B-Instruct';
const run = (id: string, label: string, base: string, acc: number, rescored = false) => ({
  id,
  label,
  generated_at: '2026-10-22T13:18:58Z',
  summary: { base: metrics(base, 0.3), aligned: metrics(`model_${id}`, acc) },
  base_model_id: base,
  rescored,
});

const REVIEW_SNAPSHOT = {
  generated_at: '2026-10-23T14:13:25Z',
  source: 'fixture',
  responses: {
    '/v1/eval/history': [
      run('q1', 'initial alignment', QWEN, 0.25),
      run('q2', 'after re-alignment', QWEN, 0.225),
      run('l1', 'exp3: Llama-3.2-3B, active docs only', LLAMA, 0.125),
      run('l2', 'Exp 3 + JSON repair (offline re-score, not a new run)', LLAMA, 0.375, true),
    ],
  },
};

/** Mocks everything; returns the list of API paths the page requested. */
async function setup(page: Page, theme: Theme) {
  const apiCalls: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname.includes('/v1/')) apiCalls.push(url.pathname);
  });
  // catch-all first (later routes win): nothing reaches a real backend
  await page.route('**/v1/**', (r) => json(r, { detail: 'not mocked' }, 404));
  await healthUp(page);
  await snapshot(page, REVIEW_SNAPSHOT);
  await setTheme(page, theme);
  return apiCalls;
}

const noSupportCalls = (calls: string[]) => expect(calls.filter((p) => p.includes('/v1/support'))).toEqual([]);

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const theme of THEMES) {
    test(`renders every section, scroll-spy nav and results (${theme})`, async ({ page }) => {
      const calls = await setup(page, theme);
      await page.goto('/review');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('heading', { level: 1, name: 'Brand Support Copilot' })).toBeVisible();

      for (const s of SECTIONS) await expect(page.locator(`section#${s.id}`)).toHaveCount(1);

      // results from the snapshot, grouped by base model, rescored row marked
      await expect(page.getByTestId('results-group')).toHaveCount(2);
      const rescored = page.getByTestId('rescored-run');
      await expect(rescored).toHaveCount(1);
      await expect(rescored.getByText('offline re-score · not a new run')).toBeVisible();
      await expect(rescored.getByText('Exp 3 + JSON repair (offline re-score, not a new run)')).toBeVisible();

      const rail = page.getByTestId('review-rail');
      await expect(rail).toBeVisible();
      for (const id of ['cost', 'architecture', 'decisions']) {
        const label = SECTIONS.find((s) => s.id === id)!.label;
        await rail.getByRole('link', { name: label, exact: true }).click();
        await expect(page.locator(`#${id}-title`)).toBeInViewport();
        await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#${id}`);
        await expect(rail.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'location');
      }

      await page.screenshot({ path: join(OUT, `review-${theme}.png`), fullPage: true });
      noSupportCalls(calls);
    });

    test(`deep link /review#cost lands on Cost (${theme})`, async ({ page }) => {
      const calls = await setup(page, theme);
      await page.goto('/review#cost');
      const heading = page.locator('#cost-title');
      await expect(heading).toBeInViewport();
      // not hidden under the sticky header
      await expect.poll(async () => (await heading.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(56);
      // still there after the results table above it has loaded and the layout settled
      await expect(page.getByTestId('results-group')).toHaveCount(2);
      await page.waitForTimeout(800);
      await expect(heading).toBeInViewport();
      noSupportCalls(calls);
    });
  }

  test('snapshot failure shows a recoverable error state', async ({ page }) => {
    await setup(page, 'dark');
    await page.route('**/demo-snapshot.json', (r) => r.fulfill({ status: 500, body: 'nope' }));
    await page.goto('/review#results');
    await expect(page.getByText('Eval history unavailable')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('chip bar navigates, no horizontal page scroll (dark)', async ({ page }) => {
    const calls = await setup(page, 'dark');
    await page.goto('/review');
    await expect(page.getByRole('heading', { level: 1, name: 'Brand Support Copilot' })).toBeVisible();
    await expect(page.getByTestId('rescored-run').getByText('offline re-score · not a new run')).toBeVisible();
    const bar = page.getByTestId('review-chipbar');
    await expect(bar).toBeVisible();
    await bar.getByRole('link', { name: 'Cost', exact: true }).click();
    await expect(page.locator('#cost-title')).toBeInViewport();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#cost');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, 'review-mobile-dark.png'), fullPage: true });
    noSupportCalls(calls);
  });
});
