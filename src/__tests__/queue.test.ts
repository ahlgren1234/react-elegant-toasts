import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attach,
  configure,
  dismiss,
  entered,
  exited,
  getSnapshot,
  inspectRecords,
  subscribe,
  upsert,
} from '../store/store';
import type { ToastInput } from '../store/types';
import type { ToastId, ToastOptions, ToastPosition, ToastType } from '../types';

const POSITIONS: readonly ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

function create(id: string, options?: ToastOptions, type: ToastType = 'default'): ToastId {
  const input: ToastInput = {
    type,
    custom: type === 'custom',
    content: id,
    options: { id, ...options },
  };
  const created = upsert(input);
  if (created === undefined) throw new Error('creation was rejected');
  return created;
}

/** Creates `count` toasts named `${prefix}1` … at one position. */
function createMany(prefix: string, count: number, position?: ToastPosition): ToastId[] {
  return Array.from({ length: count }, (_, index) =>
    create(`${prefix}${index + 1}`, position && { position })
  );
}

function record(id: ToastId) {
  return inspectRecords().find(candidate => candidate.id === id);
}

function rendered(position: ToastPosition = 'top-right'): ToastId[] {
  return getSnapshot().byPosition[position].map(view => view.id);
}

function queued(position: ToastPosition = 'top-right'): ToastId[] {
  return inspectRecords()
    .filter(candidate => candidate.position === position && candidate.phase === 'queued')
    .map(candidate => candidate.id);
}

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

