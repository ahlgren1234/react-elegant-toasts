// Swipe hardening (§19, P-21 S4): the races and edge cases around the S2 and S3 design, on the real
// toast root. jsdom has Pointer Events but no pointer capture, layout, transitions or animations,
// so capture is stubbed on each root, and the computed style where a test needs a snap-back time
// or an exit animation (with neither, every motion is the reduced-motion 0 ms path). Event times
// are explicit. The composition with stack repositioning is `swipe-composition.test.tsx`'s.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Profiler, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Toaster,
  toast,
  type DismissReason,
  type ToastOptions,
  type ToastPosition,
} from '../index';
import {
  dismiss,
  inspectRecords,
  resetStore,
  setStackPause,
  setToastPause,
  subscribe,
} from '../store/store';
import { SWIPE_OPACITY, SWIPE_TRAVEL, SWIPE_X, SWIPE_Y, SWIPING } from '../react/swipe';

// A pass-through spy on the pause boundary, so the gesture's own store calls can be counted: the
// store's idempotence would hide a duplicate.
vi.mock('../store/store', async importOriginal => {
  const store = await importOriginal<typeof import('../store/store')>();
  return { ...store, setToastPause: vi.fn(store.setToastPause) };
});
const swipeCalls = () =>
  vi
    .mocked(setToastPause)
    .mock.calls.filter(([, reason]) => reason === 'swipe')
    .map(([id, , on]) => `${id} ${on ? 'on' : 'off'}`);

const inToasts = { ignore: 'script, style, [aria-live] *' };
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
  /** Pressed buttons: by default 1 for `pointerdown` and `pointermove` (in contact), else 0. */
  readonly buttons?: number;
}

// A contact's events, as browsers report them: a button held while down and moving, none at the end.
const inContact = (kind: string) => (kind === 'pointerdown' || kind === 'pointermove' ? 1 : 0);

function pointer(
  target: Element,
  kind: string,
  { id = 1, x = 0, y = 0, type = 'touch', time = 0, buttons = inContact(kind) }: PointerInit = {}
) {
  const event = new PointerEvent(kind, {
    bubbles: true,
    cancelable: true,
    pointerId: id,
    pointerType: type,
    clientX: x,
    clientY: y,
    buttons,
  });
  Object.defineProperty(event, 'timeStamp', { value: time });
  act(() => {
    fireEvent(target, event);
  });
}

const lost = (target: Element, id = 1) =>
  act(() => {
    target.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: id }));
  });

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

const styleStubs: { mockRestore(): void }[] = [];

