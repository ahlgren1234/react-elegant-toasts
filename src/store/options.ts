// Public option normalisation (§6.3, §6.4). Pure: no lifecycle, queue, timer or ownership policy,
// and no browser globals. Invalid runtime values are treated as omitted, silently.
//
// Only fixed defaults are applied here (the custom `closeButton: false`). Defaults that depend on
// the active Toaster (duration, position, closeButton, progress, icon) stay absent, so the Toaster
// can resolve them later.
import type { ReactNode } from 'react';
import type {
  CustomToastOptions,
  ToastAction,
  ToastId,
  ToastOptions,
  ToastPosition,
} from '../types';
import type { StoredOptions } from './types';

export const POSITIONS: readonly ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export interface NormalisedOptions {
  /** A non-empty string, or undefined when the caller gave none or an invalid one. */
  readonly id: ToastId | undefined;
  /** One of the six positions, or undefined when omitted or invalid. */
  readonly position: ToastPosition | undefined;
  /** Always undefined for custom toasts. */
  readonly description: ReactNode;
  /** A fresh, frozen copy of the supported options. */
  readonly options: StoredOptions;
}

type OnDismiss = NonNullable<StoredOptions['onDismiss']>;
type OnAutoClose = NonNullable<StoredOptions['onAutoClose']>;
type Source = { readonly [Key in keyof ToastOptions]?: unknown };

const isFunction = (value: unknown): value is (...args: never[]) => unknown =>
  typeof value === 'function';

const isPosition = (value: unknown): value is ToastPosition =>
  (POSITIONS as readonly unknown[]).includes(value);

/** Finite values at or below 0 become 0; `Infinity` is persistent; anything else is omitted. */
function normaliseDuration(value: unknown): number | undefined {
  if (value === Infinity) return Infinity;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, value);
}

export function normaliseOptions(
  options: ToastOptions | CustomToastOptions | undefined,
  custom: boolean
): NormalisedOptions {
  // Runtime callers may pass anything; only a non-null object carries options.
  const source: Source = typeof options === 'object' && options !== null ? options : {};
  const stored: { -readonly [Key in keyof StoredOptions]: StoredOptions[Key] } = {};

  // Each field is read at most once and only the local is checked, so an accessor cannot pass
  // validation with one value and be stored with another. Fields that custom toasts drop are not
  // read for them at all. Field by field, never spread: no option can set store-owned state (D-02).
  const id = source.id;
  const position = source.position;
  const duration = normaliseDuration(source.duration);
  const className = source.className;
  const onDismiss = source.onDismiss;
  const onAutoClose = source.onAutoClose;
  const closeButton = source.closeButton;

  if (duration !== undefined) stored.duration = duration;
  if (typeof className === 'string') stored.className = className;
  if (isFunction(onDismiss)) stored.onDismiss = onDismiss as OnDismiss;
  if (isFunction(onAutoClose)) stored.onAutoClose = onAutoClose as OnAutoClose;

  let description: ReactNode;
  if (custom) {
    // Chrome-less (§6.4): no description, icon, action or progress, and no close button by default.
    stored.closeButton = typeof closeButton === 'boolean' ? closeButton : false;
  } else {
    description = source.description as ReactNode;
    const icon = source.icon;
    if (icon !== undefined) stored.icon = icon as ReactNode;
    const action = source.action as { label?: unknown; onClick?: unknown } | null | undefined;
    if (typeof action === 'object' && action !== null) {
      const onClick = action.onClick;
      if (isFunction(onClick)) {
        // A copy, so changing the caller's object later never changes the stored toast.
        stored.action = Object.freeze({
          label: action.label as ReactNode,
          onClick: onClick as ToastAction['onClick'],
        });
      }
    }
    if (typeof closeButton === 'boolean') stored.closeButton = closeButton;
    const progress = source.progress;
    if (typeof progress === 'boolean') stored.progress = progress;
  }

  return {
    id: typeof id === 'string' && id !== '' ? id : undefined,
    position: isPosition(position) ? position : undefined,
    description,
    options: Object.freeze(stored),
  };
}
