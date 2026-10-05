// Stack repositioning in the renderer (§22, P-19 S2 to S4, D2 decisions 2 to 7). jsdom lays
// nothing out, so a stand-in flex column computes each toast root's layout-space offsets from the
// live DOM, as a browser would, and every inline style write on a toast root is recorded. The
// seed, the one flush and the release then show up in order, and the rest state is checked
// directly. For interruption (S3), a stand-in for the browser's transitions can hold each released
// seed in flight, so the computed `transform` reports it, and tests advance or settle it at will.
import fs from 'node:fs';
import path from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { Profiler, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from '../index';
import { dismiss, inspectRecords, resetStore } from '../store/store';
import type { ToastPosition } from '../types';

const root = path.resolve(__dirname, '../..');

const POSITIONS: readonly ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];
const GAP = 10;
const DEFAULT_HEIGHT = 50;

/** Each toast's height, by its title; any other toast is 50px. */
const heights = new Map<string, number>();
/** Seeds, flushes and releases, in order, and reads too while `reads` is on. */
let log: string[] = [];
let reads = false;
/** The call stack of every layout read of a toast root or a list, while `traces` is set. */
let traces: string[] | null = null;
/**
 * Each toast root's P-19 offset on screen: its inline seed while seeded, then, while `holding`,
 * the running transition's current value. Without `holding` a released transition ends at once.
 */
const motion = new Map<Element, number>();
let holding = false;
/** Computed styles report a zero reposition duration, as the reduced-motion stylesheet gives. */
let reducedMotion = false;

const titleOf = (item: Element) =>
  item.querySelector('.ret-toast__title')?.textContent ?? item.textContent ?? '';
const isToast = (element: Element) =>
  element.tagName === 'LI' && !!element.parentElement?.classList.contains('ret-toaster__list');
const isList = (element: Element) => element.classList.contains('ret-toaster__list');
const trace = (element: Element) => {
  if (traces && (isToast(element) || isList(element))) traces.push(new Error().stack ?? '');
};
const toastsOf = (list: Element) => [...list.children].filter(isToast);
const heightOf = (item: Element) => heights.get(titleOf(item)) ?? DEFAULT_HEIGHT;
const listHeight = (list: Element) =>
  toastsOf(list).reduce((sum, item, index) => sum + heightOf(item) + (index ? GAP : 0), 0);
function topOf(item: Element): number {
  let top = 0;
  for (const sibling of toastsOf(item.parentElement as Element)) {
    if (sibling === item) return top;
    top += heightOf(sibling) + GAP;
  }
  return top;
}

const saved: [object, string, PropertyDescriptor][] = [];
function override(target: object, key: string, descriptor: PropertyDescriptor) {
  const original = Object.getOwnPropertyDescriptor(target, key);
  if (!original) throw new Error(`no ${key} to override`);
  saved.push([target, key, original]);
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
}

/** A flex column of toast roots in each position list, measured in layout space. */
function installLayout() {
  const proto = HTMLElement.prototype;
  const offsetHeight = Object.getOwnPropertyDescriptor(proto, 'offsetHeight')!;
  override(proto, 'offsetParent', {
    get(this: HTMLElement) {
      trace(this);
      return isToast(this) && this.isConnected ? this.parentElement : null;
    },
  });
  override(proto, 'offsetTop', {
    get(this: HTMLElement) {
      trace(this);
      if (!isToast(this)) return 0;
      if (reads) log.push(`read layout ${titleOf(this)}`);
      return topOf(this);
    },
  });
  override(proto, 'offsetHeight', {
    get(this: HTMLElement) {
      trace(this);
      if (isToast(this)) return heightOf(this);
      if (this.classList.contains('ret-toaster__list')) {
        log.push('flush');
        return listHeight(this);
      }
      return offsetHeight.get!.call(this) as number;
    },
  });
  override(Element.prototype, 'clientHeight', {
    get(this: Element) {
      trace(this);
      return isList(this) ? listHeight(this) : 0;
    },
  });
}

/** Records every inline `setProperty` and `removeProperty` on a toast root. */
function recordStyleWrites() {
  const style = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style')!;
  override(HTMLElement.prototype, 'style', {
    get(this: HTMLElement) {
      const real = style.get!.call(this) as CSSStyleDeclaration;
      return isToast(this) ? recorded(this, real) : real;
    },
    set(this: HTMLElement, value: string) {
      style.set!.call(this, value);
    },
  });
}

