// React lifecycles that hide content while keeping some of it (P-16 carry-over, P-23 S4, D0-12):
// `<Activity>` (React 19.2 and later) destroys a hidden subtree's Effects and keeps its DOM and
// state; Suspense hides content that suspends again and cleans up its layout Effects. The Toaster
// must treat both as lifecycle changes: no stale attachment or listener, no stale record of where
// focus was before the hotkey, and no removal restoration, which runs only when a toast starts to
// exit (§18). The record is internal: it is observed through where Escape sends focus.
//
// The Activity cases exist only where the installed React exports `Activity`. They are not
// skipped elsewhere: a guard checks that they exist exactly when the installed React has it.
import { act, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import {
  StrictMode,
  Suspense,
  useEffect,
  useLayoutEffect,
  version,
  type ComponentType,
  type ReactNode,
} from 'react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { Toaster, toast } from '../index';
import { restoreFocusFrom } from '../react/focus';
import { dismiss, inspectRecords, subscribe } from '../store/store';
import type { ToasterProps } from '../types';

vi.mock('../react/focus', async importOriginal => {
  const actual = await importOriginal<typeof import('../react/focus')>();
  return { ...actual, restoreFocusFrom: vi.fn(actual.restoreFocusFrom) };
});
/** Removal restoration (§18), called by a toast that has started to exit while holding focus. */
const restorations = vi.mocked(restoreFocusFrom);

vi.mock('../store/store', async importOriginal => {
  const actual = await importOriginal<typeof import('../store/store')>();
  return { ...actual, subscribe: vi.fn(actual.subscribe) };
});
/** Store subscriptions, which every Toaster holds through useSyncExternalStore while mounted. */
const subscriptions = vi.mocked(subscribe);

type ActivityMode = 'visible' | 'hidden';
// Read from the namespace, so the file also type-checks against the React 18 types.
const Activity = (
  React as unknown as {
    Activity?: ComponentType<{ mode: ActivityMode; children?: ReactNode }>;
  }
).Activity;

const ALT_T = { code: 'KeyT', key: '†', altKey: true };
const CTRL_Y = { code: 'KeyY', key: 'y', ctrlKey: true };
const ESCAPE = { key: 'Escape', code: 'Escape' };

// Text queries for a toast skip the hidden announcement copy in the live regions (§17.1).
const inToasts = { ignore: 'script, style, [aria-live] *' };
const itemOf = (text: string) => screen.getByText(text, inToasts).closest('li') as HTMLLIElement;
const closeOf = (text: string) =>
  itemOf(text).querySelector('button[aria-label="Close notification"]') as HTMLButtonElement;
const phaseOf = (id: string) => inspectRecords().find(record => record.id === id)?.phase;
const regions = () => document.querySelectorAll('section.ret-toaster');

const focusOn = (element: Element) => act(() => (element as HTMLElement).focus());

/** Runs whatever is due now: the lifecycle fallbacks scheduled by the last render. */
const flush = () =>
  act(() => {
    vi.advanceTimersByTime(0);
  });

/** Lets the deferred (microtask) Toaster detach run, inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
  });
}

/** Visible normal toasts, created in this order. */
function showVisible(...ids: string[]): void {
  act(() => {
    for (const id of ids) toast(id, { id });
  });
  flush();
}

/** Presses a key on the focused element; true when the event was not prevented. */
function press(init: KeyboardEventInit): boolean {
  let notPrevented = true;
  act(() => {
    notPrevented = fireEvent.keyDown(document.activeElement ?? document.body, init);
  });
  return notPrevented;
}

/** A button outside the Toaster, removed after the test. */
function externalButton(name: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = name;
  document.body.append(button);
  onTestFinished(() => button.remove());
  return button;
}

/** The live listeners of each event type on `document` and `window`, by identity. */
function trackGlobalListeners() {
  const live = new Map<string, Set<unknown>>();
  for (const target of [document, window] as EventTarget[]) {
    const name = target === document ? 'document' : 'window';
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
      const key = `${name}:${type}`;
      live.set(key, (live.get(key) ?? new Set()).add(listener));
      add(type, listener, options);
    });
    vi.spyOn(target, 'removeEventListener').mockImplementation((type, listener, options) => {
      live.get(`${name}:${type}`)?.delete(listener);
      remove(type, listener, options);
    });
  }
  return (key: string) => live.get(key)?.size ?? 0;
}

