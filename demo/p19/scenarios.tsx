// P-19 D1 — TEMPORARY DEMO-ONLY PROTOTYPE CODE. Not library code, not public API, never shipped.
//
// Repeatable comparison scenarios. They use only the public `toast` API, so every toast goes
// through the real store, queue, lifecycle and renderer. Toasts are persistent unless a scenario
// says otherwise, so stacks hold still between steps.
import { toast, type ToastOptions, type ToastPosition } from '../../src';

const LONG =
  'Your export of 1,284 records finished, but 3 rows were skipped because their dates could not be parsed. Review them in the report before sharing it with the team.';

let counter = 0;
const nextId = () => `p19-${(counter += 1)}`;

/** Per position, the IDs this panel created, oldest first, until the toast is removed. */
const created = new Map<ToastPosition, string[]>();
/** The kind each ID was last created as, so a revival can repeat its definition. */
const kinds = new Map<string, Kind>();
/** IDs this panel has dismissed whose exit has not finished. */
const leaving = new Set<string>();

const track = (position: ToastPosition, id: string) => {
  const ids = created.get(position) ?? [];
  if (!ids.includes(id)) ids.push(id);
  created.set(position, ids);
};

const forget = (position: ToastPosition, id: string) => {
  created.set(
    position,
    (created.get(position) ?? []).filter(candidate => candidate !== id)
  );
  leaving.delete(id);
};

const base = (position: ToastPosition, id: string, duration = Infinity): ToastOptions => ({
  id,
  position,
  duration,
  onDismiss: () => forget(position, id),
});

export type Kind = 'short' | 'tall' | 'wrapping' | 'custom' | 'consumer-transform';

export function add(position: ToastPosition, kind: Kind, id = nextId(), duration = Infinity) {
  track(position, id);
  kinds.set(id, kind);
  leaving.delete(id);
  const options = base(position, id, duration);
  switch (kind) {
    case 'short':
      toast.success(`Saved ${id}`, options);
      break;
    case 'tall':
      toast.info(`Report ready ${id}`, {
        ...options,
        description: 'The quarterly report is ready. It includes every workspace you can access.',
        action: { label: 'Open', onClick: event => event.preventDefault() },
      });
      break;
    case 'wrapping':
      toast.warning(`Export finished with warnings ${id}`, { ...options, description: LONG });
      break;
    case 'custom':
    case 'consumer-transform':
      toast.custom(
        <div className="demo-p19-custom">
          <strong>Custom toast {id}</strong>
          <span>Much taller than a card, with its own layout and colours.</span>
          <button type="button" onClick={() => dismiss(id)}>
            Dismiss
          </button>
        </div>,
        {
          id,
          position,
          duration,
          closeButton: true,
          onDismiss: () => forget(position, id),
          ...(kind === 'consumer-transform' ? { className: 'demo-p19-consumer-transform' } : {}),
        }
      );
      break;
  }
  return id;
}

export function dismiss(id: string | undefined) {
  if (!id) return;
  leaving.add(id);
  toast.dismiss(id);
}

/** Live (not leaving) IDs at a position in visual order, nearest the anchored edge first. */
const live = (position: ToastPosition) =>
  (created.get(position) ?? []).filter(id => !leaving.has(id)).reverse();

export const nearest = (position: ToastPosition) => live(position)[0];
export const furthest = (position: ToastPosition) => {
  const ids = live(position);
  return ids[ids.length - 1];
};
export const middle = (position: ToastPosition) => {
  const ids = live(position);
  return ids[Math.floor(ids.length / 2)];
};
export const kindOf = (id: string): Kind => kinds.get(id) ?? 'short';
export const count = (position: ToastPosition) => (created.get(position) ?? []).length;

/** Runs `steps` at their offsets in ms, on the demo's own timers. */
export function sequence(steps: readonly [number, () => void][]) {
  for (const [at, step] of steps) setTimeout(step, at);
}

export function clearAll() {
  toast.dismiss();
}
