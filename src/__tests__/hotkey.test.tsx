// The hotkey (§18, P-16): exact matching on `code` and the four modifiers, the one keydown listener
// of the active Toaster, the first toast that is not exiting as its target, and where focus came
// from. The record of that origin is internal and is only read by Escape (a later slice), so these
// tests observe it through the reads of the deep active element: one per press from outside the
// region, none from inside. jsdom has no sequential Tab navigation; real Tab order is a P-22 check.
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  StrictMode,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from '../index';
import { deepActiveElement } from '../react/focus';
import { dismiss } from '../store/store';
import type { ToasterProps, ToastOptions } from '../types';

vi.mock('../react/focus', async importOriginal => {
  const actual = await importOriginal<typeof import('../react/focus')>();
  return { ...actual, deepActiveElement: vi.fn(actual.deepActiveElement) };
});
/** Read once per press that comes from outside the region, to record where focus was. */
const originReads = vi.mocked(deepActiveElement);

const ALT_T = { code: 'KeyT', key: '†', altKey: true };

// Text queries for a toast skip the hidden announcement copy in the live regions (§17.1).
const inToasts = { ignore: 'script, style, [aria-live] *' };
const itemOf = (text: string) => screen.getByText(text, inToasts).closest('li') as HTMLLIElement;

function show(content: ReactNode, options: ToastOptions & { id: string }): void {
  act(() => {
    toast(content, options);
  });
}

/** Presses a key on the focused element; true when the event was not prevented. */
function press(init: KeyboardEventInit, target?: Element): boolean {
  let notPrevented = true;
  act(() => {
    notPrevented = fireEvent.keyDown(target ?? document.activeElement ?? document.body, init);
  });
  return notPrevented;
}

/** Lets the deferred (microtask) Toaster detach run, inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
  });
}

function App({ hotkey, ...props }: ToasterProps) {
  return (
    <>
      <button type="button">outside</button>
      <Toaster hotkey={hotkey} {...props} />
    </>
  );
}

/** Mounts a Toaster after an outside button, and focuses that button. */
function mount(props: ToasterProps = {}) {
  const utils = render(<App {...props} />);
  const outside = screen.getByRole('button', { name: 'outside' });
  act(() => outside.focus());
  return { ...utils, outside };
}

/** The keydown listeners on `document`, by identity. */
function trackKeydown() {
  const live = new Set<unknown>();
  let added = 0;
  const add = document.addEventListener.bind(document);
  const remove = document.removeEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'keydown') {
      live.add(listener);
      added++;
    }
    add(type, listener, options);
  });
  vi.spyOn(document, 'removeEventListener').mockImplementation((type, listener, options) => {
    if (type === 'keydown') live.delete(listener);
    remove(type, listener, options);
  });
  return { live: () => [...live], added: () => added };
}