// Two-Toaster cases log the extra-Toaster development warning; its content is tested elsewhere.
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('capacity per position (§11)', () => {
  it('D-12: overflow is queued, never dropped', () => {
    activateToaster();
    const onDismiss = vi.fn();
    for (let index = 1; index <= 10; index++) create(`t${index}`, { onDismiss });
    expect(inspectRecords()).toHaveLength(10);
    expect(rendered()).toEqual(['t1', 't2', 't3', 't4']);
    expect(queued()).toEqual(['t5', 't6', 't7', 't8', 't9', 't10']);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('renders at most 4 toasts per position by default', () => {
    const ids = createMany('t', 5);
    activateToaster();
    expect(rendered()).toEqual(ids.slice(0, 4));
    expect(record('t5')?.phase).toBe('queued');
  });

  it('promotes queued toasts in FIFO seq order as slots free', () => {
    activateToaster();
    createMany('t', 7);
    for (const id of ['t1', 't2', 't3']) {
      dismiss(id);
      exited(id);
    }
    expect(rendered()).toEqual(['t4', 't5', 't6', 't7']);
    expect(inspectRecords().map(candidate => candidate.seq)).toEqual([4, 5, 6, 7]);
  });

  it('keeps all six positions independent', () => {
    activateToaster();
    createMany('full-', 6, 'top-right');
    for (const position of POSITIONS) create(`${position}-a`, { position });
    for (const position of POSITIONS) {
      if (position === 'top-right') {
        expect(rendered(position)).toEqual(['full-1', 'full-2', 'full-3', 'full-4']);
        expect(queued(position)).toEqual(['full-5', 'full-6', 'top-right-a']);
      } else {
        expect(rendered(position)).toEqual([`${position}-a`]);
        expect(queued(position)).toEqual([]);
      }
    }

    // Filling every other position never frees or uses capacity at top-right.
    for (const position of POSITIONS) {
      if (position !== 'top-right') createMany(`${position}-more-`, 5, position);
    }
    for (const position of POSITIONS) expect(rendered(position)).toHaveLength(4);
    expect(queued('top-right')).toEqual(['full-5', 'full-6', 'top-right-a']);

    dismiss('full-1');
    exited('full-1');
    expect(rendered('top-right')).toEqual(['full-2', 'full-3', 'full-4', 'full-5']);
    expect(queued('bottom-left')).toEqual(['bottom-left-more-4', 'bottom-left-more-5']);
  });

  it('applies the same capacity to custom toasts', () => {
    activateToaster();
    create('normal-1');
    create('custom-1', undefined, 'custom');
    create('custom-2', undefined, 'custom');
    create('normal-2');
    create('custom-3', undefined, 'custom');
    expect(rendered()).toEqual(['normal-1', 'custom-1', 'custom-2', 'normal-2']);
    expect(record('custom-3')).toMatchObject({ custom: true, phase: 'queued' });
  });

  it('keeps slots for persistent and loading toasts until they leave', () => {
    activateToaster();
    create('loading-1', undefined, 'loading');
    create('loading-2', undefined, 'loading');
    create('forever-1', { duration: Infinity });
    create('forever-2', { duration: Infinity });
    create('waiting');
    for (const id of ['loading-1', 'loading-2', 'forever-1', 'forever-2']) entered(id);
    expect(record('waiting')?.phase).toBe('queued');

    // A replacement keeps the slot; only leaving the position frees it.
    create('forever-1', { duration: 3000 });
    expect(record('waiting')?.phase).toBe('queued');
    dismiss('loading-1');
    exited('loading-1');
    expect(record('waiting')?.phase).toBe('entering');
  });
});

describe('slot lifecycle', () => {
  it('holds a slot while entering, visible and exiting, and frees it only on exited', () => {
    activateToaster();
    createMany('t', 5);
    entered('t2');
    dismiss('t3');
    expect(inspectRecords().map(candidate => candidate.phase)).toEqual([
      'entering',
      'visible',
      'exiting',
      'entering',
      'queued',
    ]);
    entered('t1');
    entered('t4');
    expect(record('t5')?.phase).toBe('queued');

    exited('t3');
    expect(record('t3')).toBeUndefined();
    expect(record('t5')?.phase).toBe('entering');
  });

  it('publishes the removal and the promotion in one notification', () => {
    activateToaster();
    createMany('t', 5);
    dismiss('t1');
    const seen: ToastId[][] = [];
    subscribe(() => seen.push(rendered()));
    exited('t1');
    expect(seen).toEqual([['t2', 't3', 't4', 't5']]);
  });

  it('is idempotent: commands that free nothing promote nothing', () => {
    activateToaster();
    createMany('t', 6);
    const listener = vi.fn();
    subscribe(listener);
    entered('t1');
    exited('t2');
    dismiss('unknown');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(queued()).toEqual(['t5', 't6']);
  });
});

describe('dismissal and capacity', () => {
  it('does not promote when a queued toast is dismissed', () => {
    activateToaster();
    const onDismiss = vi.fn();
    createMany('t', 4);
    create('t5', { onDismiss });
    create('t6');
    const listener = vi.fn();
    subscribe(listener);
    dismiss('t5', 'close-button');
    expect(listener).not.toHaveBeenCalled();
    expect(rendered()).toEqual(['t1', 't2', 't3', 't4']);
    expect(queued()).toEqual(['t6']);
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 't5' }),
      'close-button'
    );
  });

  it('does not promote when a rendered toast is dismissed, only once it has exited', () => {
    activateToaster();
    createMany('t', 5);
    dismiss('t2', 'action');
    expect(record('t5')?.phase).toBe('queued');
    expect(rendered()).toEqual(['t1', 't2', 't3', 't4']);
    exited('t2');
    expect(rendered()).toEqual(['t1', 't3', 't4', 't5']);
  });

  it('dismisses everything: queued toasts leave now, rendered ones keep their slots until exited', () => {
    activateToaster();
    const onDismiss = vi.fn();
    for (let index = 1; index <= 6; index++) create(`t${index}`, { onDismiss });
    entered('t1');
    dismiss();
    expect(inspectRecords().map(candidate => [candidate.id, candidate.phase])).toEqual([
      ['t1', 'exiting'],
      ['t2', 'exiting'],
      ['t3', 'exiting'],
      ['t4', 'exiting'],
    ]);
    expect(onDismiss.mock.calls.map(([toast]) => (toast as { id: string }).id)).toEqual([
      't5',
      't6',
    ]);

    // A toast created while the exits are pending waits for a slot.
    create('late');
    expect(record('late')?.phase).toBe('queued');
    exited('t3');
    expect(record('late')?.phase).toBe('entering');
    for (const id of ['t1', 't2', 't4']) exited(id);
    expect(onDismiss).toHaveBeenCalledTimes(6);
    for (const [, reason] of onDismiss.mock.calls) expect(reason).toBe('programmatic');
  });
});

