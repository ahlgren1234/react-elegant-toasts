import { expect, test, type Page } from '@playwright/test';
import type { ToastPosition } from '../../src';
import { openHarness, openReducedMotionHarness } from './harness';

// P-22 S5.1 (V2_PLAN.md, P-22 D2 and the S5 decisions): swipe logic, Class 1 in Chromium, Firefox
// and WebKit.
// - CF-29 layer A, with SYNTHETIC pointer events: script-dispatched `PointerEvent`s with
//   `pointerType: 'touch'`, so `isTrusted` is false. They exercise the library's gesture logic
//   only. They never prove native pointer capture (`setPointerCapture` throws for them, and the
//   library tolerates it), `touch-action`, the browser's scroll arbitration, or real touch or pen
//   input: those are layer B (S5.2, Chromium) and the device checkpoints (MC-2, MC-3, MC-4).
// - The approved §19 and P-21 contracts the same logic carries: the `swipe` pause, selection,
//   custom toasts, RTL's physical directions and the reduced-motion release.
// - CF-29's mouse case, with TRUSTED Playwright mouse input: a mouse drag never swipes.
// - CF-36's completion, synthetic: a dismissal during the snap-back completes the exit.

/**
 * The D2 values (P-21 D2 decisions 1 to 3), written here rather than imported, so a change to the
 * implementation's constants fails these tests.
 */
const SLOP_PX = 10;
const DISTANCE_FRACTION = 0.4;
const DISTANCE_MAX_PX = 100;
const VELOCITY_PX_PER_MS = 0.4;
const VELOCITY_WINDOW_MS = 100;
/** Velocity preconditions keep this factor away from the threshold, whatever the machine's load. */
const VELOCITY_MARGIN = 2;

/** The distance that commits for a toast `width` wide (D2 decision 2). */
const thresholdFor = (width: number) => Math.min(DISTANCE_FRACTION * width, DISTANCE_MAX_PX);

interface ToastSpec {
  readonly id: string;
  readonly position?: ToastPosition;
  readonly custom?: boolean;
  readonly action?: boolean;
  readonly fixture?: boolean;
}

/** Finite toasts, so a pause shows as `data-paused`, each logging its dismissal. */
async function showToasts(page: Page, toasts: readonly ToastSpec[]): Promise<void> {
  await page.evaluate(toasts => {
    const h = window.__retHarness!;
    for (const spec of toasts) {
      const options = {
        id: spec.id,
        className: `h-${spec.id}`,
        duration: 60_000,
        position: spec.position ?? 'top-right',
        onDismiss: (_toast: unknown, reason: string) => h.log('dismiss', { id: spec.id, reason }),
      };
      if (spec.fixture) h.toast.custom(h.focusFixture('remove'), options);
      else if (spec.custom) h.toast.custom(`Custom ${spec.id}`, options);
      else
        h.toast(`Toast ${spec.id} with some text`, {
          ...options,
          action: spec.action
            ? { label: `Undo ${spec.id}`, onClick: () => h.log('action', spec.id) }
            : undefined,
        });
    }
  }, toasts);
  for (const spec of toasts) {
    await expect(page.locator(`.ret-toast.h-${spec.id}`)).toHaveAttribute('data-phase', 'visible');
  }
}

const dismissals = (page: Page) =>
  page.evaluate(() =>
    window.__retHarness!.events.filter(event => event.type === 'dismiss').map(event => event.detail)
  );

/** `onDismiss` runs when the exit completes, so a dismissal is awaited, never read at once. */
const expectDismissals = (page: Page, expected: unknown[]) =>
  expect.poll(() => dismissals(page)).toEqual(expected);

/** One synthetic move: the pointer's offset from its start, after waiting `wait` ms. */
interface Move {
  readonly dx: number;
  readonly dy?: number;
  readonly wait?: number;
}

