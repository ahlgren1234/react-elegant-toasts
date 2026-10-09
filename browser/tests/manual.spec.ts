import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// P-22 S6.1 smoke for the manual QA page (`/manual.html`), which serves S6's device checkpoints.
// It proves the page works in each engine, not any CF item: the manual checkpoints themselves are
// recorded by hand on real devices (V2_PLAN.md, P-22 D2 manual checkpoints).

const PRODUCTION_STYLESHEET = readFileSync(new URL('../../src/styles.css', import.meta.url));

test('the manual QA page creates a toast from its controls and shows its status and log', async ({
  page,
  request,
}) => {
  await page.goto('/manual.html');
  await expect(page.locator('html')).toHaveAttribute('data-mq-ready', 'true');

  // The production stylesheet, byte for byte, is the page's only linked stylesheet; the page's own
  // styles are inline.
  const response = await request.get('/styles.css');
  expect((await response.body()).equals(PRODUCTION_STYLESHEET)).toBe(true);
  const linked = await page.evaluate(() =>
    Array.from(document.styleSheets, sheet => sheet.href).filter(href => href !== null)
  );
  expect(linked).toEqual([new URL('/styles.css', page.url()).href]);
  await expect(page.getByRole('region', { name: 'Notifications' })).toBeAttached();

  await page.locator('[data-qa="kind"]').selectOption('success');
  await page.locator('[data-qa="add-one"]').click();
  const item = page.locator('.ret-toast.mq-t1');
  await expect(item).toHaveClass(/\bret-toast--success\b/);
  await expect(item).toContainText('Success t1');
  await expect(item).toHaveAttribute('data-phase', 'visible');
  await expect(page.locator('.ret-toaster__list')).toHaveCSS('position', 'fixed');

  const status = page.locator('[data-qa="status"]');
  await expect(status).toContainText('t1 success top-right phase=visible');
  await expect(status).toContainText('safe-area top=');

  await item.getByRole('button', { name: /close/i }).click();
  await expect(item).toHaveCount(0);
  const log = page.locator('[data-qa="log"]');
  await expect(log).toContainText('create {"id":"t1","kind":"success"');
  await expect(log).toContainText('dismiss {"id":"t1","reason":"close-button"}');
  await expect(log).toContainText('"pointerType":"mouse"');
});
