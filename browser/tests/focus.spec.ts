import { expect, test, type Page } from '@playwright/test';
import type { FocusEventDetail, FocusState, InertEventDetail } from '../harness/api';
import { openHarness } from './harness';

// P-22 S4.1 (V2_PLAN.md, P-22 D2 and S4-H2): focus restoration in real browsers, Class 1 in
// Chromium, Firefox and WebKit, with trusted Playwright input only.
// - H1-R: D1b's five H1 cases on a long page. Restoration reaches the §18 target and never scrolls.
// - CF-6: restoration happens before the exiting toast is `inert`, and nothing undoes it through
//   the exit and the removal.
// - H2: a trusted press on an inert exiting toast, on a gap between toasts, or the second press of
//   a double-click on a close button, dismisses nothing and leaves focus where it was.
// Each scenario's focus preconditions are asserted, never assumed: a precondition that fails in an
// engine fails the test.

/** Toasts are created in this order; at `top-right` the newest is first in DOM order (§12). */
async function showToasts(page: Page, ids: readonly string[], duration = Infinity): Promise<void> {
  await page.evaluate(
    ([ids, duration]) => {
      const h = window.__retHarness!;
      for (const id of ids) {
        h.toast(`Toast ${id}`, {
          id,
          className: `h-${id}`,
          duration,
          onDismiss: (_toast, reason) => h.log('dismiss', { id, reason }),
        });
      }
    },
    [ids, duration] as const
  );
  for (const id of ids) {
    await expect(page.locator(`.ret-toast.h-${id}`)).toHaveAttribute('data-phase', 'visible');
  }
}

type FocusEntry =
  | ({ readonly type: 'focusin' | 'focusout' } & FocusEventDetail)
  | ({ readonly type: 'inert' } & InertEventDetail);

/** The focus and `inert` entries of the harness log, in order. */
const focusLog = (page: Page): Promise<FocusEntry[]> =>
  page.evaluate(() =>
    window
      .__retHarness!.events.filter(event => ['focusin', 'focusout', 'inert'].includes(event.type))
      .map(event => ({ type: event.type, ...(event.detail as object) }) as FocusEntry)
  );

const dismissals = (page: Page) =>
  page.evaluate(() =>
    window.__retHarness!.events.filter(event => event.type === 'dismiss').map(event => event.detail)
  );

const focusState = (page: Page): Promise<FocusState> =>
  page.evaluate(() => window.__retHarness!.focusState());

const active = async (page: Page) => (await focusState(page)).active;

/** Asserts a focus precondition of the scenario, naming it, so a different engine fails loudly. */
async function expectActive(page: Page, expected: string, precondition: string): Promise<void> {
  expect(await active(page), `precondition: ${precondition}`).toBe(expected);
}

/**
 * The long-page preconditions (P-22 H1): the page is at the top and can scroll, and the region, a
 * static element after 4000 px of content, lies far below the viewport, so focusing it with a plain
 * `focus()` would scroll the page.
 */
async function openLongPage(page: Page): Promise<void> {
  await openHarness(page, 'long-page');
  const layout = await page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollable: document.documentElement.scrollHeight - window.innerHeight,
    regionTop: document.querySelector('.ret-toaster')!.getBoundingClientRect().top,
    viewport: window.innerHeight,
  }));
  expect(layout.scrollY).toBe(0);
  expect(layout.scrollable).toBeGreaterThan(3000);
  expect(layout.regionTop).toBeGreaterThan(layout.viewport + 3000);
}

const expectNoScroll = async (page: Page) => expect((await focusState(page)).scrollY).toBe(0);

/** Trusted keyboard focus from the top of the page to `close:<id>`, checking each step. */
async function tabTo(page: Page, path: readonly string[]): Promise<void> {
  for (const target of path) {
    await page.keyboard.press('Tab');
    await expectActive(page, target, `Tab reaches ${target}`);
  }
}

