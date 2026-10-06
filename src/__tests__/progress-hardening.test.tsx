// Progress hardening (P-20 S4): timing races near expiry, duration edges, lifecycle paths, the real
// environment-pause wiring, and isolation from P-18, focus and the live regions, across the whole
// production implementation (S1 view facts, S2 DOM and T1, S3 stylesheet classes). jsdom runs no
// animation: these read the timing each fill is placed from and which fill node carries it. The
// genuine hidden-tab, minimised-window and visual evidence is Chromium's (see the S4 record).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast, type ToastOptions } from '../index';
import { announcementText } from '../react/announcer';
import { dismiss, inspectRecords, setGlobalPause, setStackPause } from '../store/store';

const inToasts = { ignore: 'script, style, [aria-live] *' };
const itemOf = (text: string) => screen.getByText(text, inToasts).closest('li') as HTMLLIElement;
const fillOf = (item: Element) =>
  item.querySelector(':scope > .ret-toast__progress > .ret-toast__progress-fill') as HTMLElement;
const timingOf = (item: Element) => {
  const fill = fillOf(item);
  return { duration: fill.style.animationDuration, delay: fill.style.animationDelay };
};
const recordOf = (id: string) => inspectRecords().find(record => record.id === id);
const phaseOf = (id: string) => recordOf(id)?.phase;
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const flush = () => advance(0);

function showVisible(text: string, options: ToastOptions & { id: string }) {
  act(() => {
    toast(text, options);
  });
  flush();
  expect(phaseOf(options.id)).toBe('visible');
  return itemOf(text);
}

/** Document visibility through the real P-15 listener, as a tab switch reports it. */
function setHidden(hidden: boolean, spy: ReturnType<typeof vi.spyOn>) {
  spy.mockReturnValue(hidden);
  act(() => {
    fireEvent(document, new Event('visibilitychange'));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('timeout races', () => {
  it('a pause 1 ms before expiry holds the bar there, and the timeout comes only after resume', () => {
    render(<Toaster progress />);
    const onAutoClose = vi.fn();
    const item = showVisible('t', { id: 't', onAutoClose });
    advance(4999);
    act(() => setGlobalPause('window-blur', true));
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-4999ms' });
    advance(60_000);
    expect(phaseOf('t')).toBe('visible');
    act(() => setGlobalPause('window-blur', false));
    expect(item.hasAttribute('data-paused')).toBe(false);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-4999ms' });
    advance(1);
    expect(phaseOf('t')).toBe('exiting');
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-5000ms' });
    expect(onAutoClose).toHaveBeenCalledTimes(1);
  });

  it('a dismissal 1 ms before expiry exits once, with the folded value, and no timeout', () => {
    render(<Toaster progress />);
    const onAutoClose = vi.fn();
    const onDismiss = vi.fn();
    const item = showVisible('t', { id: 't', onAutoClose, onDismiss });
    advance(4999);
    act(() => dismiss('t'));
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-4999ms' });
    advance(10);
    flush();
    expect(phaseOf('t')).toBeUndefined();
    expect(onAutoClose).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss.mock.calls[0]?.[1]).toBe('programmatic');
  });

  it('a pause just after expiry changes nothing: empty, exiting, unmarked', () => {
    render(<Toaster progress />);
    const item = showVisible('t', { id: 't' });
    advance(5000);
    const empty = fillOf(item);
    act(() => setGlobalPause('document-hidden', true));
    expect(phaseOf('t')).toBe('exiting');
    expect(fillOf(item)).toBe(empty);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-5000ms' });
    expect(item.hasAttribute('data-paused')).toBe(false);
  });

  it('resume with a sub-millisecond remainder runs it out with no invalid timing', () => {
    render(<Toaster progress />);
    const item = showVisible('t', { id: 't' });
    advance(4999.5);
    act(() => setStackPause('top-right', true));
    act(() => setStackPause('top-right', false));
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-4999.5ms' });
    advance(0.5);
    expect(phaseOf('t')).toBe('exiting');
    expect(timingOf(item).delay).toBe('-5000ms');
  });
});

describe('duration edges', () => {
  it('a zero duration is empty-ready at once and exits on the next tick, never NaN or -0', () => {
    render(<Toaster progress />);
    act(() => {
      toast('zero', { id: 'z', duration: 0 });
    });
    const item = itemOf('zero');
    expect(timingOf(item)).toEqual({ duration: '0ms', delay: '0ms' });
    flush();
    expect(phaseOf('z')).toBe('visible');
    // Its 0 ms expiry is armed at the current instant; fake timers fire it on the next tick.
    advance(1);
    expect(phaseOf('z')).toBe('exiting');
    expect(timingOf(item)).toEqual({ duration: '0ms', delay: '0ms' });
  });

  it('a 1 ms duration runs and exits empty', () => {
    render(<Toaster progress />);
    const item = showVisible('tiny', { id: 'tiny', duration: 1 });
    expect(timingOf(item)).toEqual({ duration: '1ms', delay: '0ms' });
    advance(1);
    expect(timingOf(item)).toEqual({ duration: '1ms', delay: '-1ms' });
  });

  it('finite to persistent to finite: the strip goes, then returns full with a fresh fill', () => {
    render(<Toaster progress />);
    const item = showVisible('t', { id: 't' });
    advance(2000);
    act(() => {
      toast('t', { id: 't', duration: Infinity });
    });
    expect(item.querySelector('.ret-toast__progress')).toBeNull();
    expect(item.hasAttribute('data-paused')).toBe(false);
    act(() => {
      toast('t', { id: 't', duration: 3000 });
    });
    expect(itemOf('t')).toBe(item);
    expect(timingOf(item)).toEqual({ duration: '3000ms', delay: '0ms' });
    for (const value of Object.values(timingOf(item))) expect(value).not.toMatch(/NaN|Infinity/);
  });
});

describe('lifecycle paths', () => {
  it('a promoted toast enters full and frozen, and runs only once it is visible', () => {
    render(<Toaster progress maxVisible={1} />);
    showVisible('first', { id: 'a' });
    act(() => {
      toast('second', { id: 'b' });
    });
    expect(screen.queryByText('second', inToasts)).toBeNull();
    act(() => dismiss('a'));
    flush();
    const item = itemOf('second');
    expect(item.getAttribute('data-phase')).toBe('entering');
    const frozen = fillOf(item);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '0ms' });
    flush();
    expect(phaseOf('b')).toBe('visible');
    expect(fillOf(item)).not.toBe(frozen);
  });

  it('P-18: an exit completes while the bar is frozen and the page is hidden', () => {
    render(<Toaster progress />);
    const hidden = vi.spyOn(document, 'hidden', 'get');
    const item = showVisible('t', { id: 't' });
    advance(1000);
    setHidden(true, hidden);
    act(() => dismiss('t'));
    expect(item.getAttribute('data-phase')).toBe('exiting');
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-1000ms' });
    flush();
    expect(phaseOf('t')).toBeUndefined();
    setHidden(false, hidden);
    hidden.mockRestore();
  });
});

