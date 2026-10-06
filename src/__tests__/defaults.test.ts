// Toaster defaults for toasts, store side (§6.3, §6.5, P-14): `position` and `duration`. A
// definition made while no Toaster is active has no default yet; it is pending until one is.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '../index';
import {
  attach,
  configure,
  entered,
  exited,
  getSnapshot,
  inspectRecords,
  subscribe,
  upsert,
} from '../store/store';
import type { StoreSnapshot } from '../store/types';
import type { ToastId, ToastOptions, ToastPosition, ToastType } from '../types';

type Config = Parameters<typeof configure>[1];

function create(id: string, options?: ToastOptions, type: ToastType = 'default'): ToastId {
  const created = upsert({
    type,
    custom: type === 'custom',
    content: id,
    options: { id, ...options },
  });
  if (created === undefined) throw new Error('creation was rejected');
  return created;
}

function record(id: ToastId | undefined) {
  const found = inspectRecords().find(candidate => candidate.id === id);
  if (!found) throw new Error(`no record ${String(id)}`);
  return found;
}

const view = (id: ToastId | undefined) =>
  Object.values(getSnapshot().byPosition)
    .flat()
    .find(candidate => candidate.id === id);

const rendered = (position: ToastPosition) =>
  getSnapshot().byPosition[position].map(candidate => candidate.id);

/** Configures a Toaster, then attaches it, in the order `<Toaster />` uses. */
function mountToaster(config?: Config) {
  const token = {};
  if (config) configure(token, config);
  return { token, detach: attach(token) };
}

/** Lets queued microtasks run: deferred detaches and promise reactions. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 5; tick++) await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const messages = { loading: 'Loading', success: 'Done', error: 'Failed' };
/** Plain-JS style values that the public types would reject. */
const smuggle = (value: unknown): never => value as never;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('definitions under an active Toaster', () => {
  it('give an omitted position the Toaster position, and an explicit one wins', () => {
    mountToaster({ position: 'bottom-center' });
    create('omitted');
    create('explicit', { position: 'top-left' });
    expect(record('omitted')).toMatchObject({ position: 'bottom-center', positionPending: false });
    expect(record('explicit')).toMatchObject({ position: 'top-left', positionPending: false });
    expect(rendered('bottom-center')).toEqual(['omitted']);
    expect(rendered('top-left')).toEqual(['explicit']);
  });

  it('give an omitted duration the Toaster duration, and an explicit one wins', () => {
    vi.useFakeTimers();
    mountToaster({ duration: 8000 });
    create('omitted');
    create('explicit', { duration: 1000 });
    create('zero', { duration: 0 });
    expect(record('omitted')).toMatchObject({
      timer: { duration: 8000, remaining: 8000 },
      durationPending: false,
    });
    expect(record('explicit').timer.duration).toBe(1000);
    expect(record('zero').timer.duration).toBe(0);

    entered('omitted');
    vi.advanceTimersByTime(7999);
    expect(record('omitted').phase).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(record('omitted').phase).toBe('exiting');
  });

  it('apply a Toaster duration of Infinity (persistent) and of 0 to finite types only', () => {
    const persistent = mountToaster({ duration: Infinity });
    create('forever');
    create('finite', { duration: 2500 });
    create('custom', undefined, 'custom');
    expect(record('forever').timer.duration).toBe(Infinity);
    expect(record('finite').timer.duration).toBe(2500);
    expect(record('custom').timer.duration).toBe(Infinity);

    configure(persistent.token, { duration: 0 });
    create('instant');
    create('loading', undefined, 'loading');
    expect(record('instant').timer.duration).toBe(0);
    expect(record('loading').timer.duration).toBe(Infinity);
  });

  it('normalise the Toaster duration like a per-toast one', () => {
    const { token } = mountToaster();
    const cases: [unknown, number][] = [
      [-50, 0],
      [1234.5, 1234.5],
      [NaN, 5000],
      [-Infinity, 5000],
      ['8000', 5000],
      [null, 5000],
      [undefined, 5000],
    ];
    for (const [index, [duration, expected]] of cases.entries()) {
      configure(token, { duration: smuggle(duration) });
      create(`t${index}`);
      expect(record(`t${index}`).timer.duration).toBe(expected);
    }
  });

  it('fall back to top-right for a missing or invalid Toaster position', () => {
    const { token } = mountToaster({ position: smuggle('middle') });
    create('invalid');
    configure(token, { position: undefined });
    create('missing');
    expect(record('invalid').position).toBe('top-right');
    expect(record('missing').position).toBe('top-right');
  });

  it('use top-right and 5000 ms under a Toaster that configured only maxVisible, or nothing', () => {
    mountToaster({ maxVisible: 2 });
    create('t');
    expect(record('t')).toMatchObject({
      position: 'top-right',
      positionPending: false,
      timer: { duration: 5000 },
      durationPending: false,
    });
  });

  it('apply to custom toasts too', () => {
    mountToaster({ position: 'bottom-left', duration: 3000 });
    create('custom', undefined, 'custom');
    expect(record('custom')).toMatchObject({ position: 'bottom-left', timer: { duration: 3000 } });
  });
});

