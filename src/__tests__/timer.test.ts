import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attach,
  dismiss,
  entered,
  exited,
  getSnapshot,
  inspectRecords,
  resetStore,
  subscribe,
  upsert,
} from '../store/store';
import type { ToastInput } from '../store/types';
import type { ToastId, ToastOptions, ToastPosition, ToastType } from '../types';

// The longest delay setTimeout honours; anything longer must not fire early.
const MAX_DELAY = 2_147_483_647;

function create(id: string, options?: ToastOptions, type: ToastType = 'default'): ToastId {
  const input: ToastInput = {
    type,
    custom: type === 'custom',
    content: id,
    options: { id, ...options },
  };
  const created = upsert(input);
  if (created === undefined) throw new Error('creation was rejected');
  return created;
}

function record(id: ToastId) {
  return inspectRecords().find(candidate => candidate.id === id);
}

const phaseOf = (id: ToastId) => record(id)?.phase;
const timerOf = (id: ToastId) => record(id)?.timer;

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

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('duration (§10)', () => {
  it('AC-TM-5: lasts 5000 ms by default', () => {
    activateToaster();
    create('t');
    entered('t');
    expect(timerOf('t')).toMatchObject({ duration: 5000, remaining: 5000 });
    vi.advanceTimersByTime(4999);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(record('t')).toMatchObject({ phase: 'exiting', exit: { reason: 'timeout' } });
  });

  it('uses an explicit per-toast duration', () => {
    activateToaster();
    create('t', { duration: 3000 });
    entered('t');
    vi.advanceTimersByTime(2999);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
  });

  it('AC-TM-3: never closes a toast with duration Infinity, and schedules no timeout for it', () => {
    activateToaster();
    create('t', { duration: Infinity });
    entered('t');
    expect(timerOf('t')).toEqual({ duration: Infinity, remaining: Infinity, runningSince: null });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 ** 9);
    expect(phaseOf('t')).toBe('visible');
  });

  it('AC-TM-3: keeps loading toasts persistent, even with a finite duration', () => {
    activateToaster();
    create('t', { duration: 3000 }, 'loading');
    entered('t');
    expect(timerOf('t')?.duration).toBe(Infinity);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 ** 9);
    expect(phaseOf('t')).toBe('visible');
  });

  it('treats a duration of 0 or less as 0: expires on the next timer tick, never at once', () => {
    activateToaster();
    create('zero', { duration: 0 });
    create('negative', { duration: -5 });
    entered('zero');
    entered('negative');
    expect(timerOf('zero')?.duration).toBe(0);
    expect(timerOf('negative')?.duration).toBe(0);
    expect(phaseOf('zero')).toBe('visible');
    expect(phaseOf('negative')).toBe('visible');
    vi.advanceTimersByTime(0);
    expect(phaseOf('zero')).toBe('exiting');
    expect(phaseOf('negative')).toBe('exiting');
  });

  it('falls back to the default for durations that are not numbers or are not finite', () => {
    activateToaster();
    create('nan', { duration: NaN });
    create('minus-infinity', { duration: -Infinity });
    create('string', { duration: '3000' as unknown as number });
    for (const id of ['nan', 'minus-infinity', 'string']) {
      expect(timerOf(id)?.duration).toBe(5000);
    }
  });

  it('keeps very large finite durations instead of letting the timeout overflow', () => {
    activateToaster();
    const duration = MAX_DELAY * 2 + 1000;
    create('t', { duration });
    entered('t');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(MAX_DELAY);
    expect(phaseOf('t')).toBe('visible');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(duration - MAX_DELAY - 2);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
  });

  it('keeps the remaining time of a long timer when it is suspended between chunks', async () => {
    const { detach } = activateToaster();
    create('t', { duration: MAX_DELAY + 5000 });
    entered('t');
    vi.advanceTimersByTime(MAX_DELAY + 1000);
    detach();
    await settle();
    expect(timerOf('t')).toMatchObject({ remaining: 4000, runningSince: null });
  });
});

