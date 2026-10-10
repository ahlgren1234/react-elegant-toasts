import { expect, test, type Page } from '@playwright/test';
import type { ToastPosition } from '../../src';
import { openHarness, POSITIONS, PX } from './harness';

// P-22 S3: layout (CF-15's zero-inset layer, AC-RTL-1) in real Chromium, Firefox and WebKit. The
// six positions are physical (§12, §20): a stack keeps its edges in RTL, while the card's inside
// mirrors. Expected geometry comes from the public tokens, read in the page.

interface Geometry {
  readonly viewport: { readonly width: number; readonly height: number; readonly scroll: number };
  readonly offset: number;
  readonly width: number;
  readonly list: DOMRectReadOnly;
  readonly toast: DOMRectReadOnly;
  readonly close: DOMRectReadOnly;
  readonly icon: DOMRectReadOnly;
}

/** Shows one described success toast at `position`, settled, and reads its stack's geometry. */
async function layout(page: Page, position: ToastPosition): Promise<Geometry> {
  await page.evaluate(position => {
    window.__retHarness!.toast.success('A toast with enough text to fill its line', {
      id: 'a',
      className: 'h-a',
      position,
      duration: Infinity,
      description: 'Its description',
    });
  }, position);
  await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
  return page.evaluate(() => {
    const toaster = getComputedStyle(document.querySelector('.ret-toaster')!);
    const item = document.querySelector('.ret-toast.h-a')!;
    const px = (name: string) => Number.parseFloat(toaster.getPropertyValue(name));
    return {
      viewport: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
        scroll: document.documentElement.scrollWidth,
      },
      offset: px('--ret-offset'),
      width: px('--ret-width'),
      list: item.parentElement!.getBoundingClientRect().toJSON() as DOMRectReadOnly,
      toast: item.getBoundingClientRect().toJSON() as DOMRectReadOnly,
      close: item
        .querySelector('.ret-toast__close')!
        .getBoundingClientRect()
        .toJSON() as DOMRectReadOnly,
      icon: item
        .querySelector('.ret-toast__icon')!
        .getBoundingClientRect()
        .toJSON() as DOMRectReadOnly,
    };
  });
}

const near = (actual: number, expected: number, what: string) =>
  expect(Math.abs(actual - expected), `${what}: ${actual} against ${expected}`).toBeLessThan(
    PX + 0.5
  );

/**
 * The stack sits at its physical position, `--ret-offset` from its edges, as wide as
 * `--ret-width` allows within the gutters; the toast fills it; nothing overflows horizontally.
 */
function expectPlaced(geometry: Geometry, position: ToastPosition): void {
  const { viewport, offset, list, toast } = geometry;
  near(list.width, Math.min(geometry.width, viewport.width - 2 * offset), 'stack width');
  if (position.startsWith('top-')) near(list.top, offset, 'top gutter');
  else near(viewport.height - list.bottom, offset, 'bottom gutter');
  if (position.endsWith('-left')) near(list.left, offset, 'left gutter');
  if (position.endsWith('-right')) near(viewport.width - list.right, offset, 'right gutter');
  if (position.endsWith('-center'))
    near((list.left + list.right) / 2, viewport.width / 2, 'centre');
  near(toast.left, list.left, 'toast fills its stack (left)');
  near(toast.right, list.right, 'toast fills its stack (right)');
  expect(list.left).toBeGreaterThanOrEqual(offset - PX);
  expect(list.right).toBeLessThanOrEqual(viewport.width - offset + PX);
  expect(viewport.scroll, 'no horizontal overflow').toBeLessThanOrEqual(viewport.width);
}

for (const position of POSITIONS) {
  test(`at ${position}: physical placement in LTR, RTL and a narrow viewport`, async ({ page }) => {
    await openHarness(page);
    const ltr = await layout(page, position);
    expectPlaced(ltr, position);
    // LTR: the icon at the inline start (left), the close at the inline end (right).
    expect(ltr.icon.left).toBeLessThan(ltr.close.left);

    // RTL from the document: the stack keeps its physical edges; only the card's inside mirrors.
    await openHarness(page);
    await page.evaluate(() => {
      document.documentElement.dir = 'rtl';
    });
    const rtl = await layout(page, position);
    expectPlaced(rtl, position);
    near(rtl.list.left, ltr.list.left, 'RTL keeps the physical position');
    expect(rtl.icon.left, 'RTL: the icon at the right').toBeGreaterThan(rtl.close.left);
    near(rtl.toast.right - rtl.icon.right, ltr.icon.left - ltr.toast.left, 'mirrored icon inset');
    near(
      rtl.close.left - rtl.toast.left,
      ltr.toast.right - ltr.close.right,
      'mirrored close inset'
    );

    // Narrow: the stack shrinks to the viewport less both gutters, at the same position.
    await page.setViewportSize({ width: 320, height: 640 });
    await openHarness(page);
    const narrow = await layout(page, position);
    expectPlaced(narrow, position);
    near(narrow.list.width, 320 - 2 * narrow.offset, 'narrow width');
  });
}

test('zero safe-area insets leave the gutters at --ret-offset, with viewport-fit=cover', async ({
  page,
}) => {
  await openHarness(page);
  const insets = await page.evaluate(() => {
    document
      .querySelector('meta[name="viewport"]')!
      .setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
    // Each inset resolves to 0, not to the 7px fallback.
    const probe = document.createElement('div');
    probe.style.padding =
      'env(safe-area-inset-top, 7px) env(safe-area-inset-right, 7px) env(safe-area-inset-bottom, 7px) env(safe-area-inset-left, 7px)';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const values = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
    probe.remove();
    return values;
  });
  expect(insets).toEqual(['0px', '0px', '0px', '0px']);
  for (const position of ['top-left', 'bottom-right'] as const) {
    expectPlaced(await layout(page, position), position);
    await page.evaluate(() => window.__retHarness!.toast.dismiss('a'));
    await expect(page.locator('.ret-toast')).toHaveCount(0);
  }
});
