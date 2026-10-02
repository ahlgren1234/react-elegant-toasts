// The P-08 stub contract. P-09 (store) and P-14 (rendering) replace these tests as behaviour arrives.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from '../index';

const CREATION_METHODS = ['success', 'error', 'warning', 'info', 'loading', 'custom'] as const;

describe('P-08 skeleton', () => {
  it('toast is callable and has every §6.2 method as a separate function', () => {
    expect(typeof toast).toBe('function');
    for (const method of [...CREATION_METHODS, 'promise', 'dismiss'] as const) {
      expect(typeof toast[method]).toBe('function');
      expect(toast[method]).not.toBe(toast);
    }
  });

  it('accepts nothing yet: every creation call returns undefined', () => {
    expect(toast('Hello')).toBeUndefined();
    expect(toast('Hello', { id: 'explicit' })).toBeUndefined();
    for (const method of CREATION_METHODS) {
      expect(toast[method]('Hello')).toBeUndefined();
    }
  });

  it('toast.promise returns undefined without invoking or observing its input', () => {
    const messages = { loading: 'Loading', success: 'Done', error: 'Failed' };
    const input = vi.fn(() => Promise.resolve('value'));
    expect(toast.promise(input, messages)).toBeUndefined();
    expect(input).not.toHaveBeenCalled();

    const promise = Promise.resolve('value');
    const observers = [
      vi.spyOn(promise, 'then'),
      vi.spyOn(promise, 'catch'),
      vi.spyOn(promise, 'finally'),
    ];
    expect(toast.promise(promise, messages)).toBeUndefined();
    for (const observer of observers) expect(observer).not.toHaveBeenCalled();
  });

  it('toast.dismiss accepts an ID or nothing and returns nothing', () => {
    expect(toast.dismiss('some-id')).toBeUndefined();
    expect(toast.dismiss()).toBeUndefined();
  });

  it('<Toaster /> produces no DOM output', () => {
    const { container } = render(<Toaster position="bottom-center" />);
    expect(container.childNodes).toHaveLength(0);
  });
});
