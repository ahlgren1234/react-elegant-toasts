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

describe('<Toaster maxVisible> (§11)', () => {
  const renderedIds = () => getSnapshot().byPosition['top-right'].map(view => view.id);
  const createMany = (count: number) => {
    for (let index = 1; index <= count; index++) create(`t${index}`);
  };

  it('applies maxVisible from the first mount, without DOM output', () => {
    createMany(4);
    const { container } = render(<Toaster maxVisible={2} />);
    expect(renderedIds()).toEqual(['t1', 't2']);
    expect(phaseOf('t3')).toBe('queued');
    expect(container.childNodes).toHaveLength(0);
  });

  it('applies maxVisible under StrictMode with one notification and no warning', async () => {
    createMany(4);
    const notified: StoreSnapshot[] = [];
    subscribe(() => notified.push(getSnapshot()));
    render(
      <StrictMode>
        <Toaster maxVisible={3} />
      </StrictMode>
    );
    await settle();
    expect(notified).toHaveLength(1);
    expect(renderedIds()).toEqual(['t1', 't2', 't3']);
    expect(phaseOf('t4')).toBe('queued');
    expect(warn).not.toHaveBeenCalled();
  });

  it('changes the limit at runtime without detaching, re-attaching or re-queueing', async () => {
    createMany(6);
    const { rerender } = render(
      <StrictMode>
        <Toaster maxVisible={2} />
      </StrictMode>
    );
    await settle();
    const owner = getSnapshot().active;
    entered('t1');
    const notified: StoreSnapshot[] = [];
    subscribe(() => notified.push(getSnapshot()));

    rerender(
      <StrictMode>
        <Toaster maxVisible={4} />
      </StrictMode>
    );
    await settle();
    expect(notified).toHaveLength(1);
    expect(getSnapshot().active).toBe(owner);
    expect(phaseOf('t1')).toBe('visible');
    expect(renderedIds()).toEqual(['t1', 't2', 't3', 't4']);

    rerender(
      <StrictMode>
        <Toaster maxVisible={1} />
      </StrictMode>
    );
    await settle();
    expect(notified).toHaveLength(1);
    expect(getSnapshot().active).toBe(owner);
    expect(phaseOf('t1')).toBe('visible');
    expect(renderedIds()).toEqual(['t1', 't2', 't3', 't4']);
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps a waiting Toaster's maxVisible inert, then uses it on takeover", async () => {
    createMany(6);
    const { rerender } = render(
      <StrictMode>
        <Toaster key="first" maxVisible={5} />
        <Toaster key="second" maxVisible={1} />
      </StrictMode>
    );
    await settle();
    const first = getSnapshot().active;
    expect(renderedIds()).toHaveLength(5);

    rerender(
      <StrictMode>
        <Toaster key="first" maxVisible={5} />
        <Toaster key="second" maxVisible={2} />
      </StrictMode>
    );
    await settle();
    expect(getSnapshot().active).toBe(first);
    expect(renderedIds()).toHaveLength(5);

    rerender(
      <StrictMode>
        <Toaster key="second" maxVisible={2} />
      </StrictMode>
    );
    await settle();
    expect(getSnapshot().active).not.toBe(first);
    expect(renderedIds()).toEqual(['t1', 't2']);
    expect(phaseOf('t3')).toBe('queued');
  });
});

describe('<Toaster /> and timers (§8.4)', () => {
  const timerOf = (id: string) => inspectRecords().find(record => record.id === id)?.timer;

  it('keeps remaining time through StrictMode replay, without duplicates or warnings', async () => {
    vi.useFakeTimers();
    const onAutoClose = vi.fn();
    upsert({ type: 'default', custom: false, content: 't', options: { id: 't', onAutoClose } });
    const first = render(<Toaster />);
    entered('t');
    vi.advanceTimersByTime(2000);
    first.unmount();
    await settle();
    expect(timerOf('t')).toEqual({ duration: 5000, remaining: 3000, runningSince: null });

    render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    await settle();
    expect(phaseOf('t')).toBe('entering');
    expect(timerOf('t')).toEqual({ duration: 5000, remaining: 3000, runningSince: null });

    entered('t');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(2999);
    expect(phaseOf('t')).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(phaseOf('t')).toBe('exiting');
    expect(onAutoClose).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
