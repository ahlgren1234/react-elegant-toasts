import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attach,
  entered,
  exited,
  getSnapshot,
  inspectRecords,
  setGlobalPause,
  setStackPause,
  setToastPause,
  subscribe,
  upsert,
} from '../store/store';
import type { ToastId, ToastOptions, ToastPosition } from '../types';

function create(id: string, options?: ToastOptions): ToastId {
  const created = upsert({
    type: 'default',
    custom: false,
    content: id,
    options: { id, ...options },
  });
  if (created === undefined) throw new Error('creation was rejected');
  return created;
}

function record(id: ToastId) {
  return inspectRecords().find(candidate => candidate.id === id);
}

const phaseOf = (id: ToastId) => record(id)?.phase;
const timerOf = (id: ToastId) => record(id)?.timer;
const isRunning = (id: ToastId) => timerOf(id)?.runningSince !== null;

/** Attaches a Toaster directly through the store, without React. */
function activateToaster() {
  const token = {};
  return { token, detach: attach(token) };
}

/** Lets queued microtasks, such as a deferred Toaster detach, run. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** Creates a toast and makes it visible, so its timer runs. */
function showRunning(id: string, options?: ToastOptions): void {
  create(id, options);
  entered(id);
  expect(isRunning(id)).toBe(true);
}

// Each of the four public pause reasons, applied to toast `t` at `top-right` (§10).
type Reason = 'hover' | 'focus-within' | 'window-blur' | 'document-hidden';
const REASONS: readonly Reason[] = ['hover', 'focus-within', 'window-blur', 'document-hidden'];

function setReason(reason: Reason | 'swipe', on: boolean, id = 't'): void {
  if (reason === 'hover') setStackPause('top-right', on);
  else if (reason === 'focus-within' || reason === 'swipe') setToastPause(id, reason, on);
  else setGlobalPause(reason, on);
}

const PAIRS = REASONS.flatMap((first, index) =>
  REASONS.slice(index + 1).map(second => [first, second] as const)
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('remaining time (§10)', () => {
  it('AC-TM-1, D-08: a 5000 ms toast paused at 2000 ms resumes with 3000 ms left', () => {
    activateToaster();
    showRunning('t');
    vi.advanceTimersByTime(2000);
    setGlobalPause('window-blur', true);
    expect(timerOf('t')).toEqual({ duration: 5000, remaining: 3000, runningSince: null });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 ** 6);
    expect(phaseOf('t')).toBe('visible');

    setGlobalPause('window-blur', false);
    expect(timerOf('t')).toEqual({
      duration: 5000,
      remaining: 3000,
      runningSince: performance.now(),
    });
    vi.advanceTimersByTime(2999);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
  });

  it('accumulates elapsed time over several pauses', () => {
    activateToaster();
    showRunning('t');
    for (let round = 0; round < 4; round++) {
      vi.advanceTimersByTime(1000);
      setStackPause('top-right', true);
      vi.advanceTimersByTime(10 ** 5);
      setStackPause('top-right', false);
    }
    expect(timerOf('t')?.remaining).toBe(1000);
    vi.advanceTimersByTime(999);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
  });

  it('measures elapsed time with performance.now(), not the wall clock', () => {
    activateToaster();
    showRunning('t');
    vi.advanceTimersByTime(2000);
    vi.setSystemTime(Date.now() + 3_600_000);
    setGlobalPause('document-hidden', true);
    expect(timerOf('t')?.remaining).toBe(3000);
  });
});

