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

// Each creation call passes straight to the store, which accepts it (returning the ID) or rejects
// it (returning undefined). Option defaults, validation and the custom-toast rules arrive in P-12.
function creator(type: ToastType, custom = false) {
  return (content: ReactNode, options?: ToastOptions | CustomToastOptions): ToastId | undefined =>
    upsert({ type, custom, content, options });
}

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
