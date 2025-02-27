export { default as Toast } from './Toast';
export { ToastProvider, useToast } from './ToastContext';
export { default as ToastContainer } from './ToastContainer';
export type {
  ToastProps,
  ToastPosition,
  ToastType,
  ToastAnimation,
  ToastProviderProps,
} from './types';

// Export a default function for convenience
import { useToast } from './ToastContext';
export default function createToast() {
  return useToast();
}
