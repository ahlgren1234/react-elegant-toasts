// Render counts (§32, D-16): a change to one toast re-renders only that toast. Toast content is
// kept by identity, so React would skip re-rendering it even if its item re-rendered; counting the
// content's renders would prove nothing. Instead the item's render function is wrapped, and the
// wrapper is memoised exactly when the real item is, so the test sees what production does.
import { act, fireEvent, render } from '@testing-library/react';
import { memo, Profiler, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from '../index';
import { ANNOUNCEMENT_RETENTION_MS } from '../react/announcer';
import {
  dismiss,
  entered,
  getSnapshot,
  inspectRecords,
  setGlobalPause,
  setStackPause,
  setToastPause,
} from '../store/store';
import type { ToastView } from '../store/types';

const renders = vi.hoisted(() => new Map<string, number>());

vi.mock('../react/ToastItem', async importOriginal => {
  const actual = await importOriginal<typeof import('../react/ToastItem')>();
  type Render = (props: {
    view: ToastView;
    closeButton: boolean;
    closeLabel: string | undefined;
    progress: boolean;
    announcePrefix: string | undefined;
  }) => ReactElement;
  const item = actual.ToastItem as unknown as { $$typeof?: symbol; type?: Render };
  const memoised = item.$$typeof === Symbol.for('react.memo');
  const inner = memoised ? (item.type as Render) : (actual.ToastItem as unknown as Render);
  const counted: Render = props => {
    renders.set(props.view.id, (renders.get(props.view.id) ?? 0) + 1);
    return inner(props);
  };
  return { ToastItem: memoised ? memo(counted) : counted };
});

/** Render counts since the last call, per toast. */
function rendersSince(): Record<string, number> {
  const counts = Object.fromEntries(renders);
  renders.clear();
  return counts;
}

beforeEach(() => {
  // Lifecycle fallbacks run only when a test advances the clock; these tests report phases directly.
  vi.useFakeTimers();
  renders.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

/** Mounts a Toaster with visible toasts `a`, `b` and `c` at top-right and `x` at bottom-left. */
function mountWithToasts() {
  let commits = 0;
  render(
    <Profiler id="toaster" onRender={() => commits++}>
      <Toaster />
    </Profiler>
  );
  act(() => {
    for (const id of ['a', 'b', 'c']) toast(id, { id });
    toast('x', { id: 'x', position: 'bottom-left' });
  });
  act(() => {
    for (const id of ['a', 'b', 'c', 'x']) entered(id);
  });
  rendersSince();
  return { commits: () => commits };
}

describe('render counts (§32, D-16)', () => {
  it('re-renders only the replaced toast', () => {
    mountWithToasts();
    act(() => {
      toast('b again', { id: 'b' });
    });
    expect(rendersSince()).toEqual({ b: 1 });
  });

  it('re-renders only the toast whose phase changes', () => {
    mountWithToasts();
    act(() => dismiss('c'));
    expect(rendersSince()).toEqual({ c: 1 });
  });

  it('adds no render or commit when inert is applied on exit or removed on revival (P-16)', () => {
    const { commits } = mountWithToasts();
    const before = commits();
    act(() => dismiss('c'));
    const exiting = document.querySelector('li[data-phase="exiting"]') as HTMLLIElement;
    expect(exiting).toHaveAttribute('inert');
    expect(rendersSince()).toEqual({ c: 1 });
    expect(commits()).toBe(before + 1);

    act(() => {
      toast('c again', { id: 'c' });
    });
    expect(exiting).toHaveAttribute('data-phase', 'entering');
    expect(exiting).not.toHaveAttribute('inert');
    expect(rendersSince()).toEqual({ c: 1 });
    expect(commits()).toBe(before + 2);
  });

  it('renders only the new toast when one is added to a list', () => {
    mountWithToasts();
    act(() => {
      toast('d', { id: 'd' });
    });
    expect(rendersSince()).toEqual({ d: 1 });
  });

  it('leaves other positions alone when one position changes', () => {
    mountWithToasts();
    act(() => {
      toast('x again', { id: 'x', position: 'bottom-left' });
    });
    expect(rendersSince()).toEqual({ x: 1 });
  });

  // P-20 S1 (decision 2): time passing renders nothing. The view holds the timer's folded
  // `remaining`, which changes only at run boundaries, never as a running timer counts down.
  it('renders and commits nothing while running timers count down (P-20)', () => {
    const { commits } = mountWithToasts();
    const snapshot = getSnapshot();
    const before = commits();
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(inspectRecords().every(record => record.phase === 'visible')).toBe(true);
    expect(getSnapshot()).toBe(snapshot);
    expect(commits()).toBe(before);
    expect(rendersSince()).toEqual({});
  });

  // Narrowed by P-20 S1 from "renders nothing for timer and pause changes" (P-15): a pause boundary
  // re-renders exactly the toasts whose held state changes (decision 1), once each, and a reason
  // that changes no toast's held state renders nothing.
  it('re-renders, at a pause boundary, only the toasts whose held state changes (P-20)', () => {
    const { commits } = mountWithToasts();
    let before = commits();
    const step = (run: () => void, expected: Record<string, number>, committed: number) => {
      act(run);
      expect(rendersSince()).toEqual(expected);
      expect(commits()).toBe(before + committed);
      before = commits();
    };
    // Focus within one toast: that toast only.
    step(() => setToastPause('a', 'focus-within', true), { a: 1 }, 1);
    // Hover on its stack: the rest of that stack only; `a` is already held, `x` is elsewhere.
    step(() => setStackPause('top-right', true), { b: 1, c: 1 }, 1);
    // A global reason: only `x` changes; the top-right stack is already held.
    step(() => setGlobalPause('window-blur', true), { x: 1 }, 1);
    // Clearing reasons while another still holds each toast renders nothing.
    step(() => setToastPause('a', 'focus-within', false), {}, 0);
    step(() => setStackPause('top-right', false), {}, 0);
    step(() => setGlobalPause('document-hidden', true), {}, 0);
    step(() => setGlobalPause('window-blur', false), {}, 0);
    // The last reason clears: every toast resumes, once each.
    step(() => setGlobalPause('document-hidden', false), { a: 1, b: 1, c: 1, x: 1 }, 1);
  });

  it('re-renders no persistent or loading toast at a pause boundary (P-20)', () => {
    render(<Toaster />);
    act(() => {
      toast('finite', { id: 'finite' });
      toast('persistent', { id: 'persistent', duration: Infinity });
      toast.loading('loading', { id: 'loading' });
    });
    act(() => {
      for (const id of ['finite', 'persistent', 'loading']) entered(id);
    });
    rendersSince();
    act(() => setGlobalPause('window-blur', true));
    expect(rendersSince()).toEqual({ finite: 1 });
    act(() => setStackPause('top-right', false));
    act(() => setToastPause('persistent', 'focus-within', true));
    act(() => setToastPause('loading', 'focus-within', true));
    expect(rendersSince()).toEqual({});
    act(() => setGlobalPause('window-blur', false));
    expect(rendersSince()).toEqual({ finite: 1 });
  });

  // Narrowed by P-20 S1: focus within a finite toast now holds it (decision 1), so the toast that
  // receives restored focus re-renders once. Restoration renders nothing else, and the exiting toast
  // renders only for its phase change: its countdown is over, so losing focus changes no view.
  it('renders, when the dismissed toast held focus, only the toast that receives it (P-16, P-20)', () => {
    const { commits } = mountWithToasts();
    const item = (id: string) =>
      [...document.querySelectorAll('li')].find(li => li.textContent?.includes(id)) as HTMLElement;
    const close = (id: string) => item(id).querySelector('button') as HTMLButtonElement;

    // Unfocused, for comparison.
    let before = commits();
    act(() => dismiss('c'));
    expect(rendersSince()).toEqual({ c: 1 });
    expect(commits()).toBe(before + 1);

    // Focused: the dismissal renders b; restoration moves focus to a's close button, holding a.
    act(() => close('b').focus());
    expect(rendersSince()).toEqual({ b: 1 });
    before = commits();
    act(() => dismiss('b'));
    expect(document.activeElement).toBe(close('a'));
    expect(rendersSince()).toEqual({ a: 1, b: 1 });
    expect(commits()).toBe(before + 2);

    // To the region: no toast receives focus, so only the dismissal renders.
    act(() => dismiss('a'));
    act(() => close('x').focus());
    rendersSince();
    before = commits();
    act(() => dismiss('x'));
    expect(document.activeElement).toBe(document.querySelector('section'));
    expect(rendersSince()).toEqual({ x: 1 });
    expect(commits()).toBe(before + 1);
  });

  // Narrowed by P-20 S1 from "renders nothing for the DOM events that pause toasts" (P-15): each
  // real pause event re-renders exactly the toasts whose held state it changes, once each.
  it('re-renders, for the DOM events that pause toasts, only the toasts they hold or release', () => {
    const { commits } = mountWithToasts();
    const list = document.querySelector('ol[data-position="top-right"]') as HTMLOListElement;
    const close = (id: string) =>
      [...list.querySelectorAll('li')]
        .find(item => item.textContent?.includes(id))
        ?.querySelector('button') as HTMLButtonElement;
    const hidden = vi.spyOn(document, 'hidden', 'get');
    let before = commits();
    const step = (run: () => void, expected: Record<string, number>) => {
      act(run);
      expect(rendersSince()).toEqual(expected);
      expect(commits()).toBe(before + (Object.keys(expected).length > 0 ? 1 : 0));
      before = commits();
    };
    step(() => fireEvent.pointerEnter(list), { a: 1, b: 1, c: 1 });
    step(() => close('a').focus(), {});
    step(() => close('b').focus(), {});
    step(() => fireEvent.blur(window), { x: 1 });
    step(() => fireEvent.focus(window), { x: 1 });
    step(
      () => {
        hidden.mockReturnValue(true);
        fireEvent(document, new Event('visibilitychange'));
      },
      { x: 1 }
    );
    step(
      () => {
        hidden.mockReturnValue(false);
        fireEvent(document, new Event('visibilitychange'));
      },
      { x: 1 }
    );
    // The events reached the store: focus is inside b, which the hover still holds.
    expect(inspectRecords().find(record => record.id === 'b')?.pausedBy).toEqual(['focus-within']);
    step(() => close('b').blur(), {});
    step(() => fireEvent.pointerLeave(list), { a: 1, b: 1, c: 1 });
    hidden.mockRestore();
  });

  it('re-renders, on a Toaster closeButton change, only the toasts whose close button changes', () => {
    const { rerender } = render(<Toaster />);
    act(() => {
      toast('implicit', { id: 'implicit' });
      toast('own', { id: 'own', closeButton: true });
      toast.custom('custom', { id: 'custom' });
      toast.custom('custom on', { id: 'custom-on', closeButton: true });
    });
    rendersSince();

    rerender(<Toaster closeButton={false} />);
    expect(rendersSince()).toEqual({ implicit: 1 });
  });

  // Narrowed by P-20 S2 from "a progress change re-renders no toast": the Toaster's `progress`
  // re-renders exactly the toasts whose resolved progress changes, which are the finite normal
  // toasts that leave the option out. Custom, persistent, loading and opted toasts never render.
  it('re-renders, on a Toaster progress change, only the toasts whose progress changes', () => {
    const { rerender } = render(<Toaster />);
    act(() => {
      toast('implicit', { id: 'implicit' });
      toast('own on', { id: 'own-on', progress: true });
      toast('own off', { id: 'own-off', progress: false });
      toast('persistent', { id: 'persistent', duration: Infinity });
      toast.loading('loading', { id: 'loading' });
      toast.custom('custom', { id: 'custom' });
    });
    rendersSince();
    const item = [...document.querySelectorAll('li')].find(li => li.textContent === 'implicit');
    const content = item?.querySelector('.ret-toast__content');

    rerender(<Toaster progress />);
    expect(rendersSince()).toEqual({ implicit: 1 });
    expect(item?.querySelector('.ret-toast__progress')).not.toBeNull();
    rerender(<Toaster progress={false} />);
    expect(rendersSince()).toEqual({ implicit: 1 });
    expect(item?.querySelector('.ret-toast__progress')).toBeNull();
    rerender(<Toaster progress={false} closeButton />);
    expect(rendersSince()).toEqual({});
    expect([...document.querySelectorAll('li')].includes(item as HTMLLIElement)).toBe(true);
    expect(item?.querySelector('.ret-toast__content')).toBe(content);
  });

  it('re-renders no toast when the theme changes, which only the region attribute shows (P-17)', () => {
    const { rerender } = render(<Toaster theme="light" />);
    act(() => {
      toast('a', { id: 'a' });
      toast.success('b', { id: 'b', position: 'bottom-left' });
      toast.custom('custom', { id: 'custom' });
    });
    rendersSince();

    for (const theme of ['dark', 'system', 'light'] as const) {
      rerender(<Toaster theme={theme} />);
      expect(document.querySelector('.ret-toaster')).toHaveAttribute('data-theme', theme);
    }
    rerender(<Toaster />);
    expect(rendersSince()).toEqual({});
  });

  it('renders nothing when a new labels object resolves to the same strings', () => {
    const { rerender } = render(<Toaster labels={{ region: 'Alerts', close: 'Fermer' }} />);
    act(() => {
      toast('a', { id: 'a' });
      toast('b', { id: 'b', closeButton: false });
      toast.custom('custom', { id: 'custom', closeButton: true });
    });
    rendersSince();

    rerender(<Toaster labels={{ region: 'Alerts', close: 'Fermer' }} />);
    rerender(<Toaster labels={{ close: 'Fermer', region: 'Alerts', errorPrefix: undefined }} />);
    expect(rendersSince()).toEqual({});
    // Fields that toasts do not render, and invalid values that resolve to the same text.
    rerender(<Toaster labels={{ region: 'Updates', close: 'Fermer', warningPrefix: 'Note:' }} />);
    expect(rendersSince()).toEqual({});
    rerender(<Toaster labels={{ close: 'Close notification' }} />);
    rendersSince();
    rerender(<Toaster labels={{ close: '' }} />);
    rerender(<Toaster />);
    expect(rendersSince()).toEqual({});
  });

  it('renders nothing when a new labels object resolves to the same prefixes', () => {
    const labels = { warningPrefix: 'Note:', errorPrefix: 'Oops:' };
    const { rerender } = render(<Toaster labels={{ ...labels }} />);
    act(() => {
      toast.warning('w', { id: 'w' });
      toast.error('e', { id: 'e' });
      toast('d', { id: 'd' });
    });
    rendersSince();
    rerender(<Toaster labels={{ ...labels }} />);
    rerender(<Toaster labels={{ ...labels, region: 'Notifications' }} />);
    expect(rendersSince()).toEqual({});
  });

  it('re-renders, on a prefix change, only the toasts of that type', () => {
    const { rerender } = render(<Toaster />);
    act(() => {
      toast.warning('w', { id: 'w' });
      toast.error('e', { id: 'e' });
      toast('d', { id: 'd' });
      toast.custom('c', { id: 'c' });
    });
    rendersSince();
    rerender(<Toaster labels={{ warningPrefix: 'Note:' }} />);
    expect(rendersSince()).toEqual({ w: 1 });
    rerender(<Toaster labels={{ warningPrefix: 'Note:', errorPrefix: 'Oops:' }} />);
    expect(rendersSince()).toEqual({ e: 1 });
  });

  it('re-renders no other toast when one is announced', () => {
    const { commits } = mountWithToasts();
    const before = commits();
    const polite = document.querySelector('section > [aria-live="polite"]') as HTMLElement;
    const assertive = document.querySelector('section > [aria-live="assertive"]') as HTMLElement;
    act(() => {
      toast.error('b failed', { id: 'b' });
    });
    expect(assertive).toHaveTextContent('Error: b failed');
    expect(polite).not.toHaveTextContent('b failed');
    expect(rendersSince()).toEqual({ b: 1 });
    // One commit for the replacement; the announcement itself commits nothing.
    expect(commits()).toBe(before + 1);
  });

  // Narrowed by P-20 S1: the hotkey itself renders nothing, but the toast it focuses is now held
  // by focus within it (decision 1) and re-renders once. No other toast renders.
  it('renders only the toast a hotkey press focuses, which focus now holds (P-16, P-20)', () => {
    const { commits } = mountWithToasts();
    const before = commits();
    act(() => {
      fireEvent.keyDown(document.body, { code: 'KeyT', altKey: true });
    });
    // The newest toast at the first position in DOM order (top-right) takes focus.
    expect(document.activeElement?.tagName).toBe('LI');
    expect(document.activeElement).toHaveTextContent(/^c$/);
    expect(commits()).toBe(before + 1);
    expect(rendersSince()).toEqual({ c: 1 });
  });

  // Narrowed by P-20 S1: Escape renders only the toast it releases, which is no longer held.
  it('renders only the released toast when Escape returns focus to the recorded element', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const { commits } = mountWithToasts();
    act(() => outside.focus());
    act(() => {
      fireEvent.keyDown(outside, { code: 'KeyT', altKey: true });
    });
    const before = commits();
    rendersSince();
    act(() => {
      fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    });
    expect(document.activeElement).toBe(outside);
    expect(commits()).toBe(before + 1);
    expect(rendersSince()).toEqual({ c: 1 });
    outside.remove();
  });

  // Narrowed by P-20 S1: as above, only the released toast renders.
  it('renders only the released toast when Escape releases focus to the document (P-16, P-20)', () => {
    const { commits } = mountWithToasts();
    const item = document.querySelector('li') as HTMLLIElement;
    act(() => item.focus());
    const before = commits();
    rendersSince();
    act(() => {
      fireEvent.keyDown(item, { key: 'Escape' });
    });
    expect(document.activeElement).toBe(document.body);
    expect(commits()).toBe(before + 1);
    expect(rendersSince()).toEqual({ c: 1 });
  });

  it('re-renders no toast when the hotkey changes, or is given again as a new array (P-16)', () => {
    const { rerender } = render(<Toaster hotkey={['altKey', 'KeyT']} />);
    act(() => {
      toast('a', { id: 'a' });
      toast('x', { id: 'x', position: 'bottom-left' });
    });
    act(() => {
      entered('a');
      entered('x');
    });
    rendersSince();
    const region = document.querySelector('section') as HTMLElement;
    for (const [hotkey, shortcut] of [
      [['altKey', 'KeyT'], 'Alt+T'],
      [['ctrlKey', 'KeyY'], 'Control+Y'],
      [false, null],
      [undefined, 'Alt+T'],
    ] as const) {
      rerender(<Toaster hotkey={hotkey} />);
      // Only the region's own attribute changes.
      expect(region.getAttribute('aria-keyshortcuts')).toBe(shortcut);
      expect(rendersSince()).toEqual({});
    }
  });

  it('renders and commits nothing when announcements expire', () => {
    let commits = 0;
    render(
      <Profiler id="toaster" onRender={() => commits++}>
        <Toaster />
      </Profiler>
    );
    act(() => {
      toast('a', { id: 'a', duration: Infinity });
      toast.error('b', { id: 'b', duration: Infinity });
    });
    act(() => {
      for (const id of ['a', 'b']) entered(id);
    });
    const regions = [...document.querySelectorAll('section > [aria-live]')];
    expect(regions.map(region => region.childNodes.length)).toEqual([1, 1]);
    rendersSince();
    const before = commits;
    act(() => {
      vi.advanceTimersByTime(ANNOUNCEMENT_RETENTION_MS);
    });
    expect(regions.map(region => region.childNodes.length)).toEqual([0, 0]);
    expect(rendersSince()).toEqual({});
    expect(commits).toBe(before);
  });

  it('re-renders, on a close label change, only the toasts that show a close button', () => {
    const { rerender } = render(<Toaster labels={{ close: 'Fermer' }} />);
    act(() => {
      toast('a', { id: 'a' });
      toast('b', { id: 'b', closeButton: false });
      toast.custom('custom', { id: 'custom' });
      toast.custom('custom on', { id: 'custom-on', closeButton: true });
    });
    rendersSince();

    rerender(<Toaster labels={{ close: 'Schließen' }} />);
    expect(rendersSince()).toEqual({ a: 1, 'custom-on': 1 });
  });
});
