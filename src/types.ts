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
   * next timer tick. Loading toasts are always persistent. When omitted, the default (5000 ms)
   * applies.
   */
  duration?: number | undefined;
  /**
   * Where the toast is shown. When omitted, the default position (`"top-right"`) applies, so a
   * replacement that leaves it out moves a toast shown elsewhere.
   */
  position?: ToastPosition | undefined;
  /** Replaces the type's icon. `null` shows no icon. Icons are hidden from assistive technology. */
  icon?: ReactNode | null;
  /**
   * One action button. Clicking it calls `onClick` and then dismisses the toast with the reason
   * `"action"`, unless `onClick` calls `event.preventDefault()`.
   */
  action?: ToastAction | undefined;
  /** Whether the toast shows the library close button. */
  closeButton?: boolean | undefined;
  /** Whether the toast shows a progress bar for its remaining time. */
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
   * passed.
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

export interface ToasterProps {
  position?: ToastPosition | undefined;
  theme?: ToastTheme | undefined;
  maxVisible?: number | undefined;
  duration?: number | undefined;
  closeButton?: boolean | undefined;
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
  className?: string | undefined;
}
