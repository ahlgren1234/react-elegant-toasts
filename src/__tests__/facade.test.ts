import { describe, expect, it, vi } from 'vitest';
import { toast } from '../index';
import { inspectRecords } from '../store/store';

const record = (id: string | undefined) => inspectRecords().find(candidate => candidate.id === id);

describe('toast facade wiring', () => {
  it('creates a toast of the matching type for every creation call and returns its ID', () => {
    const created = {
      default: toast('Default'),
      success: toast.success('Success'),
      error: toast.error('Error'),
      warning: toast.warning('Warning'),
      info: toast.info('Info'),
      loading: toast.loading('Loading'),
      custom: toast.custom('Custom'),
    };
    for (const [type, id] of Object.entries(created)) {
      expect(id).toEqual(expect.any(String));
      expect(record(id)).toMatchObject({
        type,
        custom: type === 'custom',
        content: type.replace(/^\w/, c => c.toUpperCase()),
      });
    }
  });

  it('passes the options through, including an explicit id', () => {
    expect(toast.info('Hello', { id: 'greeting', description: 'World' })).toBe('greeting');
    expect(record('greeting')).toMatchObject({ description: 'World' });
  });

  it('dismisses one toast or all of them', () => {
    const onDismiss = vi.fn();
    const first = toast('First', { onDismiss });
    toast('Second', { onDismiss });
    expect(toast.dismiss(first)).toBeUndefined();
    expect(record(first)).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: first }), 'programmatic');
    toast.dismiss();
    expect(inspectRecords()).toEqual([]);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});

describe('toast.promise (still the P-08 stub until P-13)', () => {
  const messages = { loading: 'Loading', success: 'Done', error: 'Failed' };

  it('returns undefined, creates no toast and never invokes function input', () => {
    const input = vi.fn(() => Promise.resolve('value'));
    expect(toast.promise(input, messages)).toBeUndefined();
    expect(input).not.toHaveBeenCalled();
    expect(inspectRecords()).toEqual([]);
  });

  it('never observes a promise', () => {
    const promise = Promise.resolve('value');
    const observers = [
      vi.spyOn(promise, 'then'),
      vi.spyOn(promise, 'catch'),
      vi.spyOn(promise, 'finally'),
    ];
    expect(toast.promise(promise, messages, { id: 'promised' })).toBeUndefined();
    for (const observer of observers) expect(observer).not.toHaveBeenCalled();
    expect(inspectRecords()).toEqual([]);
  });
});
