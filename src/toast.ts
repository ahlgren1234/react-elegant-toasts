import type { ReactNode } from 'react';
import type { CustomToastOptions, ToastId, ToastOptions, ToastPromiseMessages } from './types';

// The type of `toast`. Internal: consumers use `typeof toast` (§6.7 lists the public types).
// The members are function-typed properties, not methods: they never use `this`, so they can be
// passed around unbound (for example `onClick={toast.dismiss}`) without `unbound-method` lint errors.
interface ToastApi {
  (content: ReactNode, options?: ToastOptions): ToastId | undefined;
  success: (content: ReactNode, options?: ToastOptions) => ToastId | undefined;
  error: (content: ReactNode, options?: ToastOptions) => ToastId | undefined;
  warning: (content: ReactNode, options?: ToastOptions) => ToastId | undefined;
  info: (content: ReactNode, options?: ToastOptions) => ToastId | undefined;
  loading: (content: ReactNode, options?: ToastOptions) => ToastId | undefined;
  custom: (content: ReactNode, options?: CustomToastOptions) => ToastId | undefined;
  promise: <T>(
    promise: Promise<T> | (() => Promise<T>),
    messages: ToastPromiseMessages<T>,
    options?: ToastOptions
  ) => ToastId | undefined;
  dismiss: (id?: ToastId) => void;
}

// P-08 skeleton: the signatures are final, the bodies are not. Nothing is accepted yet, so every
// creation call returns undefined, the meaning §6.2 gives it. The store arrives in P-09, the
// facade behaviour in P-12 and promise handling in P-13; until then promise input is never
// invoked or observed.
export const toast: ToastApi = Object.assign((): ToastId | undefined => undefined, {
  success: (): ToastId | undefined => undefined,
  error: (): ToastId | undefined => undefined,
  warning: (): ToastId | undefined => undefined,
  info: (): ToastId | undefined => undefined,
  loading: (): ToastId | undefined => undefined,
  custom: (): ToastId | undefined => undefined,
  promise: (): ToastId | undefined => undefined,
  dismiss: (): void => {},
});
