import { expect, test, type Page } from '@playwright/test';
import type { ToastEventDetail } from '../harness/api';
import {
  FRAME_MS,
  LATE_TOLERANCE_MS,
  openHarness,
  showToast,
  timeDismissal,
  timeToken,
} from './harness';

// P-22 S2: the lifecycle fallback (AC-LC-2, CF-17) in real Chromium, Firefox and WebKit. When a
// toast's own `animationend` never arrives, the lifecycle completes at the computed animation's end
// plus the margin (§9 rule 3, P-18). The scenarios hold the root's animation with consumer CSS
// (`animation-play-state: paused`) or hide the region; neither is production timing.

/**
 * The documented margin after a computed animation's end (P-18 D0, decision 3), written out rather
 * than imported, so a change to the implementation's constant fails here.
 */
const FALLBACK_MARGIN_MS = 100;

/** Holds every toast root's own animation, so no `animationend` arrives. */
const HELD = '.ret-toast { animation-play-state: paused; }';

/** Never earlier than the fallback, less a frame; late by at most the tolerance. */
function expectFallbackAt(elapsed: number, expected: number): void {
  expect(elapsed).toBeGreaterThanOrEqual(expected - FRAME_MS);
  expect(elapsed).toBeLessThanOrEqual(expected + LATE_TOLERANCE_MS);
}

async function rootAnimationEnds(page: Page) {
  const events = await page.evaluate(() => window.__retHarness!.events);
  return events.filter(
    event =>
      event.type === 'animationend' && (event.detail as ToastEventDetail | undefined)?.root === true
  );
}

async function dismissals(page: Page) {
  const events = await page.evaluate(() => window.__retHarness!.events);
  return events.filter(event => event.type === 'dismiss').map(event => event.detail);
}

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test('completes an enter whose animationend never arrives at the computed fallback', async ({
  page,
}) => {
  await page.evaluate(css => window.__retHarness!.setStyle(css), HELD);
  const expected = (await timeToken(page, '--ret-enter-duration')) + FALLBACK_MARGIN_MS;
  const elapsed = await page.evaluate(
    () =>
      new Promise<number>(resolve => {
        const h = window.__retHarness!;
        const start = performance.now();
        h.toast('Toast', { id: 'a', className: 'h-a', duration: Infinity });
        const check = () => {
          if (h.toastState('a').phase === 'visible') resolve(performance.now() - start);
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      })
  );
  expectFallbackAt(elapsed, expected);
  expect(await rootAnimationEnds(page)).toEqual([]);
});

test('completes an exit whose animationend never arrives at the computed fallback', async ({
  page,
}) => {
  await page.evaluate(css => window.__retHarness!.setStyle(css), HELD);
  await showToast(page);
  const expected = (await timeToken(page, '--ret-exit-duration')) + FALLBACK_MARGIN_MS;
  expectFallbackAt(await timeDismissal(page), expected);
  expect(await rootAnimationEnds(page)).toEqual([]);
  expect(await dismissals(page)).toEqual(['programmatic']);
  await expect(page.locator('.ret-toast')).toHaveCount(0);
});

test('moves the fallback with an overridden exit token', async ({ page }) => {
  await page.evaluate(
    css => window.__retHarness!.setStyle(css),
    `${HELD} .ret-toaster { --ret-exit-duration: 600ms; }`
  );
  await showToast(page);
  const exit = await timeToken(page, '--ret-exit-duration');
  expect(exit).toBe(600);
  expectFallbackAt(await timeDismissal(page), exit + FALLBACK_MARGIN_MS);
  expect(await dismissals(page)).toEqual(['programmatic']);
});

test('completes on none of the animation events that are not its own', async ({ page }) => {
  // A descendant's own trusted animation runs during the exit, and two synthetic events follow:
  // a wrong name on the root, and the library's exit name on a descendant.
  await page.evaluate(
    css => window.__retHarness!.setStyle(css),
    `${HELD}
    .ret-toaster { --ret-exit-duration: 600ms; }
    @keyframes harness-blink { to { opacity: 0.5; } }
    .ret-toast.h-a[data-phase='exiting'] .ret-toast__title {
      animation: harness-blink 40ms 3;
    }`
  );
  await showToast(page);
  const elapsed = await page.evaluate(
    () =>
      new Promise<number>(resolve => {
        const h = window.__retHarness!;
        const item = h.toastRoot('a')!;
        const title = item.querySelector('.ret-toast__title')!;
        const start = performance.now();
        const done = h.events.length;
        setTimeout(() => {
          item.dispatchEvent(
            new AnimationEvent('animationend', { animationName: 'harness-other', bubbles: true })
          );
        }, 200);
        setTimeout(() => {
          title.dispatchEvent(
            new AnimationEvent('animationend', { animationName: 'ret-exit-top', bubbles: true })
          );
        }, 300);
        const check = () => {
          const dismissal = h.events.slice(done).find(event => event.type === 'dismiss');
          if (dismissal) resolve(dismissal.time - start);
          else requestAnimationFrame(check);
        };
        h.toast.dismiss('a');
        requestAnimationFrame(check);
      })
  );
  expectFallbackAt(elapsed, 600 + FALLBACK_MARGIN_MS);

  const ends = (await page.evaluate(() => window.__retHarness!.events))
    .filter(event => event.type === 'animationend')
    .map(event => event.detail as ToastEventDetail);
  expect(ends).toEqual([
    { label: 'a', root: false, name: 'harness-blink', trusted: true },
    { label: 'a', root: true, name: 'harness-other', trusted: false },
    { label: 'a', root: false, name: 'ret-exit-top', trusted: false },
  ]);
  expect(await dismissals(page)).toEqual(['programmatic']);
});

test('completes at the fallback when the region is hidden after the toast is shown', async ({
  page,
}) => {
  await showToast(page);
  await page.evaluate(() => window.__retHarness!.setStyle('.ret-toaster { display: none; }'));
  const expected = (await timeToken(page, '--ret-exit-duration')) + FALLBACK_MARGIN_MS;
  expectFallbackAt(await timeDismissal(page), expected);
  expect(await dismissals(page)).toEqual(['programmatic']);
});

test('completes when the region is hidden before the toast is created', async ({ page }) => {
  // Completion only. The timing in this case is Class 2 evidence, with a known WebKit observation
  // (D2-10), recorded by lifecycle.evidence.spec.ts.
  await page.evaluate(() => window.__retHarness!.setStyle('.ret-toaster { display: none; }'));
  await showToast(page);
  await timeDismissal(page);
  expect(await dismissals(page)).toEqual(['programmatic']);
  await expect(page.locator('.ret-toast')).toHaveCount(0);
});
