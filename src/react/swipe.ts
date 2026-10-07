// Swipe gesture decisions (§19, P-21 D0 and D2). Internal: nothing here is exported from the
// package entry, and the constants are implementation details, not options or tokens.
//
// Pure and deterministic: no listeners, state, style writes or store. The arithmetic touches no
// global at all; the DOM helpers at the end only read the nodes they are given. Directions are
// physical, the sign of a horizontal CSS-px displacement, so document direction can never enter
// (§20, D0 decision 2).
import type { ToastPosition } from '../types';

/** Pointer travel, in CSS px from `pointerdown`, before a candidate is decided (D2 decision 1). */
export const SWIPE_ACTIVATION_SLOP_PX = 10;
/** Activation needs |dx| ≥ this × |dy| (D2 decisions 1 and 15). */
export const SWIPE_DOMINANCE_RATIO = 1.5;
/** The distance threshold is this fraction of the toast's width ... (D2 decision 2) */
export const SWIPE_DISTANCE_WIDTH_FRACTION = 0.4;
/** ... capped at this many CSS px. Also the threshold when the width is unusable. */
export const SWIPE_DISTANCE_MAX_PX = 100;
/** Release velocity is measured over the samples this many ms before release (D2 decision 3). */
export const SWIPE_VELOCITY_WINDOW_MS = 100;
/** The release velocity, in CSS px/ms, that commits: 400 px/s (D2 decision 3). */
export const SWIPE_VELOCITY_THRESHOLD = 0.4;
/** Opacity reaches its minimum at this fraction of the toast's width ... (D2 decision 4) */
export const SWIPE_FADE_WIDTH_FRACTION = 0.8;
/** ... and stays at this minimum beyond it. */
export const SWIPE_MIN_OPACITY = 0.3;
/** A committed swipe flies this fraction of the toast's width beyond its release offset (D2-7). */
export const SWIPE_RELEASE_WIDTH_FRACTION = 0.6;

/**
 * The root's internal swipe state and custom properties (D0 decisions 5 and 6), read by the
 * stylesheet's swipe rules and by stack repositioning. Implementation details, not tokens or hooks.
 * `data-swiping` is `drag` (direct manipulation), `settle` (a cancel returning to rest) or
 * `release` (exiting from the swipe offset), and absent at rest.
 */
export const SWIPING = 'data-swiping';
export const SWIPE_X = '--ret-swipe-x';
export const SWIPE_Y = '--ret-swipe-y';
export const SWIPE_OPACITY = '--ret-swipe-opacity';
/** The fly-out's travel beyond `--ret-swipe-x` while releasing: absent for a foreign exit. */
export const SWIPE_TRAVEL = '--ret-swipe-travel';

/** A physical horizontal direction: -1 is the physical left, 1 the physical right. */
export type SwipeDirection = -1 | 1;

const LEFT: readonly SwipeDirection[] = Object.freeze([-1]);
const RIGHT: readonly SwipeDirection[] = Object.freeze([1]);
const EITHER: readonly SwipeDirection[] = Object.freeze([-1, 1]);

/** The physical direction of a displacement or velocity, or 0 for zero and non-finite values. */
export function directionOf(value: number): SwipeDirection | 0 {
  if (!Number.isFinite(value) || value === 0) return 0;
  return value < 0 ? -1 : 1;
}

/**
 * The physical directions a position may be swiped in (§19): left positions toward the left edge,
 * right positions toward the right edge, centre positions either way. Only the horizontal half of
 * the position counts, and RTL never changes it (§20).
 */
export function allowedDirections(position: ToastPosition): readonly SwipeDirection[] {
  if (position.endsWith('-left')) return LEFT;
  if (position.endsWith('-right')) return RIGHT;
  return EITHER;
}

/** Whether a physical direction is one the position allows. */
export function isDirectionAllowed(
  position: ToastPosition,
  direction: SwipeDirection | 0
): boolean {
  return direction !== 0 && allowedDirections(position).includes(direction);
}

/** Only touch and pen swipe (§19, D0 decision 10). A mouse, or anything else, never does. */
export function isSwipePointer(pointerType: string): boolean {
  return pointerType === 'touch' || pointerType === 'pen';
}

/**
 * What a pending candidate's movement from `pointerdown` means (D2 decision 1):
 * - `activate`: horizontal travel has reached the slop, horizontal movement dominates, and its
 *   direction is one the position allows;
 * - `forbidden`: the same, but in a direction the position does not allow. It never activates;
 *   whether the candidate keeps waiting or is dropped is the integration's choice;
 * - `drop`: the pointer has travelled the slop without horizontal dominance, so it is not a
 *   swipe and the browser keeps it (for example to scroll);
 * - `pending`: not decided yet.
 */
export type SwipeActivation =
  | { readonly kind: 'pending' }
  | { readonly kind: 'drop' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'activate'; readonly direction: SwipeDirection };

