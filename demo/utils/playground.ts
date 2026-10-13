import type { ToastPosition, ToastTheme } from 'react-elegant-toasts';

// The playground's configuration model. Both the toast the playground shows (invoke.ts) and the
// code it displays (snippet.ts) are derived from it, through `toInvocation` and `toToasterSettings`,
// so the two cannot drift apart.

export const TOAST_TYPES = [
  { value: 'default', label: 'Default' },
  { value: 'success', label: 'Success' },
  { value: 'error', label: 'Error' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
  { value: 'loading', label: 'Loading' },
] as const;

export type PlaygroundType = (typeof TOAST_TYPES)[number]['value'];

// `5s` is the Toaster's default duration, so it adds no option.
export const DURATIONS = [
  { value: '5s', label: '5s', milliseconds: undefined },
  { value: '10s', label: '10s', milliseconds: 10000 },
  { value: 'persistent', label: 'Persistent', milliseconds: Infinity },
] as const;

export type DurationChoice = (typeof DURATIONS)[number]['value'];

export interface PlaygroundConfig {
  type: PlaygroundType;
  position: ToastPosition;
  description: boolean;
  action: boolean;
  closeButton: boolean;
  duration: DurationChoice;
}

export const DEFAULT_CONFIG: PlaygroundConfig = {
  type: 'success',
  position: 'top-right',
  description: true,
  action: false,
  closeButton: true,
  duration: '5s',
};

/** The `<Toaster />` defaults the snippet leaves out. */
export const TOASTER_DEFAULTS = { position: 'top-right', theme: 'system' } as const;

interface Copy {
  message: string;
  description: string;
  action: { label: string; result: string };
}

const COPY: Record<PlaygroundType, Copy> = {
  default: {
    message: 'Event has been created',
    description: 'Friday, 14 November at 18:00.',
    action: { label: 'Undo', result: 'Event removed' },
  },
  success: {
    message: 'Profile saved',
    description: 'Changes are synced to all of your devices.',
    action: { label: 'Undo', result: 'Change undone' },
  },
  error: {
    message: 'Payment failed',
    description: 'Your card was declined. Try another payment method.',
    action: { label: 'Retry', result: 'Retrying payment' },
  },
  warning: {
    message: 'Storage almost full',
    description: 'You have used 92% of your 10 GB plan.',
    action: { label: 'Manage', result: 'Storage settings opened' },
  },
  info: {
    message: 'New version available',
    description: 'Reload the page to get the latest features.',
    action: { label: 'Details', result: 'Release notes opened' },
  },
  loading: {
    message: 'Uploading report…',
    description: 'This can take a few seconds.',
    action: { label: 'Cancel', result: 'Upload cancelled' },
  },
};

/**
 * One toast call: the method, its content and the options that differ from the defaults. The
 * action's click shows a plain toast with `result`, both when invoked and in the snippet.
 */
export interface ToastInvocation {
  type: PlaygroundType;
  message: string;
  description?: string;
  action?: { label: string; result: string };
  /** Only `false`: the close button is on by default. */
  closeButton?: false;
  duration?: number;
}

/** The `<Toaster />` props the playground controls. */
export interface ToasterSettings {
  position: ToastPosition;
  theme: ToastTheme;
}

/** Loading toasts are always persistent, so the duration does not apply to them. */
export const durationApplies = (type: PlaygroundType): boolean => type !== 'loading';

export function toInvocation(config: PlaygroundConfig): ToastInvocation {
  const copy = COPY[config.type];
  const invocation: ToastInvocation = { type: config.type, message: copy.message };
  if (config.description) invocation.description = copy.description;
  if (config.action) invocation.action = { ...copy.action };
  if (!config.closeButton) invocation.closeButton = false;
  const duration = DURATIONS.find(option => option.value === config.duration)?.milliseconds;
  if (duration !== undefined && durationApplies(config.type)) invocation.duration = duration;
  return invocation;
}

export const toToasterSettings = (
  config: PlaygroundConfig,
  theme: ToastTheme
): ToasterSettings => ({
  position: config.position,
  theme,
});
