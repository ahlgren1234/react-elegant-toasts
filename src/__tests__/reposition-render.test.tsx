// Stack repositioning in the renderer (§22, P-19 S2, D2 decisions 2 to 6). jsdom lays nothing
// out, so a stand-in flex column computes each toast root's layout-space offsets from the live
// DOM, as a browser would, and every inline style write on a toast root is recorded. The seed,
// the one flush and the release then show up in order, and the rest state is checked directly.
import { act, render, screen } from '@testing-library/react';
import { Profiler, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from '../index';
import { dismiss, inspectRecords, resetStore } from '../store/store';
import type { ToastPosition } from '../types';

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
      if (!isToast(this)) return real;
      const name = titleOf(this);
      return new Proxy(real, {
        get(target, key) {
          if (key === 'setProperty') {
            return (property: string, value: string) => {
              log.push(`seed ${name} ${property}: ${value}`);
              target.setProperty(property, value);
            };
          }
          if (key === 'removeProperty') {
            return (property: string) => {
              log.push(`release ${name} ${property}`);
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
    },
    set(this: HTMLElement, value: string) {
      style.set!.call(this, value);
    },
  });
}

const seeds = () => log.filter(entry => entry.startsWith('seed') && entry.includes('transform'));

beforeEach(() => {
  vi.useFakeTimers();
  heights.clear();
  log = [];
  reads = false;
  traces = null;
  installLayout();
  recordStyleWrites();
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
