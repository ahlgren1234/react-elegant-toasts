import { useEffect, useRef } from 'react';
import { activeElementOf, deepActiveElement } from './focus';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

const MODIFIERS = ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const;

/** A hotkey: one `KeyboardEvent.code` and exactly which modifiers are held. */
export interface HotkeySpec {
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

export const DEFAULT_HOTKEY: HotkeySpec = Object.freeze({
  code: 'KeyT',
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
});

/**
 * The Toaster's `hotkey` (§6.5, §18): `false` disables it (null). Otherwise an array of distinct
 * modifier names, in any order, plus exactly one other non-empty string, the code. Anything else
 * is invalid and, like other invalid props, treated as omitted: the default. Each entry is read
 * once, and the array is never changed.
 */
export function normaliseHotkey(value: unknown): HotkeySpec | null {
  if (value === false) return null;
  if (!Array.isArray(value)) return DEFAULT_HOTKEY;
  const held = new Set<string>();
  let code: string | undefined;
  for (const entry of value as readonly unknown[]) {
    if (typeof entry !== 'string' || entry === '') return DEFAULT_HOTKEY;
    if ((MODIFIERS as readonly string[]).includes(entry)) held.add(entry);
    else if (code === undefined) code = entry;
    else return DEFAULT_HOTKEY;
  }
  if (code === undefined) return DEFAULT_HOTKEY;
  return Object.freeze({
    code,
    altKey: held.has('altKey'),
    ctrlKey: held.has('ctrlKey'),
    metaKey: held.has('metaKey'),
    shiftKey: held.has('shiftKey'),
  });
}

/** The physical key and every modifier must match exactly; the layout-dependent `key` is ignored. */
export const matchesHotkey = (event: KeyboardEvent, spec: HotkeySpec): boolean =>
  event.code === spec.code && MODIFIERS.every(modifier => event[modifier] === spec[modifier]);

/** Escape, with no modifier, and not ending an IME composition (§18). */
const isPlainEscape = (event: KeyboardEvent): boolean =>
  event.key === 'Escape' && !event.isComposing && MODIFIERS.every(modifier => !event[modifier]);

/** An element that may take or release focus. */
type Focusable = Element & Partial<Pick<HTMLOrSVGElement, 'focus' | 'blur'>>;

/**
 * The first toast of the region that is not exiting, in DOM order, which is visual order (§12),
 * across every position: `:scope > ol > li:not([data-phase="exiting"])`. Only the region's own
 * lists and their items count, because custom content may contain list items of its own. Walked
 * rather than queried, since jsdom does not match `:scope` inside a shadow root.
 */
function firstEligibleToast(region: HTMLElement): HTMLElement | null {
  for (const list of region.children) {
    if (list.tagName !== 'OL') continue;
    for (const item of list.children) {
      if (item.tagName === 'LI' && item.getAttribute('data-phase') !== 'exiting') {
        return item as HTMLElement;
      }
    }
  }
  return null;
}

// The hotkey and Escape (§18). The hotkey moves focus to the first rendered toast that is not
// exiting, and records where focus was when it came from outside the region. Escape, while focus
// is in the region, returns it there, or releases it to the document when there is no usable
// record; it never dismisses anything. Only the active Toaster listens, with one `keydown`
// listener on its document that stays for as long as it is active, whatever `hotkey` is, so Escape
// works without a hotkey; a changed hotkey is read from a ref, so it never re-registers. The
// listener is in the bubble phase, so a handler that prevents the event first, React's included,
// wins.
//
// The record is the element focused before the hotkey, the deepest one reachable through open
// shadow roots. A press from inside the region keeps it, and Escape never clears it. It is kept
// only once focus has landed on the toast. Either key prevents the event only when it acted, with
// focus verified where it was sent: a refused focus leaves the record and the event alone. Losing
// ownership clears the record.
//
// An Escape that does not act, from outside the region for instance, goes on to the hotkey, so a
// hotkey of `["Escape"]` focuses the toasts from outside and Escape returns from inside.
export function useHotkey(
  owner: boolean,
  section: { readonly current: HTMLElement | null },
  hotkey: unknown
): void {
  const spec = normaliseHotkey(hotkey);
  const specRef = useRef(spec);
  useIsomorphicLayoutEffect(() => {
    specRef.current = spec;
  }, [spec]);
  const previousFocus = useRef<Element | null>(null);

  useEffect(() => {
    const doc = section.current?.ownerDocument;
    if (!owner || !doc) return;
    // Returns focus from inside the region to the record, or else releases it by blurring the
    // focused element itself (a shadow host's blur would not release focus inside its shadow
    // root). True when focus has left the region.
    const returnFocus = (region: HTMLElement): boolean => {
      if (!region.contains(activeElementOf(region))) return false;
      const origin: Focusable | null = previousFocus.current;
      if (origin?.isConnected && typeof origin.focus === 'function') {
        origin.focus();
        if (activeElementOf(origin) === origin) return true;
      }
      const focused: Focusable | null = deepActiveElement(doc);
      focused?.blur?.();
      return !region.contains(activeElementOf(region));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const region = section.current;
      if (event.defaultPrevented || !region) return;
      if (isPlainEscape(event) && returnFocus(region)) {
        event.preventDefault();
        return;
      }
      const current = specRef.current;
      if (!current || !matchesHotkey(event, current)) return;
      const target = firstEligibleToast(region);
      if (!target) return;
      const inside = region.contains(activeElementOf(region));
      const previous = inside ? null : deepActiveElement(doc);
      target.focus();
      if (activeElementOf(target) !== target) return;
      if (!inside) previousFocus.current = previous;
      event.preventDefault();
    };
    doc.addEventListener('keydown', onKeyDown);
    return () => {
      doc.removeEventListener('keydown', onKeyDown);
      previousFocus.current = null;
    };
  }, [owner, section]);
}
