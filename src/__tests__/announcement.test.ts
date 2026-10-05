// The announcement ledger (§17.1, P-16): which revision of each toast has been announced. A claim
// succeeds once per rendered revision, survives every move that keeps the record, dies with the
// record, and is bookkeeping only: it never notifies, re-renders, times or reorders anything.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attach,
  claimAnnouncement,
  configure,
  dismiss,
  entered,
  exited,
  getSnapshot,
  inspectRecords,
  resetStore,
  settleOwned,
  subscribe,
  upsert,
} from '../store/store';
import type { ToastId, ToastOptions } from '../types';

function create(id: string, options?: ToastOptions): ToastId {
  const created = upsert({
    type: 'default',
    custom: false,
    content: id,
    options: { id, ...options },
  });
  if (created === undefined) throw new Error('creation was rejected');
  return created;
}

/** Replaces toast `id` with a new definition (§14), keeping its position unless one is given. */
function replace(id: string, options?: ToastOptions): void {
  create(id, options);
}

function record(id: ToastId) {
  return inspectRecords().find(candidate => candidate.id === id);
}

const revisionOf = (id: ToastId) => record(id)?.revision;
const announcedOf = (id: ToastId) => record(id)?.announcedRevision;
const phaseOf = (id: ToastId) => record(id)?.phase;
const viewOf = (id: ToastId) =>
  Object.values(getSnapshot().byPosition)
    .flat()
    .find(view => view.id === id);

/** Attaches a Toaster directly through the store, without React. */
function activateToaster() {
  const token = {};
  return { token, detach: attach(token) };
}

