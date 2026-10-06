// Render-side Toaster defaults for toasts (§6.3, §6.4, §6.5). The store keeps each toast's own
// options only; these resolve them against the Toaster's props at render time, so a changed prop
// applies at once to every toast that left the option out. The Toaster's labels are resolved here
// too.
import type { ToastView } from '../store/types';
import type { ToasterProps } from '../types';

type Toast = Pick<ToastView, 'custom' | 'options'>;

/** A Toaster prop that is not a boolean is treated as omitted, like an invalid toast option. */
const flag = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

/** The Toaster's localisable strings (§6.5, §17), every one resolved. */
export type ResolvedLabels = {
  readonly [Key in keyof NonNullable<ToasterProps['labels']>]-?: string;
};

export const DEFAULT_LABELS: ResolvedLabels = Object.freeze({
  region: 'Notifications',
  close: 'Close notification',
  warningPrefix: 'Warning:',
  errorPrefix: 'Error:',
});

/** A label that is not a string with visible text would leave a name or prefix empty. */
const label = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() !== '' ? value : fallback;

/**
 * The Toaster's labels: each one given, or its default when omitted or invalid. Each field is read
 * once. The result is a fresh object of strings, so callers pass on the strings, never the object.
 */
export function resolveLabels(labels: unknown): ResolvedLabels {
  const source: { readonly [Key in keyof ResolvedLabels]?: unknown } =
    typeof labels === 'object' && labels !== null ? labels : {};
  return {
    region: label(source.region, DEFAULT_LABELS.region),
    close: label(source.close, DEFAULT_LABELS.close),
    warningPrefix: label(source.warningPrefix, DEFAULT_LABELS.warningPrefix),
    errorPrefix: label(source.errorPrefix, DEFAULT_LABELS.errorPrefix),
  };
}

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
 * Toaster's, then off. Custom toasts never show the standard one. The renderer also requires a
 * finite duration (P-20).
 */
export function resolveProgress(toast: Toast, toasterDefault: unknown): boolean {
  if (toast.custom) return false;
  return toast.options.progress ?? flag(toasterDefault) ?? false;
}