describe('definitions made before any Toaster is active', () => {
  it('mark an omitted position and duration pending, on built-in placeholders', () => {
    create('omitted');
    expect(record('omitted')).toMatchObject({
      position: 'top-right',
      positionPending: true,
      timer: { duration: 5000, remaining: 5000, runningSince: null },
      durationPending: true,
      phase: 'queued',
    });
  });

  it('never mark explicit values pending, including an explicit top-right, 0 or Infinity', () => {
    create('position', { position: 'top-right' });
    create('zero', { duration: 0 });
    create('forever', { duration: Infinity });
    expect(record('position')).toMatchObject({ positionPending: false, durationPending: true });
    expect(record('zero')).toMatchObject({ positionPending: true, durationPending: false });
    expect(record('forever')).toMatchObject({
      durationPending: false,
      timer: { duration: Infinity },
    });
  });

  it('never mark a loading toast duration-pending: it is persistent whatever the default', () => {
    create('loading', undefined, 'loading');
    expect(record('loading')).toMatchObject({
      positionPending: true,
      durationPending: false,
      timer: { duration: Infinity },
    });
    mountToaster({ duration: 2000, position: 'top-center' });
    expect(record('loading')).toMatchObject({
      position: 'top-center',
      timer: { duration: Infinity },
    });
  });

  it('resolve only the omitted dimensions from the first Toaster', () => {
    create('both');
    create('position-only', { duration: 1000 });
    create('duration-only', { position: 'top-left' });
    create('explicit', { position: 'top-left', duration: 1000 });
    mountToaster({ position: 'bottom-center', duration: 8000, maxVisible: 10 });

    expect(record('both')).toMatchObject({ position: 'bottom-center', timer: { duration: 8000 } });
    expect(record('position-only')).toMatchObject({
      position: 'bottom-center',
      timer: { duration: 1000 },
    });
    expect(record('duration-only')).toMatchObject({
      position: 'top-left',
      timer: { duration: 8000 },
    });
    expect(record('explicit')).toMatchObject({ position: 'top-left', timer: { duration: 1000 } });
    for (const candidate of inspectRecords()) {
      expect(candidate).toMatchObject({ positionPending: false, durationPending: false });
    }
  });

  it('resolve before promotion, so slots are allocated at the resolved positions', () => {
    create('a');
    create('b', { position: 'top-right' });
    create('c');
    mountToaster({ position: 'bottom-left', maxVisible: 1 });
    expect(rendered('bottom-left')).toEqual(['a']);
    expect(rendered('top-right')).toEqual(['b']);
    expect(record('c')).toMatchObject({ position: 'bottom-left', phase: 'queued' });
  });

  it('keep seq, revision and FIFO creation order, in seq order in the snapshot', () => {
    create('p1');
    create('x', { position: 'bottom-center' });
    create('p2');
    create('p3');
    const before = inspectRecords().map(({ id, seq, revision }) => ({ id, seq, revision }));
    mountToaster({ position: 'bottom-center', maxVisible: 3 });
    expect(inspectRecords().map(({ id, seq, revision }) => ({ id, seq, revision }))).toEqual(
      before
    );
    expect(rendered('bottom-center')).toEqual(['p1', 'x', 'p2']);
    expect(record('p3').phase).toBe('queued');
  });

  it('are resolved, not relocated: no exit, no callbacks, one notification', async () => {
    const onDismiss = vi.fn();
    const onAutoClose = vi.fn();
    create('t', { onDismiss, onAutoClose });
    const notified: StoreSnapshot[] = [];
    subscribe(() => notified.push(getSnapshot()));
    mountToaster({ position: 'bottom-right' });
    await settle();

    expect(notified).toHaveLength(1);
    expect(record('t')).toMatchObject({
      position: 'bottom-right',
      phase: 'entering',
      exit: undefined,
    });
    expect(rendered('bottom-right')).toEqual(['t']);
    expect(rendered('top-right')).toEqual([]);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onAutoClose).not.toHaveBeenCalled();
  });

  it('start the resolved duration in full once visible', () => {
    vi.useFakeTimers();
    create('t');
    mountToaster({ duration: 2000 });
    entered('t');
    vi.advanceTimersByTime(1999);
    expect(record('t').phase).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(record('t').phase).toBe('exiting');
  });

  it('resolve with the configuration the Toaster has when it becomes active', () => {
    create('t');
    const token = {};
    configure(token, { position: 'top-left', duration: 1000 });
    configure(token, { position: 'bottom-left', duration: 7000 });
    attach(token);
    expect(record('t')).toMatchObject({ position: 'bottom-left', timer: { duration: 7000 } });
  });

  it('are pending again after the last Toaster leaves, and the next one resolves them', async () => {
    const first = mountToaster({ position: 'top-left', duration: 1000 });
    first.detach();
    await settle();
    create('later');
    expect(record('later')).toMatchObject({ positionPending: true, durationPending: true });
    mountToaster({ position: 'bottom-center', duration: 6000 });
    expect(record('later')).toMatchObject({
      position: 'bottom-center',
      timer: { duration: 6000 },
      positionPending: false,
      durationPending: false,
    });
  });
});

