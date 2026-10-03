// The external toast store (§5, §7, §8). A plain module singleton: one store per loaded copy of the
// module, never kept on globalThis. Nothing here runs at import time except creating empty state.
import type { ReactNode } from 'react';
import type { DismissReason, ToastId, ToastPosition, ToastSnapshot } from '../types';
import { isServer } from './env';
import { generateId, resetIds } from './ids';
import { normaliseOptions, POSITIONS } from './options';
import {
  cancel,
  cancelAll,
  expiredTimer,
  freshTimer,
  now,
  resolveDuration,
  schedule,
  startTimer,
  suspendTimer,
} from './timer';
import type {
  GlobalPauseReason,
  StoredOptions,
  StoreSnapshot,
  ToasterConfig,
  ToasterToken,
  ToastInput,
  ToastPauseReason,
  ToastRecord,
  ToastTimer,
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

const DEFAULT_POSITION: ToastPosition = 'top-right';
// While no Toaster is active, the store holds at most this many records (§8.4).
const NO_TOASTER_CAP = 100;
// Rendered toasts per position (§11).
const DEFAULT_MAX_VISIBLE = 4;
const NO_REASONS: readonly ToastPauseReason[] = Object.freeze([]);

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
// Pause reasons (§10). Toast-scoped reasons live on each record (`pausedBy`).
let globalPause = new Set<GlobalPauseReason>();
let hoveredPositions = new Set<ToastPosition>();

let listeners = new Set<() => void>();
let snapshot: StoreSnapshot = SERVER_SNAPSHOT;
let dirty = false;
let depth = 0;
let flushing = false;
let pendingCallbacks: (() => void)[] = [];

// ---------------------------------------------------------------------------------------------
// Commands and notification

/**
 * Runs a mutation, then reconciles timers with the new state. When the outermost command
 * finishes, subscribers are notified once if the snapshot changed, and queued callbacks run
 * afterwards. Commands issued while subscribers or callbacks run apply immediately; their
 * notification follows in a later round (§8.2).
 */
function command<T>(run: () => T): T {
  depth++;
  try {
    return run();
  } finally {
    syncTimers();
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
    report(error);
  }
}

/** Reports a consumer error through `reportError`, or an asynchronous re-throw (§8.2). */
export function report(error: unknown): void {
  if (typeof globalThis.reportError === 'function') {
    globalThis.reportError(error);
  } else {
    setTimeout(() => {
      throw error;
    });
  }
}

const VIEW_KEYS = [
  'id',
  'seq',
  'revision',
  'type',
  'custom',
  'content',
  'description',
  'position',
  'phase',
  'options',
] as const satisfies readonly (keyof ToastView)[];

/**
 * The view of a rendered record. The previous view is kept while every render-visible field is
 * unchanged, so record changes that rendering cannot see (timer and pause state) notify nobody.
 */
function viewOf(
  record: ToastRecord & { phase: ToastView['phase'] },
  previous: ToastView | undefined
): ToastView {
  const next: ToastView = {
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
  };
  if (previous && VIEW_KEYS.every(key => previous[key] === next[key])) return previous;
  return Object.freeze(next);
}

/** Returns the current snapshot object when nothing rendered or the active Toaster changed. */
function buildSnapshot(): StoreSnapshot {
  const previousViews = new Map<ToastId, ToastView>();
  for (const position of POSITIONS) {
    for (const view of snapshot.byPosition[position]) previousViews.set(view.id, view);
  }
  const rendered = [...records.values()]
    .filter(
      (record): record is ToastRecord & { phase: ToastView['phase'] } => record.phase !== 'queued'
    )
    .sort((a, b) => a.seq - b.seq);
  let changed = active !== snapshot.active;
  const byPosition = {} as Record<ToastPosition, readonly ToastView[]>;
  for (const position of POSITIONS) {
    const next = rendered
      .filter(record => record.position === position)
      .map(record => viewOf(record, previousViews.get(record.id)));
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

/**
 * A toast is paused while any reason applies to it: a global reason, hover on its position's stack,
 * or one of its own reasons (§10). It resumes only when every one of them has cleared.
 */
function isPaused(record: ToastRecord): boolean {
  return (
    globalPause.size > 0 || hoveredPositions.has(record.position) || record.pausedBy.length > 0
  );
}

/**
 * Reconciles every timer with the store, at the end of each command. A timer runs only for a
 * `visible`, finite, unpaused toast while a Toaster is active (§5, §9 rule 5, §10). Starting one
 * schedules its `remaining` time. Stopping one folds the time it ran into `remaining`, so resuming
 * never restarts the full duration (D-08). Idempotent: a timer in the right state is left alone.
 */
function syncTimers(): void {
  let at: number | undefined;
  for (const record of records.values()) {
    const shouldRun =
      active !== null &&
      record.phase === 'visible' &&
      record.timer.duration !== Infinity &&
      !isPaused(record);
    const running = record.timer.runningSince !== null;
    if (shouldRun && !running) {
      at ??= now();
      const timer = startTimer(record.timer, at);
      put({ ...record, timer });
      const scheduledGeneration = generation;
      schedule(record.id, timer.remaining, () => {
        expire(record.id, timer, scheduledGeneration);
      });
    } else if (!shouldRun) {
      if (running) {
        at ??= now();
        put({ ...record, timer: suspendTimer(record.timer, at) });
      }
      // Also drops a timeout left over from a replaced timer.
      cancel(record.id);
    }
  }
}

/**
 * Timer expiry: the toast exits with reason `timeout`, and `onAutoClose` runs after subscribers
 * see it (§10, §16). Its slot stays taken until `exited()`, so nothing is promoted here (§11). The
 * timer that fires must still be the toast's running timer: a reset, suspension or removal
 * replaces it.
 */
function expire(id: ToastId, timer: ToastTimer, scheduledGeneration: number): void {
  if (scheduledGeneration !== generation) return;
  command(() => {
    const record = records.get(id);
    if (record?.timer !== timer || record.phase !== 'visible' || active === null) return;
    if (isPaused(record)) return;
    put({ ...record, phase: 'exiting', exit: { reason: 'timeout' }, timer: expiredTimer(timer) });
    const onAutoClose = record.options.onAutoClose;
    if (onAutoClose) pendingCallbacks.push(() => onAutoClose(toastSnapshot(record)));
  });
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
    // Invalid option values count as omitted. An empty or non-string `id` counts as no `id`: the
    // library only ever returns a non-empty string ID (§6.2).
    const normalised = normaliseOptions(input.options, input.custom);
    const requestedId = normalised.id;
    const existing = requestedId === undefined ? undefined : records.get(requestedId);
    if (records.size < NO_TOASTER_CAP) rearmCapWarning();
    if (!existing && active === null && records.size >= NO_TOASTER_CAP) {
      warnCap(NO_TOASTER_CAP);
      return undefined;
    }

    // Not a merge: an omitted position is the default one, even on replacement (§14).
    const position = normalised.position ?? DEFAULT_POSITION;
    const definition = {
      type: input.type,
      custom: input.custom,
      content: input.content,
      description: normalised.description,
      options: normalised.options,
      // Every definition starts a fresh timer: creation, and every replacement (§10, §14).
      timer: freshTimer(resolveDuration(input.type, normalised.options.duration)),
      // Only toast.promise passes a token. Any other public call clears the previous owner's (§14).
      promiseToken: input.promiseToken,
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
        pausedBy: NO_REASONS,
      });
    }

    if (active === null) armNoToasterWarning(() => active !== null);
    promote();
    return id;
  });
}