interface SwipePlan {
  readonly id: string;
  /** Where the contact starts, inside the toast; by default its title, or the root itself. */
  readonly from?: string;
  readonly moves: readonly Move[];
  readonly end: 'up' | 'cancel';
  /** Waited before the end, at the last move's position. */
  readonly endWait?: number;
  /** Dismisses the toast programmatically this many ms after the end (CF-36). */
  readonly dismissAfter?: number;
  /**
   * Dispatches the moves without reading the toast's state after each one, so only their own
   * waits space them: for a flick, whose steps are not inspected.
   */
  readonly unread?: boolean;
  /** Samples every frame from the end until the toast is removed, or is back at rest. */
  readonly sampleUntil?: 'removed' | 'rest';
}

interface ToastStep {
  readonly step: string;
  readonly connected: boolean;
  readonly phase: string | null;
  readonly swiping: string | null;
  readonly paused: boolean;
  readonly inert: boolean;
  readonly transformX: number;
}

interface SwipeResult {
  readonly width: number;
  /** Each dispatched event, with its own `timeStamp` and `clientX`. */
  readonly events: readonly { readonly type: string; readonly x: number; readonly time: number }[];
  /** The toast after the `pointerdown`, after each move and after the end. */
  readonly steps: readonly ToastStep[];
  /** From the end on, one per frame (sampled from the end's task, D2-12). */
  readonly frames: readonly ToastStep[];
}

/**
 * A SYNTHETIC touch contact on toast `id`: `pointerdown`, the moves, then `pointerup` or
 * `pointercancel`, all dispatched by script on the start element (`isTrusted` false; `buttons` 1
 * during contact and 0 at its end, as browsers report a contact). Each step's toast state is read
 * after the next frame and a task, once the renderer has committed it.
 */
function swipe(page: Page, plan: SwipePlan): Promise<SwipeResult> {
  return page.evaluate(async plan => {
    const h = window.__retHarness!;
    const root = h.toastRoot(plan.id)!;
    const target =
      root.querySelector(plan.from ?? '.ret-toast__title') ?? (plan.from ? null : root);
    if (!target) throw new Error(`No ${plan.from} in toast ${plan.id}`);
    const rect = target.getBoundingClientRect();
    // Measured before the gesture: a dismissed toast may be gone by the end.
    const width = root.offsetWidth;
    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    // The renderer commits a pause change in a later task: read after the next frame and a task.
    const committed = () =>
      new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const events: { type: string; x: number; time: number }[] = [];
    const dispatch = (type: string, x: number, y: number, buttons: number) => {
      const event = new PointerEvent(type, {
        pointerId: 41,
        pointerType: 'touch',
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        button: type === 'pointermove' ? -1 : 0,
        buttons,
      });
      target.dispatchEvent(event);
      events.push({ type, x, time: event.timeStamp });
    };
    const read = (step: string) => {
      const item = h.toastRoot(plan.id);
      const state = h.toastState(plan.id);
      return {
        step,
        connected: item !== null,
        phase: state.phase,
        swiping: state.swiping,
        paused: item?.hasAttribute('data-paused') ?? false,
        inert: item?.hasAttribute('inert') ?? false,
        transformX: state.transformX,
      };
    };
    const steps = [];
    dispatch('pointerdown', start.x, start.y, 1);
    await committed();
    steps.push(read('down'));
    let last = { x: start.x, y: start.y };
    for (const [index, move] of plan.moves.entries()) {
      if (move.wait) await wait(move.wait);
      last = { x: start.x + move.dx, y: start.y + (move.dy ?? 0) };
      dispatch('pointermove', last.x, last.y, 1);
      if (plan.unread) continue;
      await committed();
      steps.push(read(`move ${index}`));
    }
    if (plan.endWait) await wait(plan.endWait);
    dispatch(plan.end === 'up' ? 'pointerup' : 'pointercancel', last.x, last.y, 0);
    const until = plan.sampleUntil;
    const sampling = until
      ? h.sampleFrames(() => read('frame'), {
          maxFrames: 240,
          until: value =>
            until === 'removed' ? !value.connected : value.swiping === null && value.connected,
        })
      : null;
    if (plan.dismissAfter !== undefined) {
      if (plan.dismissAfter > 0) await wait(plan.dismissAfter);
      h.toast.dismiss(plan.id);
    }
    await committed();
    steps.push(read('end'));
    const frames = sampling ? (await sampling).map(sample => sample.value) : [];
    return { width, events, steps, frames };
  }, plan);
}

