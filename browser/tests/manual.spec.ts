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

  // The 10-minute progress preset (S6.1a, for MC-5 and MC-1): its fill runs over 600 000 ms, read
  // from the fill's computed animation, so its fraction starts just below 1. The pointer leaves the
  // page's controls first, away from the toast, so no hover pauses it.
  await page.locator('[data-qa="preset-ten-minutes"]').click();
  await page.mouse.move(5, 700);
  const long = page.locator('.ret-toast.mq-t2');
  await expect(long).toContainText('10-minute progress t2');
  await expect(long).toHaveAttribute('data-phase', 'visible');
  const fill = long.locator('.ret-toast__progress-fill');
  await expect(fill).toHaveCSS('animation-duration', '600s');
  await expect(fill).toHaveCSS('animation-play-state', 'running');
  const fraction = () =>
    fill.evaluate(element => {
      const transform = getComputedStyle(element).transform;
      return transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
    });
  await expect.poll(fraction).toBeLessThan(1);
  expect(await fraction()).toBeGreaterThan(0.99);
  await expect(status).toContainText('t2 info top-right phase=visible');
  await expect(log).toContainText('create {"id":"t2","kind":"info","duration":"ten-minutes"');
});

test('the custom close option, the scheduled insertion and the presets work', async ({ page }) => {
  await page.goto('/manual.html');
  await expect(page.locator('html')).toHaveAttribute('data-mq-ready', 'true');
  const toasts = page.locator('.ret-toast');
  const log = page.locator('[data-qa="log"]');

  // S6.1b: custom toasts stay chrome-less unless the option is on (CF-12's custom close ring).
  await page.locator('[data-qa="preset-custom"]').click();
  const plain = page.locator('.ret-toast.mq-t1');
  await expect(plain).toHaveClass(/\bret-toast--custom\b/);
  await expect(plain).toHaveAttribute('data-phase', 'visible');
  await expect(plain.locator('.ret-toast__close')).toHaveCount(0);

  await page.locator('[data-qa="custom-close"]').check();
  await page.locator('[data-qa="preset-custom"]').click();
  const closable = page.locator('.ret-toast.mq-t2');
  await expect(closable).toHaveClass(/\bret-toast--custom\b/);
  await expect(log).toContainText('create {"id":"t2","kind":"custom"');
  await expect(log).toContainText('"closeButton":true}');
  await closable.getByRole('button', { name: /close/i }).click();
  await expect(closable).toHaveCount(0);
  await expect(log).toContainText('dismiss {"id":"t2","reason":"close-button"}');

  // S6.1b: one ordinary toast, about 2 s after the click, for CF-35. Nothing is added before it
  // fires, the control waits meanwhile, and the delay is checked only from below.
  await page.locator('[data-qa="custom-close"]').uncheck();
  const later = page.locator('[data-qa="add-one-later"]');
  await later.click();
  await expect(later).toBeDisabled();
  await expect(toasts).toHaveCount(1);
  const scheduled = page.locator('.ret-toast.mq-t3');
  await expect(scheduled).toHaveAttribute('data-phase', 'visible');
  await expect(scheduled).toContainText('Default t3');
  await expect(toasts).toHaveCount(2);
  await expect(later).toBeEnabled();
  await page.locator('[data-qa="show-json"]').click();
  const events = (
    JSON.parse(await page.locator('[data-qa="json"]').inputValue()) as {
      events: { type: string; t: number; detail?: { id?: string } }[];
    }
  ).events;
  const added = events.filter(event => event.type === 'add-scheduled');
  const fired = events.filter(event => event.type === 'add-scheduled-fired');
  expect(added).toHaveLength(1);
  expect(fired.map(event => event.detail?.id)).toEqual(['t3']);
  expect(fired[0]!.t - added[0]!.t).toBeGreaterThanOrEqual(1900);

  // The existing presets still create their toasts.
  await page.locator('[data-qa="dismiss-all"]').click();
  await expect(toasts).toHaveCount(0);
  await page.locator('[data-qa="preset-swipe"]').click();
  await page.locator('[data-qa="preset-action"]').click();
  await page.locator('[data-qa="preset-progress"]').click();
  await expect(page.locator('.ret-toast.mq-t4 .ret-toast__description')).toBeVisible();
  await expect(page.locator('.ret-toast.mq-t5 .ret-toast__action')).toHaveText('Undo');
  await expect(
    page.locator('.ret-toast.mq-t6.ret-toast--success .ret-toast__progress-fill')
  ).toBeAttached();
});