/**
 * Replacement is not a merge: the new call defines the toast (§14). The fresh timer in `definition`
 * resets the old one, whose pending timeout can no longer act; active pause reasons are kept.
 */
function replace(
  existing: ToastRecord,
  definition: Pick<
    ToastRecord,
    'type' | 'custom' | 'content' | 'description' | 'options' | 'timer' | 'promiseToken'
  >,
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
      if (record) dismissRecord(record, reason);
    }
  });
}

/** Dismissal ends any promise's ownership: a dismissed toast is never shown again by it (§13). */
function dismissRecord(record: ToastRecord, reason: DismissReason): void {
  if (record.phase === 'queued') {
    remove(record, reason);
  } else if (record.phase !== 'exiting') {
    put({ ...record, phase: 'exiting', exit: { reason }, promiseToken: undefined });
  } else if (record.exit?.reason === 'relocate') {
    // A relocating toast is still live: dismissing it turns the relocation into a removal.
    put({ ...record, exit: { reason }, promiseToken: undefined });
  }
}

// Promise settlement (§13). Settlement is internal, not a public creation call: it only ever changes
// the toast its own toast.promise call created, and never creates, revives or relocates a toast.

/** Whether the toast with this ID still belongs to the `toast.promise` call holding `token`. */
export function ownsToast(id: ToastId, token: symbol): boolean {
  const record = records.get(id);
  return record !== undefined && record.promiseToken === token && record.phase !== 'exiting';
}