/** A slow drag to `total` px (sign gives the direction): 8 px every 50 ms after the slop. */
function slowTo(total: number): Move[] {
  const sign = Math.sign(total);
  const moves: Move[] = [{ dx: sign * (SLOP_PX + 2) }];
  for (let dx = SLOP_PX + 2 + 8; dx < Math.abs(total); dx += 8)
    moves.push({ dx: sign * dx, wait: 50 });
  moves.push({ dx: total, wait: 50 });
  return moves;
}

/** A fast flick to `total` px: activation, then two moves 8 ms apart (dispatch `unread`). */
function flickTo(total: number): Move[] {
  const sign = Math.sign(total);
  const activation = sign * (SLOP_PX + 2);
  return [{ dx: activation }, { dx: (activation + total) / 2, wait: 8 }, { dx: total, wait: 8 }];
}

/**
 * The release velocity the library sees, from the dispatched events' own timestamps (D2
 * decision 3): the moves from activation and the release, within the window before the release.
 */
function releaseVelocityOf(result: SwipeResult): number {
  const velocity = measuredVelocity(result);
  // Recorded for the report, never asserted beyond the preconditions' margins.
  test
    .info()
    .annotations.push({ type: 'release velocity (px/ms)', description: velocity.toFixed(3) });
  return velocity;
}

function measuredVelocity(result: SwipeResult): number {
  const release = result.events[result.events.length - 1]!;
  const samples = result.events
    .slice(1)
    .filter(event => Math.abs(event.x - result.events[0]!.x) >= SLOP_PX)
    .filter(event => event.time >= release.time - VELOCITY_WINDOW_MS && event.time <= release.time);
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  return last.time > first.time ? (last.x - first.x) / (last.time - first.time) : 0;
}

/** The offset at release, from the activation point (the first move past the slop). */
const offsetOf = (result: SwipeResult) => {
  const activation = result.events.find(
    event => event.type === 'pointermove' && Math.abs(event.x - result.events[0]!.x) >= SLOP_PX
  )!;
  return result.events[result.events.length - 1]!.x - activation.x;
};

/** A slow release, well under the velocity threshold, so only the distance can decide. */
function expectSlow(result: SwipeResult): void {
  expect(
    Math.abs(releaseVelocityOf(result)),
    'precondition: the release is slow'
  ).toBeLessThanOrEqual(VELOCITY_PX_PER_MS / VELOCITY_MARGIN);
}

/** Never activated: no swipe state, no offset, no pause, at any step. */
function expectNeverActivated(result: SwipeResult): void {
  for (const step of result.steps) {
    expect(step, step.step).toMatchObject({ swiping: null, transformX: 0, paused: false });
  }
}

const POSITION_DIRECTIONS: readonly [ToastPosition, -1 | 1][] = [
  ['top-left', -1],
  ['top-right', 1],
  ['top-center', -1],
  ['top-center', 1],
];

