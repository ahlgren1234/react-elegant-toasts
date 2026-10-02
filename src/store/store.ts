// The external toast store (§5, §7, §8). A plain module singleton: one store per loaded copy of the
// module, never kept on globalThis. Nothing here runs at import time except creating empty state.
import type { DismissReason, ToastId, ToastOptions, ToastPosition, ToastSnapshot } from '../types';
import { isServer } from './env';
import { generateId, resetIds } from './ids';
import type {
  StoredOptions,
  StoreSnapshot,
  ToasterConfig,
  ToasterToken,
  ToastInput,
  ToastRecord,
  ToastView,
} from './types';
import {
  armNoToasterWarning,
  endNoToasterPeriod,
  rearmCapWarning,
  resetWarnings,
  warnCap,
  warnExtraToaster,
  warnServer,
} from './warnings';

const POSITIONS: readonly ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];
const DEFAULT_POSITION: ToastPosition = 'top-right';
// While no Toaster is active, the store holds at most this many records (§8.4).
const NO_TOASTER_CAP = 100;
// Rendered toasts per position (§11).
const DEFAULT_MAX_VISIBLE = 4;

function emptySnapshot(): StoreSnapshot {
  const byPosition = {} as Record<ToastPosition, readonly ToastView[]>;
  for (const position of POSITIONS) byPosition[position] = Object.freeze([]);
  return Object.freeze({ active: null, byPosition: Object.freeze(byPosition) });
}

const SERVER_SNAPSHOT = emptySnapshot();

let records = new Map<ToastId, ToastRecord>();
let nextSeq = 1;
let active: ToasterToken | null = null;
let waiting: ToasterToken[] = [];
let pendingDetach = new Set<ToasterToken>();
// Each mounted Toaster's resolved configuration. A waiting Toaster's has no effect until it is active.
let configs = new WeakMap<ToasterToken, ToasterConfig>();
// Bumped by resetStore so detach microtasks scheduled before a reset never run against new state.
let generation = 0;

let listeners = new Set<() => void>();
let snapshot: StoreSnapshot = SERVER_SNAPSHOT;
let views = new WeakMap<ToastRecord, ToastView>();
let dirty = false;
let depth = 0;
let flushing = false;
let pendingCallbacks: (() => void)[] = [];

// ---------------------------------------------------------------------------------------------
// Commands and notification

/**
 * Runs a mutation. When the outermost command finishes, subscribers are notified once if the
 * snapshot changed, and queued callbacks run afterwards. Commands issued while subscribers or
 * callbacks run apply immediately; their notification follows in a later round (§8.2).
 */
function command<T>(run: () => T): T {
  depth++;
  try {
    return run();
  } finally {
    depth--;
    dirty = true;
    if (depth === 0) flush();
  }
}

function flush(): void {
  if (flushing) return;
  flushing = true;
  try {
    while (dirty || pendingCallbacks.length > 0) {
      if (dirty) {
        dirty = false;
        const next = buildSnapshot();
        if (next !== snapshot) {
          snapshot = next;
          for (const listener of [...listeners]) isolate(listener);
        }
        continue;
      }
      const callbacks = pendingCallbacks;
      pendingCallbacks = [];
      for (const callback of callbacks) isolate(callback);
    }
  } finally {
    flushing = false;
  }
}

/** Runs a consumer function. A throw never corrupts the store or stops other callbacks (§8.2). */
function isolate(run: () => void): void {
  try {
    run();
  } catch (error) {
    if (typeof globalThis.reportError === 'function') {
      globalThis.reportError(error);
    } else {
      setTimeout(() => {
        throw error;
      });
    }
  }
}

function viewOf(record: ToastRecord & { phase: ToastView['phase'] }): ToastView {
  let view = views.get(record);
  if (!view) {
    view = Object.freeze({
      id: record.id,
      seq: record.seq,
      revision: record.revision,
      type: record.type,
      custom: record.custom,
      content: record.content,
      description: record.description,
      position: record.position,
      phase: record.phase,
      options: record.options,
    });
    views.set(record, view);
  }
  return view;
}

