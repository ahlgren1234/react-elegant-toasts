// The progress indicator's DOM and state (P-20 S2): option resolution, presence, the D1 strip and
// fill, `data-paused`, inline timing from the store's boundary facts, and T1 recreation of the fill
// at every timer run boundary, with nothing else remounted. jsdom runs no animation: these tests
// read the timing the stylesheet will run from, and which fill node carries it. The visual
// styling, the keyframe and the run and hold selectors are S3's.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast, type ToasterProps, type ToastOptions } from '../index';
import { announcementText } from '../react/announcer';
import {
  dismiss,
  inspectRecords,
  setGlobalPause,
  setStackPause,
  setToastPause,
} from '../store/store';

const inToasts = { ignore: 'script, style, [aria-live] *' };
const itemOf = (text: string) => screen.getByText(text, inToasts).closest('li') as HTMLLIElement;
const stripOf = (item: Element) => item.querySelector(':scope > .ret-toast__progress');
const fillOf = (item: Element) =>
  item.querySelector(':scope > .ret-toast__progress > .ret-toast__progress-fill') as HTMLElement;
const timingOf = (item: Element) => {
  const fill = fillOf(item);
  return { duration: fill.style.animationDuration, delay: fill.style.animationDelay };
};
const phaseOf = (id: string) => inspectRecords().find(record => record.id === id)?.phase;
const isRunning = (id: string) =>
  inspectRecords().find(record => record.id === id)?.timer.runningSince != null;
const paused = (item: Element) => item.hasAttribute('data-paused');

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
/** Runs the lifecycle fallbacks scheduled by the last render (jsdom completes on the 0 ms path). */
const flush = () => advance(0);

function show(content: ReactNode, options: ToastOptions & { id: string }) {
  act(() => {
    toast(content, options);
  });
}

function showVisible(content: string, options: ToastOptions & { id: string }) {
  show(content, options);
  flush();
  expect(phaseOf(options.id)).toBe('visible');
  return itemOf(content);
}

const mount = (props: ToasterProps = {}) => render(<Toaster progress {...props} />);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('resolution and presence (§6.3, §6.4, P-20 S2)', () => {
  it.each<[string, boolean | undefined, ToastOptions['progress'], boolean]>([
    ['off by default', undefined, undefined, false],
    ['on from the Toaster', true, undefined, true],
    ['on from the toast, with the Toaster off', false, true, true],
    ['on from the toast, with the Toaster unset', undefined, true, true],
    ['off from the toast, with the Toaster on', true, false, false],
  ])('%s', (_name, toasterDefault, own, shown) => {
    render(<Toaster progress={toasterDefault} />);
    show('t', { id: 't', ...(own !== undefined && { progress: own }) });
    expect(stripOf(itemOf('t')) !== null).toBe(shown);
  });

  it('never shows on a persistent or loading toast', () => {
    mount();
    show('persistent', { id: 'p', duration: Infinity, progress: true });
    act(() => {
      toast.loading('loading', { id: 'l', progress: true });
    });
    expect(stripOf(itemOf('persistent'))).toBeNull();
    expect(stripOf(itemOf('loading'))).toBeNull();
  });

  it('never shows on a custom toast, from the Toaster or smuggled past the types', () => {
    mount();
    act(() => {
      toast.custom(<div>plain</div>, { id: 'a' });
      toast.custom(<div>smuggled</div>, { id: 'b', progress: true } as never);
    });
    for (const text of ['plain', 'smuggled']) {
      const item = itemOf(text);
      expect(item.querySelector('[class*="progress"]')).toBeNull();
      expect(item.innerHTML).toBe(`<div>${text}</div>`);
    }
  });

  it('appears when a loading toast settles finite, and goes when a replacement is persistent', async () => {
    mount();
    let resolve!: () => void;
    act(() => {
      toast.promise(
        new Promise<void>(r => (resolve = r)),
        {
          loading: 'Saving',
          success: 'Saved',
          error: 'Failed',
        },
        { id: 't' }
      );
    });
    flush();
    expect(stripOf(itemOf('Saving'))).toBeNull();
    await act(async () => {
      resolve();
      await Promise.resolve();
    });
    const item = itemOf('Saved');
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '0ms' });
    show('Saved forever', { id: 't', duration: Infinity });
    expect(itemOf('Saved forever')).toBe(item);
    expect(stripOf(item)).toBeNull();
  });
});