test.describe('H1-R: removal restoration never scrolls the page (P-22 H1)', () => {
  test('a mouse close of the only toast restores to the region', async ({ page }) => {
    await openLongPage(page);
    await showToasts(page, ['a']);
    await expectActive(page, 'body', 'nothing is focused');
    await page.locator('.ret-toast.h-a .ret-toast__close').click();
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    // Restoration starts only from focus inside the toast: the press must have focused the close.
    expect(
      (await focusLog(page)).find(entry => entry.type === 'focusin'),
      'precondition: the clicked close button took focus'
    ).toMatchObject({ target: 'close:a', trusted: true });
    expect(await active(page)).toBe('region');
    await expectNoScroll(page);
    expect(await dismissals(page)).toEqual([{ id: 'a', reason: 'close-button' }]);
  });

  test('Alt+T, Tab and Enter on the close button restore to the region', async ({ page }) => {
    await openLongPage(page);
    await showToasts(page, ['a']);
    await tabTo(page, ['outside']);
    await page.keyboard.press('Alt+t');
    await expectActive(page, 'toast:a', 'Alt+T focuses the toast');
    await page.keyboard.press('Tab');
    await expectActive(page, 'close:a', 'Tab moves to its close button');
    await expectNoScroll(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    // The region, never the element focused before the hotkey (§18).
    expect(await active(page)).toBe('region');
    await expectNoScroll(page);
    expect(await dismissals(page)).toEqual([{ id: 'a', reason: 'close-button' }]);
  });

  test('a body click, then a programmatic dismissal, restores to the region', async ({ page }) => {
    await openLongPage(page);
    await showToasts(page, ['a']);
    await page.locator('.ret-toast.h-a .ret-toast__title').click();
    // D1b's case as written: a press on the body focuses the toast root (CF-39, existing behaviour).
    await expectActive(page, 'toast:a', 'a click on the body focuses the toast');
    await page.evaluate(() => window.__retHarness!.toast.dismiss('a'));
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    expect(await active(page)).toBe('region');
    await expectNoScroll(page);
    expect(await dismissals(page)).toEqual([{ id: 'a', reason: 'programmatic' }]);
  });

  test('a close of the first of two toasts restores to the next one’s close', async ({ page }) => {
    await openLongPage(page);
    await showToasts(page, ['b', 'a']);
    await page.locator('.ret-toast.h-a .ret-toast__close').click();
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    expect(
      (await focusLog(page)).find(entry => entry.type === 'focusin'),
      'precondition: the clicked close button took focus'
    ).toMatchObject({ target: 'close:a', trusted: true });
    expect(await active(page)).toBe('close:b');
    await expectNoScroll(page);
    expect(await dismissals(page)).toEqual([{ id: 'a', reason: 'close-button' }]);
  });

  test('control: a programmatic dismissal with nothing focused restores nothing', async ({
    page,
  }) => {
    await openLongPage(page);
    await showToasts(page, ['a']);
    await expectActive(page, 'body', 'nothing is focused');
    await page.evaluate(() => window.__retHarness!.toast.dismiss('a'));
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    expect(await active(page)).toBe('body');
    expect(await focusLog(page)).toEqual([
      { type: 'inert', toast: 'a', inert: true, active: 'body' },
    ]);
    await expectNoScroll(page);
  });
});

interface FocusSample {
  readonly active: string | null;
  readonly phase: string | null;
  readonly inert: boolean;
  readonly connected: boolean;
}

/**
 * Closes `exiting`'s focused close button with Enter and samples, in every frame from just before
 * the press until 5 frames after the toast's removal, where focus is and the toast's phase and
 * `inert`. The sampler is running before the key is pressed. `requestAnimationFrame` is observed,
 * never mocked.
 */
async function closeAndSample(page: Page, exiting: string): Promise<FocusSample[]> {
  const sampling = page.evaluate(exiting => {
    const h = window.__retHarness!;
    let gone = 0;
    const read = () => {
      const item = h.toastRoot(exiting);
      return {
        active: h.focusState().active,
        phase: item?.getAttribute('data-phase') ?? null,
        inert: item?.hasAttribute('inert') ?? false,
        connected: item !== null,
      };
    };
    const samples = h.sampleFrames(read, {
      maxFrames: 600,
      until: value => !value.connected && ++gone >= 5,
    });
    h.log('sampling');
    return samples;
  }, exiting);
  await page.waitForFunction(() =>
    window.__retHarness!.events.some(event => event.type === 'sampling')
  );
  await page.keyboard.press('Enter');
  return (await sampling).map(sample => sample.value);
}

/**
 * CF-6's ordering, from records made as it happened: the focus events are logged synchronously as
 * they are dispatched, with whether their target was inert then, and the `inert` entry reads the
 * active element in its own observer callback, before any later task.
 */
function expectRestoredBeforeInert(log: FocusEntry[], from: string, to: string, exiting: string) {
  const leaving = log.findIndex(entry => entry.type === 'focusout' && entry.target === from);
  const arriving = log.findIndex(entry => entry.type === 'focusin' && entry.target === to);
  const inert = log.findIndex(
    entry => entry.type === 'inert' && entry.toast === exiting && entry.inert
  );
  expect(leaving, 'focus leaves the exiting toast').toBeGreaterThanOrEqual(0);
  expect(log[leaving]).toMatchObject({ related: to, targetInert: false });
  expect(arriving, 'focus arrives at the target').toBeGreaterThan(leaving);
  expect(log[arriving]).toMatchObject({ related: from, targetInert: false });
  expect(inert, 'the exiting toast becomes inert after restoration').toBeGreaterThan(arriving);
  expect(log[inert]).toMatchObject({ active: to });
  // Nothing moves focus again: no browser fix-up, and no later restoration.
  expect(log.slice(inert + 1).filter(entry => entry.type !== 'inert')).toEqual([]);
}

/** Every sampled frame: before the press, `from`; from the exit on, `to`, also after removal. */
function expectFocusHeld(samples: FocusSample[], from: string, to: string) {
  expect(samples[0], 'frame 0 is before the press').toMatchObject({
    active: from,
    phase: 'visible',
    inert: false,
  });
  const first = samples.findIndex(sample => sample.active !== from);
  expect(first, 'focus moves').toBeGreaterThan(0);
  samples.slice(first).forEach((sample, index) => {
    expect(sample.active, `frame ${first + index}`).toBe(to);
  });
  for (const sample of samples.filter(sample => sample.inert)) {
    expect(sample.phase).toBe('exiting');
    expect(sample.active).toBe(to);
  }
  expect(samples.some(sample => sample.inert)).toBe(true);
  expect(samples[samples.length - 1]?.connected).toBe(false);
}

test.describe('CF-6: restoration before inert, kept through the exit and removal', () => {
  test('to the next toast’s close (§18 step 1)', async ({ page }) => {
    await openHarness(page);
    await showToasts(page, ['b', 'a']);
    await tabTo(page, ['close:a']);
    const samples = await closeAndSample(page, 'a');
    expectFocusHeld(samples, 'close:a', 'close:b');
    expectRestoredBeforeInert(await focusLog(page), 'close:a', 'close:b', 'a');
    expect(await dismissals(page)).toEqual([{ id: 'a', reason: 'close-button' }]);
  });

  test('to the previous toast (§18 step 2)', async ({ page }) => {
    await openHarness(page);
    await showToasts(page, ['b', 'a']);
    await tabTo(page, ['close:a', 'close:b']);
    const samples = await closeAndSample(page, 'b');
    expectFocusHeld(samples, 'close:b', 'toast:a');
    expectRestoredBeforeInert(await focusLog(page), 'close:b', 'toast:a', 'b');
    expect(await dismissals(page)).toEqual([{ id: 'b', reason: 'close-button' }]);
  });

  test('to the region (§18 step 3)', async ({ page }) => {
    await openHarness(page);
    await showToasts(page, ['a']);
    await tabTo(page, ['close:a']);
    const samples = await closeAndSample(page, 'a');
    expectFocusHeld(samples, 'close:a', 'region');
    expectRestoredBeforeInert(await focusLog(page), 'close:a', 'region', 'a');
    expect(await dismissals(page)).toEqual([{ id: 'a', reason: 'close-button' }]);
  });
});

/** A point away from every stack, so no hover reason is set there. */
const AWAY = { x: 640, y: 360 } as const;

test.describe('CF-6 and H2: presses on an exiting toast and the list keep focus (P-22 S4-H2)', () => {
  test('a press and a click on an inert exiting toast dismiss nothing and move no focus', async ({
    page,
  }) => {
    await openHarness(page);
    // The public exit token, slowed so the exiting state can be pressed (D0-11); finite toasts, so
    // the focus-within pause shows as `data-paused`.
    await page.evaluate(() =>
      window.__retHarness!.setStyle('.ret-toaster { --ret-exit-duration: 3000ms; }')
    );
    await showToasts(page, ['b', 'a'], 60_000);
    const close = (await page.locator('.ret-toast.h-a .ret-toast__close').boundingBox())!;
    const title = (await page.locator('.ret-toast.h-a .ret-toast__title').boundingBox())!;
    const other = (await page.locator('.ret-toast.h-b').boundingBox())!;
    // The pressed points lie on `a` only, never on `b`.
    expect(close.y + close.height).toBeLessThan(other.y);
    expect(title.y + title.height).toBeLessThan(other.y);
    await tabTo(page, ['close:a']);
    await page.keyboard.press('Enter');
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('inert', '');
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'exiting');
    await expectActive(page, 'close:b', 'restoration reached the next toast’s close');
    const restored = (await focusLog(page)).length;

    await page.mouse.move(close.x + close.width / 2, close.y + close.height / 2);
    await page.mouse.down();
    expect(await active(page), 'after the press').toBe('close:b');
    await page.mouse.up();
    expect(await active(page), 'after the click').toBe('close:b');
    await page.mouse.click(title.x + title.width / 2, title.y + title.height / 2);
    expect(await active(page), 'after a click on its body').toBe('close:b');
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'exiting');

    // Away from the stack, only focus-within can hold `b`.
    await page.mouse.move(AWAY.x, AWAY.y);
    await expect(page.locator('.ret-toast.h-b')).toHaveAttribute('data-paused', '');
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    expect(await active(page)).toBe('close:b');
    expect((await focusLog(page)).slice(restored).filter(entry => entry.type !== 'inert')).toEqual(
      []
    );
    expect(await dismissals(page)).toEqual([{ id: 'a', reason: 'close-button' }]);
    await expect(page.locator('.ret-toast.h-b')).toHaveAttribute('data-phase', 'visible');
  });

  test('a double-click on a close button keeps the restoration and its pause', async ({ page }) => {
    await openHarness(page);
    await showToasts(page, ['b', 'a'], 60_000);
    const close = (await page.locator('.ret-toast.h-a .ret-toast__close').boundingBox())!;
    await page.mouse.dblclick(close.x + close.width / 2, close.y + close.height / 2);
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    const log = await focusLog(page);
    expect(
      log.find(entry => entry.type === 'focusin'),
      'precondition: the clicked close button took focus'
    ).toMatchObject({ target: 'close:a', trusted: true });
    expect(log.flatMap(entry => (entry.type === 'focusin' ? [entry.target] : []))).toEqual([
      'close:a',
      'close:b',
    ]);
    expect(await active(page)).toBe('close:b');
    await page.mouse.move(AWAY.x, AWAY.y);
    await expect(page.locator('.ret-toast.h-b')).toHaveAttribute('data-paused', '');
    expect(await active(page)).toBe('close:b');
    expect(await dismissals(page)).toEqual([{ id: 'a', reason: 'close-button' }]);
  });

  test('a press on a gap between toasts keeps focus outside the region', async ({ page }) => {
    await openLongPage(page);
    await showToasts(page, ['b', 'a']);
    const first = (await page.locator('.ret-toast.h-a').boundingBox())!;
    const second = (await page.locator('.ret-toast.h-b').boundingBox())!;
    const gap = second.y - (first.y + first.height);
    expect(gap, 'precondition: the toasts have a gap between them').toBeGreaterThan(2);
    await tabTo(page, ['outside']);
    const before = (await focusLog(page)).length;
    await page.mouse.click(first.x + first.width / 2, first.y + first.height + gap / 2);
    expect(await active(page)).toBe('outside');
    expect((await focusLog(page)).slice(before)).toEqual([]);
    expect(await dismissals(page)).toEqual([]);
    await expectNoScroll(page);
  });
});
