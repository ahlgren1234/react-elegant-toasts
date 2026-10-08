// Focus restoration when a focused toast is removed (§17.4, §18, P-16): when a toast that holds
// focus starts to exit, focus moves before the toast becomes inert. From a library close or action
// to the same control of the next toast, from the toast to the next toast; otherwise to the
// previous toast, otherwise to the region. Next and previous are the adjacent toasts that are not
// exiting, in DOM order. jsdom keeps focus inside an inert subtree and enforces nothing; real
// browsers are P-22 checks. A focus "fails" here because a spy refuses it, as a browser may.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
  type MockInstance,
} from 'vitest';
import { Toaster, toast } from '../index';
import { dismiss, inspectRecords } from '../store/store';
import type { CustomToastOptions, ToasterProps, ToastOptions } from '../types';

const ALT_T = { code: 'KeyT', key: '†', altKey: true };
const ESCAPE = { key: 'Escape', code: 'Escape' };

// Text queries for a toast skip the hidden announcement copy in the live regions (§17.1).
const inToasts = { ignore: 'script, style, [aria-live] *' };
const itemOf = (text: string) => screen.getByText(text, inToasts).closest('li') as HTMLLIElement;
const recordOf = (id: string) => inspectRecords().find(record => record.id === id);
const regionOf = () => screen.getByRole('region');
const closeOf = (id: string) =>
  within(itemOf(id)).getByRole('button', { name: 'Close notification', hidden: true });
const actionOf = (id: string) =>
  within(itemOf(id)).getByRole('button', { name: `Undo ${id}`, hidden: true });
/** The toasts' text, in DOM order. */
const domOrder = () =>
  [...document.querySelectorAll('section > ol > li')].map(
    item => item.querySelector('.ret-toast__title')?.textContent ?? item.textContent
  );

const focusOn = (element: Element) => act(() => (element as HTMLElement).focus());

/** Runs whatever is due now: the lifecycle fallbacks scheduled by the last render. */
const flush = () =>
  act(() => {
    vi.advanceTimersByTime(0);
  });

/** Normal visible toasts, created in this order, each with an action named "Undo <id>". */
function showVisible(ids: readonly string[], options: ToastOptions = {}): void {
  act(() => {
    for (const id of ids) {
      toast(id, { id, action: { label: `Undo ${id}`, onClick: () => undefined }, ...options });
    }
  });
  flush();
}

function showCustom(id: string, content: ReactNode, options: CustomToastOptions = {}): void {
  act(() => {
    toast.custom(content, { id, duration: Infinity, ...options });
  });
  flush();
}

/** Every call to `focus()` on an HTML element, with its element. */
function trackFocusCalls() {
  const spy = vi.spyOn(HTMLElement.prototype, 'focus');
  return () => spy.mock.contexts as HTMLElement[];
}

/** Makes `focus()` on these elements do nothing, as a browser may refuse it. */
function refuseFocus(...refused: Element[]) {
  const focus = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'focus')?.value as (
    this: HTMLElement,
    options?: FocusOptions
  ) => void;
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
    this: HTMLElement,
    options?: FocusOptions
  ) {
    if (!refused.includes(this)) focus.call(this, options);
  });
}

/** A button outside the Toaster, removed after the test. */
function externalButton(name: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = name;
  document.body.append(button);
  onTestFinished(() => button.remove());
  return button;
}

function press(init: KeyboardEventInit): boolean {
  let notPrevented = true;
  act(() => {
    notPrevented = fireEvent.keyDown(document.activeElement ?? document.body, init);
  });
  return notPrevented;
}

/** Lets the deferred (microtask) Toaster detach run, inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
  });
}

function mount(props: ToasterProps = {}) {
  return render(<Toaster {...props} />);
}

/** A field that focuses itself as it mounts, before its toast's own layout effect runs. */
function SelfFocusing() {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => ref.current?.focus(), []);
  return <input ref={ref} aria-label="field" />;
}

let error: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = vi.spyOn(console, 'error');
});