/** Returns the current snapshot object when nothing rendered or the active Toaster changed. */
function buildSnapshot(): StoreSnapshot {
  const rendered = [...records.values()]
    .filter(
      (record): record is ToastRecord & { phase: ToastView['phase'] } => record.phase !== 'queued'
    )
    .sort((a, b) => a.seq - b.seq);
  let changed = active !== snapshot.active;
  const byPosition = {} as Record<ToastPosition, readonly ToastView[]>;
  for (const position of POSITIONS) {
    const next = rendered.filter(record => record.position === position).map(viewOf);
    const previous = snapshot.byPosition[position];
    if (next.length === previous.length && next.every((view, index) => view === previous[index])) {
      byPosition[position] = previous;
    } else {
      byPosition[position] = Object.freeze(next);
      changed = true;
    }
  }
  return changed ? Object.freeze({ active, byPosition: Object.freeze(byPosition) }) : snapshot;
}

// ---------------------------------------------------------------------------------------------
// Records

function put(record: ToastRecord): void {
  records.set(record.id, Object.freeze(record));
}

function copyOptions(options: ToastInput['options']): StoredOptions {
  const copy: {
    -readonly [Key in keyof StoredOptions]: StoredOptions[Key];
  } = {};
  if (!options) return Object.freeze(copy);
  // Field by field, never spread: no option can set a store-owned field (D-02).
  const source: ToastOptions = options;
  if (source.duration !== undefined) copy.duration = source.duration;
  if (source.icon !== undefined) copy.icon = source.icon;
  if (source.action !== undefined) copy.action = source.action;
  if (source.closeButton !== undefined) copy.closeButton = source.closeButton;
  if (source.progress !== undefined) copy.progress = source.progress;
  if (source.className !== undefined) copy.className = source.className;
  if (source.onDismiss !== undefined) copy.onDismiss = source.onDismiss;
  if (source.onAutoClose !== undefined) copy.onAutoClose = source.onAutoClose;
  return Object.freeze(copy);
}

function toastSnapshot(record: ToastRecord): ToastSnapshot {
  return Object.freeze(
    record.description === undefined
      ? { id: record.id, type: record.type, content: record.content }
      : {
          id: record.id,
          type: record.type,
          content: record.content,
          description: record.description,
        }
  );
}

/** Removes a record (→ removed) and queues `onDismiss`, which runs after notification (§16). */
function remove(record: ToastRecord, reason: DismissReason): void {
  records.delete(record.id);
  const onDismiss = record.options.onDismiss;
  if (onDismiss) pendingCallbacks.push(() => onDismiss(toastSnapshot(record), reason));
}

/** Moves a toast to a new position's queue, behind everything already there (§14). */
function requeueAt(record: ToastRecord, position: ToastPosition): void {
  put({ ...record, position, seq: nextSeq++, phase: 'queued', exit: undefined });
}

/** How many rendered toasts each position may hold under the active Toaster (§11). */
function capacity(): number {
  return (active === null ? undefined : configs.get(active))?.maxVisible ?? DEFAULT_MAX_VISIBLE;
}

/** Any value other than a whole number of at least 1, Infinity included, falls back to 4. */
function resolveMaxVisible(maxVisible: number | undefined): number {
  return maxVisible !== undefined && Number.isInteger(maxVisible) && maxVisible >= 1
    ? maxVisible
    : DEFAULT_MAX_VISIBLE;
}

/**
 * Moves queued toasts to `entering` while a Toaster is active (§11). Each position has its own
 * capacity, used by its `entering`, `visible` and `exiting` toasts: an exiting toast keeps its slot
 * until it leaves the position. Free slots go to the queued toasts with the lowest `seq` (FIFO).
 * Overflow stays queued. A relocating exit still counts at its old position.
 */
function promote(): void {
  if (active === null) return;
  const limit = capacity();
  const occupied = new Map<ToastPosition, number>();
  const queued: ToastRecord[] = [];
  for (const record of records.values()) {
    if (record.phase === 'queued') queued.push(record);
    else occupied.set(record.position, (occupied.get(record.position) ?? 0) + 1);
  }
  for (const record of queued.sort((a, b) => a.seq - b.seq)) {
    const count = occupied.get(record.position) ?? 0;
    if (count >= limit) continue;
    occupied.set(record.position, count + 1);
    put({ ...record, phase: 'entering' });
  }
}