/** A computed style for every toast root: a snap-back time and an exit animation. */
function stubStyle({ transition = '0s', animation = 'none', animationDuration = '0s' } = {}) {
  const real = window.getComputedStyle.bind(window);
  const stub = vi.spyOn(window, 'getComputedStyle');
  styleStubs.push(stub);
  return stub.mockImplementation((element, pseudo) => {
    if (!element.classList.contains('ret-toast')) return real(element, pseudo);
    const values: Record<string, string> = {
      transform: 'none',
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
/** A normal-motion snap-back and P-18 exit, so settle and release stay in place a while. */
const MOTION = { transition: '0.2s, 0.2s', animation: 'ret-exit-top', animationDuration: '120ms' };

const swipeState = (root: HTMLElement) => ({
  swiping: root.getAttribute(SWIPING),
  x: root.style.getPropertyValue(SWIPE_X),
  y: root.style.getPropertyValue(SWIPE_Y),
  opacity: root.style.getPropertyValue(SWIPE_OPACITY),
  travel: root.style.getPropertyValue(SWIPE_TRAVEL),
});
const REST = { swiping: null, x: '', y: '', opacity: '', travel: '' };

/** Every trace of a swipe gone: no state, properties, pause, capture or inline style. */
function expectClean(root: HTMLElement, capture: ReturnType<typeof stubCapture>, id = 't') {
  expect(swipeState(root)).toEqual(REST);
  expect(root).not.toHaveAttribute('style');
  expect(pausedBy(id)).not.toContain('swipe');
  expect(capture.held.size).toBe(0);
}

const rootOf = (id: string) =>
  (screen.queryByText(id, inToasts)?.closest('li') ??
    document.querySelector(`[data-t="${id}"]`)?.closest('li')) as HTMLLIElement;

/** Renders a Toaster and shows toast `id`, let in to `visible`, with a 300 px stubbed width. */
function show(
  options: ToastOptions = {},
  { id = 't', custom = false, content = id as ReactNode, wrap = (node: ReactNode) => node } = {}
) {
  let commits = 0;
  if (!document.querySelector('.ret-toaster')) {
    render(
      wrap(
        <Profiler id="toaster" onRender={() => commits++}>
          <Toaster />
        </Profiler>
      )
    );
  }
  act(() => {
    const { duration = Infinity, onDismiss } = options;
    if (custom) toast.custom(content, { id, duration, ...(onDismiss ? { onDismiss } : {}) });
    else toast(content, { id, duration: Infinity, ...options });
  });
  advance(0);
  expect(recordOf(id)?.phase).toBe('visible');
  const root = custom
    ? (document.querySelector(`[data-t="${id}"]`)?.closest('li') as HTMLLIElement)
    : rootOf(id);
  Object.defineProperty(root, 'offsetWidth', { configurable: true, value: 300 });
  return { root, capture: stubCapture(root), commits: () => commits };
}

/** Pointer `id` down at x 0, past the slop toward `x`, then to `x` a second later. */
function dragTo(target: Element, x: number, init: PointerInit = {}) {
  pointer(target, 'pointerdown', { ...init, x: 0, time: 0 });
  pointer(target, 'pointermove', { ...init, x: Math.sign(x) * 10, time: 0 });
  pointer(target, 'pointermove', { ...init, x, time: 1000 });
}

/** A slow drag to `x` and a lift there: a distance commit when |x − 10| ≥ 100. */
function swipe(target: Element, x: number, init: PointerInit = {}) {
  dragTo(target, x, init);
  pointer(target, 'pointerup', { ...init, x, time: 2000 });
}

afterEach(() => {
  for (const stub of styleStubs.splice(0)) stub.mockRestore();
});

beforeEach(() => {
  vi.mocked(setToastPause).mockClear();
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  document.documentElement.removeAttribute('dir');
});

describe('physical directions at all six positions, LTR and RTL (§19, §20, D0 decision 2)', () => {
  const POSITIONS: [ToastPosition, readonly (-1 | 1)[]][] = [
    ['top-left', [-1]],
    ['bottom-left', [-1]],
    ['top-right', [1]],
    ['bottom-right', [1]],
    ['top-center', [-1, 1]],
    ['bottom-center', [-1, 1]],
  ];
  const cases = (['ltr', 'rtl'] as const).flatMap(dir =>
    POSITIONS.flatMap(([position, allowed]) =>
      ([-1, 1] as const).map(direction => [dir, position, direction, allowed.includes(direction)])
    )
  ) as [string, ToastPosition, -1 | 1, boolean][];

  it.each(cases)('%s %s, swiped %d: commits %s', (dir, position, direction, allowed) => {
    document.documentElement.setAttribute('dir', dir);
    const onDismiss = vi.fn();
    const { root } = show({ position, onDismiss }, { wrap: node => <div dir={dir}>{node}</div> });
    swipe(root, direction * 130);
    if (allowed) {
      expect(recordOf()?.exit?.reason).toBe('swipe');
      // The fly-out continues physically, whatever the document direction.
      expect(swipeState(root)).toMatchObject({
        swiping: 'release',
        x: `${direction * 120}px`,
        travel: `${direction * 180}px`,
      });
      advance(0);
      expect(onDismiss.mock.calls).toEqual([[expect.anything(), 'swipe']]);
    } else {
      // A forbidden direction never activates: no state, capture or dismissal.
      expect(recordOf()?.phase).toBe('visible');
      expect(swipeState(root)).toEqual(REST);
    }
  });
});

describe('custom toasts (§6.4, D0 decisions 9 and 13)', () => {
  const custom = (html: string, options: ToastOptions = {}) =>
    show(options, {
      custom: true,
      content: <div data-t="c" dangerouslySetInnerHTML={{ __html: html }} />,
      id: 'c',
    });

  it('swipes from the root, plain text and non-interactive descendants, and dismisses with swipe', () => {
    for (const target of ['root', 'p', 'em']) {
      const onDismiss = vi.fn();
      const { root } = custom('<p>Plain <em>text</em></p>', { onDismiss });
      const children = [...root.children];
      swipe(target === 'root' ? root : (root.querySelector(target) as Element), 130);
      expect(recordOf('c')?.exit?.reason, target).toBe('swipe');
      // No wrapper: the root's children are the consumer's own.
      expect([...root.children]).toEqual(children);
      advance(0);
      expect(onDismiss.mock.calls).toEqual([[expect.anything(), 'swipe']]);
      cleanup();
      act(() => resetStore());
    }
  });

  it.each([
    ['a nested button', '<div><button>Undo</button></div>', 'button'],
    ['a nested link', '<p><a href="#x"><span>link</span></a></p>', 'span'],
    ['a nested input', '<label>Name <input></label>', 'input'],
    ['editable content', '<div contenteditable><p>edit</p></div>', 'p'],
    ['an ARIA widget', '<div role="slider" aria-valuenow="1"><i>knob</i></div>', 'i'],
    ['an explicitly focusable descendant', '<div tabindex="0"><b>card</b></div>', 'b'],
  ])('never starts from %s, even past both thresholds', (_name, html, selector) => {
    const { root, capture } = custom(html);
    swipe(root.querySelector(selector) as Element, 300);
    expect(recordOf('c')?.phase).toBe('visible');
    expect(capture.set).not.toHaveBeenCalled();
    expectClean(root, capture, 'c');
  });

  it('swipes a persistent custom toast, which has no timer or progress', () => {
    const { root } = custom('<p>Persistent</p>', { duration: Infinity });
    expect(root.querySelector('.ret-toast__progress')).toBeNull();
    swipe(root, 130);
    expect(recordOf('c')?.exit?.reason).toBe('swipe');
  });
});

describe('eligibility: visible toasts of every kind, and only visible ones (D0 decision 13)', () => {
  it.each<[string, () => unknown]>([
    ['finite, with progress', () => toast('k', { id: 'k', duration: 5000 })],
    ['persistent', () => toast('k', { id: 'k', duration: Infinity })],
    ['loading', () => toast.loading('k', { id: 'k' })],
  ])('swipes a visible %s toast', (_kind, create) => {
    render(<Toaster progress />);
    act(() => {
      create();
    });
    advance(0);
    const root = rootOf('k');
    Object.defineProperty(root, 'offsetWidth', { configurable: true, value: 300 });
    swipe(root, 130);
    expect(recordOf('k')?.exit?.reason).toBe('swipe');
  });

  it('never starts on a queued toast, which is not rendered, or once its exit has begun', () => {
    render(<Toaster maxVisible={1} />);
    act(() => {
      toast('a', { id: 'a', duration: Infinity });
      toast('q', { id: 'q', duration: Infinity });
    });
    advance(0);
    expect(recordOf('q')?.phase).toBe('queued');
    expect(screen.queryByText('q', inToasts)).toBeNull();
    const root = rootOf('a');
    const capture = stubCapture(root);
    act(() => dismiss('a', 'close-button'));
    swipe(root, 130); // in the same tick as the exit began
    expect(recordOf('a')?.exit?.reason).toBe('close-button');
    expect(capture.set).not.toHaveBeenCalled();
    expect(swipeState(root)).toEqual(REST);
  });

  it('aborts at activation when the committed phase is no longer visible', () => {
    const { root, capture } = show();
    pointer(root, 'pointerdown');
    // The phase moves on in the DOM before React reports it to the gesture.
    root.setAttribute('data-phase', 'exiting');
    pointer(root, 'pointermove', { x: 60 });
    root.setAttribute('data-phase', 'visible');
    pointer(root, 'pointermove', { x: 80 });
    expect(capture.set).not.toHaveBeenCalled();
    expect(swipeState(root)).toEqual(REST);
  });
});

describe('selection races (D0 decision 9)', () => {
  const select = (start: Node, startOffset: number, end: Node, endOffset: number) => {
    const range = document.createRange();
    range.setStart(start, startOffset);
    range.setEnd(end, endOffset);
    const selection = document.getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
  };
  beforeEach(() => document.getSelection()?.removeAllRanges());

  it('blocks a selection that crosses into the toast from outside it', () => {
    const outside = document.body.appendChild(document.createElement('p'));
    outside.textContent = 'before';
    const { root, capture } = show();
    select(
      outside.firstChild as Node,
      2,
      root.querySelector('.ret-toast__title')?.firstChild as Node,
      1
    );
    swipe(root, 130);
    expect(recordOf()?.phase).toBe('visible');
    expectClean(root, capture);
    outside.remove();
  });

  it('ignores a collapsed selection inside the toast', () => {
    const { root } = show();
    const text = root.querySelector('.ret-toast__title')?.firstChild as Node;
    select(text, 0, text, 0);
    expect(document.getSelection()?.isCollapsed).toBe(true);
    swipe(root, 130);
    expect(recordOf()?.exit?.reason).toBe('swipe');
  });

  it('drops the candidate when a selection appears between pointerdown and activation', () => {
    const { root, capture } = show();
    pointer(root, 'pointerdown');
    const text = root.querySelector('.ret-toast__title')?.firstChild as Node;
    select(text, 0, text, 1);
    pointer(root, 'pointermove', { x: 20 });
    document.getSelection()?.removeAllRanges();
    pointer(root, 'pointermove', { x: 140 });
    pointer(root, 'pointerup', { x: 140, time: 2000 });
    expect(recordOf()?.phase).toBe('visible');
    expectClean(root, capture);
  });

  it('adds no cancellation rule for a selection made after activation', () => {
    const { root } = show();
    dragTo(root, 60);
    const text = root.querySelector('.ret-toast__title')?.firstChild as Node;
    select(text, 0, text, 1);
    pointer(root, 'pointermove', { x: 140, time: 1500 });
    pointer(root, 'pointerup', { x: 140, time: 2500 });
    expect(recordOf()?.exit?.reason).toBe('swipe');
  });
});

describe('protected-target races (D0 decision 9)', () => {
  it.each(['removed', 'reparented outside the toast', 'reparented to the toast root'])(
    'never swipes from a control that is %s mid-sequence, and the control keeps working',
    change => {
      const onDismiss = vi.fn();
      const { root, capture } = show({ onDismiss });
      const close = screen.getByRole('button', { name: 'Close notification' });
      pointer(close, 'pointerdown');
      const parent = close.parentElement as Element;
      if (change === 'removed') close.remove();
      else if (change === 'reparented outside the toast') document.body.append(close);
      else root.insertBefore(close, root.firstChild);
      for (const target of [close, root]) {
        pointer(target, 'pointermove', { x: 60 });
        pointer(target, 'pointermove', { x: 160, time: 1000 });
        pointer(target, 'pointerup', { x: 160, time: 2000 });
      }
      expect(recordOf()?.phase).toBe('visible');
      expect(capture.set).not.toHaveBeenCalled();
      if (close.parentElement !== parent) parent.append(close);
      act(() => {
        fireEvent.click(close);
      });
      expect(recordOf()?.exit?.reason).toBe('close-button');
    }
  );
});

describe('capture and cancel races (D0 decision 10, D2 decisions 13 and 14)', () => {
  it.each<[string, (root: HTMLElement) => void]>([
    ['the loss after a commit', root => lost(root)],
    ['a descendant loss after a commit', root => lost(root.firstElementChild as Element)],
    ['a pointercancel after a commit', root => pointer(root, 'pointercancel', { x: 130 })],
    ['a second pointerup after a commit', root => pointer(root, 'pointerup', { x: 0 })],
    ['another pointer’s events after a commit', root => swipe(root, -300, { id: 2 })],
  ])('ignores %s: the swipe dismissal stands once', (_name, after) => {
    const onDismiss = vi.fn();
    const { root, capture } = show({ onDismiss, duration: 5000 });
    stubStyle(MOTION);
    swipe(root, 130);
    const state = swipeState(root);
    const notify = vi.fn();
    const unsubscribe = subscribe(notify);
    after(root);
    unsubscribe();
    expect(notify).not.toHaveBeenCalled();
    expect(swipeState(root)).toEqual(state);
    expect(capture.release).toHaveBeenCalledTimes(1);
    advance(220);
    expect(onDismiss.mock.calls).toEqual([[expect.anything(), 'swipe']]);
  });

  it.each<[string, (root: HTMLElement) => void]>([
    ['pending', root => pointer(root, 'pointerdown')],
    ['active', root => dragTo(root, 160)],
    [
      'at the activating move itself',
      root => {
        pointer(root, 'pointerdown');
        pointer(root, 'pointermove', { x: 160 });
      },
    ],
  ])('a pointercancel while %s never dismisses and leaves nothing behind', (_name, start) => {
    const { root, capture } = show({ duration: 5000 });
    start(root);
    pointer(root, 'pointercancel', { x: 160 });
    lost(root); // the browser's loss of capture that follows
    pointer(root, 'pointerup', { x: 160, time: 2000 });
    expect(recordOf()?.phase).toBe('visible');
    expectClean(root, capture);
    expect(capture.release.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('a pointercancel after a foreign exit, or after another pointer, changes nothing', () => {
    const { root, capture } = show();
    dragTo(root, 60);
    pointer(root, 'pointercancel', { id: 2 });
    expect(swipeState(root).swiping).toBe('drag');
    act(() => dismiss('t'));
    const state = swipeState(root);
    pointer(root, 'pointercancel', { x: 60 });
    lost(root);
    expect(swipeState(root)).toEqual(state);
    expect(capture.release).toHaveBeenCalledTimes(1);
    expect(recordOf()?.exit?.reason).toBe('programmatic');
  });

  it('releases capture and the pause once when the Toaster unmounts mid-drag, then never again', () => {
    const { root, capture } = show({ duration: 5000 });
    dragTo(root, 60);
    cleanup();
    expect(capture.release).toHaveBeenCalledTimes(1);
    expect(swipeState(root)).toEqual(REST);
    pointer(root, 'pointerup', { x: 160 });
    lost(root);
    expect(capture.release).toHaveBeenCalledTimes(1);
  });

  it('cleans up a root that detached while captured when its toast later goes', () => {
    const { root, capture } = show();
    dragTo(root, 60);
    // The browser drops capture with the node; the gesture hears of it only through React.
    capture.held.clear();
    act(() => dismiss('t'));
    advance(0);
    expect(recordOf()).toBeUndefined();
    expectClean(root, capture);
  });
});

describe('multiple pointers (D0 decision 10)', () => {
  it.each([
    ['touch', 'touch'],
    ['touch', 'pen'],
    ['pen', 'touch'],
    ['pen', 'pen'],
  ])(
    'first %s owns the gesture; a second %s cannot activate, sample, unpause, release or commit',
    (first, second) => {
      const { root, capture } = show({ duration: 5000 });
      pointer(root, 'pointerdown', { type: first });
      pointer(root, 'pointerdown', { id: 2, type: second });
      pointer(root, 'pointermove', { id: 2, type: second, x: 50 });
      expect(swipeState(root)).toEqual(REST);
      pointer(root, 'pointermove', { type: first, x: 10, time: 0 });
      pointer(root, 'pointermove', { type: first, x: 60, time: 1000 });
      // The second pointer flicks fast past the distance; none of it reaches the gesture.
      pointer(root, 'pointermove', { id: 2, type: second, x: 400, time: 1950 });
      pointer(root, 'pointerup', { id: 2, type: second, x: 500, time: 1990 });
      lost(root, 2);
      pointer(root, 'pointercancel', { id: 2, type: second });
      expect(swipeState(root)).toMatchObject({ swiping: 'drag', x: '50px' });
      expect(pausedBy()).toEqual(['swipe']);
      expect(capture.held.has(1)).toBe(true);
      expect(capture.release).not.toHaveBeenCalled();
      // The owner lifts slowly: had the second pointer's samples counted, this would be a flick.
      pointer(root, 'pointerup', { type: first, x: 60, time: 2000 });
      expect(recordOf()?.phase).toBe('visible');
      // Ownership has ended, so another pointer can now start normally.
      swipe(root, 130, { id: 3, type: second });
      expect(recordOf()?.exit?.reason).toBe('swipe');
    }
  );

  it('lets two toasts be swiped at once, each by its own pointer, each with its own state', () => {
    const a = show({}, { id: 'a' });
    const b = show({}, { id: 'b' });
    dragTo(a.root, 60, { id: 1 });
    pointer(b.root, 'pointerdown', { id: 2 });
    expect(swipeState(b.root)).toEqual(REST);
    pointer(b.root, 'pointermove', { id: 2, x: 10 });
    pointer(b.root, 'pointermove', { id: 2, x: 140, time: 1000 });
    expect(pausedBy('a')).toEqual(['swipe']);
    expect(pausedBy('b')).toEqual(['swipe']);
    expect(a.capture.held).toEqual(new Set([1]));
    expect(b.capture.held).toEqual(new Set([2]));
    pointer(b.root, 'pointerup', { id: 2, x: 140, time: 2000 });
    expect(recordOf('b')?.exit?.reason).toBe('swipe');
    expect(swipeState(a.root)).toMatchObject({ swiping: 'drag', x: '50px' });
    expect(pausedBy('a')).toEqual(['swipe']);
    pointer(a.root, 'pointerup', { id: 1, x: 60, time: 2000 });
    expect(recordOf('a')?.phase).toBe('visible');
    expect(swipeState(a.root)).toEqual(REST);
  });

  it('keeps everything local to the swiped toast, and the next toast swipes normally after', () => {
    const a = show({ duration: 5000 }, { id: 'a' });
    const b = show({ duration: 5000 }, { id: 'b' });
    dragTo(a.root, 140);
    expect(swipeState(b.root)).toEqual(REST);
    expect(pausedBy('b')).toEqual([]);
    expect(b.capture.set).not.toHaveBeenCalled();
    pointer(a.root, 'pointerup', { x: 140, time: 2000 });
    expect(recordOf('a')?.exit?.reason).toBe('swipe');
    expect(recordOf('b')?.phase).toBe('visible');
    advance(0);
    swipe(b.root, 140);
    expect(recordOf('b')?.exit?.reason).toBe('swipe');
  });
});

describe('the lifecycle race matrix (D0 decision 11)', () => {
  type State = 'pending' | 'drag' | 'settle' | 'release';
  type Cause = 'close' | 'action' | 'programmatic' | 'dismiss-all' | 'timeout' | 'relocate';
  const START: Record<State, (root: HTMLElement) => void> = {
    pending: root => pointer(root, 'pointerdown'),
    drag: root => dragTo(root, 60),
    settle: root => {
      dragTo(root, 60);
      pointer(root, 'pointerup', { x: 60, time: 2000 });
    },
    release: root => swipe(root, 130),
  };
  const CAUSE: Record<Cause, () => void> = {
    close: () => fireEvent.click(screen.getByRole('button', { name: 'Close notification' })),
    action: () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })),
    programmatic: () => dismiss('t'),
    'dismiss-all': () => dismiss(),
    timeout: () => vi.advanceTimersByTime(1000),
    relocate: () => toast('t', { id: 't', position: 'bottom-left', duration: 1000 }),
  };
  /** The reason that ends the toast, or what the toast does instead. */
  const expected = (state: State, cause: Cause): DismissReason | 'relocate' | 'held' => {
    // An update at another position turns any exit into a relocation (§14), a swipe's as well.
    if (cause === 'relocate') return 'relocate';
    if (state === 'release') return 'swipe'; // the swipe committed first
    if (cause === 'timeout') return state === 'drag' ? 'held' : 'timeout';
    if (cause === 'close') return 'close-button';
    if (cause === 'dismiss-all') return 'programmatic';
    return cause;
  };
  const states: State[] = ['pending', 'drag', 'settle', 'release'];
  const causes: Cause[] = ['close', 'action', 'programmatic', 'dismiss-all', 'timeout', 'relocate'];

  it.each(states.flatMap(state => causes.map(cause => [state, cause] as const)))(
    'while %s, %s',
    (state, cause) => {
      const onDismiss = vi.fn();
      const { root, capture } = show({
        duration: 1000,
        onDismiss,
        action: { label: 'Undo', onClick: () => undefined },
      });
      stubStyle(MOTION);
      START[state](root);
      const before = swipeState(root);
      const swiping = before.swiping;
      act(() => {
        CAUSE[cause]();
      });
      const outcome = expected(state, cause);
      if (outcome === 'held') {
        // An active drag holds the countdown: the old deadline passing changes nothing.
        expect(recordOf()?.phase).toBe('visible');
        expect(swipeState(root)).toEqual(before);
        pointer(root, 'pointerup', { x: 60, time: 2000 });
        expect(pausedBy()).toEqual([]);
        return;
      }
      // The timeout's own 1000 ms may already have run P-18's 220 ms fallback.
      const record = recordOf();
      if (record) {
        expect(record.phase).toBe('exiting');
        expect(record.exit?.reason).toBe(outcome);
        expect(pausedBy()).toEqual([]);
        expect(root).toHaveAttribute('inert');
        expect(root).not.toHaveAttribute('data-paused');
        if (state === 'drag') {
          // No snap-back first: the exit starts from the drag's offset, with no travel.
          expect(swipeState(root)).toMatchObject({ swiping: 'release', x: '50px', travel: '' });
        } else if (state === 'pending') {
          expect(swipeState(root)).toEqual(REST);
        } else if (state === 'release') {
          expect(swipeState(root)).toEqual(before);
        } else {
          // A settle carries on home (or has finished), never turning into a release.
          expect([swiping, null]).toContain(swipeState(root).swiping);
        }
        // Later pointer events change nothing.
        swipe(root, -300);
        expect(recordOf()?.exit?.reason).toBe(outcome);
      }
      expect(capture.held.size).toBe(0);
      advance(220); // P-18's fallback
      if (outcome === 'relocate') {
        expect(onDismiss).not.toHaveBeenCalled();
        expect(recordOf()?.position).toBe('bottom-left');
      } else {
        expect(recordOf()).toBeUndefined();
        expect(onDismiss.mock.calls).toEqual([[expect.anything(), outcome]]);
      }
      expect(root.isConnected).toBe(false);
      expect(swipeState(root)).toEqual(REST);
    }
  );

  it.each(states)('an in-place update while %s keeps the same root and gesture', state => {
    const onDismiss = vi.fn();
    const { root } = show({ onDismiss });
    stubStyle(MOTION);
    START[state](root);
    const before = swipeState(root);
    act(() => {
      toast('t', { id: 't', duration: Infinity, onDismiss, description: 'Updated' });
    });
    expect(rootOf('t')).toBe(root);
    if (state === 'release') {
      // An update to an exiting toast at its position revives it: the release is cleared.
      expect(recordOf()?.phase).toBe('entering');
      expect(swipeState(root)).toEqual(REST);
      return;
    }
    expect(swipeState(root)).toEqual(before);
    if (state === 'drag') {
      pointer(root, 'pointermove', { x: 150, time: 1500 });
      pointer(root, 'pointerup', { x: 150, time: 2500 });
      expect(recordOf()?.exit?.reason).toBe('swipe');
    }
  });
});

describe('the countdown (§10, D0 decision 4)', () => {
  it('runs while a candidate is pending, and a timeout then drops it harmlessly', () => {
    const onDismiss = vi.fn();
    const { root, capture } = show({ duration: 1000, onDismiss });
    pointer(root, 'pointerdown');
    advance(1000);
    expect(recordOf()?.exit?.reason).toBe('timeout');
    swipe(root, 160);
    expect(capture.set).not.toHaveBeenCalled();
    advance(0);
    expect(onDismiss.mock.calls).toEqual([[expect.anything(), 'timeout']]);
  });

  it('is held by an active drag, then resumes from its folded remainder at the cancel', () => {
    const { root } = show({ duration: 1000 });
    advance(400);
    dragTo(root, 60);
    advance(5000);
    expect(recordOf()?.phase).toBe('visible');
    pointer(root, 'pointerup', { x: 60, time: 2000 });
    advance(599);
    expect(recordOf()?.phase).toBe('visible');
    advance(1);
    expect(recordOf()?.exit?.reason).toBe('timeout');
  });

  it('stays held after a cancel while another reason holds it', () => {
    const { root } = show({ duration: 1000 });
    act(() => setStackPause('top-right', true));
    dragTo(root, 60);
    pointer(root, 'pointerup', { x: 60, time: 2000 });
    advance(5000);
    expect(recordOf()?.phase).toBe('visible');
    expect(root).toHaveAttribute('data-paused');
    act(() => setStackPause('top-right', false));
    advance(1000);
    expect(recordOf()?.exit?.reason).toBe('timeout');
  });

  it('cannot overwrite a swipe that commits at the last moment', () => {
    const onDismiss = vi.fn();
    const { root } = show({ duration: 1000, onDismiss });
    advance(990);
    swipe(root, 130);
    advance(5000);
    expect(onDismiss.mock.calls).toEqual([[expect.anything(), 'swipe']]);
  });
});

describe('progress and data-paused (P-20)', () => {
  it('shows held only while a gesture is active, and never while exiting', () => {
    render(<Toaster progress />);
    act(() => {
      toast('k', { id: 'k', duration: 5000 });
      toast('f', { id: 'f', duration: 5000 });
    });
    advance(0);
    const [k, f] = [rootOf('k'), rootOf('f')];
    for (const root of [k, f]) {
      Object.defineProperty(root, 'offsetWidth', { configurable: true, value: 300 });
      stubCapture(root);
    }
    const fill = k.querySelector('.ret-toast__progress-fill');
    pointer(k, 'pointerdown');
    expect(k).not.toHaveAttribute('data-paused'); // pending holds nothing
    pointer(k, 'pointermove', { x: 10 });
    expect(k).toHaveAttribute('data-paused');
    pointer(k, 'pointermove', { x: 60, time: 1000 });
    pointer(k, 'pointerup', { x: 60, time: 2000 });
    expect(k).not.toHaveAttribute('data-paused');
    expect(k.querySelector('.ret-toast__progress-fill')).not.toBe(fill); // one new run, at the boundary
    swipe(k, 130);
    expect(k).not.toHaveAttribute('data-paused');
    dragTo(f, 60, { id: 2 });
    expect(f).toHaveAttribute('data-paused');
    act(() => dismiss('f'));
    expect(f).not.toHaveAttribute('data-paused');
  });
});

describe('focus restoration and inert (P-16, D0 decision 17)', () => {
  /** Where focus goes when `b`, holding focus, is ended by `end`. */
  function restoredBy(end: (root: HTMLElement) => void) {
    show({}, { id: 'a' });
    const { root } = show({}, { id: 'b' });
    act(() => root.focus());
    expect(document.activeElement).toBe(root);
    end(root);
    const target = document.activeElement;
    const description = target?.closest('li')?.textContent ?? target?.className ?? null;
    expect(root).toHaveAttribute('inert');
    cleanup();
    act(() => resetStore());
    return description;
  }

  it('restores focus on a swipe exactly as on a programmatic dismissal', () => {
    const control = restoredBy(() => act(() => dismiss('b')));
    const swiped = restoredBy(root => swipe(root, 130));
    expect(control).toBeTruthy();
    expect(swiped).toBe(control);
  });
});

describe('revival and reuse start clean (D2-20 item 23)', () => {
  const revive = () =>
    act(() => {
      toast('t', { id: 't', duration: Infinity });
    });

  it.each<[string, (root: HTMLElement) => void]>([
    ['a drag ended by a foreign exit', root => (dragTo(root, 60), act(() => dismiss('t')))],
    [
      'a settle cut short by an exit',
      root => {
        dragTo(root, 60);
        pointer(root, 'pointerup', { x: 60, time: 2000 });
        act(() => dismiss('t'));
      },
    ],
    [
      'an interrupted capture, then an exit',
      root => {
        dragTo(root, 60);
        // The browser takes capture away, then says so.
        (root as unknown as { releasePointerCapture(id: number): void }).releasePointerCapture(1);
        lost(root);
        act(() => dismiss('t'));
      },
    ],
    ['a swipe release', root => swipe(root, 130)],
  ])('after %s', (_name, end) => {
    const { root, capture } = show({ duration: Infinity });
    stubStyle(MOTION);
    end(root);
    expect(recordOf()?.phase).toBe('exiting');
    revive();
    expect(recordOf()?.phase).toBe('entering');
    expectClean(root, capture);
    // No stale cosmetic listener or timer acts on the revived toast later.
    const transitionEnd = new Event('transitionend', { bubbles: true });
    Object.assign(transitionEnd, { propertyName: 'transform' });
    root.setAttribute('style', 'color: red');
    act(() => {
      root.dispatchEvent(transitionEnd);
    });
    advance(1000);
    expect(root.getAttribute('style')).toBe('color: red');
    root.removeAttribute('style');
    // And it swipes again normally once visible.
    expect(recordOf()?.phase).toBe('visible');
    swipe(root, 130);
    expect(recordOf()?.exit?.reason).toBe('swipe');
  });
});

describe('P-18 completion during a release (§9 rule 3)', () => {
  const animationEnd = (target: Element, animationName: string) =>
    act(() => {
      const event = new Event('animationend', { bubbles: true });
      Object.defineProperty(event, 'animationName', { value: animationName });
      target.dispatchEvent(event);
    });

  it('ignores a child, a foreign name and an enter name, and completes on its own exit', () => {
    const onDismiss = vi.fn();
    const { root } = show({ onDismiss });
    stubStyle(MOTION);
    swipe(root, 130);
    animationEnd(root.firstElementChild as Element, 'ret-exit-top');
    animationEnd(root, 'consumer-fade');
    animationEnd(root, 'ret-enter-top');
    animationEnd(root, 'ret-exit-bottom');
    expect(recordOf()?.phase).toBe('exiting');
    animationEnd(root, 'ret-exit-top');
    expect(recordOf()).toBeUndefined();
    expect(onDismiss.mock.calls).toEqual([[expect.anything(), 'swipe']]);
  });
});

describe('reduced motion: no transition or animation runs (§17.5, D0 decision 12)', () => {
  it.each<[string, (root: HTMLElement) => void, DismissReason | null]>([
    ['a cancel', root => (dragTo(root, 60), pointer(root, 'pointerup', { x: 60 })), null],
    ['a commit', root => swipe(root, 130), 'swipe'],
    ['a foreign exit', root => (dragTo(root, 60), act(() => dismiss('t'))), 'programmatic'],
  ])('%s ends at once, with the same reason as normal motion', (_name, run, reason) => {
    const onDismiss = vi.fn();
    const { root, capture } = show({ onDismiss });
    stubStyle({ transition: '0s', animation: 'none' });
    const states: (string | null)[] = [];
    const observer = new MutationObserver(() => states.push(root.getAttribute(SWIPING)));
    observer.observe(root, { attributes: true, attributeFilter: [SWIPING] });
    run(root);
    advance(0);
    observer.disconnect();
    if (reason === null) {
      expect(recordOf()?.phase).toBe('visible');
      expectClean(root, capture);
    } else {
      expect(recordOf()).toBeUndefined();
      expect(onDismiss.mock.calls).toEqual([[expect.anything(), reason]]);
      // Out from where it was dragged: never through a snap-back.
      expect(states).not.toContain('settle');
    }
  });
});

describe('the swipe reason is set and cleared exactly once per gesture (D0 decision 4)', () => {
  it.each<[string, (root: HTMLElement) => void]>([
    ['a cancel', root => (dragTo(root, 60), pointer(root, 'pointerup', { x: 60, time: 2000 }))],
    ['a pointercancel', root => (dragTo(root, 60), pointer(root, 'pointercancel'))],
    ['a lost capture', root => (dragTo(root, 60), lost(root), pointer(root, 'pointerup'))],
    ['a commit', root => (swipe(root, 130), lost(root), pointer(root, 'pointercancel'))],
    ['a foreign exit', root => (dragTo(root, 60), act(() => dismiss('t')), lost(root))],
    ['an unmount', root => (dragTo(root, 60), cleanup())],
  ])('%s, followed by every late event and the unmount', (_name, run) => {
    const { root } = show({ duration: 5000 });
    run(root);
    pointer(root, 'pointerup', { x: 60 });
    cleanup();
    expect(swipeCalls()).toEqual(['t on', 't off']);
  });

  it('never touches the reason for a pending candidate, a mouse, or an idle unmount', () => {
    const { root } = show({ duration: 5000 });
    pointer(root, 'pointerdown');
    pointer(root, 'pointercancel');
    swipe(root, 130, { type: 'mouse' });
    cleanup();
    expect(swipeCalls()).toEqual([]);
  });
});

describe('a candidate dropped by a lifecycle change stays dropped (D0 decision 11)', () => {
  it('never comes back when the toast is revived to visible under the same pointer', () => {
    const { root, capture } = show();
    pointer(root, 'pointerdown');
    act(() => dismiss('t'));
    act(() => {
      toast('t', { id: 't', duration: Infinity });
    });
    advance(0);
    expect(recordOf()?.phase).toBe('visible');
    pointer(root, 'pointermove', { x: 60 });
    pointer(root, 'pointermove', { x: 160, time: 1000 });
    pointer(root, 'pointerup', { x: 160, time: 2000 });
    expect(recordOf()?.phase).toBe('visible');
    expect(capture.set).not.toHaveBeenCalled();
  });
});

// Pre-publication correction (IMPORTANT-1). A pending candidate holds no capture, so when its
// contact ends off the root (a pen has no implicit capture) the root never hears the `pointerup`.
// A `pointermove` from the owning pointer with no buttons pressed proves the contact has ended:
// it drops a pending candidate, and cancels an active gesture as `pointercancel` does. It never
// activates, continues or commits a swipe.
describe('contact loss: a move with no buttons ends the owning pointer’s gesture', () => {
  /** A pen's contact that ends off the root: down on the toast, up over the page. */
  function liftOffRoot(root: HTMLElement, id = 1) {
    pointer(root, 'pointerdown', { id, type: 'pen' });
    pointer(document.body, 'pointerup', { id, type: 'pen' });
  }
  const hover = (root: HTMLElement, x: number, id = 1, time = 0) =>
    pointer(root, 'pointermove', { id, type: 'pen', x, time, buttons: 0 });

  it('a pen hovering after a lift off the root never activates, captures, pauses or dismisses', () => {
    const onDismiss = vi.fn();
    const { root, capture } = show({ duration: 5000, onDismiss });
    liftOffRoot(root);
    for (const x of [20, 60, 160, 260]) hover(root, x, 1, x * 10);
    expect(capture.set).not.toHaveBeenCalled();
    expect(swipeCalls()).toEqual([]);
    expect(swipeState(root)).toEqual(REST);
    pointer(root, 'pointerup', { type: 'pen', x: 260, time: 3000 });
    expect(recordOf()?.phase).toBe('visible');
    advance(0);
    expect(onDismiss).not.toHaveBeenCalled();
    // A fresh contact, from the same pen or another pointer, swipes normally.
    swipe(root, 130, { type: 'pen' });
    expect(recordOf()?.exit?.reason).toBe('swipe');
  });

  it('lets a finite toast time out normally: the countdown is never held', () => {
    const onDismiss = vi.fn();
    const { root } = show({ duration: 1000, onDismiss });
    liftOffRoot(root);
    hover(root, 40);
    hover(root, 160, 1, 500);
    expect(recordOf()?.pausedBy).toEqual([]);
    advance(1000);
    expect(recordOf()?.exit?.reason).toBe('timeout');
    advance(0);
    expect(onDismiss.mock.calls).toEqual([[expect.anything(), 'timeout']]);
    expect(swipeCalls()).toEqual([]);
  });

  it('drops a pending candidate at once, leaving nothing to settle, and the next contact starts normally', () => {
    for (const type of ['touch', 'pen']) {
      const { root, capture } = show();
      pointer(root, 'pointerdown', { type });
      pointer(root, 'pointermove', { type, x: 5, buttons: 0 });
      pointer(root, 'pointermove', { type, x: 160, time: 1000 }); // same pointer, contact claimed
      pointer(root, 'pointerup', { type, x: 160, time: 2000 });
      expect(capture.set, type).not.toHaveBeenCalled();
      expect(recordOf()?.phase, type).toBe('visible');
      expectClean(root, capture);
      swipe(root, 130, { id: 2, type });
      expect(recordOf()?.exit?.reason, type).toBe('swipe');
      cleanup();
      act(() => resetStore());
    }
  });

  it.each([
    ['normal motion', MOTION, 'settle'],
    ['reduced motion', { transition: '0s', animation: 'none' }, null],
  ] as const)(
    'cancels an active drag under %s, past the distance, never committing',
    (_name, style, settling) => {
      const onDismiss = vi.fn();
      const { root, capture } = show({ duration: 5000, onDismiss });
      stubStyle(style);
      act(() => setStackPause('top-right', true));
      dragTo(root, 200, { type: 'pen' });
      expect(swipeState(root).swiping).toBe('drag');
      pointer(root, 'pointermove', { type: 'pen', x: 400, time: 1050, buttons: 0 });
      expect(recordOf()?.phase).toBe('visible');
      expect(swipeState(root).swiping).toBe(settling);
      expect(swipeState(root).x).toBe(''); // the offset is gone: it springs back
      expect(capture.release).toHaveBeenCalledTimes(1);
      expect(capture.held.size).toBe(0);
      expect(root).toHaveAttribute('data-paused'); // hover still holds it
      // The loss of capture, a lift and further moves that follow change nothing.
      lost(root);
      pointer(root, 'pointerup', { type: 'pen', x: 400, time: 1100 });
      pointer(root, 'pointermove', { type: 'pen', x: 500, time: 1200 });
      pointer(root, 'pointercancel', { type: 'pen' });
      advance(1000);
      expect(recordOf()?.phase).toBe('visible');
      expect(onDismiss).not.toHaveBeenCalled();
      expect(swipeCalls()).toEqual(['t on', 't off']);
      expect(capture.release).toHaveBeenCalledTimes(1);
      expectClean(root, capture);
      act(() => setStackPause('top-right', false));
    }
  );

  it('ignores a move with no buttons from any other pointer, pending or active', () => {
    const { root, capture } = show();
    pointer(root, 'pointerdown');
    pointer(root, 'pointermove', { id: 2, x: 30, buttons: 0 });
    pointer(root, 'pointermove', { id: 2, type: 'mouse', x: 30, buttons: 0 });
    pointer(root, 'pointermove', { x: 10 });
    expect(swipeState(root).swiping).toBe('drag');
    pointer(root, 'pointermove', { id: 2, x: 300, buttons: 0 });
    pointer(root, 'pointermove', { x: 60, time: 1000 });
    expect(swipeState(root)).toMatchObject({ swiping: 'drag', x: '50px' });
    expect(capture.held).toEqual(new Set([1]));
    // A second contact still cannot take either kind of ownership.
    pointer(root, 'pointerdown', { id: 3 });
    pointer(root, 'pointermove', { id: 3, x: 300 });
    pointer(root, 'pointerup', { id: 3, x: 300 });
    expect(swipeState(root)).toMatchObject({ swiping: 'drag', x: '50px' });
    expect(pausedBy()).toEqual(['swipe']);
  });

  it('ignores stale moves from a pointer whose gesture has already ended', () => {
    const { root, capture } = show();
    dragTo(root, 60);
    pointer(root, 'pointermove', { x: 60, time: 1050, buttons: 0 }); // contact lost: cancelled
    for (const buttons of [0, 1]) pointer(root, 'pointermove', { x: 200, time: 1100, buttons });
    expect(swipeState(root)).toEqual(REST);
    expect(swipeCalls()).toEqual(['t on', 't off']);
    // After the cleanup a new pointer starts normally.
    swipe(root, 130, { id: 5 });
    expect(recordOf()?.exit?.reason).toBe('swipe');
    expect(capture.set.mock.calls).toEqual([[1], [5]]);
  });
});
