import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Toaster } from '../index';
import { dismiss, entered, getSnapshot, inspectRecords, subscribe, upsert } from '../store/store';
import type { StoreSnapshot } from '../store/types';

const create = (id: string) =>
  upsert({ type: 'default', custom: false, content: id, options: { id } });
const phaseOf = (id: string) => inspectRecords().find(record => record.id === id)?.phase;

/** Lets the deferred (microtask) Toaster detach run. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let warn: MockInstance<typeof console.warn>;
const extraToasterWarnings = () =>
  warn.mock.calls.filter(([message]) => String(message).includes('More than one <Toaster />'));

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('<Toaster /> ownership (§8.5)', () => {
  it('produces no DOM output yet (rendering arrives in P-14)', () => {
    create('hello');
    const { container } = render(<Toaster position="bottom-center" />);
    expect(container.childNodes).toHaveLength(0);
  });

  it('becomes active on mount and detaches on unmount', async () => {
    create('queued');
    const { unmount } = render(<Toaster />);
    expect(getSnapshot().active).not.toBeNull();
    expect(phaseOf('queued')).toBe('entering');
    unmount();
    await settle();
    expect(getSnapshot().active).toBeNull();
    expect(phaseOf('queued')).toBe('queued');
  });

  it('survives StrictMode replay without losing ownership, re-queueing or warning', async () => {
    create('toast');
    const notified: StoreSnapshot[] = [];
    subscribe(() => notified.push(getSnapshot()));
    const { rerender, unmount } = render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    await settle();
    rerender(
      <StrictMode>
        <Toaster position="bottom-left" />
      </StrictMode>
    );
    await settle();

    expect(notified).toHaveLength(1);
    expect(notified[0]?.active).not.toBeNull();
    expect(getSnapshot().active).toBe(notified[0]?.active);
    expect(phaseOf('toast')).toBe('entering');
    expect(warn).not.toHaveBeenCalled();

    unmount();
    await settle();
    expect(getSnapshot().active).toBeNull();
  });

  it('lets the first Toaster own, warns once for the second, and hands over on unmount', async () => {
    create('visible');
    create('closing');
    const { rerender } = render(
      <StrictMode>
        <Toaster key="first" />
        <Toaster key="second" />
      </StrictMode>
    );
    await settle();
    const first = getSnapshot().active;
    expect(first).not.toBeNull();
    expect(extraToasterWarnings()).toHaveLength(1);

    entered('visible');
    const onDismissCalls: string[] = [];
    upsert({
      type: 'default',
      custom: false,
      content: 'closing',
      options: { id: 'closing', onDismiss: (_toast, reason) => onDismissCalls.push(reason) },
    });
    dismiss('closing');

    rerender(
      <StrictMode>
        <Toaster key="second" />
      </StrictMode>
    );
    await settle();

    const second = getSnapshot().active;
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(phaseOf('visible')).toBe('entering');
    expect(phaseOf('closing')).toBeUndefined();
    expect(onDismissCalls).toEqual(['programmatic']);
    expect(extraToasterWarnings()).toHaveLength(1);
  });

  it('registers each Toaster once, so the last unmount leaves no owner', async () => {
    const { rerender, unmount } = render(<Toaster />);
    rerender(<Toaster theme="dark" />);
    rerender(<Toaster theme="light" />);
    unmount();
    await settle();
    expect(getSnapshot().active).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
