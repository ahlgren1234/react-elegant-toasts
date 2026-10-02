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