describe('structure (D1 sign-off, decisions 6, 7 and 11)', () => {
  it('is a decorative strip, the last direct child, holding only an empty fill', () => {
    mount();
    const item = showVisible('Saved', {
      id: 't',
      description: 'Synced',
      action: { label: 'Undo', onClick: () => undefined },
    });
    expect([...item.children].map(child => child.className)).toEqual([
      'ret-toast__content',
      'ret-toast__action',
      'ret-toast__close',
      'ret-toast__progress',
    ]);
    const strip = stripOf(item) as HTMLElement;
    expect(strip.tagName).toBe('DIV');
    expect([...strip.attributes].map(a => `${a.name}=${a.value}`)).toEqual([
      'class=ret-toast__progress',
      'aria-hidden=true',
    ]);
    expect(strip.children).toHaveLength(1);
    const fill = fillOf(item);
    expect([...fill.attributes].map(a => a.name).sort()).toEqual(['class', 'style']);
    expect(strip.textContent).toBe('');
    expect(item.querySelector('[role="progressbar"], progress, [aria-valuenow]')).toBeNull();
    expect(strip.tabIndex).toBe(-1);
    expect(strip.hasAttribute('tabindex')).toBe(false);
  });

  it('adds nothing to the announcement text', () => {
    mount();
    const item = showVisible('Saved', { id: 't', description: 'Synced' });
    expect(announcementText(item, false)).toBe('Saved Synced');
    const polite = document.querySelector('section > [aria-live="polite"]') as HTMLElement;
    expect(polite.textContent).toBe('Saved Synced');
  });
});

describe('data-paused (decision 1)', () => {
  it('marks a held finite toast, and only while held', () => {
    mount();
    const item = showVisible('t', { id: 't' });
    expect(paused(item)).toBe(false);
    act(() => setGlobalPause('window-blur', true));
    expect(item.getAttribute('data-paused')).toBe('');
    act(() => setGlobalPause('window-blur', false));
    expect(paused(item)).toBe(false);
  });

  it('marks a held finite custom toast, which has no progress DOM', () => {
    mount();
    act(() => {
      toast.custom(<div>custom</div>, { id: 'c' });
    });
    flush();
    const item = itemOf('custom');
    act(() => setStackPause('top-right', true));
    expect(paused(item)).toBe(true);
    expect(item.querySelector('[class*="progress"]')).toBeNull();
  });

  it('never marks a persistent, loading or exiting toast', () => {
    mount();
    showVisible('persistent', { id: 'p', duration: Infinity });
    act(() => {
      toast.loading('loading', { id: 'l' });
    });
    showVisible('finite', { id: 'f' });
    act(() => setGlobalPause('window-blur', true));
    expect(paused(itemOf('persistent'))).toBe(false);
    expect(paused(itemOf('loading'))).toBe(false);
    expect(paused(itemOf('finite'))).toBe(true);
    act(() => dismiss('f'));
    expect(itemOf('finite').getAttribute('data-phase')).toBe('exiting');
    expect(paused(itemOf('finite'))).toBe(false);
  });

  it('marks an entering toast only for a pause reason, never for its phase', () => {
    mount();
    show('quiet', { id: 'q' });
    expect(itemOf('quiet').getAttribute('data-phase')).toBe('entering');
    expect(paused(itemOf('quiet'))).toBe(false);
    act(() => setStackPause('top-right', true));
    expect(paused(itemOf('quiet'))).toBe(true);
  });
});

