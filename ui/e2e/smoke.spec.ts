import { expect, test } from '@playwright/test';
import { healthUp } from './fixtures';
import { SCREENS } from './routes';

// /health answers fast so the live routes don't show the wake-up screen.
test.beforeEach(async ({ page }) => {
  await healthUp(page);
});

for (const s of SCREENS) {
  test(`${s.slug} renders its heading`, async ({ page }) => {
    await page.goto(s.path);
    await expect(page.getByRole('heading', { level: 1, name: s.heading })).toBeVisible();
    // header chrome is present on every screen
    await expect(page.getByText('Support Copilot').first()).toBeVisible();
  });
}

test('theme toggle persists to localStorage', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('ut-theme'))).toBe('light');
  await page.getByRole('radio', { name: 'Dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the demo lands on Compare (base vs aligned side by side)', async ({ page }) => {
  await healthUp(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/compare$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Base vs Aligned' })).toBeVisible();
});
