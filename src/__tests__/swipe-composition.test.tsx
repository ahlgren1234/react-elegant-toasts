// Swipe and stack repositioning share one root `transform` (§19, §22, P-21 S3, D2 decisions 11
// and 12): P-19 owns its vertical component, the swipe its horizontal one, and neither erases the
// other. jsdom lays nothing out and applies no stylesheet, so, as in the P-19 suite, a stand-in
// flex column measures each toast root from the live DOM and every inline style write on a root
// is logged. A stand-in for the browser's style resolution reports each root's computed
// `transform` as the library's rules would compose it: an inline seed while one is set; under a
// drag, the internal swipe X and Y; otherwise whatever a test holds in flight (a reposition,
// snap-back or fly-out part-way through); otherwise a release's target; otherwise `none`.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from '../index';
import { dismiss, inspectRecords, resetStore } from '../store/store';
import { SWIPE_TRAVEL, SWIPE_X, SWIPE_Y, SWIPING } from '../react/swipe';
import type { ToastPosition } from '../types';

const GAP = 10;
const HEIGHT = 50;
const WIDTH = 300;

/** Seeds, swipe-Y writes, flushes and releases on toast roots, in order. */
let log: string[] = [];
/** A transition part-way through: the root's computed translation until the test clears it. */
const inFlight = new Map<Element, Point>();
/** The resolved snap-back time, so a settle stays in place until a test ends it. */
let transition = '0s';

interface Point {
  readonly x: number;
  readonly y: number;
}

const titleOf = (item: Element) =>
  item.querySelector('.ret-toast__title')?.textContent ?? item.textContent ?? '';
const isToast = (element: Element) =>
  element.tagName === 'LI' && !!element.parentElement?.classList.contains('ret-toaster__list');
const isList = (element: Element) => element.classList.contains('ret-toaster__list');
const toastsOf = (list: Element) => [...list.children].filter(isToast);
const listHeight = (list: Element) => {
  const count = toastsOf(list).length;
  return count * HEIGHT + Math.max(0, count - 1) * GAP;
};
const topOf = (item: Element) =>
  toastsOf(item.parentElement as Element).indexOf(item) * (HEIGHT + GAP);

const saved: [object, string, PropertyDescriptor][] = [];
function override(target: object, key: string, descriptor: PropertyDescriptor) {
  const original = Object.getOwnPropertyDescriptor(target, key);
  if (!original) throw new Error(`no ${key} to override`);
  saved.push([target, key, original]);
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
}

const styleDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style')!;
/** A root's real inline style, bypassing the log. */
const inline = (item: Element) => styleDescriptor.get!.call(item) as CSSStyleDeclaration;
const px = (item: Element, property: string) =>
  parseFloat(inline(item).getPropertyValue(property)) || 0;

/** The translation an inline seed sets: P-19's `translateY()` or the composed `translate()`. */
function parseSeed(value: string): Point | undefined {
  const vertical = /^translateY\((-?[\d.e-]+)px\)$/.exec(value);
  if (vertical) return { x: 0, y: Number(vertical[1]) };
  const both = /^translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)$/.exec(value);
  if (both) return { x: Number(both[1]), y: Number(both[2]) };
  return undefined;
}

/** The root's computed translation, as the library's stylesheet composes it. */
function computed(item: Element): Point | undefined {
  const seed = parseSeed(inline(item).getPropertyValue('transform'));
  if (seed) return seed;
  const state = item.getAttribute(SWIPING);
  if (state === 'drag') return { x: px(item, SWIPE_X), y: px(item, SWIPE_Y) };
  const flying = inFlight.get(item);
  if (flying) return flying;
  if (state === 'release') {
    return { x: px(item, SWIPE_X) + px(item, SWIPE_TRAVEL), y: px(item, SWIPE_Y) };
  }
  return undefined;
}

