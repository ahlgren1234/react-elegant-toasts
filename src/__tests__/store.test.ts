import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attach,
  dismiss,
  entered,
  exited,
  getSnapshot,
  inspectRecords,
  resetStore,
  subscribe,
  upsert,
} from '../store/store';
import type { ToastInput } from '../store/types';
import type { ToastId, ToastOptions, ToastPosition } from '../types';

function input(content: string, options?: ToastOptions): ToastInput {
  return { type: 'default', custom: false, content, options };
}

function create(content: string, options?: ToastOptions): ToastId {
  const id = upsert(input(content, options));
  if (id === undefined) throw new Error('creation was rejected');
  return id;
}

function record(id: ToastId) {
  return inspectRecords().find(candidate => candidate.id === id);
}

function rendered(position: ToastPosition = 'top-right') {
  return getSnapshot().byPosition[position].map(view => view.id);
}

/** Attaches a Toaster directly through the store, without React. */
function activateToaster() {
  const token = {};
  return { token, detach: attach(token) };
}

// Two-Toaster cases log the extra-Toaster development warning; its content is tested elsewhere.
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

/** Lets queued microtasks, such as a deferred Toaster detach, run. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('snapshot and subscription', () => {
  it('starts empty, frozen and stable', () => {
    const snapshot = getSnapshot();
    expect(snapshot.active).toBeNull();
    expect(Object.values(snapshot.byPosition).every(list => list.length === 0)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.byPosition)).toBe(true);
    expect(getSnapshot()).toBe(snapshot);
  });

  it('returns a new frozen snapshot after an effective change and keeps it until the next one', () => {
    const before = getSnapshot();
    const { token } = activateToaster();
    const afterAttach = getSnapshot();
    expect(afterAttach).not.toBe(before);
    expect(afterAttach.active).toBe(token);

    const id = create('Saved');
    const snapshot = getSnapshot();
    expect(snapshot).not.toBe(afterAttach);
    expect(getSnapshot()).toBe(snapshot);
    const [view] = snapshot.byPosition['top-right'];
    expect(view).toMatchObject({ id, content: 'Saved', phase: 'entering', type: 'default' });
    expect(Object.isFrozen(snapshot.byPosition['top-right'])).toBe(true);
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view?.options)).toBe(true);
  });

  it('keeps unchanged position lists and views by identity', () => {
    activateToaster();
    const first = create('First', { position: 'bottom-left' });
    const bottomLeft = getSnapshot().byPosition['bottom-left'];
    create('Second', { position: 'top-right' });
    expect(getSnapshot().byPosition['bottom-left']).toBe(bottomLeft);
    entered(first);
    expect(getSnapshot().byPosition['bottom-left']).not.toBe(bottomLeft);
  });

  it('holds only rendered toasts, ordered by seq within each position', () => {
    const queued = create('Queued while no Toaster is active');
    expect(rendered()).toEqual([]);
    activateToaster();
    const second = create('Second');
    const elsewhere = create('Elsewhere', { position: 'bottom-center' });
    expect(rendered()).toEqual([queued, second]);
    expect(rendered('bottom-center')).toEqual([elsewhere]);
  });

  it('does not notify for commands that change nothing rendered', () => {
    const listener = vi.fn();
    subscribe(listener);
    create('Queued, so not rendered');
    dismiss('unknown');
    entered('unknown');
    exited('unknown');
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies once per command', () => {
    activateToaster();
    create('One');
    create('Two');
    create('Three');
    const listener = vi.fn();
    subscribe(listener);
    dismiss();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('coalesces a command issued during a notification into a later round', () => {
    activateToaster();
    const seen: number[] = [];
    let nestedId: ToastId | undefined;
    subscribe(() => {
      seen.push(rendered().length);
      if (nestedId === undefined) nestedId = upsert(input('Nested'));
    });
    create('Outer');
    expect(nestedId).toEqual(expect.any(String));
    expect(seen).toEqual([1, 2]);
  });

  it('stops notifying after unsubscribe', () => {
    activateToaster();
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    create('Notified');
    unsubscribe();
    create('Not notified');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('creation', () => {
  it('stores the call content, description, position and options', () => {
    const onDismiss = vi.fn();
    const id = create('Saved', {
      description: 'All changes are stored',
      position: 'bottom-left',
      duration: 3000,
      closeButton: false,
      className: 'custom',
      onDismiss,
    });
    expect(record(id)).toMatchObject({
      type: 'default',
      custom: false,
      content: 'Saved',
      description: 'All changes are stored',
      position: 'bottom-left',
      phase: 'queued',
      revision: 0,
      options: { duration: 3000, closeButton: false, className: 'custom', onDismiss },
    });
  });

  it('defaults the position to top-right', () => {
    expect(record(create('Default'))?.position).toBe('top-right');
  });

  it('honours an explicit id and treats an empty id as none', () => {
    expect(create('Explicit', { id: 'explicit' })).toBe('explicit');
    const generated = create('Empty id', { id: '' });
    expect(generated).not.toBe('');
    expect(record(generated)?.content).toBe('Empty id');
  });

  it('copies options field by field, so no option can set store-owned state (D-02)', () => {
    const smuggled = {
      phase: 'exiting',
      seq: 99,
      revision: 42,
      exit: { reason: 'timeout' },
      type: 'error',
      custom: true,
      content: 'Smuggled',
    } as unknown as ToastOptions;
    const id = create('Real', smuggled);
    const stored = record(id);
    expect(stored).toMatchObject({
      phase: 'queued',
      seq: 1,
      revision: 0,
      exit: undefined,
      type: 'default',
      custom: false,
      content: 'Real',
    });
    expect(Object.keys(stored?.options ?? {})).toEqual([]);
  });
});

describe('replacement (§14)', () => {
  it('replaces a queued toast in place, without merging', () => {
    const id = create('First', { id: 'job', description: 'Old', className: 'old' });
    create('Second', { id: 'job' });
    expect(record(id)).toMatchObject({ content: 'Second', seq: 1, revision: 1, phase: 'queued' });
    expect(record(id)?.description).toBeUndefined();
    expect(record(id)?.options).toEqual({});
  });

  it('moves a queued toast to the back of its new position', () => {
    // Explicit: an omitted position here would be pending, and a pending one never moves (§11).
    create('Job', { id: 'job', position: 'top-right' });
    create('Other');
    create('Job moved', { id: 'job', position: 'bottom-right' });
    expect(record('job')).toMatchObject({ position: 'bottom-right', seq: 3, phase: 'queued' });
  });

  it('replaces entering and visible toasts in place', () => {
    activateToaster();
    create('Entering', { id: 'a' });
    create('Visible', { id: 'b' });
    entered('b');
    create('Entering again', { id: 'a' });
    create('Visible again', { id: 'b' });
    expect(record('a')).toMatchObject({
      phase: 'entering',
      revision: 1,
      content: 'Entering again',
    });
    expect(record('b')).toMatchObject({ phase: 'visible', revision: 1, content: 'Visible again' });
  });

  it('relocates a rendered toast through a relocate exit, without callbacks', () => {
    activateToaster();
    const onDismiss = vi.fn();
    create('Here', { id: 'job', onDismiss });
    entered('job');
    create('There', { id: 'job', position: 'bottom-left', onDismiss });
    expect(record('job')).toMatchObject({
      phase: 'exiting',
      position: 'top-right',
      exit: { reason: 'relocate', relocateTo: 'bottom-left' },
    });
    expect(rendered()).toEqual(['job']);

    exited('job');
    expect(record('job')).toMatchObject({ position: 'bottom-left', seq: 2, phase: 'entering' });
    expect(rendered()).toEqual([]);
    expect(rendered('bottom-left')).toEqual(['job']);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('revives an exiting toast at the same position, without onDismiss', () => {
    activateToaster();
    const onDismiss = vi.fn();
    create('Closing', { id: 'job', onDismiss });
    dismiss('job');
    create('Back', { id: 'job', onDismiss });
    expect(record('job')).toMatchObject({ phase: 'entering', exit: undefined, revision: 1 });
    exited('job');
    expect(record('job')?.phase).toBe('entering');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('turns an exit into a relocation when an exiting toast is replaced at another position', () => {
    activateToaster();
    const onDismiss = vi.fn();
    create('Closing', { id: 'job', onDismiss });
    dismiss('job');
    create('Elsewhere', { id: 'job', position: 'top-left', onDismiss });
    expect(record('job')?.exit).toEqual({ reason: 'relocate', relocateTo: 'top-left' });
    exited('job');
    expect(record('job')).toMatchObject({ position: 'top-left', phase: 'entering' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('creates a new toast when the id was removed', () => {
    create('First', { id: 'job' });
    dismiss('job');
    create('Again', { id: 'job' });
    expect(record('job')).toMatchObject({ seq: 2, revision: 0, content: 'Again' });
  });
});

describe('lifecycle and dismissal', () => {
  it('runs queued → entering → visible → exiting → removed, with onDismiss once', () => {
    activateToaster();
    const onDismiss = vi.fn();
    const id = create('Saved', { onDismiss, description: 'Details' });
    expect(record(id)?.phase).toBe('entering');
    entered(id);
    expect(record(id)?.phase).toBe('visible');
    dismiss(id);
    expect(record(id)).toMatchObject({ phase: 'exiting', exit: { reason: 'programmatic' } });
    expect(onDismiss).not.toHaveBeenCalled();
    exited(id);
    expect(record(id)).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(
      { id, type: 'default', content: 'Saved', description: 'Details' },
      'programmatic'
    );
  });

  it('removes a queued toast directly when dismissed', () => {
    const onDismiss = vi.fn();
    const id = create('Waiting', { onDismiss });
    dismiss(id, 'close-button');
    expect(record(id)).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledWith(
      { id, type: 'default', content: 'Waiting' },
      'close-button'
    );
  });

  it('ignores dismissing an exiting toast, and ignores out-of-phase reports', () => {
    activateToaster();
    const onDismiss = vi.fn();
    const id = create('Closing', { onDismiss });
    exited(id);
    expect(record(id)?.phase).toBe('entering');
    dismiss(id, 'close-button');
    dismiss(id, 'swipe');
    entered(id);
    expect(record(id)).toMatchObject({ phase: 'exiting', exit: { reason: 'close-button' } });
    exited(id);
    exited(id);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(expect.anything(), 'close-button');
  });

  it('turns a pending relocation into a removal when the toast is dismissed', () => {
    activateToaster();
    const onDismiss = vi.fn();
    create('Here', { id: 'job', onDismiss });
    create('There', { id: 'job', position: 'top-left', onDismiss });
    expect(record('job')?.exit).toEqual({ reason: 'relocate', relocateTo: 'top-left' });
    dismiss('job');
    expect(record('job')?.exit).toEqual({ reason: 'programmatic' });
    exited('job');
    expect(record('job')).toBeUndefined();
    expect(rendered('top-left')).toEqual([]);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(
      { id: 'job', type: 'default', content: 'There' },
      'programmatic'
    );
  });

  it('dismisses every toast according to its phase when no id is given', () => {
    const queuedDismiss = vi.fn();
    const queued = create('Queued', { onDismiss: queuedDismiss });
    dismiss();
    expect(record(queued)).toBeUndefined();
    expect(queuedDismiss).toHaveBeenCalledTimes(1);

    activateToaster();
    const a = create('A');
    const b = create('B');
    const c = create('C');
    entered(b);
    dismiss(c, 'action');
    dismiss();
    expect(record(a)?.exit).toEqual({ reason: 'programmatic' });
    expect(record(b)?.exit).toEqual({ reason: 'programmatic' });
    expect(record(c)?.exit).toEqual({ reason: 'action' });
  });

  it('calls the latest onDismiss after a replacement', () => {
    const first = vi.fn();
    const second = vi.fn();
    create('First', { id: 'job', onDismiss: first });
    create('Second', { id: 'job', onDismiss: second });
    dismiss('job');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(
      { id: 'job', type: 'default', content: 'Second' },
      'programmatic'
    );
  });

  it('runs onDismiss after subscribers are notified', () => {
    activateToaster();
    const order: string[] = [];
    const id = create('Saved', {
      onDismiss: () => order.push(`callback: rendered ${rendered().length}`),
    });
    dismiss(id);
    subscribe(() => order.push(`notified: rendered ${rendered().length}`));
    exited(id);
    expect(order).toEqual(['notified: rendered 0', 'callback: rendered 0']);
  });

  it('isolates a throwing callback from the store and from other callbacks', () => {
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    const failure = new Error('callback failed');
    const second = vi.fn();
    create('First', {
      onDismiss: () => {
        throw failure;
      },
    });
    create('Second', { onDismiss: second });
    dismiss();
    expect(second).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(failure);
    expect(inspectRecords()).toEqual([]);
    expect(upsert(input('Still works'))).toEqual(expect.any(String));
  });
});

describe('Toaster detach (§8.4)', () => {
  it('re-queues rendered toasts and finishes exits once the detach completes', async () => {
    const { detach } = activateToaster();
    const dismissed = vi.fn();
    const visible = create('Visible');
    entered(visible);
    const entering = create('Entering');
    const closing = create('Closing', { onDismiss: dismissed });
    dismiss(closing);
    create('Moving', { id: 'moving' });
    create('Moving', { id: 'moving', position: 'bottom-right' });

    detach();
    expect(getSnapshot().active).not.toBeNull();
    await settle();

    expect(getSnapshot().active).toBeNull();
    expect(record(visible)).toMatchObject({ phase: 'queued', seq: 1 });
    expect(record(entering)).toMatchObject({ phase: 'queued', seq: 2 });
    expect(record(closing)).toBeUndefined();
    expect(dismissed).toHaveBeenCalledWith(expect.anything(), 'programmatic');
    expect(record('moving')).toMatchObject({ phase: 'queued', position: 'bottom-right', seq: 5 });
  });

  it('runs the detach effects before a waiting Toaster takes over', async () => {
    const first = activateToaster();
    const second = activateToaster();
    const dismissed = vi.fn();
    const visible = create('Visible');
    entered(visible);
    const closing = create('Closing', { onDismiss: dismissed });
    dismiss(closing);

    first.detach();
    await settle();

    expect(getSnapshot().active).toBe(second.token);
    expect(record(visible)?.phase).toBe('entering');
    expect(record(closing)).toBeUndefined();
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending detach when the same Toaster attaches again', async () => {
    const first = activateToaster();
    activateToaster();
    const id = create('Visible');
    entered(id);
    first.detach();
    attach(first.token);
    await settle();
    expect(getSnapshot().active).toBe(first.token);
    expect(record(id)?.phase).toBe('visible');
  });

  it('drops a waiting Toaster silently when it detaches', async () => {
    const first = activateToaster();
    const second = activateToaster();
    second.detach();
    await settle();
    first.detach();
    await settle();
    expect(getSnapshot().active).toBeNull();
  });

  it('ignores a detach that was scheduled before resetStore', async () => {
    const { detach } = activateToaster();
    detach();
    resetStore();
    const { token } = activateToaster();
    await settle();
    expect(getSnapshot().active).toBe(token);
  });
});

describe('inspectRecords', () => {
  it('returns frozen copies that cannot change the store', () => {
    const id = create('Original', { className: 'kept' });
    const [copy] = inspectRecords();
    expect(Object.isFrozen(inspectRecords())).toBe(true);
    expect(Object.isFrozen(copy)).toBe(true);
    expect(Object.isFrozen(copy?.options)).toBe(true);
    expect(() => {
      (copy as { content: string }).content = 'Changed';
    }).toThrow(TypeError);
    expect(() => {
      (copy?.options as { className: string }).className = 'changed';
    }).toThrow(TypeError);
    expect(record(id)).toMatchObject({ content: 'Original', options: { className: 'kept' } });
    expect(inspectRecords()[0]).not.toBe(copy);
  });
});
