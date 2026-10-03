// @vitest-environment node
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { toast } from '../index';
import { getServerSnapshot, getSnapshot, inspectRecords, upsert } from '../store/store';

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('on the server (§8.3)', () => {
  it('runs without a window', () => {
    expect(typeof window).toBe('undefined');
  });

  it('rejects creation, even with an explicit id, and stores nothing', () => {
    expect(toast('Hello')).toBeUndefined();
    expect(toast.success('Saved', { id: 'explicit' })).toBeUndefined();
    expect(
      upsert({ type: 'info', custom: false, content: 'Direct', options: undefined })
    ).toBeUndefined();
    expect(inspectRecords()).toEqual([]);
    expect(getSnapshot()).toBe(getServerSnapshot());
  });

  it('rejects every creation variant, with explicit ids and malformed options, generating no ID', () => {
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const variants = [
      toast,
      toast.success,
      toast.error,
      toast.warning,
      toast.info,
      toast.loading,
      toast.custom,
    ];
    for (const create of variants) {
      expect(create('Hello')).toBeUndefined();
      expect(create('Hello', { id: 'explicit' })).toBeUndefined();
      const malformed = { id: 42, position: 'nowhere', duration: NaN, action: 'bad', onDismiss: 1 };
      expect(create('Hello', malformed as never)).toBeUndefined();
      expect(create('Hello', null as never)).toBeUndefined();
    }
    expect(inspectRecords()).toEqual([]);
    expect(randomUUID).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('called on the server'));
    expect(error).not.toHaveBeenCalled();
  });

  it('never reads the options on the server', () => {
    const read = vi.fn();
    const options = Object.defineProperties(
      {},
      {
        id: { get: read },
        position: { get: read },
        duration: { get: read },
      }
    );
    expect(toast.custom('Hello', options)).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });

  it('warns once in development', () => {
    toast('One');
    toast('Two');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('called on the server'));
  });

  it('logs nothing in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    toast('Hello');
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects toast.promise without reading, invoking or observing anything', async () => {
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID');
    const read = vi.fn();
    const messages = Object.defineProperties(
      {},
      { loading: { get: read }, success: { get: read }, error: { get: read } }
    ) as never;
    const options = Object.defineProperties({}, { id: { get: read }, duration: { get: read } });
    const input = vi.fn(() => Promise.resolve(1));
    // A promise that never settles, so nothing unhandled is left behind.
    const promise = new Promise<number>(() => undefined);
    const observers = [
      vi.spyOn(promise, 'then'),
      vi.spyOn(promise, 'catch'),
      vi.spyOn(promise, 'finally'),
    ];
    const success = vi.fn(() => 'Done');
    const error = vi.fn(() => 'Failed');

    expect(toast.promise(input, messages, options)).toBeUndefined();
    expect(toast.promise(promise, messages, { id: 'explicit' })).toBeUndefined();
    expect(
      toast.promise(Promise.resolve(1), { loading: 'L', success, error }, { id: 'explicit' })
    ).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();

    expect(input).not.toHaveBeenCalled();
    for (const observer of observers) expect(observer).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(randomUUID).not.toHaveBeenCalled();
    expect(inspectRecords()).toEqual([]);
    expect(getSnapshot()).toBe(getServerSnapshot());
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('shares the one server warning with the other creation calls', () => {
    toast('One');
    toast.promise(Promise.resolve(1), { loading: 'L', success: 'S', error: 'E' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('called on the server'));
  });

  it('ignores dismiss', () => {
    expect(() => {
      toast.dismiss();
      toast.dismiss('unknown');
    }).not.toThrow();
    expect(inspectRecords()).toEqual([]);
  });

  it('keeps a constant, empty server snapshot', () => {
    const snapshot = getServerSnapshot();
    expect(getServerSnapshot()).toBe(snapshot);
    expect(snapshot.active).toBeNull();
    expect(Object.values(snapshot.byPosition).every(list => list.length === 0)).toBe(true);
  });
});
