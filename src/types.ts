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
export interface ToastOptions {
  id?: ToastId | undefined;
  description?: ReactNode;
  duration?: number | undefined;
  position?: ToastPosition | undefined;
  icon?: ReactNode | null;
  action?: ToastAction | undefined;
  closeButton?: boolean | undefined;
  progress?: boolean | undefined;
  className?: string | undefined;
  onDismiss?: ((toast: ToastSnapshot, reason: DismissReason) => void) | undefined;
  onAutoClose?: ((toast: ToastSnapshot) => void) | undefined;
}

// Custom toasts are chrome-less (§6.4): the normal content model's options are rejected by type.
export interface CustomToastOptions {
  id?: ToastId | undefined;
  duration?: number | undefined;
  position?: ToastPosition | undefined;
  closeButton?: boolean | undefined;
  className?: string | undefined;
  onDismiss?: ((toast: ToastSnapshot, reason: DismissReason) => void) | undefined;
  onAutoClose?: ((toast: ToastSnapshot) => void) | undefined;
  description?: never;
  icon?: never;
  action?: never;
  progress?: never;
}

export interface ToastPromiseMessages<T> {
  loading: ReactNode;
  success: ReactNode | ((data: T) => ReactNode);
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