describe('T1: the fill is recreated at every run boundary (decision 3)', () => {
  it('a new running segment begins when the toast enters, with nothing else remounted', () => {
    mount();
    show('t', { id: 't', action: { label: 'Undo', onClick: () => undefined } });
    const item = itemOf('t');
    const content = item.querySelector('.ret-toast__content');
    const close = item.querySelector('.ret-toast__close');
    const strip = stripOf(item);
    const frozen = fillOf(item);
    expect(item.getAttribute('data-phase')).toBe('entering');
    expect(isRunning('t')).toBe(false);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '0ms' });

    flush();
    expect(item.getAttribute('data-phase')).toBe('visible');
    expect(isRunning('t')).toBe(true);
    expect(fillOf(item)).not.toBe(frozen);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '0ms' });
    expect(itemOf('t')).toBe(item);
    expect(item.querySelector('.ret-toast__content')).toBe(content);
    expect(item.querySelector('.ret-toast__close')).toBe(close);
    expect(stripOf(item)).toBe(strip);
  });

  it('a held entering toast starts no segment until its last reason clears', () => {
    mount();
    act(() => setStackPause('top-right', true));
    show('t', { id: 't' });
    const item = itemOf('t');
    const frozen = fillOf(item);
    flush();
    expect(item.getAttribute('data-phase')).toBe('visible');
    expect(isRunning('t')).toBe(false);
    expect(paused(item)).toBe(true);
    expect(fillOf(item)).toBe(frozen);

    act(() => setStackPause('top-right', false));
    expect(isRunning('t')).toBe(true);
    expect(fillOf(item)).not.toBe(frozen);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '0ms' });
  });

  it('D-10: a pause recreates it from the folded remaining, and resume from the same value', () => {
    mount();
    const item = showVisible('t', { id: 't' });
    const running = fillOf(item);
    advance(2000);
    expect(fillOf(item)).toBe(running);

    act(() => setGlobalPause('window-blur', true));
    const held = fillOf(item);
    expect(held).not.toBe(running);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-2000ms' });
    expect(paused(item)).toBe(true);
    advance(60_000);
    expect(fillOf(item)).toBe(held);

    act(() => setGlobalPause('window-blur', false));
    expect(fillOf(item)).not.toBe(held);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-2000ms' });
    expect(paused(item)).toBe(false);
  });

  // A pause and its resume that reach React in one batched render leave `running` and the
  // revision as they were, but the store folded the held time out of `remaining`, while an old
  // animation would have run through it. The new `remaining` alone must recreate the fill.
  it('a pause and resume batched into one render still recreate it from the folded remaining', () => {
    mount();
    const item = showVisible('t', { id: 't' });
    advance(1000);
    const before = fillOf(item);
    act(() => {
      setGlobalPause('window-blur', true);
      vi.advanceTimersByTime(1000);
      setGlobalPause('window-blur', false);
    });
    expect(isRunning('t')).toBe(true);
    expect(fillOf(item)).not.toBe(before);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-1000ms' });
  });

  it('time passing never recreates it', () => {
    mount();
    const item = showVisible('t', { id: 't', duration: 10_000 });
    const fill = fillOf(item);
    for (let step = 0; step < 99; step++) advance(100);
    expect(fillOf(item)).toBe(fill);
    expect(timingOf(item)).toEqual({ duration: '10000ms', delay: '0ms' });
  });

  it('overlapping reasons recreate it only at the first hold and the final release', () => {
    mount();
    const item = showVisible('t', { id: 't' });
    advance(1000);
    act(() => setToastPause('t', 'focus-within', true));
    const held = fillOf(item);
    act(() => setStackPause('top-right', true));
    expect(fillOf(item)).toBe(held);
    act(() => setToastPause('t', 'focus-within', false));
    expect(fillOf(item)).toBe(held);
    act(() => setGlobalPause('document-hidden', true));
    act(() => setStackPause('top-right', false));
    expect(fillOf(item)).toBe(held);
    act(() => setGlobalPause('document-hidden', false));
    expect(fillOf(item)).not.toBe(held);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-1000ms' });
  });

  it('another toast or stack pausing leaves it alone', () => {
    mount();
    const item = showVisible('t', { id: 't' });
    showVisible('other', { id: 'o' });
    showVisible('elsewhere', { id: 'x', position: 'bottom-left' });
    const fill = fillOf(item);
    act(() => setToastPause('o', 'focus-within', true));
    act(() => setStackPause('bottom-left', true));
    expect(fillOf(item)).toBe(fill);
  });
});

describe('lifecycle (decision 4)', () => {
  it('a non-timeout exit freezes the folded remaining, unmarked', () => {
    mount();
    const item = showVisible('t', { id: 't' });
    advance(1500);
    act(() => setToastPause('t', 'focus-within', true));
    act(() => dismiss('t'));
    expect(item.getAttribute('data-phase')).toBe('exiting');
    expect(paused(item)).toBe(false);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-1500ms' });
    const frozen = fillOf(item);
    act(() => setGlobalPause('window-blur', true));
    expect(fillOf(item)).toBe(frozen);
    expect(paused(item)).toBe(false);
  });

  it('a timeout leaves it empty, unmarked', () => {
    mount();
    const item = showVisible('t', { id: 't' });
    advance(5000);
    expect(item.getAttribute('data-phase')).toBe('exiting');
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-5000ms' });
    expect(paused(item)).toBe(false);
  });

  it('a revival on the same node starts from the new full duration', () => {
    mount();
    const item = showVisible('t', { id: 't' });
    advance(2000);
    act(() => dismiss('t'));
    const exiting = fillOf(item);
    show('t', { id: 't', duration: 8000 });
    expect(itemOf('t')).toBe(item);
    expect(item.getAttribute('data-phase')).toBe('entering');
    expect(fillOf(item)).not.toBe(exiting);
    expect(timingOf(item)).toEqual({ duration: '8000ms', delay: '0ms' });
  });

  it('a replacement in place restarts from the new duration', () => {
    mount();
    const item = showVisible('t', { id: 't' });
    advance(2500);
    const before = fillOf(item);
    show('t', { id: 't', duration: 7000 });
    expect(itemOf('t')).toBe(item);
    expect(fillOf(item)).not.toBe(before);
    expect(timingOf(item)).toEqual({ duration: '7000ms', delay: '0ms' });
  });

  it('a detached toast returns frozen at its kept remaining, then runs from it', async () => {
    const first = mount();
    showVisible('t', { id: 't' });
    advance(2000);
    first.unmount();
    await act(async () => {
      for (let tick = 0; tick < 5; tick++) await Promise.resolve();
    });
    expect(phaseOf('t')).toBe('queued');
    expect(screen.queryByText('t', inToasts)).toBeNull();

    mount();
    const item = itemOf('t');
    expect(item.getAttribute('data-phase')).toBe('entering');
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-2000ms' });
    const frozen = fillOf(item);
    flush();
    expect(isRunning('t')).toBe(true);
    expect(fillOf(item)).not.toBe(frozen);
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-2000ms' });
  });

  it('formats fractional and zero durations without NaN, Infinity or -0', () => {
    mount();
    const item = showVisible('t', { id: 't', duration: 1234.5 });
    advance(0.5);
    act(() => setGlobalPause('window-blur', true));
    expect(timingOf(item)).toEqual({ duration: '1234.5ms', delay: '-0.5ms' });
    show('zero', { id: 'z', duration: 0 });
    expect(timingOf(itemOf('zero'))).toEqual({ duration: '0ms', delay: '0ms' });
  });
});

