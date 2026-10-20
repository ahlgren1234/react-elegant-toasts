import { expect, test } from '@playwright/test';
import { expectContinuousTransition, type TransitionFrame } from './harness';

// Issue #65: `expectContinuousTransition` on fabricated evidence, with no page. A snap-back from
// X 45 to 0 over 200 ms; a frame is `[x, progress]` of the transition `t`.

const transition = { id: 't', duration: 200, easing: 'linear', startX: 45, endX: 0 };
const frame = (x: number, progress: number | null = null, id: string | null = 't') => ({
  x,
  transition: progress === null ? null : id,
  progress,
});
const smooth: TransitionFrame[] = [
  frame(45, 0),
  frame(36, 0.2),
  frame(18, 0.6),
  frame(4.5, 0.9),
  frame(0),
];
const evidence = {
  fromX: 45,
  toX: 0,
  duration: 200,
  started: transition,
  outcome: 'finished' as const,
  frames: smooth,
};
const check = (overrides: Partial<Parameters<typeof expectContinuousTransition>[0]>) =>
  expectContinuousTransition({ ...evidence, ...overrides }, 'X back to rest');

test.describe('expectContinuousTransition (Issue #65)', () => {
  test('an interpolated move with frames inside it passes on the frames', () => {
    expect(check({})).toBe('interpolated');
  });

  test('a jump while frames were delivered fails', () => {
    // A frame at progress 0.5 still shows the start, the next shows the end.
    expect(() => check({ frames: [frame(45, 0.5), frame(0)] })).toThrow(
      /passes through intermediate values/
    );
  });

  test('frame starvation with valid evidence passes, and says so', () => {
    expect(check({ frames: [frame(0)] })).toBe('frame-starvation');
  });

  test('a frame only where the transition is within tolerance of an end counts as no frame', () => {
    expect(check({ frames: [frame(45, 0.005), frame(0.2, 0.996), frame(0)] })).toBe(
      'frame-starvation'
    );
  });

  test('no transition at the boundary fails', () => {
    expect(() => check({ started: undefined, frames: [frame(0)] })).toThrow(
      /a transform transition starts at the boundary/
    );
  });

  test('a transition from another X fails, with or without frames', () => {
    const started = { ...transition, startX: 0 };
    expect(() => check({ started, frames: [frame(0)] })).toThrow(/starts at the X before/);
    expect(() => check({ started })).toThrow(/starts at the X before/);
  });

  test('a start within the allowance passes, and the default allowance is half a pixel', () => {
    const started = { ...transition, startX: 43 };
    expect(check({ started, frames: [frame(0)], startTolerance: 3 })).toBe('frame-starvation');
    expect(() => check({ started, frames: [frame(0)] })).toThrow(/starts at the X before/);
  });

  test('a transition to another X fails', () => {
    expect(() => check({ started: { ...transition, endX: 10 }, frames: [frame(0)] })).toThrow(
      /ends at the target X/
    );
  });

  test('a zero or wrong duration fails', () => {
    for (const duration of [0, 100, Number.NaN]) {
      expect(() => check({ started: { ...transition, duration }, frames: [frame(0)] })).toThrow(
        /the transition's duration/
      );
    }
  });

  test('a cancelled or unsettled transition fails', () => {
    for (const outcome of ['cancelled', undefined] as const) {
      expect(() => check({ outcome, frames: [frame(0)] })).toThrow(/the transition finished/);
    }
  });

  test('another transition taking over fails', () => {
    expect(() => check({ frames: [frame(30, 0.4, 'other'), frame(0)] })).toThrow(
      /no other transition takes over/
    );
  });

  test('a reversal fails', () => {
    expect(() => check({ frames: [frame(30, 0.4), frame(38, 0.5), frame(0)] })).toThrow(
      /never reverses/
    );
  });

  test('frames that end away from the target fail', () => {
    expect(() => check({ frames: [frame(30, 0.4), frame(5)] })).toThrow(/at rest at the target X/);
  });
});
