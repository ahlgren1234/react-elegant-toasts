import { useEffect } from 'react';
import { setToastPause } from '../store/store';
import type { ToastId } from '../types';

// Focus inside a toast pauses that toast (§10, §17.4). The toast is its `<li>`, by DOM containment:
// native listeners, so focus in a React portal outside the `<li>` does not count. A move between
// two of the toast's own controls changes nothing.
//
// The reason must follow where focus actually is, so the store is always told the DOM's answer:
// whether the `<li>` contains the active element of its own tree. Removing the focused node fires
// no `focusout`, whether a replacement re-keys the content or custom content re-renders itself, so
// while the toast holds focus a MutationObserver watches its subtree and checks again. It is
// connected only then, and disconnected as soon as focus leaves. Cleanup clears the reason, because
// a relocated toast keeps its record but leaves its `<li>` behind; setup checks the DOM, so a
// replayed effect stays right. The store ignores a reason that is already set or clear, and pause
// changes notify nobody.
export function useFocusWithinPause(
  ref: { readonly current: HTMLLIElement | null },
  id: ToastId
): void {
  useEffect(() => {
    const item = ref.current;
    if (!item) return;
    // The toast's own document and window, not globals, so it works in whatever realm it renders.
    const doc = item.ownerDocument;
    let observing = false;
    const update = (inside: boolean) => {
      setToastPause(id, 'focus-within', inside);
      if (inside && !observing) {
        observer.observe(item, { childList: true, subtree: true });
        observing = true;
      } else if (!inside && observing) {
        observer.disconnect();
        observing = false;
      }
    };
    // The active element of the tree the toast is in: its document, or the shadow root it renders
    // into, where the document's active element is only the shadow host.
    const reconcile = () => {
      const root = item.getRootNode();
      const active = 'activeElement' in root ? (root as Document | ShadowRoot).activeElement : null;
      update(item.contains(active));
    };
    const observer = new (doc.defaultView?.MutationObserver ?? MutationObserver)(reconcile);
    const onFocusIn = () => update(true);
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && item.contains(next)) return;
      reconcile();
    };

    item.addEventListener('focusin', onFocusIn);
    item.addEventListener('focusout', onFocusOut);
    reconcile();
    return () => {
      item.removeEventListener('focusin', onFocusIn);
      item.removeEventListener('focusout', onFocusOut);
      observer.disconnect();
      setToastPause(id, 'focus-within', false);
    };
  }, [ref, id]);
}
