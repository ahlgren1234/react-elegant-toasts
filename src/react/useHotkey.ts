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

// The hotkey (§18): it moves focus to the first rendered toast that is not exiting, and records
// where focus was when it came from outside the region. Only the active Toaster listens, with one
// `keydown` listener on its document that stays for as long as it is active, whatever `hotkey` is;
// a changed hotkey is read from a ref, so it never re-registers. The listener is in the bubble
// phase, so a handler that prevents the event first, React's included, wins.
//
// The record is the element focused before the hotkey, the deepest one reachable through open
// shadow roots. A press from inside the region keeps it. It is kept only once focus has landed on
// the toast, and only then is the event prevented: a refused focus leaves both alone. Losing
// ownership clears it.
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
    const onKeyDown = (event: KeyboardEvent) => {
      const region = section.current;
      const current = specRef.current;
      if (event.defaultPrevented || !region || !current || !matchesHotkey(event, current)) return;
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
