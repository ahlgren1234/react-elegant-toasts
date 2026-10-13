import { toast, type ToastOptions } from 'react-elegant-toasts';
import type { ToastInvocation } from './playground';

// Turns an invocation into the public API call the snippet shows, field for field.
export function toToastOptions(invocation: ToastInvocation): ToastOptions {
  const options: ToastOptions = {};
  if (invocation.description !== undefined) options.description = invocation.description;
  if (invocation.action) {
    const { label, result } = invocation.action;
    options.action = { label, onClick: () => toast(result) };
  }
  if (invocation.closeButton === false) options.closeButton = false;
  if (invocation.duration !== undefined) options.duration = invocation.duration;
  if (invocation.progress) options.progress = true;
  return options;
}

export function showToast(invocation: ToastInvocation): void {
  const create = invocation.type === 'default' ? toast : toast[invocation.type];
  create(invocation.message, toToastOptions(invocation));
}
