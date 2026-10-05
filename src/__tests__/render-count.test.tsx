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

  it('renders nothing for timer and pause changes, which the snapshot does not carry', () => {
    const { commits } = mountWithToasts();
    const snapshot = getSnapshot();
    const before = commits();
    act(() => {
      setGlobalPause('window-blur', true);
      setStackPause('top-right', true);
      setToastPause('a', 'focus-within', true);
      setGlobalPause('window-blur', false);
    });
    expect(getSnapshot()).toBe(snapshot);
    expect(commits()).toBe(before);
    expect(rendersSince()).toEqual({});
  });

  it('renders nothing more when the dismissed toast held focus, wherever focus moves (P-16)', () => {
    const { commits } = mountWithToasts();
    const item = (id: string) =>
      [...document.querySelectorAll('li')].find(li => li.textContent?.includes(id)) as HTMLElement;
    const close = (id: string) => item(id).querySelector('button') as HTMLButtonElement;

    // Unfocused, for comparison.
    let before = commits();
    act(() => dismiss('c'));
    expect(rendersSince()).toEqual({ c: 1 });
    expect(commits()).toBe(before + 1);

    // Focused: restoration moves focus to a's close button, rendering nothing itself.
    act(() => close('b').focus());
    before = commits();
    act(() => dismiss('b'));
    expect(document.activeElement).toBe(close('a'));
    expect(rendersSince()).toEqual({ b: 1 });
    expect(commits()).toBe(before + 1);

    // To the region: the last toast at bottom-left, with every other toast exiting.
    act(() => dismiss('a'));
    rendersSince();
    act(() => close('x').focus());
    before = commits();
    act(() => dismiss('x'));
    expect(document.activeElement).toBe(document.querySelector('section'));
    expect(rendersSince()).toEqual({ x: 1 });
    expect(commits()).toBe(before + 1);
  });

  it('renders nothing for the DOM events that pause toasts (P-15)', () => {
    const { commits } = mountWithToasts();
    const snapshot = getSnapshot();
    const before = commits();
    const list = document.querySelector('ol[data-position="top-right"]') as HTMLOListElement;
    const close = (id: string) =>
      [...list.querySelectorAll('li')]
        .find(item => item.textContent?.includes(id))
        ?.querySelector('button') as HTMLButtonElement;
    const hidden = vi.spyOn(document, 'hidden', 'get');
    act(() => {
      fireEvent.pointerEnter(list);
      close('a').focus();
      close('b').focus();
      fireEvent.blur(window);
      fireEvent.focus(window);
      hidden.mockReturnValue(true);
      fireEvent(document, new Event('visibilitychange'));
      hidden.mockReturnValue(false);
      fireEvent(document, new Event('visibilitychange'));
    });
    // The events reached the store: focus is inside b.
    expect(inspectRecords().find(record => record.id === 'b')?.pausedBy).toEqual(['focus-within']);
    act(() => {
      close('b').blur();
      fireEvent.pointerLeave(list);
    });
    hidden.mockRestore();
    expect(getSnapshot()).toBe(snapshot);
    expect(commits()).toBe(before);
    expect(rendersSince()).toEqual({});
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
    rerender(<Toaster closeButton={false} progress />);
    expect(rendersSince()).toEqual({});
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

  it('renders and commits nothing for a hotkey press (P-16)', () => {
    const { commits } = mountWithToasts();
    const before = commits();
    act(() => {
      fireEvent.keyDown(document.body, { code: 'KeyT', altKey: true });
    });
    // The newest toast at the first position in DOM order (top-right) takes focus.
    expect(document.activeElement?.tagName).toBe('LI');
    expect(document.activeElement).toHaveTextContent(/^c$/);
    expect(commits()).toBe(before);
    expect(rendersSince()).toEqual({});
  });

  it('renders and commits nothing when Escape returns focus to the recorded element (P-16)', () => {
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
    expect(commits()).toBe(before);
    expect(rendersSince()).toEqual({});
    outside.remove();
  });

  it('renders and commits nothing when Escape releases focus to the document (P-16)', () => {
    const { commits } = mountWithToasts();
    const item = document.querySelector('li') as HTMLLIElement;
    act(() => item.focus());
    const before = commits();
    rendersSince();
    act(() => {
      fireEvent.keyDown(item, { key: 'Escape' });
    });
    expect(document.activeElement).toBe(document.body);
    expect(commits()).toBe(before);
    expect(rendersSince()).toEqual({});
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
