// Consumes the packed package through its public entry points only.
import 'react-elegant-toasts/styles.css';
import { createElement } from 'react';
import { Toaster, toast } from 'react-elegant-toasts';
import { messages } from './types';

export const toaster = createElement(Toaster, { position: 'bottom-center', theme: 'system' });

// Exercises every toast method for typing and bundling. Never invoked: rendering arrives in P-14.
export function exercise(): void {
  const id = toast('Default', { description: 'Secondary', duration: Infinity });
  toast.success('Saved', {
    id: 'saved',
    action: { label: 'Undo', onClick: event => event.preventDefault() },
  });
  toast.error('Failed');
  toast.warning('Careful');
  toast.info('Heads up', { icon: null, progress: true });
  toast.loading('Working');
  toast.custom(createElement('div', null, 'Custom'), { closeButton: true });
  toast.promise(Promise.resolve({ name: 'Project' }), {
    loading: 'Saving',
    success: project => `Saved ${project.name}`,
    error: error => (error instanceof Error ? error.message : 'Failed'),
  });
  // T is inferred from function input too, and a typed messages value is accepted.
  const load = (): Promise<number> => Promise.resolve(1);
  toast.promise(load, { loading: 'Loading', success: count => count.toFixed(), error: 'Failed' });
  toast.promise(load, messages);
  // @ts-expect-error -- success is required
  toast.promise(load, { loading: 'Loading', error: 'Failed' });
  // @ts-expect-error -- error is required
  toast.promise(load, { loading: 'Loading', success: 'Done' });
  // @ts-expect-error -- success receives a number
  toast.promise(load, { loading: 'Loading', success: (text: string) => text, error: 'Failed' });
  if (id) toast.dismiss(id);
  toast.dismiss();
}