test.describe('CF-29 layer A: swipe logic (synthetic pointer events)', () => {
  for (const [position, sign] of POSITION_DIRECTIONS) {
    test(`at ${position}, a drag ${sign < 0 ? 'left' : 'right'} past the distance commits`, async ({
      page,
    }) => {
      await openHarness(page);
      await showToasts(page, [{ id: 'a', position }]);
      const result = await swipe(page, {
        id: 'a',
        moves: slowTo(sign * 132),
        end: 'up',
        endWait: 50,
        sampleUntil: 'removed',
      });
      expectSlow(result);
      const offset = offsetOf(result);
      expect(Math.abs(offset)).toBeGreaterThanOrEqual(thresholdFor(result.width));
      const dragging = result.steps.filter(step => step.swiping === 'drag');
      expect(dragging.length, 'the gesture activated').toBeGreaterThan(0);
      expect(dragging[dragging.length - 1]!.transformX).toBeCloseTo(offset, 0);
      await expectDismissals(page, [{ id: 'a', reason: 'swipe' }]);
      // §19: the exit continues from the dragged offset, travelling on toward the edge.
      const frames = result.frames.filter(frame => frame.connected);
      expect(frames.length).toBeGreaterThan(0);
      expect(frames[0]!.transformX).toBeCloseTo(offset, 0);
      for (const frame of frames) {
        expect(frame.transformX * sign, 'never back toward rest').toBeGreaterThanOrEqual(
          Math.abs(offset) - 0.5
        );
      }
      expect(
        Math.max(...frames.map(frame => frame.transformX * sign)),
        'travels on past the release offset'
      ).toBeGreaterThan(Math.abs(offset) + 1);
      await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    });
  }

  test('below the distance, a slow drag springs back with no dismissal', async ({ page }) => {
    await openHarness(page);
    await showToasts(page, [{ id: 'a' }]);
    const result = await swipe(page, {
      id: 'a',
      moves: slowTo(92),
      end: 'up',
      endWait: 50,
      sampleUntil: 'rest',
    });
    expectSlow(result);
    expect(Math.abs(offsetOf(result))).toBeLessThan(thresholdFor(result.width));
    expect(result.steps.some(step => step.swiping === 'drag')).toBe(true);
    const rest = result.frames[result.frames.length - 1]!;
    expect(rest).toMatchObject({ swiping: null, transformX: 0, phase: 'visible' });
    expect(await dismissals(page)).toEqual([]);
  });

  test('a fast flick under the distance commits by velocity', async ({ page }) => {
    await openHarness(page);
    await showToasts(page, [{ id: 'a' }]);
    const result = await swipe(page, { id: 'a', moves: flickTo(92), end: 'up', unread: true });
    expect(Math.abs(offsetOf(result))).toBeLessThan(thresholdFor(result.width));
    expect(releaseVelocityOf(result), 'precondition: the release is fast').toBeGreaterThanOrEqual(
      VELOCITY_PX_PER_MS * VELOCITY_MARGIN
    );
    await expectDismissals(page, [{ id: 'a', reason: 'swipe' }]);
  });

  for (const [position, allowed] of [
    ['top-left', -1],
    ['top-right', 1],
  ] as const) {
    test(`at ${position}, the forbidden direction never moves the toast`, async ({ page }) => {
      await openHarness(page);
      await showToasts(page, [
        { id: 'a', position },
        { id: 'b', position },
      ]);
      // A start in the forbidden direction never activates (it stays a candidate).
      const forbidden = await swipe(page, {
        id: 'a',
        moves: slowTo(-allowed * 132),
        end: 'up',
      });
      expectNeverActivated(forbidden);
      // An active drag carried back past its origin is clamped there: no rubber band.
      const back = await swipe(page, {
        id: 'b',
        moves: [...slowTo(allowed * 40), { dx: -allowed * 80, wait: 50 }],
        end: 'up',
        endWait: 50,
        sampleUntil: 'rest',
      });
      const clamped = back.steps[back.steps.length - 2]!;
      expect(clamped).toMatchObject({ swiping: 'drag', transformX: 0 });
      expect(await dismissals(page)).toEqual([]);
      await expect(page.locator('.ret-toast[data-phase="visible"]')).toHaveCount(2);
    });
  }

  test('activation needs the slop with horizontal movement dominant', async ({ page }) => {
    await openHarness(page);
    await showToasts(page, [
      { id: 'a', position: 'top-center' },
      { id: 'b', position: 'top-center' },
      { id: 'c', position: 'top-center' },
    ]);
    // Short of the slop: nothing; at it: active.
    const slop = await swipe(page, {
      id: 'a',
      moves: [{ dx: SLOP_PX - 1 }, { dx: SLOP_PX, wait: 20 }],
      end: 'cancel',
    });
    expect(slop.steps[1]).toMatchObject({ swiping: null, paused: false });
    expect(slop.steps[2]).toMatchObject({ swiping: 'drag', paused: true });
    // Past the slop without horizontal dominance: dropped, and never activates afterwards.
    const vertical = await swipe(page, {
      id: 'b',
      moves: [{ dx: 9, dy: 9 }, ...slowTo(132).map(move => ({ ...move, dy: 9 }))],
      end: 'up',
    });
    expectNeverActivated(vertical);
    // Exactly dominant (|dx| = 1.5 × |dy|) at the slop: active.
    const diagonal = await swipe(page, {
      id: 'c',
      moves: [{ dx: 15, dy: 10 }],
      end: 'cancel',
    });
    expect(diagonal.steps[1]).toMatchObject({ swiping: 'drag' });
    expect(await dismissals(page)).toEqual([]);
  });

  test('never starts from an interactive descendant', async ({ page }) => {
    await openHarness(page);
    await showToasts(page, [
      { id: 'a', action: true },
      { id: 'b', fixture: true },
    ]);
    for (const [id, from] of [
      ['a', '.ret-toast__action'],
      ['a', '.ret-toast__close'],
      ['b', '.h-target'],
    ] as const) {
      const result = await swipe(page, { id, from, moves: slowTo(132), end: 'up' });
      expectNeverActivated(result);
    }
    expect(await dismissals(page)).toEqual([]);
    await expect(page.locator('.ret-toast[data-phase="visible"]')).toHaveCount(2);
  });
});

