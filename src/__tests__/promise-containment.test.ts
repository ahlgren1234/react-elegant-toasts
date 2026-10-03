// The last-resort boundary of toast.promise (§13): the handlers the library passes to the source's
// `then` can never throw, so the promise `then` returns always fulfils. No reachable store path
// fails while the promise still owns its toast, so this file wraps the store's settlement
// primitives to inject internal failures. Production code is unchanged.
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { toast } from '../index';
import { attach, entered, inspectRecords } from '../store/store';

const failures = vi.hoisted(() => ({
  settle: undefined as Error | undefined,
  dismiss: undefined as Error | undefined,
}));

vi.mock(import('../store/store'), async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    settleOwned: (...args: Parameters<typeof actual.settleOwned>) => {
      if (failures.settle !== undefined) throw failures.settle;
      actual.settleOwned(...args);
    },
    dismissOwned: (...args: Parameters<typeof actual.dismissOwned>) => {
      if (failures.dismiss !== undefined) throw failures.dismiss;
      actual.dismissOwned(...args);
    },
  };
});

const messages = { loading: 'Loading', success: 'Done', error: 'Failed' };
const record = (id: string) => inspectRecords().find(candidate => candidate.id === id);

/** The promise returned by the library's own `then` on `source`. */
function observe<T>(source: Promise<T>) {
  const then = vi.spyOn(source, 'then');
  return () => {
    expect(then).toHaveBeenCalledTimes(1);
    return then.mock.results[0]?.value as Promise<unknown>;
  };
}

let reportError: MockInstance<(error: unknown) => void>;

beforeEach(() => {
  failures.settle = undefined;
  failures.dismiss = undefined;
  reportError = vi.fn();
  vi.stubGlobal('reportError', reportError);
});

describe('toast.promise last-resort containment', () => {
  it('dismisses an owned toast after an internal failure, and reports the failure', async () => {
    attach({});
    const internal = new Error('settlement failed');
    failures.settle = internal;
    const resolved = Promise.resolve(1);
    const derived = observe(resolved);
    toast.promise(resolved, messages, { id: 'job' });
    entered('job');
    await expect(derived()).resolves.toBeUndefined();
    // Never left loading: the toast exits as a programmatic dismissal.
    expect(record('job')).toMatchObject({
      type: 'loading',
      phase: 'exiting',
      exit: { reason: 'programmatic' },
    });
    expect(reportError.mock.calls).toEqual([[internal]]);
  });

  it('fulfils even when the cleanup and the report fail too', async () => {
    attach({});
    const internal = new Error('settlement failed');
    failures.settle = internal;
    failures.dismiss = new Error('dismissal failed');
    reportError.mockImplementation(() => {
      throw new Error('reportError failed');
    });
    const resolved = Promise.resolve(1);
    const derived = observe(resolved);
    toast.promise(resolved, messages, { id: 'job' });
    await expect(derived()).resolves.toBeUndefined();
    // The original failure is still the one reported, after the failed cleanup.
    expect(reportError.mock.calls).toEqual([[internal]]);
  });
});