afterEach(() => {
  expect(error).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('the next toast (§18)', () => {
  it('takes focus from a close button on its own close button, next in DOM order, not store order', () => {
    mount();
    showVisible(['a', 'b', 'c']);
    // Top positions put the newest first (§12): the store's c follows b, the DOM's a does.
    expect(domOrder()).toEqual(['c', 'b', 'a']);
    focusOn(closeOf('b'));
    act(() => dismiss('b'));
    expect(document.activeElement).toBe(closeOf('a'));
  });

  it('takes focus from an action on its own action', () => {
    mount();
    showVisible(['a', 'b', 'c']);
    focusOn(actionOf('c'));
    act(() => dismiss('c'));
    expect(document.activeElement).toBe(actionOf('b'));
  });

  it('takes focus from a toast on the toast itself', () => {
    mount();
    showVisible(['a', 'b', 'c']);
    focusOn(itemOf('c'));
    act(() => dismiss('c'));
    expect(document.activeElement).toBe(itemOf('b'));
  });

  it('restores when the focused close button is clicked', () => {
    mount();
    showVisible(['a', 'b']);
    focusOn(closeOf('b'));
    act(() => {
      fireEvent.click(closeOf('b'));
    });
    expect(recordOf('b')).toMatchObject({ phase: 'exiting', exit: { reason: 'close-button' } });
    expect(document.activeElement).toBe(closeOf('a'));
  });

  it('follows DOM order across positions, bottom positions keeping store order', () => {
    mount();
    showVisible(['b1', 'b2'], { position: 'bottom-left' });
    showVisible(['t1'], { position: 'top-right' });
    expect(domOrder()).toEqual(['t1', 'b1', 'b2']);
    focusOn(closeOf('t1'));
    act(() => dismiss('t1'));
    expect(document.activeElement).toBe(closeOf('b1'));
  });

  it('skips a toast that is already exiting', () => {
    mount();
    showVisible(['a', 'b', 'c']);
    act(() => dismiss('b'));
    focusOn(closeOf('c'));
    act(() => dismiss('c'));
    expect(document.activeElement).toBe(closeOf('a'));
  });
});

describe('the previous toast (§18)', () => {
  it('takes focus when the next toast has no close button: not the next toast, nor a later close', () => {
    mount();
    act(() => {
      toast('a', { id: 'a' });
      toast('b', { id: 'b', closeButton: false });
      toast('c', { id: 'c' });
      toast('d', { id: 'd' });
    });
    flush();
    expect(domOrder()).toEqual(['d', 'c', 'b', 'a']);
    focusOn(closeOf('c'));
    act(() => dismiss('c'));
    expect(document.activeElement).toBe(itemOf('d'));
  });

  it('takes focus when the next toast has no action: not the next toast, nor a later action', () => {
    mount();
    showVisible(['a']);
    act(() => {
      toast('b', { id: 'b' });
    });
    showVisible(['c', 'd']);
    expect(domOrder()).toEqual(['d', 'c', 'b', 'a']);
    focusOn(actionOf('c'));
    act(() => dismiss('c'));
    expect(document.activeElement).toBe(itemOf('d'));
  });

  it('takes focus when the next control refuses it', () => {
    mount();
    showVisible(['a', 'b', 'c']);
    refuseFocus(closeOf('a'));
    focusOn(closeOf('b'));
    act(() => dismiss('b'));
    expect(document.activeElement).toBe(itemOf('c'));
  });

  it('takes focus when the next toast refuses it', () => {
    mount();
    showVisible(['a', 'b', 'c']);
    refuseFocus(itemOf('a'));
    focusOn(itemOf('b'));
    act(() => dismiss('b'));
    expect(document.activeElement).toBe(itemOf('c'));
  });

  it('takes focus when there is no next toast, across positions too', () => {
    mount();
    showVisible(['top'], { position: 'top-left' });
    showVisible(['bottom'], { position: 'bottom-right' });
    focusOn(closeOf('bottom'));
    act(() => dismiss('bottom'));
    expect(document.activeElement).toBe(itemOf('top'));
  });

  it('skips a toast that is already exiting', () => {
    mount();
    showVisible(['a', 'b', 'c']);
    act(() => dismiss('b'));
    focusOn(closeOf('a'));
    act(() => dismiss('a'));
    expect(document.activeElement).toBe(itemOf('c'));
  });
});

describe('the region (§18)', () => {
  it('takes focus when no other toast is shown, and keeps it once the toast is gone', () => {
    mount();
    showVisible(['a']);
    focusOn(closeOf('a'));
    act(() => dismiss('a'));
    expect(document.activeElement).toBe(regionOf());
    flush();
    expect(recordOf('a')).toBeUndefined();
    expect(document.activeElement).toBe(regionOf());
  });

  it('takes focus when the previous toast refuses it, never one before that', () => {
    mount();
    showVisible(['a', 'b', 'c']);
    refuseFocus(itemOf('b'));
    focusOn(itemOf('a'));
    act(() => dismiss('a'));
    expect(document.activeElement).toBe(regionOf());
  });

  it('takes focus from the first of toasts all dismissed in one commit, before the others are inert', () => {
    mount();
    showVisible(['a', 'b', 'c']);
    focusOn(closeOf('c'));
    const calls = trackFocusCalls();
    act(() => dismiss());
    // Straight to the region: a sibling that is exiting but not yet inert is never a stop on the way.
    expect(calls()).toEqual([regionOf()]);
    expect(document.activeElement).toBe(regionOf());
    for (const id of ['a', 'b', 'c']) expect(itemOf(id)).toHaveAttribute('inert');
  });

  it('takes focus from toasts at two positions dismissed in one commit', () => {
    mount();
    showVisible(['x'], { position: 'bottom-left' });
    showVisible(['a', 'b']);
    focusOn(closeOf('a'));
    const calls = trackFocusCalls();
    act(() => {
      dismiss('a');
      dismiss('x');
    });
    expect(calls()).toEqual([itemOf('b')]);
    expect(document.activeElement).toBe(itemOf('b'));
  });

  it('is left alone when it refuses focus too, and the toast is still inert', () => {
    mount();
    showVisible(['a']);
    refuseFocus(regionOf());
    const close = closeOf('a');
    focusOn(close);
    act(() => dismiss('a'));
    expect(itemOf('a')).toHaveAttribute('inert');
    expect(document.activeElement).toBe(close);
  });
});

describe('before inert (§9 rule 4, §18)', () => {
  it('moves focus while the toast is not yet inert, and makes it inert in the same commit', () => {
    mount();
    showVisible(['a', 'b']);
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

  it('moves focus to the region while the toast is not yet inert', () => {
    mount();
    showVisible(['a']);
    const old = itemOf('a');
    const inertAtFocus: boolean[] = [];
    regionOf().addEventListener('focus', () => inertAtFocus.push(old.hasAttribute('inert')));
    focusOn(closeOf('a'));
    act(() => dismiss('a'));
    expect(inertAtFocus).toEqual([false]);
    expect(old).toHaveAttribute('inert');
  });
});

describe('what counts as focused (§17.3, §18)', () => {
  it('restores from a custom control to the previous toast, never to the next', () => {
    mount();
    showVisible(['n']);
    showCustom(
      'c',
      <button type="button" onClick={() => undefined}>
        mine
      </button>
    );
    showVisible(['p']);
    expect(domOrder()).toEqual(['p', 'mine', 'n']);
    focusOn(screen.getByRole('button', { name: 'mine' }));
    act(() => dismiss('c'));
    expect(document.activeElement).toBe(itemOf('p'));
  });

  it('restores from an open shadow root inside custom content', () => {
    function Widget() {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        const host = ref.current;
        if (!host || host.shadowRoot) return;
        const button = document.createElement('button');
        button.textContent = 'inner';
        host.attachShadow({ mode: 'open' }).append(button);
      }, []);
      return <div ref={ref} data-testid="host" />;
    }
    mount();
    showVisible(['n']);
    showCustom('c', <Widget />);
    showVisible(['p']);
    const host = screen.getByTestId('host');
    focusOn(host.shadowRoot?.querySelector('button') as HTMLButtonElement);
    expect(document.activeElement).toBe(host);
    act(() => dismiss('c'));
    expect(document.activeElement).toBe(itemOf('p'));
  });

  it('never takes a lookalike in custom content for the library close button or action', () => {
    mount();
    showVisible(['n']);
    showCustom(
      'c',
      <>
        <button type="button" className="ret-toast__close" aria-label="Close notification">
          x
        </button>
        <button type="button" className="ret-toast__action">
          Undo n
        </button>
      </>
    );
    showVisible(['p']);
    const [closeLike, actionLike] = itemOf('x').querySelectorAll('button');
    // Direct children of the toast, like the library's own controls.
    expect(closeLike?.parentElement).toBe(itemOf('x'));
    expect(actionLike?.parentElement).toBe(itemOf('x'));

    focusOn(closeLike as HTMLButtonElement);
    act(() => dismiss('c'));
    expect(document.activeElement).toBe(itemOf('p'));
  });

  it.each(['close', 'action'] as const)(
    'never takes a lookalike in custom content as the next toast’s %s',
    control => {
      mount();
      showCustom(
        'c',
        <>
          <span>custom</span>
          <button type="button" className="ret-toast__action">
            Undo c
          </button>
          <button type="button" className="ret-toast__close" aria-label="Close notification">
            x
          </button>
        </>
      );
      showVisible(['a', 'b']);
      expect(domOrder()).toEqual(['b', 'a', 'customUndo cx']);
      focusOn(control === 'close' ? closeOf('a') : actionOf('a'));
      act(() => dismiss('a'));
      expect(document.activeElement).toBe(itemOf('b'));
    }
  );

  it('takes the library close button of a custom toast as a close button', () => {
    mount();
    showCustom('c', <span>custom</span>, { closeButton: true });
    showVisible(['a']);
    focusOn(closeOf('a'));
    act(() => dismiss('a'));
    expect(document.activeElement).toBe(closeOf('custom'));
  });

  it('moves nothing when focus is outside the toast, in another toast or in the region', () => {
    mount();
    showVisible(['a', 'b', 'c']);
    const outside = externalButton('outside');
    const calls = trackFocusCalls();
    for (const [focused, id] of [
      [outside, 'c'],
      [closeOf('a'), 'b'],
      [regionOf(), 'a'],
    ] as const) {
      focusOn(focused);
      const before = calls().length;
      act(() => dismiss(id));
      expect(calls()).toHaveLength(before);
      expect(document.activeElement).toBe(focused);
    }
  });
});

describe('when it runs (§9, §14)', () => {
  it('runs once under StrictMode', () => {
    render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    showVisible(['a', 'b']);
    focusOn(closeOf('b'));
    const calls = trackFocusCalls();
    act(() => dismiss('b'));
    expect(calls()).toEqual([closeOf('a')]);
    expect(document.activeElement).toBe(closeOf('a'));
  });

  it('never runs for a toast that mounts already exiting, even one that took focus as it mounted', () => {
    mount();
    showVisible(['a']);
    act(() => {
      toast.custom(<SelfFocusing />, { id: 'c' });
      dismiss('c');
    });
    const field = screen.getByRole('textbox', { name: 'field', hidden: true });
    expect(itemOf('a').parentElement?.contains(field)).toBe(true);
    expect(recordOf('c')?.phase).toBe('exiting');
    expect(document.activeElement).toBe(field);
  });

  it('never runs for a toast that mounts already exiting under StrictMode', () => {
    render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    showVisible(['a']);
    act(() => {
      toast.custom(<SelfFocusing />, { id: 'c' });
      dismiss('c');
    });
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'field', hidden: true })
    );
  });

  it('never runs on revival, and revival removes inert', () => {
    mount();
    showVisible(['a', 'b']);
    focusOn(closeOf('b'));
    act(() => dismiss('b'));
    expect(document.activeElement).toBe(closeOf('a'));
    // jsdom lets focus into the inert toast, so revival meets focus inside it.
    focusOn(itemOf('b'));
    const calls = trackFocusCalls();
    act(() => {
      toast('b again', { id: 'b' });
    });
    expect(recordOf('b')?.phase).toBe('entering');
    expect(calls()).toEqual([]);
    expect(document.activeElement).toBe(itemOf('b again'));
    expect(itemOf('b again')).not.toHaveAttribute('inert');
  });

  it('never runs for an in-place replacement, normal or custom, or a Toaster rerender', () => {
    const { rerender } = mount();
    showVisible(['a', 'b']);
    focusOn(closeOf('b'));
    const calls = trackFocusCalls();
    act(() => {
      toast('b2', { id: 'b' });
    });
    expect(document.activeElement).toBe(closeOf('b2'));
    rerender(<Toaster labels={{ region: 'Alerts' }} />);
    expect(document.activeElement).toBe(closeOf('b2'));
    focusOn(itemOf('b2'));
    const before = calls().length;
    act(() => {
      toast.custom(<span>b3</span>, { id: 'b', closeButton: true });
    });
    act(() => {
      toast('b4', { id: 'b' });
    });
    expect(calls()).toHaveLength(before);
    expect(document.activeElement).toBe(itemOf('b4'));
    expect(itemOf('b4')).not.toHaveAttribute('inert');
  });

  it('never runs again when only the reason of an exit changes', () => {
    mount();
    showVisible(['a', 'b']);
    act(() => dismiss('b'));
    focusOn(itemOf('b'));
    const calls = trackFocusCalls();
    act(() => {
      toast('b', { id: 'b', position: 'bottom-left' });
    });
    expect(recordOf('b')).toMatchObject({ phase: 'exiting', exit: { reason: 'relocate' } });
    act(() => dismiss('b'));
    expect(recordOf('b')).toMatchObject({ phase: 'exiting', exit: { reason: 'programmatic' } });
    expect(calls()).toEqual([]);
    expect(document.activeElement).toBe(itemOf('b'));
  });
});

