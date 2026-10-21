import { expect, test } from '@playwright/test';
import { SCREENS } from './routes';

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