/** A toast root's inline style, recording its writes and feeding the in-flight model. */
function recorded(item: Element, real: CSSStyleDeclaration): CSSStyleDeclaration {
  const name = titleOf(item);
  return new Proxy(real, {
    get(target, key) {
      if (key === 'setProperty') {
        return (property: string, value: string) => {
          log.push(`seed ${name} ${property}: ${value}`);
          if (property === 'transform') {
            motion.set(item, parseFloat(value.slice('translateY('.length)));
          }
          target.setProperty(property, value);
        };
      }
      if (key === 'removeProperty') {
        return (property: string) => {
          log.push(`release ${name} ${property}`);
          if (property === 'transform' && !holding) motion.delete(item);
          return target.removeProperty(property);
        };
      }
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
    set(target, key, value) {
      return Reflect.set(target, key, value, target);
    },
  });
}

/** Computed styles report each toast root's P-19 offset as a browser would: a `matrix()`. */
function reportMotion() {
  const owner = Object.prototype.hasOwnProperty.call(window, 'getComputedStyle')
    ? window
    : (Object.getPrototypeOf(window) as object);
  const real = window.getComputedStyle.bind(window);
  override(owner, 'getComputedStyle', {
    writable: true,
    value(element: Element, pseudo?: string | null) {
      const computed = real(element, pseudo);
      const offset = isToast(element) ? motion.get(element) : undefined;
      const reduced = reducedMotion && isToast(element);
      if (offset === undefined && !reduced) return computed;
      return new Proxy(computed, {
        get(target, key) {
          if (key === 'transform' && offset !== undefined)
            return `matrix(1, 0, 0, 1, 0, ${offset})`;
          if (reduced && key === 'transitionDuration') return '0s';
          if (reduced && key === 'getPropertyValue') {
            return (property: string) =>
              property === 'transition-duration' ? '0s' : target.getPropertyValue(property);
          }
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
        },
      });
    },
  });
}

/** Moves every running transition `share` of the rest of the way to `transform: none`. */
function progress(share: number) {
  for (const [item, offset] of motion) {
    const left = offset * (1 - share);
    if (Math.abs(left) < 1e-9) motion.delete(item);
    else motion.set(item, left);
  }
}

/** Every transition ends. */
const settle = () => motion.clear();

/** A toast root's layout position on screen, positive down, with each list's anchor at 0. */
function layoutOf(item: Element): number {
  const list = item.parentElement as Element;
  const top = list.getAttribute('data-position')?.startsWith('top-');
  return top ? topOf(item) : topOf(item) - listHeight(list);
}

/** Where a toast root is on screen: its layout position plus its P-19 offset. */
const visualOf = (item: Element) => layoutOf(item) + (motion.get(item) ?? 0);

interface Retarget {
  /** Where the toast was on screen, and where its layout put it, just before the commit. */
  readonly visual: number;
  readonly layoutBefore: number;
  readonly offsetBefore: number;
  /** Its newest layout position, the move's target, and the offset it now runs from. */
  readonly layoutAfter: number;
  readonly offsetAfter: number;
  /** It was moving one way and now moves the other. */
  readonly reversed: boolean;
  /** The newest target lies behind it, against the way it was moving. */
  readonly targetCrossed: boolean;
}

/**
 * Runs `step` and checks every toast root that stays in its list: it is exactly where it was on
 * screen (no snap, to a stale origin or anywhere else), now on its way to its newest layout
 * position. Returns each one's move, by title.
 */
function retarget(step: () => void): Map<string, Retarget> {
  const before = new Map(
    [...document.querySelectorAll('.ret-toaster__list > li')].map(item => [
      item,
      {
        list: item.parentElement,
        visual: visualOf(item),
        layout: layoutOf(item),
        offset: motion.get(item) ?? 0,
      },
    ])
  );
  step();
  const moves = new Map<string, Retarget>();
  for (const [item, was] of before) {
    if (!item.isConnected || item.parentElement !== was.list) continue;
    const layoutAfter = layoutOf(item);
    const offsetAfter = motion.get(item) ?? 0;
    expect(layoutAfter + offsetAfter, `${titleOf(item)} stays where it was`).toBeCloseTo(
      was.visual,
      9
    );
    const wasHeading = Math.sign(-was.offset);
    const nowHeading = Math.sign(-offsetAfter);
    moves.set(titleOf(item), {
      visual: was.visual,
      layoutBefore: was.layout,
      offsetBefore: was.offset,
      layoutAfter,
      offsetAfter,
      reversed: wasHeading !== 0 && nowHeading !== 0 && wasHeading !== nowHeading,
      targetCrossed: wasHeading !== 0 && Math.sign(layoutAfter - was.visual) === -wasHeading,
    });
  }
  return moves;
}

/** Every reversal is one the newest target requires (category A), never a stale origin (B). */
function expectOnlyRequiredReversals(moves: Map<string, Retarget>) {
  for (const [title, move] of moves) {
    if (move.reversed)
      expect(move.targetCrossed, `${title} reverses only for its target`).toBe(true);
  }
}

const seeds = () => log.filter(entry => entry.startsWith('seed') && entry.includes('transform'));

beforeEach(() => {
  vi.useFakeTimers();
  heights.clear();
  log = [];
  reads = false;
  traces = null;
  motion.clear();
  holding = false;
  reducedMotion = false;
  installLayout();
  recordStyleWrites();
  reportMotion();
});

afterEach(() => {
  for (const [target, key, descriptor] of saved.reverse()) {
    Object.defineProperty(target, key, descriptor);
  }
  saved.length = 0;
});

const inToasts = { ignore: 'script, style, [aria-live] *' };
const itemOf = (title: string) => screen.getByText(title, inToasts).closest('li') as HTMLLIElement;
const listAt = (position: ToastPosition) =>
  document.querySelector(`.ret-toaster__list[data-position='${position}']`) as HTMLOListElement;
const titlesAt = (position: ToastPosition) => toastsOf(listAt(position)).map(titleOf);
const phaseOf = (id: string) => inspectRecords().find(record => record.id === id)?.phase;

const advance = (ms = 0) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** Shows a persistent toast titled and identified by `id`, and lets its enter complete. */
function show(id: string, position: ToastPosition = 'top-right', height?: number) {
  if (height !== undefined) heights.set(id, height);
  act(() => {
    toast(id, { id, position, duration: Infinity });
  });
  advance();
}

function close(id: string) {
  act(() => dismiss(id));
}

/** Clears the log, runs `step`, and returns what was logged. */
function during(step: () => void): string[] {
  log = [];
  step();
  return [...log];
}

/** Every toast root is back at rest: no inline style, so the stylesheet alone applies. */
function expectAtRest() {
  for (const item of document.querySelectorAll('.ret-toaster__list > li')) {
    expect(item.getAttribute('style')).toBeNull();
  }
}

describe('initial mount', () => {
  it('caches geometry without seeding anything', () => {
    render(<Toaster />);
    expect(during(() => show('a'))).toEqual([]);
    expectAtRest();
    // The cache is what lets the next insertion move `a` from where it was.
    during(() => show('b'));
    expect(seeds()).toEqual(['seed a transform: translateY(-60px)']);
  });

  it('seeds nothing when several toasts appear with the Toaster', () => {
    act(() => {
      toast('a', { id: 'a', duration: Infinity });
      toast('b', { id: 'b', duration: Infinity });
      toast('c', { id: 'c', duration: Infinity });
    });
    log = [];
    render(<Toaster />);
    advance();
    expect(seeds()).toEqual([]);
    expect(titlesAt('top-right')).toEqual(['c', 'b', 'a']);
    expectAtRest();
  });
});

describe('insertion', () => {
  it('moves the survivor of a top stack back up by the new toast, then releases it', () => {
    render(<Toaster />);
    show('a');
    const logged = during(() => show('b', 'top-right', 70));
    expect(logged).toEqual([
      'seed a transition-property: none',
      'seed a transform: translateY(-80px)',
      'flush',
      'release a transition-property',
      'release a transform',
    ]);
    expect(titlesAt('top-right')).toEqual(['b', 'a']);
    expectAtRest();
  });

  it('moves the survivor of a bottom stack back down by the new toast', () => {
    render(<Toaster />);
    show('a', 'bottom-right');
    during(() => show('b', 'bottom-right', 70));
    expect(seeds()).toEqual(['seed a transform: translateY(80px)']);
    expect(titlesAt('bottom-right')).toEqual(['a', 'b']);
    expectAtRest();
  });

  it('never seeds the new toast: it enters by its own P-18 animation', () => {
    render(<Toaster />);
    show('a');
    show('b');
    during(() => show('c'));
    expect(log.filter(entry => / c /.test(entry))).toEqual([]);
    expect(seeds()).toEqual([
      'seed b transform: translateY(-60px)',
      'seed a transform: translateY(-60px)',
    ]);
  });

  it("moves every survivor by the new toast's height and gap, whatever their own heights", () => {
    render(<Toaster />);
    show('a', 'top-right', 40);
    show('b', 'top-right', 90);
    // At a top stack the newest is nearest the edge, so every older toast moves by 70 + 10.
    during(() => show('c', 'top-right', 70));
    expect(seeds()).toEqual([
      'seed b transform: translateY(-80px)',
      'seed a transform: translateY(-80px)',
    ]);
  });

  it('reads every distance and offset before writing, and flushes once between seed and release', () => {
    const real = window.getComputedStyle.bind(window);
    const style = vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
      if (reads && isToast(element)) log.push(`read style ${titleOf(element)}`);
      return real(element);
    });
    render(<Toaster />);
    show('a');
    show('b');
    reads = true;
    log = [];
    act(() => {
      toast('c', { id: 'c', duration: Infinity });
    });
    reads = false;
    // Every layout read, then the current offset of each mover, then the writes. The new toast's
    // own lifecycle reads its computed animation afterwards, in a passive effect.
    expect(log).toEqual([
      'read layout c',
      'read layout b',
      'read layout a',
      'read style b',
      'read style a',
      'seed b transition-property: none',
      'seed b transform: translateY(-60px)',
      'seed a transition-property: none',
      'seed a transform: translateY(-60px)',
      'flush',
      'release b transition-property',
      'release b transform',
      'release a transition-property',
      'release a transform',
      'read style c',
    ]);
    style.mockRestore();
  });

  it('continues a move in flight from the offset it has reached', () => {
    render(<Toaster />);
    show('a');
    const real = window.getComputedStyle.bind(window);
    const style = vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
      const computed = real(element);
      if (!(isToast(element) && titleOf(element) === 'a')) return computed;
      return new Proxy(computed, {
        get(target, key) {
          if (key === 'transform') return 'matrix(1, 0, 0, 1, 0, 15)';
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
        },
      });
    });
    during(() => show('b'));
    expect(seeds()).toEqual(['seed a transform: translateY(-45px)']);
    style.mockRestore();
  });

  it('keeps the DOM order the visual order, with no wrapper around any toast', () => {
    render(<Toaster />);
    show('a');
    show('b');
    show('c');
    const list = listAt('top-right');
    expect([...list.children].map(child => child.tagName)).toEqual(['LI', 'LI', 'LI']);
    expect(titlesAt('top-right')).toEqual(['c', 'b', 'a']);
    expect(list.parentElement?.tagName).toBe('SECTION');
  });
});

