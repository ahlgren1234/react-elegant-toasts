import { useRef, type RefObject } from 'react';
import type { ToastId, ToastPosition } from '../types';
import {
  currentOffsetOf,
  displacement,
  edgeOf,
  measureList,
  membershipChanged,
  remember,
  watchResize,
  type Edge,
  type GeometryCache,
  type Measurement,
  type ResizeWatch,
} from './reposition';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

// Stack repositioning (§22, P-19 D2 decisions 2 to 6). When a list's sequence of toasts changes,
// each surviving toast that the new layout moved is put back where it was with an inline
// `transform`, which the stylesheet's `transition: transform` then carries to its real place in
// the flex column. Visual only: the layout, the DOM order, the lifecycle and focus are untouched,
// and nothing here renders. A commit that keeps the sequence, such as a phase change, a revival or
// a replacement, only refreshes the cached geometry, and so does a size change seen by the
// ResizeObserver: neither moves anything.

/**
 * Moves every survivor of a membership change from where it was to where the layout now puts it.
 * Reads first: each toast's cached and measured distances, then the current offset of each one
 * that moved, so a move that interrupts another starts from where the toast is on screen. Then
 * writes: each seed turns the transition off and sets the offset. One layout read fixes every seed
 * as its start value, and removing both declarations lets the transition run to `transform: none`.
 */
function reposition(
  list: HTMLElement,
  edge: Edge,
  measured: readonly Measurement[],
  cache: GeometryCache
): void {
  const moves: [item: HTMLElement, offset: number][] = [];
  for (const { item, distance } of measured) {
    const from = cache.get(item);
    if (from === undefined || distance === undefined || from === distance) continue;
    moves.push([item, displacement(edge, from, distance) + currentOffsetOf(item)]);
  }
  if (moves.length === 0) return;
  for (const [item, offset] of moves) {
    item.style.setProperty('transition-property', 'none');
    item.style.setProperty('transform', `translateY(${offset}px)`);
  }
  void list.offsetHeight;
  for (const [item] of moves) {
    item.style.removeProperty('transition-property');
    item.style.removeProperty('transform');
    if (item.getAttribute('style') === '') item.removeAttribute('style');
  }
}

/**
 * Repositions a position list's toasts when `ids`, its toasts in DOM order, change. Runs after
 * every commit of the list, in a layout effect, so after its toasts' own layout effects (focus
 * restoration, then `inert`) and before paint. The geometry lives in refs, never in state.
 */
export function useStackReposition(
  ref: RefObject<HTMLElement | null>,
  position: ToastPosition,
  ids: readonly ToastId[]
): void {
  const cache = useRef<GeometryCache>(new WeakMap());
  const committed = useRef<readonly ToastId[]>([]);
  const watch = useRef<ResizeWatch | null>(null);

  // Keeps the cache fresh between commits, for as long as the list is mounted.
  useIsomorphicLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const edge = edgeOf(position);
    const geometry = cache.current;
    const resize = watchResize(() => remember(geometry, measureList(list, edge)));
    watch.current = resize;
    return () => {
      resize.disconnect();
      watch.current = null;
    };
  }, [ref, position]);

  useIsomorphicLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const edge = edgeOf(position);
    const measured = measureList(list, edge);
    if (membershipChanged(committed.current, ids)) {
      reposition(list, edge, measured, cache.current);
    }
    remember(cache.current, measured);
    committed.current = ids;
    watch.current?.sync(measured.map(({ item }) => item));
  });
}
