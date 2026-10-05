// Enter and exit completion (§9 rule 3, P-18). Internal: nothing here is exported from the package
// entry, and the animation names are implementation details, not public API (OQ-25).
import type { ToastPosition } from '../types';

/** A phase that ends when its enter or exit has finished. */
export type TransitionPhase = 'entering' | 'exiting';

/**
 * Added to a positive animation end time, so the fallback never cuts off a running animation whose
 * `animationend` is merely late. Never added to the immediate path. An implementation constant,
 * not a token (P-18 D0, decision 3).
 */
export const LIFECYCLE_FALLBACK_MARGIN_MS = 100;

/** The largest delay `setTimeout` honours; anything longer would fire at once. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * The library animation that ends a phase at a position's anchored vertical edge (P-18 D0,
 * decision 7). Left, centre and right never change it: motion is vertical (§20).
 */
export function libraryAnimationName(phase: TransitionPhase, position: ToastPosition): string {
  const edge = position.startsWith('top-') ? 'top' : 'bottom';
  return phase === 'entering' ? `ret-enter-${edge}` : `ret-exit-${edge}`;
}

const TIME = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(ms|s)$/i;

/**
 * A CSS `<time>` in ms, or undefined when the value is not a usable finite time: empty, `auto`
 * (jsdom's computed value, and CSS's for an animation with no duration), malformed or overflowing.
 */
export function parseTime(value: string): number | undefined {
  const match = TIME.exec(value.trim());
  if (!match) return undefined;
  const amount = Number(match[1]) * (match[2]?.toLowerCase() === 's' ? 1000 : 1);
  return Number.isFinite(amount) ? amount : undefined;
}

const list = (value: string | null | undefined): string[] =>
  (value ?? '').split(',').map(item => item.trim());

/** An `animation-name` entry as an identifier: computed styles may serialise one as a string. */
const unquote = (name: string): string => name.replace(/^(['"])(.*)\1$/, '$2');

/** The computed animation longhands the fallback reads. */
export interface AnimationStyle {
  readonly animationName: string | null | undefined;
  readonly animationDuration: string | null | undefined;
  readonly animationDelay: string | null | undefined;
}

/**
 * The lifecycle fallback for `expected`, the library animation of the current phase and edge, from
 * the toast root's resolved animation styles (P-18 D0, decision 2). JavaScript keeps no copy of
 * the durations, so token overrides and reduced motion are followed as CSS resolves them.
 *
 * The lists pair by index, as CSS pairs them: `animation-name` sets the number of animations, and
 * a shorter duration or delay list repeats from its start. Each entry named `expected` ends at its
 * delay plus its duration. A negative delay starts it part-way through, so it ends that much
 * sooner, and at or before zero it has nothing left to run; delays are never clamped to zero
 * first. A duration that is negative or unusable counts as zero, and an unusable delay as zero.
 * The latest end among the matching entries counts. Any other animation, a consumer's included,
 * contributes nothing (decision 9).
 *
 * Returns that end plus the margin when it is positive, and otherwise 0: the immediate path, which
 * no running library animation needs to wait for. Always a finite, schedulable delay.
 */
export function fallbackDelay(style: AnimationStyle, expected: string): number {
  const names = list(style.animationName);
  const durations = list(style.animationDuration);
  const delays = list(style.animationDelay);
  let end = 0;
  names.forEach((name, index) => {
    if (unquote(name) !== expected) return;
    const duration = Math.max(0, parseTime(durations[index % durations.length] ?? '') ?? 0);
    const delay = parseTime(delays[index % delays.length] ?? '') ?? 0;
    end = Math.max(end, delay + duration);
  });
  return end > 0 ? Math.min(end + LIFECYCLE_FALLBACK_MARGIN_MS, MAX_TIMEOUT_MS) : 0;
}

/**
 * The fallback for a rendered toast root, read from its computed style in its own realm. A style
 * read only, never layout, and only when a phase needs completing (§32).
 */
export function fallbackDelayOf(item: Element, expected: string): number {
  const view = item.ownerDocument.defaultView;
  if (!view) return 0;
  const style = view.getComputedStyle(item);
  return fallbackDelay(
    {
      animationName: style.getPropertyValue('animation-name'),
      animationDuration: style.getPropertyValue('animation-duration'),
      animationDelay: style.getPropertyValue('animation-delay'),
    },
    expected
  );
}
