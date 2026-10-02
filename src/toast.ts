import type { ReactNode } from 'react';
import { dismiss, upsert } from './store/store';
import type {
  CustomToastOptions,
  ToastId,
  ToastOptions,
  ToastPromiseMessages,
  ToastType,
} from './types';

// The type of `toast`. Internal: consumers use `typeof toast` (§6.7 lists the public types).
// The members are function-typed properties, not methods: they never use `this`, so they can be
// destructured or passed around unbound (for example `const { dismiss } = toast`) without
// `unbound-method` lint errors.
interface ToastApi {
  /**
   * Shows a neutral toast. Can be called anywhere, including outside React and before a
   * `<Toaster />` mounts: the toast waits until one is mounted.
   *
   * Passing the `id` of an existing toast replaces that toast. A replacement is a new definition,
   * not a partial update: options it leaves out are not taken from the previous call.
   *
   * @param content - What the toast shows: any React node.
   * @returns The toast's ID, or `undefined` when the toast was rejected: on the server, or when
   * 100 toasts are already waiting for a `<Toaster />`. A rejected call returns `undefined` even
   * when an explicit `id` was given.
   */
  (content: ReactNode, options?: ToastOptions): ToastId | undefined;
  /** Shows a success toast. Otherwise the same as {@link toast}. */
  success: (content: ReactNode, options?: ToastOptions) => ToastId | undefined;
  /** Shows an error toast. Otherwise the same as {@link toast}. */
  error: (content: ReactNode, options?: ToastOptions) => ToastId | undefined;
  /** Shows a warning toast. Otherwise the same as {@link toast}. */
  warning: (content: ReactNode, options?: ToastOptions) => ToastId | undefined;
  /** Shows an info toast. Otherwise the same as {@link toast}. */
  info: (content: ReactNode, options?: ToastOptions) => ToastId | undefined;
  /**
   * Shows a loading toast. Loading toasts are persistent: they never close on their own, and
   * `duration` is ignored. Replace it (same `id`) or dismiss it when the work finishes.
   */
  loading: (content: ReactNode, options?: ToastOptions) => ToastId | undefined;
  /**
   * Shows a chrome-less toast: the content brings its own surface, layout, icon and controls,
   * while the library still owns position, queueing, timing, pausing, motion and announcements.
   *
   * `description`, `icon`, `action` and `progress` are not accepted. The library close button is
   * off unless `closeButton: true` is passed. A persistent custom toast needs its own accessible
   * way to dismiss it, such as a button that calls `toast.dismiss(id)` with an explicit `id`.
   */
  custom: (content: ReactNode, options?: CustomToastOptions) => ToastId | undefined;
  promise: <T>(
    promise: Promise<T> | (() => Promise<T>),
    messages: ToastPromiseMessages<T>,
    options?: ToastOptions
  ) => ToastId | undefined;
  /**
   * Dismisses the toast with this ID, or every toast when `id` is `undefined` or omitted. An
   * unknown ID does nothing. `onDismiss` fires once for each toast with the reason
   * `"programmatic"`.
   *
   * A creation call returns `undefined` when it is rejected, and `toast.dismiss(undefined)`
   * dismisses everything, so check the ID first:
   *
   * ```ts
   * const id = toast("Saved");
   * if (id) toast.dismiss(id);
   * ```
   */
  dismiss: (id?: ToastId) => void;
}

// Each creation call passes straight to the store, which normalises the options and accepts the
// toast (returning the ID) or rejects it (returning undefined).
function creator(type: ToastType, custom = false) {
  return (content: ReactNode, options?: ToastOptions | CustomToastOptions): ToastId | undefined =>
    upsert({ type, custom, content, options });
}

/** Creates, replaces and dismisses toasts. Render one `<Toaster />` to show them. */
export const toast: ToastApi = Object.assign(creator('default'), {
  success: creator('success'),
  error: creator('error'),
  warning: creator('warning'),
  info: creator('info'),
  loading: creator('loading'),
  custom: creator('custom', true),
  // Still the P-08 stub: P-13 adds promise handling. The input is never invoked or observed.
  promise: (): ToastId | undefined => undefined,
  dismiss: (id?: ToastId): void => {
    dismiss(id, 'programmatic');
  },
});