describe('isolation', () => {
  /** A native `animationend`, as a browser would dispatch it; jsdom has no `AnimationEvent`. */
  function animationEnd(target: Element, animationName: string) {
    const event = new Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: animationName });
    act(() => {
      target.dispatchEvent(event);
    });
  }

  it("P-18: the fill's animationend completes no enter or exit", () => {
    mount();
    show('t', { id: 't' });
    const item = itemOf('t');
    for (const name of ['ret-progress', 'ret-enter-top']) animationEnd(fillOf(item), name);
    expect(phaseOf('t')).toBe('entering');
    flush();
    act(() => dismiss('t'));
    for (const name of ['ret-progress', 'ret-exit-top']) animationEnd(fillOf(item), name);
    expect(phaseOf('t')).toBe('exiting');
    flush();
    expect(phaseOf('t')).toBeUndefined();
  });

  it('recreation keeps focus, the controls and the live region as they are', () => {
    mount();
    const item = showVisible('t', {
      id: 't',
      action: { label: 'Undo', onClick: () => undefined },
    });
    const close = item.querySelector('.ret-toast__close') as HTMLButtonElement;
    const action = item.querySelector('.ret-toast__action') as HTMLButtonElement;
    const polite = document.querySelector('section > [aria-live="polite"]') as HTMLElement;
    const announced = polite.childNodes.length;
    act(() => close.focus());
    const held = fillOf(item);
    act(() => setGlobalPause('window-blur', true));
    act(() => setGlobalPause('window-blur', false));
    act(() => close.blur());
    act(() => action.focus());
    expect(fillOf(item)).not.toBe(held);
    expect(document.activeElement).toBe(action);
    expect(item.querySelector('.ret-toast__close')).toBe(close);
    expect(item.querySelector('.ret-toast__action')).toBe(action);
    expect(polite.childNodes.length).toBe(announced);
    expect(item.querySelectorAll('[tabindex], button')).toHaveLength(2);
  });

  it('P-19: recreation keeps the root and writes no style on it', () => {
    mount();
    const item = showVisible('t', { id: 't' });
    showVisible('u', { id: 'u' });
    const list = item.parentElement as HTMLElement;
    const order = [...list.children];
    act(() => {
      fireEvent.pointerEnter(list);
    });
    act(() => {
      fireEvent.pointerLeave(list);
    });
    expect(itemOf('t')).toBe(item);
    expect([...list.children]).toEqual(order);
    for (const root of list.children) expect(root.getAttribute('style')).toBeNull();
  });

  it('StrictMode: one fill, one announcement, and recreation only at boundaries', () => {
    render(
      <StrictMode>
        <Toaster progress />
      </StrictMode>
    );
    const item = showVisible('t', { id: 't' });
    expect(item.querySelectorAll('.ret-toast__progress-fill')).toHaveLength(1);
    const polite = document.querySelector('section > [aria-live="polite"]') as HTMLElement;
    expect(polite.childNodes).toHaveLength(1);
    const running = fillOf(item);
    advance(3000);
    expect(fillOf(item)).toBe(running);
    act(() => setGlobalPause('window-blur', true));
    expect(timingOf(item)).toEqual({ duration: '5000ms', delay: '-3000ms' });
    expect(item.querySelectorAll('.ret-toast__progress-fill')).toHaveLength(1);
    expect(inspectRecords()).toHaveLength(1);
    expect(polite.childNodes).toHaveLength(1);
  });
});