describe('combined pause reasons (§10)', () => {
  it.each(PAIRS)(
    'AC-TM-2, D-07: %s and %s combine; clearing either one alone does not resume',
    (first, second) => {
      activateToaster();
      for (const [clearFirst, clearLast] of [
        [first, second],
        [second, first],
      ] as const) {
        showRunning('t');
        vi.advanceTimersByTime(1000);
        setReason(first, true);
        setReason(second, true);
        expect(isRunning('t')).toBe(false);
        expect(timerOf('t')?.remaining).toBe(4000);

        setReason(clearFirst, false);
        expect(isRunning('t')).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(10 ** 6);
        expect(timerOf('t')?.remaining).toBe(4000);

        setReason(clearLast, false);
        expect(isRunning('t')).toBe(true);
        vi.advanceTimersByTime(4000);
        expect(phaseOf('t')).toBe('exiting');
        exited('t');
      }
    }
  );

  it('resumes only after the last of three simultaneous reasons clears', () => {
    activateToaster();
    showRunning('t');
    vi.advanceTimersByTime(1500);
    setReason('hover', true);
    setReason('focus-within', true);
    setReason('document-hidden', true);
    expect(timerOf('t')?.remaining).toBe(3500);

    for (const reason of ['focus-within', 'hover'] as const) {
      setReason(reason, false);
      vi.advanceTimersByTime(10 ** 6);
      expect(isRunning('t')).toBe(false);
      expect(timerOf('t')?.remaining).toBe(3500);
    }

    setReason('document-hidden', false);
    expect(isRunning('t')).toBe(true);
    vi.advanceTimersByTime(3499);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
  });

  it('combines the internal swipe reason with two others', () => {
    activateToaster();
    showRunning('t');
    vi.advanceTimersByTime(1000);
    setReason('swipe', true);
    setReason('window-blur', true);
    setReason('hover', true);

    for (const reason of ['window-blur', 'swipe'] as const) {
      setReason(reason, false);
      vi.advanceTimersByTime(10 ** 6);
      expect(isRunning('t')).toBe(false);
    }
    setReason('hover', false);
    expect(isRunning('t')).toBe(true);
    expect(timerOf('t')?.remaining).toBe(4000);
  });

  it('combines focus-within and swipe on the same toast', () => {
    activateToaster();
    for (const [clearFirst, clearLast] of [
      ['focus-within', 'swipe'],
      ['swipe', 'focus-within'],
    ] as const) {
      showRunning('t');
      setReason('focus-within', true);
      setReason('swipe', true);
      setReason(clearFirst, false);
      expect(record('t')?.pausedBy).toEqual([clearLast]);
      expect(isRunning('t')).toBe(false);
      setReason(clearLast, false);
      expect(isRunning('t')).toBe(true);
    }
  });

  it('D-09 (store side): clearing a global pause does not resume a hovered stack', () => {
    activateToaster();
    showRunning('t');
    setStackPause('top-right', true);
    setGlobalPause('window-blur', true);
    setGlobalPause('window-blur', false);
    expect(isRunning('t')).toBe(false);
    setStackPause('top-right', false);
    expect(isRunning('t')).toBe(true);
  });

  it('treats reasons as sets: setting one twice and clearing it once clears it', () => {
    activateToaster();
    showRunning('t');
    for (const reason of [...REASONS, 'swipe'] as const) {
      setReason(reason, true);
      setReason(reason, true);
      expect(isRunning('t')).toBe(false);
      setReason(reason, false);
      expect(isRunning('t')).toBe(true);
    }
    expect(record('t')?.pausedBy).toEqual([]);
    setReason('focus-within', false);
    setGlobalPause('document-hidden', false);
    expect(isRunning('t')).toBe(true);
  });
});

describe('pause scope (§10)', () => {
  it('hover pauses every toast at its position and none elsewhere', () => {
    activateToaster();
    showRunning('a');
    showRunning('b');
    showRunning('elsewhere', { position: 'bottom-left' });
    setStackPause('top-right', true);
    expect([isRunning('a'), isRunning('b'), isRunning('elsewhere')]).toEqual([false, false, true]);
    vi.advanceTimersByTime(5000);
    expect([phaseOf('a'), phaseOf('b'), phaseOf('elsewhere')]).toEqual([
      'visible',
      'visible',
      'exiting',
    ]);
  });

  it('focus-within pauses only its own toast', () => {
    activateToaster();
    showRunning('a');
    showRunning('b');
    setToastPause('a', 'focus-within', true);
    expect(record('a')?.pausedBy).toEqual(['focus-within']);
    expect([isRunning('a'), isRunning('b')]).toEqual([false, true]);
    vi.advanceTimersByTime(5000);
    expect([phaseOf('a'), phaseOf('b')]).toEqual(['visible', 'exiting']);
  });

  it('a global reason pauses every position', () => {
    activateToaster();
    const positions: ToastPosition[] = ['top-left', 'bottom-right'];
    for (const position of positions) showRunning(position, { position });
    setGlobalPause('document-hidden', true);
    expect(positions.map(isRunning)).toEqual([false, false]);
  });

  it('applies hover at the destination position after a relocation', () => {
    activateToaster();
    showRunning('t');
    setStackPause('bottom-left', true);
    create('t', { position: 'bottom-left' });
    exited('t');
    expect(record('t')).toMatchObject({ phase: 'entering', position: 'bottom-left' });
    entered('t');
    expect(isRunning('t')).toBe(false);

    setStackPause('top-right', true);
    setStackPause('top-right', false);
    expect(isRunning('t')).toBe(false);
    setStackPause('bottom-left', false);
    expect(isRunning('t')).toBe(true);
  });
});

