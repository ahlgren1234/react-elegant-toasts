import { expect, test, type Page } from '@playwright/test';
import type { ProgressState } from '../harness/api';
import { LATE_TOLERANCE_MS, openHarness, PX } from './harness';

// P-22 S3: progress (AC-PR-1, CF-25; direction AC-RTL-1, CF-24) in real Chromium, Firefox and
// WebKit. The fill is the production CSS animation, never driven from the spec; the store's timer
// is the truth it must show. Durations are long on purpose, for observation, not product values.

/** Long enough to observe pauses; short enough to wait for the timeout. */
const DURATION_MS = 4000;
/** How far the fill may sit from the time the toast has run, as a fraction of its duration. */
const FRACTION_TOLERANCE = 0.05;
/** How long a pause is held to show the fill does not move. */
const HOLD_MS = 600;
/** Movement allowed while held: none beyond rounding. */
const STILL = 0.002;

interface Shown {
  /** `performance.now()` when the toast's phase became `visible`, from the harness recorder. */
  readonly visibleAt: number;
}

/** Shows a finite toast labelled `a` with progress on, logging its dismissal. */
async function showProgress(page: Page, duration = DURATION_MS): Promise<Shown> {
  await page.evaluate(duration => {
    const h = window.__retHarness!;
    h.toast.success('Saved', {
      id: 'a',
      className: 'h-a',
      duration,
      progress: true,
      onDismiss: (_toast, reason) => h.log('dismiss', reason),
    });
  }, duration);
  await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
  const visibleAt = await page.evaluate(
    () =>
      window.__retHarness!.events.find(
        event =>
          event.type === 'phase' &&
          (event.detail as { label?: string; phase?: string }).phase === 'visible'
      )!.time
  );
  return { visibleAt };
}

/** The fill and the page time, read together in one frame. */
const read = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ time: number; progress: ProgressState }>(resolve =>
        requestAnimationFrame(time =>
          resolve({ time, progress: window.__retHarness!.progressState('a') })
        )
      )
  );

/** Samples the fill for `ms` of page time. */
const hold = (page: Page, ms: number) =>
  page.evaluate(ms => {
    const h = window.__retHarness!;
    const start = performance.now();
    return h.sampleFrames(() => h.progressState('a').scale, {
      maxFrames: 600,
      until: () => performance.now() - start >= ms,
    });
  }, ms);

const paused = (page: Page) =>
  expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-paused', '');
const running = (page: Page) =>
  expect(page.locator('.ret-toast.h-a')).not.toHaveAttribute('data-paused', /.*/);

/** The fill shows the share of the duration still to run, within the tolerance. */
function expectShows(scale: number, runMs: number, what: string): void {
  const expected = 1 - runMs / DURATION_MS;
  expect(Math.abs(scale - expected), `${what}: ${scale} against ${expected}`).toBeLessThan(
    FRACTION_TOLERANCE
  );
}

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test('is off by default, and only a finite normal toast shows it when on', async ({ page }) => {
  await page.evaluate(() => {
    const h = window.__retHarness!;
    // Five at one position, so none is queued.
    h.mount({ maxVisible: 5 });
    h.toast('Default', { id: 'off', className: 'h-off', duration: 60000 });
    h.toast('On', { id: 'on', className: 'h-on', duration: 60000, progress: true });
    h.toast('Persistent', { id: 'inf', className: 'h-inf', duration: Infinity, progress: true });
    h.toast.loading('Loading', { id: 'load', className: 'h-load', progress: true });
    h.toast.custom('Custom', { id: 'custom', className: 'h-custom', duration: 60000 });
  });
  await expect(page.locator('.ret-toast[data-phase="visible"]')).toHaveCount(5);
  const present = await page.evaluate(() =>
    Object.fromEntries(
      ['off', 'on', 'inf', 'load', 'custom'].map(label => [
        label,
        window.__retHarness!.progressState(label).present,
      ])
    )
  );
  expect(present).toEqual({ off: false, on: true, inf: false, load: false, custom: false });

  // On through the Toaster, for toasts that do not set their own.
  await page.evaluate(() => {
    const h = window.__retHarness!;
    h.mount({ maxVisible: 5, progress: true });
    h.toast('Inherited', {
      id: 'inh',
      className: 'h-inh',
      duration: 60000,
      position: 'bottom-right',
    });
  });
  await expect(page.locator('.ret-toast.h-inh')).toHaveAttribute('data-phase', 'visible');
  expect(await page.evaluate(() => window.__retHarness!.progressState('inh').present)).toBe(true);
});