/** The store subscriptions currently held, counted around the real `subscribe`. */
async function trackSubscriptions() {
  const { subscribe: real } =
    await vi.importActual<typeof import('../store/store')>('../store/store');
  let held = 0;
  subscriptions.mockImplementation(listener => {
    const unsubscribe = real(listener);
    held++;
    let live = true;
    return () => {
      if (live) held--;
      live = false;
      unsubscribe();
    };
  });
  return () => held;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  restorations.mockClear();
  subscriptions.mockClear();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const [major = 0, minor = 0] = version.split('.').map(Number);

describe('the Activity guard', () => {
  it('defines the Activity cases exactly when the installed React exports Activity (19.2 and later)', () => {
    expect(Activity !== undefined).toBe(major > 19 || (major === 19 && minor >= 2));
  });
});

if (Activity) {
  const Hideable = Activity;

  function App({ mode, ...props }: ToasterProps & { mode: ActivityMode }) {
    return (
      <Hideable mode={mode}>
        <Toaster {...props} />
      </Hideable>
    );
  }

  describe('<Activity> (React 19.2 and later)', () => {
    it('a Toaster first rendered hidden attaches nothing, and its toasts stay pending until revealed', async () => {
      const { rerender } = render(<App mode="hidden" />);
      await settle();
      showVisible('a');
      expect(phaseOf('a')).toBe('queued');
      expect(document.querySelector('li.ret-toast')).toBeNull();

      rerender(<App mode="visible" />);
      await settle();
      flush();
      expect(phaseOf('a')).toBe('visible');
      expect(itemOf('a')).toBeVisible();
    });

    it('hiding the active Toaster detaches it (§8.4), and revealing attaches it again', async () => {
      const onDismiss = vi.fn();
      const { rerender } = render(<App mode="visible" />);
      await settle();
      showVisible('a', 'b');
      act(() => {
        toast('c', { id: 'c', onDismiss });
      });
      flush();
      act(() => dismiss('c'));
      expect(phaseOf('c')).toBe('exiting');

      rerender(<App mode="hidden" />);
      await settle();
      // Rendered toasts go back to the queue, and an exiting one finishes at once.
      expect(phaseOf('a')).toBe('queued');
      expect(phaseOf('b')).toBe('queued');
      expect(phaseOf('c')).toBeUndefined();
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }), 'programmatic');

      rerender(<App mode="visible" />);
      await settle();
      flush();
      expect(phaseOf('a')).toBe('visible');
      expect(phaseOf('b')).toBe('visible');
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('revealing leaves one subscription and one of each global listener, under StrictMode too', async () => {
      const held = await trackSubscriptions();
      const listeners = trackGlobalListeners();
      const tree = (mode: ActivityMode) => (
        <StrictMode>
          <App mode={mode} />
        </StrictMode>
      );
      const { rerender } = render(tree('visible'));
      await settle();
      const expectOne = () => {
        expect(held()).toBe(1);
        expect(listeners('document:keydown')).toBe(1);
        expect(listeners('document:visibilitychange')).toBe(1);
        expect(listeners('window:blur')).toBe(1);
        expect(listeners('window:focus')).toBe(1);
      };
      expectOne();

      rerender(tree('hidden'));
      await settle();
      expect(held()).toBe(0);
      expect(listeners('document:keydown')).toBe(0);
      expect(listeners('document:visibilitychange')).toBe(0);

      for (let cycle = 0; cycle < 2; cycle++) {
        rerender(tree('visible'));
        await settle();
        expectOne();
        rerender(tree('hidden'));
        await settle();
      }
      rerender(tree('visible'));
      await settle();
      expectOne();
      // StrictMode never counts as a second Toaster (§8.5).
      expect(warn).not.toHaveBeenCalled();
      expect(regions()).toHaveLength(1);
    });

    it('hiding clears the record of where focus was before the hotkey', async () => {
      const outside = externalButton('outside');
      const { rerender } = render(<App mode="visible" />);
      await settle();
      showVisible('a');
      focusOn(outside);
      expect(press(ALT_T)).toBe(false);
      expect(itemOf('a')).toHaveFocus();

      rerender(<App mode="hidden" />);
      await settle();
      rerender(<App mode="visible" />);
      await settle();
      flush();
      focusOn(itemOf('a'));
      expect(press(ESCAPE)).toBe(false);
      expect(document.activeElement).toBe(document.body);
    });

    it('a hidden owner hands over (§8.5), and its record is never used by the new owner', async () => {
      const outside = externalButton('outside');
      const tree = (mode: ActivityMode) => (
        <>
          <App mode={mode} />
          <Toaster key="waiting" />
        </>
      );
      const { rerender } = render(tree('visible'));
      await settle();
      showVisible('a');
      focusOn(outside);
      expect(press(ALT_T)).toBe(false);

      rerender(tree('hidden'));
      await settle();
      flush();
      // The waiting Toaster renders the toasts now; the hidden one keeps only its hidden DOM.
      const shown = [...document.querySelectorAll('li.ret-toast')].filter(
        item => item.closest('section')?.style.display !== 'none'
      );
      expect(shown).toHaveLength(1);
      focusOn(shown[0] as HTMLElement);
      expect(press(ESCAPE)).toBe(false);
      expect(document.activeElement).toBe(document.body);

      // Revealed, the former owner waits: it adds no second listener and shows nothing.
      const listeners = trackGlobalListeners();
      rerender(tree('visible'));
      await settle();
      expect(listeners('document:keydown')).toBe(0);
      expect(regions()).toHaveLength(1);
    });

    it('a hotkey changed while hidden applies once revealed, and the old one no longer acts', async () => {
      const outside = externalButton('outside');
      const { rerender } = render(<App mode="visible" />);
      await settle();
      showVisible('a');

      rerender(<App mode="hidden" hotkey={['ctrlKey', 'KeyY']} />);
      await settle();
      rerender(<App mode="visible" hotkey={['ctrlKey', 'KeyY']} />);
      await settle();
      flush();
      expect(document.querySelector('section')).toHaveAttribute('aria-keyshortcuts', 'Control+Y');
      focusOn(outside);
      expect(press(ALT_T)).toBe(true);
      expect(outside).toHaveFocus();
      expect(press(CTRL_Y)).toBe(false);
      expect(itemOf('a')).toHaveFocus();
    });

    it('hiding and revealing a toast that holds focus runs no removal restoration', async () => {
      const { rerender } = render(<App mode="visible" />);
      await settle();
      showVisible('a', 'b');
      focusOn(closeOf('b'));

      rerender(<App mode="hidden" />);
      await settle();
      rerender(<App mode="visible" />);
      await settle();
      flush();
      expect(restorations).not.toHaveBeenCalled();
      expect(phaseOf('a')).toBe('visible');
      expect(phaseOf('b')).toBe('visible');
    });

    it('after a reveal, removal restoration still moves focus before the toast is inert', async () => {
      const { rerender } = render(<App mode="visible" />);
      await settle();
      showVisible('a', 'b');
      rerender(<App mode="hidden" />);
      await settle();
      rerender(<App mode="visible" />);
      await settle();
      flush();

      const old = itemOf('b');
      const target = closeOf('a');
      const inertAtFocus: boolean[] = [];
      target.addEventListener('focusin', () => inertAtFocus.push(old.hasAttribute('inert')));
      focusOn(closeOf('b'));
      act(() => dismiss('b'));
      expect(restorations).toHaveBeenCalledTimes(1);
      expect(inertAtFocus).toEqual([false]);
      expect(old).toHaveAttribute('inert');
      expect(document.activeElement).toBe(target);
    });

    it('after a reveal, a new hotkey press records where focus was, and Escape returns there', async () => {
      const before = externalButton('before');
      const after = externalButton('after');
      const { rerender } = render(<App mode="visible" />);
      await settle();
      showVisible('a');
      focusOn(before);
      expect(press(ALT_T)).toBe(false);

      rerender(<App mode="hidden" />);
      await settle();
      rerender(<App mode="visible" />);
      await settle();
      flush();
      focusOn(after);
      expect(press(ALT_T)).toBe(false);
      expect(itemOf('a')).toHaveFocus();
      expect(press(ESCAPE)).toBe(false);
      expect(after).toHaveFocus();
    });
  });
}