function install() {
  const proto = HTMLElement.prototype;
  const offsetHeight = Object.getOwnPropertyDescriptor(proto, 'offsetHeight')!;
  const offsetWidth = Object.getOwnPropertyDescriptor(proto, 'offsetWidth')!;
  override(proto, 'offsetParent', {
    get(this: HTMLElement) {
      return isToast(this) && this.isConnected ? this.parentElement : null;
    },
  });
  override(proto, 'offsetTop', {
    get(this: HTMLElement) {
      return isToast(this) ? topOf(this) : 0;
    },
  });
  override(proto, 'offsetHeight', {
    get(this: HTMLElement) {
      if (isToast(this)) return HEIGHT;
      if (isList(this)) {
        log.push('flush');
        return listHeight(this);
      }
      return offsetHeight.get!.call(this) as number;
    },
  });
  override(proto, 'offsetWidth', {
    get(this: HTMLElement) {
      return isToast(this) ? WIDTH : (offsetWidth.get!.call(this) as number);
    },
  });
  override(Element.prototype, 'clientHeight', {
    get(this: Element) {
      return isList(this) ? listHeight(this) : 0;
    },
  });
  override(proto, 'style', {
    get(this: HTMLElement) {
      const real = styleDescriptor.get!.call(this) as CSSStyleDeclaration;
      if (!isToast(this)) return real;
      const name = titleOf(this);
      return new Proxy(real, {
        get(target, key) {
          if (key === 'setProperty') {
            return (property: string, value: string) => {
              if (property === 'transform' || property === SWIPE_Y) {
                log.push(`seed ${name} ${property}: ${value}`);
              } else if (property === 'transition-property') {
                log.push(`seed ${name} ${property}: ${value}`);
              }
              target.setProperty(property, value);
            };
          }
          if (key === 'removeProperty') {
            return (property: string) => {
              if (property === 'transform' || property === 'transition-property') {
                log.push(`release ${name} ${property}`);
              }
              return target.removeProperty(property);
            };
          }
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
        },
      });
    },
    set(this: HTMLElement, value: string) {
      styleDescriptor.set!.call(this, value);
    },
  });
  const owner = Object.prototype.hasOwnProperty.call(window, 'getComputedStyle')
    ? window
    : (Object.getPrototypeOf(window) as object);
  const real = window.getComputedStyle.bind(window);
  override(owner, 'getComputedStyle', {
    writable: true,
    value(element: Element, pseudo?: string | null) {
      const style = real(element, pseudo);
      if (!isToast(element)) return style;
      const point = computed(element);
      const values: Record<string, string> = {
        transform: point ? `matrix(1, 0, 0, 1, ${point.x}, ${point.y})` : 'none',
        transitionDuration: transition,
        transitionDelay: '0s',
      };
      return new Proxy(style, {
        get(target, key) {
          if (typeof key === 'string' && key in values) return values[key];
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
        },
      });
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  log = [];
  inFlight.clear();
  transition = '0s';
  install();
});

afterEach(() => {
  for (const [target, key, descriptor] of saved.reverse()) {
    Object.defineProperty(target, key, descriptor);
  }
  saved.length = 0;
});

const inToasts = { ignore: 'script, style, [aria-live] *' };
const itemOf = (title: string) => screen.getByText(title, inToasts).closest('li') as HTMLLIElement;
const recordOf = (id: string) => inspectRecords().find(record => record.id === id);
const advance = (ms = 0) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** Shows a persistent toast titled and identified by `id`, and lets its enter complete. */
function show(id: string, position: ToastPosition = 'top-right') {
  act(() => {
    toast(id, { id, position, duration: Infinity });
  });
  advance();
}

/** Starts a toast's exit and completes it (no animation in jsdom, so the 0 ms path). */
function remove(id: string) {
  act(() => dismiss(id));
  advance();
}

function pointer(target: Element, kind: string, x: number, time = 0) {
  const event = new PointerEvent(kind, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'touch',
    clientX: x,
    clientY: 0,
  });
  Object.defineProperty(event, 'timeStamp', { value: time });
  act(() => {
    fireEvent(target, event);
  });
}

/** Activates a drag on `item` and moves it to `x` (the offset is x − 10 past activation). */
function drag(item: Element, x: number) {
  pointer(item, 'pointerdown', 0);
  pointer(item, 'pointermove', Math.sign(x) * 10);
  pointer(item, 'pointermove', x, 1000);
}

/** Where a root is on screen: its layout position plus its computed translation. */
function screenOf(item: Element): Point {
  const list = item.parentElement as Element;
  const top = list.getAttribute('data-position')?.startsWith('top-');
  const layout = top ? topOf(item) : topOf(item) - listHeight(list);
  const point = computed(item) ?? { x: 0, y: 0 };
  return { x: point.x, y: layout + point.y };
}

/** The translation each root's transform seed set during `step`, by title. */
function seedsDuring(step: () => void): { log: string[]; seeds: Map<string, Point> } {
  log = [];
  step();
  const seeds = new Map<string, Point>();
  for (const entry of log) {
    const match = /^seed (\S+) transform: (.*)$/.exec(entry);
    if (match) seeds.set(match[1]!, parseSeed(match[2]!)!);
  }
  return { log: [...log], seeds };
}

/**
 * Runs `step` and checks that `item` was exactly where it was on screen at the moment the new
 * layout applied, before any transition: its seed (or, under a drag, its swipe offset) puts it
 * there. Returns the seed, if one was written.
 */
function continuous(item: Element, step: () => void): Point | undefined {
  const name = titleOf(item);
  const before = screenOf(item);
  const { seeds } = seedsDuring(step);
  const seed = seeds.get(name);
  const list = item.parentElement as Element;
  const top = list.getAttribute('data-position')?.startsWith('top-');
  const layout = top ? topOf(item) : topOf(item) - listHeight(list);
  const now = seed ?? computed(item) ?? { x: 0, y: 0 };
  expect(now.x, `${name} keeps its X`).toBeCloseTo(before.x, 9);
  expect(layout + now.y, `${name} keeps its Y`).toBeCloseTo(before.y, 9);
  return seed;
}

describe('activation (D2 decision 12)', () => {
  it('at rest: no jump, no seed, the swipe starts at (0, 0)', () => {
    render(<Toaster />);
    show('a');
    show('b');
    const a = itemOf('a');
    const before = screenOf(a);
    const { log: written } = seedsDuring(() => drag(a, 10));
    expect(written.filter(entry => entry.includes('transform'))).toEqual([]);
    expect(screenOf(a)).toEqual(before);
    expect(a.style.getPropertyValue(SWIPE_Y)).toBe('0px');
  });

  it('mid-reposition: freezes the current visual Y, never snapping to the layout target', () => {
    render(<Toaster />);
    show('a');
    show('b'); // a is seeded 60 px back up and released toward its new place
    const a = itemOf('a');
    inFlight.set(a, { x: 0, y: -19.94 }); // part-way, as D1 Scenario B measured
    const before = screenOf(a);
    drag(a, 10);
    expect(a.getAttribute(SWIPING)).toBe('drag');
    expect(a.style.getPropertyValue(SWIPE_Y)).toBe('-19.94px');
    expect(screenOf(a)).toEqual(before);
    // The drag owns the transform now: moving changes X only, and Y stays frozen.
    pointer(a, 'pointermove', 70, 1000);
    expect(screenOf(a)).toEqual({ x: 60, y: before.y });
  });
});

describe('membership changes during a drag: Freeze Y (D2 decision 11)', () => {
  it('an insertion keeps X under the pointer and Y frozen, with no seed for the dragged root', () => {
    render(<Toaster />);
    show('a');
    const a = itemOf('a');
    drag(a, 60);
    expect(continuous(a, () => show('b'))).toBeUndefined();
    // No transform seed, no transition change and no flush: only the swipe Y absorbs the move.
    expect(log).toEqual(['seed a --ret-swipe-y: -60px']);
    expect(a.style.getPropertyValue(SWIPE_X)).toBe('50px');
    expect(a.getAttribute(SWIPING)).toBe('drag');
    expect(inline(a).getPropertyValue('transform')).toBe('');
    expect(itemOf('a')).toBe(a);
    // Still owned: a later move changes X, and Y stays where the finger holds it.
    pointer(a, 'pointermove', 90, 1100);
    expect(screenOf(a)).toEqual({ x: 80, y: 0 });
  });

  it('an insertion at a bottom stack freezes Y the other way', () => {
    render(<Toaster />);
    show('a', 'bottom-right');
    const a = itemOf('a');
    drag(a, 60);
    continuous(a, () => show('b', 'bottom-right'));
    expect(a.style.getPropertyValue(SWIPE_Y)).toBe('60px');
    expect(a.style.getPropertyValue(SWIPE_X)).toBe('50px');
  });

  it("a neighbour's removal keeps X and freezes Y on the same root", () => {
    render(<Toaster />);
    show('a');
    show('b'); // b on top, a below
    const a = itemOf('a');
    drag(a, 60);
    continuous(a, () => remove('b'));
    expect(a.style.getPropertyValue(SWIPE_Y)).toBe('60px');
    expect(a.style.getPropertyValue(SWIPE_X)).toBe('50px');
    expect(itemOf('a')).toBe(a);
  });

  it('accumulates over several changes, and a neighbour is seeded exactly as before', () => {
    render(<Toaster />);
    show('a');
    show('b');
    show('c'); // c, b, a from the top
    const b = itemOf('b');
    drag(b, 60);
    const { log: written, seeds } = seedsDuring(() => remove('c'));
    // One flush for the ordinary seed; the dragged root only absorbs the move.
    expect(written.filter(entry => entry === 'flush')).toHaveLength(1);
    expect(seeds).toEqual(new Map([['a', { x: 0, y: 60 }]]));
    expect(written).toContain('seed a transform: translateY(60px)');
    expect(written).toContain('seed b --ret-swipe-y: 60px');
    expect(written.some(entry => /^seed b transform/.test(entry))).toBe(false);
    continuous(b, () => show('d'));
    expect(b.style.getPropertyValue(SWIPE_Y)).toBe('0px');
  });

  it('a cancel after a frozen drag settles from where the toast is toward the layout', () => {
    render(<Toaster />);
    show('a');
    const a = itemOf('a');
    transition = '0.2s, 0.2s';
    drag(a, 60);
    show('b');
    // Frozen where the finger held it: X 50, and Y at its old layout place, 60 px above the new.
    expect(screenOf(a)).toEqual({ x: 50, y: 0 });
    expect(a.style.getPropertyValue(SWIPE_Y)).toBe('-60px');
    // A cancel settles: no transform rule, so the snap-back runs from (50, −60) to `none`, the
    // newest layout, with nothing seeded in between.
    log = [];
    pointer(a, 'pointerup', 60, 3000);
    expect(a.getAttribute(SWIPING)).toBe('settle');
    expect(computed(a)).toBeUndefined();
    expect(log).toEqual([]);
  });
});

describe('a reposition during a snap-back keeps X (D1 Scenario D)', () => {
  it.each(['top-right', 'bottom-right'] as const)(
    'seeds the settling root with its current X and Y at %s',
    position => {
      render(<Toaster />);
      show('a', position);
      const a = itemOf('a');
      transition = '0.2s, 0.2s';
      drag(a, 60);
      pointer(a, 'pointerup', 60, 3000);
      expect(a.getAttribute(SWIPING)).toBe('settle');
      inFlight.set(a, { x: 19.6, y: 0 }); // part-way home
      const seed = continuous(a, () => show('b', position));
      // The old vertical-only seed would have erased X: a 19.6 px jump.
      expect(seed).toEqual({ x: 19.6, y: position.startsWith('top') ? -60 : 60 });
      expect(log).toContain(
        `seed a transform: translate(19.6px, ${position.startsWith('top') ? -60 : 60}px)`
      );
      // Then the stylesheet target resumes: `none` while settling.
      expect(inline(a).getPropertyValue('transform')).toBe('');
      expect(a.getAttribute(SWIPING)).toBe('settle');
    }
  );
});

describe('a reposition during a fly-out keeps X (D1 Scenario E)', () => {
  it('seeds the releasing root with its current X, and leaves the fly-out target alone', () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    act(() => {
      toast('a', { id: 'a', duration: Infinity, onDismiss });
    });
    advance();
    const a = itemOf('a');
    drag(a, 130);
    pointer(a, 'pointerup', 130, 1500);
    expect(recordOf('a')?.exit?.reason).toBe('swipe');
    expect(a.getAttribute(SWIPING)).toBe('release');
    inFlight.set(a, { x: 142, y: 0 }); // part-way out, as D1 measured the old seed erasing
    const seed = continuous(a, () => {
      act(() => {
        toast('b', { id: 'b', duration: Infinity });
      });
    });
    expect(seed).toEqual({ x: 142, y: -60 });
    // The fly-out continues to the same target: P-19 touched no swipe property.
    expect(a.style.getPropertyValue(SWIPE_X)).toBe('120px');
    expect(a.style.getPropertyValue(SWIPE_TRAVEL)).toBe('180px');
    expect(a.style.getPropertyValue(SWIPE_Y)).toBe('0px');
    expect(inline(a).getPropertyValue('transform')).toBe('');
    advance();
    expect(onDismiss.mock.calls).toEqual([[expect.anything(), 'swipe']]);
  });
});

