// Swipe drag and cancel on the real toast root (§19, P-21 S2). jsdom has Pointer Events but no
// pointer capture, layout or CSS transitions, so capture is stubbed on each root, and the computed
// style is stubbed where a test needs a snap-back time or a visual offset. Successful dismissal is
// S3's: here every release springs back.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Profiler, StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast, type ToastOptions } from '../index';
import { dismiss, inspectRecords, resetStore, setStackPause, subscribe } from '../store/store';
import { SWIPE_OPACITY, SWIPE_X, SWIPE_Y, SWIPING } from '../react/useSwipe';

const inToasts = { ignore: 'script, style, [aria-live] *' };
const itemOf = (text: string) => screen.getByText(text, inToasts).closest('li') as HTMLLIElement;
const recordOf = (id = 't') => inspectRecords().find(record => record.id === id);
const pausedBy = (id = 't') => recordOf(id)?.pausedBy ?? [];
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

interface PointerInit {
  readonly id?: number;
  readonly x?: number;
  readonly y?: number;
  readonly type?: string;
}

function pointer(
  target: Element,
  kind: string,
  { id = 1, x = 0, y = 0, type = 'touch' }: PointerInit = {}
) {
  act(() => {
    fireEvent(
      target,
      new PointerEvent(kind, {
        bubbles: true,
        cancelable: true,
        pointerId: id,
        pointerType: type,
        clientX: x,
        clientY: y,
      })
    );
  });
}

/** Pointer capture as a browser keeps it, on one root, since jsdom has none. */
function stubCapture(root: HTMLElement) {
  const held = new Set<number>();
  const set = vi.fn((id: number) => {
    held.add(id);
  });
  const release = vi.fn((id: number) => {
    held.delete(id);
  });
  Object.assign(root, {
    setPointerCapture: set,
    releasePointerCapture: release,
    hasPointerCapture: (id: number) => held.has(id),
  });
  return { held, set, release };
}

/** A computed style for the root: a visual offset and a snap-back time jsdom cannot resolve. */
function stubStyle(root: HTMLElement, { transform = 'none', transition = '0s' } = {}) {
  const real = window.getComputedStyle.bind(window);
  return vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    if (element !== root) return real(element, pseudo);
    return {
      transform,
      transitionDuration: transition,
      transitionDelay: '0s',
      animationName: 'none',
      animationDuration: '0s',
      animationDelay: '0s',
    } as CSSStyleDeclaration;
  });
}

const swipeState = (root: HTMLElement) => ({
  swiping: root.getAttribute(SWIPING),
  x: root.style.getPropertyValue(SWIPE_X),
  y: root.style.getPropertyValue(SWIPE_Y),
  opacity: root.style.getPropertyValue(SWIPE_OPACITY),
});
const REST = { swiping: null, x: '', y: '', opacity: '' };

function show(
  options: ToastOptions = {},
  { content = 'Saved' as ReactNode, wrap = (node: ReactNode) => node, custom = false } = {}
) {
  let commits = 0;
  const view = render(
    wrap(
      <Profiler id="toaster" onRender={() => commits++}>
        <Toaster />
      </Profiler>
    )
  );
  act(() => {
    if (custom) toast.custom(content, { id: 't', duration: Infinity });
    else toast(content, { id: 't', duration: Infinity, ...options });
  });
  advance(0);
  expect(recordOf()?.phase).toBe('visible');
  const root = (
    custom ? document.querySelector('.ret-toast--custom') : itemOf('Saved')
  ) as HTMLLIElement;
  Object.defineProperty(root, 'offsetWidth', { configurable: true, value: 300 });
  return { root, capture: stubCapture(root), commits: () => commits, view };
}