describe('removal', () => {
  it('moves nothing while a toast exits, then moves the survivors once it is removed', () => {
    render(<Toaster />);
    show('a');
    show('b', 'top-right', 70);
    show('c');
    expect(titlesAt('top-right')).toEqual(['c', 'b', 'a']);
    // The exit keeps the toast's slot: no membership change, no move.
    expect(during(() => close('b'))).toEqual([]);
    expect(phaseOf('b')).toBe('exiting');
    expect(titlesAt('top-right')).toEqual(['c', 'b', 'a']);
    expect(itemOf('b').hasAttribute('inert')).toBe(true);
    // Its removal at the end of the exit moves `a` up into the slot; `c` stays where it is.
    during(() => advance());
    expect(titlesAt('top-right')).toEqual(['c', 'a']);
    expect(seeds()).toEqual(['seed a transform: translateY(80px)']);
    expectAtRest();
  });

  it.each([
    [
      'the toast nearest the edge',
      'c',
      ['seed b transform: translateY(60px)', 'seed a transform: translateY(60px)'],
    ],
    ['the furthest toast', 'a', []],
  ])('moves only what the layout moved when removing %s', (_, id, expected) => {
    render(<Toaster />);
    show('a');
    show('b');
    show('c');
    close(id);
    during(() => advance());
    expect(seeds()).toEqual(expected);
    expectAtRest();
  });

  it('moves the survivors of a bottom stack down into the slot', () => {
    render(<Toaster />);
    show('a', 'bottom-left');
    show('b', 'bottom-left', 70);
    show('c', 'bottom-left');
    close('b');
    during(() => advance());
    expect(titlesAt('bottom-left')).toEqual(['a', 'c']);
    expect(seeds()).toEqual(['seed a transform: translateY(-80px)']);
  });
});

describe('promotion', () => {
  it('moves the survivor once, from its old place to its new one, when a removal promotes a toast', () => {
    render(<Toaster maxVisible={2} />);
    show('a');
    show('b', 'top-right', 70);
    show('c', 'top-right', 30);
    expect(titlesAt('top-right')).toEqual(['b', 'a']);
    close('a');
    const logged = during(() => advance());
    // One snapshot: `a` gone and `c` promoted. `b` was at 0 and is now below `c`.
    expect(titlesAt('top-right')).toEqual(['c', 'b']);
    expect(logged.filter(entry => entry === 'flush')).toHaveLength(1);
    expect(seeds()).toEqual(['seed b transform: translateY(-40px)']);
    advance();
    expect(phaseOf('c')).toBe('visible');
    expectAtRest();
  });

  it('moves the survivor of a bottom stack the other way', () => {
    render(<Toaster maxVisible={2} />);
    show('a', 'bottom-center');
    show('b', 'bottom-center', 70);
    show('c', 'bottom-center', 30);
    close('a');
    during(() => advance());
    expect(titlesAt('bottom-center')).toEqual(['b', 'c']);
    // `b` was at the edge (0) and is now 30 + 10 above it.
    expect(seeds()).toEqual(['seed b transform: translateY(40px)']);
  });
});

describe('all six positions', () => {
  it.each(POSITIONS)('moves the survivor at %s toward its new place from the old one', position => {
    render(<Toaster />);
    show('a', position);
    during(() => show('b', position, 70));
    const top = position.startsWith('top-');
    expect(seeds()).toEqual([`seed a transform: translateY(${top ? -80 : 80}px)`]);
    expect(titlesAt(position)).toEqual(top ? ['b', 'a'] : ['a', 'b']);
    expectAtRest();
  });

  it('moves each list on its own: a change at one position moves nothing at another', () => {
    render(<Toaster />);
    show('a', 'top-left');
    show('b', 'bottom-right');
    during(() => show('c', 'top-left'));
    expect(seeds()).toEqual(['seed a transform: translateY(-60px)']);
  });
});

