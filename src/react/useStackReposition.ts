import { useRef, type RefObject } from 'react';
import type { ToastId, ToastPosition } from '../types';
import {
  currentTranslationOf,
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
import { draggedYOf, SWIPE_Y } from './swipe';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

// Stack repositioning (§22, P-19 D2 decisions 2 to 6). When a list's sequence of toasts changes,
// each surviving toast that the new layout moved is put back where it was with an inline
// `transform`, which the stylesheet's `transition: transform` then carries to its real place in
// the flex column. Visual only: the layout, the DOM order, the lifecycle and focus are untouched,
// and nothing here renders. A commit that keeps the sequence, such as a phase change, a revival or
// a replacement, only refreshes the cached geometry, and so does a size change seen by the
// ResizeObserver: neither moves anything.
//
// The root's `transform` is one library-owned composition (P-21 D2 decisions 11 and 12): this owns
// its vertical component, and a swipe its horizontal one. Neither erases the other. A toast under
// an active drag is never seeded: its internal swipe Y absorbs the move, so it stays frozen under
// the finger and reaches its place when the drag ends. Every other moved toast is seeded with the
// horizontal offset it has on screen, so a snap-back or fly-out in flight carries on unbroken.

/** A moved toast: a seed of its visual offset, or a dragged toast's new swipe Y. */
interface Move {
  readonly item: HTMLElement;
  readonly dragged: boolean;
  readonly x: number;
  readonly y: number;
}

/**
 * Moves every survivor of a membership change from where it was to where the layout now puts it.
 * Reads first: each toast's cached and measured distances, then, for each one that moved, its
 * dragged swipe Y or else its current visual X and Y, so a move that interrupts another starts from
 * where the toast is on screen. Then writes: a dragged toast's swipe Y absorbs the move; every
 * other seed turns the transition off and sets the offset, X kept. One layout read fixes every seed
 * as its start value, and removing both declarations lets the transition run to the stylesheet's
 * target: `transform: none` at rest and while settling, the fly-out while releasing.
 */
function reposition(
  list: HTMLElement,
  edge: Edge,
  measured: readonly Measurement[],
  cache: GeometryCache
): void {
  const moves: Move[] = [];
  for (const { item, distance } of measured) {
    const from = cache.get(item);
    if (from === undefined || distance === undefined || from === distance) continue;
    const delta = displacement(edge, from, distance);
    const dragged = draggedYOf(item);
    if (dragged !== undefined) {
      moves.push({ item, dragged: true, x: 0, y: dragged + delta });
    } else {
      const { x, y } = currentTranslationOf(item);
      moves.push({ item, dragged: false, x, y: y + delta });
    }
  }
  const seeds = moves.filter(move => !move.dragged);
  for (const { item, y } of moves.filter(move => move.dragged)) {
    item.style.setProperty(SWIPE_Y, `${y}px`);
  }
  if (seeds.length === 0) return;
  for (const { item, x, y } of seeds) {
    item.style.setProperty('transition-property', 'none');
    // Not swiping, X is 0: exactly the vertical seed, as before any swipe.
    item.style.setProperty(
      'transform',
      x === 0 ? `translateY(${y}px)` : `translate(${x}px, ${y}px)`
    );
  }
  void list.offsetHeight;
  for (const { item } of seeds) {
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