/**
 * Replaces an owned loading toast with its settled state. The definition is the loading toast's
 * own: its options were normalised once at creation and are never read again, so the position,
 * description and options stay (with a fresh options object) and only the type and content change.
 * Ownership is checked again here, inside the command, so a stale settlement changes nothing.
 */
export function settleOwned(
  id: ToastId,
  token: symbol,
  type: 'success' | 'error',
  content: ReactNode
): void {
  command(() => {
    const record = records.get(id);
    if (!record || !ownsToast(id, token)) return;
    replace(
      record,
      {
        type,
        custom: false,
        content,
        description: record.description,
        options: Object.freeze({ ...record.options }),
        timer: freshTimer(resolveDuration(type, record.options.duration)),
        promiseToken: undefined,
      },
      record.position
    );
    if (active === null) armNoToasterWarning(() => active !== null);
  });
}

/** Dismisses an owned toast (`programmatic`); does nothing once the promise has lost it. */
export function dismissOwned(id: ToastId, token: symbol): void {
  command(() => {
    const record = records.get(id);
    if (record && ownsToast(id, token)) dismissRecord(record, 'programmatic');
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

// Pause reasons combine as sets (§10, D-07, D-09): setting a reason twice and clearing it once
// clears it. The active Toaster reports them; pausing and resuming change nothing rendered.

/** Window focus loss or document visibility loss, which pause every toast. */
export function setGlobalPause(reason: GlobalPauseReason, on: boolean): void {
  if (isServer()) return;
  command(() => {
    if (on) globalPause.add(reason);
    else globalPause.delete(reason);
  });
}

/** Pointer hover over a position's stack, which pauses every toast at that position. */
export function setStackPause(position: ToastPosition, on: boolean): void {
  if (isServer()) return;
  command(() => {
    if (active === null) return;
    if (on) hoveredPositions.add(position);
    else hoveredPositions.delete(position);
  });
}

/** Focus within one toast, or an active swipe on it, which pauses only that toast. */
export function setToastPause(id: ToastId, reason: ToastPauseReason, on: boolean): void {
  if (isServer()) return;
  command(() => {
    const record = records.get(id);
    if (active === null || !record || record.pausedBy.includes(reason) === on) return;
    const pausedBy = on
      ? [...record.pausedBy, reason]
      : record.pausedBy.filter(candidate => candidate !== reason);
    put({ ...record, pausedBy: Object.freeze(pausedBy) });
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
  // The pause reasons its DOM owned go with it. Window and document state stay: they describe the
  // environment, and the next Toaster seeds them again at attach (§8.4, §10). Its timers are
  // suspended with their remaining time when this command reconciles them (`syncTimers`).
  hoveredPositions.clear();
  for (const record of [...records.values()]) {
    if (record.pausedBy.length > 0) put({ ...record, pausedBy: NO_REASONS });
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

/** Restores the empty store: ownership, warnings, timers, pause state, pending work and IDs. */
export function resetStore(): void {
  records = new Map();
  nextSeq = 1;
  active = null;
  waiting = [];
  pendingDetach = new Set();
  configs = new WeakMap();
  generation++;
  globalPause = new Set();
  hoveredPositions = new Set();
  cancelAll();
  listeners = new Set();
  snapshot = SERVER_SNAPSHOT;
  dirty = false;
  depth = 0;
  flushing = false;
  pendingCallbacks = [];
  resetIds();
  resetWarnings();
}