/** Lets queued microtasks, such as a deferred Toaster detach, run. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('claimAnnouncement (§17.1)', () => {
  it('claims a rendered revision once', () => {
    activateToaster();
    create('t');
    expect(phaseOf('t')).toBe('entering');
    expect(announcedOf('t')).toBeUndefined();
    expect(claimAnnouncement('t', 0)).toBe(true);
    expect(announcedOf('t')).toBe(0);
    expect(claimAnnouncement('t', 0)).toBe(false);
    entered('t');
    expect(claimAnnouncement('t', 0)).toBe(false);
  });

  it('makes each replacement claimable once', () => {
    activateToaster();
    create('t');
    entered('t');
    expect(claimAnnouncement('t', 0)).toBe(true);
    replace('t');
    expect(revisionOf('t')).toBe(1);
    expect(claimAnnouncement('t', 1)).toBe(true);
    expect(claimAnnouncement('t', 1)).toBe(false);
    replace('t');
    expect(claimAnnouncement('t', 2)).toBe(true);
    expect(claimAnnouncement('t', 2)).toBe(false);
  });

  it('makes a replacement claimable even when the previous revision was never claimed', () => {
    activateToaster();
    create('t');
    replace('t');
    expect(claimAnnouncement('t', 1)).toBe(true);
  });

  it('rejects a stale revision without disturbing the current one', () => {
    activateToaster();
    create('t');
    replace('t');
    expect(claimAnnouncement('t', 0)).toBe(false);
    expect(announcedOf('t')).toBeUndefined();
    expect(claimAnnouncement('t', 1)).toBe(true);
    expect(claimAnnouncement('t', 0)).toBe(false);
    expect(announcedOf('t')).toBe(1);
  });

  it('rejects a future or invalid revision, which never pre-claims a later replacement', () => {
    activateToaster();
    create('t');
    for (const revision of [1, 2, -1, 0.5, NaN, Infinity]) {
      expect(claimAnnouncement('t', revision)).toBe(false);
    }
    expect(announcedOf('t')).toBeUndefined();
    expect(claimAnnouncement('t', 0)).toBe(true);
    replace('t');
    expect(claimAnnouncement('t', 1)).toBe(true);
  });

  it('claims nothing, and creates nothing, for an unknown ID', () => {
    activateToaster();
    expect(claimAnnouncement('missing', 0)).toBe(false);
    expect(inspectRecords()).toEqual([]);
    create('t');
    expect(claimAnnouncement('other', 0)).toBe(false);
    expect(announcedOf('t')).toBeUndefined();
  });

  it('claims an exiting toast that was never announced, once', () => {
    activateToaster();
    create('t');
    dismiss('t');
    expect(phaseOf('t')).toBe('exiting');
    expect(claimAnnouncement('t', 0)).toBe(true);
    expect(claimAnnouncement('t', 0)).toBe(false);
  });
});

describe('queued toasts (§17.1)', () => {
  it('claims nothing for a toast queued before any Toaster, until it is rendered', () => {
    create('t');
    expect(phaseOf('t')).toBe('queued');
    expect(claimAnnouncement('t', 0)).toBe(false);
    expect(announcedOf('t')).toBeUndefined();
    activateToaster();
    expect(phaseOf('t')).toBe('entering');
    expect(claimAnnouncement('t', 0)).toBe(true);
  });

  it('claims only the latest revision of a toast replaced while it waited in a queue', () => {
    const { token } = activateToaster();
    configure(token, { maxVisible: 1 });
    create('a');
    create('b');
    replace('b');
    replace('b');
    expect(phaseOf('b')).toBe('queued');
    expect(claimAnnouncement('b', 2)).toBe(false);
    expect(announcedOf('b')).toBeUndefined();

    dismiss('a');
    exited('a');
    expect(phaseOf('b')).toBe('entering');
    expect(claimAnnouncement('b', 0)).toBe(false);
    expect(claimAnnouncement('b', 1)).toBe(false);
    expect(claimAnnouncement('b', 2)).toBe(true);
  });
});

describe('moves that keep the record (§8.4, §8.5, §14)', () => {
  it('keeps the claim when the Toaster detaches and its toasts go back to the queue', async () => {
    const { detach } = activateToaster();
    create('t');
    entered('t');
    expect(claimAnnouncement('t', 0)).toBe(true);
    detach();
    await settle();
    expect(phaseOf('t')).toBe('queued');
    expect(announcedOf('t')).toBe(0);

    activateToaster();
    expect(phaseOf('t')).toBe('entering');
    expect(claimAnnouncement('t', 0)).toBe(false);
  });

  it('keeps the claim when a waiting Toaster takes over', async () => {
    const { detach } = activateToaster();
    activateToaster();
    create('t');
    expect(claimAnnouncement('t', 0)).toBe(true);
    detach();
    await settle();
    expect(phaseOf('t')).toBe('entering');
    expect(announcedOf('t')).toBe(0);
    expect(claimAnnouncement('t', 0)).toBe(false);
  });

  it('claims a relocation once, as a replacement, and not again when it arrives', () => {
    activateToaster();
    create('t');
    entered('t');
    expect(claimAnnouncement('t', 0)).toBe(true);
    replace('t', { position: 'bottom-left' });
    expect(record('t')?.exit).toEqual({ reason: 'relocate', relocateTo: 'bottom-left' });
    expect(claimAnnouncement('t', 1)).toBe(true);

    exited('t');
    expect(record('t')).toMatchObject({ position: 'bottom-left', phase: 'entering' });
    expect(revisionOf('t')).toBe(1);
    expect(claimAnnouncement('t', 1)).toBe(false);
  });

  it('keeps a relocation claim through a detach that completes the relocation', async () => {
    const { detach } = activateToaster();
    create('t');
    entered('t');
    replace('t', { position: 'bottom-left' });
    expect(claimAnnouncement('t', 1)).toBe(true);
    detach();
    await settle();
    expect(record('t')).toMatchObject({ position: 'bottom-left', phase: 'queued' });

    activateToaster();
    expect(claimAnnouncement('t', 1)).toBe(false);
  });

  it('lets a relocated toast that was not yet claimed be claimed once at its destination', () => {
    activateToaster();
    create('t');
    entered('t');
    replace('t', { position: 'bottom-left' });
    exited('t');
    expect(phaseOf('t')).toBe('entering');
    expect(claimAnnouncement('t', 1)).toBe(true);
    expect(claimAnnouncement('t', 1)).toBe(false);
  });

  it('makes a revival claimable, as a replacement', () => {
    activateToaster();
    create('t');
    entered('t');
    expect(claimAnnouncement('t', 0)).toBe(true);
    dismiss('t');
    replace('t');
    expect(phaseOf('t')).toBe('entering');
    expect(claimAnnouncement('t', 1)).toBe(true);
  });

  it('makes a promise settlement claimable, as a replacement', () => {
    activateToaster();
    const token = Symbol('promise');
    upsert({
      type: 'loading',
      custom: false,
      content: 'Saving',
      options: { id: 'p' },
      promiseToken: token,
    });
    expect(claimAnnouncement('p', 0)).toBe(true);
    settleOwned('p', token, 'error', 'Failed');
    expect(record('p')).toMatchObject({ type: 'error', revision: 1 });
    expect(claimAnnouncement('p', 1)).toBe(true);
  });
});

describe('the claim dies with the record', () => {
  it('a removed toast claims nothing, and a new toast with its ID starts unannounced', () => {
    activateToaster();
    create('t');
    expect(claimAnnouncement('t', 0)).toBe(true);
    dismiss('t');
    exited('t');
    expect(record('t')).toBeUndefined();
    expect(claimAnnouncement('t', 0)).toBe(false);

    create('t');
    expect(record('t')).toMatchObject({ revision: 0, announcedRevision: undefined });
    expect(claimAnnouncement('t', 0)).toBe(true);
  });

  it('a queued toast dismissed directly takes its unclaimed state with it', () => {
    create('t');
    dismiss('t');
    activateToaster();
    create('t');
    expect(claimAnnouncement('t', 0)).toBe(true);
  });

  it('resetStore clears every claim', () => {
    activateToaster();
    create('t');
    expect(claimAnnouncement('t', 0)).toBe(true);
    resetStore();
    expect(claimAnnouncement('t', 0)).toBe(false);
    activateToaster();
    create('t');
    expect(claimAnnouncement('t', 0)).toBe(true);
  });
});

describe('a claim is bookkeeping only', () => {
  it('notifies no subscriber, for a successful or a duplicate claim', () => {
    activateToaster();
    create('t');
    entered('t');
    const listener = vi.fn();
    subscribe(listener);
    expect(claimAnnouncement('t', 0)).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    expect(claimAnnouncement('t', 0)).toBe(false);
    expect(claimAnnouncement('t', 5)).toBe(false);
    expect(claimAnnouncement('missing', 0)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the snapshot, its lists and the view, and puts nothing in the view', () => {
    activateToaster();
    create('t');
    entered('t');
    const snapshot = getSnapshot();
    const list = snapshot.byPosition['top-right'];
    const view = viewOf('t');
    expect(claimAnnouncement('t', 0)).toBe(true);
    expect(getSnapshot()).toBe(snapshot);
    expect(getSnapshot().byPosition['top-right']).toBe(list);
    expect(viewOf('t')).toBe(view);
    expect(view).not.toHaveProperty('announcedRevision');

    // The next real change rebuilds the views from the claimed record, still without the claim.
    replace('t');
    expect(viewOf('t')).not.toBe(view);
    expect(viewOf('t')).not.toHaveProperty('announcedRevision');
  });

  it('changes nothing else about the record and schedules nothing', () => {
    const { token } = activateToaster();
    configure(token, { maxVisible: 1 });
    create('t');
    create('waiting');
    entered('t');
    const before = inspectRecords();
    const timers = vi.getTimerCount();
    expect(claimAnnouncement('t', 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(timers);
    const after = inspectRecords();
    const unclaimed = (records: typeof before) =>
      records.map(candidate => ({ ...candidate, announcedRevision: undefined }));
    expect(after.map(candidate => candidate.id)).toEqual(['t', 'waiting']);
    expect(unclaimed(after)).toEqual(unclaimed(before));
    expect(after[0]?.announcedRevision).toBe(0);
    expect(after[0]?.timer).toBe(before[0]?.timer);
    expect(phaseOf('waiting')).toBe('queued');
  });

  it('lets the timer that was running when it claimed still expire the toast', () => {
    activateToaster();
    create('t', { duration: 1000 });
    entered('t');
    expect(claimAnnouncement('t', 0)).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(phaseOf('t')).toBe('exiting');
    expect(record('t')?.exit).toEqual({ reason: 'timeout' });
  });
});
