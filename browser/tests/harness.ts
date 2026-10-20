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

/**
 * Opens a fresh harness page, in the page `scenario` when given (`?scenario=`), and waits until the
 * stylesheet has loaded and the Toaster is mounted.
 */
export async function openHarness(page: Page, scenario?: 'long-page'): Promise<void> {
  await page.goto(scenario ? `/?scenario=${scenario}` : '/');
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

/**
 * A `transform` CSS transition as the Web Animations API describes it (Issue #65): its identity
 * (the `id` a spec gives it), its computed duration in ms and timing function, and the X of its
 * keyframes at offsets 0 and 1. Read in the task that starts it, so the values are the engine's
 * own and need no frame.
 */
export interface TransitionEvidence {
  readonly id: string;
  readonly duration: number;
  readonly easing: string;
  readonly startX: number;
  readonly endX: number;
}

/**
 * A frame sample during a transition: X, and the transition running on the element then, by
 * `id`, with its eased progress (`getComputedTiming().progress`), or null when none runs.
 */
export interface TransitionFrame {
  readonly x: number;
  readonly transition: string | null;
  readonly progress: number | null;
}

/** What a transition's `finished` promise settled to, if it settled. */
export type TransitionOutcome = 'finished' | 'cancelled' | undefined;

/**
 * Checks that X moves continuously from `fromX` to `toX` through one transform transition, with
 * or without intermediate frames (Issue #65). The evidence is judged on every run:
 * - a transition started at the boundary: its absence means a jump;
 * - its duration is `duration` ms, so a zero or wrong duration fails;
 * - its first keyframe is at `fromX`, the X just before the boundary, so the motion starts where
 *   the element was; its last keyframe is at `toX`;
 * - it finished, never cancelled or left running, and no other transition took over in a frame;
 * - `frames`, the samples from the boundary on, end at `toX` and never reverse.
 * A CSS transition interpolates between its own keyframes, so these leave no place for a jump.
 * The frames are then judged as well: when at least one frame falls where the transition's own
 * progress puts X strictly between its ends, `expectInterpolatedMove` must pass on `path`, as before.
 * When none does, the browser delivered no frame inside the motion (frame starvation, #40 and
 * #65): the evidence above stands alone, and the result says so, for the caller to annotate.
 */
export function expectContinuousTransition(
  {
    fromX,
    toX,
    duration,
    started,
    outcome,
    frames,
    path = [fromX, ...frames.map(frame => frame.x)],
    startTolerance,
  }: {
    readonly fromX: number;
    readonly toX: number;
    readonly duration: number;
    readonly started: TransitionEvidence | undefined;
    readonly outcome: TransitionOutcome;
    readonly frames: readonly TransitionFrame[];
    /** The series `expectInterpolatedMove` judges: by default `fromX`, then the frames. */
    readonly path?: readonly number[];
    /**
     * How far the first keyframe may be from `fromX`: by default `tolerance`. Only an engine that
     * advances animation time within a task needs more, bounded by the motion it explains.
     */
    readonly startTolerance?: number;
  },
  what: string,
  tolerance: number = PX
): 'interpolated' | 'frame-starvation' {
  expect(started, `${what}: a transform transition starts at the boundary`).toBeDefined();
  const transition = started!;
  expect(transition.duration, `${what}: the transition's duration`).toBeCloseTo(duration, 1);
  expect(
    Math.abs(transition.startX - fromX),
    `${what}: the transition starts at the X before the boundary (${transition.startX} against ${fromX})`
  ).toBeLessThanOrEqual(startTolerance ?? tolerance);
  expect(
    Math.abs(transition.endX - toX),
    `${what}: the transition ends at the target X (${transition.endX} against ${toX})`
  ).toBeLessThanOrEqual(tolerance);
  expect(outcome, `${what}: the transition finished`).toBe('finished');
  const others = frames.filter(
    frame => frame.transition !== null && frame.transition !== transition.id
  );
  expect(others.length, `${what}: no other transition takes over`).toBe(0);
  const last = frames[frames.length - 1];
  expect(last, `${what}: frames sampled`).toBeDefined();
  expect(Math.abs(last!.x - toX), `${what}: at rest at the target X`).toBeLessThanOrEqual(
    tolerance
  );
  const direction = Math.sign(toX - fromX);
  expect(direction, `${what} moves`).not.toBe(0);
  frames.forEach((frame, index) => {
    const previous = index === 0 ? fromX : frames[index - 1]!.x;
    expect(
      (frame.x - previous) * direction,
      `${what} never reverses (sample ${index})`
    ).toBeGreaterThan(-tolerance);
  });
  const inside = frames.filter(frame => {
    if (frame.transition !== transition.id || frame.progress === null) return false;
    const expected = transition.startX + (transition.endX - transition.startX) * frame.progress;
    return (
      (expected - transition.startX) * direction > tolerance &&
      (transition.endX - expected) * direction > tolerance
    );
  });
  if (inside.length === 0) return 'frame-starvation';
  expectInterpolatedMove(path, what, tolerance);
  return 'interpolated';
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
