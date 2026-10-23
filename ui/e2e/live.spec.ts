// Live screenshots: sends REAL queries through the API to Nugen (a few hundred tokens).
// Run with: LIVE=1 npx playwright test e2e/live.spec.ts  (API on :8000 with a deployed model)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
const THEMES = ['dark', 'light'] as const;
const QUESTION = 'My jeans were delivered 3 days ago, unworn with tags. Can I return them?';

test.skip(!process.env.LIVE, 'set LIVE=1 to call the real model');
test.setTimeout(240_000);
test.use({ viewport: { width: 1440, height: 900 } });

async function open(page: Page, path: string, theme: string) {
  await page.addInitScript((t) => localStorage.setItem('ut-theme', t), theme);
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

for (const theme of THEMES) {
  test(`chat-live-${theme}`, async ({ page }) => {
    await open(page, '/chat', theme);
    await page.getByPlaceholder('Type a customer message…').fill(QUESTION);
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('button', { name: 'Helpful', exact: true })).toBeVisible({ timeout: 200_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT, `chat-${theme}.png`), fullPage: true });
  });

  test(`compare-live-${theme}`, async ({ page }) => {
    await open(page, '/compare', theme);
    await page.locator('#cmp-q').fill(QUESTION);
    await page.getByRole('button', { name: 'Compare' }).click();
    await expect(page.getByLabel('heuristic winner').or(page.getByText(/word diff/i)).first())
      .toBeVisible({ timeout: 200_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, `compare-${theme}.png`), fullPage: true });
  });
}