describe('the real environment wiring (P-15) and T1', () => {
  it('a hidden round trip folds once, recreates the fill twice, and keeps focus and the announcement', async () => {
    render(<Toaster progress />);
    const hidden = vi.spyOn(document, 'hidden', 'get');
    const item = showVisible('t', { id: 't', action: { label: 'Undo', onClick: () => undefined } });
    const close = item.querySelector('.ret-toast__close') as HTMLButtonElement;
    const polite = document.querySelector('section > [aria-live="polite"]') as HTMLElement;
    const added: Node[] = [];
    new MutationObserver(records => {
      for (const record of records) added.push(...record.addedNodes);
    }).observe(polite, { childList: true });
    advance(1500);
    act(() => setStackPause('bottom-left', true));
    const running = fillOf(item);
    setHidden(true, hidden);
    const held = fillOf(item);
    expect(held).not.toBe(running);
    expect(item.hasAttribute('data-paused')).toBe(true);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-1500ms' });
    advance(60_000);
    setHidden(false, hidden);
    expect(fillOf(item)).not.toBe(held);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-1500ms' });
    expect(recordOf('t')?.timer.runningSince).not.toBeNull();
    // Focus inside the toast through a whole cycle stays put, on the same node.
    act(() => close.focus());
    setHidden(true, hidden);
    setHidden(false, hidden);
    expect(document.activeElement).toBe(close);
    expect(item.querySelector('.ret-toast__close')).toBe(close);
    // The original announcement expires on its own; no node was ever added for the cycles.
    await Promise.resolve();
    expect(added).toEqual([]);
    expect(announcementText(item, false)).toBe('t');
    hidden.mockRestore();
  });

  it('StrictMode: one fill, one record and one listener of each environment kind, through a hidden cycle', () => {
    const net = new Map<string, number>();
    const count = (target: EventTarget, type: string, by: number) => {
      if (target === window || target === document) net.set(type, (net.get(type) ?? 0) + by);
    };
    for (const target of [window, document] as EventTarget[]) {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
        count(target, type, 1);
        add(type, listener, options);
      });
      vi.spyOn(target, 'removeEventListener').mockImplementation((type, listener, options) => {
        count(target, type, -1);
        remove(type, listener, options);
      });
    }
    render(
      <StrictMode>
        <Toaster progress />
      </StrictMode>
    );
    const hidden = vi.spyOn(document, 'hidden', 'get');
    const item = showVisible('t', { id: 't' });
    setHidden(true, hidden);
    setHidden(false, hidden);
    for (const type of ['blur', 'focus', 'visibilitychange']) expect(net.get(type), type).toBe(1);
    expect(item.querySelectorAll('.ret-toast__progress-fill')).toHaveLength(1);
    expect(document.querySelectorAll('.ret-toast__progress')).toHaveLength(1);
    expect(inspectRecords()).toHaveLength(1);
    expect(recordOf('t')?.timer.runningSince).not.toBeNull();
    hidden.mockRestore();
  });
});

describe('direction (D-11)', () => {
  it('uses the same markup in LTR and RTL: only the inherited direction differs', async () => {
    const markup = async (direction: 'ltr' | 'rtl') => {
      const { unmount } = render(
        <div dir={direction}>
          <Toaster progress />
        </div>
      );
      act(() => {
        toast('t', { id: `t-${direction}` });
      });
      const html = itemOf('t').outerHTML;
      act(() => dismiss());
      flush();
      unmount();
      // Let the deferred detach finish, so the next Toaster becomes active.
      await act(async () => {
        for (let tick = 0; tick < 5; tick++) await Promise.resolve();
      });
      return html;
    };
    const ltr = await markup('ltr');
    expect(await markup('rtl')).toBe(ltr);
  });
});