describe('pause state across the lifecycle', () => {
  it('keeps a toast paused before it is visible from starting at entered()', () => {
    activateToaster();
    create('t');
    setToastPause('t', 'focus-within', true);
    entered('t');
    expect(timerOf('t')).toEqual({ duration: 5000, remaining: 5000, runningSince: null });
    setToastPause('t', 'focus-within', false);
    expect(isRunning('t')).toBe(true);
  });

  it('applies a global reason set before any Toaster attaches', () => {
    setGlobalPause('window-blur', true);
    create('t');
    activateToaster();
    entered('t');
    expect(isRunning('t')).toBe(false);
    setGlobalPause('window-blur', false);
    expect(isRunning('t')).toBe(true);
  });

  it('AC-TM-4: a replacement keeps active pause reasons, so a paused toast stays paused', () => {
    activateToaster();
    showRunning('t');
    vi.advanceTimersByTime(1000);
    setToastPause('t', 'focus-within', true);
    create('t', { duration: 2000 });
    expect(record('t')).toMatchObject({
      phase: 'visible',
      pausedBy: ['focus-within'],
      timer: { duration: 2000, remaining: 2000, runningSince: null },
    });
    vi.advanceTimersByTime(10 ** 6);
    setToastPause('t', 'focus-within', false);
    vi.advanceTimersByTime(1999);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
  });

  it('keeps the remaining time of a paused toast when the Toaster detaches', async () => {
    const { detach } = activateToaster();
    showRunning('t');
    vi.advanceTimersByTime(2000);
    setGlobalPause('window-blur', true);
    detach();
    await settle();
    expect(timerOf('t')).toEqual({ duration: 5000, remaining: 3000, runningSince: null });
  });

  it('clears hover, focus-within and swipe on detach', async () => {
    const { detach } = activateToaster();
    showRunning('t');
    setStackPause('top-right', true);
    setToastPause('t', 'focus-within', true);
    setToastPause('t', 'swipe', true);
    detach();
    await settle();
    expect(record('t')?.pausedBy).toEqual([]);

    activateToaster();
    entered('t');
    expect(isRunning('t')).toBe(true);
  });

  it('keeps window-blur and document-hidden on detach', async () => {
    const { detach } = activateToaster();
    showRunning('t');
    setGlobalPause('window-blur', true);
    setGlobalPause('document-hidden', true);
    detach();
    await settle();

    activateToaster();
    entered('t');
    expect(isRunning('t')).toBe(false);
    setGlobalPause('window-blur', false);
    expect(isRunning('t')).toBe(false);
    setGlobalPause('document-hidden', false);
    expect(isRunning('t')).toBe(true);
  });
});

describe('pause commands', () => {
  it('notify nobody and keep the snapshot and its views by identity', () => {
    activateToaster();
    showRunning('t');
    showRunning('other', { position: 'bottom-left' });
    const before = getSnapshot();
    const listener = vi.fn();
    subscribe(listener);

    vi.advanceTimersByTime(1000);
    setGlobalPause('window-blur', true);
    setStackPause('top-right', true);
    setToastPause('t', 'focus-within', true);
    setToastPause('t', 'swipe', true);
    setToastPause('t', 'swipe', false);
    setToastPause('t', 'focus-within', false);
    setStackPause('top-right', false);
    setGlobalPause('window-blur', false);

    expect(listener).not.toHaveBeenCalled();
    expect(getSnapshot()).toBe(before);
    expect(getSnapshot().byPosition['top-right'][0]).toBe(before.byPosition['top-right'][0]);
  });

  it('ignores hover and toast reasons while no Toaster is active, and unknown IDs', () => {
    create('t');
    setStackPause('top-right', true);
    setToastPause('t', 'focus-within', true);
    expect(record('t')?.pausedBy).toEqual([]);

    activateToaster();
    setToastPause('unknown', 'focus-within', true);
    expect(inspectRecords().map(candidate => candidate.id)).toEqual(['t']);
    entered('t');
    expect(isRunning('t')).toBe(true);
  });

  it('do nothing on the server', () => {
    activateToaster();
    showRunning('t');
    vi.stubGlobal('window', undefined);
    setGlobalPause('window-blur', true);
    setStackPause('top-right', true);
    setToastPause('t', 'focus-within', true);
    vi.unstubAllGlobals();
    expect(isRunning('t')).toBe(true);
    expect(record('t')?.pausedBy).toEqual([]);
  });
});
