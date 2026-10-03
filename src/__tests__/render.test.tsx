// <Toaster /> rendering, structure (P-14): subscription, ownership, the region and its position
// lists, visual order, the toast item seam, SSR shell and hydration. The clock is held, so the
// lifecycle fallbacks run only when a test advances it, and tests drive `entered` and `exited`
// themselves when needed. Toast chrome and the fallbacks are covered in toast-item.test.tsx.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Toaster, toast } from '../index';
import { dismiss, entered, exited, getSnapshot, inspectRecords } from '../store/store';
import type { ToastPosition } from '../types';

/** Lets the deferred (microtask) Toaster detach run, inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
  });
}

const regions = () => document.querySelectorAll('section');
const lists = () =>
  [...document.querySelectorAll('ol')].map(list => list.getAttribute('data-position'));
const itemsAt = (position: ToastPosition) =>
  [...document.querySelectorAll(`ol[data-position="${position}"] > li`)].map(
    item => item.textContent
  );
const allItems = () => [...document.querySelectorAll('li')].map(item => item.textContent);
const phaseOf = (id: string) => inspectRecords().find(record => record.id === id)?.phase;

/** Creates a toast inside act, so the subscribed Toaster renders it. */
function show(content: string, position?: ToastPosition, id = content): void {
  act(() => {
    toast(content, { id, ...(position && { position }) });
  });
}

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  vi.useFakeTimers();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('the region (§12, §17.2)', () => {
  it('renders an empty region before the first toast, named Notifications', () => {
    render(<Toaster />);
    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region.tagName).toBe('SECTION');
    expect(region).toHaveClass('ret-toaster', { exact: true });
    expect(region).toBeEmptyDOMElement();
  });

  it("adds the Toaster's className and exposes its theme, defaulting to system", () => {
    const { rerender } = render(<Toaster className="mine extra" theme="dark" />);
    const region = screen.getByRole('region');
    expect(region).toHaveClass('ret-toaster mine extra', { exact: true });
    expect(region).toHaveAttribute('data-theme', 'dark');
    rerender(<Toaster />);
    expect(region).toHaveAttribute('data-theme', 'system');
    rerender(<Toaster theme={'blue' as never} />);
    expect(region).toHaveAttribute('data-theme', 'system');
  });

  it('renders one <ol> per position that has toasts, and none for empty positions', () => {
    render(<Toaster maxVisible={10} />);
    show('a', 'bottom-left');
    show('b', 'top-right');
    show('c', 'top-right');
    expect(lists()).toEqual(['top-right', 'bottom-left']);
    expect(document.querySelectorAll('ol.ret-toaster__list')).toHaveLength(2);

    act(() => {
      dismiss('a');
      exited('a');
    });
    expect(lists()).toEqual(['top-right']);
  });

  it('renders the lists in a fixed position order, each toast exactly once', () => {
    render(<Toaster />);
    const positions: ToastPosition[] = [
      'bottom-right',
      'top-left',
      'bottom-center',
      'top-right',
      'bottom-left',
      'top-center',
    ];
    for (const position of positions) show(position, position);
    expect(lists()).toEqual([
      'top-left',
      'top-center',
      'top-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ]);
    for (const position of positions) expect(itemsAt(position)).toEqual([position]);
    expect(allItems()).toHaveLength(6);
  });

  it('uses native list semantics, with no alert role and no live region', () => {
    render(<Toaster />);
    show('a', 'top-left');
    show('b', 'bottom-right');
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(document.querySelectorAll('[role="alert"], [role="status"], [aria-live]')).toHaveLength(
      0
    );
  });
});

describe('visual order (§12, D-15)', () => {
  it('D-15: puts the newest toast nearest the anchored edge, in DOM order', () => {
    render(<Toaster />);
    for (const id of ['A', 'B', 'C']) show(`top ${id}`, 'top-center');
    for (const id of ['A', 'B', 'C']) show(`bottom ${id}`, 'bottom-right');
    expect(itemsAt('top-center')).toEqual(['top C', 'top B', 'top A']);
    expect(itemsAt('bottom-right')).toEqual(['bottom A', 'bottom B', 'bottom C']);
  });

  it('leaves the store snapshot in seq order', () => {
    render(<Toaster />);
    for (const id of ['A', 'B', 'C']) show(id, 'top-left');
    expect(getSnapshot().byPosition['top-left'].map(view => view.id)).toEqual(['A', 'B', 'C']);
    expect(itemsAt('top-left')).toEqual(['C', 'B', 'A']);
  });
});

describe('the toast item seam (§7, §14, §21)', () => {
  it('renders the content in an <li> with phase, position, type and className hooks', () => {
    render(<Toaster />);
    act(() => {
      toast.success('Saved', { id: 's', position: 'bottom-left', className: 'mine' });
      toast.custom(<strong>Custom</strong>, { id: 'c' });
    });
    const saved = screen.getByText('Saved').closest('li');
    expect(saved).toHaveClass('ret-toast ret-toast--success mine', { exact: true });
    expect(saved).toHaveAttribute('data-phase', 'entering');
    expect(saved).toHaveAttribute('data-position', 'bottom-left');
    expect(screen.getByText('Custom').closest('li')).toHaveClass('ret-toast ret-toast--custom', {
      exact: true,
    });
  });

  it('keeps the toast element on replacement, and re-keys its content by revision', () => {
    render(<Toaster />);
    show('first', 'top-right', 't');
    const item = document.querySelector('li');
    const content = item?.querySelector('.ret-toast__content');
    const close = item?.querySelector('.ret-toast__close');
    show('second', 'top-right', 't');
    expect(document.querySelector('li')).toBe(item);
    expect(item?.querySelector('.ret-toast__content')).not.toBe(content);
    expect(item?.querySelector('.ret-toast__close')).toBe(close);
    expect(item).toHaveTextContent('second');
  });

  it('renders entering, visible and exiting toasts in place', async () => {
    render(<Toaster />);
    show('t');
    await settle();
    const item = screen.getByText('t').closest('li');
    expect(item).toHaveAttribute('data-phase', 'entering');
    expect(phaseOf('t')).toBe('entering');

    act(() => entered('t'));
    expect(item).toHaveAttribute('data-phase', 'visible');
    act(() => dismiss('t'));
    expect(item).toHaveAttribute('data-phase', 'exiting');
    await settle();
    expect(phaseOf('t')).toBe('exiting');
    expect(document.querySelector('li')).toBe(item);
  });

  it('D-17: clicking the toast body does not dismiss it', () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    act(() => {
      toast('Body', { id: 'b', onDismiss });
    });
    act(() => entered('b'));
    fireEvent.click(screen.getByText('Body'));
    fireEvent.click(screen.getByText('Body').closest('li') as HTMLElement);
    expect(phaseOf('b')).toBe('visible');
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('toasts created before the Toaster mounts (AC-API-3)', () => {
  it('renders them once, at their resolved positions, entering', async () => {
    toast('early', { id: 'early' });
    toast('placed', { position: 'bottom-left' });
    render(<Toaster />);
    await settle();
    expect(itemsAt('top-right')).toEqual(['early']);
    expect(itemsAt('bottom-left')).toEqual(['placed']);
    expect(allItems()).toHaveLength(2);
    expect(phaseOf('early')).toBe('entering');
  });
});

describe('Toaster position and duration defaults (§6.3, §6.5)', () => {
  const recordOf = (id: string) => inspectRecords().find(record => record.id === id);

  it('gives a toast created before mounting the Toaster position and duration', async () => {
    toast('early', { id: 'early' });
    render(<Toaster position="bottom-center" duration={8000} />);
    await settle();
    expect(itemsAt('bottom-center')).toEqual(['early']);
    expect(lists()).toEqual(['bottom-center']);
    expect(allItems()).toHaveLength(1);
    expect(recordOf('early')?.timer.duration).toBe(8000);
  });

  it('gives a toast created after mounting the Toaster position and duration', () => {
    render(<Toaster position="bottom-left" duration={8000} />);
    act(() => {
      toast('later', { id: 'later' });
    });
    expect(itemsAt('bottom-left')).toEqual(['later']);
    expect(recordOf('later')?.timer.duration).toBe(8000);
  });

  it("lets a toast's own position and duration win", () => {
    render(<Toaster position="bottom-left" duration={8000} />);
    act(() => {
      toast('own', { id: 'own', position: 'top-center', duration: 1500 });
    });
    expect(itemsAt('top-center')).toEqual(['own']);
    expect(recordOf('own')?.timer.duration).toBe(1500);
  });

  it('applies changed props to later toasts only, without detaching', async () => {
    const { rerender } = render(<Toaster position="top-left" duration={1000} />);
    show('A');
    act(() => entered('A'));
    const owner = getSnapshot().active;

    rerender(<Toaster position="bottom-right" duration={9000} />);
    await settle();
    show('B');

    expect(getSnapshot().active).toBe(owner);
    expect(regions()).toHaveLength(1);
    expect(itemsAt('top-left')).toEqual(['A']);
    expect(recordOf('A')).toMatchObject({ phase: 'visible', timer: { duration: 1000 } });
    expect(itemsAt('bottom-right')).toEqual(['B']);
    expect(recordOf('B')?.timer.duration).toBe(9000);
  });

  it('leaves invalid runtime values to the store, which falls back to its defaults', () => {
    render(<Toaster position={'middle' as never} duration={NaN} />);
    show('t');
    expect(itemsAt('top-right')).toEqual(['t']);
    expect(recordOf('t')?.timer.duration).toBe(5000);
  });
});

describe('ownership (§8.5, AC-NT-5)', () => {
  const extraToasterWarnings = () =>
    warn.mock.calls.filter(([message]) => String(message).includes('More than one <Toaster />'));

  it('renders one region and each toast once with two Toasters; the waiting one renders null', async () => {
    toast('t');
    const { container } = render(
      <>
        <div data-testid="first">
          <Toaster key="first" />
        </div>
        <div data-testid="second">
          <Toaster key="second" />
        </div>
      </>
    );
    await settle();
    expect(regions()).toHaveLength(1);
    expect(screen.getByTestId('first').querySelector('section')).not.toBeNull();
    expect(screen.getByTestId('second')).toBeEmptyDOMElement();
    expect(allItems()).toEqual(['t']);
    expect(container.querySelectorAll('li')).toHaveLength(1);
  });

  it('a Toaster mounted while another is active renders nothing from its first render', () => {
    render(<Toaster />);
    show('t');
    const second = render(<Toaster />);
    expect(second.container).toBeEmptyDOMElement();
    expect(regions()).toHaveLength(1);
    expect(allItems()).toEqual(['t']);
  });

  it('hands over on unmount: nothing renders twice, then the new owner renders the toasts', async () => {
    const tree = (both: boolean) => (
      <>
        {both && <Toaster key="first" />}
        <Toaster key="second" />
      </>
    );
    const { rerender } = render(tree(true));
    show('t');
    act(() => entered('t'));
    const before = getSnapshot().active;

    rerender(tree(false));
    // The detach is deferred: the departing Toaster still owns the store, so nothing renders.
    expect(getSnapshot().active).toBe(before);
    expect(regions()).toHaveLength(0);

    await settle();
    expect(getSnapshot().active).not.toBe(before);
    expect(regions()).toHaveLength(1);
    expect(allItems()).toEqual(['t']);
    expect(phaseOf('t')).toBe('entering');
  });

  it('leaves the active Toaster rendering when a waiting one unmounts', async () => {
    const tree = (both: boolean) => (
      <>
        <Toaster key="first" />
        {both && <Toaster key="second" />}
      </>
    );
    const { rerender } = render(tree(true));
    show('t');
    act(() => entered('t'));
    const owner = getSnapshot().active;
    const item = document.querySelector('li');

    rerender(tree(false));
    await settle();
    expect(getSnapshot().active).toBe(owner);
    expect(regions()).toHaveLength(1);
    expect(document.querySelector('li')).toBe(item);
    expect(phaseOf('t')).toBe('visible');
    expect(extraToasterWarnings()).toHaveLength(1);
  });

  it('renders one region under StrictMode, without re-queueing or warnings', async () => {
    toast('t', { id: 't' });
    render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    await settle();
    expect(regions()).toHaveLength(1);
    expect(allItems()).toEqual(['t']);
    expect(phaseOf('t')).toBe('entering');

    act(() => entered('t'));
    await settle();
    expect(phaseOf('t')).toBe('visible');
    expect(warn).not.toHaveBeenCalled();
  });

  it('renders one region per store under StrictMode with two Toasters', async () => {
    toast('t');
    render(
      <StrictMode>
        <Toaster key="first" />
        <Toaster key="second" />
      </StrictMode>
    );
    await settle();
    expect(regions()).toHaveLength(1);
    expect(allItems()).toEqual(['t']);
    expect(extraToasterWarnings()).toHaveLength(1);
  });
});

describe('hydration (§23)', () => {
  it('hydrates the server shell without a mismatch, then renders client toasts', async () => {
    const html = renderToString(<Toaster />);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    // A client-side toast created before hydration: queued, so the snapshot is still empty.
    toast('client');
    const error = vi.spyOn(console, 'error');

    const root = await act(async () => {
      const hydrated = hydrateRoot(container, <Toaster />);
      await Promise.resolve();
      return hydrated;
    });
    await settle();
    expect(error).not.toHaveBeenCalled();
    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(itemsAt('top-right')).toEqual(['client']);
    expect(container.querySelector('li .ret-toast__close')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