// The record is cleared only by a lifecycle change (D0-12), never by an ordinary update (§18).
describe('the record across ordinary updates (§18)', () => {
  it('survives re-renders from new props and new toasts', async () => {
    const outside = externalButton('outside');
    const { rerender } = render(<Toaster />);
    await settle();
    showVisible('a');
    focusOn(outside);
    expect(press(ALT_T)).toBe(false);

    rerender(<Toaster className="changed" labels={{ region: 'Alerts' }} theme="dark" />);
    showVisible('b');
    rerender(<Toaster className="again" />);
    await settle();
    expect(press(ESCAPE)).toBe(false);
    expect(outside).toHaveFocus();
  });

  it('survives a change of the hotkey prop', async () => {
    const outside = externalButton('outside');
    const { rerender } = render(<Toaster />);
    await settle();
    showVisible('a');
    focusOn(outside);
    expect(press(ALT_T)).toBe(false);

    rerender(<Toaster hotkey={['ctrlKey', 'KeyY']} />);
    await settle();
    expect(itemOf('a')).toHaveFocus();
    expect(press(ESCAPE)).toBe(false);
    expect(outside).toHaveFocus();
  });

  it('survives StrictMode’s mount replay', async () => {
    const outside = externalButton('outside');
    render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    await settle();
    showVisible('a');
    focusOn(outside);
    expect(press(ALT_T)).toBe(false);
    expect(press(ESCAPE)).toBe(false);
    expect(outside).toHaveFocus();
  });
});

