import { useEffect, useRef } from 'react';
import { activeElementOf, deepActiveElement, isEligibleToast, toastItems } from './focus';
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

// The modifiers in `aria-keyshortcuts` notation, in the order they are written.
const ARIA_MODIFIERS = [
  ['ctrlKey', 'Control'],
  ['altKey', 'Alt'],
  ['metaKey', 'Meta'],
  ['shiftKey', 'Shift'],
] as const;

// Named keys whose `code` is also their ARIA name.
const ARIA_NAMED_KEYS: ReadonlySet<string> = new Set([
  'Space',
  'Enter',
  'Tab',
  'Escape',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

/** A physical key's ARIA name, for the keys whose name is not in doubt; otherwise undefined. */
function ariaKeyOf(code: string): string | undefined {
  if (ARIA_NAMED_KEYS.has(code)) return code;
  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(code)) return code;
  return /^(?:Key([A-Z])|Digit(\d))$/.exec(code)?.slice(1).find(Boolean);
}

/**
 * The hotkey in `aria-keyshortcuts` notation (§17.2): ARIA names physical keys, like `code`, by
 * their label, modifiers first, so `["shiftKey", "ctrlKey", "KeyY"]` is `Control+Shift+Y`. Only
 * letters, digits, F1 to F24 and a few named keys are written. Others, such as punctuation, whose
 * labels depend on the layout, the numpad, which would read as the digit row, and unknown codes,
 * give undefined: the hotkey still works, but is not advertised. Never the raw `code`.
 */
export function keyShortcutsOf(spec: HotkeySpec): string | undefined {
  const key = ariaKeyOf(spec.code);
  if (key === undefined) return undefined;
  const held = ARIA_MODIFIERS.filter(([modifier]) => spec[modifier]).map(([, name]) => name);
  return [...held, key].join('+');
}

/** Escape, with no modifier, and not ending an IME composition (§18). */
const isPlainEscape = (event: KeyboardEvent): boolean =>
  event.key === 'Escape' && !event.isComposing && MODIFIERS.every(modifier => !event[modifier]);

/** An element that may take or release focus. */
type Focusable = Element & Partial<Pick<HTMLOrSVGElement, 'focus' | 'blur'>>;

/** The first toast of the region that is not exiting, in DOM order, which is visual order (§12). */
function firstEligibleToast(region: HTMLElement): HTMLElement | null {
  for (const item of toastItems(region)) {
    if (isEligibleToast(item)) return item;
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
//
// Returns the hotkey in effect for this render, null when disabled, so the region can advertise
// the hotkey that is matched (§17.2).
export function useHotkey(
  owner: boolean,
  section: { readonly current: HTMLElement | null },
  hotkey: unknown
): HotkeySpec | null {
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
  return spec;
}