describe('relocation (§14)', () => {
  it('restores from the old copy, which is inert; the destination mounts later, unfocused', () => {
    mount();
    showVisible(['a', 'b']);
    const old = itemOf('b');
    focusOn(closeOf('b'));
    act(() => {
      toast('b', { id: 'b', position: 'bottom-left' });
    });
    expect(recordOf('b')).toMatchObject({ phase: 'exiting', exit: { reason: 'relocate' } });
    expect(old).toHaveAttribute('inert');
    expect(document.activeElement).toBe(closeOf('a'));

    flush(); // the exit, then the destination mounts
    const moved = itemOf('b');
    expect(moved).not.toBe(old);
    expect(moved).toHaveAttribute('data-position', 'bottom-left');
    expect(moved).not.toHaveAttribute('inert');
    flush();
    expect(recordOf('b')?.phase).toBe('visible');
    expect(document.activeElement).toBe(closeOf('a'));
  });
});

describe('unmount and handover (§8.5)', () => {
  it('never runs when the Toaster unmounts', async () => {
    const { unmount } = mount();
    showVisible(['a', 'b']);
    focusOn(closeOf('b'));
    const calls = trackFocusCalls();
    unmount();
    await settle();
    expect(calls()).toEqual([]);
    expect(document.activeElement).toBe(document.body);
  });

  it('never runs on handover; the new owner starts afresh and restores for itself', async () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    onTestFinished(() => {
      first.remove();
      second.remove();
    });
    const firstRoot = createRoot(first);
    const secondRoot = createRoot(second);
    act(() => firstRoot.render(<Toaster />));
    act(() => secondRoot.render(<Toaster />));
    await settle();
    showVisible(['a', 'b']);
    expect(first.querySelectorAll('li')).toHaveLength(2);
    expect(second.querySelectorAll('li')).toHaveLength(0);
    focusOn(within(first).getAllByRole('button', { name: 'Close notification' })[0] as Element);

    const calls = trackFocusCalls();
    act(() => firstRoot.unmount());
    await settle();
    flush();
    expect(second.querySelectorAll('li')).toHaveLength(2);
    expect(calls()).toEqual([]);
    expect(document.activeElement).toBe(document.body);

    focusOn(closeOf('b'));
    act(() => dismiss('b'));
    expect(document.activeElement).toBe(closeOf('a'));
    act(() => secondRoot.unmount());
    await settle();
  });

  it('works for a Toaster mounted in an open shadow root', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    shadow.append(container);
    const root = createRoot(container);
    act(() => root.render(<Toaster />));
    onTestFinished(() => {
      act(() => root.unmount());
      host.remove();
    });
    showVisible(['a', 'b']);
    const [closeB, closeA] = shadow.querySelectorAll<HTMLButtonElement>('.ret-toast__close');
    focusOn(closeB as HTMLButtonElement);
    act(() => dismiss('b'));
    expect(shadow.activeElement).toBe(closeA);
    act(() => dismiss('a'));
    expect(shadow.activeElement).toBe(shadow.querySelector('section'));
  });
});

