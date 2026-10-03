// The fixture app: mounts a <Toaster /> and shows a toast, through the public entry only. No CSS
// import here, so render-check.mjs can run this module in Node.
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Toaster, toast, type ToastId } from 'react-elegant-toasts';

export const APP_TOAST = 'Saved by the consumer fixture';

export function mountApp(container: Element): Root {
  const root = createRoot(container);
  root.render(createElement(Toaster, { position: 'bottom-center', theme: 'system' }));
  return root;
}

export function showToast(): ToastId | undefined {
  return toast.success(APP_TOAST, { description: 'Rendered from the packed package' });
}
