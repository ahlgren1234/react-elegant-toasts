// Stack repositioning geometry (P-19, D2 decisions 3 and 4). Internal: nothing here is exported
// from the package entry. Reads only: nothing here writes a style, renders or schedules a frame.
import type { ToastId, ToastPosition } from '../types';

/** The vertical edge a stack is anchored to. Its toasts are measured from that edge. */
export type Edge = 'top' | 'bottom';

/** A position's anchored edge. Left, centre and right never change it (§20). */
export const edgeOf = (position: ToastPosition): Edge =>
  position.startsWith('top-') ? 'top' : 'bottom';

/**
 * A toast root's distance from its stack's anchored edge, from its layout-space `offsetTop` and
 * `offsetHeight` and the list's `clientHeight`. Top stacks measure the toast's top edge from the
 * list's top. Bottom stacks grow upward, so the list's top moves as it grows: they measure the
 * toast's bottom edge from the list's bottom instead. Either way the toast's own height never
 * enters its distance, and `listHeight` matters only at the bottom.
 */
export function anchoredDistance(
  edge: Edge,
  offsetTop: number,
  offsetHeight: number,
  listHeight: number
): number {
  return edge === 'top' ? offsetTop : listHeight - offsetTop - offsetHeight;
}

/**
 * The vertical correction that puts a toast back where it was, from its anchored distances before
 * and after: positive is down. A top stack's toast that moved away from the edge moved down; a
 * bottom stack's moved up.
 */
export const displacement = (edge: Edge, from: number, to: number): number =>
  edge === 'top' ? from - to : to - from;

/**
 * Whether a list's toasts changed between two commits: an insertion, a removal, or a different
 * order. Only the sequence of IDs counts, so a phase change, a revival or replaced content on the
 * same toast is not a change.
 */
export function membershipChanged(previous: readonly ToastId[], next: readonly ToastId[]): boolean {
  return previous.length !== next.length || previous.some((id, index) => id !== next[index]);
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * The vertical offset of a resolved `transform`: `none`, or the `matrix()` or `matrix3d()` that
 * computed styles serialise every other transform to. P-19 alone writes `transform` on a toast
 * root, and P-18's `translate` and `scale` are separate properties, so this is P-19's current
 * offset, part-way through a move included. Anything else, malformed or not a matrix, reads as 0:
 * no offset in flight.
 */
export function translateYOf(transform: string): number {
  const match = /^matrix(3d)?\((.*)\)$/.exec(transform.trim());
  if (!match) return 0;
  const values = (match[2] ?? '').split(',').map(value => value.trim());
  if (values.length !== (match[1] ? 16 : 6) || !values.every(value => NUMBER.test(value))) {
    return 0;
  }
  return Number(values[match[1] ? 13 : 5]);
}

/** A toast root's current P-19 offset, read from its computed style in its own realm. */
export function currentOffsetOf(item: Element): number {
  const view = item.ownerDocument.defaultView;
  return view ? translateYOf(view.getComputedStyle(item).transform) : 0;
}

/** One toast root and its anchored distance, undefined when it is not laid out in its list. */
export interface Measurement {
  readonly item: HTMLElement;
  readonly distance: number | undefined;
}

/**
 * Every toast root of a list, in DOM order, with its anchored distance. One pass of layout reads
 * and no writes, so the browser lays out at most once. Only the list's own `<li>` children count,
 * since custom content may contain list items of its own. A root whose offset parent is not the
 * list, because it is hidden, detached or positioned elsewhere, has no usable distance.
 */
export function measureList(list: HTMLElement, edge: Edge): Measurement[] {
  const height = edge === 'bottom' ? list.clientHeight : 0;
  const measured: Measurement[] = [];
  for (const child of list.children) {
    if (child.tagName !== 'LI') continue;
    const item = child as HTMLElement;
    measured.push({
      item,
      distance:
        item.offsetParent === list
          ? anchoredDistance(edge, item.offsetTop, item.offsetHeight, height)
          : undefined,
    });
  }
  return measured;
}

/**
 * Each toast root's last anchored distance. Keyed weakly by the root, so a removed toast's entry
 * goes with its node. Never React state: writing it renders nothing.
 */
export type GeometryCache = WeakMap<Element, number>;

/** Replaces the cached distances with a measurement, forgetting any root it could not measure. */
export function remember(cache: GeometryCache, measured: readonly Measurement[]): void {
  for (const { item, distance } of measured) {
    if (distance === undefined) cache.delete(item);
    else cache.set(item, distance);
  }
}

/** Keeps a set of toast roots under a ResizeObserver. */
export interface ResizeWatch {
  /** Observes exactly `items`: new roots are observed and roots no longer listed are released. */
  sync(items: readonly Element[]): void;
  /** Releases every root. */
  disconnect(): void;
}

const IDLE: ResizeWatch = { sync() {}, disconnect() {} };

/**
 * Calls `onResize` after an observed root changes size, and once after each is first observed,
 * so the cache can be refreshed between membership changes. Without ResizeObserver it does
 * nothing: geometry is then refreshed only on commits.
 */
export function watchResize(onResize: () => void): ResizeWatch {
  if (typeof ResizeObserver !== 'function') return IDLE;
  const observer = new ResizeObserver(() => onResize());
  const observed = new Set<Element>();
  return {
    sync(items) {
      const next = new Set(items);
      for (const item of observed) {
        if (next.has(item)) continue;
        observer.unobserve(item);
        observed.delete(item);
      }
      for (const item of next) {
        if (observed.has(item)) continue;
        observer.observe(item);
        observed.add(item);
      }
    },
    disconnect() {
      observer.disconnect();
      observed.clear();
    },
  };
}
