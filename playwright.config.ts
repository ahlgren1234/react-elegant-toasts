import { defineConfig } from '@playwright/test';

// P-22 browser suite (§26, V2_PLAN.md P-22 D2): Playwright's Chromium, Firefox and WebKit against the
// harness in `browser/`. Each project is blocking. Playwright WebKit is the WebKit engine only,
// never Safari (D0-7).

const CI = Boolean(process.env.CI);
const ORIGIN = 'http://127.0.0.1:4180';
const viewport = { width: 1280, height: 720 };

export default defineConfig({
  testDir: './browser/tests',
  testMatch: '**/*.spec.ts',
  outputDir: './browser-results/test-results',
  forbidOnly: CI,
  // Zero retries: a flake is fixed at its cause, never retried (D2-11).
  retries: 0,
  // The specs observe real frames and real timers, so each browser needs CPU headroom: a starved
  // page can miss the lifecycle fallback's margin. One worker in CI, a few locally.
  workers: CI ? 1 : 3,
  reporter: CI
    ? [['list'], ['html', { open: 'never', outputFolder: './browser-results/report' }]]
    : 'list',
  use: {
    baseURL: ORIGIN,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport } },
    { name: 'firefox', use: { browserName: 'firefox', viewport } },
    { name: 'webkit', use: { browserName: 'webkit', viewport } },
  ],
  webServer: {
    command: 'npm run browser:serve',
    url: ORIGIN,
    reuseExistingServer: false,
  },
});
