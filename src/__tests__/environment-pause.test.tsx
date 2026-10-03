// Environmental pause wiring (§10, P-15): the active Toaster seeds and listens for window focus
// and document visibility, and each position's list listens for hover. The store-level combination
// of reasons is covered by pause.test.ts; these tests prove the DOM-to-store wiring and who owns
// the listeners.
import { act, fireEvent, render } from '@testing-library/react';
import { StrictMode, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Toaster, toast } from '../index';
import { attach, entered, getSnapshot, inspectRecords, setGlobalPause } from '../store/store';
import type { ToastOptions, ToastPosition } from '../types';

type EnvironmentEvent = 'blur' | 'focus' | 'visibilitychange' | 'keydown';

const recordOf = (id: string) => inspectRecords().find(record => record.id === id);
const timerOf = (id: string) => recordOf(id)?.timer;
const isRunning = (id: string) => timerOf(id)?.runningSince != null;

/** Lets the deferred (microtask) Toaster detach run, inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
  });
}

/** Runs whatever is due now: the lifecycle fallbacks scheduled by the last render. */
const flush = () =>
  act(() => {
    vi.advanceTimersByTime(0);
  });

/** Creates a toast and lets its enter complete under the mounted Toaster. */
function showVisible(id: string): void {
  act(() => {
    toast(id, { id });
  });
  flush();
  expect(recordOf(id)?.phase).toBe('visible');
}

const setHidden = (hidden: boolean) => vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);
const blurWindow = () => fireEvent.blur(window);
const focusWindow = () => fireEvent.focus(window);
function changeVisibility(hidden: boolean): void {
  setHidden(hidden);
  fireEvent(document, new Event('visibilitychange'));
}

/**
 * Records the environmental listeners added to and removed from `window` and `document`, by
 * identity. Other listener types (React's own, for example) are ignored.
 */
function trackListeners() {
  const live: Record<EnvironmentEvent, Set<unknown>> = {
    blur: new Set(),
    focus: new Set(),
    visibilitychange: new Set(),
    keydown: new Set(),
  };
  let added = 0;
  const watch = (target: EventTarget, types: readonly EnvironmentEvent[]) => {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    const watched = (type: string): type is EnvironmentEvent =>
      (types as readonly string[]).includes(type);
    vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
      if (watched(type)) {
        live[type].add(listener);
        added++;
      }
      add(type, listener, options);
    });
    vi.spyOn(target, 'removeEventListener').mockImplementation((type, listener, options) => {
      if (watched(type)) live[type].delete(listener);
      remove(type, listener, options);
    });
  };
  watch(window, ['blur', 'focus']);
  watch(document, ['visibilitychange', 'keydown']);
  return {
    /** How many listeners of each type are attached now. */
    counts: () => ({
      blur: live.blur.size,
      focus: live.focus.size,
      visibilitychange: live.visibilitychange.size,
      keydown: live.keydown.size,
    }),
    /** Every listener attached now. */
    all: () => [...live.blur, ...live.focus, ...live.visibilitychange, ...live.keydown],
    /** How many environmental listeners were ever added. */
    added: () => added,
  };
}

type ElementEvent = 'pointerenter' | 'pointerleave' | 'focusin' | 'focusout';

/**
 * Records the listeners added to and removed from single elements, by identity, from calls through
 * the real methods.
 */
function trackElementListeners() {
  const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
  const remove = vi.spyOn(EventTarget.prototype, 'removeEventListener');
  const callsOn = (spy: typeof add, sign: 1 | -1, target: EventTarget, type: ElementEvent) =>
    spy.mock.calls.flatMap(([calledType, listener], index) =>
      spy.mock.contexts[index] === target && calledType === type
        ? [{ listener, sign, order: spy.mock.invocationCallOrder[index] ?? 0 }]
        : []
    );
  return {
    /** How many listeners of this type are attached to the element now. */
    live(target: EventTarget, type: ElementEvent): number {
      const live = new Set<unknown>();
      const calls = [...callsOn(add, 1, target, type), ...callsOn(remove, -1, target, type)];
      for (const { listener, sign } of calls.sort((a, b) => a.order - b.order)) {
        if (sign === 1) live.add(listener);
        else live.delete(listener);
      }
      return live.size;
    },
    /** How many listeners of this type were ever added to the element. */
    added: (target: EventTarget, type: ElementEvent) => callsOn(add, 1, target, type).length,
  };
}