describe('commits that keep the sequence', () => {
  it('moves nothing when a toast enters, settles or starts to exit', () => {
    render(<Toaster />);
    show('a');
    heights.set('b', 70);
    act(() => {
      toast('b', { id: 'b', duration: Infinity });
    });
    log = [];
    expect(phaseOf('b')).toBe('entering');
    advance();
    expect(phaseOf('b')).toBe('visible');
    close('b');
    expect(phaseOf('b')).toBe('exiting');
    expect(seeds()).toEqual([]);
  });

  it('moves nothing on a revival on the same node', () => {
    render(<Toaster />);
    show('a');
    show('b');
    const node = itemOf('b');
    close('b');
    log = [];
    act(() => {
      toast('b', { id: 'b', duration: Infinity });
    });
    advance();
    expect(itemOf('b')).toBe(node);
    expect(seeds()).toEqual([]);
  });

  it('moves nothing when content is replaced, but measures the new size for the next move', () => {
    render(<Toaster />);
    show('a');
    show('b');
    log = [];
    heights.set('b2', 120);
    act(() => {
      toast('b2', { id: 'b', duration: Infinity });
    });
    expect(seeds()).toEqual([]);
    // `a` now sits below the taller `b`; the next insertion starts from there, not from before.
    during(() => show('c'));
    expect(seeds()).toEqual([
      'seed b2 transform: translateY(-60px)',
      'seed a transform: translateY(-60px)',
    ]);
  });
});

/** A local ResizeObserver: jsdom has none. */
class FakeResizeObserver {
  static current: FakeResizeObserver[] = [];
  readonly observed = new Set<Element>();
  disconnected = false;
  constructor(readonly callback: () => void) {
    FakeResizeObserver.current.push(this);
  }
  observe(target: Element) {
    this.observed.add(target);
  }
  unobserve(target: Element) {
    this.observed.delete(target);
  }
  disconnect() {
    this.disconnected = true;
    this.observed.clear();
  }
}

describe('ResizeObserver', () => {
  beforeEach(() => {
    FakeResizeObserver.current = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  it('observes the toast roots of each mounted list, and releases removed ones', () => {
    render(<Toaster />);
    show('a');
    show('b');
    const [observer] = FakeResizeObserver.current;
    expect([...observer!.observed].map(titleOf).sort()).toEqual(['a', 'b']);
    close('a');
    advance();
    expect([...observer!.observed].map(titleOf)).toEqual(['b']);
  });

  it('refreshes the geometry on a size change without moving anything', () => {
    render(<Toaster />);
    show('a');
    show('b', 'top-right', 70);
    const [observer] = FakeResizeObserver.current;
    log = [];
    heights.set('b', 100);
    act(() => observer!.callback());
    expect(seeds()).toEqual([]);
    expectAtRest();
    // `a` moved from 80 to 110 with the size change; the next move starts from 110.
    during(() => show('c'));
    expect(seeds()).toEqual([
      'seed b transform: translateY(-60px)',
      'seed a transform: translateY(-60px)',
    ]);
  });

  it('disconnects when its list unmounts', () => {
    render(<Toaster />);
    show('a', 'bottom-left');
    const [observer] = FakeResizeObserver.current;
    close('a');
    advance();
    expect(listAt('bottom-left')).toBeNull();
    expect(observer!.disconnected).toBe(true);
  });
});

describe('lifecycle and React', () => {
  it('reads layout only in a layout effect after the commit, never during render', () => {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 100;
    try {
      render(<Toaster maxVisible={2} />);
      traces = [];
      show('a');
      show('b', 'top-right', 70);
      show('c');
      close('a');
      advance();
      expect(seeds()).not.toEqual([]);
      expect(traces.length).toBeGreaterThan(0);
      for (const stack of traces) {
        expect(stack).not.toMatch(/renderWithHooks/);
        expect(stack).toMatch(/commitHookEffectListMount/);
      }
    } finally {
      Error.stackTraceLimit = limit;
      traces = null;
    }
  });

  it('never gates entered, exited, removal or promotion', () => {
    render(<Toaster maxVisible={2} />);
    show('a');
    show('b');
    act(() => {
      toast('c', { id: 'c', duration: Infinity });
    });
    expect(phaseOf('c')).toBe('queued');
    close('a');
    // The 0 ms fallback (jsdom computes no animation) completes the exit at once, though `b` has
    // just been seeded and its transition has not run.
    advance();
    expect(phaseOf('a')).toBeUndefined();
    expect(phaseOf('c')).toBe('entering');
    advance();
    expect(phaseOf('c')).toBe('visible');
  });

  it('adds no listener, frame callback, media query or Web Animation', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const media = vi.fn();
    vi.stubGlobal('matchMedia', media);
    const animate = vi.fn();
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: animate,
    });
    render(<Toaster />);
    const listeners = vi.spyOn(EventTarget.prototype, 'addEventListener');
    show('a');
    show('b');
    close('a');
    advance();
    expect(seeds()).not.toEqual([]);
    expect(listeners.mock.calls.map(([type]) => type).filter(t => /transition/.test(t))).toEqual(
      []
    );
    expect(
      listeners.mock.contexts.filter(target => target === window || target === document)
    ).toEqual([]);
    expect(raf).not.toHaveBeenCalled();
    expect(media).not.toHaveBeenCalled();
    expect(animate).not.toHaveBeenCalled();
    listeners.mockRestore();
    raf.mockRestore();
    delete (Element.prototype as Partial<Element>).animate;
  });

  it('adds no React commit: the Toaster commits as often as without any layout', () => {
    const run = () => {
      let commits = 0;
      const view = render(
        <Profiler id="toaster" onRender={() => commits++}>
          <Toaster maxVisible={2} />
        </Profiler>
      );
      show('a');
      show('b', 'top-right', 70);
      show('c');
      close('a');
      advance();
      advance();
      view.unmount();
      return commits;
    };
    const withLayout = run();
    expect(seeds()).not.toEqual([]);
    for (const [target, key, descriptor] of saved.reverse()) {
      Object.defineProperty(target, key, descriptor);
    }
    saved.length = 0;
    log = [];
    resetStore();
    const withoutLayout = run();
    expect(seeds()).toEqual([]);
    expect(withLayout).toBe(withoutLayout);
  });

  it('moves the same under StrictMode', () => {
    render(
      <StrictMode>
        <Toaster />
      </StrictMode>
    );
    show('a');
    during(() => show('b', 'top-right', 70));
    expect(seeds()).toEqual(['seed a transform: translateY(-80px)']);
    expectAtRest();
  });
});