beforeEach(() => {
  vi.useFakeTimers();
  originReads.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('matching (§18)', () => {
  it('Alt+T moves focus to the first toast and prevents the event', () => {
    const { outside } = mount();
    show('a', { id: 'a' });
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(itemOf('a'));
    expect(outside).not.toHaveFocus();
  });

  it.each(['t', 'T', '†', 'е'])('matches the physical key by code, whatever it types (%s)', key => {
    mount();
    show('a', { id: 'a' });
    expect(press({ code: 'KeyT', key, altKey: true })).toBe(false);
    expect(document.activeElement).toBe(itemOf('a'));
  });

  it('never matches by key: another physical key that types t does nothing', () => {
    const { outside } = mount();
    show('a', { id: 'a' });
    expect(press({ code: 'KeyY', key: 't', altKey: true })).toBe(true);
    expect(outside).toHaveFocus();
  });

  it.each<[string, KeyboardEventInit]>([
    ['Alt+Shift+T', { ...ALT_T, shiftKey: true }],
    ['Alt+Ctrl+T', { ...ALT_T, ctrlKey: true }],
    ['Alt+Meta+T', { ...ALT_T, metaKey: true }],
    ['T', { code: 'KeyT', key: 't' }],
  ])('needs exactly the configured modifiers: %s does nothing', (_, init) => {
    const { outside } = mount();
    show('a', { id: 'a' });
    expect(press(init)).toBe(true);
    expect(outside).toHaveFocus();
    expect(originReads).not.toHaveBeenCalled();
  });

  it('uses a configured hotkey, with its modifiers in any order, instead of Alt+T', () => {
    const { outside } = mount({ hotkey: ['shiftKey', 'ctrlKey', 'KeyY'] });
    show('a', { id: 'a' });
    expect(press(ALT_T)).toBe(true);
    expect(press({ code: 'KeyY', ctrlKey: true })).toBe(true);
    expect(press({ code: 'KeyY', ctrlKey: true, shiftKey: true, altKey: true })).toBe(true);
    expect(outside).toHaveFocus();
    expect(press({ code: 'KeyY', key: 'Y', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(itemOf('a'));
  });

  it('accepts a hotkey with no modifiers, and collapses repeated modifier names', () => {
    const { outside, rerender } = mount({ hotkey: ['F6'] });
    show('a', { id: 'a' });
    expect(press({ code: 'F6', altKey: true })).toBe(true);
    expect(outside).toHaveFocus();
    expect(press({ code: 'F6' })).toBe(false);
    expect(document.activeElement).toBe(itemOf('a'));

    act(() => outside.focus());
    rerender(<App hotkey={['altKey', 'KeyT', 'altKey']} />);
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(itemOf('a'));
  });

  it.each<[string, unknown]>([
    ['an empty array', []],
    ['modifiers only', ['altKey', 'shiftKey']],
    ['two codes', ['altKey', 'KeyT', 'KeyY']],
    ['a non-string', ['altKey', 1, 'KeyY']],
    ['an empty code', ['ctrlKey', '']],
    ['a modifier spelled as a key', ['Alt', 'KeyY']],
    ['null', null],
    ['true', true],
    ['a string', 'ctrlKey+KeyY'],
    ['an array-like object', { 0: 'ctrlKey', 1: 'KeyY', length: 2 }],
  ])('treats an invalid hotkey (%s) as omitted: Alt+T', (_, hotkey) => {
    mount({ hotkey: hotkey as ToasterProps['hotkey'] });
    show('a', { id: 'a' });
    expect(press({ code: 'KeyY', ctrlKey: true })).toBe(true);
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(itemOf('a'));
  });

  it('reads a frozen array without changing it', () => {
    const hotkey = Object.freeze(['ctrlKey', 'KeyY']);
    mount({ hotkey });
    show('a', { id: 'a' });
    expect(press({ code: 'KeyY', ctrlKey: true })).toBe(false);
    expect(hotkey).toEqual(['ctrlKey', 'KeyY']);
  });

  it('does nothing with hotkey={false}', () => {
    const { outside } = mount({ hotkey: false });
    show('a', { id: 'a' });
    expect(press(ALT_T)).toBe(true);
    expect(outside).toHaveFocus();
  });
});

describe('the keydown event (§18)', () => {
  it('does nothing when a handler has already prevented it, React handlers and portals included', () => {
    const prevent = (event: ReactKeyboardEvent) => event.preventDefault();
    render(
      <>
        <input aria-label="field" onKeyDown={prevent} />
        {createPortal(<input aria-label="portalled" onKeyDown={prevent} />, document.body)}
        <Toaster />
      </>
    );
    show('a', { id: 'a' });
    const preventDefault = vi.spyOn(KeyboardEvent.prototype, 'preventDefault');
    for (const name of ['field', 'portalled']) {
      const field = screen.getByRole('textbox', { name });
      act(() => field.focus());
      expect(press(ALT_T)).toBe(false);
      expect(field).toHaveFocus();
    }
    // Only the handlers' own calls.
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(originReads).not.toHaveBeenCalled();
  });

  it('does nothing, and leaves the event alone, when no toast is shown', () => {
    const { outside } = mount();
    expect(press(ALT_T)).toBe(true);
    expect(outside).toHaveFocus();
    expect(originReads).not.toHaveBeenCalled();
  });

  it('does nothing when the only toast is exiting', () => {
    const { outside } = mount();
    show('a', { id: 'a' });
    act(() => dismiss('a'));
    expect(itemOf('a')).toHaveAttribute('inert');
    expect(press(ALT_T)).toBe(true);
    expect(outside).toHaveFocus();
    expect(originReads).not.toHaveBeenCalled();
  });

  it('leaves the event alone when focus does not land on the toast', () => {
    const { outside } = mount();
    show('a', { id: 'a' });
    // A focus the browser refuses, for example inside a modal that made the page inert.
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(() => undefined);
    expect(press(ALT_T)).toBe(true);
    expect(outside).toHaveFocus();
  });
});

describe('the target (§12, §18)', () => {
  it('is the first toast in DOM order across every position stack', () => {
    mount();
    show('bottom', { id: 'bottom', position: 'bottom-right' });
    show('older', { id: 'older', position: 'top-right' });
    show('newer', { id: 'newer', position: 'top-right' });
    // Top stacks show the newest toast first; top positions come before bottom ones.
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(itemOf('newer'));

    show('left', { id: 'left', position: 'top-left' });
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(itemOf('left'));
  });

  it('skips an exiting toast', () => {
    mount();
    show('older', { id: 'older' });
    show('newer', { id: 'newer' });
    act(() => dismiss('newer'));
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(itemOf('older'));
  });

  it("is a toast, never a list item of a custom toast's content", () => {
    mount();
    show('plain', { id: 'plain' });
    act(() => {
      toast.custom(
        <ul>
          <li>inner item</li>
        </ul>,
        { id: 'custom' }
      );
    });
    const custom = screen.getByText('inner item', inToasts).closest('li.ret-toast');
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(custom);

    // Exiting, the custom toast is skipped, and so is everything inside it.
    act(() => dismiss('custom'));
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(itemOf('plain'));
  });

  it('takes focus from script but stays out of the Tab order; the region does not take focus', () => {
    mount();
    show('plain', { id: 'plain' });
    act(() => {
      toast.custom(<span>custom</span>, { id: 'custom' });
    });
    for (const item of [itemOf('plain'), itemOf('custom')]) {
      expect(item).toHaveAttribute('tabindex', '-1');
      act(() => item.focus());
      expect(item).toHaveFocus();
    }
    const region = screen.getByRole('region');
    expect(region).not.toHaveAttribute('tabindex');
    expect(region).not.toHaveAttribute('aria-keyshortcuts');
  });
});

describe('where focus came from (§18)', () => {
  it('reads the origin for a press from outside, and never for a press from inside', () => {
    const { outside } = mount();
    show('older', { id: 'older' });
    show('newer', { id: 'newer' });
    expect(press(ALT_T)).toBe(false);
    expect(originReads).toHaveBeenCalledTimes(1);
    expect(originReads).toHaveLastReturnedWith(outside);

    // From a control of another toast, and again from the first toast itself.
    const close = itemOf('older').querySelector('button') as HTMLButtonElement;
    act(() => close.focus());
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(itemOf('newer'));
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(itemOf('newer'));
    expect(originReads).toHaveBeenCalledTimes(1);
  });

  it('reads the focused element itself inside another open shadow root', () => {
    mount();
    show('a', { id: 'a' });
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('button');
    shadow.append(inner);
    act(() => inner.focus());
    expect(document.activeElement).toBe(host);

    expect(press(ALT_T, inner)).toBe(false);
    expect(document.activeElement).toBe(itemOf('a'));
    expect(originReads).toHaveLastReturnedWith(inner);
    host.remove();
  });

  it('counts focus in an open shadow root inside custom content as inside the region', () => {
    function Widget() {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        const shadow = ref.current?.attachShadow({ mode: 'open' });
        const button = document.createElement('button');
        button.textContent = 'deep';
        shadow?.append(button);
      }, []);
      return <div ref={ref} data-testid="widget" />;
    }
    mount();
    show('plain', { id: 'plain' });
    act(() => {
      toast.custom(<Widget />, { id: 'custom' });
    });
    const deep = screen.getByTestId('widget').shadowRoot?.querySelector('button') as HTMLElement;
    act(() => deep.focus());

    expect(press(ALT_T, deep)).toBe(false);
    expect(document.activeElement).toBe(screen.getByTestId('widget').closest('li'));
    expect(originReads).not.toHaveBeenCalled();
  });

  it('works for a Toaster mounted in an open shadow root', () => {
    const outside = document.createElement('button');
    const host = document.createElement('div');
    document.body.append(outside, host);
    const shadow = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    shadow.append(container);
    const root = createRoot(container);
    try {
      act(() => root.render(<Toaster />));
      show('a', { id: 'a' });
      act(() => outside.focus());
      const item = shadow.querySelector('li') as HTMLLIElement;

      expect(press(ALT_T)).toBe(false);
      expect(shadow.activeElement).toBe(item);
      expect(document.activeElement).toBe(host);
      expect(originReads).toHaveLastReturnedWith(outside);

      // Inside the shadow-rooted region now, though the document reports only the host.
      expect(press(ALT_T, item)).toBe(false);
      expect(shadow.activeElement).toBe(item);
      expect(originReads).toHaveBeenCalledTimes(1);
    } finally {
      act(() => root.unmount());
      host.remove();
      outside.remove();
    }
  });
});

describe('listener ownership (§18, §32)', () => {
  it('the active Toaster adds one keydown listener, and a waiting one adds none and cannot react', async () => {
    const listeners = trackKeydown();
    const { rerender, outside } = mount();
    const first = listeners.live();
    expect(first).toHaveLength(1);

    rerender(
      <>
        <App />
        <Toaster key="waiting" hotkey={['ctrlKey', 'KeyY']} />
      </>
    );
    await settle();
    expect(listeners.live()).toEqual(first);
    expect(listeners.added()).toBe(1);
    show('a', { id: 'a' });
    act(() => outside.focus());
    expect(press({ code: 'KeyY', ctrlKey: true })).toBe(true);
    expect(outside).toHaveFocus();
    expect(screen.getAllByRole('region')).toHaveLength(1);
  });

  it('hands the listener to the next Toaster, which then reacts with its own hotkey', async () => {
    const listeners = trackKeydown();
    const outside = document.createElement('button');
    document.body.append(outside);
    const { rerender } = render(
      <>
        <Toaster key="first" />
        <Toaster key="second" hotkey={['ctrlKey', 'KeyY']} />
      </>
    );
    await settle();
    const first = listeners.live();
    expect(first).toHaveLength(1);

    rerender(<Toaster key="second" hotkey={['ctrlKey', 'KeyY']} />);
    await settle();
    expect(listeners.live()).toHaveLength(1);
    expect(listeners.live()).not.toEqual(first);
    show('a', { id: 'a' });
    act(() => outside.focus());
    expect(press(ALT_T)).toBe(true);
    expect(press({ code: 'KeyY', ctrlKey: true })).toBe(false);
    expect(document.activeElement).toBe(itemOf('a'));
    outside.remove();
  });

  it('keeps exactly one under StrictMode', async () => {
    const listeners = trackKeydown();
    render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    await settle();
    expect(listeners.live()).toHaveLength(1);
    show('a', { id: 'a' });
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(itemOf('a'));
  });

  it('keeps the same listener through hotkey changes, false included', () => {
    const listeners = trackKeydown();
    const { rerender, outside } = mount({ hotkey: false });
    const attached = listeners.live();
    expect(attached).toHaveLength(1);
    show('a', { id: 'a' });

    const steps: [ToasterProps['hotkey'], KeyboardEventInit, KeyboardEventInit][] = [
      [undefined, ALT_T, { code: 'KeyY', ctrlKey: true }],
      [['ctrlKey', 'KeyY'], { code: 'KeyY', ctrlKey: true }, ALT_T],
      [['shiftKey', 'KeyY'], { code: 'KeyY', shiftKey: true }, { code: 'KeyY', ctrlKey: true }],
      [false, { code: 'KeyZ' }, { code: 'KeyY', shiftKey: true }],
      [['altKey', 'KeyT'], ALT_T, { code: 'KeyY', shiftKey: true }],
      [['altKey', 'KeyT'], ALT_T, { code: 'KeyY', shiftKey: true }],
    ];
    for (const [hotkey, acts, ignored] of steps) {
      rerender(<App hotkey={hotkey} />);
      act(() => outside.focus());
      expect(press(ignored)).toBe(true);
      expect(outside).toHaveFocus();
      if (hotkey !== false) {
        expect(press(acts)).toBe(false);
        expect(document.activeElement).toBe(itemOf('a'));
      }
    }
    expect(listeners.live()).toEqual(attached);
    expect(listeners.added()).toBe(1);
  });

  it('removes it on unmount, and a new Toaster starts afresh', async () => {
    const listeners = trackKeydown();
    const first = mount();
    show('a', { id: 'a' });
    expect(press(ALT_T)).toBe(false);
    first.unmount();
    await settle();
    expect(listeners.live()).toHaveLength(0);
    const outside = document.createElement('button');
    document.body.append(outside);
    act(() => outside.focus());
    expect(press(ALT_T)).toBe(true);

    render(<Toaster />);
    await settle();
    expect(listeners.live()).toHaveLength(1);
    originReads.mockClear();
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(itemOf('a'));
    expect(originReads).toHaveLastReturnedWith(outside);
    outside.remove();
  });
});

describe('hydration (§23)', () => {
  it('hydrates without a mismatch, then the hotkey works', async () => {
    const html = renderToString(<Toaster />);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const error = vi.spyOn(console, 'error');
    const root = await act(async () => {
      const hydrated = hydrateRoot(container, <Toaster />);
      await Promise.resolve();
      return hydrated;
    });
    await settle();
    show('a', { id: 'a' });
    expect(press(ALT_T)).toBe(false);
    expect(document.activeElement).toBe(itemOf('a'));
    expect(error).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