describe('Escape and the hotkey record (§18)', () => {
  it('returns from the region to where focus was before the hotkey', () => {
    mount();
    showVisible(['a']);
    const origin = externalButton('origin');
    focusOn(origin);
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(itemOf('a'));
    act(() => dismiss('a'));
    expect(document.activeElement).toBe(regionOf());
    expect(press(ESCAPE)).toBe(false);
    expect(document.activeElement).toBe(origin);
  });

  it('releases focus from the region to the document when nothing was recorded', () => {
    mount();
    showVisible(['a']);
    focusOn(closeOf('a'));
    act(() => dismiss('a'));
    expect(document.activeElement).toBe(regionOf());
    expect(press(ESCAPE)).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps the record through a restoration between toasts', () => {
    mount();
    showVisible(['a', 'b']);
    const origin = externalButton('origin');
    focusOn(origin);
    press(ALT_T);
    expect(document.activeElement).toBe(itemOf('b'));
    act(() => dismiss('b'));
    expect(document.activeElement).toBe(itemOf('a'));
    expect(press(ESCAPE)).toBe(false);
    expect(document.activeElement).toBe(origin);
  });
});

describe('the focus-within pause (§10)', () => {
  it('moves from the removed toast to the toast that takes focus', () => {
    mount();
    showVisible(['a', 'b']);
    focusOn(closeOf('b'));
    expect(recordOf('b')?.pausedBy).toEqual(['focus-within']);
    act(() => dismiss('b'));
    expect(recordOf('b')?.pausedBy).toEqual([]);
    expect(recordOf('a')?.pausedBy).toEqual(['focus-within']);
  });

  it('pauses no toast when the region takes focus', () => {
    mount();
    showVisible(['a']);
    showVisible(['b'], { position: 'bottom-left' });
    act(() => dismiss('b'));
    focusOn(closeOf('a'));
    act(() => dismiss('a'));
    expect(document.activeElement).toBe(regionOf());
    for (const record of inspectRecords()) expect(record.pausedBy).toEqual([]);
  });
});