describe('when the timer runs (§9 rule 5)', () => {
  it('does not count down while queued without a Toaster', () => {
    create('t');
    vi.advanceTimersByTime(10 ** 6);
    expect(timerOf('t')).toEqual({ duration: 5000, remaining: 5000, runningSince: null });
    activateToaster();
    entered('t');
    vi.advanceTimersByTime(4999);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
  });

  it('does not count down while queued behind a full position', () => {
    activateToaster();
    for (const id of ['a', 'b', 'c', 'd']) {
      create(id, { duration: Infinity });
      entered(id);
    }
    create('waiting');
    vi.advanceTimersByTime(10 ** 6);
    expect(timerOf('waiting')).toMatchObject({ remaining: 5000, runningSince: null });
    dismiss('a');
    exited('a');
    expect(phaseOf('waiting')).toBe('entering');
    entered('waiting');
    vi.advanceTimersByTime(4999);
    expect(phaseOf('waiting')).toBe('visible');
  });

  it('does not start on promotion, nor count down while entering', () => {
    activateToaster();
    create('t');
    expect(phaseOf('t')).toBe('entering');
    vi.advanceTimersByTime(10 ** 6);
    expect(timerOf('t')).toEqual({ duration: 5000, remaining: 5000, runningSince: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts with the full duration when entered() makes the toast visible', () => {
    activateToaster();
    create('t');
    vi.advanceTimersByTime(1234);
    entered('t');
    expect(timerOf('t')).toEqual({
      duration: 5000,
      remaining: 5000,
      runningSince: performance.now(),
    });
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe('timeout', () => {
  it('moves a visible toast to exiting with reason timeout and nothing remaining', () => {
    activateToaster();
    create('t');
    entered('t');
    vi.advanceTimersByTime(5000);
    expect(record('t')).toMatchObject({
      phase: 'exiting',
      exit: { reason: 'timeout' },
      timer: { duration: 5000, remaining: 0, runningSince: null },
    });
    expect(getSnapshot().byPosition['top-right'].map(view => view.phase)).toEqual(['exiting']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the slot until exited(), then removes and promotes FIFO in one notification', () => {
    activateToaster();
    for (const id of ['t1', 't2', 't3', 't4', 't5', 't6']) create(id);
    for (const id of ['t1', 't2', 't3', 't4']) entered(id);
    vi.advanceTimersByTime(5000);
    expect(['t1', 't2', 't3', 't4'].map(phaseOf)).toEqual([
      'exiting',
      'exiting',
      'exiting',
      'exiting',
    ]);
    expect(phaseOf('t5')).toBe('queued');

    const listener = vi.fn();
    subscribe(listener);
    exited('t1');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(record('t1')).toBeUndefined();
    expect(phaseOf('t5')).toBe('entering');
    expect(phaseOf('t6')).toBe('queued');
  });

  it('never times out a toast that was dismissed first', () => {
    activateToaster();
    const onAutoClose = vi.fn();
    const onDismiss = vi.fn();
    create('t', { onAutoClose, onDismiss });
    entered('t');
    vi.advanceTimersByTime(4000);
    dismiss('t');
    vi.advanceTimersByTime(10 ** 6);
    expect(record('t')?.exit).toEqual({ reason: 'programmatic' });
    exited('t');
    expect(onAutoClose).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledWith(expect.anything(), 'programmatic');
  });
});

describe('callbacks (§16)', () => {
  it('AC-CB-1: fires onAutoClose once for a timeout, with the toast snapshot', () => {
    activateToaster();
    const onAutoClose = vi.fn();
    create('t', { description: 'Details', onAutoClose });
    entered('t');
    vi.advanceTimersByTime(5000);
    expect(onAutoClose).toHaveBeenCalledTimes(1);
    expect(onAutoClose).toHaveBeenCalledWith({
      id: 't',
      type: 'default',
      content: 't',
      description: 'Details',
    });
    expect(Object.isFrozen(onAutoClose.mock.calls[0]?.[0])).toBe(true);
    vi.advanceTimersByTime(10 ** 6);
    exited('t');
    expect(onAutoClose).toHaveBeenCalledTimes(1);
  });

  it('D-06, AC-CB-3: onAutoClose follows the notified exit, and onDismiss waits for removal', () => {
    activateToaster();
    const log: string[] = [];
    create('t', {
      onAutoClose: () => log.push(`auto-close while ${phaseOf('t')}`),
      onDismiss: (_toast, reason) => log.push(`dismiss: ${reason}`),
    });
    entered('t');
    subscribe(() => log.push(`notify: ${getSnapshot().byPosition['top-right'][0]?.phase}`));
    vi.advanceTimersByTime(5000);
    expect(log).toEqual(['notify: exiting', 'auto-close while exiting']);
    exited('t');
    expect(log).toEqual([
      'notify: exiting',
      'auto-close while exiting',
      'notify: undefined',
      'dismiss: timeout',
    ]);
  });

  it('runs the latest onAutoClose after a replacement', () => {
    activateToaster();
    const first = vi.fn();
    const second = vi.fn();
    create('t', { onAutoClose: first });
    entered('t');
    create('t', { onAutoClose: second });
    vi.advanceTimersByTime(5000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('AC-CB-4: isolates a throwing onAutoClose; the exit and later onDismiss still happen', () => {
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    activateToaster();
    const failure = new Error('auto-close failed');
    const other = vi.fn();
    const onDismiss = vi.fn();
    create('a', {
      onAutoClose: () => {
        throw failure;
      },
      onDismiss,
    });
    create('b', { onAutoClose: other });
    entered('a');
    entered('b');
    vi.advanceTimersByTime(5000);
    expect(reportError).toHaveBeenCalledWith(failure);
    expect(other).toHaveBeenCalledTimes(1);
    expect(phaseOf('a')).toBe('exiting');
    exited('a');
    expect(onDismiss).toHaveBeenCalledWith(expect.anything(), 'timeout');
    expect(upsert({ type: 'default', custom: false, content: 'ok', options: undefined })).toEqual(
      expect.any(String)
    );
  });

  it('revives the toast without onDismiss when onAutoClose replaces it', () => {
    activateToaster();
    const onDismiss = vi.fn();
    create('t', {
      onDismiss,
      onAutoClose: () => {
        create('t', { duration: 2000, onDismiss });
      },
    });
    entered('t');
    vi.advanceTimersByTime(5000);
    expect(record('t')).toMatchObject({
      phase: 'entering',
      exit: undefined,
      revision: 1,
      timer: { duration: 2000, remaining: 2000, runningSince: null },
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('keeps onAutoClose before onDismiss when onAutoClose reports the exit itself', () => {
    activateToaster();
    const log: string[] = [];
    create('t', {
      onAutoClose: () => {
        log.push('auto-close');
        exited('t');
        log.push('exited reported');
      },
      onDismiss: (_toast, reason) => log.push(`dismiss: ${reason}`),
    });
    entered('t');
    vi.advanceTimersByTime(5000);
    expect(log).toEqual(['auto-close', 'exited reported', 'dismiss: timeout']);
    expect(record('t')).toBeUndefined();
  });

  it('fires onAutoClose again when a revived toast genuinely times out again', () => {
    activateToaster();
    const onAutoClose = vi.fn();
    const onDismiss = vi.fn();
    create('t', { onAutoClose, onDismiss });
    entered('t');
    vi.advanceTimersByTime(5000);
    expect(onAutoClose).toHaveBeenCalledTimes(1);

    create('t', { onAutoClose, onDismiss });
    expect(phaseOf('t')).toBe('entering');
    expect(onAutoClose).toHaveBeenCalledTimes(1);
    entered('t');
    vi.advanceTimersByTime(5000);
    expect(onAutoClose).toHaveBeenCalledTimes(2);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('replacement (§10, §14)', () => {
  it('AC-TM-4: restarts a visible toast at once with the new duration', () => {
    activateToaster();
    create('t');
    entered('t');
    vi.advanceTimersByTime(3000);
    create('t', { duration: 4000 });
    expect(record('t')).toMatchObject({
      phase: 'visible',
      timer: { duration: 4000, remaining: 4000, runningSince: performance.now() },
    });
    vi.advanceTimersByTime(3999);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
  });

  it('never lets the old timeout expire the replacement', () => {
    activateToaster();
    const onAutoClose = vi.fn();
    create('t', { onAutoClose });
    entered('t');
    vi.advanceTimersByTime(4999);
    create('t', { onAutoClose });
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('visible');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(4998);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
    expect(onAutoClose).toHaveBeenCalledTimes(1);
  });

  it('stops the timer when a finite toast is replaced with a persistent one', () => {
    activateToaster();
    create('t');
    entered('t');
    vi.advanceTimersByTime(2000);
    create('t', { duration: Infinity });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 ** 9);
    expect(phaseOf('t')).toBe('visible');
  });

  it('starts the timer when a persistent toast is replaced with a finite one', () => {
    activateToaster();
    create('t', {}, 'loading');
    entered('t');
    vi.advanceTimersByTime(10 ** 6);
    create('t', { duration: 3000 }, 'success');
    vi.advanceTimersByTime(2999);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
  });

  it('resets queued and entering toasts without starting their timers', () => {
    create('queued');
    create('queued', { duration: 2000 });
    expect(timerOf('queued')).toEqual({ duration: 2000, remaining: 2000, runningSince: null });

    activateToaster();
    create('entering', { duration: 7000 });
    create('entering', { duration: 1000 });
    expect(record('entering')).toMatchObject({
      phase: 'entering',
      timer: { duration: 1000, remaining: 1000, runningSince: null },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('revives a timed-out or dismissed toast with a fresh timer that waits for entered()', () => {
    activateToaster();
    create('timed-out');
    create('dismissed');
    entered('timed-out');
    entered('dismissed');
    vi.advanceTimersByTime(4000);
    dismiss('dismissed');
    vi.advanceTimersByTime(1000);

    for (const id of ['timed-out', 'dismissed']) {
      create(id, { duration: 2000 });
      expect(record(id)).toMatchObject({
        phase: 'entering',
        timer: { duration: 2000, remaining: 2000, runningSince: null },
      });
    }
    vi.advanceTimersByTime(10 ** 6);
    expect(phaseOf('timed-out')).toBe('entering');
    entered('timed-out');
    vi.advanceTimersByTime(1999);
    expect(phaseOf('timed-out')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('timed-out')).toBe('exiting');
  });

  it('runs no timer while a toast relocates or waits at its destination', () => {
    activateToaster();
    for (const id of ['b1', 'b2', 'b3', 'b4']) {
      create(id, { position: 'bottom-left', duration: Infinity });
      entered(id);
    }
    create('t');
    entered('t');
    vi.advanceTimersByTime(1000);
    create('t', { position: 'bottom-left', duration: 3000 });
    expect(record('t')).toMatchObject({
      phase: 'exiting',
      exit: { reason: 'relocate' },
      timer: { remaining: 3000, runningSince: null },
    });
    vi.advanceTimersByTime(10 ** 6);
    exited('t');
    expect(record('t')).toMatchObject({ phase: 'queued', position: 'bottom-left' });
    vi.advanceTimersByTime(10 ** 6);
    expect(timerOf('t')).toMatchObject({ remaining: 3000, runningSince: null });

    dismiss('b1');
    exited('b1');
    expect(phaseOf('t')).toBe('entering');
    entered('t');
    vi.advanceTimersByTime(2999);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
  });

  it('relocates a timed-out toast without onDismiss and without undoing onAutoClose', () => {
    activateToaster();
    const onAutoClose = vi.fn();
    const onDismiss = vi.fn();
    create('t', { onAutoClose, onDismiss });
    entered('t');
    vi.advanceTimersByTime(5000);
    create('t', { position: 'bottom-center', onAutoClose, onDismiss });
    expect(record('t')).toMatchObject({
      phase: 'exiting',
      exit: { reason: 'relocate', relocateTo: 'bottom-center' },
      timer: { remaining: 5000, runningSince: null },
    });
    exited('t');
    expect(record('t')).toMatchObject({ phase: 'entering', position: 'bottom-center' });
    expect(onAutoClose).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores timer and pause fields smuggled through options (AC-API-5)', () => {
    activateToaster();
    const smuggled = {
      timer: { duration: 1, remaining: 1, runningSince: 0 },
      remaining: 1,
      runningSince: 0,
      pausedBy: ['focus-within'],
    } as unknown as ToastOptions;
    create('t', smuggled);
    expect(record('t')).toMatchObject({
      timer: { duration: 5000, remaining: 5000, runningSince: null },
      pausedBy: [],
    });
    entered('t');
    expect(timerOf('t')?.runningSince).not.toBeNull();
  });
});

describe('detach and takeover (§8.4, AC-NT-3)', () => {
  it('continues with the remaining time after the Toaster detaches and attaches again', async () => {
    const onAutoClose = vi.fn();
    const { detach } = activateToaster();
    create('t', { onAutoClose });
    entered('t');
    vi.advanceTimersByTime(2000);

    detach();
    await settle();
    expect(record('t')).toMatchObject({
      phase: 'queued',
      timer: { duration: 5000, remaining: 3000, runningSince: null },
    });
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(10 ** 7);
    expect(timerOf('t')).toEqual({ duration: 5000, remaining: 3000, runningSince: null });

    activateToaster();
    expect(phaseOf('t')).toBe('entering');
    vi.advanceTimersByTime(10 ** 6);
    entered('t');
    vi.advanceTimersByTime(2999);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(record('t')?.exit).toEqual({ reason: 'timeout' });
    expect(onAutoClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the full remaining time of a toast that was entering at detach', async () => {
    const { detach } = activateToaster();
    create('t');
    vi.advanceTimersByTime(4000);
    detach();
    await settle();
    expect(timerOf('t')).toEqual({ duration: 5000, remaining: 5000, runningSince: null });
  });

  it('finishes a timeout exit on detach with reason timeout and no second onAutoClose', async () => {
    const onAutoClose = vi.fn();
    const onDismiss = vi.fn();
    const { detach } = activateToaster();
    create('t', { onAutoClose, onDismiss });
    entered('t');
    vi.advanceTimersByTime(5000);
    detach();
    await settle();
    expect(record('t')).toBeUndefined();
    expect(onAutoClose).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(expect.anything(), 'timeout');
  });

  it('resumes the remaining time under a waiting Toaster that takes over', async () => {
    const first = activateToaster();
    const second = activateToaster();
    create('t');
    entered('t');
    vi.advanceTimersByTime(2000);
    first.detach();
    await settle();
    expect(getSnapshot().active).toBe(second.token);
    expect(record('t')).toMatchObject({
      phase: 'entering',
      timer: { remaining: 3000, runningSince: null },
    });
    entered('t');
    vi.advanceTimersByTime(2999);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
  });

  it('leaves a running timer alone when the same Toaster cancels its pending detach', async () => {
    const onAutoClose = vi.fn();
    const { token, detach } = activateToaster();
    create('t', { onAutoClose });
    entered('t');
    vi.advanceTimersByTime(1000);
    const before = timerOf('t');

    detach();
    attach(token);
    await settle();
    expect(timerOf('t')).toBe(before);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(3999);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
    expect(onAutoClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the timer running while a detach is still pending', async () => {
    const { detach } = activateToaster();
    create('t');
    entered('t');
    detach();
    vi.advanceTimersByTime(5000);
    expect(record('t')?.exit).toEqual({ reason: 'timeout' });
    await settle();
    expect(record('t')).toBeUndefined();
  });
});

describe('cleanup', () => {
  it('cancels pending timers on resetStore, so they never act on later state', () => {
    const onAutoClose = vi.fn();
    activateToaster();
    create('t', { onAutoClose });
    entered('t');
    vi.advanceTimersByTime(3000);
    expect(vi.getTimerCount()).toBe(1);

    resetStore();
    expect(vi.getTimerCount()).toBe(0);
    activateToaster();
    create('t');
    entered('t');
    vi.advanceTimersByTime(4999);
    expect(phaseOf('t')).toBe('visible');
    expect(onAutoClose).not.toHaveBeenCalled();
  });

  it('cancels the timer of a removed toast, so a reused ID starts afresh', () => {
    activateToaster();
    create('t');
    entered('t');
    vi.advanceTimersByTime(4000);
    dismiss('t');
    exited('t');
    create('t');
    vi.advanceTimersByTime(10 ** 6);
    expect(phaseOf('t')).toBe('entering');
  });

  it('starts no timer on the server, where creation is rejected', () => {
    vi.stubGlobal('window', undefined);
    activateToaster();
    expect(upsert({ type: 'default', custom: false, content: 'x', options: undefined })).toBe(
      undefined
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('positions', () => {
  it('runs the timers of different positions independently', () => {
    activateToaster();
    const positions: ToastPosition[] = ['top-left', 'bottom-center'];
    positions.forEach((position, index) => {
      create(position, { position, duration: 1000 * (index + 1) });
      entered(position);
    });
    vi.advanceTimersByTime(1000);
    expect(phaseOf('top-left')).toBe('exiting');
    expect(phaseOf('bottom-center')).toBe('visible');
  });
});