const PENDING: SwipeActivation = Object.freeze({ kind: 'pending' });
const DROP: SwipeActivation = Object.freeze({ kind: 'drop' });
const FORBIDDEN: SwipeActivation = Object.freeze({ kind: 'forbidden' });
const ACTIVATE_LEFT: SwipeActivation = Object.freeze({ kind: 'activate', direction: -1 });
const ACTIVATE_RIGHT: SwipeActivation = Object.freeze({ kind: 'activate', direction: 1 });

/**
 * Decides a pending candidate from its displacement since `pointerdown`, in CSS px. Activation
 * needs |dx| ≥ the slop and |dx| ≥ the dominance ratio × |dy|, both inclusive. A candidate is
 * dropped once its total travel reaches the slop while horizontal movement does not dominate.
 * Non-finite input stays pending.
 */
export function activationOf(position: ToastPosition, dx: number, dy: number): SwipeActivation {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return PENDING;
  const horizontal = Math.abs(dx);
  const dominant = horizontal >= SWIPE_DOMINANCE_RATIO * Math.abs(dy);
  if (dominant && horizontal >= SWIPE_ACTIVATION_SLOP_PX) {
    const direction = directionOf(dx);
    if (!isDirectionAllowed(position, direction)) return FORBIDDEN;
    return direction === -1 ? ACTIVATE_LEFT : ACTIVATE_RIGHT;
  }
  if (!dominant && Math.hypot(dx, dy) >= SWIPE_ACTIVATION_SLOP_PX) return DROP;
  return PENDING;
}

/**
 * The displacement a toast may show: a physical offset in an allowed direction as it is, with no
 * maximum and no rubber band; one in a forbidden direction, or a non-finite one, as 0 (D0
 * decision 2).
 */
export function allowedOffset(position: ToastPosition, offsetX: number): number {
  return isDirectionAllowed(position, directionOf(offsetX)) ? offsetX : 0;
}

/**
 * The distance that commits: min(0.4 × width, 100) CSS px (D2 decision 2). A width that is not a
 * positive number (none measured, NaN, a negative value) gives the 100 px cap, never 0, so an
 * unusable width can never make every drag commit.
 */
export function distanceThreshold(width: number): number {
  if (!(width > 0)) return SWIPE_DISTANCE_MAX_PX;
  return Math.min(SWIPE_DISTANCE_WIDTH_FRACTION * width, SWIPE_DISTANCE_MAX_PX);
}

/** Whether the allowed part of a physical offset reaches the distance threshold, inclusively. */
export function distanceCommits(position: ToastPosition, offsetX: number, width: number): boolean {
  const offset = allowedOffset(position, offsetX);
  return offset !== 0 && Math.abs(offset) >= distanceThreshold(width);
}

/** A pointer position sample: physical clientX in CSS px, at an event `timeStamp` in ms. */
export interface SwipeSample {
  readonly x: number;
  readonly time: number;
}

/**
 * The signed physical velocity at release, in CSS px/ms (D2 decision 3). Of the samples, in event
 * order, the usable ones are finite and timed within [releaseTime − 100 ms, releaseTime], both
 * ends inclusive. Velocity is (last.x − first.x) / (last.time − first.time) of those; with fewer
 * than two, or no positive elapsed time, it is 0. No smoothing.
 */
export function releaseVelocity(samples: readonly SwipeSample[], releaseTime: number): number {
  if (!Number.isFinite(releaseTime)) return 0;
  const from = releaseTime - SWIPE_VELOCITY_WINDOW_MS;
  let first: SwipeSample | undefined;
  let last: SwipeSample | undefined;
  for (const sample of samples) {
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.time)) continue;
    if (sample.time < from || sample.time > releaseTime) continue;
    first ??= sample;
    last = sample;
  }
  if (!first || !last) return 0;
  const elapsed = last.time - first.time;
  return elapsed > 0 ? (last.x - first.x) / elapsed : 0;
}

/**
 * Whether a release velocity commits (D2 decision 3): at least the threshold, inclusively, in a
 * direction the position allows, and the same direction as the toast's current allowed offset.
 * A toast with no allowed offset never commits by velocity.
 */
export function velocityCommits(
  position: ToastPosition,
  velocity: number,
  offsetX: number
): boolean {
  const direction = directionOf(velocity);
  return (
    isDirectionAllowed(position, direction) &&
    directionOf(allowedOffset(position, offsetX)) === direction &&
    Math.abs(velocity) >= SWIPE_VELOCITY_THRESHOLD
  );
}

/** Everything a release decides, so the integration never recalculates a rule. */
export interface SwipeRelease {
  /** Whether the toast is dismissed: the distance **or** a valid velocity passed (§19). */
  readonly commit: boolean;
  readonly distancePassed: boolean;
  readonly velocityPassed: boolean;
  /** The physical direction of the commit, or null when the toast springs back. */
  readonly direction: SwipeDirection | null;
  /** The allowed offset the decision used. */
  readonly offsetX: number;
  readonly threshold: number;
  readonly velocity: number;
}

/**
 * Decides a release from the toast's current physical offset, its width and the pointer samples
 * up to the release time.
 */