// ---------------------------------------------------------------------------------------------
// P-19 S3: interruption and lifecycle hardening.
// ---------------------------------------------------------------------------------------------

/** Shows a persistent toast without completing its enter: it stays `entering`. */
function add(id: string, position: ToastPosition = 'top-right', height?: number) {
  if (height !== undefined) heights.set(id, height);
  act(() => {
    toast(id, { id, position, duration: Infinity });
  });
}

const EDGES: readonly ToastPosition[] = ['top-right', 'bottom-left'];

describe('interruption: a retarget continues from where the toast is (S3)', () => {
  beforeEach(() => {
    holding = true;
  });

  it('composes the current offset with the new layout delta: one worked example', () => {
    render(<Toaster />);
    show('a');
    // `b` (70px) arrives above `a`: `a` is put back up 80px and starts down to its new place.
    show('b', 'top-right', 70);
    expect(motion.get(itemOf('a'))).toBe(-80);
    progress(0.5);
    // Halfway: `a` is at 80 − 40 = 40 on screen, heading down to 80.
    expect(visualOf(itemOf('a'))).toBe(40);
    // `c` (50px) arrives: `a`'s layout goes from 80 to 140. The seed is the layout delta
    // (80 − 140) plus the 40px still in flight: −100, so `a` is still at 40 on screen.
    const moves = retarget(() => show('c'));
    expect(moves.get('a')).toEqual({
      visual: 40,
      layoutBefore: 80,
      offsetBefore: -40,
      layoutAfter: 140,
      offsetAfter: -100,
      reversed: false,
      targetCrossed: false,
    });
    expect(seeds().slice(-1)).toEqual(['seed a transform: translateY(-100px)']);
    settle();
    expect(visualOf(itemOf('a'))).toBe(140);
    expectAtRest();
  });

  describe.each(EDGES)('at %s', position => {
    it('two removals in quick succession', () => {
      render(<Toaster />);
      for (const id of ['a', 'b', 'c', 'd']) show(id, position, id === 'b' ? 70 : undefined);
      settle();
      close('c');
      expectOnlyRequiredReversals(retarget(() => advance()));
      progress(0.4);
      close('b');
      const moves = retarget(() => advance());
      expect([...moves.values()].some(move => move.reversed)).toBe(false);
      settle();
      expect(titlesAt(position)).toEqual(position.startsWith('top-') ? ['d', 'a'] : ['a', 'd']);
      expectAtRest();
    });

    it('three removals in quick succession, from rest: no reversal at all', () => {
      render(<Toaster maxVisible={6} />);
      for (const id of ['a', 'b', 'c', 'd', 'e'])
        show(id, position, 40 + (id.charCodeAt(0) % 5) * 10);
      settle();
      for (const id of ['d', 'c', 'b']) {
        close(id);
        const moves = retarget(() => advance());
        expect([...moves.values()].some(move => move.reversed)).toBe(false);
        progress(0.3);
      }
      settle();
      expect(titlesAt(position)).toEqual(position.startsWith('top-') ? ['e', 'a'] : ['a', 'e']);
      expectAtRest();
    });

    it('removals while the insertions that built the stack are still moving: category A only', () => {
      render(<Toaster />);
      for (const id of ['a', 'b', 'c', 'd', 'e'])
        show(id, position, 40 + (id.charCodeAt(0) % 5) * 10);
      // Still in flight away from the edge; each removal pulls the targets back toward it, and
      // the last one past where `a` now is. Default `maxVisible` is 4, so the first removal also
      // promotes `e`.
      const reversals: Retarget[] = [];
      for (const id of ['d', 'c', 'b']) {
        close(id);
        const moves = retarget(() => advance());
        expectOnlyRequiredReversals(moves);
        reversals.push(...[...moves.values()].filter(move => move.reversed));
        progress(0.3);
      }
      expect(reversals.length).toBeGreaterThan(0);
      expect(reversals.every(move => move.targetCrossed)).toBe(true);
      settle();
      expectAtRest();
    });

    it('rapid insertion', () => {
      render(<Toaster />);
      show('a', position);
      for (const id of ['b', 'c', 'd']) {
        const moves = retarget(() => show(id, position, 60));
        expect([...moves.values()].some(move => move.reversed)).toBe(false);
        progress(0.25);
      }
      settle();
      expectAtRest();
    });

    it('insertion then removal: the reversal is the one the newest target requires', () => {
      render(<Toaster />);
      show('a', position);
      show('b', position, 70);
      progress(0.5);
      close('b');
      const moves = retarget(() => advance());
      const a = moves.get('a')!;
      // `a` had 40px left to go away from the edge; `b` is gone, so its newest place is back at
      // the edge, behind it: it must turn round, from where it is, not from where it started.
      expect(a.reversed).toBe(true);
      expect(a.targetCrossed).toBe(true);
      expect(Math.abs(a.offsetAfter)).toBe(40);
      expectOnlyRequiredReversals(moves);
      settle();
      expect(visualOf(itemOf('a'))).toBe(layoutOf(itemOf('a')));
      expectAtRest();
    });

    it('removal then insertion', () => {
      render(<Toaster />);
      for (const id of ['a', 'b', 'c']) show(id, position);
      close('b');
      retarget(() => advance());
      progress(0.5);
      const moves = retarget(() => show('d', position, 90));
      expectOnlyRequiredReversals(moves);
      settle();
      expectAtRest();
    });

    it('a promotion, then another membership change', () => {
      render(<Toaster maxVisible={2} />);
      show('a', position);
      show('b', position, 70);
      show('c', position, 30);
      close('a');
      expectOnlyRequiredReversals(retarget(() => advance()));
      progress(0.5);
      expectOnlyRequiredReversals(retarget(() => show('d', position, 40)));
      close('b');
      expectOnlyRequiredReversals(retarget(() => advance()));
      settle();
      expectAtRest();
    });

    it('while a neighbour is still entering: it moves too, and still enters', () => {
      render(<Toaster />);
      show('a', position);
      add('b', position, 70);
      expect(phaseOf('b')).toBe('entering');
      progress(0.5);
      expectOnlyRequiredReversals(retarget(() => add('c', position)));
      expect(phaseOf('b')).toBe('entering');
      expect(seeds().some(seed => seed.startsWith('seed b '))).toBe(true);
      advance();
      expect(phaseOf('b')).toBe('visible');
      settle();
      expectAtRest();
    });

    it('while a neighbour is still exiting: the exiting toast moves, stays inert, then leaves', () => {
      render(<Toaster />);
      for (const id of ['a', 'b', 'c']) show(id, position);
      close('b');
      progress(0.5);
      expectOnlyRequiredReversals(retarget(() => add('d', position, 70)));
      expect(phaseOf('b')).toBe('exiting');
      expect(itemOf('b').hasAttribute('inert')).toBe(true);
      expect(seeds().some(seed => seed.startsWith('seed b '))).toBe(true);
      progress(0.5);
      expectOnlyRequiredReversals(retarget(() => advance()));
      expect(phaseOf('b')).toBeUndefined();
      settle();
      expectAtRest();
    });
  });

  it('never re-seeds a toast in flight whose layout did not change, so its move runs on', () => {
    render(<Toaster />);
    for (const id of ['a', 'b', 'c']) show(id);
    progress(0.5);
    const b = itemOf('b');
    const inFlight = motion.get(b);
    expect(inFlight).toBe(-30);
    // Removing the furthest toast moves no survivor: `b` keeps its own transition as it was.
    close('a');
    log = [];
    advance();
    expect(seeds()).toEqual([]);
    expect(motion.get(b)).toBe(inFlight);
  });
});

