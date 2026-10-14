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

/** Where the page puts direction and language for one direction case (Issue #45). */
interface DirectionCase {
  readonly name: string;
  /** `dir` and `lang` on `<html>`, `<body>` and the harness's `#root`; absent ones are removed. */
  readonly html?: { readonly dir?: string; readonly lang?: string };
  readonly body?: { readonly dir?: string; readonly lang?: string };
  readonly root?: { readonly dir?: string; readonly lang?: string };
  /** Strong text placed before `#root`, so a `dir="auto"` ancestor resolves from it. */
  readonly lead?: string;
  readonly position: 'bottom-right' | 'top-right' | 'top-left';
  /** The physical edge the remaining fill must hold: the fill's inline start. */
  readonly edge: 'left' | 'right';
}

// Direction comes from the DOM, never the language (§20): each case sets it a different way. The
// stylesheet has no direction selector a bundler could rewrite, so these cases hold in consumer
// builds too, which scripts/validate-package.js checks in Vite and Next.js.
const DIRECTION_CASES: readonly DirectionCase[] = [
  { name: 'LTR', html: { dir: 'ltr' }, position: 'bottom-right', edge: 'left' },
  {
    name: 'RTL inherited from <html>',
    html: { dir: 'rtl' },
    position: 'bottom-right',
    edge: 'right',
  },
  {
    name: 'RTL on an ancestor inside an LTR page',
    html: { dir: 'ltr' },
    root: { dir: 'rtl' },
    position: 'bottom-right',
    edge: 'right',
  },
  {
    name: 'RTL with lang="en"',
    html: { dir: 'rtl', lang: 'en' },
    position: 'bottom-right',
    edge: 'right',
  },
  {
    name: 'LTR with lang="ar"',
    html: { dir: 'ltr', lang: 'ar' },
    position: 'bottom-right',
    edge: 'left',
  },
  {
    name: 'nested: RTL > LTR',
    html: { dir: 'rtl' },
    root: { dir: 'ltr' },
    position: 'bottom-right',
    edge: 'left',
  },
  {
    name: 'nested: RTL > LTR > RTL',
    html: { dir: 'rtl' },
    body: { dir: 'ltr' },
    root: { dir: 'rtl' },
    position: 'bottom-right',
    edge: 'right',
  },
  {
    name: 'dir="auto" resolving to RTL',
    html: { dir: 'ltr' },
    body: { dir: 'auto' },
    lead: 'تم الحفظ',
    position: 'bottom-right',
    edge: 'right',
  },
  { name: 'RTL at top-right', html: { dir: 'rtl' }, position: 'top-right', edge: 'right' },
  // The fill overhangs the toast toward its inline start; at the opposite viewport edge from the
  // page's own direction that overhang must not make the page scroll.
  {
    name: 'RTL Toaster at top-right of an LTR page',
    html: { dir: 'ltr' },
    root: { dir: 'rtl' },
    position: 'top-right',
    edge: 'right',
  },
  {
    name: 'LTR Toaster at top-left of an RTL page',
    html: { dir: 'rtl' },
    root: { dir: 'ltr' },
    position: 'top-left',
    edge: 'left',
  },
];

/** The fill's token per theme (P-20): `--ret-progress`, light and dark. */
const FILL_COLOUR = { light: 'rgb(82, 82, 91)', dark: 'rgb(161, 161, 170)' } as const;

for (const direction of DIRECTION_CASES) {
  test(`anchors the remaining fill at the inline start: ${direction.name}`, async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await openHarness(page);
      await page.evaluate(
        ({ direction, theme }) => {
          const set = (element: Element, attributes?: { dir?: string; lang?: string }) => {
            for (const name of ['dir', 'lang'] as const) {
              const value = attributes?.[name];
              if (value === undefined) element.removeAttribute(name);
              else element.setAttribute(name, value);
            }
          };
          set(document.documentElement, direction.html);
          set(document.body, direction.body);
          set(document.getElementById('root')!, direction.root);
          if (direction.lead) document.body.prepend(direction.lead);
          window.__retHarness!.mount({ theme, position: direction.position });
        },
        { direction, theme }
      );
      await showProgress(page);
      await page.waitForFunction(() => window.__retHarness!.progressState('a').scale < 0.9);
      const { strip, fill, scale } = (await read(page)).progress;
      const style = await page
        .locator('.ret-toast.h-a .ret-toast__progress-fill')
        .evaluate(element => {
          const { direction, backgroundColor } = getComputedStyle(element);
          return { direction, backgroundColor };
        });
      const what = `${direction.name}, ${theme}`;
      // The case set up the direction it meant to, and the theme's fill colour shows.
      expect(style.direction, what).toBe(direction.edge === 'right' ? 'rtl' : 'ltr');
      expect(style.backgroundColor, what).toBe(FILL_COLOUR[theme]);
      // The visible fill is the remaining share of the strip, held at the inline-start edge.
      expect(Math.abs(fill!.width - scale * strip!.width), what).toBeLessThan(1);
      expect(fill!.width, what).toBeLessThan(strip!.width - 10);
      expect(fill!.height, what).toBeGreaterThan(0);
      if (direction.edge === 'left') {
        expect(Math.abs(fill!.left - strip!.left), `${what}: anchored left`).toBeLessThan(PX);
      } else {
        expect(Math.abs(fill!.right - strip!.right), `${what}: anchored right`).toBeLessThan(PX);
      }
      // And it depletes toward that edge: the anchored edge stays, the other comes in.
      const after = (await hold(page, 200)).length;
      const next = (await read(page)).progress.fill!;
      expect(after).toBeGreaterThan(0);
      if (direction.edge === 'left') {
        expect(Math.abs(next.left - fill!.left), what).toBeLessThan(PX);
        expect(next.right, what).toBeLessThan(fill!.right - PX);
      } else {
        expect(Math.abs(next.right - fill!.right), what).toBeLessThan(PX);
        expect(next.left, what).toBeGreaterThan(fill!.left + PX);
      }
      // The overhanging half of the fill never makes the page scroll sideways.
      const scroll = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        x: window.scrollX,
      }));
      expect(scroll.width, `${what}: no horizontal overflow`).toBeLessThanOrEqual(scroll.client);
      expect(scroll.x, what).toBe(0);
    }
  });
}