/** Puts pointer 1 down at the origin and moves it to `x`, activating once |x| ≥ 10. */
function dragTo(target: Element, x: number, init: PointerInit = {}) {
  pointer(target, 'pointerdown', { ...init, x: 0, y: 0 });
  pointer(target, 'pointermove', { ...init, x: Math.sign(x) * 10, y: 0 });
  pointer(target, 'pointermove', { ...init, x, y: 0 });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('pending candidates', () => {
  it('a pointerdown only creates a candidate: no capture, pause, state or store change', () => {
    const { root, capture } = show();
    const notify = vi.fn();
    const unsubscribe = subscribe(notify);
    pointer(root, 'pointerdown');
    expect(swipeState(root)).toEqual(REST);
    expect(capture.set).not.toHaveBeenCalled();
    expect(pausedBy()).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('ignores a mouse completely', () => {
    const { root, capture } = show();
    dragTo(root, 200, { type: 'mouse' });
    pointer(root, 'pointerup', { type: 'mouse', x: 200 });
    expect(swipeState(root)).toEqual(REST);
    expect(capture.set).not.toHaveBeenCalled();
    expect(pausedBy()).toEqual([]);
  });

  it('accepts pen as well as touch', () => {
    for (const type of ['pen', 'touch']) {
      const { root } = show();
      dragTo(root, 40, { type });
      expect(swipeState(root).swiping).toBe('drag');
      cleanup();
      resetStore();
    }
  });

  it('stays pending below the horizontal slop and activates at it', () => {
    const { root } = show();
    pointer(root, 'pointerdown');
    pointer(root, 'pointermove', { x: 9.99, y: 0 });
    expect(swipeState(root)).toEqual(REST);
    pointer(root, 'pointermove', { x: 9, y: 5 }); // travel ≥ 10, but |dx| < 10: still pending
    expect(swipeState(root)).toEqual(REST);
    pointer(root, 'pointermove', { x: 10, y: 0 });
    expect(swipeState(root).swiping).toBe('drag');
  });

  it('keeps a forbidden direction pending, then activates once the allowed side is reached', () => {
    const { root, capture } = show(); // top-right: right only
    pointer(root, 'pointerdown');
    pointer(root, 'pointermove', { x: -50 });
    expect(swipeState(root)).toEqual(REST);
    expect(capture.set).not.toHaveBeenCalled();
    expect(pausedBy()).toEqual([]);
    // Still measured from the original origin: +5 is not yet the slop.
    pointer(root, 'pointermove', { x: 5 });
    expect(swipeState(root)).toEqual(REST);
    pointer(root, 'pointermove', { x: 10 });
    expect(swipeState(root).swiping).toBe('drag');
    expect(capture.set).toHaveBeenCalledWith(1);
  });

  it('abandons a vertical candidate for good: the same pointer never becomes a swipe', () => {
    const { root, capture } = show();
    pointer(root, 'pointerdown');
    pointer(root, 'pointermove', { x: 0, y: 15 });
    pointer(root, 'pointermove', { x: 80, y: 15 });
    pointer(root, 'pointermove', { x: 200, y: 0 });
    expect(swipeState(root)).toEqual(REST);
    expect(capture.set).not.toHaveBeenCalled();
  });

  it('never starts from a pointer that went down before the toast was visible', () => {
    render(<Toaster />);
    act(() => {
      toast('Saved', { id: 't', duration: Infinity });
    });
    const root = itemOf('Saved');
    stubCapture(root);
    expect(recordOf()?.phase).toBe('entering');
    pointer(root, 'pointerdown');
    advance(0);
    expect(recordOf()?.phase).toBe('visible');
    pointer(root, 'pointermove', { x: 60 });
    expect(swipeState(root)).toEqual(REST);
  });

  it('never starts from a pointer that went down while text was selected, even once cleared', () => {
    const { root } = show({ description: 'Synced to every device' });
    const range = document.createRange();
    range.selectNodeContents(screen.getByText('Synced to every device'));
    document.getSelection()?.addRange(range);
    pointer(root, 'pointerdown');
    document.getSelection()?.removeAllRanges();
    pointer(root, 'pointermove', { x: 60 });
    expect(swipeState(root)).toEqual(REST);
  });

  it('notifies nobody for a persistent toast, which has no countdown to hold', () => {
    const { root } = show({ duration: Infinity });
    const notify = vi.fn();
    const unsubscribe = subscribe(notify);
    dragTo(root, 60);
    expect(pausedBy()).toEqual(['swipe']);
    pointer(root, 'pointerup', { x: 60 });
    expect(notify).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('drops a pending candidate on pointercancel, with nothing to restore', () => {
    const { root } = show();
    pointer(root, 'pointerdown');
    pointer(root, 'pointercancel');
    pointer(root, 'pointermove', { x: 60 });
    expect(swipeState(root)).toEqual(REST);
    expect(pausedBy()).toEqual([]);
  });

  it('never starts while text in the toast is selected, but ignores a selection elsewhere', () => {
    const { root } = show({ description: 'Synced to every device' });
    const text = screen.getByText('Synced to every device').firstChild as Node;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 6);
    document.getSelection()?.addRange(range);
    dragTo(root, 60);
    expect(swipeState(root)).toEqual(REST);
    pointer(root, 'pointerup', { x: 60 });

    const outside = document.createElement('p');
    outside.textContent = 'elsewhere';
    document.body.append(outside);
    document.getSelection()?.removeAllRanges();
    const other = document.createRange();
    other.selectNodeContents(outside);
    document.getSelection()?.addRange(other);
    dragTo(root, 60);
    expect(swipeState(root).swiping).toBe('drag');
    document.getSelection()?.removeAllRanges();
  });
});

describe('protected targets (D0 decision 9)', () => {
  it('never starts from the action or close button, which keep working', () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    const { root } = show({ action: { label: 'Undo', onClick }, onDismiss });
    const action = screen.getByRole('button', { name: 'Undo' });
    const close = screen.getByRole('button', { name: 'Close notification' });
    for (const control of [action, close]) {
      dragTo(control, 80);
      expect(swipeState(root)).toEqual(REST);
      pointer(control, 'pointerup', { x: 80 });
    }
    act(() => {
      fireEvent.click(action);
    });
    expect(onClick).toHaveBeenCalledOnce();
    expect(recordOf()?.exit?.reason).toBe('action');
  });

  it('dismisses through close exactly as before', () => {
    const onDismiss = vi.fn();
    show({ onDismiss });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close notification' }));
    });
    advance(0);
    expect(onDismiss).toHaveBeenCalledWith(expect.anything(), 'close-button');
  });

  it('never dismisses on a body click', () => {
    const { root } = show();
    act(() => {
      fireEvent.click(screen.getByText('Saved', inToasts));
      fireEvent.click(root);
    });
    expect(recordOf()?.phase).toBe('visible');
  });

  it.each([
    ['a link', '<a href="#x">link</a>', 'a'],
    ['an input', '<input aria-label="field">', 'input'],
    ['a label', '<label>label</label>', 'label'],
    ['a summary', '<details><summary>more</summary></details>', 'summary'],
    ['editable content', '<div contenteditable="true">edit</div>', '[contenteditable]'],
    ['an ARIA widget', '<span role="switch" aria-checked="false">switch</span>', '[role]'],
    ['a tabindex descendant', '<span tabindex="-1">focusable</span>', '[tabindex]'],
    ['a nested control', '<div><button><b>nested</b></button></div>', 'b'],
  ])('never starts from %s in custom content', (_name, html, selector) => {
    const { root } = show(
      {},
      { custom: true, content: <div dangerouslySetInnerHTML={{ __html: html }} /> }
    );
    const target = root.querySelector(selector) as Element;
    dragTo(target, 80);
    expect(swipeState(root)).toEqual(REST);
  });

  it('swipes from the root itself and from plain custom content, despite the root tabindex', () => {
    const first = show();
    expect(first.root.tabIndex).toBe(-1);
    dragTo(first.root, 40);
    expect(swipeState(first.root).swiping).toBe('drag');
    cleanup();
    resetStore();
    const { root } = show({}, { custom: true, content: <p>Custom text</p> });
    dragTo(screen.getByText('Custom text', inToasts), 40);
    expect(swipeState(root).swiping).toBe('drag');
  });
});

describe('activation and drag', () => {
  it('captures the pointer on the root and sets the swipe pause once', () => {
    const { root, capture } = show({ duration: 5000 });
    const notify = vi.fn();
    const unsubscribe = subscribe(notify);
    dragTo(root, 60);
    for (let x = 61; x < 90; x += 1) pointer(root, 'pointermove', { x });
    expect(capture.set).toHaveBeenCalledTimes(1);
    expect(capture.held.has(1)).toBe(true);
    expect(pausedBy()).toEqual(['swipe']);
    expect(notify).toHaveBeenCalledTimes(1); // the held boundary, once
    unsubscribe();
  });

  it('starts the drag at the visual offset, re-based at activation, so nothing jumps', () => {
    const { root } = show();
    pointer(root, 'pointerdown');
    pointer(root, 'pointermove', { x: 10 });
    expect(swipeState(root)).toEqual({ swiping: 'drag', x: '0px', y: '0px', opacity: '1' });
  });

  it('freezes a visual offset part-way through a transition at activation (D2 decision 12)', () => {
    const { root } = show();
    stubStyle(root, { transform: 'matrix(1, 0, 0, 1, 12, -30)' });
    pointer(root, 'pointerdown');
    pointer(root, 'pointermove', { x: 10 });
    expect(swipeState(root)).toMatchObject({ x: '12px', y: '-30px' });
    pointer(root, 'pointermove', { x: 30 });
    expect(swipeState(root).x).toBe('32px');
  });

  it('writes the allowed offset and the D2 opacity straight to the root on every move', () => {
    const { root } = show();
    dragTo(root, 70); // 60 px past the activation point
    expect(swipeState(root)).toEqual({
      swiping: 'drag',
      x: '60px',
      y: '0px',
      opacity: String(1 - 0.7 * (60 / 240)),
    });
    pointer(root, 'pointermove', { x: 400 });
    expect(swipeState(root).x).toBe('390px');
    expect(Number(swipeState(root).opacity)).toBeCloseTo(0.3, 10);
  });

  it('clamps a move into the forbidden direction to 0, and tracks again past zero', () => {
    const { root } = show({ position: 'top-left' });
    dragTo(root, -40); // left only
    expect(swipeState(root).x).toBe('-30px');
    pointer(root, 'pointermove', { x: 50 });
    expect(swipeState(root)).toMatchObject({ x: '0px', opacity: '1' });
    pointer(root, 'pointermove', { x: -60 });
    expect(swipeState(root).x).toBe('-50px');
  });

  it('tracks both ways at a centre position', () => {
    const { root } = show({ position: 'bottom-center' });
    dragTo(root, 30);
    pointer(root, 'pointermove', { x: -50 });
    expect(swipeState(root).x).toBe('-60px');
  });

  it('renders nothing and notifies nobody while the pointer moves', () => {
    const { root, commits } = show();
    dragTo(root, 20);
    const notify = vi.fn();
    const unsubscribe = subscribe(notify);
    const before = commits();
    const records = inspectRecords();
    for (let x = 21; x <= 220; x += 2) pointer(root, 'pointermove', { x, y: x % 7 });
    expect(commits()).toBe(before);
    expect(notify).not.toHaveBeenCalled();
    expect(inspectRecords()).toEqual(records);
    unsubscribe();
  });

  it('never remounts or re-times the progress fill while the pointer moves', () => {
    render(<Toaster progress />);
    act(() => {
      toast('Saved', { id: 't', duration: 5000 });
    });
    advance(0);
    const root = itemOf('Saved');
    stubCapture(root);
    dragTo(root, 20);
    const fill = root.querySelector('.ret-toast__progress-fill');
    const timing = (fill as HTMLElement).getAttribute('style');
    expect(root).toHaveAttribute('data-paused');
    for (let x = 21; x <= 120; x += 5) pointer(root, 'pointermove', { x });
    expect(root.querySelector('.ret-toast__progress-fill')).toBe(fill);
    expect((fill as HTMLElement).getAttribute('style')).toBe(timing);
    pointer(root, 'pointerup', { x: 120 });
    expect(root).not.toHaveAttribute('data-paused');
  });
});

describe('release and cancel (S2: every release springs back)', () => {
  it('springs back even past both thresholds, and never dismisses', () => {
    const onDismiss = vi.fn();
    const onAutoClose = vi.fn();
    const { root } = show({ onDismiss, onAutoClose });
    pointer(root, 'pointerdown');
    pointer(root, 'pointermove', { x: 10 });
    pointer(root, 'pointermove', { x: 600 });
    pointer(root, 'pointerup', { x: 600 });
    advance(10_000);
    expect(recordOf()?.phase).toBe('visible');
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onAutoClose).not.toHaveBeenCalled();
    expect(swipeState(root)).toEqual(REST);
  });

  it('clears the pause at release, before the cosmetic snap-back finishes', () => {
    const { root, capture } = show();
    stubStyle(root, { transition: '0.2s, 0.2s' });
    dragTo(root, 60);
    pointer(root, 'pointerup', { x: 60 });
    expect(pausedBy()).toEqual([]);
    expect(capture.held.size).toBe(0);
    expect(swipeState(root)).toEqual({ swiping: 'settle', x: '', y: '', opacity: '' });
    advance(249);
    expect(swipeState(root).swiping).toBe('settle');
    advance(1);
    expect(swipeState(root)).toEqual(REST);
    expect(root).not.toHaveAttribute('style');
  });

  it("ends the snap-back on the root's own transform transition, ignoring the rest", () => {
    const { root } = show();
    stubStyle(root, { transition: '0.2s' });
    dragTo(root, 60);
    pointer(root, 'pointerup', { x: 60 });
    const transitionEnd = (target: Element, propertyName: string) =>
      act(() => {
        const event = new Event('transitionend', { bubbles: true });
        Object.assign(event, { propertyName });
        target.dispatchEvent(event);
      });
    transitionEnd(root.firstElementChild as Element, 'transform');
    transitionEnd(root, 'opacity');
    expect(swipeState(root).swiping).toBe('settle');
    transitionEnd(root, 'transform');
    expect(swipeState(root)).toEqual(REST);
  });

  it('is at rest at once when nothing transitions (reduced motion, 0s)', () => {
    const { root } = show();
    stubStyle(root, { transition: '0s' });
    dragTo(root, 60);
    pointer(root, 'pointerup', { x: 60 });
    expect(swipeState(root)).toEqual(REST);
  });

  it('leaves every other pause reason in place', () => {
    const { root } = show({ duration: 5000 });
    act(() => setStackPause('top-right', true));
    dragTo(root, 60);
    expect(pausedBy()).toEqual(['swipe']);
    pointer(root, 'pointerup', { x: 60 });
    expect(pausedBy()).toEqual([]);
    expect(root).toHaveAttribute('data-paused'); // hover still holds the toast
    act(() => setStackPause('top-right', false));
    expect(root).not.toHaveAttribute('data-paused');
  });

  it('restores on pointercancel while active', () => {
    const { root, capture } = show();
    dragTo(root, 60);
    pointer(root, 'pointercancel', { x: 60 });
    expect(swipeState(root)).toEqual(REST);
    expect(pausedBy()).toEqual([]);
    expect(capture.held.size).toBe(0);
  });

  it('can start a new gesture after one ends', () => {
    const { root } = show();
    dragTo(root, 60);
    pointer(root, 'pointerup', { x: 60 });
    dragTo(root, 30, { id: 2 });
    expect(swipeState(root)).toMatchObject({ swiping: 'drag', x: '20px' });
  });
});

