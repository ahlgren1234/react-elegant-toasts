// P-19 D1 — TEMPORARY DEMO-ONLY PROTOTYPE CODE. Not library code, not public API, never shipped.
//
// Candidate B: FLIP with the Web Animations API (P-19 D0, decision 2). For each moved toast the
// owned animation, if any, is cancelled, and a new one runs explicit keyframes from the offset
// that puts the toast where it appeared to `translateY(0px)`, with `fill: 'none'`, so it ends on
// the real layout position and leaves nothing behind.
//
// Interruption: the harness sampled the current offset from the computed style before anything
// was written, and cancel plus re-animate happen in the same task, before paint, so the cancel is
// never seen. No `commitStyles()`, no `getAnimations()` (the Animation objects are owned here),
// no composite animation.
//
// Reduced motion stays CSS-owned (D0 decision 8): the duration and easing are internal custom
// properties resolved from the stylesheet (p19-prototype.css), which sets the duration to 0ms
// under `prefers-reduced-motion: reduce`. This module only consumes the resolved value: 0 means
// no animation. It never reads the media feature.
import type { Candidate, Move } from './candidate';
import { parseTime } from './geometry';

const FALLBACK_EASING = 'ease';

export function createCandidateB(): Candidate {
  const owned = new Map<HTMLElement, Animation>();

  const release = (item: HTMLElement, animation: Animation) => {
    if (owned.get(item) === animation) owned.delete(item);
  };

  return {
    name: 'B',
    move(moves: readonly Move[]) {
      const first = moves[0];
      if (!first) return;
      // Read: the CSS-owned timing, inherited from the region, before any write.
      const style = getComputedStyle(first.item);
      const duration = parseTime(style.getPropertyValue('--ret-p19-move-duration'));
      const easing = style.getPropertyValue('--ret-p19-move-easing').trim() || FALLBACK_EASING;
      // Write.
      for (const { item, offset } of moves) {
        owned.get(item)?.cancel();
        owned.delete(item);
        if (duration === 0) continue;
        const keyframes = [
          { transform: `translateY(${offset}px)` },
          { transform: 'translateY(0px)' },
        ];
        let animation: Animation;
        try {
          animation = item.animate(keyframes, { duration, easing, fill: 'none' });
        } catch {
          // An easing the engine rejects: same motion, default easing.
          animation = item.animate(keyframes, { duration, easing: FALLBACK_EASING, fill: 'none' });
        }
        owned.set(item, animation);
        animation.onfinish = () => release(item, animation);
        animation.oncancel = () => release(item, animation);
      }
    },
    active() {
      for (const [item, animation] of owned) {
        if (!item.isConnected) {
          animation.cancel();
          owned.delete(item);
        }
      }
      return owned.size;
    },
    dispose() {
      for (const animation of [...owned.values()]) animation.cancel();
      owned.clear();
    },
  };
}