test('depletes with the timer, holds on hover, resumes without a reset and ends with it', async ({
  page,
}) => {
  const { visibleAt } = await showProgress(page);
  let ran = 0;

  // Depleting with the running timer.
  await page.waitForFunction(() => window.__retHarness!.progressState('a').scale < 0.8);
  const first = await read(page);
  expect(first.progress.playState).toBe('running');
  expectShows(first.progress.scale, first.time - visibleAt, 'running');

  // A trusted pointer over the stack pauses it (hover, §10): the fill holds.
  const box = (await page.locator('.ret-toast.h-a').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await paused(page);
  const pausedAt = await read(page);
  ran = pausedAt.time - visibleAt;
  expect(pausedAt.progress.playState).toBe('paused');
  expectShows(pausedAt.progress.scale, ran, 'paused');
  const held = await hold(page, HOLD_MS);
  for (const { value } of held) {
    expect(Math.abs(value - pausedAt.progress.scale), 'still while paused').toBeLessThan(STILL);
  }

  // Leaving resumes from the held fraction: no reset to full, and depleting again.
  await page.mouse.move(1, 700);
  await running(page);
  const resumed = await read(page);
  const resumedFrom = resumed.progress.scale;
  expect(resumedFrom, 'no reset').toBeLessThan(pausedAt.progress.scale + STILL);
  expect(pausedAt.progress.scale - resumedFrom, 'continues from the held fraction').toBeLessThan(
    FRACTION_TOLERANCE
  );
  const later = await hold(page, 300);
  expect(later[later.length - 1]!.value).toBeLessThan(resumedFrom - STILL);

  // The timeout comes when the remaining time has run, not the full duration again (D-08).
  const timeoutAt = await page.evaluate(
    () =>
      new Promise<number>(resolve => {
        const h = window.__retHarness!;
        const check = () => {
          const dismissal = h.events.find(event => event.type === 'dismiss');
          if (dismissal) resolve(dismissal.time);
          else requestAnimationFrame(check);
        };
        check();
      })
  );
  const pausedFor = resumed.time - pausedAt.time;
  const expectedEnd = visibleAt + DURATION_MS + pausedFor;
  expect(Math.abs(timeoutAt - expectedEnd), 'timed out after the remaining time').toBeLessThan(
    FRACTION_TOLERANCE * DURATION_MS + LATE_TOLERANCE_MS
  );
  expect(
    await page.evaluate(() =>
      window
        .__retHarness!.events.filter(event => event.type === 'dismiss')
        .map(event => event.detail)
    )
  ).toEqual(['timeout']);
});

test('holds while focus is inside the toast and resumes without a reset', async ({ page }) => {
  const { visibleAt } = await showProgress(page);
  await page.waitForFunction(() => window.__retHarness!.progressState('a').scale < 0.85);

  // Focus inside the toast pauses it (focus-within, §10). How focus arrives is S4's.
  await page.locator('.ret-toast.h-a .ret-toast__close').focus();
  await paused(page);
  const pausedAt = await read(page);
  expectShows(pausedAt.progress.scale, pausedAt.time - visibleAt, 'paused');
  for (const { value } of await hold(page, HOLD_MS)) {
    expect(Math.abs(value - pausedAt.progress.scale), 'still while paused').toBeLessThan(STILL);
  }

  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await running(page);
  const resumed = await read(page);
  expect(resumed.progress.scale, 'no reset').toBeLessThan(pausedAt.progress.scale + STILL);
  expect(pausedAt.progress.scale - resumed.progress.scale).toBeLessThan(FRACTION_TOLERANCE);
  const later = await hold(page, 300);
  expect(later[later.length - 1]!.value).toBeLessThan(resumed.progress.scale - STILL);
});

test('anchors the remaining fill at the inline start: left in LTR, right in RTL', async ({
  page,
}) => {
  for (const dir of ['ltr', 'rtl'] as const) {
    await openHarness(page);
    await page.evaluate(dir => {
      document.documentElement.dir = dir;
    }, dir);
    await showProgress(page);
    await page.waitForFunction(() => window.__retHarness!.progressState('a').scale < 0.75);
    const { strip, fill, scale } = (await read(page)).progress;
    expect(strip && fill).toBeTruthy();
    // The fill's visible width is the remaining share of the strip.
    expect(Math.abs(fill!.width - scale * strip!.width)).toBeLessThan(1);
    expect(fill!.width).toBeLessThan(strip!.width - 10);
    if (dir === 'ltr') {
      expect(Math.abs(fill!.left - strip!.left), 'anchored left').toBeLessThan(PX);
    } else {
      expect(Math.abs(fill!.right - strip!.right), 'anchored right').toBeLessThan(PX);
    }
    // And it depletes toward that edge: the anchored edge stays, the other comes in.
    const after = (await hold(page, 200)).length;
    const next = (await read(page)).progress.fill!;
    expect(after).toBeGreaterThan(0);
    if (dir === 'ltr') {
      expect(Math.abs(next.left - fill!.left)).toBeLessThan(PX);
      expect(next.right).toBeLessThan(fill!.right - PX);
    } else {
      expect(Math.abs(next.right - fill!.right)).toBeLessThan(PX);
      expect(next.left).toBeGreaterThan(fill!.left + PX);
    }
  }
});