// Restoration never scrolls the page (P-22 H1). The region is a static element wherever
// `<Toaster />` sits, and in real browsers a plain `focus()` scrolled the page to it (P-22 D1, the
// D0-16 report). jsdom has no layout or scrolling, so these tests check the request restoration
// makes, `preventScroll`, on every step it tries; D1's browser runs are the evidence that it stops
// the scroll. The hotkey and Escape are not restoration and keep their plain `focus()`.
describe('no scrolling (P-22 H1)', () => {
  /** Records every `focus()` call with its options from now on, refusing it on `refused`. */
  function focusCalls(...refused: Element[]) {
    const focus = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'focus')?.value as (
      this: HTMLElement,
      options?: FocusOptions
    ) => void;
    const calls: [HTMLElement, FocusOptions | undefined][] = [];
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
      this: HTMLElement,
      options?: FocusOptions
    ) {
      calls.push([this, options]);
      if (!refused.includes(this)) focus.call(this, options);
    });
    return calls;
  }

  const NO_SCROLL = { preventScroll: true };

  it('focuses the region without scrolling', () => {
    mount();
    showVisible(['a']);
    focusOn(closeOf('a'));
    const calls = focusCalls();
    act(() => dismiss('a'));
    expect(calls).toEqual([[regionOf(), NO_SCROLL]]);
    expect(document.activeElement).toBe(regionOf());
  });

  it('focuses the next toast’s equivalent control without scrolling', () => {
    mount();
    showVisible(['a', 'b']);
    focusOn(closeOf('b'));
    const calls = focusCalls();
    act(() => dismiss('b'));
    expect(calls).toEqual([[closeOf('a'), NO_SCROLL]]);
    expect(document.activeElement).toBe(closeOf('a'));
  });

  it('asks every step not to scroll, in the unchanged order: next, previous, region', () => {
    mount();
    showVisible(['a', 'b', 'c']);
    // DOM order is c, b, a (§12): from b, the next toast is a and the previous is c.
    focusOn(itemOf('b'));
    const calls = focusCalls(itemOf('a'), itemOf('c'));
    act(() => dismiss('b'));
    expect(calls).toEqual([
      [itemOf('a'), NO_SCROLL],
      [itemOf('c'), NO_SCROLL],
      [regionOf(), NO_SCROLL],
    ]);
    expect(document.activeElement).toBe(regionOf());
  });

  it('restores from a clicked close button without scrolling', () => {
    mount();
    showVisible(['a']);
    focusOn(closeOf('a'));
    const calls = focusCalls();
    act(() => {
      fireEvent.click(closeOf('a'));
    });
    expect(calls).toEqual([[regionOf(), NO_SCROLL]]);
  });

  it('leaves the hotkey and Escape as they were: a plain focus(), with no options', () => {
    mount();
    showVisible(['a']);
    const origin = externalButton('origin');
    focusOn(origin);
    const calls = focusCalls();
    press(ALT_T);
    expect(calls).toEqual([[itemOf('a'), undefined]]);
    calls.length = 0;
    press(ESCAPE);
    expect(calls).toEqual([[origin, undefined]]);
    expect(document.activeElement).toBe(origin);
  });
});