describe('a foreign exit during a drag (D0 decision 11)', () => {
  it('releases from the offset, and a reposition during that exit keeps X and Y continuous', () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    act(() => {
      toast('a', { id: 'a', duration: Infinity, onDismiss });
    });
    advance();
    show('z');
    const a = itemOf('a');
    drag(a, 60);
    show('y'); // frozen: swipe Y −60
    const before = screenOf(a);
    act(() => dismiss('a'));
    expect(recordOf('a')?.exit?.reason).toBe('programmatic');
    expect(a.getAttribute(SWIPING)).toBe('release');
    expect(a.style.getPropertyValue(SWIPE_X)).toBe('50px');
    expect(a.style.getPropertyValue(SWIPE_TRAVEL)).toBe('');
    // The release transition starts from where the drag left it, here mid-way to the layout.
    inFlight.set(a, { x: 50, y: (before.y - screenOf(a).y) / 2 });
    const seed = continuous(a, () => {
      act(() => {
        toast('x', { id: 'x', duration: Infinity });
      });
    });
    expect(seed?.x).toBe(50);
    expect(recordOf('a')?.exit?.reason).toBe('programmatic');
    advance();
    expect(onDismiss.mock.calls).toEqual([[expect.anything(), 'programmatic']]);
  });
});