describe('a configuration change of the active Toaster', () => {
  it('applies to later definitions only: resolved toasts keep their position and duration', () => {
    const { token } = mountToaster({ position: 'top-left', duration: 3000, maxVisible: 1 });
    create('shown');
    create('waiting');
    const notified: StoreSnapshot[] = [];
    subscribe(() => notified.push(getSnapshot()));
    const snapshot = getSnapshot();

    configure(token, { position: 'bottom-right', duration: 9000, maxVisible: 1 });
    expect(notified).toHaveLength(0);
    expect(getSnapshot()).toBe(snapshot);
    expect(record('shown')).toMatchObject({ position: 'top-left', timer: { duration: 3000 } });
    expect(record('waiting')).toMatchObject({
      position: 'top-left',
      phase: 'queued',
      timer: { duration: 3000 },
    });

    create('new');
    expect(record('new')).toMatchObject({ position: 'bottom-right', timer: { duration: 9000 } });
  });

  it('never retimes a running timer', () => {
    vi.useFakeTimers();
    const { token } = mountToaster({ duration: 8000 });
    create('t');
    entered('t');
    vi.advanceTimersByTime(3000);
    configure(token, { duration: 1000 });
    vi.advanceTimersByTime(4999);
    expect(record('t').phase).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(record('t').phase).toBe('exiting');
  });

  it('of a waiting Toaster changes nothing until it takes over', () => {
    mountToaster({ position: 'top-left' });
    const waiting = mountToaster({ position: 'bottom-left' });
    configure(waiting.token, { position: 'bottom-right' });
    create('t');
    expect(record('t').position).toBe('top-left');
  });
});

