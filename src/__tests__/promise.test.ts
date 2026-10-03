// toast.promise (§13, P-13): loading, settlement, ownership, throwing message functions, rejection
// handling. Settlement happens in promise reactions, so tests flush microtasks with `settle()`.
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { toast } from '../index';
import {
  attach,
  dismiss,
  entered,
  exited,
  getSnapshot,
  inspectRecords,
  setGlobalPause,
  setToastPause,
  subscribe,
} from '../store/store';
import type { ToastPromiseMessages } from '../types';

const record = (id: string | undefined) => inspectRecords().find(candidate => candidate.id === id);
const view = (id: string | undefined) =>
  Object.values(getSnapshot().byPosition)
    .flat()
    .find(candidate => candidate.id === id);
/** Plain-JS style values that the public types would reject. */
const smuggle = (value: unknown): never => value as never;

/** Lets pending promise reactions run. */
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

let reportError: MockInstance<(error: unknown) => void>;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  reportError = vi.fn();
  vi.stubGlobal('reportError', reportError);
});

describe('the loading toast', () => {
  it('is created at once as a normal loading toast with a token, and its ID is returned', () => {
    const id = toast.promise(deferred<string>().promise, messages);
    expect(id).toEqual(expect.any(String));
    expect(record(id)).toMatchObject({
      type: 'loading',
      custom: false,
      content: 'Loading',
      revision: 0,
      phase: 'queued',
    });
    expect(typeof record(id)?.promiseToken).toBe('symbol');
  });

  it('honours an explicit id', () => {
    expect(toast.promise(deferred<string>().promise, messages, { id: 'job' })).toBe('job');
    expect(record('job')?.type).toBe('loading');
  });

  it('gives every call its own token', () => {
    toast.promise(deferred<string>().promise, messages, { id: 'a' });
    toast.promise(deferred<string>().promise, messages, { id: 'b' });
    expect(record('a')?.promiseToken).not.toBe(record('b')?.promiseToken);
  });

  it('AC-TM-3: is persistent whatever its duration, without storing Infinity in its options', () => {
    vi.useFakeTimers();
    attach({});
    toast.promise(deferred<string>().promise, messages, { id: 'job', duration: 1000 });
    entered('job');
    vi.advanceTimersByTime(60_000);
    expect(record('job')).toMatchObject({ type: 'loading', phase: 'visible' });
    expect(record('job')?.timer.duration).toBe(Infinity);
    expect(record('job')?.options).toEqual({ duration: 1000 });
  });

  it('exists before the function is called, which happens once, synchronously', () => {
    const seen: unknown[] = [];
    const input = vi.fn(() => {
      seen.push(record('job')?.type);
      return deferred<string>().promise;
    });
    toast.promise(input, messages, { id: 'job' });
    expect(input).toHaveBeenCalledTimes(1);
    expect(input).toHaveBeenCalledWith();
    expect(seen).toEqual(['loading']);
  });

  it('observes a direct promise once, after the loading toast exists', () => {
    const promise = deferred<string>().promise;
    const seen: unknown[] = [];
    const then = vi.spyOn(promise, 'then');
    then.mockImplementationOnce(function (this: Promise<string>, ...args) {
      seen.push(record('job')?.type);
      return Promise.prototype.then.apply(this, args);
    });
    toast.promise(promise, messages, { id: 'job' });
    expect(then).toHaveBeenCalledTimes(1);
    expect(then).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
    expect(seen).toEqual(['loading']);
  });
});

describe('resolve', () => {
  it('replaces the loading toast with a success toast, passing the value by identity', async () => {
    const value = { name: 'Project' };
    const success = vi.fn((data: typeof value) => `Saved ${data.name}`);
    const id = toast.promise(Promise.resolve(value), { ...messages, success });
    const seq = record(id)?.seq;
    // Even an already-resolved promise settles after the call returns.
    expect(record(id)?.type).toBe('loading');
    await settle();
    expect(success).toHaveBeenCalledTimes(1);
    expect(success.mock.calls[0]?.[0]).toBe(value);
    expect(record(id)).toMatchObject({
      id,
      seq,
      type: 'success',
      custom: false,
      content: 'Saved Project',
      revision: 1,
      promiseToken: undefined,
    });
  });

  it('resolves function input', async () => {
    const id = toast.promise(() => Promise.resolve(7), {
      ...messages,
      success: n => `Got ${n}`,
    });
    await settle();
    expect(record(id)).toMatchObject({ type: 'success', content: 'Got 7' });
  });

  it('uses static success content by identity, without calling it', async () => {
    const element = createElement('strong', null, 'Done');
    const id = toast.promise(Promise.resolve(1), { ...messages, success: element });
    await settle();
    expect(record(id)?.type).toBe('success');
    expect(record(id)?.content).toBe(element);
  });
});

