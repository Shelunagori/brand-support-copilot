import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from './routes';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
mkdirSync(OUT, { recursive: true });

const THEMES = ['dark', 'light'] as const;

async function open(page: Page, path: string, theme: (typeof THEMES)[number]) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('ut-theme', t);
    } catch {
      /* ignore */
    }
  }, theme);
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // let data requests settle (success or error) and entrance animations finish
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1600);
}

test.describe('desktop 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  for (const theme of THEMES) {
    for (const s of SCREENS) {
      test(`${s.slug}-${theme}`, async ({ page }) => {
        await open(page, s.path, theme);
        await page.screenshot({ path: join(OUT, `${s.slug}-${theme}.png`), fullPage: true });
      });
    }
  }
});

test.describe('mobile 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const theme of THEMES) {
    test(`chat-mobile-${theme}`, async ({ page }) => {
      await open(page, '/chat', theme);
      await page.screenshot({ path: join(OUT, `chat-mobile-${theme}.png`) });
    });
  }
});
