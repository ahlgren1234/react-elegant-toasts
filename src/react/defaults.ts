// Render-side Toaster defaults for toasts (§6.3, §6.4, §6.5). The store keeps each toast's own
// options only; these resolve them against the Toaster's props at render time, so a changed prop
// applies at once to every toast that left the option out.
import type { ToastView } from '../store/types';

type Toast = Pick<ToastView, 'custom' | 'options'>;

/** A Toaster prop that is not a boolean is treated as omitted, like an invalid toast option. */
const flag = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

/**
 * Whether the toast shows the library close button. Normal toasts: their own option, then the
 * Toaster's, then on. Custom toasts: only an explicit `closeButton: true`, whatever the Toaster says.
 */
export function resolveCloseButton(toast: Toast, toasterDefault: unknown): boolean {
  if (toast.custom) return toast.options.closeButton === true;
  return toast.options.closeButton ?? flag(toasterDefault) ?? true;
}

/**
 * Whether the toast shows a progress indicator. Normal toasts: their own option, then the
 * Toaster's, then off. Custom toasts never show the standard one. Rendering it is P-20's.
 */
export function resolveProgress(toast: Toast, toasterDefault: unknown): boolean {
  if (toast.custom) return false;
  return toast.options.progress ?? flag(toasterDefault) ?? false;
}
