// Public types (§6.6). These are exactly the types exported from the package entry (§6.7).
import type { MouseEvent, ReactNode } from 'react';

export type ToastId = string;

export type ToastPosition =
  'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export type ToastType = 'default' | 'success' | 'error' | 'warning' | 'info' | 'loading' | 'custom';

export type ToastTheme = 'light' | 'dark' | 'system';

export type DismissReason = 'timeout' | 'close-button' | 'swipe' | 'programmatic' | 'action';

export interface ToastAction {
  label: ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

export interface ToastSnapshot {
  readonly id: ToastId;
  readonly type: ToastType;
  readonly content: ReactNode;
  readonly description?: ReactNode;
}

// Optional fields accept an explicit `undefined` for consumers using exactOptionalPropertyTypes.
/**
 * Per-toast options. A call that reuses an existing `id` replaces that toast with a new
 * definition: options it leaves out are not taken from the previous call. Invalid runtime values
 * are ignored, as if the option had been left out.
 */
export interface ToastOptions {
  /**
   * The toast's ID. A toast with this ID that already exists is replaced. An empty string counts
   * as no ID, and an ID is generated.
   */
  id?: ToastId | undefined;
  /** Secondary content shown below the main content. Any React node. */
  description?: ReactNode;
  /**
   * How long the toast stays, in milliseconds, while it is visible and not paused. Pausing never
   * restarts it. `Infinity` makes the toast persistent, and a value of 0 or less closes it on the
   * next timer tick. Loading toasts are always persistent. When omitted, the `<Toaster />`
   * `duration` applies (5000 ms unless set). A toast created while no `<Toaster />` is mounted
   * gets the default of the first one that mounts.
   */
  duration?: number | undefined;
  /**
   * Where the toast is shown. When omitted, the `<Toaster />` `position` applies (`"top-right"`
   * unless set), so a replacement that leaves it out moves a toast shown elsewhere. A toast
   * created while no `<Toaster />` is mounted gets the position of the first one that mounts.
   */
  position?: ToastPosition | undefined;
  /**
   * Replaces the type's built-in icon; neutral toasts have none. `null` shows no icon at all.
   * Icons are hidden from assistive technology.
   */
  icon?: ReactNode | null;
  /**
   * One action button. Clicking it calls `onClick` and then dismisses the toast with the reason
   * `"action"`, unless `onClick` calls `event.preventDefault()`.
   */
  action?: ToastAction | undefined;
  /**
   * Whether the toast shows the library close button. When omitted, the `<Toaster />`
   * `closeButton` applies (on unless set).
   */
  closeButton?: boolean | undefined;
  /**
   * The toast's progress setting. When omitted, the `<Toaster />` `progress` applies, which is off
   * unless set.
   */
  progress?: boolean | undefined;
  /** Extra class names for the toast's root element. */
  className?: string | undefined;
  /** Called once when the toast is removed, whatever the cause, with the reason. */
  onDismiss?: ((toast: ToastSnapshot, reason: DismissReason) => void) | undefined;
  /** Called once each time the toast closes because its duration ran out, before `onDismiss`. */
  onAutoClose?: ((toast: ToastSnapshot) => void) | undefined;
}

// Custom toasts are chrome-less (§6.4): the normal content model's options are rejected by type.
/**
 * Options for `toast.custom`. The normal content model's `description`, `icon`, `action` and
 * `progress` are not accepted, and are ignored at runtime.
 */
export interface CustomToastOptions {
  /** As in {@link ToastOptions.id}. */
  id?: ToastId | undefined;
  /** As in {@link ToastOptions.duration}. */
  duration?: number | undefined;
  /** As in {@link ToastOptions.position}. */
  position?: ToastPosition | undefined;
  /**
   * Whether the library close button is placed on the custom content. Off unless `true` is
   * passed: the `<Toaster />` `closeButton` does not apply to custom toasts.
   */
  closeButton?: boolean | undefined;
  /** As in {@link ToastOptions.className}. */
  className?: string | undefined;
  /** As in {@link ToastOptions.onDismiss}. */
  onDismiss?: ((toast: ToastSnapshot, reason: DismissReason) => void) | undefined;
  /** As in {@link ToastOptions.onAutoClose}. */
  onAutoClose?: ((toast: ToastSnapshot) => void) | undefined;
  description?: never;
  icon?: never;
  action?: never;
  progress?: never;
}

/**
 * The content of each state of a `toast.promise` toast. All three keys are required. Each is read
 * once, when `toast.promise` is called. Content is any React node, used as given.
 */
export interface ToastPromiseMessages<T> {
  /** Shown while the promise is pending. */
  loading: ReactNode;
  /**
   * Shown when the promise resolves: a node, or a function that receives the resolved value. If
   * the function throws, the toast shows `error` for the thrown value instead.
   */
  success: ReactNode | ((data: T) => ReactNode);
  /**
   * Shown when the promise rejects: a node, or a function that receives the rejection reason,
   * which can be any value. If the function throws, the toast is dismissed and the exception is
   * reported (through `reportError` where available).
   */
  error: ReactNode | ((error: unknown) => ReactNode);
}

/** Props of `<Toaster />`. */
export interface ToasterProps {
  /**
   * The position of toasts that do not set their own. Defaults to `"top-right"`. Changing it does
   * not move toasts that already have a position.
   */
  position?: ToastPosition | undefined;
  theme?: ToastTheme | undefined;
  /**
   * How many toasts each position shows at once: a whole number of at least 1, 4 by default. More
   * toasts wait, in order, and appear as shown ones close. Lowering it closes nothing.
   */
  maxVisible?: number | undefined;
  /**
   * The duration, in milliseconds, of toasts that do not set their own. Defaults to 5000.
   * `Infinity` makes them persistent. Changing it does not change toasts that already have a
   * duration.
   */
  duration?: number | undefined;
  /**
   * Whether normal toasts that do not set `closeButton` show the library close button. On by
   * default. Changing it updates those toasts at once. Custom toasts ignore it.
   */
  closeButton?: boolean | undefined;
  /**
   * The progress setting of normal toasts that do not set their own. Off by default. Custom toasts
   * have no progress setting.
   */
  progress?: boolean | undefined;
  hotkey?: readonly string[] | false | undefined;
  labels?:
    | {
        region?: string | undefined;
        close?: string | undefined;
        warningPrefix?: string | undefined;
        errorPrefix?: string | undefined;
      }
    | undefined;
  /** Extra class names for the toaster's root element. */
  className?: string | undefined;
}
