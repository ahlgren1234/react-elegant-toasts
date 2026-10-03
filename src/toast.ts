import type { ReactNode } from 'react';
import { isServer } from './store/env';
import { dismiss, dismissOwned, ownsToast, report, settleOwned, upsert } from './store/store';
import { warnServer } from './store/warnings';
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
  /**
   * Shows a loading toast for some async work, then replaces it with a success or error toast when
   * the work settles. The same toast (same ID) goes through every state.
   *
   * ```ts
   * const id = toast.promise(saveProject(), {
   *   loading: "Saving project...",
   *   success: (project) => `Saved ${project.name}`,
   *   error: (err) => (err instanceof Error ? err.message : "Could not save project"),
   * });
   * ```
   *
   * - `promise` is a promise, or a function that returns one. The loading toast is created first;
   *   only once it has been accepted is the function called (immediately) or the promise observed.
   *   A function that throws synchronously counts as a rejection.
   * - The loading toast is persistent. On success it becomes a `success` toast, and on rejection an
   *   `error` toast, with a new timer for its `duration`. The toast changes after the call has
   *   returned, even for a promise that has already settled.
   * - One set of `options` applies to every state, including `description` and the callbacks.
   *   `duration` is ignored while loading and applies to the settled toast; `Infinity` keeps the
   *   settled toast open until it is dismissed.
   * - Once the toast is dismissed, or replaced by another call with the same `id`, the promise no
   *   longer owns it: settling then changes nothing, never shows the toast again, and does not
   *   call the message functions.
   * - The promise's rejection counts as handled by this call. To use the result or the error,
   *   await your own promise; `toast.promise` does not return it.
   *
   * @param messages - The content for each state. See {@link ToastPromiseMessages}.
   * @returns The loading toast's ID, or `undefined` when it was rejected: on the server, or when
   * 100 toasts are already waiting for a `<Toaster />`. When it is rejected, the function is not
   * called and the promise is not observed.
   */
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

/**
 * `toast.promise` (§13). The loading toast carries a token that only this call holds. Settlement
 * applies only while the toast still carries it and is not exiting, so a dismissed or externally
 * replaced toast is never touched again. Message functions are consumer code: they run outside any
 * store command, and the store checks ownership again before it changes anything.
 */
function promise<T>(
  input: Promise<T> | (() => Promise<T>),
  messages: ToastPromiseMessages<T>,
  options?: ToastOptions
): ToastId | undefined {
  // Rejected before anything the caller supplied is read, invoked or observed (§8.3).
  if (isServer()) {
    warnServer();
    return undefined;
  }
  // Each message is read once; settlement uses these values.
  const { loading, success, error } = messages;
  const token = Symbol('toast.promise');
  const id = upsert({
    type: 'loading',
    custom: false,
    content: loading,
    options,
    promiseToken: token,
  });
  // No loading toast, no async work: the function is not called and the promise is not observed.
  if (id === undefined) return undefined;

  const settleError = (reason: unknown): void => {
    if (!ownsToast(id, token)) return;
    let content: ReactNode;
    if (typeof error === 'function') {
      try {
        content = error(reason);
      } catch (thrown) {
        // Never left loading: the toast is dismissed, and the message function's error reported.
        dismissOwned(id, token);
        report(thrown);
        return;
      }
    } else {
      content = error;
    }
    settleOwned(id, token, 'error', content);
  };

  const settleSuccess = (data: T): void => {
    if (!ownsToast(id, token)) return;
    let content: ReactNode;
    if (typeof success === 'function') {
      try {
        content = success(data);
      } catch (thrown) {
        // A throwing success message turns the toast into an error with the thrown value.
        settleError(thrown);
        return;
      }
    } else {
      content = success;
    }
    settleOwned(id, token, 'success', content);
  };

  // The handlers can never throw, so the promise `then` returns never rejects: the library adds no
  // unhandled rejection. An unexpected error, including a failing `reportError`, ends here: the
  // toast is dismissed if the promise still owns it, so it is not left loading, and the error is
  // reported. Both steps are best effort, and neither can escape.
  const contain =
    <A>(settle: (value: A) => void) =>
    (value: A): void => {
      try {
        settle(value);
      } catch (failure) {
        try {
          dismissOwned(id, token);
        } catch {
          // Best-effort cleanup only: `failure` is reported below.
        }
        try {
          report(failure);
        } catch {
          // Reporting itself failed. It must not reject the derived promise.
        }
      }
    };

  let source: Promise<T>;
  if (typeof input === 'function') {
    try {
      source = Promise.resolve(input());
    } catch (thrown) {
      // Settles like an already-rejected promise: after this call has returned.
      source = new Promise<T>(() => {
        throw thrown;
      });
    }
  } else {
    source = Promise.resolve(input);
  }
  void source.then(contain(settleSuccess), contain(settleError));
  return id;
}

/** Creates, replaces and dismisses toasts. Render one `<Toaster />` to show them. */
export const toast: ToastApi = Object.assign(creator('default'), {
  success: creator('success'),
  error: creator('error'),
  warning: creator('warning'),
  info: creator('info'),
  loading: creator('loading'),
  custom: creator('custom', true),
  promise,
  dismiss: (id?: ToastId): void => {
    dismiss(id, 'programmatic');
  },
});
