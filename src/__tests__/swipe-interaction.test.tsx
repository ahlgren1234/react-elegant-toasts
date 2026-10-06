// Swipe on the real toast root (§19, P-21 S2 and S3): drag, cancel, commit and release. jsdom has
// Pointer Events but no pointer capture, layout, CSS transitions or animations, so capture is
// stubbed on each root, and the computed style is stubbed where a test needs a snap-back time, a
// visual offset or an exit animation. Event times are explicit, so velocities are exact. The
// composition with stack repositioning (P-19) is `swipe-composition.test.tsx`'s.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Profiler, StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast, type ToastOptions } from '../index';
import { dismiss, inspectRecords, resetStore, setStackPause, subscribe } from '../store/store';
import { SWIPE_OPACITY, SWIPE_TRAVEL, SWIPE_X, SWIPE_Y, SWIPING } from '../react/swipe';

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
  /** The event's `timeStamp`, in ms. */
  readonly time?: number;
}

function pointer(
  target: Element,
  kind: string,
  { id = 1, x = 0, y = 0, type = 'touch', time = 0 }: PointerInit = {}
) {
  const event = new PointerEvent(kind, {
    bubbles: true,
    cancelable: true,
    pointerId: id,
    pointerType: type,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, 'timeStamp', { value: time });
  act(() => {
    fireEvent(target, event);
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

/**
 * A computed style for the root: a visual offset, a snap-back time and an exit animation jsdom
 * cannot resolve.
 */
function stubStyle(
  root: HTMLElement,
  { transform = 'none', transition = '0s', animation = 'none', animationDuration = '0s' } = {}
) {
  const real = window.getComputedStyle.bind(window);
  return vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    if (element !== root) return real(element, pseudo);
    const values: Record<string, string> = {
      transform,
      transitionDuration: transition,
      transitionDelay: '0s',
      animationName: animation,
      animationDuration,
      animationDelay: '0s',
    };
    const getPropertyValue = (property: string) =>
      values[property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] ?? '';
    return { ...values, getPropertyValue } as unknown as CSSStyleDeclaration;
  });
}

const swipeState = (root: HTMLElement) => ({
  swiping: root.getAttribute(SWIPING),
  x: root.style.getPropertyValue(SWIPE_X),
  y: root.style.getPropertyValue(SWIPE_Y),
  opacity: root.style.getPropertyValue(SWIPE_OPACITY),
  travel: root.style.getPropertyValue(SWIPE_TRAVEL),
});
const REST = { swiping: null, x: '', y: '', opacity: '', travel: '' };

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
    expect(swipeState(root)).toEqual({
      swiping: 'drag',
      x: '0px',
      y: '0px',
      opacity: '1',
      travel: '',
    });
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
      travel: '',
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

describe('release and cancel below both thresholds', () => {
  it('springs back from a slow release short of the distance, and never dismisses', () => {
    const onDismiss = vi.fn();
    const onAutoClose = vi.fn();
    const { root } = show({ onDismiss, onAutoClose });
    pointer(root, 'pointerdown');
    pointer(root, 'pointermove', { x: 10 });
    pointer(root, 'pointermove', { x: 109, time: 1000 }); // 99 px of a 100 px threshold
    pointer(root, 'pointerup', { x: 109, time: 2000 });
    advance(10_000);
    expect(recordOf()?.phase).toBe('visible');
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onAutoClose).not.toHaveBeenCalled();
    expect(swipeState(root)).toEqual(REST);
  });

  it('never commits from a pointercancel or a lost capture, however far the drag went', () => {
    for (const end of ['pointercancel', 'lostpointercapture']) {
      const { root } = show();
      dragTo(root, 300);
      if (end === 'pointercancel') pointer(root, 'pointercancel', { x: 300 });
      else
        act(() => {
          root.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1 }));
        });
      expect(recordOf()?.phase).toBe('visible');
      expect(swipeState(root)).toEqual(REST);
      cleanup();
      resetStore();
    }
  });

  it('clears the pause at release, before the cosmetic snap-back finishes', () => {
    const { root, capture } = show();
    stubStyle(root, { transition: '0.2s, 0.2s' });
    dragTo(root, 60);
    pointer(root, 'pointerup', { x: 60 });
    expect(pausedBy()).toEqual([]);
    expect(capture.held.size).toBe(0);
    expect(swipeState(root)).toEqual({ ...REST, swiping: 'settle' });
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

/** Drags from the origin to `x` at `slowMs` after activation, then lifts there `liftMs` later. */
function swipe(root: Element, x: number, { slowMs = 1000, liftMs = 1000 } = {}) {
  const start = Math.sign(x) * 10;
  pointer(root, 'pointerdown', { x: 0 });
  pointer(root, 'pointermove', { x: start, time: 0 });
  pointer(root, 'pointermove', { x, time: slowMs });
  pointer(root, 'pointerup', { x, time: slowMs + liftMs });
}

/** A flick: activation at x ±10 at 0 ms, then a lift at `x` after `ms`, with no move between. */
function flick(root: Element, x: number, ms: number) {
  const start = Math.sign(x) * 10;
  pointer(root, 'pointerdown', { x: 0 });
  pointer(root, 'pointermove', { x: start, time: 0 });
  pointer(root, 'pointerup', { x, time: ms });
}

describe('commit (S3, D2 decisions 2, 3 and 6 to 9)', () => {
  describe('the release decision', () => {
    it('commits by distance once the offset reaches min(0.4 × width, 100 px), inclusively', () => {
      for (const [width, offset, commits] of [
        [300, 100, true], // capped at 100
        [300, 99.5, false],
        [200, 80, true], // 0.4 × 200
        [200, 79.5, false],
        [400, 160, true],
      ] as const) {
        const { root } = show();
        Object.defineProperty(root, 'offsetWidth', { configurable: true, value: width });
        swipe(root, 10 + offset); // slow: 0.1 px/ms at most
        expect(recordOf()?.phase, `${width}: ${offset}`).toBe(commits ? 'exiting' : 'visible');
        cleanup();
        resetStore();
      }
    });

    it('commits a short, fast flick by velocity, at exactly 0.4 px/ms and not below', () => {
      for (const [distance, ms, commits] of [
        [30, 40, true], // 0.75 px/ms over 30 px
        [40, 100, true], // exactly 0.4 px/ms, the window's first sample included
        [39.9, 100, false], // 0.399 px/ms
        [40, 101, false], // the activation sample has left the window: one sample, no velocity
      ] as const) {
        const { root } = show();
        flick(root, 10 + distance, ms);
        expect(recordOf()?.phase, `${distance} in ${ms}`).toBe(commits ? 'exiting' : 'visible');
        cleanup();
        resetStore();
      }
    });

    it('ignores a fast velocity in the direction the position forbids', () => {
      const { root } = show(); // top-right: right only
      pointer(root, 'pointerdown');
      pointer(root, 'pointermove', { x: 10, time: 0 });
      pointer(root, 'pointermove', { x: 90, time: 500 });
      pointer(root, 'pointerup', { x: 50, time: 580 }); // -0.5 px/ms, 40 px still out to the right
      expect(recordOf()?.phase).toBe('visible');
      expect(swipeState(root)).toEqual(REST);
    });

    it('ignores a fast velocity that disagrees with the offset, even where both are allowed', () => {
      const { root } = show({ position: 'bottom-center' });
      pointer(root, 'pointerdown');
      pointer(root, 'pointermove', { x: 10, time: 0 });
      pointer(root, 'pointermove', { x: 90, time: 500 });
      pointer(root, 'pointerup', { x: 50, time: 580 }); // left at 0.5 px/ms, offset +40
      expect(recordOf()?.phase).toBe('visible');
    });

    it('commits either way at a centre position, flying on in the committed direction', () => {
      for (const position of ['top-center', 'bottom-center'] as const) {
        for (const direction of [-1, 1]) {
          const { root } = show({ position });
          swipe(root, direction * 130);
          expect(recordOf()?.exit?.reason).toBe('swipe');
          expect(swipeState(root)).toMatchObject({
            swiping: 'release',
            x: `${direction * 120}px`,
            travel: `${direction * 180}px`,
          });
          cleanup();
          resetStore();
        }
      }
    });

    it('commits only toward the edge: left positions left, right positions right', () => {
      for (const [position, toward] of [
        ['top-left', -1],
        ['bottom-left', -1],
        ['top-right', 1],
        ['bottom-right', 1],
      ] as const) {
        const away = show({ position });
        // Activated toward the edge, then dragged far past zero the other way: clamped, no commit.
        pointer(away.root, 'pointerdown');
        pointer(away.root, 'pointermove', { x: toward * 10, time: 0 });
        pointer(away.root, 'pointermove', { x: -toward * 300, time: 100 });
        pointer(away.root, 'pointerup', { x: -toward * 400, time: 120 });
        expect(recordOf()?.phase, position).toBe('visible');
        cleanup();
        resetStore();
        const { root } = show({ position });
        swipe(root, toward * 130);
        expect(recordOf()?.exit?.reason, position).toBe('swipe');
        expect(swipeState(root).travel).toBe(`${toward * 180}px`);
        cleanup();
        resetStore();
      }
    });
  });

  describe('the dismissal', () => {
    it('dismisses with reason swipe exactly once, and onDismiss runs once with it', () => {
      const onDismiss = vi.fn();
      const onAutoClose = vi.fn();
      const { root } = show({ onDismiss, onAutoClose, duration: 5000 });
      swipe(root, 130);
      expect(recordOf()).toMatchObject({ phase: 'exiting', exit: { reason: 'swipe' } });
      // Later pointer events on the exiting root change nothing.
      pointer(root, 'pointerup', { x: 130 });
      pointer(root, 'pointercancel', { x: 130 });
      swipe(root, 300);
      expect(recordOf()?.exit?.reason).toBe('swipe');
      advance(0);
      expect(recordOf()).toBeUndefined();
      expect(onDismiss.mock.calls).toEqual([[expect.anything(), 'swipe']]);
      expect(onAutoClose).not.toHaveBeenCalled();
    });

    it('dismisses while swipe still holds the timer, then clears only swipe: never held exiting', () => {
      const { root } = show({ duration: 5000 });
      act(() => setStackPause('top-right', true)); // hover, as touch sets it (P-15)
      dragTo(root, 130);
      const seen: { phase: string | undefined; pausedBy: readonly string[] }[] = [];
      const unsubscribe = subscribe(() => {
        const record = recordOf();
        seen.push({ phase: record?.phase, pausedBy: [...(record?.pausedBy ?? [])] });
      });
      pointer(root, 'pointerup', { x: 130 });
      unsubscribe();
      // dismiss(id, "swipe") first, while swipe still holds the timer. Clearing the reason then
      // changes no view, since an exiting toast is never held, so it notifies nobody.
      expect(seen).toEqual([{ phase: 'exiting', pausedBy: ['swipe'] }]);
      expect(pausedBy()).toEqual([]);
      expect(root).toHaveAttribute('data-phase', 'exiting');
      expect(root).not.toHaveAttribute('data-paused');
      act(() => setStackPause('top-right', false));
    });

    it('releases capture, after which the loss of capture undoes nothing', () => {
      const { root, capture } = show();
      swipe(root, 130);
      expect(capture.release).toHaveBeenCalledWith(1);
      expect(capture.held.size).toBe(0);
      const state = swipeState(root);
      act(() => {
        root.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1 }));
      });
      expect(swipeState(root)).toEqual(state);
      expect(recordOf()?.exit?.reason).toBe('swipe');
    });

    it('sends the store only the boundaries: 100 moves, then one commit', () => {
      const { root, commits } = show({ duration: 5000 });
      const notify = vi.fn();
      const unsubscribe = subscribe(notify);
      dragTo(root, 20);
      expect(notify).toHaveBeenCalledTimes(1); // swipe set at activation
      const before = commits();
      for (let x = 21; x <= 120; x += 1) pointer(root, 'pointermove', { x, time: x * 10 });
      expect(notify).toHaveBeenCalledTimes(1);
      expect(commits()).toBe(before);
      pointer(root, 'pointerup', { x: 120, time: 1300 });
      // The dismissal; the swipe reason then clears on an exiting toast, which no view shows.
      expect(notify).toHaveBeenCalledTimes(2);
      expect(pausedBy()).toEqual([]);
      unsubscribe();
    });
  });

  describe('the release (no snap-back)', () => {
    it('starts at the current offset and opacity and travels 0.6 × width further', () => {
      const { root } = show();
      dragTo(root, 130);
      const dragged = swipeState(root);
      pointer(root, 'pointerup', { x: 130 });
      expect(swipeState(root)).toEqual({
        swiping: 'release',
        x: '120px',
        y: '0px',
        opacity: dragged.opacity, // the partly faded swipe value, held for P-18's exit
        travel: '180px',
      });
      expect(Number(dragged.opacity)).toBeLessThan(1);
      expect(root).not.toHaveAttribute('style', expect.stringContaining('transition'));
    });

    it('releases from the lift point when the pointer moved on before lifting', () => {
      const { root } = show({ position: 'bottom-left' });
      dragTo(root, -100);
      pointer(root, 'pointerup', { x: -140, time: 2000 });
      expect(swipeState(root)).toMatchObject({ x: '-130px', travel: '-180px' });
    });

    it('scales the travel with the width the gesture measured', () => {
      const { root } = show();
      Object.defineProperty(root, 'offsetWidth', { configurable: true, value: 250 });
      swipe(root, 110);
      expect(swipeState(root).travel).toBe('150px');
    });

    it('never settles on a commit, even with a snap-back time to wait for', () => {
      const { root } = show();
      stubStyle(root, {
        transition: '0.2s, 0.2s',
        animation: 'ret-exit-top',
        animationDuration: '120ms',
      });
      swipe(root, 130);
      expect(swipeState(root).swiping).toBe('release');
      advance(219); // until P-18's fallback removes it
      expect(swipeState(root).swiping).toBe('release');
    });

    it('finishes any frozen vertical offset toward the layout: Y goes to 0', () => {
      const { root } = show();
      stubStyle(root, { transform: 'matrix(1, 0, 0, 1, 0, -30)' });
      dragTo(root, 130);
      expect(swipeState(root).y).toBe('-30px');
      pointer(root, 'pointerup', { x: 130 });
      expect(swipeState(root)).toMatchObject({ swiping: 'release', y: '0px' });
    });
  });

  describe('the lifecycle stays P-18’s (D2 decision 6)', () => {
    const transitionEnd = (target: Element, propertyName: string) =>
      act(() => {
        const event = new Event('transitionend', { bubbles: true });
        Object.assign(event, { propertyName });
        target.dispatchEvent(event);
      });
    const animationEnd = (target: Element, animationName: string) =>
      act(() => {
        const event = new Event('animationend', { bubbles: true });
        Object.defineProperty(event, 'animationName', { value: animationName });
        target.dispatchEvent(event);
      });

    it('ignores transitionend: the fly-out ending removes nothing and clears nothing', () => {
      const onDismiss = vi.fn();
      const { root } = show({ onDismiss });
      stubStyle(root, { animation: 'ret-exit-top', animationDuration: '120ms' });
      swipe(root, 130);
      const state = swipeState(root);
      transitionEnd(root, 'transform');
      transitionEnd(root, 'opacity');
      expect(recordOf()?.phase).toBe('exiting');
      expect(root.isConnected).toBe(true);
      expect(swipeState(root)).toEqual(state);
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it("completes on the root's own exit animationend, once", () => {
      const onDismiss = vi.fn();
      const { root } = show({ onDismiss });
      stubStyle(root, { animation: 'ret-exit-top', animationDuration: '120ms' });
      swipe(root, 130);
      animationEnd(root, 'ret-exit-top');
      expect(recordOf()).toBeUndefined();
      expect(root.isConnected).toBe(false);
      advance(1000);
      expect(onDismiss.mock.calls).toEqual([[expect.anything(), 'swipe']]);
    });

    it('completes on the computed fallback when no animationend comes', () => {
      const onDismiss = vi.fn();
      const { root } = show({ onDismiss });
      stubStyle(root, { animation: 'ret-exit-top', animationDuration: '120ms' });
      swipe(root, 130);
      advance(219);
      expect(recordOf()?.phase).toBe('exiting');
      advance(1);
      expect(recordOf()).toBeUndefined();
      expect(onDismiss).toHaveBeenCalledOnce();
    });

    it('under reduced motion (no animation, no transition) dismisses at once from the drag, never settling', () => {
      const onDismiss = vi.fn();
      const { root } = show({ onDismiss });
      stubStyle(root, { transition: '0s', animation: 'none' });
      dragTo(root, 130);
      expect(swipeState(root)).toMatchObject({ swiping: 'drag', x: '120px' });
      const states: (string | null)[] = [];
      const observer = new MutationObserver(() => states.push(root.getAttribute(SWIPING)));
      observer.observe(root, { attributes: true, attributeFilter: [SWIPING] });
      pointer(root, 'pointerup', { x: 130 });
      expect(swipeState(root)).toMatchObject({ swiping: 'release', x: '120px' });
      advance(0); // P-18's 0 ms path
      observer.disconnect();
      expect(states).not.toContain('settle');
      expect(recordOf()).toBeUndefined();
      expect(onDismiss.mock.calls).toEqual([[expect.anything(), 'swipe']]);
    });
  });

  it('clears a release when the exiting toast is revived', () => {
    const { root } = show();
    swipe(root, 130);
    expect(swipeState(root).swiping).toBe('release');
    act(() => {
      toast('Saved', { id: 't', duration: Infinity });
    });
    expect(recordOf()?.phase).toBe('entering');
    expect(swipeState(root)).toEqual(REST);
    expect(root).not.toHaveAttribute('style');
  });

  it('works the same for a custom toast', () => {
    const { root } = show({}, { custom: true, content: <p>Custom text</p> });
    swipe(screen.getByText('Custom text', inToasts), 130);
    expect(recordOf()?.exit?.reason).toBe('swipe');
    expect(swipeState(root)).toMatchObject({ swiping: 'release', travel: '180px' });
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

  it('gives up an active drag and releases from its offset, with no direction and its own reason', () => {
    const onDismiss = vi.fn();
    const { root, capture } = show({ onDismiss, duration: 5000 });
    dragTo(root, 60);
    const opacity = swipeState(root).opacity;
    act(() => dismiss('t'));
    expect(recordOf()?.phase).toBe('exiting');
    expect(recordOf()?.exit?.reason).toBe('programmatic');
    expect(pausedBy()).toEqual([]);
    expect(capture.held.size).toBe(0);
    expect(capture.release).toHaveBeenCalledWith(1);
    expect(root).not.toHaveAttribute('data-paused');
    // No snap-back: the release starts at the current offset and opacity, and travels nowhere.
    expect(swipeState(root)).toEqual({
      swiping: 'release',
      x: '50px',
      y: '0px',
      opacity,
      travel: '',
    });
    pointer(root, 'pointermove', { x: 200 });
    pointer(root, 'pointerup', { x: 200 });
    expect(swipeState(root).x).toBe('50px'); // no longer owned
    expect(recordOf()?.exit?.reason).toBe('programmatic');
    advance(0);
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledWith(expect.anything(), 'programmatic');
  });

  it('releases with the reason of every other exit: close, action and dismiss-all', () => {
    const cases: [string, (root: HTMLElement) => void][] = [
      [
        'close-button',
        () => fireEvent.click(screen.getByRole('button', { name: 'Close notification' })),
      ],
      ['action', () => fireEvent.click(screen.getByRole('button', { name: 'Undo' }))],
      ['programmatic', () => dismiss()],
    ];
    for (const [reason, end] of cases) {
      const onDismiss = vi.fn();
      const { root } = show({ onDismiss, action: { label: 'Undo', onClick: () => undefined } });
      dragTo(root, 80);
      act(() => end(root));
      expect(swipeState(root)).toMatchObject({ swiping: 'release', x: '70px', travel: '' });
      advance(0);
      expect(onDismiss.mock.calls).toEqual([[expect.anything(), reason]]);
      cleanup();
      resetStore();
    }
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