describe('revival and replacement (S3)', () => {
  it('a revival with new, taller content moves nothing, and the next move starts fresh', () => {
    holding = true;
    render(<Toaster />);
    show('a');
    show('b');
    show('c');
    progress(0.5);
    const node = itemOf('b');
    close('b');
    log = [];
    heights.set('b again', 120);
    act(() => {
      toast('b again', { id: 'b', duration: Infinity });
    });
    advance();
    expect(itemOf('b again')).toBe(node);
    expect(phaseOf('b')).toBe('visible');
    expect(seeds()).toEqual([]);
    expectAtRest();
    // The size change itself is not animated; the next membership move is continuous from the
    // fresh geometry.
    expectOnlyRequiredReversals(retarget(() => show('d')));
    settle();
    expectAtRest();
  });

  it('a replacement that resizes moves nothing; the next move starts from the new geometry', () => {
    holding = true;
    render(<Toaster />);
    show('a');
    show('b');
    log = [];
    heights.set('b, longer', 140);
    act(() => {
      toast('b, longer', { id: 'b', duration: Infinity });
    });
    expect(seeds()).toEqual([]);
    retarget(() => show('c'));
    settle();
    expectAtRest();
  });

  it('a commit at one list never makes another list animate its own size change', () => {
    render(<Toaster />);
    show('x', 'bottom-left');
    show('y', 'bottom-left');
    show('a', 'top-right');
    show('b', 'top-right');
    log = [];
    heights.set('y, longer', 120);
    act(() => {
      toast('y, longer', { id: 'y', position: 'bottom-left', duration: Infinity });
    });
    expect(seeds()).toEqual([]);
  });
});

describe('relocation (S3)', () => {
  it.each<[ToastPosition, ToastPosition]>([
    ['top-right', 'bottom-left'],
    ['top-right', 'top-left'],
  ])('from %s to %s: each list moves its own survivors; the arrival is new', (from, to) => {
    holding = true;
    render(<Toaster />);
    show('x', to);
    show('y', to, 70);
    for (const id of ['a', 'b', 'c']) show(id, from);
    const old = itemOf('b');
    log = [];
    act(() => {
      toast('b', { id: 'b', position: to, duration: Infinity });
    });
    // The relocation exits from the old list first: its slot is kept, nothing moves yet.
    expect(seeds()).toEqual([]);
    expect(old.isConnected).toBe(true);
    const moves = retarget(() => advance());
    expectOnlyRequiredReversals(moves);
    const arrived = itemOf('b');
    expect(arrived).not.toBe(old);
    expect(arrived.parentElement).toBe(listAt(to));
    expect(old.isConnected).toBe(false);
    // The arrival is never seeded as if it crossed the screen; only survivors move.
    expect(seeds().some(seed => seed.startsWith('seed b '))).toBe(false);
    const moved = seeds().map(seed => seed.split(' ')[1]);
    expect(moved).toContain('a');
    expect(new Set(moved)).toEqual(new Set(['a', 'x', 'y']));
    expect(titlesAt(to)).toEqual(to.startsWith('top-') ? ['b', 'y', 'x'] : ['x', 'y', 'b']);
    settle();
    expectAtRest();
  });
});

/** Lets a Toaster's deferred detach run (a microtask), and the takeover render. */
async function detached(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
  });
}