// A press on a position's list itself never focuses the region (P-22 H2). In real browsers a press
// on a gap between toasts, or through an exiting toast, which is inert and so never the target,
// lands on the `<ol>`, and its default action focuses the nearest focusable ancestor, the region:
// it undid restoration after a double-click on a close button (P-22 S4.1, the D0-16 report). jsdom
// neither focuses on a press nor skips inert targets, so these tests check the request, the
// prevented default, and that nothing else changes; the browser runs are the evidence.
describe('a press on the list (P-22 H2)', () => {
  const listOf = (id: string) => itemOf(id).parentElement as HTMLOListElement;

  /** Presses `target` and returns whether its default action was left to run. */
  function pressOn(target: Element): boolean {
    let notPrevented = true;
    act(() => {
      notPrevented = fireEvent.mouseDown(target);
    });
    return notPrevented;
  }

  it('prevents the default of a press on the list itself, so focus stays where it was', () => {
    mount();
    showVisible(['a', 'b']);
    const origin = externalButton('origin');
    focusOn(origin);
    expect(pressOn(listOf('a'))).toBe(false);
    expect(document.activeElement).toBe(origin);
  });

  it('keeps the restoration from an exiting toast when the list beneath it is pressed', () => {
    mount();
    showVisible(['a', 'b']);
    focusOn(closeOf('b'));
    act(() => dismiss('b'));
    expect(itemOf('b').hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(closeOf('a'));
    // A browser sends this press to the list: the exiting toast is inert, so never the target.
    expect(pressOn(listOf('a'))).toBe(false);
    expect(document.activeElement).toBe(closeOf('a'));
    expect(recordOf('a')?.pausedBy).toEqual(['focus-within']);
  });

  it('leaves presses on a toast, its content and its controls alone, and they still work', () => {
    mount();
    showVisible(['a']);
    const item = itemOf('a');
    for (const target of [
      item,
      item.querySelector('.ret-toast__title')!,
      actionOf('a'),
      closeOf('a'),
    ]) {
      expect(pressOn(target)).toBe(true);
    }
    act(() => {
      fireEvent.click(closeOf('a'));
    });
    expect(recordOf('a')?.phase).toBe('exiting');
  });

  it('leaves a list inside custom content alone', () => {
    mount();
    showCustom(
      'c',
      <ol aria-label="inner">
        <li>inner item</li>
      </ol>
    );
    const inner = screen.getByRole('list', { name: 'inner', hidden: true });
    expect(pressOn(inner)).toBe(true);
    expect(pressOn(screen.getByText('inner item', inToasts))).toBe(true);
  });

  it('never stops the press or the click that follows from propagating', () => {
    mount();
    showVisible(['a']);
    const seen: [string, boolean][] = [];
    const record = (event: Event) => seen.push([event.type, event.defaultPrevented]);
    document.addEventListener('mousedown', record);
    document.addEventListener('click', record);
    onTestFinished(() => {
      document.removeEventListener('mousedown', record);
      document.removeEventListener('click', record);
    });
    pressOn(listOf('a'));
    act(() => {
      fireEvent.click(listOf('a'));
    });
    expect(seen).toEqual([
      ['mousedown', true],
      ['click', false],
    ]);
    expect(recordOf('a')?.phase).toBe('visible');
  });

  it('leaves the region focusable from script, and restoration still reaches it', () => {
    mount();
    showVisible(['a']);
    focusOn(regionOf());
    expect(document.activeElement).toBe(regionOf());
    focusOn(closeOf('a'));
    act(() => dismiss('a'));
    expect(document.activeElement).toBe(regionOf());
  });
});