describe('takeover by a Toaster with other defaults', () => {
  it('keeps resolved positions and remaining time; later definitions use the new owner', async () => {
    vi.useFakeTimers();
    const first = mountToaster({ position: 'top-left', duration: 3000, maxVisible: 1 });
    mountToaster({ position: 'bottom-right', duration: 9000, maxVisible: 1 });
    create('shown');
    create('overflow');
    entered('shown');
    vi.advanceTimersByTime(1000);

    first.detach();
    await settle();
    expect(record('shown')).toMatchObject({
      position: 'top-left',
      phase: 'entering',
      timer: { duration: 3000, remaining: 2000, runningSince: null },
    });
    expect(record('overflow')).toMatchObject({
      position: 'top-left',
      phase: 'queued',
      timer: { duration: 3000, remaining: 3000 },
    });

    entered('shown');
    vi.advanceTimersByTime(1999);
    expect(record('shown').phase).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(record('shown').phase).toBe('exiting');

    create('new');
    expect(record('new')).toMatchObject({ position: 'bottom-right', timer: { duration: 9000 } });
  });

  it('resolves a definition made while the detach is pending with the departing owner', async () => {
    const first = mountToaster({ position: 'top-left', duration: 1000 });
    mountToaster({ position: 'bottom-right', duration: 9000 });
    first.detach();
    // The deferred detach has not run: the departing Toaster still counts as active (P-09).
    create('t');
    expect(record('t')).toMatchObject({
      position: 'top-left',
      positionPending: false,
      timer: { duration: 1000 },
      durationPending: false,
    });
    await settle();
    expect(record('t')).toMatchObject({
      position: 'top-left',
      phase: 'entering',
      timer: { duration: 1000 },
    });
  });

  it("promotes under the new owner's maxVisible, as before", async () => {
    const first = mountToaster({ maxVisible: 3 });
    mountToaster({ maxVisible: 1 });
    for (const id of ['t1', 't2', 't3']) create(id);
    expect(rendered('top-right')).toEqual(['t1', 't2', 't3']);
    first.detach();
    await settle();
    expect(rendered('top-right')).toEqual(['t1']);
    expect(record('t2').phase).toBe('queued');
  });
});