describe('ownership', () => {
  it('P-19 never writes X as 0 for a root that has one, in any position', () => {
    for (const position of ['top-left', 'top-center', 'bottom-center', 'bottom-right'] as const) {
      const toward = position.endsWith('left') ? -1 : 1;
      render(<Toaster />);
      show('a', position);
      const a = itemOf('a');
      transition = '0.2s, 0.2s';
      drag(a, toward * 60);
      pointer(a, 'pointerup', toward * 60, 3000);
      inFlight.set(a, { x: toward * 33, y: 0 });
      const { seeds } = seedsDuring(() => show('b', position));
      expect(seeds.get('a')?.x, position).toBe(toward * 33);
      cleanup();
      act(() => resetStore());
      inFlight.clear();
      transition = '0s';
    }
  });

  it('makes the same writes under StrictMode', () => {
    function scenario(strict: boolean) {
      const toaster = <Toaster />;
      const view = render(strict ? <StrictMode>{toaster}</StrictMode> : toaster);
      show('a');
      show('b');
      log = [];
      const b = itemOf('b');
      drag(b, 60);
      show('c');
      remove('a');
      const written = [...log];
      view.unmount();
      act(() => resetStore());
      return written;
    }
    const normal = scenario(false);
    expect(normal).toContain('seed b --ret-swipe-y: -60px');
    expect(scenario(true)).toEqual(normal);
  });
});
