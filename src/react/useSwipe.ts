import { useEffect, useRef } from 'react';
import { setToastPause } from '../store/store';
import type { ToastView } from '../store/types';
import type { ToastId, ToastPosition } from '../types';
import { parseTime } from './motion';
import {
  activationOf,
  allowedOffset,
  isSwipePointer,
  protectedTarget,
  selectionIntersects,
  swipeOpacity,
  SWIPE_VELOCITY_WINDOW_MS,
  translationOf,
  type SwipeSample,
} from './swipe';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

// Swipe on a toast root (§19, P-21 S2): touch and pen drag a visible toast toward its edge, and a
// release springs it back. Committing a swipe is S3's. The decisions are `swipe.ts`'s; this owns
// the gesture on one root: native Pointer Events on the root only, so containment follows the
// DOM (P-15), and no window or document listener (§32). Gesture state lives in a closure, never in
// React state or the store. A move writes only the root's internal custom properties, so it
// renders nothing and notifies nobody; the store hears only the `swipe` pause reason, set when a
// gesture activates and cleared when it ends (D0 decisions 4 and 5, D2 decision 12).

/** Internal custom properties on the root, read by the stylesheet's swipe rules. Not tokens. */
export const SWIPE_X = '--ret-swipe-x';
export const SWIPE_Y = '--ret-swipe-y';
export const SWIPE_OPACITY = '--ret-swipe-opacity';
/** The internal state hook on the root (D0 decision 6): `drag` or `settle`, absent at rest. */
export const SWIPING = 'data-swiping';
/** Added to the snap-back's computed time before its cosmetic cleanup runs regardless. */
export const SETTLE_MARGIN_MS = 50;

/** A pointer that went down on the toast and may yet become a swipe. */
interface Pending {
  readonly kind: 'pending';
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
}

/** A pointer that owns an active swipe. */
interface Active {
  readonly kind: 'active';
  readonly pointerId: number;
  /** The pointer's X when the gesture activated: tracking is relative to it. */
  readonly activationX: number;
  /** The root's visual X at activation, so activating causes no jump. */
  readonly baseX: number;
  readonly width: number;
  /** Pointer samples within the velocity window, for the release decision (S3). */
  readonly samples: SwipeSample[];
  captured: boolean;
}

interface SwipeController {
  phaseChanged(phase: ToastView['phase']): void;
  dispose(): void;
}

/**
 * The time the root's resolved transitions take, delay included, plus the margin; 0 when nothing
 * transitions (reduced motion, no stylesheet, jsdom). Read once per snap-back, never per move.
 */
function settleDelay(root: HTMLElement): number {
  const style = root.ownerDocument.defaultView?.getComputedStyle(root);
  if (!style) return 0;
  const durations = style.transitionDuration.split(',');
  const delays = style.transitionDelay.split(',');
  let end = 0;
  for (const [index, duration] of durations.entries()) {
    const ms = Math.max(0, parseTime(duration) ?? 0);
    const delay = parseTime(delays[index % delays.length] ?? '') ?? 0;
    end = Math.max(end, ms + delay);
  }
  return end > 0 ? end + SETTLE_MARGIN_MS : 0;
}

