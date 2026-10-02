// Internal store types (§7). Never exported from the package entry.
import type { ReactNode } from 'react';
import type {
  CustomToastOptions,
  DismissReason,
  ToastAction,
  ToastId,
  ToastOptions,
  ToastPosition,
  ToastSnapshot,
  ToastType,
} from '../types';

export type ToastPhase = 'queued' | 'entering' | 'visible' | 'exiting';

/** Remaining-time state (§7, §10). Frozen and replaced, never mutated. */
export interface ToastTimer {
  /** Effective duration in ms. `Infinity` means persistent. */
  readonly duration: number;
  /** Ms left. Equal to `duration` until the toast first runs. */
  readonly remaining: number;
  /** `performance.now()` when the timer started running, or null while it is not running. */
  readonly runningSince: number | null;
}

/** Identifies one mounted `<Toaster />`. A plain object, so it can be held in a WeakSet. */
export type ToasterToken = object;

/** A Toaster's resolved configuration. Only the active Toaster's configuration takes effect. */
export interface ToasterConfig {
  /** Rendered toasts per position (§11): a whole number of at least 1. */
  readonly maxVisible: number;
}

/** The per-toast options the store keeps, copied field by field from the public options (D-02). */
export interface StoredOptions {
  readonly duration?: number;
  readonly icon?: ReactNode;
  readonly action?: ToastAction;
  readonly closeButton?: boolean;
  readonly progress?: boolean;
  readonly className?: string;
  readonly onDismiss?: (toast: ToastSnapshot, reason: DismissReason) => void;
  readonly onAutoClose?: (toast: ToastSnapshot) => void;
}

export interface ToastExit {
  readonly reason: DismissReason | 'relocate';
  readonly relocateTo?: ToastPosition;
}

/** A stored toast. Records are frozen and replaced, never mutated. */
export interface ToastRecord {
  readonly id: ToastId;
  /** Ordering key: assigned at creation, re-assigned only on relocation (§14). */
  readonly seq: number;
  /** Increments on every replacement. */
  readonly revision: number;
  readonly type: ToastType;
  readonly custom: boolean;
  readonly content: ReactNode;
  readonly description: ReactNode;
  readonly position: ToastPosition;
  readonly options: StoredOptions;
  readonly phase: ToastPhase;
  readonly exit: ToastExit | undefined;
  readonly timer: ToastTimer;
}

/** What rendering needs from a rendered (entering, visible or exiting) toast. */
export interface ToastView {
  readonly id: ToastId;
  readonly seq: number;
  readonly revision: number;
  readonly type: ToastType;
  readonly custom: boolean;
  readonly content: ReactNode;
  readonly description: ReactNode;
  readonly position: ToastPosition;
  readonly phase: Exclude<ToastPhase, 'queued'>;
  readonly options: StoredOptions;
}

export interface StoreSnapshot {
  /** The Toaster that renders, or null when none is attached (§8.5). */
  readonly active: ToasterToken | null;
  /** Rendered toasts per position, in `seq` order. Visual order is P-14's job. */
  readonly byPosition: Readonly<Record<ToastPosition, readonly ToastView[]>>;
}

export interface ToastInput {
  readonly type: ToastType;
  readonly custom: boolean;
  readonly content: ReactNode;
  readonly options: ToastOptions | CustomToastOptions | undefined;
}