describe('replacement and capacity (§14)', () => {
  it('keeps the queue place of a queued toast replaced at the same position', () => {
    activateToaster();
    createMany('t', 7);
    create('t5', { description: 'Replaced' });
    expect(record('t5')).toMatchObject({ seq: 5, revision: 1, phase: 'queued' });
    dismiss('t1');
    exited('t1');
    expect(record('t5')?.phase).toBe('entering');
    expect(queued()).toEqual(['t6', 't7']);
  });

  it('moves a queued toast to the tail of its new position, and promotes it there if a slot is free', () => {
    activateToaster();
    createMany('t', 5);
    createMany('b', 6, 'bottom-left');
    create('t5', { position: 'bottom-left' });
    expect(record('t5')).toMatchObject({ position: 'bottom-left', seq: 12, phase: 'queued' });
    expect(queued('bottom-left')).toEqual(['b5', 'b6', 't5']);
    expect(queued()).toEqual([]);

    create('t5', { position: 'top-center' });
    expect(record('t5')).toMatchObject({ position: 'top-center', seq: 13, phase: 'entering' });
  });

  it('keeps the slot of a rendered toast replaced at the same position', () => {
    activateToaster();
    createMany('t', 5);
    entered('t2');
    create('t1', { description: 'Replaced' });
    create('t2', { description: 'Replaced' });
    expect(record('t1')).toMatchObject({ phase: 'entering', seq: 1 });
    expect(record('t2')).toMatchObject({ phase: 'visible', seq: 2 });
    expect(record('t5')?.phase).toBe('queued');
  });

  it('keeps the old slot through a relocation exit, then joins the destination tail', () => {
    activateToaster();
    const onDismiss = vi.fn();
    create('job', { onDismiss });
    createMany('t', 4);
    createMany('b', 5, 'bottom-left');
    create('job', { position: 'bottom-left', onDismiss });

    // Still counted at top-right, not at bottom-left.
    expect(record('job')).toMatchObject({ phase: 'exiting', position: 'top-right' });
    expect(rendered()).toEqual(['job', 't1', 't2', 't3']);
    expect(record('t4')?.phase).toBe('queued');
    expect(rendered('bottom-left')).toEqual(['b1', 'b2', 'b3', 'b4']);

    exited('job');
    expect(record('job')).toMatchObject({ position: 'bottom-left', seq: 11, phase: 'queued' });
    expect(queued('bottom-left')).toEqual(['b5', 'job']);
    expect(rendered()).toEqual(['t1', 't2', 't3', 't4']);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('promotes at both positions in the one notification that completes a relocation', () => {
    activateToaster();
    create('job');
    createMany('t', 4);
    create('job', { position: 'bottom-left' });
    const seen: [ToastId[], ToastId[]][] = [];
    subscribe(() => seen.push([rendered(), rendered('bottom-left')]));
    exited('job');
    expect(seen).toEqual([[['t1', 't2', 't3', 't4'], ['job']]]);
    expect(record('job')?.phase).toBe('entering');
  });

  it('never joins the destination when a relocation becomes a dismissal', () => {
    activateToaster();
    const onDismiss = vi.fn();
    create('job', { onDismiss });
    createMany('t', 4);
    create('job', { position: 'bottom-left', onDismiss });
    dismiss('job', 'close-button');
    expect(record('t4')?.phase).toBe('queued');
    exited('job');
    expect(record('job')).toBeUndefined();
    expect(rendered('bottom-left')).toEqual([]);
    expect(rendered()).toEqual(['t1', 't2', 't3', 't4']);
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'job' }),
      'close-button'
    );
  });

  it('revives an exiting toast at a full position without taking another slot (AC-LC-3)', () => {
    activateToaster();
    const onDismiss = vi.fn();
    create('job', { onDismiss });
    createMany('t', 4);
    dismiss('job');
    create('job', { onDismiss });
    expect(record('job')).toMatchObject({ phase: 'entering', seq: 1, exit: undefined });
    expect(rendered()).toEqual(['job', 't1', 't2', 't3']);
    expect(record('t4')?.phase).toBe('queued');
    exited('job');
    expect(record('t4')?.phase).toBe('queued');
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('detach and takeover with a queue', () => {
  it('re-queues rendered toasts with their seq, ahead of later toasts, and keeps them queued', async () => {
    const { detach } = activateToaster();
    createMany('t', 6);
    entered('t1');
    detach();
    await settle();
    expect(getSnapshot().active).toBeNull();
    expect(
      inspectRecords().map(candidate => [candidate.id, candidate.seq, candidate.phase])
    ).toEqual([1, 2, 3, 4, 5, 6].map(seq => [`t${seq}`, seq, 'queued']));

    activateToaster();
    expect(rendered()).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('promotes FIFO under a waiting Toaster that takes over', async () => {
    const first = activateToaster();
    activateToaster();
    createMany('t', 6);
    dismiss('t2');
    first.detach();
    await settle();
    expect(rendered()).toEqual(['t1', 't3', 't4', 't5']);
    expect(queued()).toEqual(['t6']);
  });
});

describe('Toaster configuration', () => {
  /** Attaches a Toaster configured with `maxVisible` first, as the Toaster component does. */
  function activateConfigured(maxVisible: number | undefined) {
    const token = {};
    configure(token, { maxVisible });
    return { token, detach: attach(token) };
  }

  it('applies a configured maxVisible from the first promotion', () => {
    createMany('t', 4);
    activateConfigured(2);
    expect(rendered()).toEqual(['t1', 't2']);
    createMany('b', 3, 'bottom-left');
    expect(rendered('bottom-left')).toEqual(['b1', 'b2']);
  });

  it.each([
    [1, 1],
    [7, 7],
    [2.0, 2],
    [undefined, 4],
    [0, 4],
    [-1, 4],
    [Number.NaN, 4],
    [2.5, 4],
    [Infinity, 4],
    [-Infinity, 4],
  ])('resolves maxVisible %s to %s', (maxVisible, expected) => {
    activateConfigured(maxVisible);
    createMany('t', 10);
    expect(rendered()).toHaveLength(expected);
    expect(inspectRecords()).toHaveLength(10);
  });

  it('promotes FIFO at every position at once when the active limit rises', () => {
    const { token } = activateConfigured(2);
    createMany('t', 6);
    createMany('b', 3, 'bottom-left');
    createMany('c', 1, 'top-center');
    const seen: [ToastId[], ToastId[], ToastId[]][] = [];
    subscribe(() => seen.push([rendered(), rendered('bottom-left'), rendered('top-center')]));
    configure(token, { maxVisible: 5 });
    expect(seen).toEqual([[['t1', 't2', 't3', 't4', 't5'], ['b1', 'b2', 'b3'], ['c1']]]);
    expect(queued()).toEqual(['t6']);
  });

  it('removes nothing when the active limit falls, and promotes again only below the new limit', () => {
    const { token } = activateConfigured(4);
    const onDismiss = vi.fn();
    for (let index = 1; index <= 6; index++) create(`t${index}`, { onDismiss });
    entered('t1');
    dismiss('t2');
    const before = inspectRecords();
    const listener = vi.fn();
    subscribe(listener);

    configure(token, { maxVisible: 2 });
    expect(listener).not.toHaveBeenCalled();
    expect(inspectRecords()).toEqual(before);
    expect(rendered()).toEqual(['t1', 't2', 't3', 't4']);

    // Occupancy 4 → 3 → 2: still at or above the limit, so nothing is promoted.
    exited('t2');
    dismiss('t3');
    exited('t3');
    expect(rendered()).toEqual(['t1', 't4']);
    expect(queued()).toEqual(['t5', 't6']);

    // Occupancy 1: one slot is free under the new limit.
    dismiss('t1');
    exited('t1');
    expect(rendered()).toEqual(['t4', 't5']);
    expect(queued()).toEqual(['t6']);
    expect(onDismiss).toHaveBeenCalledTimes(3);
  });

  it('does not notify when the configuration changes nothing rendered', () => {
    const { token } = activateConfigured(4);
    createMany('t', 3);
    const listener = vi.fn();
    subscribe(listener);
    configure(token, { maxVisible: 4 });
    configure(token, { maxVisible: undefined });
    configure(token, { maxVisible: 6 });
    configure(token, { maxVisible: 3 });
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps a waiting Toaster's configuration inert until it takes over", async () => {
    const first = activateConfigured(5);
    const second = activateConfigured(2);
    createMany('t', 6);
    expect(rendered()).toHaveLength(5);

    const listener = vi.fn();
    subscribe(listener);
    configure(second.token, { maxVisible: 1 });
    configure({}, { maxVisible: 1 });
    expect(listener).not.toHaveBeenCalled();
    expect(rendered()).toHaveLength(5);

    first.detach();
    await settle();
    expect(getSnapshot().active).toBe(second.token);
    expect(rendered()).toEqual(['t1']);
    expect(queued()).toEqual(['t2', 't3', 't4', 't5', 't6']);
  });

  it("promotes under the new owner's limit on takeover, never the departing owner's", async () => {
    const first = activateConfigured(2);
    activateConfigured(5);
    createMany('t', 6);
    expect(rendered()).toEqual(['t1', 't2']);
    first.detach();
    await settle();
    expect(rendered()).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });

  it('uses the default of 4 for a Toaster that takes over without a configuration', async () => {
    const first = activateConfigured(1);
    activateToaster();
    createMany('t', 6);
    first.detach();
    await settle();
    expect(rendered()).toHaveLength(4);
  });

  it('leaves every record queued when the configured owner detaches with no successor', async () => {
    const { detach } = activateConfigured(6);
    createMany('t', 8);
    detach();
    await settle();
    expect(inspectRecords().every(candidate => candidate.phase === 'queued')).toBe(true);
    expect(inspectRecords()).toHaveLength(8);
  });
});

describe('no-Toaster cap is unchanged (§8.4)', () => {
  it('counts every record against the cap, independently of maxVisible', async () => {
    const { detach } = activateToaster();
    createMany('t', 100);
    detach();
    await settle();
    expect(upsert({ type: 'default', custom: false, content: 'x', options: undefined })).toBe(
      undefined
    );
    expect(inspectRecords()).toHaveLength(100);
    dismiss('t1');
    expect(create('accepted')).toBe('accepted');
  });
});