// ---------------------------------------------------------------------------------------------
// Public store API (internal to the package)

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): StoreSnapshot {
  return snapshot;
}

export function getServerSnapshot(): StoreSnapshot {
  return SERVER_SNAPSHOT;
}

/**
 * Creates a toast, or replaces the one with the same `id` (§14). Returns the toast's ID, or
 * undefined when creation is rejected: on the server (§8.3), or at the no-Toaster cap (§8.4).
 */
export function upsert(input: ToastInput): ToastId | undefined {
  if (isServer()) {
    warnServer();
    return undefined;
  }
  return command(() => {
    // An empty `id` counts as no `id`: the library never returns an empty ID (§6.2).
    const requestedId = input.options?.id || undefined;
    const existing = requestedId === undefined ? undefined : records.get(requestedId);
    if (records.size < NO_TOASTER_CAP) rearmCapWarning();
    if (!existing && active === null && records.size >= NO_TOASTER_CAP) {
      warnCap(NO_TOASTER_CAP);
      return undefined;
    }

    const position = input.options?.position ?? DEFAULT_POSITION;
    const definition = {
      type: input.type,
      custom: input.custom,
      content: input.content,
      description: (input.options as ToastOptions | undefined)?.description,
      options: copyOptions(input.options),
    };

    let id: ToastId;
    if (existing) {
      id = existing.id;
      replace(existing, definition, position);
    } else {
      id = requestedId ?? generateId(candidate => records.has(candidate));
      put({
        id,
        seq: nextSeq++,
        revision: 0,
        ...definition,
        position,
        phase: 'queued',
        exit: undefined,
      });
    }

    if (active === null) armNoToasterWarning(() => active !== null);
    promote();
    return id;
  });
}

/** Replacement is not a merge: the new call defines the toast (§14). */
function replace(
  existing: ToastRecord,
  definition: Pick<ToastRecord, 'type' | 'custom' | 'content' | 'description' | 'options'>,
  position: ToastPosition
): void {
  const replaced: ToastRecord = { ...existing, ...definition, revision: existing.revision + 1 };
  const relocating = position !== existing.position;
  switch (existing.phase) {
    case 'queued':
      if (relocating) requeueAt(replaced, position);
      else put(replaced);
      return;
    case 'entering':
    case 'visible':
      // Same position: in place. Different position: exit here, then join the new position.
      put(
        relocating
          ? { ...replaced, phase: 'exiting', exit: { reason: 'relocate', relocateTo: position } }
          : replaced
      );
      return;
    case 'exiting':
      // Same position: revival, cancelling removal. Different position: the exit becomes a relocation.
      put(
        relocating
          ? { ...replaced, exit: { reason: 'relocate', relocateTo: position } }
          : { ...replaced, phase: 'entering', exit: undefined }
      );
      return;
  }
}

/** Dismisses one toast, or every toast when `id` is omitted (§9, §16). */
export function dismiss(id?: ToastId, reason: DismissReason = 'programmatic'): void {
  if (isServer()) return;
  command(() => {
    const targets = id === undefined ? [...records.values()] : [records.get(id)];
    for (const record of targets) {
      if (!record) continue;
      if (record.phase === 'queued') {
        remove(record, reason);
      } else if (record.phase !== 'exiting') {
        put({ ...record, phase: 'exiting', exit: { reason } });
      } else if (record.exit?.reason === 'relocate') {
        // A relocating toast is still live: dismissing it turns the relocation into a removal.
        put({ ...record, exit: { reason } });
      }
    }
  });
}

/** Reported by the renderer when a toast's enter has finished: entering → visible. */
export function entered(id: ToastId): void {
  command(() => {
    const record = records.get(id);
    if (record?.phase === 'entering') put({ ...record, phase: 'visible' });
  });
}