describe('replacement is a new definition (§14)', () => {
  it('takes omitted values from the active Toaster, not from the previous definition', () => {
    mountToaster({ position: 'bottom-center', duration: 7000 });
    create('t', { position: 'bottom-center', duration: 1000 });
    create('t');
    expect(record('t')).toMatchObject({
      position: 'bottom-center',
      timer: { duration: 7000 },
      revision: 1,
    });
  });

  it('relocates a shown toast whose omitted position resolves elsewhere, through the lifecycle', () => {
    const onDismiss = vi.fn();
    mountToaster({ position: 'top-center', duration: 7000 });
    create('t', { position: 'bottom-left', duration: 1000, onDismiss });
    entered('t');
    create('t', { onDismiss });
    expect(record('t')).toMatchObject({
      position: 'bottom-left',
      phase: 'exiting',
      exit: { reason: 'relocate', relocateTo: 'top-center' },
      timer: { duration: 7000 },
    });
    exited('t');
    expect(record('t')).toMatchObject({ position: 'top-center', phase: 'entering' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('lets explicit values win and clears pending markers', () => {
    create('t');
    create('t', { position: 'top-left', duration: 2000 });
    expect(record('t')).toMatchObject({
      position: 'top-left',
      positionPending: false,
      timer: { duration: 2000 },
      durationPending: false,
    });
  });

  it('is pending again when it omits values while no Toaster is active', async () => {
    const first = mountToaster({ position: 'bottom-center', duration: 3000 });
    create('t');
    first.detach();
    await settle();
    expect(record('t')).toMatchObject({ positionPending: false, durationPending: false });

    create('t');
    expect(record('t')).toMatchObject({
      position: 'top-right',
      positionPending: true,
      durationPending: true,
      revision: 1,
    });
    mountToaster({ position: 'bottom-left', duration: 4000 });
    expect(record('t')).toMatchObject({ position: 'bottom-left', timer: { duration: 4000 } });
  });
});

describe('queued replacement keeps its seq unless it moves between resolved positions (§11)', () => {
  /** Shows `ids` at their positions under a Toaster, then detaches it: they wait, resolved. */
  async function requeueResolved(config: Config, ...toasts: [ToastId, ToastOptions?][]) {
    const first = mountToaster({ maxVisible: 10, ...config });
    for (const [id, options] of toasts) create(id, options);
    first.detach();
    await settle();
  }

  const seqOf = (id: ToastId) => record(id).seq;

  it('probe 1: the placeholder never reorders definitions resolved to one position', async () => {
    await requeueResolved({}, ['A', { position: 'bottom-left' }], ['B', { position: 'top-right' }]);
    create('A');
    create('B');
    expect([seqOf('A'), seqOf('B')]).toEqual([1, 2]);

    mountToaster({ position: 'bottom-center', maxVisible: 1 });
    expect(rendered('bottom-center')).toEqual(['A']);
    expect(record('B')).toMatchObject({ position: 'bottom-center', phase: 'queued' });
  });

  it('probe 2: a toast that resolves back to its own position keeps its place', async () => {
    const onDismiss = vi.fn();
    await requeueResolved({ position: 'bottom-center' }, ['X'], ['Y']);
    create('X', { onDismiss });
    expect(record('X')).toMatchObject({ seq: 1, positionPending: true });

    mountToaster({ position: 'bottom-center', maxVisible: 1 });
    expect(rendered('bottom-center')).toEqual(['X']);
    expect(record('X')).toMatchObject({ seq: 1, phase: 'entering', exit: undefined });
    expect(record('Y')).toMatchObject({ seq: 2, phase: 'queued' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('resolved → pending: keeps its seq in the placeholder bucket, and after resolution', async () => {
    await requeueResolved({}, ['t', { position: 'bottom-left' }]);
    create('later');
    create('t');
    expect(record('t')).toMatchObject({
      seq: 1,
      position: 'top-right',
      positionPending: true,
      phase: 'queued',
    });

    mountToaster({ position: 'top-left', maxVisible: 1 });
    expect(rendered('top-left')).toEqual(['t']);
    expect(record('later')).toMatchObject({ seq: 2, position: 'top-left', phase: 'queued' });
  });

  it.each(['top-right', 'bottom-left'] as const)(
    'pending → explicit %s: keeps its seq, whether or not it equals the placeholder',
    position => {
      create('first');
      create('second', { position });
      create('first', { position });
      expect(record('first')).toMatchObject({ seq: 1, position, positionPending: false });

      mountToaster({ maxVisible: 1 });
      expect(rendered(position)).toEqual(['first']);
      expect(record('second').phase).toBe('queued');
    }
  );

  it('pending → pending: keeps its seq, and resolution keeps it too', () => {
    create('a');
    create('b');
    create('a');
    expect(record('a')).toMatchObject({ seq: 1, revision: 1, positionPending: true });

    mountToaster({ position: 'bottom-right', maxVisible: 1 });
    expect(rendered('bottom-right')).toEqual(['a']);
    expect(record('b')).toMatchObject({ seq: 2, phase: 'queued' });
  });

  it('resolved → resolved: keeps its seq at the same position, and moves to the back otherwise', async () => {
    await requeueResolved(
      {},
      ['same', { position: 'top-left' }],
      ['moved', { position: 'top-left' }],
      ['other', { position: 'bottom-left' }]
    );
    create('same', { position: 'top-left' });
    create('moved', { position: 'bottom-left' });
    expect(record('same')).toMatchObject({ seq: 1, position: 'top-left' });
    expect(record('moved')).toMatchObject({ seq: 4, position: 'bottom-left' });

    mountToaster({ maxVisible: 1 });
    expect(rendered('top-left')).toEqual(['same']);
    expect(rendered('bottom-left')).toEqual(['other']);
  });
});

describe('promise settlement (§13)', () => {
  it('keeps the loading toast persistent, then gives the settled toast the Toaster duration', async () => {
    mountToaster({ position: 'bottom-left', duration: 8000 });
    const work = deferred<string>();
    const id = toast.promise(work.promise, messages);
    expect(record(id)).toMatchObject({
      type: 'loading',
      position: 'bottom-left',
      timer: { duration: Infinity },
      durationPending: false,
    });
    expect(view(id)?.persistent).toBe(true);

    work.resolve('ok');
    await settle();
    expect(record(id)).toMatchObject({
      type: 'success',
      position: 'bottom-left',
      timer: { duration: 8000, remaining: 8000 },
      durationPending: false,
    });
    expect(view(id)?.persistent).toBe(false);
  });

  it('lets an explicit duration win, Infinity included, for success and error', async () => {
    mountToaster({ duration: 8000 });
    const finite = deferred<string>();
    const forever = deferred<string>();
    const finiteId = toast.promise(finite.promise, messages, { duration: 1500 });
    const foreverId = toast.promise(forever.promise, messages, { duration: Infinity });
    finite.reject(new Error('no'));
    forever.resolve('ok');
    await settle();
    expect(record(finiteId)).toMatchObject({ type: 'error', timer: { duration: 1500 } });
    expect(record(foreverId)).toMatchObject({ type: 'success', timer: { duration: Infinity } });
    expect(view(foreverId)?.persistent).toBe(true);
  });

  it('gives a settled toast a persistent Toaster default', async () => {
    mountToaster({ duration: Infinity });
    const work = deferred<string>();
    const id = toast.promise(work.promise, messages);
    work.resolve('ok');
    await settle();
    expect(record(id).timer.duration).toBe(Infinity);
    expect(view(id)?.persistent).toBe(true);
  });

  it('never relocates to the current Toaster position', async () => {
    const { token } = mountToaster({ position: 'top-left' });
    const work = deferred<string>();
    const id = toast.promise(work.promise, messages);
    entered(id as string);
    const { seq } = record(id);
    configure(token, { position: 'bottom-right' });
    work.resolve('ok');
    await settle();
    expect(record(id)).toMatchObject({
      position: 'top-left',
      phase: 'visible',
      seq,
      exit: undefined,
    });
  });

  it('marks the settled duration pending with no Toaster, keeping pending position state', async () => {
    const work = deferred<string>();
    const id = toast.promise(work.promise, messages);
    expect(record(id)).toMatchObject({ positionPending: true, durationPending: false });
    work.resolve('ok');
    await settle();
    expect(record(id)).toMatchObject({
      type: 'success',
      position: 'top-right',
      positionPending: true,
      timer: { duration: 5000 },
      durationPending: true,
    });

    mountToaster({ position: 'bottom-center', duration: 6000 });
    expect(record(id)).toMatchObject({
      position: 'bottom-center',
      positionPending: false,
      timer: { duration: 6000 },
      durationPending: false,
    });
  });

  it('keeps a resolved position, but takes a later Toaster duration, when settled between owners', async () => {
    const first = mountToaster({ position: 'top-left', duration: 1000 });
    const work = deferred<string>();
    const id = toast.promise(work.promise, messages);
    first.detach();
    await settle();
    work.reject(new Error('no'));
    await settle();
    expect(record(id)).toMatchObject({
      type: 'error',
      position: 'top-left',
      positionPending: false,
      durationPending: true,
    });

    mountToaster({ position: 'bottom-right', duration: 4000 });
    expect(record(id)).toMatchObject({ position: 'top-left', timer: { duration: 4000 } });
  });

  it('keeps an explicit duration non-pending when settled with no Toaster', async () => {
    const work = deferred<string>();
    const id = toast.promise(work.promise, messages, { duration: 2500 });
    work.resolve('ok');
    await settle();
    expect(record(id)).toMatchObject({ timer: { duration: 2500 }, durationPending: false });
  });

  it('case C: created before any Toaster, settled after one attaches: the Toaster duration', async () => {
    const work = deferred<string>();
    const id = toast.promise(work.promise, messages);
    mountToaster({ duration: 8000 });
    expect(record(id)).toMatchObject({ type: 'loading', timer: { duration: Infinity } });
    work.resolve('ok');
    await settle();
    expect(record(id)).toMatchObject({
      type: 'success',
      timer: { duration: 8000, remaining: 8000 },
      durationPending: false,
    });
    expect(view(id)?.persistent).toBe(false);
  });

  it('case D: a loading toast replaced by a finite one takes the Toaster duration', () => {
    mountToaster({ duration: 8000 });
    toast.loading('Working', { id: 'job' });
    expect(record('job').timer.duration).toBe(Infinity);
    toast.success('Done', { id: 'job' });
    expect(record('job')).toMatchObject({ type: 'success', timer: { duration: 8000 } });
    expect(view('job')?.persistent).toBe(false);
  });

  it('still ignores a stale settlement', async () => {
    mountToaster({ duration: 8000 });
    const work = deferred<string>();
    const id = toast.promise(work.promise, messages);
    toast('Replaced', { id: id as string, duration: 1000 });
    work.resolve('ok');
    await settle();
    expect(record(id)).toMatchObject({
      type: 'default',
      content: 'Replaced',
      timer: { duration: 1000 },
    });
  });
});

describe('the persistent view field', () => {
  it('reflects the effective duration', () => {
    const { token } = mountToaster({ maxVisible: 10 });
    create('loading', undefined, 'loading');
    create('explicit', { duration: Infinity });
    create('finite');
    create('zero', { duration: 0 });
    create('custom', { duration: Infinity }, 'custom');
    configure(token, { duration: Infinity, maxVisible: 10 });
    create('default-infinity');
    expect(Object.fromEntries(rendered('top-right').map(id => [id, view(id)?.persistent]))).toEqual(
      {
        loading: true,
        explicit: true,
        finite: false,
        zero: false,
        custom: true,
        'default-infinity': true,
      }
    );
  });

  it('reflects a duration resolved from a pending default', () => {
    create('t');
    mountToaster({ duration: Infinity });
    expect(view('t')?.persistent).toBe(true);
  });

  // Narrowed by P-20 S1 from "the only addition": the view also carries the timer's boundary facts
  // (P-20 decision 2), and still no pause reasons, clock reading or pending state.
  it('is joined only by the P-20 timer boundary facts: no pause reasons, clock or pending state', () => {
    mountToaster();
    create('t');
    expect(Object.keys(view('t') ?? {}).sort()).toEqual([
      'content',
      'custom',
      'description',
      'duration',
      'held',
      'id',
      'options',
      'persistent',
      'phase',
      'position',
      'remaining',
      'revision',
      'seq',
      'type',
    ]);
  });
});

describe('snapshot identity', () => {
  it("keeps a toast's view when only another toast's phase changes", async () => {
    const first = mountToaster({ maxVisible: 1 });
    create('shown', { position: 'top-left' });
    first.detach();
    await settle();
    create('pending');

    mountToaster({ position: 'bottom-center' });
    const shown = view('shown');
    const notified: StoreSnapshot[] = [];
    subscribe(() => notified.push(getSnapshot()));
    entered('pending');
    expect(notified).toHaveLength(1);
    expect(view('shown')).toBe(shown);
    expect(view('pending')?.phase).toBe('visible');
  });
});
