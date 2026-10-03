// Low-level timer mechanics (§10): the clock, remaining-time arithmetic and scheduled timeouts.
// It knows nothing about lifecycle policy; the store decides when a timer runs. Nothing here runs
// at import time: the clock and setTimeout are only touched when a function is called.
import type { ToastId, ToastType } from '../types';
import type { ToastTimer } from './types';

/** The default for finite toasts (§10), used when the active Toaster supplies none. */
export const DEFAULT_DURATION = 5000;
// The longest delay setTimeout honours. Longer delays overflow and fire at once, so they are split.
const MAX_DELAY = 2_147_483_647;

/** Monotonic milliseconds (§10). */
export function now(): number {
  return performance.now();
}

/**
 * The effective duration: loading toasts are persistent, `Infinity` is persistent, finite values at
 * or below 0 become 0, and anything else that is not a finite number falls back to the default.
 */
export function resolveDuration(type: ToastType, duration: number | undefined): number {
  if (type === 'loading' || duration === Infinity) return Infinity;
  if (typeof duration !== 'number' || !Number.isFinite(duration)) return DEFAULT_DURATION;
  return Math.max(0, duration);
}

/** A timer that has not run yet: the whole duration remains (§7). */
export function freshTimer(duration: number): ToastTimer {
  return Object.freeze({ duration, remaining: duration, runningSince: null });
}

export function startTimer(timer: ToastTimer, at: number): ToastTimer {
  return Object.freeze({ ...timer, runningSince: at });
}

/** Folds the time run so far into `remaining` (§10: `remaining -= now − runningSince`). */
export function suspendTimer(timer: ToastTimer, at: number): ToastTimer {
  if (timer.runningSince === null) return timer;
  return Object.freeze({
    ...timer,
    remaining: Math.max(0, timer.remaining - (at - timer.runningSince)),
    runningSince: null,
  });
}

export function expiredTimer(timer: ToastTimer): ToastTimer {
  return Object.freeze({ ...timer, remaining: 0, runningSince: null });
}

// One scheduled timeout per toast. The token identifies a schedule, so a callback that outlives its
// schedule (cancelled, replaced or reset) recognises itself as stale and does nothing.
interface Scheduled {
  readonly token: object;
  readonly handle: ReturnType<typeof setTimeout>;
}

let scheduled = new Map<ToastId, Scheduled>();

/** Calls `onExpire` after `delay` ms, replacing any timeout already scheduled for `id`. */
export function schedule(id: ToastId, delay: number, onExpire: () => void): void {
  cancel(id);
  arm(id, {}, now() + delay, delay, onExpire);
}

function arm(
  id: ToastId,
  token: object,
  deadline: number,
  delay: number,
  onExpire: () => void
): void {
  const chunked = delay > MAX_DELAY;
  const handle = setTimeout(
    () => {
      if (scheduled.get(id)?.token !== token) return;
      if (chunked) {
        // Only an intermediate chunk ended: wait for what is left of the deadline.
        arm(id, token, deadline, Math.max(0, deadline - now()), onExpire);
        return;
      }
      scheduled.delete(id);
      onExpire();
    },
    chunked ? MAX_DELAY : delay
  );
  scheduled.set(id, { token, handle });
}

export function cancel(id: ToastId): void {
  const entry = scheduled.get(id);
  if (!entry) return;
  clearTimeout(entry.handle);
  scheduled.delete(id);
}

export function cancelAll(): void {
  for (const entry of scheduled.values()) clearTimeout(entry.handle);
  scheduled = new Map();
}