test.describe('§19 and P-21 contracts on the same logic (synthetic pointer events)', () => {
  test('the swipe pause starts at activation and ends at commit, snap-back and cancel', async ({
    page,
  }) => {
    await openHarness(page);
    await showToasts(page, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const commit = await swipe(page, {
      id: 'a',
      moves: [{ dx: SLOP_PX - 2 }, ...slowTo(132)],
      end: 'up',
      endWait: 50,
    });
    expect(commit.steps[0], 'pointerdown pauses nothing').toMatchObject({ paused: false });
    expect(commit.steps[1], 'short of the slop').toMatchObject({ paused: false, swiping: null });
    expect(commit.steps[2], 'activated').toMatchObject({ paused: true, swiping: 'drag' });
    expect(commit.steps[commit.steps.length - 1], 'committed: exiting, never held').toMatchObject({
      phase: 'exiting',
      paused: false,
    });
    const back = await swipe(page, { id: 'b', moves: slowTo(60), end: 'up', endWait: 50 });
    // The pause has gone while the cosmetic snap-back still runs.
    expect(back.steps[back.steps.length - 1]).toMatchObject({
      phase: 'visible',
      paused: false,
      swiping: 'settle',
    });
    const cancel = await swipe(page, { id: 'c', moves: slowTo(60), end: 'cancel' });
    expect(cancel.steps[cancel.steps.length - 1]).toMatchObject({
      phase: 'visible',
      paused: false,
      swiping: 'settle',
    });
    await expectDismissals(page, [{ id: 'a', reason: 'swipe' }]);
    await expect(page.locator('.ret-toast.h-b')).not.toHaveAttribute('data-paused', /.*/);
    await expect(page.locator('.ret-toast.h-c')).not.toHaveAttribute('data-paused', /.*/);
  });

  test('a text selection in the toast prevents activation', async ({ page }) => {
    await openHarness(page);
    await showToasts(page, [{ id: 'a' }]);
    await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('.ret-toast.h-a .ret-toast__title')!);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    expect(await page.evaluate(() => getSelection()!.toString()), 'precondition').toContain(
      'Toast a'
    );
    expectNeverActivated(await swipe(page, { id: 'a', moves: slowTo(132), end: 'up' }));
    expect(await dismissals(page)).toEqual([]);
    // Control: with the selection gone, the same drag commits.
    await page.evaluate(() => getSelection()!.removeAllRanges());
    await swipe(page, { id: 'a', moves: slowTo(132), end: 'up', endWait: 50 });
    await expectDismissals(page, [{ id: 'a', reason: 'swipe' }]);
  });

  test('a custom toast swipes', async ({ page }) => {
    await openHarness(page);
    await showToasts(page, [{ id: 'a', custom: true }]);
    const result = await swipe(page, { id: 'a', moves: slowTo(132), end: 'up', endWait: 50 });
    expect(result.steps.some(step => step.swiping === 'drag')).toBe(true);
    await expectDismissals(page, [{ id: 'a', reason: 'swipe' }]);
  });

  test('RTL keeps the physical directions', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => {
      document.documentElement.dir = 'rtl';
    });
    expect(
      await page.evaluate(() => document.querySelector('.ret-toaster')!.matches(':dir(rtl)'))
    ).toBe(true);
    await showToasts(page, [
      { id: 'a', position: 'top-left' },
      { id: 'b', position: 'top-right' },
    ]);
    // Left stays left and right stays right: the inline direction changes nothing.
    expectNeverActivated(await swipe(page, { id: 'a', moves: slowTo(132), end: 'up' }));
    expectNeverActivated(await swipe(page, { id: 'b', moves: slowTo(-132), end: 'up' }));
    await swipe(page, { id: 'a', moves: slowTo(-132), end: 'up', endWait: 50 });
    await swipe(page, { id: 'b', moves: slowTo(132), end: 'up', endWait: 50 });
    await expectDismissals(page, [
      { id: 'a', reason: 'swipe' },
      { id: 'b', reason: 'swipe' },
    ]);
  });

  test('under reduced motion a swipe dismisses with no travel after release', async ({ page }) => {
    await openReducedMotionHarness(page);
    await showToasts(page, [{ id: 'a' }]);
    const result = await swipe(page, {
      id: 'a',
      moves: slowTo(132),
      end: 'up',
      endWait: 50,
      sampleUntil: 'removed',
    });
    const offset = offsetOf(result);
    expect(Math.abs(offset)).toBeGreaterThanOrEqual(thresholdFor(result.width));
    // The drag followed the pointer (direct manipulation stays).
    const dragging = result.steps.filter(step => step.swiping === 'drag');
    expect(dragging[dragging.length - 1]!.transformX).toBeCloseTo(offset, 0);
    for (const frame of result.frames.filter(frame => frame.connected)) {
      expect(frame.transformX, 'no travel past the release offset').toBeLessThanOrEqual(
        offset + 0.5
      );
    }
    await expectDismissals(page, [{ id: 'a', reason: 'swipe' }]);
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
  });
});

