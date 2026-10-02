import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { attach, dismiss, inspectRecords, upsert } from '../store/store';
import type { ToastId, ToastOptions } from '../types';

const create = (options?: ToastOptions): ToastId | undefined =>
  upsert({ type: 'default', custom: false, content: 'Hello', options });

function fill(count: number): ToastId[] {
  return Array.from({ length: count }, () => create()).filter(
    (id): id is ToastId => id !== undefined
  );
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

let warn: MockInstance<typeof console.warn>;
const noToasterWarnings = () =>
  warn.mock.calls.filter(([message]) => String(message).includes('no <Toaster /> is mounted'));
const capWarnings = () =>
  warn.mock.calls.filter(([message]) => String(message).includes('waiting for a <Toaster />'));

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('creation without an active Toaster (§8.4)', () => {
  it('accepts toasts and keeps them queued until a Toaster attaches', () => {
    const id = create();
    expect(id).toEqual(expect.any(String));
    expect(inspectRecords()[0]?.phase).toBe('queued');
    attach({});
    expect(inspectRecords()[0]?.phase).toBe('entering');
  });

  it('accepts exactly 100 toasts and rejects the 101st, even with an explicit id', () => {
    const onDismiss = vi.fn();
    expect(fill(100)).toHaveLength(100);
    expect(create({ onDismiss })).toBeUndefined();
    expect(create({ id: 'explicit', onDismiss })).toBeUndefined();
    expect(inspectRecords()).toHaveLength(100);
    expect(inspectRecords().some(record => record.id === 'explicit')).toBe(false);
    dismiss();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('still replaces an accepted toast at the cap', () => {
    create({ id: 'existing' });
    fill(99);
    expect(create({ id: 'existing', description: 'Replaced' })).toBe('existing');
    expect(inspectRecords().find(record => record.id === 'existing')?.description).toBe('Replaced');
  });

  it('applies the cap only while no Toaster is active, and keeps every record on detach', async () => {
    const detach = attach({});
    expect(fill(150)).toHaveLength(150);
    detach();
    await settle();
    expect(inspectRecords()).toHaveLength(150);
    expect(inspectRecords().every(record => record.phase === 'queued')).toBe(true);
    expect(create()).toBeUndefined();

    for (const record of inspectRecords().slice(0, 51)) dismiss(record.id);
    expect(create()).toEqual(expect.any(String));
    expect(create()).toBeUndefined();
  });
});

describe('development warnings', () => {
  it('logs the cap warning once, and again after the store drops below the cap', () => {
    fill(100);
    create();
    create();
    expect(capWarnings()).toHaveLength(1);
    dismiss(inspectRecords()[0]?.id);
    create();
    create();
    expect(capWarnings()).toHaveLength(2);
  });

  it('logs the no-Toaster warning only after the internal delay, once per period', () => {
    vi.useFakeTimers();
    create();
    vi.advanceTimersByTime(999);
    expect(noToasterWarnings()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(noToasterWarnings()).toHaveLength(1);
    create();
    vi.advanceTimersByTime(5000);
    expect(noToasterWarnings()).toHaveLength(1);
  });

  it('stays silent when a Toaster attaches within the delay, as at start-up', () => {
    vi.useFakeTimers();
    create();
    vi.advanceTimersByTime(500);
    attach({});
    vi.advanceTimersByTime(5000);
    expect(noToasterWarnings()).toHaveLength(0);
  });

  it('starts a new period after a Toaster has attached and detached', async () => {
    vi.useFakeTimers();
    create();
    vi.advanceTimersByTime(1000);
    const detach = attach({});
    detach();
    await settle();
    create({ id: 'replaced-later' });
    vi.advanceTimersByTime(1000);
    expect(noToasterWarnings()).toHaveLength(2);
  });

  it('is armed by an accepted replacement, but not by a detach or a rejected call', async () => {
    vi.useFakeTimers();
    const detach = attach({});
    create({ id: 'kept' });
    fill(99);
    detach();
    await settle();
    expect(create()).toBeUndefined();
    vi.advanceTimersByTime(5000);
    expect(noToasterWarnings()).toHaveLength(0);

    expect(create({ id: 'kept' })).toBe('kept');
    vi.advanceTimersByTime(1000);
    expect(noToasterWarnings()).toHaveLength(1);
  });

  it('warns at most once per extra Toaster, even when it attaches again later', async () => {
    attach({});
    const extra = {};
    const detachExtra = attach(extra);
    detachExtra();
    await settle();
    attach(extra);
    const extraWarnings = warn.mock.calls.filter(([message]) =>
      String(message).includes('More than one <Toaster />')
    );
    expect(extraWarnings).toHaveLength(1);
  });

  it('logs nothing in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.useFakeTimers();
    fill(101);
    vi.advanceTimersByTime(5000);
    attach({});
    attach({});
    expect(warn).not.toHaveBeenCalled();
  });
});
