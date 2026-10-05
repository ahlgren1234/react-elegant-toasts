// P-19 D1 — TEMPORARY DEMO-ONLY PROTOTYPE CODE. Not library code, not public API, never shipped.
//
// The shared D1 harness. It watches the real rendered toast DOM from outside the library, so both
// candidates run against the real P-17 layout and the real P-18 lifecycle, with no library change:
//
// - A MutationObserver on the demo's Toaster host sees each commit's DOM changes. Its callback is
//   a microtask, so it runs after React's commit (and the library's layout effects: focus
//   restoration, `inert`) and before the browser paints. Only a change to a list's own `<li>`
//   children is a membership change (D0 decision 3); anything else, such as replaced content or
//   announcements, is not, and phase changes are attributes, which are not observed at all.
// - A cache keeps each toast root's last anchored-edge distance in layout space (geometry.ts).
//   The "before" of a move comes from it, because the DOM has already changed when the observer
//   runs. A ResizeObserver on every toast root refreshes it after any size change (content,
//   wrapping, viewport), so the next membership move starts from fresh geometry. Size changes
//   themselves move nothing unless "Animate size changes" is on (an open D2 question).
// - Each batch reads everything first (layout distances, then each moved toast's computed
//   `transform`), then hands the moves to the candidate, which writes.
//
// No React state, no `requestAnimationFrame`, no `matchMedia`, no window or document listener.
import type { Candidate, Move } from './candidate';
import { createCandidateA } from './candidate-a';
import { createCandidateB } from './candidate-b';
import { anchoredDistance, displacement, edgeOf, labelOf, stacks, translateYOf } from './geometry';
import { note, recordMoves, stats } from './instrument';

export type Mode = 'off' | 'a' | 'b';

export const support = {
  resizeObserver: typeof ResizeObserver === 'function',
  waapi: typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function',
};

export interface Harness {
  readonly candidate: Candidate;
  dispose(): void;
}

export interface HarnessOptions {
  /** Whether a size or viewport change that moves toasts animates (the open D2 question). */
  readonly animateSizeChanges: () => boolean;
}

/**
 * Starts a candidate on the Toaster rendered inside `host`. Returns null for the baseline, or
 * when the candidate's API is missing: the toasts then behave exactly as P-18 left them.
 */
export function startHarness(
  host: HTMLElement,
  mode: Mode,
  options: HarnessOptions
): Harness | null {
  if (mode === 'off') return null;
  if (mode === 'b' && !support.waapi) {
    note('B unavailable: no Element.animate; no reposition motion');
    return null;
  }
  const candidate = mode === 'a' ? createCandidateA(host) : createCandidateB();
  const cache = new WeakMap<HTMLElement, number>();
  const observed = new Set<HTMLElement>();

  const resize = support.resizeObserver
    ? new ResizeObserver(() => {
        stats.refreshes += 1;
        reconcile(null, options.animateSizeChanges());
      })
    : null;
  if (!resize) note('No ResizeObserver: geometry refreshes only on DOM changes');

  /**
   * Measures every stack. Lists in `membership` (or every list with `all`) move their survivors;
   * the rest only refresh the cache.
   */
  function reconcile(membership: ReadonlySet<Element> | null, all = false): void {
    const moves: Move[] = [];
    const present = new Set<HTMLElement>();
    // Read.
    for (const { list, items } of stacks(host)) {
      const edge = edgeOf(list);
      const animate = all || (membership?.has(list) ?? false);
      for (const item of items) {
        present.add(item);
        const to = anchoredDistance(item, list, edge);
        if (to === undefined) continue;
        const from = cache.get(item);
        cache.set(item, to);
        if (!animate || from === undefined || from === to) continue;
        const current = translateYOf(getComputedStyle(item).transform);
        moves.push({
          item,
          position: list.getAttribute('data-position') ?? '?',
          label: labelOf(item),
          from,
          to,
          current,
          offset: displacement(edge, from, to) + current,
        });
      }
    }
    // Observe new toast roots; release removed ones, so a detached node is not kept alive.
    if (resize) {
      for (const item of present) {
        if (!observed.has(item)) {
          resize.observe(item);
          observed.add(item);
        }
      }
      for (const item of observed) {
        if (!present.has(item)) {
          resize.unobserve(item);
          observed.delete(item);
        }
      }
    }
    // Write.
    recordMoves(candidate.name, moves);
    candidate.move(moves);
  }

  const mutation = new MutationObserver(records => {
    const membership = new Set<Element>();
    for (const record of records) {
      const target = record.target as Element;
      if (record.type !== 'childList' || target.tagName !== 'OL') continue;
      if (!target.classList.contains('ret-toaster__list')) continue;
      const nodes = [...record.addedNodes, ...record.removedNodes];
      if (nodes.some(node => (node as Element).tagName === 'LI')) membership.add(target);
    }
    if (membership.size === 0) stats.refreshes += 1;
    reconcile(membership);
  });
  mutation.observe(host, { childList: true, subtree: true });
  reconcile(null);
  note(`started ${candidate.name}`);

  return {
    candidate,
    dispose() {
      mutation.disconnect();
      resize?.disconnect();
      observed.clear();
      candidate.dispose();
      note(`stopped ${candidate.name}`);
    },
  };
}