describe('lost capture (D2 decisions 13 and 14)', () => {
  const lost = (target: Element, id = 1) =>
    act(() => {
      target.dispatchEvent(
        new PointerEvent('lostpointercapture', { bubbles: true, pointerId: id })
      );
    });

  it("ignores a descendant's bubbled loss, as touch's implicit capture moves to the root", () => {
    const { root } = show();
    dragTo(root.querySelector('.ret-toast__content') as Element, 60);
    lost(root.querySelector('.ret-toast__title') as Element);
    expect(swipeState(root)).toMatchObject({ swiping: 'drag', x: '50px' });
    expect(pausedBy()).toEqual(['swipe']);
  });

  it("cancels on the root's own loss of the active pointer", () => {
    const { root } = show();
    dragTo(root, 60);
    lost(root);
    expect(swipeState(root)).toEqual(REST);
    expect(pausedBy()).toEqual([]);
  });

  it('ignores the loss of another pointer', () => {
    const { root } = show();
    dragTo(root, 60);
    lost(root, 7);
    expect(swipeState(root).swiping).toBe('drag');
  });

  it('ignores the loss that follows a handled release: no second cancel or store change', () => {
    const { root } = show();
    stubStyle(root, { transition: '0.2s' });
    dragTo(root, 60);
    pointer(root, 'pointerup', { x: 60 });
    const notify = vi.fn();
    const unsubscribe = subscribe(notify);
    const settling = swipeState(root);
    lost(root);
    expect(swipeState(root)).toEqual(settling);
    expect(notify).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('a second pointer (D0 decision 10)', () => {
  it('cannot take, move, end or unpause the first pointer’s gesture', () => {
    const { root, capture } = show();
    dragTo(root, 60);
    pointer(root, 'pointerdown', { id: 2, x: 100 });
    pointer(root, 'pointermove', { id: 2, x: 300 });
    pointer(root, 'pointerup', { id: 2, x: 300 });
    pointer(root, 'pointercancel', { id: 2 });
    expect(swipeState(root)).toMatchObject({ swiping: 'drag', x: '50px' });
    expect(capture.set).toHaveBeenCalledTimes(1);
    expect(capture.set).toHaveBeenCalledWith(1);
    expect(pausedBy()).toEqual(['swipe']);
    pointer(root, 'pointermove', { x: 80 });
    expect(swipeState(root).x).toBe('70px');
  });

  it('cannot take a pending candidate either', () => {
    const { root, capture } = show();
    pointer(root, 'pointerdown');
    pointer(root, 'pointerdown', { id: 2 });
    pointer(root, 'pointermove', { id: 2, x: 80 });
    expect(swipeState(root)).toEqual(REST);
    pointer(root, 'pointermove', { x: 20 });
    expect(capture.set).toHaveBeenCalledWith(1);
  });
});

describe('a lifecycle change from elsewhere (D0 decision 11)', () => {
  it('drops a pending candidate when the toast leaves visible', () => {
    const { root, capture } = show();
    pointer(root, 'pointerdown');
    act(() => dismiss('t'));
    pointer(root, 'pointermove', { x: 80 });
    expect(swipeState(root)).toEqual(REST);
    expect(capture.set).not.toHaveBeenCalled();
    expect(pausedBy()).toEqual([]);
  });

  it('gives up an active drag but keeps its offset as the start of the exit, with its own reason', () => {
    const onDismiss = vi.fn();
    const { root, capture } = show({ onDismiss });
    dragTo(root, 60);
    act(() => dismiss('t'));
    expect(recordOf()?.phase).toBe('exiting');
    expect(pausedBy()).toEqual([]);
    expect(capture.held.size).toBe(0);
    expect(swipeState(root)).toMatchObject({ swiping: 'drag', x: '50px' }); // no snap-back
    pointer(root, 'pointermove', { x: 200 });
    expect(swipeState(root).x).toBe('50px'); // no longer owned
    advance(0);
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledWith(expect.anything(), 'programmatic');
  });

  it('clears a kept offset when the exiting toast is revived', () => {
    const { root } = show();
    dragTo(root, 60);
    act(() => dismiss('t'));
    act(() => {
      toast('Saved', { id: 't', duration: Infinity });
    });
    expect(recordOf()?.phase).toBe('entering');
    expect(swipeState(root)).toEqual(REST);
  });
});

describe('cleanup', () => {
  it('clears capture, pause, state and listeners when the toast unmounts mid-drag', () => {
    const { root, capture, view } = show();
    dragTo(root, 60);
    view.unmount();
    expect(capture.release).toHaveBeenCalledWith(1);
    expect(swipeState(root)).toEqual(REST);
    expect(pausedBy()).toEqual([]);
    pointer(root, 'pointermove', { x: 120 });
    expect(swipeState(root)).toEqual(REST);
  });

  it('survives capture APIs that throw, and still drags and cleans up', () => {
    const { root, view } = show();
    Object.assign(root, {
      setPointerCapture: () => {
        throw new DOMException('no active pointer', 'NotFoundError');
      },
      releasePointerCapture: () => {
        throw new DOMException('gone', 'NotFoundError');
      },
      hasPointerCapture: () => true,
    });
    dragTo(root, 60);
    expect(swipeState(root).swiping).toBe('drag');
    expect(() => view.unmount()).not.toThrow();
    expect(swipeState(root)).toEqual(REST);
  });

  it('works without any capture API, as in jsdom', () => {
    const { root } = show();
    Object.assign(root, {
      setPointerCapture: undefined,
      releasePointerCapture: undefined,
      hasPointerCapture: undefined,
    });
    dragTo(root, 60);
    pointer(root, 'pointerup', { x: 60 });
    expect(swipeState(root)).toEqual(REST);
    expect(pausedBy()).toEqual([]);
  });

  it('leaves no duplicate listener or stale state under StrictMode', () => {
    const { root, capture } = show(
      { duration: 5000 },
      { wrap: node => <StrictMode>{node}</StrictMode> }
    );
    const notify = vi.fn();
    const unsubscribe = subscribe(notify);
    dragTo(root, 60);
    expect(capture.set).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    pointer(root, 'pointerup', { x: 60 });
    expect(notify).toHaveBeenCalledTimes(2);
    expect(swipeState(root)).toEqual(REST);
    unsubscribe();
  });
});
