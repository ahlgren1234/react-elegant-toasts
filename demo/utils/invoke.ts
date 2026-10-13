import { toast } from 'react-elegant-toasts';
import { BURST_SIZE, burstMessage, toToastOptions, type ToastInvocation } from './playground';

// The public API calls the snippet shows: `showToast()` and `showBurst()`.
export function showToast(invocation: ToastInvocation, message = invocation.message): void {
  const create = invocation.type === 'default' ? toast : toast[invocation.type];
  create(message, toToastOptions(invocation, toast));
}

// The same toast, numbered, BURST_SIZE times in order.
export function showBurst(invocation: ToastInvocation): void {
  for (let index = 1; index <= BURST_SIZE; index++) {
    showToast(invocation, burstMessage(invocation.message, index));
  }
}
