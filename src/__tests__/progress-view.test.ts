// The timer's boundary facts in the render views (P-20 S1, decisions 1, 2 and 4). A view carries
// a toast's effective `duration`, its folded `remaining` and whether a pause reason `held` its
// finite countdown. These change only at run boundaries (a start, a stop, a new definition), never
// as a running timer counts down, so time passing notifies nobody. Store level, on fake timers.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attach,
  dismiss,
  entered,
  exited,
  getSnapshot,
  inspectRecords,
  setGlobalPause,
  setStackPause,
  setToastPause,
  settleOwned,
  subscribe,
  upsert,
} from '../store/store';
import type { ToastView } from '../store/types';
import type { ToastId, ToastOptions, ToastPosition, ToastType } from '../types';

function create(id: string, options?: ToastOptions, type: ToastType = 'default'): ToastId {
  const created = upsert({ type, custom: false, content: id, options: { id, ...options } });
  if (created === undefined) throw new Error('creation was rejected');
  return created;
}

function view(id: ToastId): ToastView | undefined {
  for (const list of Object.values(getSnapshot().byPosition)) {
    const found = list.find(candidate => candidate.id === id);
    if (found) return found;
  }
  return undefined;
}

/** The timer facts rendering sees. */
function facts(id: ToastId) {
  const shown = view(id);
  return (
    shown && {
      phase: shown.phase,
      duration: shown.duration,
      remaining: shown.remaining,
      held: shown.held,
    }
  );
}

const record = (id: ToastId) => inspectRecords().find(candidate => candidate.id === id);
const isRunning = (id: ToastId) => record(id)?.timer.runningSince != null;

