import { useEffect } from 'react';
import type { ToastTheme } from 'react-elegant-toasts';

export type Direction = 'ltr' | 'rtl';

// The page and the Toaster share one theme. `system` is resolved in CSS on both (§21), so the page
// follows the operating system without a reload. The direction applies to the whole document, and
// the Toaster inherits it from the DOM (§20).
export function useDocumentSettings(theme: ToastTheme, direction: Direction): void {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dir = direction;
  }, [direction]);
}
