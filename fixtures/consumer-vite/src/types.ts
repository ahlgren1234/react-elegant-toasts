// Proves the packed declarations resolve. P-08 moves this to the v2 API.
import type { ToastPosition, ToastProps } from 'react-elegant-toasts';

const position: ToastPosition = 'top-right';

export const props: Omit<ToastProps, 'id'> = { message: 'Packed types resolve', position };