// Suspense, in React 18 and 19: content that is shown and then suspends again, outside a
// transition, is hidden and its layout Effects are cleaned up; they fire again when it is shown.
describe('Suspense re-suspension', () => {
  let pending: { promise: Promise<void>; resolve: () => void } | null = null;

  /** Suspends while `pending` is set. */
  function Gate() {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- a thrown promise suspends
    if (pending) throw pending.promise;
    return null;
  }

  /** Records its own layout and passive Effects, to show what React did with the boundary. */
  function Probe({ log }: { log: string[] }) {
    useLayoutEffect(() => {
      log.push('layout on');
      return () => void log.push('layout off');
    }, [log]);
    useEffect(() => {
      log.push('passive on');
      return () => void log.push('passive off');
    }, [log]);
    return null;
  }

  function Boundary({ log, step }: { log: string[]; step: number }) {
    return (
      <Suspense fallback={<p>loading</p>}>
        <Probe log={log} />
        <Toaster />
        <Gate key={step} />
      </Suspense>
    );
  }

  /** Suspends the shown boundary again, outside a transition. */
  function suspend(rerender: (ui: ReactNode) => void, log: string[]) {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>(done => {
      resolve = done;
    });
    pending = { promise, resolve };
    rerender(<Boundary log={log} step={1} />);
  }

  async function reveal(rerender: (ui: ReactNode) => void, log: string[]) {
    const current = pending;
    pending = null;
    await act(async () => {
      current?.resolve();
      await current?.promise;
    });
    rerender(<Boundary log={log} step={2} />);
    await settle();
    flush();
  }

  afterEach(() => {
    pending = null;
  });

  it('hides the Toaster and cleans up layout Effects only; revealing fires them again', async () => {
    const log: string[] = [];
    const { rerender } = render(<Boundary log={log} step={0} />);
    await settle();
    showVisible('a');
    log.length = 0;

    suspend(rerender, log);
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(document.querySelector('section')?.style.display).toBe('none');
    // Observed: passive Effects are kept, so the Toaster stays attached and its toast visible.
    expect(log).toEqual(['layout off']);
    await settle();
    expect(phaseOf('a')).toBe('visible');

    await reveal(rerender, log);
    expect(log).toEqual(['layout off', 'layout on']);
    expect(document.querySelector('section')?.style.display).toBe('');
    expect(itemOf('a')).toBeVisible();
  });

  it('hiding and revealing a toast that holds focus runs no removal restoration', async () => {
    const log: string[] = [];
    const { rerender } = render(<Boundary log={log} step={0} />);
    await settle();
    showVisible('a', 'b');
    focusOn(closeOf('b'));

    suspend(rerender, log);
    await settle();
    await reveal(rerender, log);
    expect(restorations).not.toHaveBeenCalled();
    expect(phaseOf('a')).toBe('visible');
    expect(phaseOf('b')).toBe('visible');
  });

  it('after a reveal, the hotkey and Escape work, and removal restoration precedes inert', async () => {
    const outside = externalButton('outside');
    const log: string[] = [];
    const { rerender } = render(<Boundary log={log} step={0} />);
    await settle();
    showVisible('a', 'b');
    suspend(rerender, log);
    await settle();
    await reveal(rerender, log);

    focusOn(outside);
    expect(press(ALT_T)).toBe(false);
    expect(itemOf('b')).toHaveFocus();
    expect(press(ESCAPE)).toBe(false);
    expect(outside).toHaveFocus();

    const old = itemOf('b');
    const target = closeOf('a');
    const inertAtFocus: boolean[] = [];
    target.addEventListener('focusin', () => inertAtFocus.push(old.hasAttribute('inert')));
    focusOn(closeOf('b'));
    act(() => dismiss('b'));
    expect(inertAtFocus).toEqual([false]);
    expect(old).toHaveAttribute('inert');
    expect(document.activeElement).toBe(target);
  });

  // D0-12 hypothesis: the hotkey's listener and its record live in a passive Effect, which
  // re-suspension keeps, so the record of where focus was before the hotkey may survive it.
  it('re-suspension clears the record of where focus was before the hotkey (D0-12)', async () => {
    const outside = externalButton('outside');
    const log: string[] = [];
    const { rerender } = render(<Boundary log={log} step={0} />);
    await settle();
    showVisible('a');
    focusOn(outside);
    expect(press(ALT_T)).toBe(false);
    expect(itemOf('a')).toHaveFocus();

    suspend(rerender, log);
    await settle();
    await reveal(rerender, log);
    focusOn(itemOf('a'));
    expect(press(ESCAPE)).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });
});
