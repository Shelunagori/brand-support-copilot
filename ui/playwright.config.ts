import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.UI_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'off',
    ...devices['Desktop Chrome'],
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  // Start a dev server automatically unless UI_URL points elsewhere.
  webServer: process.env.UI_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 5173 --strictPort',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
