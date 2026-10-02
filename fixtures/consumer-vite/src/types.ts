// Proves the packed declarations resolve: every public type (§6.7).
import type {
  CustomToastOptions,
  DismissReason,
  ToastAction,
  ToastId,
  ToastOptions,
  ToastPosition,
  ToastPromiseMessages,
  ToastSnapshot,
  ToastTheme,
  ToastType,
  ToasterProps,
} from 'react-elegant-toasts';

const id: ToastId = 'fixture';
const position: ToastPosition = 'top-right';
const theme: ToastTheme = 'dark';
const type: ToastType = 'loading';
const reason: DismissReason = 'action';
const action: ToastAction = { label: 'Undo', onClick: () => undefined };
const describe = (snapshot: ToastSnapshot, why: DismissReason): string => `${snapshot.id}: ${why}`;

export const options: ToastOptions = { id, position, action, onDismiss: describe };
export const customOptions: CustomToastOptions = { id, position, closeButton: false };
export const messages: ToastPromiseMessages<number> = {
  loading: 'Loading',
  success: value => value.toFixed(),
  error: 'Failed',
};
export const toasterProps: ToasterProps = {
  position,
  theme,
  hotkey: ['altKey', 'KeyT'],
  labels: { region: 'Notifications' },
};
export const values = { type, reason };

// Custom toasts do not take the normal content model (§6.4).
// @ts-expect-error -- rejected in an object literal
export const rejectedLiteral: CustomToastOptions = { description: 'Not allowed' };
// A non-literal value skips excess-property checks, so only `description?: never` rejects it.
// The shared `id` keeps TypeScript's weak-type check from reporting a different error.
const withDescription: Pick<ToastOptions, 'id' | 'description'> = {
  id,
  description: 'Not allowed',
};
// @ts-expect-error -- rejected for a non-literal value too
export const rejectedValue: CustomToastOptions = withDescription;