// The active Toaster's fixed global listeners: these three (P-15) and the hotkey's keydown (P-16).
const NONE = { blur: 0, focus: 0, visibilitychange: 0, keydown: 0 };
const ONE_EACH = { blur: 1, focus: 1, visibilitychange: 1, keydown: 1 };

let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.useFakeTimers();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = vi.spyOn(console, 'error');
});

afterEach(() => {
  // React warnings, act() warnings included, go to console.error.
  expect(error).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('listener ownership (§10, §32)', () => {
  it('the active Toaster attaches exactly one blur, focus, visibilitychange and keydown listener', () => {
    const listeners = trackListeners();
    render(<Toaster />);
    expect(listeners.counts()).toEqual(ONE_EACH);
  });

  it('StrictMode replay leaves no duplicate listeners', async () => {
    const listeners = trackListeners();
    render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    await settle();
    expect(listeners.counts()).toEqual(ONE_EACH);
    expect(listeners.added()).toBe(4);
    expect(warn).not.toHaveBeenCalled();
  });

  it('prop rerenders of the active Toaster never re-register the listeners', async () => {
    const listeners = trackListeners();
    const { rerender } = render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    await settle();
    const attached = listeners.all();
    rerender(
      <StrictMode>
        <Toaster
          position="bottom-left"
          duration={1000}
          maxVisible={2}
          theme="dark"
          hotkey={['ctrlKey', 'KeyY']}
        />
      </StrictMode>
    );
    await settle();
    expect(listeners.added()).toBe(4);
    expect(listeners.all()).toEqual(attached);
  });

  it('a waiting Toaster attaches no listeners and seeds nothing', async () => {
    const listeners = trackListeners();
    const { rerender } = render(
      <StrictMode>
        <Toaster key="first" />
      </StrictMode>
    );
    await settle();
    showVisible('t');
    // The environment says focused and visible; a seed from the waiting Toaster would clear this.
    setGlobalPause('window-blur', true);
    expect(isRunning('t')).toBe(false);

    rerender(
      <StrictMode>
        <Toaster key="first" />
        <Toaster key="second" />
      </StrictMode>
    );
    await settle();
    expect(listeners.counts()).toEqual(ONE_EACH);
    expect(listeners.added()).toBe(4);
    expect(isRunning('t')).toBe(false);
  });

  it("handover removes the former owner's listeners, and the new owner seeds and listens", async () => {
    const listeners = trackListeners();
    const { rerender } = render(
      <StrictMode>
        <Toaster key="first" />
        <Toaster key="second" />
      </StrictMode>
    );
    await settle();
    const first = getSnapshot().active;
    const firstListeners = listeners.all();
    // The former owner leaves window-blur on; the new owner must overwrite it.
    blurWindow();

    rerender(
      <StrictMode>
        <Toaster key="second" />
      </StrictMode>
    );
    await settle();
    expect(getSnapshot().active).not.toBe(first);
    expect(listeners.counts()).toEqual(ONE_EACH);
    expect(listeners.all().some(listener => firstListeners.includes(listener))).toBe(false);

    // The new owner seeded window-blur off from the focused document, and now listens.
    showVisible('t');
    expect(isRunning('t')).toBe(true);
    blurWindow();
    expect(isRunning('t')).toBe(false);
    focusWindow();
    expect(isRunning('t')).toBe(true);
  });

  it('the final detach removes the listeners and keeps both global reasons', async () => {
    const listeners = trackListeners();
    act(() => {
      toast('t', { id: 't' });
    });
    const { unmount } = render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    await settle();
    blurWindow();
    changeVisibility(true);
    unmount();
    await settle();
    expect(getSnapshot().active).toBeNull();
    expect(listeners.counts()).toEqual(NONE);

    // Events after detach reach nobody.
    focusWindow();
    changeVisibility(false);

    // Both reasons survived: a Toaster that does not seed (the store's own attach) stays paused.
    attach({});
    entered('t');
    expect(recordOf('t')?.phase).toBe('visible');
    expect(isRunning('t')).toBe(false);
    setGlobalPause('window-blur', false);
    expect(isRunning('t')).toBe(false);
    setGlobalPause('document-hidden', false);
    expect(isRunning('t')).toBe(true);
  });
});

describe('seeding when a Toaster becomes active (§10)', () => {
  it('an unfocused document seeds window-blur on', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    render(<Toaster />);
    showVisible('t');
    expect(isRunning('t')).toBe(false);
    focusWindow();
    expect(isRunning('t')).toBe(true);
  });

  it('a hidden document seeds document-hidden on', () => {
    setHidden(true);
    render(<Toaster />);
    showVisible('t');
    expect(isRunning('t')).toBe(false);
    changeVisibility(false);
    expect(isRunning('t')).toBe(true);
  });

  it('a focused, visible document clears stale global reasons', () => {
    setGlobalPause('window-blur', true);
    setGlobalPause('document-hidden', true);
    render(<Toaster />);
    showVisible('t');
    expect(isRunning('t')).toBe(true);
  });

  it('StrictMode replay does not lose a seeded reason', async () => {
    setHidden(true);
    render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    await settle();
    showVisible('t');
    expect(timerOf('t')).toEqual({ duration: 5000, remaining: 5000, runningSince: null });
  });
});

describe('window focus and document visibility (§10)', () => {
  it('window blur pauses a running toast, and focus resumes it with the time it had left', () => {
    render(<Toaster />);
    showVisible('t');
    vi.advanceTimersByTime(1000);
    blurWindow();
    vi.advanceTimersByTime(3000);
    expect(timerOf('t')).toEqual({ duration: 5000, remaining: 4000, runningSince: null });
    focusWindow();
    vi.advanceTimersByTime(3999);
    expect(recordOf('t')?.phase).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(recordOf('t')?.phase).toBe('exiting');
  });

  it('a hidden document pauses a running toast, and visibility resumes it with the time it had left', () => {
    render(<Toaster />);
    showVisible('t');
    vi.advanceTimersByTime(1000);
    changeVisibility(true);
    vi.advanceTimersByTime(3000);
    expect(timerOf('t')).toEqual({ duration: 5000, remaining: 4000, runningSince: null });
    changeVisibility(false);
    vi.advanceTimersByTime(3999);
    expect(recordOf('t')?.phase).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(recordOf('t')?.phase).toBe('exiting');
  });

  it('D-07: window focus does not resume a toast while the document is still hidden', () => {
    render(<Toaster />);
    showVisible('t');
    changeVisibility(true);
    blurWindow();
    focusWindow();
    expect(isRunning('t')).toBe(false);
    changeVisibility(false);
    expect(isRunning('t')).toBe(true);
  });
});

describe('stack hover (§10)', () => {
  const listOf = (position: ToastPosition) =>
    document.querySelector<HTMLOListElement>(`ol[data-position="${position}"]`);
  const enter = (position: ToastPosition) => fireEvent.pointerEnter(listOf(position) as Element);
  const leave = (position: ToastPosition) => fireEvent.pointerLeave(listOf(position) as Element);

  /** Creates toasts and lets their enters complete under the mounted Toaster. */
  function showAll(toasts: readonly (readonly [string, ToastPosition])[]): void {
    act(() => {
      for (const [id, position] of toasts) toast(id, { id, position });
    });
    flush();
    for (const [id] of toasts) expect(recordOf(id)?.phase).toBe('visible');
  }

  /** Removes a rendered toast: dismissal, then its exit fallback. */
  function remove(id: string): void {
    act(() => {
      toast.dismiss(id);
    });
    flush();
    expect(recordOf(id)).toBeUndefined();
  }

  it('pauses every toast at the hovered position and none elsewhere, and resumes on leave', () => {
    render(<Toaster />);
    showAll([
      ['a', 'top-right'],
      ['b', 'top-right'],
      ['x', 'bottom-left'],
    ]);
    vi.advanceTimersByTime(1000);
    enter('top-right');
    expect(isRunning('a')).toBe(false);
    expect(isRunning('b')).toBe(false);
    expect(isRunning('x')).toBe(true);

    vi.advanceTimersByTime(3000);
    expect(timerOf('a')).toEqual({ duration: 5000, remaining: 4000, runningSince: null });
    expect(recordOf('x')?.phase).toBe('visible');
    vi.advanceTimersByTime(1000);
    expect(recordOf('x')?.phase).toBe('exiting');

    leave('top-right');
    expect(isRunning('a')).toBe(true);
    vi.advanceTimersByTime(3999);
    expect(recordOf('a')?.phase).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(recordOf('a')?.phase).toBe('exiting');
    expect(recordOf('b')?.phase).toBe('exiting');
  });

  it('D-09: regaining window focus does not resume a hovered stack', () => {
    render(<Toaster />);
    showAll([['t', 'top-right']]);
    enter('top-right');
    blurWindow();
    focusWindow();
    expect(isRunning('t')).toBe(false);
    leave('top-right');
    expect(isRunning('t')).toBe(true);
  });

  it('clears hover when the last toast leaves under the pointer, so the next one runs', () => {
    render(<Toaster />);
    showAll([['t', 'top-right']]);
    enter('top-right');
    remove('t');
    expect(listOf('top-right')).toBeNull();

    showAll([['next', 'top-right']]);
    expect(isRunning('next')).toBe(true);
  });

  it('keeps one pair of listeners on a list across rerenders', () => {
    const listeners = trackElementListeners();
    const { rerender } = render(<Toaster />);
    showAll([['a', 'top-right']]);
    const list = listOf('top-right') as HTMLOListElement;
    rerender(<Toaster closeButton={false} theme="dark" />);
    showAll([['b', 'top-right']]);
    remove('a');

    expect(listOf('top-right')).toBe(list);
    expect(listeners.added(list, 'pointerenter')).toBe(1);
    expect(listeners.added(list, 'pointerleave')).toBe(1);
    expect(listeners.live(list, 'pointerenter')).toBe(1);
    expect(listeners.live(list, 'pointerleave')).toBe(1);
    enter('top-right');
    expect(isRunning('b')).toBe(false);
  });

  it('under StrictMode, leaves one pair of listeners and no stale hover', async () => {
    const listeners = trackElementListeners();
    render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    await settle();
    showAll([['t', 'top-right']]);
    const list = listOf('top-right') as HTMLOListElement;
    expect(listeners.live(list, 'pointerenter')).toBe(1);
    expect(listeners.live(list, 'pointerleave')).toBe(1);

    enter('top-right');
    expect(isRunning('t')).toBe(false);
    leave('top-right');
    expect(isRunning('t')).toBe(true);

    enter('top-right');
    remove('t');
    expect(listeners.live(list, 'pointerenter')).toBe(0);
    expect(listeners.live(list, 'pointerleave')).toBe(0);
    showAll([['next', 'top-right']]);
    expect(isRunning('next')).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves no hover behind when the Toaster unmounts', async () => {
    const listeners = trackElementListeners();
    const { unmount } = render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    await settle();
    showAll([['t', 'top-right']]);
    const list = listOf('top-right') as HTMLOListElement;
    enter('top-right');
    unmount();
    await settle();
    expect(getSnapshot().active).toBeNull();
    expect(listeners.live(list, 'pointerenter')).toBe(0);
    expect(listeners.live(list, 'pointerleave')).toBe(0);

    attach({});
    entered('t');
    expect(isRunning('t')).toBe(true);
  });

  it('leaves no hover behind on handover, and the new owner listens', async () => {
    const { rerender } = render(
      <StrictMode>
        <Toaster key="first" />
        <Toaster key="second" />
      </StrictMode>
    );
    await settle();
    showAll([['t', 'top-right']]);
    enter('top-right');
    expect(isRunning('t')).toBe(false);

    rerender(
      <StrictMode>
        <Toaster key="second" />
      </StrictMode>
    );
    await settle();
    flush();
    expect(recordOf('t')?.phase).toBe('visible');
    expect(isRunning('t')).toBe(true);
    enter('top-right');
    expect(isRunning('t')).toBe(false);
  });
});

describe('focus within a toast (§10, §17.4)', () => {
  const itemByText = (text: string) =>
    [...document.querySelectorAll('li')].find(item => item.textContent?.includes(text)) ?? null;
  const control = (name: string) =>
    document.querySelector<HTMLButtonElement | HTMLInputElement>(`[data-control="${name}"]`);
  const closeOf = (id: string) =>
    itemByText(id)?.querySelector<HTMLButtonElement>('.ret-toast__close') ?? null;

  /** Moves focus to an element, as a user or script would. */
  const focusOn = (element: HTMLElement | null) =>
    act(() => {
      (element as HTMLElement).focus();
    });
  /** Moves focus out of every toast, to the document. */
  const focusOutside = () =>
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
  /** Lets a MutationObserver callback (a microtask) run. */
  const observe = () => act(async () => {});

  function showVisible(content: ReactNode, id: string, options: Partial<ToastOptions> = {}): void {
    act(() => {
      toast(content, { id, ...options });
    });
    flush();
    expect(recordOf(id)?.phase).toBe('visible');
  }
  function showCustom(content: ReactNode, id: string): void {
    act(() => {
      toast.custom(content, { id });
    });
    flush();
    expect(recordOf(id)?.phase).toBe('visible');
  }

  /** Tracks the MutationObservers that are observing now. */
  function trackObservers() {
    const observing = new Set<MutationObserver>();
    class TrackedObserver extends MutationObserver {
      override observe(target: Node, options?: MutationObserverInit): void {
        observing.add(this);
        super.observe(target, options);
      }
      override disconnect(): void {
        observing.delete(this);
        super.disconnect();
      }
    }
    vi.stubGlobal('MutationObserver', TrackedObserver);
    return { observing: () => observing.size };
  }

  /** A custom toast's content that removes its own focused button on click, keeping the revision. */
  function SelfRemoving({ replaceWithFocus }: { readonly replaceWithFocus: boolean }) {
    const [done, setDone] = useState(false);
    if (!done) {
      return (
        <button type="button" data-control="remove-me" onClick={() => setDone(true)}>
          remove me
        </button>
      );
    }
    // eslint-disable-next-line jsx-a11y/no-autofocus -- the replacement takes focus in the same commit
    return replaceWithFocus ? <input data-control="replacement" autoFocus /> : <span>gone</span>;
  }

  it('pauses only the focused toast, and resumes it with the time it had left', () => {
    render(<Toaster />);
    showVisible('a', 'a');
    showVisible('b', 'b');
    vi.advanceTimersByTime(1000);
    focusOn(closeOf('a'));
    expect(isRunning('a')).toBe(false);
    expect(isRunning('b')).toBe(true);

    vi.advanceTimersByTime(3000);
    expect(timerOf('a')).toEqual({ duration: 5000, remaining: 4000, runningSince: null });
    vi.advanceTimersByTime(1000);
    expect(recordOf('b')?.phase).toBe('exiting');

    focusOutside();
    expect(isRunning('a')).toBe(true);
    vi.advanceTimersByTime(3999);
    expect(recordOf('a')?.phase).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(recordOf('a')?.phase).toBe('exiting');
  });

  it('never lets the timer run while focus moves between controls of the same toast', () => {
    render(<Toaster />);
    showVisible('t', 't', { action: { label: 'Undo', onClick: () => undefined } });
    const item = itemByText('t') as HTMLLIElement;
    const action = item.querySelector<HTMLButtonElement>('.ret-toast__action');
    focusOn(action);
    expect(isRunning('t')).toBe(false);

    // A clear between the focusout and the focusin would start the timer for an instant.
    const schedule = vi.spyOn(globalThis, 'setTimeout');
    focusOn(closeOf('t'));
    focusOn(action);
    expect(schedule).not.toHaveBeenCalled();
    expect(isRunning('t')).toBe(false);
  });

  it('moves the pause from one toast to the other when focus does', () => {
    render(<Toaster />);
    showVisible('a', 'a');
    showVisible('b', 'b');
    focusOn(closeOf('a'));
    focusOn(closeOf('b'));
    expect(isRunning('a')).toBe(true);
    expect(isRunning('b')).toBe(false);
  });

  it('resumes when a replacement re-keys the focused content', async () => {
    render(<Toaster />);
    showVisible(
      <button type="button" data-control="inner">
        first
      </button>,
      't'
    );
    focusOn(control('inner'));
    expect(isRunning('t')).toBe(false);

    act(() => {
      toast(
        <button type="button" data-control="inner">
          second
        </button>,
        { id: 't' }
      );
    });
    await observe();
    expect(document.activeElement).toBe(document.body);
    expect(isRunning('t')).toBe(true);
  });

  it('resumes when a custom ↔ normal replacement removes the focused control', async () => {
    render(<Toaster />);
    showCustom(
      <button type="button" data-control="custom">
        custom
      </button>,
      't'
    );
    focusOn(control('custom'));
    act(() => {
      toast('normal', { id: 't', action: { label: 'Undo', onClick: () => undefined } });
    });
    await observe();
    expect(isRunning('t')).toBe(true);

    focusOn(itemByText('normal')?.querySelector('.ret-toast__action') as HTMLElement);
    expect(isRunning('t')).toBe(false);
    act(() => {
      toast.custom(<span>custom again</span>, { id: 't' });
    });
    await observe();
    expect(isRunning('t')).toBe(true);
  });

  it('does not carry focus-within to a relocated toast, even one that waits in a queue', () => {
    render(<Toaster maxVisible={1} />);
    showVisible('blocker', 'blocker', { position: 'bottom-left' });
    showVisible('t', 't');
    focusOn(closeOf('t'));
    act(() => {
      toast('t', { id: 't', position: 'bottom-left' });
    });
    expect(recordOf('t')?.exit?.reason).toBe('relocate');
    flush(); // the relocation's exit: bottom-left is full, so the toast waits in its queue
    expect(recordOf('t')).toMatchObject({ phase: 'queued', position: 'bottom-left' });
    expect(recordOf('t')?.pausedBy).toEqual([]);

    act(() => {
      toast.dismiss('blocker');
    });
    flush(); // the blocker's exit frees the slot
    flush(); // the relocated toast's enter
    expect(recordOf('t')).toMatchObject({ phase: 'visible', position: 'bottom-left' });
    expect(isRunning('t')).toBe(true);
  });

  it('resumes when custom content removes its focused control without a new revision', async () => {
    const observers = trackObservers();
    render(<Toaster />);
    showCustom(<SelfRemoving replaceWithFocus={false} />, 't');
    focusOn(control('remove-me'));
    expect(isRunning('t')).toBe(false);
    expect(observers.observing()).toBe(1);

    act(() => {
      control('remove-me')?.click();
    });
    expect(recordOf('t')?.revision).toBe(0);
    await observe();
    expect(isRunning('t')).toBe(true);
    expect(observers.observing()).toBe(0);
  });

  it('stays paused when custom content moves focus to a replacement in the same commit', async () => {
    render(<Toaster />);
    showCustom(<SelfRemoving replaceWithFocus />, 't');
    focusOn(control('remove-me'));
    act(() => {
      control('remove-me')?.click();
    });
    await observe();
    expect(document.activeElement).toBe(control('replacement'));
    expect(recordOf('t')?.revision).toBe(0);
    expect(isRunning('t')).toBe(false);
  });

  it('keeps focus-within through a re-key when the Toaster is mounted in a shadow root', async () => {
    // Inside a shadow root, document.activeElement is the shadow host, outside every toast; the
    // focused control is the shadow root's activeElement.
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    shadow.append(container);
    const root = createRoot(container);
    try {
      act(() => root.render(<Toaster />));
      showVisible('first', 't');
      const close = shadow.querySelector('.ret-toast__close') as HTMLButtonElement;
      focusOn(close);
      expect(document.activeElement).toBe(host);
      expect(recordOf('t')?.pausedBy).toEqual(['focus-within']);

      // A replacement re-keys the content: the observer reconciles while focus stays on the close
      // button, which is not re-keyed. The replacement also resets the timer (§10).
      act(() => {
        toast('second', { id: 't' });
      });
      await observe();
      expect(shadow.activeElement).toBe(close);
      expect(recordOf('t')?.pausedBy).toEqual(['focus-within']);
      vi.advanceTimersByTime(10_000);
      expect(recordOf('t')?.phase).toBe('visible');
      expect(timerOf('t')).toEqual({ duration: 5000, remaining: 5000, runningSince: null });

      act(() => close.blur());
      expect(recordOf('t')?.pausedBy).toEqual([]);
      vi.advanceTimersByTime(4999);
      expect(recordOf('t')?.phase).toBe('visible');
      vi.advanceTimersByTime(1);
      expect(recordOf('t')?.phase).toBe('exiting');
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  it('ignores focus in a portal rendered outside the toast, and hover over one', () => {
    render(<Toaster />);
    showCustom(
      createPortal(
        <button type="button" data-control="portal">
          portal
        </button>,
        document.body
      ),
      't'
    );
    const portal = control('portal') as HTMLButtonElement;
    // The toast's only element is its <li>: the portal's button is rendered elsewhere.
    expect(document.querySelectorAll('li')).toHaveLength(1);
    expect(document.querySelector('li')?.contains(portal)).toBe(false);
    focusOn(portal);
    expect(isRunning('t')).toBe(true);
    fireEvent.pointerEnter(portal);
    expect(isRunning('t')).toBe(true);
  });

  it('under StrictMode, keeps one focus listener pair per toast and one observer while focused', async () => {
    const listeners = trackElementListeners();
    const observers = trackObservers();
    render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    await settle();
    showVisible('t', 't');
    const item = itemByText('t') as HTMLLIElement;
    expect(listeners.live(item, 'focusin')).toBe(1);
    expect(listeners.live(item, 'focusout')).toBe(1);
    expect(observers.observing()).toBe(0);

    focusOn(closeOf('t'));
    expect(isRunning('t')).toBe(false);
    expect(observers.observing()).toBe(1);
    focusOutside();
    expect(isRunning('t')).toBe(true);
    expect(observers.observing()).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('removes its listeners and observer when a focused toast is removed', () => {
    const listeners = trackElementListeners();
    const observers = trackObservers();
    render(<Toaster />);
    showVisible('t', 't');
    const item = itemByText('t') as HTMLLIElement;
    focusOn(closeOf('t'));
    act(() => {
      toast.dismiss('t');
    });
    flush();
    expect(recordOf('t')).toBeUndefined();
    expect(listeners.live(item, 'focusin')).toBe(0);
    expect(listeners.live(item, 'focusout')).toBe(0);
    expect(observers.observing()).toBe(0);
  });

  it('leaves no focus-within or observer behind when the Toaster unmounts', async () => {
    const observers = trackObservers();
    const { unmount } = render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    await settle();
    showVisible('t', 't');
    focusOn(closeOf('t'));
    expect(observers.observing()).toBe(1);
    unmount();
    await settle();
    expect(getSnapshot().active).toBeNull();
    expect(observers.observing()).toBe(0);
    expect(recordOf('t')?.pausedBy).toEqual([]);

    attach({});
    entered('t');
    expect(isRunning('t')).toBe(true);
  });
});
