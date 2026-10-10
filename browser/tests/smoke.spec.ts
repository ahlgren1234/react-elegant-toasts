import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { openHarness } from './harness';

// P-22 S1 smoke: the harness, the real library and the production stylesheet run in each engine.
// It proves the infrastructure only; the §26 browser checks are added from S2 (V2_PLAN.md, P-22 D2).

const PRODUCTION_STYLESHEET = readFileSync(new URL('../../src/styles.css', import.meta.url));
const INSTALLED_REACT = (
  createRequire(import.meta.url)('react/package.json') as { version: string }
).version;

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test('runs the library on the repository React', async ({ page }) => {
  const reactVersion = await page.evaluate(() => window.__retHarness?.reactVersion);
  expect(reactVersion).toBe(INSTALLED_REACT);
  await expect(page.getByRole('region', { name: 'Notifications' })).toBeAttached();
});

test('serves the production stylesheet byte for byte, and no other', async ({ page, request }) => {
  const response = await request.get('/styles.css');
  expect(response.ok()).toBe(true);
  expect((await response.body()).equals(PRODUCTION_STYLESHEET)).toBe(true);

  const sheets = await page.evaluate(() => Array.from(document.styleSheets, sheet => sheet.href));
  expect(sheets).toEqual([new URL('/styles.css', page.url()).href]);
});

test('renders a styled toast that settles and closes once', async ({ page }) => {
  await page.evaluate(() => {
    const harness = window.__retHarness;
    harness?.toast.success('Saved', {
      duration: Infinity,
      onDismiss: (_toast, reason) => harness.log('dismiss', reason),
    });
  });

  const item = page.locator('.ret-toast');
  await expect(item).toHaveCount(1);
  await expect(item).toHaveClass(/\bret-toast--success\b/);
  await expect(item).toContainText('Saved');
  await expect(item).toHaveAttribute('data-phase', 'visible');

  // Values only the production stylesheet sets.
  const list = page.locator('.ret-toaster__list');
  await expect(list).toHaveAttribute('data-position', 'top-right');
  await expect(list).toHaveCSS('position', 'fixed');
  expect(
    await page
      .locator('.ret-toaster')
      .evaluate(element => getComputedStyle(element).getPropertyValue('--ret-offset').trim())
  ).toBe('16px');

  await item.getByRole('button', { name: /close/i }).click();
  await expect(item).toHaveCount(0);
  const dismissals = await page.evaluate(() =>
    window.__retHarness?.events.filter(event => event.type === 'dismiss')
  );
  expect(dismissals?.map(event => event.detail)).toEqual(['close-button']);
});