/** Reported by the renderer when a toast's exit has finished: → removed, or relocated (§14). */
export function exited(id: ToastId): void {
  command(() => {
    const record = records.get(id);
    if (record?.phase !== 'exiting' || !record.exit) return;
    if (record.exit.reason === 'relocate' && record.exit.relocateTo) {
      requeueAt(record, record.exit.relocateTo);
    } else if (record.exit.reason !== 'relocate') {
      remove(record, record.exit.reason);
    }
    // Leaving the position frees its slot; the old position and any destination fill it now.
    promote();
  });
}

/**
 * Attaches a Toaster (§8.5). The first one to attach is active; later ones wait in order.
 * Detach is deferred by a microtask and cancelled when the same Toaster re-attaches first, so
 * StrictMode's unmount-and-remount changes nothing (§8.4).
 */
export function attach(token: ToasterToken): () => void {
  command(() => {
    if (pendingDetach.delete(token)) return;
    if (token === active || waiting.includes(token)) return;
    if (active === null) {
      active = token;
      endNoToasterPeriod();
      promote();
    } else {
      waiting.push(token);
      warnExtraToaster(token);
    }
  });

  const attachedGeneration = generation;
  return () => {
    pendingDetach.add(token);
    queueMicrotask(() => {
      if (generation !== attachedGeneration || !pendingDetach.delete(token)) return;
      command(() => completeDetach(token));
    });
  };
}

/**
 * Stores a Toaster's configuration. The active Toaster's applies at once: a higher `maxVisible`
 * promotes queued toasts, and a lower one removes nothing, so a position may stay above the new
 * limit until its toasts leave (§11). A waiting Toaster's applies when it takes over.
 */
export function configure(
  token: ToasterToken,
  config: { readonly maxVisible?: number | undefined }
): void {
  command(() => {
    configs.set(token, Object.freeze({ maxVisible: resolveMaxVisible(config.maxVisible) }));
    if (token === active) promote();
  });
}

function completeDetach(token: ToasterToken): void {
  if (token !== active) {
    waiting = waiting.filter(candidate => candidate !== token);
    return;
  }
  // The departing Toaster's rendered toasts go back to the queue; its exits finish now (§8.4).
  const owned = [...records.values()].sort((a, b) => a.seq - b.seq);
  for (const record of owned) {
    if (record.phase === 'entering' || record.phase === 'visible') {
      put({ ...record, phase: 'queued' });
    } else if (record.phase === 'exiting' && record.exit) {
      if (record.exit.reason === 'relocate' && record.exit.relocateTo) {
        requeueAt(record, record.exit.relocateTo);
      } else if (record.exit.reason !== 'relocate') {
        remove(record, record.exit.reason);
      }
    }
  }
  // Then the earliest waiting Toaster, if any, takes over and promotes the queue (§8.5).
  active = waiting.shift() ?? null;
  if (active !== null) {
    endNoToasterPeriod();
    promote();
  }
}

// ---------------------------------------------------------------------------------------------
// Test helpers. Internal: never exported from the package entry (AC-API-1).

export type InspectedRecord = Readonly<Omit<ToastRecord, 'options' | 'exit'>> & {
  readonly options: Readonly<StoredOptions>;
  readonly exit: Readonly<ToastRecord['exit']>;
};

/** Read-only copies of every stored record, queued ones included, in `seq` order. */
export function inspectRecords(): readonly InspectedRecord[] {
  return Object.freeze(
    [...records.values()]
      .sort((a, b) => a.seq - b.seq)
      .map(record =>
        Object.freeze({
          ...record,
          options: Object.freeze({ ...record.options }),
          exit: record.exit && Object.freeze({ ...record.exit }),
        })
      )
  );
}

/** Restores the empty store, including ownership, warnings, pending work and ID state. */
export function resetStore(): void {
  records = new Map();
  nextSeq = 1;
  active = null;
  waiting = [];
  pendingDetach = new Set();
  configs = new WeakMap();
  generation++;
  listeners = new Set();
  snapshot = SERVER_SNAPSHOT;
  views = new WeakMap();
  dirty = false;
  depth = 0;
  flushing = false;
  pendingCallbacks = [];
  resetIds();
  resetWarnings();
}
