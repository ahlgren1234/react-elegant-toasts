import { useEffect, useRef, useState, type RefObject } from 'react';

export type CopyState = 'idle' | 'copied' | 'failed';

// How long each outcome stays shown. The failure stays longer, as it asks for an action.
export const FEEDBACK_MS = { copied: 2000, failed: 6000 } as const;

/**
 * Copies `text` to the clipboard and reports the outcome, which returns to `idle` after a while.
 * When the clipboard fails, the element in `fallback` is selected, so the text can be copied by
 * hand. Shared by the code panels and the install command (P-25 S7).
 */
export function useCopy(text: string, fallback: RefObject<HTMLElement | null>) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    clearTimeout(timer.current);
    let next: 'copied' | 'failed';
    try {
      // `navigator.clipboard` is missing outside a secure context, so this can throw before the
      // write as well as reject.
      await navigator.clipboard.writeText(text);
      next = 'copied';
    } catch {
      if (fallback.current) window.getSelection()?.selectAllChildren(fallback.current);
      next = 'failed';
    }
    setState(next);
    timer.current = setTimeout(() => setState('idle'), FEEDBACK_MS[next]);
  };

  return { state, copy };
}
