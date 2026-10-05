// P-19 D1 — TEMPORARY DEMO-ONLY PROTOTYPE CODE. Not library code, not public API, never shipped.
// Removed or replaced after the D2 technique decision (docs/V2_PLAN.md, P-19 D0).
//
// Geometry shared by both candidates, so they compare on identical semantics (D0 decision 4).

/** The vertical edge a stack is anchored to: its toasts are measured from that edge. */
export type Edge = 'top' | 'bottom';

export const edgeOf = (list: HTMLElement): Edge =>
  (list.getAttribute('data-position') ?? '').startsWith('bottom-') ? 'bottom' : 'top';

/**
 * The toast root's distance from its stack's anchored edge, in layout space: `offset*` ignore
 * every transform, so neither P-18's individual `translate` and `scale` nor P-19's own transform
 * changes it. Top stacks measure the toast's top edge from the list's top. Bottom stacks grow
 * upward, so the list's top moves as it grows; they measure the toast's bottom edge from the
 * list's bottom instead. Measured to the edge nearest the anchor, so the toast's own height
 * never enters its distance. Undefined when the toast is not laid out in its list.
 */
export function anchoredDistance(
  item: HTMLElement,
  list: HTMLElement,
  edge: Edge
): number | undefined {
  if (item.offsetParent !== list) return undefined;
  return edge === 'top' ? item.offsetTop : list.clientHeight - item.offsetTop - item.offsetHeight;
}

/**
 * The on-screen correction that keeps a toast where it appeared: positive moves it down. A top
 * stack's toast that moved away from the edge (larger distance) moved down; a bottom stack's
 * moved up.
 */
export const displacement = (edge: Edge, from: number, to: number): number =>
  edge === 'top' ? from - to : to - from;

/**
 * The vertical offset of a resolved `transform` value. P-19 is the only writer of `transform`,
 * and P-18's individual properties are separate computed properties, so this is exactly P-19's
 * current visual offset, mid-transition or mid-animation included.
 */
export function translateYOf(transform: string): number {
  const match = /^matrix(3d)?\(([^)]*)\)$/.exec(transform.trim());
  if (!match) return 0;
  const values = (match[2] ?? '').split(',').map(Number);
  const y = match[1] ? values[13] : values[5];
  return y !== undefined && Number.isFinite(y) ? y : 0;
}

/** A CSS `<time>` in ms; 0 when absent or unusable. */
export function parseTime(value: string): number {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(ms|s)$/i.exec(value.trim());
  if (!match) return 0;
  const amount = Number(match[1]) * (match[2]?.toLowerCase() === 's' ? 1000 : 1);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/** The region's position lists and their toast roots, in DOM order (the library's structure). */
export function* stacks(host: Element): Generator<{ list: HTMLElement; items: HTMLElement[] }> {
  for (const section of host.children) {
    if (!section.classList.contains('ret-toaster')) continue;
    for (const list of section.children) {
      if (list.tagName !== 'OL') continue;
      const items = [...list.children].filter(
        (child): child is HTMLElement => child.tagName === 'LI'
      );
      yield { list: list as HTMLElement, items };
    }
  }
}

/** A short label for instrumentation. */
export const labelOf = (item: HTMLElement): string =>
  (item.textContent ?? '').trim().slice(0, 24) || '(empty)';