function createSwipe(root: HTMLElement, id: ToastId, position: ToastPosition): SwipeController {
  let gesture: Pending | Active | null = null;
  /** Whether this gesture set the `swipe` reason, so only its own reason is ever cleared. */
  let paused = false;
  /** An active drag's offset kept as the start of an exit that began elsewhere (D0-11). */
  let held = false;
  let settle: { readonly timer: ReturnType<typeof setTimeout>; readonly onEnd: () => void } | null =
    null;

  const setPause = (on: boolean) => {
    if (paused === on) return;
    paused = on;
    setToastPause(id, 'swipe', on);
  };

  const stopSettle = () => {
    if (!settle) return;
    clearTimeout(settle.timer);
    root.removeEventListener('transitionend', settle.onEnd);
    settle = null;
  };

  /** Removes the internal properties it wrote, touching nothing at rest. */
  const clearProperties = () => {
    for (const property of [SWIPE_X, SWIPE_Y, SWIPE_OPACITY]) {
      if (root.style.getPropertyValue(property) !== '') root.style.removeProperty(property);
    }
  };

  /** Removes every trace of the swipe from the root; a root at rest is left untouched. */
  const clearVisual = () => {
    stopSettle();
    held = false;
    if (root.hasAttribute(SWIPING)) root.removeAttribute(SWIPING);
    clearProperties();
    if (root.getAttribute('style') === '') root.removeAttribute('style');
  };

  /**
   * Springs the toast back: the offset goes, and the settle rule carries `transform` and
   * `opacity` home. Cosmetic only: the gesture and its pause have already ended, and no lifecycle
   * waits for it. The state is cleared on the root's `transform` transition end, or after the
   * resolved time, or at once when nothing transitions.
   */
  const startSettle = () => {
    stopSettle();
    held = false;
    clearProperties();
    root.setAttribute(SWIPING, 'settle');
    const delay = settleDelay(root);
    if (delay === 0) {
      clearVisual();
      return;
    }
    const onEnd = (event?: Event) => {
      if (
        event &&
        (event.target !== root || (event as TransitionEvent).propertyName !== 'transform')
      ) {
        return;
      }
      clearVisual();
    };
    root.addEventListener('transitionend', onEnd);
    settle = { timer: setTimeout(onEnd, delay), onEnd };
  };

  const releaseCapture = (active: Active) => {
    if (!active.captured) return;
    active.captured = false;
    try {
      if (root.hasPointerCapture?.(active.pointerId) !== false) {
        root.releasePointerCapture?.(active.pointerId);
      }
    } catch {
      // The pointer may already be gone; the browser releases capture with it.
    }
  };

  /** Ends an active gesture: ownership first, then its pause, then capture. */
  const endActive = (active: Active, restore: boolean) => {
    gesture = null;
    setPause(false);
    releaseCapture(active);
    if (restore) startSettle();
  };

  const write = (active: Active, offset: number, y?: number) => {
    root.style.setProperty(SWIPE_X, `${offset}px`);
    if (y !== undefined) root.style.setProperty(SWIPE_Y, `${y}px`);
    root.style.setProperty(SWIPE_OPACITY, String(swipeOpacity(offset, active.width)));
  };

  const activate = (pending: Pending, event: PointerEvent) => {
    if (root.getAttribute('data-phase') !== 'visible' || selectionIntersects(root)) {
      gesture = null;
      return;
    }
    stopSettle();
    // The current visual offset, part-way through any snap-back or reposition (D2 decision 12).
    const view = root.ownerDocument.defaultView;
    const visual = translationOf(view ? view.getComputedStyle(root).transform : '');
    let captured = false;
    if (typeof root.setPointerCapture === 'function') {
      try {
        root.setPointerCapture(pending.pointerId);
        captured = root.hasPointerCapture?.(pending.pointerId) ?? true;
      } catch {
        captured = false;
      }
    }
    const active: Active = {
      kind: 'active',
      pointerId: pending.pointerId,
      activationX: event.clientX,
      baseX: visual.x,
      width: root.offsetWidth,
      samples: [{ x: event.clientX, time: event.timeStamp }],
      captured,
    };
    gesture = active;
    setPause(true);
    write(active, allowedOffset(position, visual.x), visual.y);
    root.setAttribute(SWIPING, 'drag');
  };

  const onPointerDown = (event: PointerEvent) => {
    if (gesture || !isSwipePointer(event.pointerType)) return;
    if (root.getAttribute('data-phase') !== 'visible') return;
    if (protectedTarget(event.target, root) || selectionIntersects(root)) return;
    gesture = {
      kind: 'pending',
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
    };
  };

  const onPointerMove = (event: PointerEvent) => {
    const current = gesture;
    if (!current || event.pointerId !== current.pointerId) return;
    if (current.kind === 'pending') {
      // From the original origin, never re-based: a forbidden start can still reverse (S2).
      const decision = activationOf(
        position,
        event.clientX - current.originX,
        event.clientY - current.originY
      );
      if (decision.kind === 'drop') gesture = null;
      else if (decision.kind === 'activate') activate(current, event);
      return;
    }
    current.samples.push({ x: event.clientX, time: event.timeStamp });
    while (
      current.samples.length > 2 &&
      (current.samples[0]?.time ?? 0) < event.timeStamp - SWIPE_VELOCITY_WINDOW_MS
    ) {
      current.samples.shift();
    }
    write(current, allowedOffset(position, current.baseX + (event.clientX - current.activationX)));
  };

  /** A release or a cancel. S2 has no commit: every active release springs back (S3 commits). */
  const onPointerEnd = (event: PointerEvent) => {
    const current = gesture;
    if (!current || event.pointerId !== current.pointerId) return;
    if (current.kind === 'pending') {
      gesture = null;
      return;
    }
    if (event.type === 'pointerup')
      current.samples.push({ x: event.clientX, time: event.timeStamp });
    endActive(current, true);
  };

  // Touch is implicitly captured by the touched descendant. When the root takes capture at
  // activation, that descendant loses it and its event bubbles here: only the root's own loss of
  // the active pointer ends the gesture (D2 decision 13). After a handled release the gesture is
  // already over, so the loss that follows changes nothing (D2 decision 14).
  const onLostPointerCapture = (event: PointerEvent) => {
    const current = gesture;
    if (event.target !== root || current?.kind !== 'active') return;
    if (event.pointerId !== current.pointerId) return;
    current.captured = false;
    endActive(current, true);
  };

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerEnd);
  root.addEventListener('pointercancel', onPointerEnd);
  root.addEventListener('lostpointercapture', onLostPointerCapture);

  return {
    // A lifecycle change from elsewhere (D0 decision 11). A pending candidate is dropped. An
    // active drag gives up ownership and its pause; an exit keeps the offset as its start, with
    // no snap-back first (S3 continues it). Any other phase, revival included, clears it.
    phaseChanged(phase) {
      const current = gesture;
      if (current && phase !== 'visible') {
        gesture = null;
        if (current.kind === 'active') {
          setPause(false);
          releaseCapture(current);
          if (phase === 'exiting') held = true;
          else clearVisual();
        }
        return;
      }
      if (held && phase !== 'exiting') clearVisual();
    },
    dispose() {
      const current = gesture;
      gesture = null;
      if (current?.kind === 'active') releaseCapture(current);
      setPause(false);
      clearVisual();
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerEnd);
      root.removeEventListener('pointercancel', onPointerEnd);
      root.removeEventListener('lostpointercapture', onLostPointerCapture);
    },
  };
}

/**
 * Swipe on a toast's root. The listeners live and die with the root and its toast; a lifecycle
 * change reaches the gesture in a layout effect, after the toast's own (focus restoration, then
 * `inert`). StrictMode's replay disposes and recreates the controller, leaving nothing behind.
 */
export function useSwipe(
  ref: { readonly current: HTMLLIElement | null },
  id: ToastId,
  position: ToastPosition,
  phase: ToastView['phase']
): void {
  const controller = useRef<SwipeController | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const swipe = createSwipe(root, id, position);
    controller.current = swipe;
    return () => {
      swipe.dispose();
      if (controller.current === swipe) controller.current = null;
    };
  }, [ref, id, position]);
  useIsomorphicLayoutEffect(() => {
    controller.current?.phaseChanged(phase);
  }, [phase]);
}