describe('detach, unmount and ownership (S3)', () => {
  beforeEach(() => {
    FakeResizeObserver.current = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  const live = () => FakeResizeObserver.current.filter(observer => !observer.disconnected);

  it('releases a toast removed mid-move, and keeps no inline style anywhere', () => {
    holding = true;
    render(<Toaster />);
    show('a');
    show('b');
    show('c');
    expect(motion.has(itemOf('a'))).toBe(true);
    const a = itemOf('a');
    close('a');
    advance();
    expect(a.isConnected).toBe(false);
    expect(live()).toHaveLength(1);
    expect([...live()[0]!.observed]).not.toContain(a);
    expectAtRest();
  });

  it('disconnects every list observer when the Toaster unmounts mid-move', () => {
    holding = true;
    const view = render(<Toaster />);
    show('a', 'top-right');
    show('b', 'top-right');
    show('x', 'bottom-left');
    show('y', 'bottom-left');
    expect(live()).toHaveLength(2);
    view.unmount();
    expect(live()).toHaveLength(0);
  });

  it('starts fresh after a remount: no move from geometry the old lists measured', async () => {
    const first = render(<Toaster />);
    for (const id of ['a', 'b', 'c']) show(id);
    first.unmount();
    await detached();
    // While no Toaster is mounted the stack changes: `b` is removed.
    act(() => dismiss('b'));
    advance();
    log = [];
    render(<Toaster />);
    await detached();
    advance();
    expect(seeds()).toEqual([]);
    expect(titlesAt('top-right')).toEqual(['c', 'a']);
    // The first membership move after the remount starts from the remounted layout.
    holding = true;
    retarget(() => show('d'));
    expect(seeds()).toEqual([
      'seed c transform: translateY(-60px)',
      'seed a transform: translateY(-60px)',
    ]);
  });

  it('a takeover renders fresh lists that move nothing on arrival', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first = render(<Toaster />);
    render(<Toaster />);
    for (const id of ['a', 'b']) show(id);
    const owned = live().length;
    log = [];
    first.unmount();
    await detached();
    advance();
    expect(seeds()).toEqual([]);
    expect(titlesAt('top-right')).toEqual(['b', 'a']);
    expect(live()).toHaveLength(owned);
    show('c');
    expect(seeds()).toEqual([
      'seed b transform: translateY(-60px)',
      'seed a transform: translateY(-60px)',
    ]);
  });
});

describe('StrictMode (S3)', () => {
  beforeEach(() => {
    FakeResizeObserver.current = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  /** The same membership scenario, returning its full seed, flush and release log. */
  function scenario(strict: boolean) {
    const error = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    const toaster = <Toaster maxVisible={2} />;
    const view = render(strict ? <StrictMode>{toaster}</StrictMode> : toaster);
    log = [];
    show('a', 'top-right');
    show('b', 'top-right', 70);
    show('c', 'top-right', 30);
    show('x', 'bottom-left');
    show('y', 'bottom-left');
    close('a');
    advance();
    const logged = [...log];
    const created = FakeResizeObserver.current.length;
    const disconnected = FakeResizeObserver.current.filter(o => o.disconnected).length;
    view.unmount();
    const leftOver = FakeResizeObserver.current.filter(o => !o.disconnected).length;
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
    act(() => resetStore());
    FakeResizeObserver.current = [];
    return { logged, created, disconnected, leftOver };
  }

  it('makes exactly the same seeds, flushes and releases as without StrictMode', () => {
    const normal = scenario(false);
    const strict = scenario(true);
    expect(normal.logged.length).toBeGreaterThan(0);
    expect(strict.logged).toEqual(normal.logged);
  });

  it('keeps observers balanced: one live per list, the replayed one disconnected, none left', () => {
    const normal = scenario(false);
    const strict = scenario(true);
    expect(normal).toMatchObject({ created: 2, disconnected: 0, leftOver: 0 });
    // Each list's observer effect is set up, cleaned up and set up again on mount.
    expect(strict).toMatchObject({ created: 4, disconnected: 2, leftOver: 0 });
  });
});

describe('renders, focus and global resources (S3)', () => {
  it('a ResizeObserver refresh renders nothing', () => {
    FakeResizeObserver.current = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    let commits = 0;
    render(
      <Profiler id="toaster" onRender={() => commits++}>
        <Toaster />
      </Profiler>
    );
    show('a');
    show('b');
    const before = commits;
    heights.set('a', 90);
    act(() => FakeResizeObserver.current[0]!.callback());
    expect(commits).toBe(before);
  });

  it('interruption renders no more than the same changes without any motion', () => {
    const run = (withMotion: boolean) => {
      holding = withMotion;
      let commits = 0;
      const view = render(
        <Profiler id="toaster" onRender={() => commits++}>
          <Toaster maxVisible={3} />
        </Profiler>
      );
      show('a');
      show('b', 'top-right', 70);
      progress(0.5);
      show('c');
      progress(0.5);
      close('b');
      advance();
      show('d');
      show('e');
      close('a');
      advance();
      view.unmount();
      act(() => resetStore());
      settle();
      return commits;
    };
    const moving = run(true);
    expect(seeds()).not.toEqual([]);
    for (const [target, key, descriptor] of saved.reverse()) {
      Object.defineProperty(target, key, descriptor);
    }
    saved.length = 0;
    log = [];
    expect(run(false)).toBe(moving);
  });

  it('never moves focus: a membership move keeps focus where it is', () => {
    holding = true;
    render(
      <>
        <button type="button">outside</button>
        <Toaster closeButton />
      </>
    );
    show('a');
    show('b');
    const close = itemOf('a').querySelector('.ret-toast__close') as HTMLButtonElement;
    act(() => close.focus());
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    show('c');
    progress(0.5);
    show('d');
    expect(seeds().length).toBeGreaterThan(0);
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(close);
    focus.mockRestore();
  });

  /** Closes the toast whose close button has focus, and returns where focus went, by title. */
  function restoreAfterClose(withMotion: boolean): string {
    holding = withMotion;
    const view = render(<Toaster closeButton />);
    for (const id of ['a', 'b', 'c']) show(id);
    progress(0.5);
    const button = itemOf('b').querySelector('.ret-toast__close') as HTMLButtonElement;
    act(() => button.focus());
    act(() => button.click());
    // Restoration happened before `inert`, as the exit began, and repositioning changed nothing.
    expect(itemOf('b').hasAttribute('inert')).toBe(true);
    const during = document.activeElement;
    advance();
    expect(document.activeElement).toBe(during);
    const where = `${titleOf(during!.closest('li')!)} ${during!.className}`;
    view.unmount();
    act(() => resetStore());
    settle();
    return where;
  }

  it('restores focus on close exactly as without repositioning', () => {
    const moving = restoreAfterClose(true);
    expect(seeds()).not.toEqual([]);
    for (const [target, key, descriptor] of saved.reverse()) {
      Object.defineProperty(target, key, descriptor);
    }
    saved.length = 0;
    expect(restoreAfterClose(false)).toBe(moving);
    expect(moving).toBe('a ret-toast__close');
  });

  it('keeps Alt+T on the first toast while its neighbours move', () => {
    holding = true;
    render(<Toaster />);
    show('a');
    show('b');
    progress(0.5);
    add('c');
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'KeyT', key: '†', altKey: true, bubbles: true })
      );
    });
    expect(document.activeElement).toBe(itemOf('c'));
  });

  it('adds no window or document listener, MutationObserver or frame callback', () => {
    holding = true;
    const windowAdd = vi.spyOn(window, 'addEventListener');
    const documentAdd = vi.spyOn(document, 'addEventListener');
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const observers: string[] = [];
    const Real = window.MutationObserver;
    vi.stubGlobal(
      'MutationObserver',
      class extends Real {
        constructor(callback: MutationCallback) {
          super(callback);
          observers.push(new Error().stack ?? '');
        }
      }
    );
    render(<Toaster maxVisible={2} />);
    // The Toaster's own fixed global listeners (P-15 blur, focus, visibilitychange; P-16 keydown).
    // React DOM adds its own document `selectionchange` listener with the first root.
    const fixed = [...windowAdd.mock.calls, ...documentAdd.mock.calls]
      .map(([type]) => type)
      .filter(type => type !== 'selectionchange')
      .sort();
    expect(fixed).toEqual(['blur', 'focus', 'keydown', 'visibilitychange']);
    windowAdd.mockClear();
    documentAdd.mockClear();
    show('a');
    show('b', 'top-right', 70);
    progress(0.5);
    show('c');
    close('a');
    advance();
    show('d', 'bottom-left');
    show('e', 'bottom-left');
    expect(seeds()).not.toEqual([]);
    expect(windowAdd).not.toHaveBeenCalled();
    expect(documentAdd).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
    // P-19 creates none. The only ones are P-15's, one per toast for its focus-within pause.
    expect(
      observers.filter(stack => /react\/(reposition|useStackReposition)\.ts/.test(stack))
    ).toEqual([]);
    expect(observers.every(stack => stack.includes('useFocusWithinPause'))).toBe(true);
    expect(observers).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------------------------
// P-19 S4: reduced motion. The policy is CSS only (styles.test.ts): under
// `prefers-reduced-motion: reduce` the reposition transition takes no time. jsdom evaluates no
// media query, so these tests show what JavaScript does, which is the same either way, and what a
// zero-duration transition means for it: a released seed ends at once.
// ---------------------------------------------------------------------------------------------

/** The same membership changes at a top and a bottom list, returning the full log. */
function membershipScenario(): string[] {
  const view = render(<Toaster maxVisible={3} />);
  log = [];
  show('a');
  show('b', 'top-right', 70);
  show('c', 'top-right', 30);
  show('d');
  show('x', 'bottom-left');
  show('y', 'bottom-left', 90);
  close('b');
  advance();
  show('z', 'bottom-left');
  const logged = [...log];
  view.unmount();
  act(() => resetStore());
  settle();
  return logged;
}

describe('reduced motion (S4)', () => {
  it('runs the same seed, flush and release whatever the motion preference', () => {
    const normal = membershipScenario();
    // Even a page that reports reduced motion to any script changes nothing: no script asks.
    const media = vi.fn((query: string) => ({ matches: true, media: query }) as MediaQueryList);
    vi.stubGlobal('matchMedia', media);
    const reduced = membershipScenario();
    expect(normal.filter(entry => entry.startsWith('seed')).length).toBeGreaterThan(0);
    expect(reduced).toEqual(normal);
    expect(media).not.toHaveBeenCalled();
  });

  it('puts every survivor at its new layout position at once when the transition takes no time', () => {
    // `holding` off: a released seed ends at once, as a zero-duration transition does. Computed
    // styles say so too, so a script that looked would see it; the path must not change.
    holding = false;
    reducedMotion = true;
    render(<Toaster maxVisible={6} />);
    for (const id of ['a', 'b', 'c']) show(id, 'bottom-right', id === 'b' ? 80 : undefined);
    for (const step of [
      () => show('d', 'bottom-right', 60),
      () => {
        close('b');
        advance();
      },
      () => show('e', 'bottom-right'),
    ]) {
      log = [];
      step();
      // Still seeded and released by the same path; nothing is left in flight or inline.
      expect(log).toContain('flush');
      expect(motion.size).toBe(0);
      for (const item of toastsOf(listAt('bottom-right'))) {
        expect(visualOf(item)).toBe(layoutOf(item));
      }
      expectAtRest();
    }
  });

  it('gates no lifecycle step: enter, exit, removal and promotion keep their timing', () => {
    const run = () => {
      const phases: string[] = [];
      const view = render(<Toaster maxVisible={2} />);
      show('a');
      show('b');
      act(() => {
        toast('c', { id: 'c', duration: Infinity });
      });
      phases.push(`${phaseOf('c')}`);
      close('a');
      phases.push(`${phaseOf('a')} ${phaseOf('c')}`);
      advance();
      phases.push(`${phaseOf('a')} ${phaseOf('c')}`);
      advance();
      phases.push(`${phaseOf('c')}`);
      view.unmount();
      act(() => resetStore());
      return phases;
    };
    const moving = run();
    expect(seeds()).not.toEqual([]);
    expect(moving).toEqual(['queued', 'exiting queued', 'undefined entering', 'visible']);
    for (const [target, key, descriptor] of saved.reverse()) {
      Object.defineProperty(target, key, descriptor);
    }
    saved.length = 0;
    expect(run()).toEqual(moving);
  });
});

describe('P-18 completion reads no P-19 layout (S4)', () => {
  /** A native `animationend` for the toast root, as a browser would dispatch it. */
  function animationEnd(target: Element, animationName: string) {
    const event = new Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: animationName });
    act(() => {
      target.dispatchEvent(event);
    });
  }

  it('completes enters and exits, by event and by fallback, with no layout read of its own', () => {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 100;
    try {
      render(<Toaster />);
      show('a');
      traces = [];
      // Enter completed by its event, then by the fallback; exits likewise.
      act(() => {
        toast('b', { id: 'b', duration: Infinity });
      });
      animationEnd(itemOf('b'), 'ret-enter-top');
      expect(phaseOf('b')).toBe('visible');
      add('c');
      advance();
      expect(phaseOf('c')).toBe('visible');
      close('b');
      animationEnd(itemOf('b'), 'ret-exit-top');
      expect(phaseOf('b')).toBeUndefined();
      close('c');
      advance();
      expect(phaseOf('c')).toBeUndefined();
      // P-19 did measure (its commits), so the instrumentation saw layout reads...
      expect(traces.length).toBeGreaterThan(0);
      // ...and every one came from the list's layout effect, none from the completion path.
      for (const stack of traces) {
        expect(stack).not.toMatch(/onAnimationEnd|lifecycleFallback|fallbackDelay/);
        expect(stack).toMatch(/useStackReposition/);
      }
    } finally {
      Error.stackTraceLimit = limit;
      traces = null;
    }
  });

  it('keeps the completion modules apart from P-19: neither imports its geometry', () => {
    for (const file of ['src/react/motion.ts', 'src/react/ToastItem.tsx']) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      expect(source).not.toMatch(/reposition|useStackReposition/);
    }
  });
});