export function releaseDecision(
  position: ToastPosition,
  offsetX: number,
  width: number,
  samples: readonly SwipeSample[],
  releaseTime: number
): SwipeRelease {
  const offset = allowedOffset(position, offsetX);
  const velocity = releaseVelocity(samples, releaseTime);
  const distancePassed = distanceCommits(position, offset, width);
  const velocityPassed = velocityCommits(position, velocity, offset);
  const commit = distancePassed || velocityPassed;
  const direction = directionOf(offset);
  return {
    commit,
    distancePassed,
    velocityPassed,
    direction: commit && direction !== 0 ? direction : null,
    offsetX: offset,
    threshold: distanceThreshold(width),
    velocity,
  };
}

/**
 * How far a committed swipe travels beyond its release offset: 0.6 × width in the committed
 * physical direction (D2 decision 7). A width that is not a positive number travels nowhere.
 */
export function releaseTravel(direction: SwipeDirection, width: number): number {
  return width > 0 ? direction * SWIPE_RELEASE_WIDTH_FRACTION * width : 0;
}

/**
 * The toast's opacity at a physical offset (D2 decision 4): 1 at rest, falling linearly to 0.3
 * at 0.8 × width and staying there. A width that is not a positive number, or a NaN offset, gives
 * 1: an unusable input never fades the toast.
 */
export function swipeOpacity(offsetX: number, width: number): number {
  if (!(width > 0) || Number.isNaN(offsetX)) return 1;
  const progress = Math.min(Math.abs(offsetX) / (SWIPE_FADE_WIDTH_FRACTION * width), 1);
  return Math.max(SWIPE_MIN_OPACITY, 1 - progress * (1 - SWIPE_MIN_OPACITY));
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * The physical translation of a resolved `transform`: `none`, or the `matrix()` or `matrix3d()`
 * that computed styles serialise every other transform to (X and Y at indices 4 and 5, or 12 and
 * 13). Anything else, malformed or not a matrix, reads as no translation. Activation reads the
 * root's current visual offset with it, part-way through any transition (D2 decision 12).
 */
export function translationOf(transform: string): { readonly x: number; readonly y: number } {
  const match = /^matrix(3d)?\((.*)\)$/.exec(transform.trim());
  if (!match) return { x: 0, y: 0 };
  const values = (match[2] ?? '').split(',').map(value => value.trim());
  if (values.length !== (match[1] ? 16 : 6) || !values.every(value => NUMBER.test(value))) {
    return { x: 0, y: 0 };
  }
  return {
    x: Number(values[match[1] ? 12 : 4]),
    y: Number(values[match[1] ? 13 : 5]),
  };
}

/**
 * The internal swipe Y of a root under an active drag, whose `transform` the drag owns; undefined
 * for any other root, at rest, settling or releasing. A style read only, never layout: stack
 * repositioning reads it to keep a dragged toast frozen under the finger (D2 decisions 11 and 12).
 */
export function draggedYOf(root: HTMLElement): number | undefined {
  if (root.getAttribute(SWIPING) !== 'drag') return undefined;
  const y = parseFloat(root.style.getPropertyValue(SWIPE_Y));
  return Number.isFinite(y) ? y : 0;
}

// D0 decision 9: what a swipe never starts from. Native controls, editable content, ARIA widget
// roles and anything a consumer made explicitly focusable.
const INTERACTIVE = [
  'button',
  'a[href]',
  'area[href]',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  'audio[controls]',
  'video[controls]',
  'iframe',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
  ...[
    'button',
    'checkbox',
    'combobox',
    'grid',
    'gridcell',
    'link',
    'listbox',
    'menu',
    'menubar',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'radio',
    'radiogroup',
    'scrollbar',
    'searchbox',
    'slider',
    'spinbutton',
    'switch',
    'tab',
    'tablist',
    'textbox',
    'tree',
    'treegrid',
    'treeitem',
  ].map(role => `[role="${role}"]`),
].join(',');

/**
 * The interactive element between `target` and the toast `root` that a swipe must not start from,
 * or null (D0 decision 9). It walks from the target toward the root, which is never itself
 * classed as interactive, whatever its `tabindex`. A target outside the root has none.
 */
export function protectedTarget(target: unknown, root: Element): Element | null {
  const node = target as Node | null;
  if (!node || typeof node.nodeType !== 'number' || !root.contains(node)) return null;
  let element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  while (element && element !== root) {
    if (element.matches(INTERACTIVE)) return element;
    element = element.parentElement;
  }
  return null;
}

/**
 * Whether the document's selection is a non-collapsed one that intersects the toast (D0 decision
 * 9). `Range.intersectsNode`, not `Selection.containsNode`: under the specification's partial
 * containment a selection wholly inside the toast does not partially contain the toast.
 */
export function selectionIntersects(root: Node): boolean {
  const selection = root.ownerDocument?.getSelection();
  if (!selection || selection.isCollapsed) return false;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    if (selection.getRangeAt(index).intersectsNode(root)) return true;
  }
  return false;
}