describe('reject', () => {
  it('replaces the loading toast with an error toast, passing the reason by identity', async () => {
    const reason = Object.assign(new Error('rejected'), { code: 42 });
    const error = vi.fn<(reason: unknown) => string>(() => 'Could not save');
    const id = toast.promise(Promise.reject(reason), { ...messages, error });
    const seq = record(id)?.seq;
    expect(record(id)?.type).toBe('loading');
    await settle();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toBe(reason);
    expect(record(id)).toMatchObject({
      seq,
      type: 'error',
      custom: false,
      content: 'Could not save',
      revision: 1,
      promiseToken: undefined,
    });
  });

  it('rejects function input', async () => {
    const reason = new Error('nope');
    const error = vi.fn<(reason: unknown) => string>(() => 'Failed');
    const id = toast.promise(() => Promise.reject(reason), { ...messages, error });
    await settle();
    expect(error.mock.calls[0]?.[0]).toBe(reason);
    expect(record(id)?.type).toBe('error');
  });

  it('treats a synchronous throw from function input as a rejection, settled asynchronously', async () => {
    const reason = new Error('sync');
    const error = vi.fn<(reason: unknown) => string>(() => 'Failed');
    const input = vi.fn((): Promise<string> => {
      throw reason;
    });
    const id = toast.promise(input, { ...messages, error }, { id: 'job' });
    expect(id).toBe('job');
    expect(input).toHaveBeenCalledTimes(1);
    expect(record('job')?.type).toBe('loading');
    expect(error).not.toHaveBeenCalled();
    await settle();
    expect(error.mock.calls[0]?.[0]).toBe(reason);
    expect(record('job')).toMatchObject({ type: 'error', content: 'Failed' });
  });

  it('uses static error content by identity', async () => {
    const element = createElement('em', null, 'Failed');
    const id = toast.promise(Promise.reject(new Error('x')), { ...messages, error: element });
    await settle();
    expect(record(id)?.type).toBe('error');
    expect(record(id)?.content).toBe(element);
  });
});

describe('content (D-04)', () => {
  const element = createElement('span', null, 'Node');
  const values: unknown[] = [null, false, 0, 'Text', element, undefined];

  it('keeps static loading, success and error content of any kind by identity', async () => {
    for (const [index, value] of values.entries()) {
      const node = value as never;
      toast.promise(
        Promise.resolve(1),
        { loading: node, success: node, error: 'E' },
        { id: `s${index}` }
      );
      expect(record(`s${index}`)?.content).toBe(value);
      toast.promise(
        Promise.reject(new Error('x')),
        { loading: 'L', success: 'S', error: node },
        {
          id: `e${index}`,
        }
      );
    }
    await settle();
    for (const [index, value] of values.entries()) {
      expect(record(`s${index}`)).toMatchObject({ type: 'success' });
      expect(record(`s${index}`)?.content).toBe(value);
      expect(record(`e${index}`)).toMatchObject({ type: 'error' });
      expect(record(`e${index}`)?.content).toBe(value);
    }
  });

  it('keeps what a message function returns by identity, never stringified', async () => {
    const id = toast.promise(Promise.resolve(1), { ...messages, success: () => element });
    const failed = toast.promise(Promise.reject(new Error('x')), { ...messages, error: () => 0 });
    await settle();
    expect(record(id)?.content).toBe(element);
    expect(record(failed)?.content).toBe(0);
  });
});

