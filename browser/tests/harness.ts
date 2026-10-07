import { expect, type Page } from '@playwright/test';
import type { ToastPosition } from '../../src';

// Shared helpers for the P-22 specs.

export const POSITIONS: readonly ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export const edgeOf = (position: ToastPosition): 'top' | 'bottom' =>
  position.startsWith('top-') ? 'top' : 'bottom';

/**
 * Timing tolerances for real browser timing (V2_PLAN.md, P-22 D2 timing approach). An early
 * completion is the defect, so the lower bound allows only one frame; lateness is scheduling noise
 * on a loaded machine, so the upper bound is generous, set from the S2 measurements (V2_PLAN.md,
 * P-22 S2 record). Neither is a product constant.
 */
export const FRAME_MS = 1000 / 60;
export const LATE_TOLERANCE_MS = 150;

/** Sub-pixel tolerance for layout and visual positions. */
export const PX = 0.5;

/** Opens a fresh harness page and waits until the stylesheet has loaded and the Toaster is mounted. */
export async function openHarness(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__retHarness !== undefined);
}

/** Opens the harness under Playwright's real `prefers-reduced-motion: reduce` emulation. */
export async function openReducedMotionHarness(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHarness(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true
  );
}

/**
 * Checks that a series of values moves from its first to its last value without reversing and
 * passes through at least one value strictly between them: an interpolated move, not a jump.
 * `tolerance` is in the values' own unit: pixels by default.
 */
export function expectInterpolatedMove(
  values: readonly number[],
  what: string,
  tolerance: number = PX
): void {
  const first = values[0];
  const last = values[values.length - 1];
  if (first === undefined || last === undefined) throw new Error(`${what}: no samples`);
  const direction = Math.sign(last - first);
  expect(direction, `${what} moves`).not.toBe(0);
  values.forEach((value, index) => {
    const previous = values[index - 1];
    if (previous === undefined) return;
    expect(
      (value - previous) * direction,
      `${what} never reverses (sample ${index})`
    ).toBeGreaterThan(-tolerance);
  });
  const between = values.filter(
    value => (value - first) * direction > tolerance && (last - value) * direction > tolerance
  );
  expect(between.length, `${what} passes through intermediate values`).toBeGreaterThan(0);
}

/** A computed time token of the Toaster, in ms. */
export async function timeToken(page: Page, name: string): Promise<number> {
  const value = await page.evaluate(
    name => getComputedStyle(document.querySelector('.ret-toaster')!).getPropertyValue(name).trim(),
    name
  );
  const match = /^([\d.]+)(ms|s)$/.exec(value);
  if (!match) throw new Error(`${name} is not a time: ${value}`);
  return Number(match[1]) * (match[2] === 's' ? 1000 : 1);
}

/** Shows a persistent toast labelled `a`, logging its dismissal, and waits until it is visible. */
export async function showToast(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = window.__retHarness!;
    h.toast('Toast', {
      id: 'a',
      className: 'h-a',
      duration: Infinity,
      onDismiss: (_toast, reason) => h.log('dismiss', reason),
    });
  });
  await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
}

/** Dismisses `a` and resolves with the time from the call to its `onDismiss`. */
export async function timeDismissal(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>(resolve => {
        const h = window.__retHarness!;
        const start = performance.now();
        const done = h.events.length;
        const check = () => {
          const dismissal = h.events.slice(done).find(event => event.type === 'dismiss');
          if (dismissal) resolve(dismissal.time - start);
          else requestAnimationFrame(check);
        };
        h.toast.dismiss('a');
        requestAnimationFrame(check);
      })
  );
}