test('CF-29: a trusted mouse drag never activates, moves or dismisses', async ({ page }) => {
  await openHarness(page);
  await showToasts(page, [{ id: 'a', position: 'top-center' }]);
  const title = (await page.locator('.ret-toast.h-a .ret-toast__title').boundingBox())!;
  const start = { x: title.x + title.width / 2, y: title.y + title.height / 2 };
  const read = () =>
    page.evaluate(() => {
      const state = window.__retHarness!.toastState('a');
      return { swiping: state.swiping, transform: state.transform, phase: state.phase };
    });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let dx = 20; dx <= 200; dx += 20) {
    await page.mouse.move(start.x + dx, start.y);
    expect(await read(), `after ${dx} px`).toEqual({
      swiping: null,
      transform: 'none',
      phase: 'visible',
    });
  }
  await page.mouse.up();
  expect(await read()).toEqual({ swiping: null, transform: 'none', phase: 'visible' });
  expect(await dismissals(page)).toEqual([]);
});

test.describe('CF-36: a dismissal during the snap-back (synthetic pointer events)', () => {
  for (const after of [0, 50]) {
    test(`${after} ms into the snap-back, it keeps its reason and completes once`, async ({
      page,
    }) => {
      await openHarness(page);
      await showToasts(page, [{ id: 'a' }]);
      const result = await swipe(page, {
        id: 'a',
        moves: slowTo(92),
        end: 'up',
        endWait: 50,
        dismissAfter: after,
        sampleUntil: 'removed',
      });
      expect(Math.abs(offsetOf(result)), 'precondition: below the distance').toBeLessThan(
        thresholdFor(result.width)
      );
      expect(result.frames[0], 'precondition: springing back').toMatchObject({
        swiping: 'settle',
        phase: 'visible',
      });
      // From the first frame on (frame 0 is read in the release's own task, before the commit).
      for (const frame of result.frames.slice(1)) expect(frame.paused, 'never held').toBe(false);
      await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
      await expectDismissals(page, [{ id: 'a', reason: 'programmatic' }]);
      // Nothing stale: the same id shows again and swipes normally.
      await showToasts(page, [{ id: 'a' }]);
      await expect(page.locator('.ret-toast.h-a')).not.toHaveAttribute('data-swiping', /.*/);
      await swipe(page, { id: 'a', moves: slowTo(132), end: 'up', endWait: 50 });
      await expectDismissals(page, [
        { id: 'a', reason: 'programmatic' },
        { id: 'a', reason: 'swipe' },
      ]);
    });
  }
});