describe('timers of the settled toast (§10)', () => {
  it('gives a success toast a fresh timer, with the internal 5000 ms default', async () => {
    vi.useFakeTimers();
    attach({});
    const { promise, resolve } = deferred<number>();
    toast.promise(promise, messages, { id: 'job' });
    entered('job');
    vi.advanceTimersByTime(10_000);
    resolve(1);
    await settle();
    expect(record('job')?.timer).toEqual({
      duration: 5000,
      remaining: 5000,
      runningSince: performance.now(),
    });
    vi.advanceTimersByTime(4999);
    expect(record('job')?.phase).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(record('job')).toMatchObject({ phase: 'exiting', exit: { reason: 'timeout' } });
  });

  it('gives an error toast a fresh timer with the explicit duration', async () => {
    vi.useFakeTimers();
    attach({});
    const { promise, reject } = deferred<number>();
    toast.promise(promise, messages, { id: 'job', duration: 2000 });
    entered('job');
    reject(new Error('x'));
    await settle();
    expect(record('job')?.timer).toEqual({
      duration: 2000,
      remaining: 2000,
      runningSince: performance.now(),
    });
    vi.advanceTimersByTime(2000);
    expect(record('job')).toMatchObject({ type: 'error', phase: 'exiting' });
  });

  it('keeps a settled toast open with an explicit Infinity', async () => {
    vi.useFakeTimers();
    attach({});
    toast.promise(Promise.resolve(1), messages, { id: 'job', duration: Infinity });
    entered('job');
    await settle();
    vi.advanceTimersByTime(1_000_000);
    expect(record('job')).toMatchObject({ type: 'success', phase: 'visible' });
    expect(record('job')?.timer.duration).toBe(Infinity);
  });

  it('closes a settled toast with a duration at or below 0 on the next tick', async () => {
    vi.useFakeTimers();
    attach({});
    toast.promise(Promise.resolve(1), messages, { id: 'job', duration: -5 });
    entered('job');
    await settle();
    expect(record('job')?.timer.duration).toBe(0);
    vi.advanceTimersByTime(0);
    expect(record('job')).toMatchObject({ phase: 'exiting', exit: { reason: 'timeout' } });
  });
});