function activateToaster() {
  const token = {};
  return { token, detach: attach(token) };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function showRunning(id: string, options?: ToastOptions): void {
  create(id, options);
  entered(id);
  expect(isRunning(id)).toBe(true);
}

/** Counts notifications from here on. */
function listen() {
  const listener = vi.fn();
  subscribe(listener);
  return listener;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('the view facts', () => {
  it('are the effective duration, the folded remaining and held; never the clock or reasons', () => {
    activateToaster();
    create('t');
    const shown = view('t') as ToastView;
    expect(facts('t')).toEqual({ phase: 'entering', duration: 5000, remaining: 5000, held: false });
    for (const internal of ['runningSince', 'pausedBy', 'timer', 'durationPending']) {
      expect(shown).not.toHaveProperty(internal);
    }
  });

  it('show the full duration until the timer first starts, and at its start', () => {
    activateToaster();
    create('t', { duration: 8000 });
    expect(facts('t')).toEqual({ phase: 'entering', duration: 8000, remaining: 8000, held: false });
    entered('t');
    expect(isRunning('t')).toBe(true);
    expect(facts('t')).toEqual({ phase: 'visible', duration: 8000, remaining: 8000, held: false });
  });
});

describe('time passing (decision 2)', () => {
  it('changes no view and notifies nobody while a timer runs', () => {
    activateToaster();
    showRunning('t');
    showRunning('u', { position: 'bottom-left', duration: 20000 });
    const snapshot = getSnapshot();
    const listener = listen();
    for (let step = 0; step < 49; step++) vi.advanceTimersByTime(100);
    expect(isRunning('t')).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    expect(getSnapshot()).toBe(snapshot);
    expect(facts('t')?.remaining).toBe(5000);
  });

  it('notifies at expiry, a lifecycle boundary, with nothing left', () => {
    activateToaster();
    showRunning('t');
    const listener = listen();
    vi.advanceTimersByTime(4999);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(facts('t')).toEqual({ phase: 'exiting', duration: 5000, remaining: 0, held: false });
  });
});

describe('pause and resume boundaries', () => {
  it('D-10 (store side): a pause folds the elapsed time, and resuming keeps it, never the full duration', () => {
    activateToaster();
    showRunning('t');
    const listener = listen();
    vi.advanceTimersByTime(2000);
    setGlobalPause('window-blur', true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(facts('t')).toEqual({ phase: 'visible', duration: 5000, remaining: 3000, held: true });

    vi.advanceTimersByTime(60_000);
    expect(listener).toHaveBeenCalledTimes(1);
    setGlobalPause('window-blur', false);
    expect(listener).toHaveBeenCalledTimes(2);
    // The resume boundary: the snapshot the next running segment starts from.
    expect(facts('t')).toEqual({ phase: 'visible', duration: 5000, remaining: 3000, held: false });
    expect(isRunning('t')).toBe(true);
  });

  it('exposes each boundary once over repeated cycles, and the total stays exact', () => {
    activateToaster();
    showRunning('t');
    const listener = listen();
    const seen: number[] = [];
    for (let round = 0; round < 4; round++) {
      vi.advanceTimersByTime(1000);
      setStackPause('top-right', true);
      seen.push(facts('t')?.remaining as number);
      vi.advanceTimersByTime(10_000);
      setStackPause('top-right', false);
    }
    expect(seen).toEqual([4000, 3000, 2000, 1000]);
    expect(listener).toHaveBeenCalledTimes(8);
    expect(facts('t')).toEqual({ phase: 'visible', duration: 5000, remaining: 1000, held: false });
  });

  it('holds while any reason applies, and changes nothing as reasons overlap', () => {
    activateToaster();
    showRunning('t');
    vi.advanceTimersByTime(1500);
    const listener = listen();
    setToastPause('t', 'focus-within', true);
    expect(listener).toHaveBeenCalledTimes(1);
    const held = view('t');
    expect(facts('t')).toEqual({ phase: 'visible', duration: 5000, remaining: 3500, held: true });

    // A + B, then B alone: still held, same remaining, same view, nobody notified.
    setStackPause('top-right', true);
    setGlobalPause('document-hidden', true);
    setToastPause('t', 'swipe', true);
    vi.advanceTimersByTime(5000);
    setToastPause('t', 'focus-within', false);
    setStackPause('top-right', false);
    setToastPause('t', 'swipe', false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(view('t')).toBe(held);

    // The last reason clears.
    setGlobalPause('document-hidden', false);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(facts('t')).toEqual({ phase: 'visible', duration: 5000, remaining: 3500, held: false });
  });
});

describe('pause scope', () => {
  function stacks() {
    activateToaster();
    showRunning('a');
    showRunning('b');
    showRunning('x', { position: 'bottom-left' });
    vi.advanceTimersByTime(1000);
  }

  it('focus within one toast changes only that view', () => {
    stacks();
    const before = getSnapshot();
    setToastPause('a', 'focus-within', true);
    expect(view('a')).not.toBe(before.byPosition['top-right'].find(v => v.id === 'a'));
    expect(view('b')).toBe(before.byPosition['top-right'].find(v => v.id === 'b'));
    expect(getSnapshot().byPosition['bottom-left']).toBe(before.byPosition['bottom-left']);
    expect([facts('a')?.held, facts('b')?.held, facts('x')?.held]).toEqual([true, false, false]);
  });

  it("hover changes only its own stack's views, and leaves other positions' lists alone", () => {
    stacks();
    const before = getSnapshot();
    setStackPause('top-right', true);
    expect([facts('a')?.held, facts('b')?.held, facts('x')?.held]).toEqual([true, true, false]);
    expect(getSnapshot().byPosition['bottom-left']).toBe(before.byPosition['bottom-left']);
    expect(view('x')).toBe(before.byPosition['bottom-left'][0]);
  });

  it('a global reason changes every finite view, and no persistent or loading view', () => {
    activateToaster();
    showRunning('finite');
    create('persistent', { duration: Infinity });
    create('loading', undefined, 'loading');
    entered('persistent');
    entered('loading');
    const persistent = view('persistent');
    const loading = view('loading');
    const listener = listen();
    setGlobalPause('window-blur', true);
    setGlobalPause('window-blur', false);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(view('persistent')).toBe(persistent);
    expect(view('loading')).toBe(loading);
    expect(facts('persistent')).toEqual({
      phase: 'visible',
      duration: Infinity,
      remaining: Infinity,
      held: false,
    });
  });

  it('never holds a persistent or loading toast, whatever its reasons', () => {
    activateToaster();
    create('persistent', { duration: Infinity });
    create('loading', undefined, 'loading');
    entered('persistent');
    entered('loading');
    const snapshot = getSnapshot();
    const listener = listen();
    setToastPause('persistent', 'focus-within', true);
    setToastPause('loading', 'focus-within', true);
    setStackPause('top-right', true);
    setGlobalPause('document-hidden', true);
    expect(listener).not.toHaveBeenCalled();
    expect(getSnapshot()).toBe(snapshot);
  });
});

describe('lifecycle (decision 4)', () => {
  it('holds an entering toast only for a reason, never for its phase, with nothing folded', () => {
    activateToaster();
    create('t');
    expect(facts('t')?.held).toBe(false);
    setStackPause('top-right', true);
    expect(facts('t')).toEqual({ phase: 'entering', duration: 5000, remaining: 5000, held: true });
    entered('t');
    expect(isRunning('t')).toBe(false);
    expect(facts('t')).toEqual({ phase: 'visible', duration: 5000, remaining: 5000, held: true });
    setStackPause('top-right', false);
    expect(isRunning('t')).toBe(true);
    expect(facts('t')).toEqual({ phase: 'visible', duration: 5000, remaining: 5000, held: false });
  });

  it('a non-timeout exit keeps the folded remaining, and its countdown is no longer held', () => {
    activateToaster();
    showRunning('t');
    vi.advanceTimersByTime(1500);
    setToastPause('t', 'focus-within', true);
    dismiss('t');
    expect(facts('t')).toEqual({ phase: 'exiting', duration: 5000, remaining: 3500, held: false });
    // An exiting toast's countdown is over: reasons change nothing rendered.
    const snapshot = getSnapshot();
    setStackPause('top-right', true);
    setToastPause('t', 'focus-within', false);
    setGlobalPause('window-blur', true);
    expect(getSnapshot()).toBe(snapshot);
  });

  it('a running toast dismissed without a pause folds what it ran', () => {
    activateToaster();
    showRunning('t');
    vi.advanceTimersByTime(1200);
    dismiss('t');
    expect(facts('t')).toEqual({ phase: 'exiting', duration: 5000, remaining: 3800, held: false });
  });

  it('a revival starts a fresh definition: full, and held only by a reason', () => {
    activateToaster();
    showRunning('t');
    vi.advanceTimersByTime(2000);
    dismiss('t');
    setStackPause('top-right', true);
    create('t', { duration: 9000 });
    expect(facts('t')).toEqual({ phase: 'entering', duration: 9000, remaining: 9000, held: true });
    expect(view('t')?.revision).toBe(1);
  });

  it('a replacement in place resets to the new duration at a new revision', () => {
    activateToaster();
    showRunning('t');
    vi.advanceTimersByTime(2500);
    setGlobalPause('window-blur', true);
    create('t', { duration: 7000 });
    expect(facts('t')).toEqual({ phase: 'visible', duration: 7000, remaining: 7000, held: true });
    setGlobalPause('window-blur', false);
    expect(isRunning('t')).toBe(true);
    expect(facts('t')).toEqual({ phase: 'visible', duration: 7000, remaining: 7000, held: false });
  });

  it('finite to persistent by replacement: no countdown, never held', () => {
    activateToaster();
    showRunning('t');
    setGlobalPause('window-blur', true);
    create('t', { duration: Infinity });
    expect(facts('t')).toEqual({
      phase: 'visible',
      duration: Infinity,
      remaining: Infinity,
      held: false,
    });
  });

  it('loading to finite by promise settlement: the finite countdown exists from then on', () => {
    activateToaster();
    const token = Symbol('promise');
    upsert({
      type: 'loading',
      custom: false,
      content: 'Saving',
      options: { id: 't' },
      promiseToken: token,
    });
    entered('t');
    setGlobalPause('window-blur', true);
    expect(facts('t')).toEqual({
      phase: 'visible',
      duration: Infinity,
      remaining: Infinity,
      held: false,
    });
    settleOwned('t', token, 'success', 'Saved');
    expect(facts('t')).toEqual({ phase: 'visible', duration: 5000, remaining: 5000, held: true });
  });

  it('a detached toast keeps its folded remaining in the queue and shows it when it returns', async () => {
    const first = activateToaster();
    showRunning('t');
    vi.advanceTimersByTime(2000);
    first.detach();
    await settle();
    expect(view('t')).toBeUndefined();
    expect(record('t')?.timer).toEqual({ duration: 5000, remaining: 3000, runningSince: null });

    // Not held by being queued or inactive: a lifecycle state, not a pause reason.
    activateToaster();
    expect(facts('t')).toEqual({ phase: 'entering', duration: 5000, remaining: 3000, held: false });
    entered('t');
    expect(isRunning('t')).toBe(true);
    expect(facts('t')).toEqual({ phase: 'visible', duration: 5000, remaining: 3000, held: false });
  });

  it('a promoted toast enters with its full duration, held only by a reason', () => {
    activateToaster();
    for (const id of ['a', 'b', 'c', 'd', 'e']) create(id);
    for (const id of ['a', 'b', 'c', 'd']) entered(id);
    expect(view('e')).toBeUndefined();
    vi.advanceTimersByTime(1000);
    setGlobalPause('document-hidden', true);
    dismiss('a');
    exited('a');
    expect(facts('e')).toEqual({ phase: 'entering', duration: 5000, remaining: 5000, held: true });
    expect(facts('b')).toEqual({ phase: 'visible', duration: 5000, remaining: 4000, held: true });
  });
});

describe('scope of a hovered position', () => {
  it.each<ToastPosition>(['top-left', 'bottom-center'])(
    'changes only the toasts at %s',
    position => {
      activateToaster();
      showRunning('here', { position });
      showRunning('there', { position: 'top-right' });
      const there = view('there');
      setStackPause(position, true);
      expect(facts('here')?.held).toBe(true);
      expect(view('there')).toBe(there);
    }
  );
});