describe('settlement in every phase (§14)', () => {
  it('replaces a queued toast in place: same seq, still queued, no timer', async () => {
    toast('Before');
    const id = toast.promise(Promise.resolve(1), messages);
    const seq = record(id)?.seq;
    await settle();
    expect(record(id)).toMatchObject({ type: 'success', phase: 'queued', seq });
    expect(record(id)?.timer.runningSince).toBeNull();
    expect(inspectRecords().map(candidate => candidate.content)).toEqual(['Before', 'Done']);
  });

  it('replaces an entering toast in place; its timer starts at entered()', async () => {
    vi.useFakeTimers();
    attach({});
    toast.promise(Promise.resolve(1), messages, { id: 'job' });
    expect(record('job')?.phase).toBe('entering');
    await settle();
    expect(record('job')).toMatchObject({ type: 'success', phase: 'entering' });
    expect(record('job')?.timer.runningSince).toBeNull();
    entered('job');
    expect(record('job')?.timer.runningSince).toBe(performance.now());
  });

  it('replaces a visible toast in place', async () => {
    attach({});
    toast.promise(Promise.resolve(1), messages, { id: 'job' });
    entered('job');
    await settle();
    expect(record('job')).toMatchObject({ type: 'success', phase: 'visible', exit: undefined });
  });

  it('AC-API-8: ignores an exiting toast: no revival, no message function', async () => {
    attach({});
    const success = vi.fn(() => 'Done');
    const { promise, resolve } = deferred<number>();
    toast.promise(promise, { ...messages, success }, { id: 'job' });
    entered('job');
    toast.dismiss('job');
    resolve(1);
    await settle();
    expect(success).not.toHaveBeenCalled();
    expect(record('job')).toMatchObject({
      type: 'loading',
      revision: 0,
      phase: 'exiting',
      exit: { reason: 'programmatic' },
    });
  });

  it('AC-API-8: ignores a removed toast: nothing is created', async () => {
    attach({});
    const onDismiss = vi.fn();
    const { promise, resolve } = deferred<number>();
    toast.promise(promise, messages, { id: 'job', onDismiss });
    entered('job');
    toast.dismiss('job');
    exited('job');
    resolve(1);
    await settle();
    expect(inspectRecords()).toEqual([]);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('ownership (§13, AC-API-8)', () => {
  it('ends with dismissal of a queued toast, which fires onDismiss once', async () => {
    const onDismiss = vi.fn();
    const success = vi.fn(() => 'Done');
    const { promise, resolve } = deferred<number>();
    toast.promise(promise, { ...messages, success }, { id: 'job', onDismiss });
    toast.dismiss('job');
    resolve(1);
    await settle();
    expect(record('job')).toBeUndefined();
    expect(success).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job', type: 'loading' }),
      'programmatic'
    );
  });

  it('clears the token when a rendered toast starts to exit', () => {
    attach({});
    toast.promise(deferred<number>().promise, messages, { id: 'job' });
    entered('job');
    dismiss('job', 'close-button');
    expect(record('job')).toMatchObject({ phase: 'exiting', promiseToken: undefined });
  });

  it('a relocated, dismissed toast holds no promise token', () => {
    attach({});
    toast.promise(deferred<number>().promise, messages, { id: 'job' });
    entered('job');
    toast('Moved', { id: 'job', position: 'bottom-left' });
    toast.dismiss('job');
    expect(record('job')).toMatchObject({
      exit: { reason: 'programmatic' },
      promiseToken: undefined,
    });
  });

  const replacements = {
    toast: (id: string) => toast('External', { id }),
    success: (id: string) => toast.success('External', { id }),
    error: (id: string) => toast.error('External', { id }),
    warning: (id: string) => toast.warning('External', { id }),
    info: (id: string) => toast.info('External', { id }),
    loading: (id: string) => toast.loading('External', { id }),
    custom: (id: string) => toast.custom('External', { id }),
  };

  for (const [name, replaceWith] of Object.entries(replacements)) {
    it(`is lost to an external ${name} replacement: settlement changes nothing`, async () => {
      attach({});
      const success = vi.fn(() => 'Done');
      const error = vi.fn(() => 'Failed');
      const first = deferred<number>();
      const second = deferred<number>();
      toast.promise(first.promise, { ...messages, success, error }, { id: 'a' });
      toast.promise(second.promise, { ...messages, success, error }, { id: 'b' });
      entered('a');
      replaceWith('a');
      replaceWith('b');
      const replaced = { a: record('a'), b: record('b') };
      expect(replaced.a?.promiseToken).toBeUndefined();
      expect(replaced.a).toMatchObject({ content: 'External', revision: 1 });
      first.resolve(1);
      second.reject(new Error('x'));
      await settle();
      expect(success).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(record('a')).toEqual(replaced.a);
      expect(record('b')).toEqual(replaced.b);
    });
  }

  it('passes to a second toast.promise with the same id', async () => {
    attach({});
    const first = deferred<number>();
    const second = deferred<number>();
    const firstSuccess = vi.fn(() => 'First done');
    toast.promise(first.promise, { ...messages, success: firstSuccess }, { id: 'job' });
    const firstToken = record('job')?.promiseToken;
    toast.promise(
      second.promise,
      { ...messages, loading: 'Again', success: 'Second done' },
      {
        id: 'job',
      }
    );
    expect(record('job')).toMatchObject({ content: 'Again', revision: 1 });
    expect(record('job')?.promiseToken).toEqual(expect.any(Symbol));
    expect(record('job')?.promiseToken).not.toBe(firstToken);
    first.resolve(1);
    await settle();
    expect(firstSuccess).not.toHaveBeenCalled();
    expect(record('job')).toMatchObject({ type: 'loading', content: 'Again' });
    second.resolve(2);
    await settle();
    expect(record('job')).toMatchObject({ type: 'success', content: 'Second done', revision: 2 });
  });

  it('a second toast.promise revives a dismissed one as a public call, and owns it', async () => {
    attach({});
    const first = deferred<number>();
    toast.promise(first.promise, messages, { id: 'job' });
    entered('job');
    toast.dismiss('job');
    toast.promise(Promise.resolve(2), { ...messages, success: 'Second done' }, { id: 'job' });
    expect(record('job')).toMatchObject({ type: 'loading', phase: 'entering', exit: undefined });
    first.resolve(1);
    await settle();
    expect(record('job')).toMatchObject({ type: 'success', content: 'Second done' });
  });

  it('never touches a later toast that reuses the ID after removal', async () => {
    const { promise, resolve } = deferred<number>();
    toast.promise(promise, messages, { id: 'job' });
    toast.dismiss('job');
    toast.info('New', { id: 'job' });
    const fresh = record('job');
    resolve(1);
    await settle();
    expect(record('job')).toEqual(fresh);
    expect(fresh).toMatchObject({ type: 'info', revision: 0 });
  });

  it('never touches a later promise toast that reuses the ID after removal', async () => {
    const first = deferred<number>();
    toast.promise(first.promise, messages, { id: 'job' });
    toast.dismiss('job');
    toast.promise(deferred<number>().promise, messages, { id: 'job' });
    first.resolve(1);
    await settle();
    expect(record('job')).toMatchObject({ type: 'loading', revision: 0 });
  });

  it('AC-API-5: the token cannot be set through public options', async () => {
    const { promise, resolve } = deferred<number>();
    toast.promise(promise, messages, { id: 'job' });
    const token = record('job')?.promiseToken;
    toast('Hijack', smuggle({ id: 'job', promiseToken: token }));
    toast.promise(
      deferred<number>().promise,
      messages,
      smuggle({ id: 'other', promiseToken: token })
    );
    expect(record('job')?.promiseToken).toBeUndefined();
    expect(record('other')?.promiseToken).not.toBe(token);
    resolve(1);
    await settle();
    expect(record('job')).toMatchObject({ type: 'default', content: 'Hijack' });
  });

  it('does not call or report a stale error function that would throw', async () => {
    const error = vi.fn(() => {
      throw new Error('stale');
    });
    const { promise, reject } = deferred<number>();
    toast.promise(promise, { ...messages, error }, { id: 'job' });
    toast('External', { id: 'job' });
    reject(new Error('x'));
    await settle();
    expect(error).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
    expect(record('job')).toMatchObject({ content: 'External' });
  });
});

describe('re-entrant message functions: the user wins', () => {
  it('success that dismisses its own toast', async () => {
    attach({});
    toast.promise(
      Promise.resolve(1),
      {
        ...messages,
        success: () => {
          toast.dismiss('job');
          return 'Done';
        },
      },
      { id: 'job' }
    );
    entered('job');
    await settle();
    expect(record('job')).toMatchObject({ type: 'loading', phase: 'exiting', revision: 0 });
  });

  it('success that replaces its own toast', async () => {
    toast.promise(
      Promise.resolve(1),
      {
        ...messages,
        success: () => {
          toast.info('User', { id: 'job' });
          return 'Done';
        },
      },
      { id: 'job' }
    );
    await settle();
    expect(record('job')).toMatchObject({ type: 'info', content: 'User', revision: 1 });
  });

  it('error that dismisses its own toast', async () => {
    const onDismiss = vi.fn();
    toast.promise(
      Promise.reject(new Error('x')),
      {
        ...messages,
        error: () => {
          toast.dismiss('job');
          return 'Failed';
        },
      },
      { id: 'job', onDismiss }
    );
    await settle();
    expect(record('job')).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('error that replaces its own toast', async () => {
    toast.promise(
      Promise.reject(new Error('x')),
      {
        ...messages,
        error: () => {
          toast.warning('User', { id: 'job' });
          return 'Failed';
        },
      },
      { id: 'job' }
    );
    await settle();
    expect(record('job')).toMatchObject({ type: 'warning', content: 'User' });
  });

  it('a success that throws after replacing its own toast does not reach error', async () => {
    const error = vi.fn(() => 'Failed');
    toast.promise(
      Promise.resolve(1),
      {
        ...messages,
        success: () => {
          toast.info('User', { id: 'job' });
          throw new Error('after');
        },
        error,
      },
      { id: 'job' }
    );
    await settle();
    expect(error).not.toHaveBeenCalled();
    expect(record('job')).toMatchObject({ type: 'info', content: 'User' });
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe('throwing message functions (§13)', () => {
  it('a throwing success shows the static error, and is not reported', async () => {
    const id = toast.promise(Promise.resolve(1), {
      ...messages,
      success: () => {
        throw new Error('render failed');
      },
    });
    await settle();
    expect(record(id)).toMatchObject({ type: 'error', content: 'Failed', revision: 1 });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('a throwing success passes the thrown value to the error function', async () => {
    const thrown = new Error('render failed');
    const error = vi.fn<(reason: unknown) => string>(() => 'Failed');
    const id = toast.promise(Promise.resolve(1), {
      ...messages,
      success: () => {
        throw thrown;
      },
      error,
    });
    await settle();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toBe(thrown);
    expect(record(id)?.type).toBe('error');
  });

  it('a throwing error dismisses the toast (programmatic) and reports the exception', async () => {
    attach({});
    const onDismiss = vi.fn();
    const exception = new Error('error message failed');
    toast.promise(
      Promise.reject(new Error('x')),
      {
        ...messages,
        error: () => {
          throw exception;
        },
      },
      { id: 'job', onDismiss }
    );
    entered('job');
    await settle();
    expect(record('job')).toMatchObject({
      type: 'loading',
      phase: 'exiting',
      exit: { reason: 'programmatic' },
      promiseToken: undefined,
    });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(exception);
    exited('job');
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 'job' }), 'programmatic');
  });

  it('a throwing success then a throwing error: dismissed, and only the second is reported', async () => {
    const onDismiss = vi.fn();
    const first = new Error('success failed');
    const second = new Error('error failed');
    const error = vi.fn(() => {
      throw second;
    });
    toast.promise(
      Promise.resolve(1),
      {
        ...messages,
        success: () => {
          throw first;
        },
        error,
      },
      { id: 'job', onDismiss }
    );
    await settle();
    expect(error).toHaveBeenCalledWith(first);
    expect(record('job')).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job', type: 'loading' }),
      'programmatic'
    );
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(second);
  });

  it('a throwing error never dismisses a toast that replaced it meanwhile', async () => {
    const exception = new Error('error message failed');
    toast.promise(
      Promise.reject(new Error('x')),
      {
        ...messages,
        error: () => {
          toast('User', { id: 'job' });
          throw exception;
        },
      },
      { id: 'job' }
    );
    await settle();
    expect(record('job')).toMatchObject({ type: 'default', content: 'User', phase: 'queued' });
    expect(reportError).toHaveBeenCalledWith(exception);
  });
});

describe('Toaster detach, takeover and pausing', () => {
  it('settles a toast re-queued by a detach, which a new Toaster then shows with a fresh timer', async () => {
    vi.useFakeTimers();
    const detach = attach({});
    const { promise, resolve } = deferred<number>();
    toast.promise(promise, messages, { id: 'job' });
    entered('job');
    detach();
    await settle();
    expect(record('job')).toMatchObject({ type: 'loading', phase: 'queued' });
    expect(record('job')?.promiseToken).toEqual(expect.any(Symbol));
    resolve(1);
    await settle();
    expect(record('job')).toMatchObject({
      type: 'success',
      phase: 'queued',
      promiseToken: undefined,
    });
    vi.advanceTimersByTime(60_000);
    attach({});
    expect(record('job')?.phase).toBe('entering');
    entered('job');
    expect(record('job')?.timer).toEqual({
      duration: 5000,
      remaining: 5000,
      runningSince: performance.now(),
    });
  });

  it('arms the no-Toaster warning when it settles a toast while no Toaster is active', async () => {
    vi.useFakeTimers();
    const warn = vi.mocked(console.warn);
    const detach = attach({});
    const { promise, resolve } = deferred<number>();
    toast.promise(promise, messages, { id: 'job' });
    detach();
    await settle();
    // A detach does not arm the warning (P-09); the settlement, a replacement, does.
    vi.advanceTimersByTime(5000);
    expect(warn).not.toHaveBeenCalled();
    resolve(1);
    await settle();
    vi.advanceTimersByTime(1000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no <Toaster /> is mounted'));
  });

  it('AC-TM-4: keeps every pause reason; the fresh timer runs only once they clear', async () => {
    vi.useFakeTimers();
    attach({});
    const { promise, resolve } = deferred<number>();
    toast.promise(promise, messages, { id: 'job', duration: 1000 });
    entered('job');
    setGlobalPause('window-blur', true);
    setToastPause('job', 'focus-within', true);
    resolve(1);
    await settle();
    expect(record('job')).toMatchObject({ type: 'success', pausedBy: ['focus-within'] });
    expect(record('job')?.timer).toEqual({ duration: 1000, remaining: 1000, runningSince: null });
    vi.advanceTimersByTime(5000);
    setGlobalPause('window-blur', false);
    vi.advanceTimersByTime(5000);
    expect(record('job')?.phase).toBe('visible');
    setToastPause('job', 'focus-within', false);
    vi.advanceTimersByTime(999);
    expect(record('job')?.phase).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(record('job')?.phase).toBe('exiting');
  });
});

describe('one set of options (§13, P-12)', () => {
  it('keeps the description, position and options, in a fresh frozen options object', async () => {
    attach({});
    const onDismiss = vi.fn();
    const action = { label: 'Undo', onClick: () => undefined };
    const options = {
      id: 'job',
      description: 'Details',
      position: 'bottom-left' as const,
      duration: 3000,
      icon: null,
      action,
      closeButton: false,
      progress: true,
      className: 'mine',
      onDismiss,
    };
    toast.promise(Promise.resolve(1), messages, options);
    entered('job');
    const before = view('job');
    await settle();
    const after = view('job');
    expect(after).toMatchObject({
      type: 'success',
      description: 'Details',
      position: 'bottom-left',
      phase: 'visible',
    });
    expect(record('job')?.exit).toBeUndefined();
    expect(after?.options).toEqual(before?.options);
    expect(after?.options).not.toBe(before?.options);
    expect(Object.isFrozen(after?.options)).toBe(true);
    expect(after?.options.onDismiss).toBe(onDismiss);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('keeps the default position for an omitted one: no relocation', async () => {
    attach({});
    toast.promise(Promise.resolve(1), messages, { id: 'job' });
    entered('job');
    await settle();
    expect(record('job')).toMatchObject({ position: 'top-right', phase: 'visible' });
  });

  it('is not affected by changes to the caller objects after the call', async () => {
    const options: { id: string; description: string; duration?: number; position?: 'top-left' } = {
      id: 'job',
      description: 'Before',
      duration: 1000,
    };
    const { promise, resolve } = deferred<number>();
    toast.promise(promise, messages, options);
    options.description = 'After';
    options.duration = 9000;
    options.position = 'top-left';
    resolve(1);
    await settle();
    expect(record('job')).toMatchObject({
      type: 'success',
      description: 'Before',
      position: 'top-right',
    });
    expect(record('job')?.timer.duration).toBe(1000);
  });

  it('reads each option once, at the call, and never at settlement', async () => {
    const reads: Record<string, number> = {};
    const fields = { id: 'job', description: 'D', position: 'top-left', duration: 1000 };
    const options = Object.defineProperties(
      {},
      Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [
          key,
          {
            get: () => {
              reads[key] = (reads[key] ?? 0) + 1;
              return value;
            },
            enumerable: true,
          },
        ])
      )
    );
    toast.promise(Promise.resolve(1), messages, options);
    await settle();
    expect(record('job')?.type).toBe('success');
    expect(reads).toEqual({ id: 1, description: 1, position: 1, duration: 1 });
  });

  it('reads each message once, at the call, and never at settlement', async () => {
    const reads = { loading: 0, success: 0, error: 0 };
    const success = vi.fn(() => 'Done');
    const counted = (values: ToastPromiseMessages<number>) =>
      Object.defineProperties(
        {},
        {
          loading: { get: () => (reads.loading++, values.loading) },
          success: { get: () => (reads.success++, values.success) },
          error: { get: () => (reads.error++, values.error) },
        }
      ) as ToastPromiseMessages<number>;
    toast.promise(Promise.resolve(1), counted({ ...messages, success }), { id: 'a' });
    expect(reads).toEqual({ loading: 1, success: 1, error: 1 });
    await settle();
    expect(success).toHaveBeenCalledTimes(1);
    expect(record('a')?.content).toBe('Done');
    expect(reads).toEqual({ loading: 1, success: 1, error: 1 });
  });

  it('reads the messages at the call: later changes to the object change nothing', async () => {
    const changing = { ...messages };
    const { promise, resolve } = deferred<number>();
    toast.promise(promise, changing, { id: 'job' });
    changing.success = 'Changed';
    resolve(1);
    await settle();
    expect(record('job')?.content).toBe('Done');
  });
});

describe('the no-Toaster cap (§8.4)', () => {
  it('returns undefined and starts no async work when the loading toast is rejected', async () => {
    for (let index = 0; index < 100; index++) toast(`Toast ${index}`, { id: `t${index}` });
    const input = vi.fn(() => Promise.resolve(1));
    const success = vi.fn(() => 'Done');
    const promise = Promise.resolve(1);
    const observers = [
      vi.spyOn(promise, 'then'),
      vi.spyOn(promise, 'catch'),
      vi.spyOn(promise, 'finally'),
    ];
    expect(toast.promise(input, { ...messages, success }, { id: 'job' })).toBeUndefined();
    expect(toast.promise(promise, { ...messages, success })).toBeUndefined();
    await settle();
    expect(input).not.toHaveBeenCalled();
    for (const observer of observers) expect(observer).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(record('job')).toBeUndefined();
    expect(inspectRecords()).toHaveLength(100);
  });
});

describe('rejection handling (§13, AC-API-7)', () => {
  /** The promise returned by the library's own `then` on `source`. */
  function observe<T>(source: Promise<T>) {
    const then = vi.spyOn(source, 'then');
    return () => {
      expect(then).toHaveBeenCalledTimes(1);
      expect(then).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
      return then.mock.results[0]?.value as Promise<unknown>;
    };
  }

  it('handles the rejection itself, and the derived promise fulfils', async () => {
    const reason = new Error('rejected');
    const { promise, reject } = deferred<number>();
    const derived = observe(promise);
    const id = toast.promise(promise, messages);
    reject(reason);
    await expect(derived()).resolves.toBeUndefined();
    expect(record(id)?.type).toBe('error');
    // The caller's own promise is unchanged: it still rejects for the caller.
    await expect(promise).rejects.toBe(reason);
  });

  it('keeps the derived promise fulfilled when message functions throw', async () => {
    const throwing = () => {
      throw new Error('message failed');
    };
    const resolved = Promise.resolve(1);
    const rejected = Promise.reject(new Error('rejected'));
    const fromResolved = observe(resolved);
    const fromRejected = observe(rejected);
    toast.promise(resolved, { ...messages, success: throwing, error: throwing });
    toast.promise(rejected, { ...messages, error: throwing });
    await expect(fromResolved()).resolves.toBeUndefined();
    await expect(fromRejected()).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledTimes(2);
    expect(inspectRecords()).toEqual([]);
  });

  it('keeps the derived promise fulfilled when reportError itself throws', async () => {
    attach({});
    const messageError = new Error('error message failed');
    const reportFailure = new Error('reportError failed');
    reportError.mockImplementation(() => {
      throw reportFailure;
    });
    const onDismiss = vi.fn();
    const rejected = Promise.reject(new Error('rejected'));
    const derived = observe(rejected);
    toast.promise(
      rejected,
      {
        ...messages,
        error: () => {
          throw messageError;
        },
      },
      { id: 'job', onDismiss }
    );
    entered('job');
    await expect(derived()).resolves.toBeUndefined();
    // The message error is reported as usual; the failure of that report is reported once more,
    // best effort, and goes no further.
    expect(reportError.mock.calls).toEqual([[messageError], [reportFailure]]);
    expect(record('job')).toMatchObject({
      type: 'loading',
      phase: 'exiting',
      exit: { reason: 'programmatic' },
      promiseToken: undefined,
    });
    exited('job');
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 'job' }), 'programmatic');
  });

  it('adds no unhandled rejection, for direct, function and synchronously throwing input', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      toast.promise(Promise.reject(new Error('direct')), messages);
      toast.promise(() => Promise.reject(new Error('function')), messages);
      toast.promise((): Promise<number> => {
        throw new Error('sync');
      }, messages);
      toast.promise(Promise.reject(new Error('x')), {
        ...messages,
        error: () => {
          throw new Error('message');
        },
      });
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();
      expect(inspectRecords().map(candidate => candidate.type)).toEqual([
        'error',
        'error',
        'error',
      ]);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('notifications', () => {
  it('notifies once for creation and once for settlement of a rendered toast', async () => {
    attach({});
    const listener = vi.fn();
    subscribe(listener);
    toast.promise(Promise.resolve(1), messages, { id: 'job' });
    expect(listener).toHaveBeenCalledTimes(1);
    await settle();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does not notify for a queued-only promise toast', async () => {
    const listener = vi.fn();
    subscribe(listener);
    toast.promise(Promise.resolve(1), messages, { id: 'job' });
    await settle();
    expect(record('job')?.type).toBe('success');
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not notify for an ignored, stale settlement', async () => {
    attach({});
    const { promise, resolve } = deferred<number>();
    toast.promise(promise, messages, { id: 'job' });
    toast('External', { id: 'job' });
    const listener = vi.fn();
    subscribe(listener);
    resolve(1);
    await settle();
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies once for the dismissal after a throwing error message', async () => {
    attach({});
    toast.promise(
      Promise.reject(new Error('x')),
      {
        ...messages,
        error: () => {
          throw new Error('message failed');
        },
      },
      { id: 'job' }
    );
    const listener = vi.fn();
    subscribe(listener);
    await settle();
    expect(record('job')?.phase).toBe('exiting');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
