// Stack repositioning geometry (P-19 S1, D2 decisions 3 and 4): anchored distances, the
// displacement sign, transform parsing, list measurement, the cache and the ResizeObserver
// helper, apart from React. jsdom lays nothing out, so geometry is stubbed on the elements.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  anchoredDistance,
  currentTranslationOf,
  displacement,
  edgeOf,
  measureList,
  membershipChanged,
  remember,
  watchResize,
  type GeometryCache,
} from '../react/reposition';
import { translationOf } from '../react/swipe';
import type { ToastPosition } from '../types';

const root = path.resolve(__dirname, '../..');
const SOURCE = fs.readFileSync(path.join(root, 'src/react/reposition.ts'), 'utf8');

const define = (element: Element, values: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(element, key, { configurable: true, value });
  }
};

/** A position's `<ol>` with one `<li>` per box, laid out in it as a browser would report. */
function stack(boxes: readonly (readonly [top: number, height: number])[], height: number) {
  const list = document.createElement('ol');
  document.body.append(list);
  define(list, { clientHeight: height });
  const items = boxes.map(([top, itemHeight]) => {
    const item = document.createElement('li');
    list.append(item);
    place(item, list, top, itemHeight);
    return item;
  });
  return { list, items };
}

function place(item: HTMLElement, list: HTMLElement | null, top: number, height: number) {
  define(item, { offsetParent: list, offsetTop: top, offsetHeight: height });
}

// Three toasts of different heights with a 10px gap, filling a 200px list.
const BOXES = [
  [0, 50],
  [60, 70],
  [140, 60],
] as const;

afterEach(() => {
  document.body.replaceChildren();
});

describe('edgeOf', () => {
  it.each<[ToastPosition, string]>([
    ['top-left', 'top'],
    ['top-center', 'top'],
    ['top-right', 'top'],
    ['bottom-left', 'bottom'],
    ['bottom-center', 'bottom'],
    ['bottom-right', 'bottom'],
  ])('anchors %s at the %s edge, whatever its horizontal placement', (position, edge) => {
    expect(edgeOf(position)).toBe(edge);
  });
});

describe('anchoredDistance', () => {
  it('measures a top stack from the list top to the toast top', () => {
    expect(anchoredDistance('top', 0, 50, 200)).toBe(0);
    expect(anchoredDistance('top', 60, 70, 200)).toBe(60);
    expect(anchoredDistance('top', 140, 60, 200)).toBe(140);
  });

  it('measures a bottom stack from the list bottom to the toast bottom', () => {
    expect(anchoredDistance('bottom', 0, 50, 200)).toBe(150);
    expect(anchoredDistance('bottom', 60, 70, 200)).toBe(70);
    expect(anchoredDistance('bottom', 140, 60, 200)).toBe(0);
  });

  it('is zero for the toast at the anchored edge, whatever its height', () => {
    for (const height of [1, 48, 240]) {
      expect(anchoredDistance('top', 0, height, 500)).toBe(0);
      expect(anchoredDistance('bottom', 500 - height, height, 500)).toBe(0);
    }
  });

  it("never depends on the toast's own height at the top, nor on the list's height", () => {
    expect(anchoredDistance('top', 60, 10, 100)).toBe(anchoredDistance('top', 60, 300, 900));
  });

  it("keeps a bottom toast's distance when only a toast farther from the edge grows", () => {
    // Bottom stacks grow upward: a taller toast above moves the list top, not the toast below it.
    const before = anchoredDistance('bottom', 60, 70, 200);
    const after = anchoredDistance('bottom', 90, 70, 230);
    expect(after).toBe(before);
  });

  it('keeps fractional values', () => {
    expect(anchoredDistance('top', 12.5, 40.25, 0)).toBe(12.5);
    expect(anchoredDistance('bottom', 12.5, 40.25, 100.75)).toBe(48);
  });
});

describe('displacement', () => {
  it('moves a top toast pushed away from the edge back up (negative)', () => {
    expect(displacement('top', 0, 60)).toBe(-60);
    expect(displacement('top', 60, 0)).toBe(60);
  });

  it('moves a bottom toast pushed away from the edge back down (positive)', () => {
    expect(displacement('bottom', 0, 70)).toBe(70);
    expect(displacement('bottom', 70, 0)).toBe(-70);
  });

  it('is zero when the toast did not move', () => {
    expect(displacement('top', 60, 60)).toBe(0);
    expect(displacement('bottom', 70, 70)).toBe(0);
  });
});

describe('membershipChanged', () => {
  it.each<[string, readonly string[], readonly string[], boolean]>([
    ['the same IDs in the same order', ['a', 'b', 'c'], ['a', 'b', 'c'], false],
    ['an insertion at the edge', ['a', 'b'], ['c', 'a', 'b'], true],
    ['an insertion at the far end', ['a', 'b'], ['a', 'b', 'c'], true],
    ['a removal', ['a', 'b', 'c'], ['a', 'c'], true],
    ['an insertion and a removal at once', ['a', 'b', 'c'], ['d', 'a', 'b'], true],
    ['a replacement of one ID by another', ['a', 'b'], ['a', 'x'], true],
    ['a different order', ['a', 'b', 'c'], ['a', 'c', 'b'], true],
    ['a reversal', ['a', 'b'], ['b', 'a'], true],
    ['empty to populated', [], ['a'], true],
    ['populated to empty', ['a'], [], true],
    ['empty to empty', [], [], false],
  ])('%s: %j to %j is %s', (_, previous, next, changed) => {
    expect(membershipChanged(previous, next)).toBe(changed);
  });

  it('ignores everything but the IDs: phase changes, revival and replaced content', () => {
    const before = [
      { id: 'a', phase: 'visible', title: 'Saving' },
      { id: 'b', phase: 'exiting', title: 'Old' },
    ];
    const after = [
      { id: 'a', phase: 'exiting', title: 'Saved' },
      { id: 'b', phase: 'entering', title: 'Revived' },
    ];
    expect(
      membershipChanged(
        before.map(view => view.id),
        after.map(view => view.id)
      )
    ).toBe(false);
  });

  it('compares by value, not by array identity', () => {
    const ids = ['a', 'b'];
    expect(membershipChanged(ids, ids)).toBe(false);
    expect(membershipChanged(ids, [...ids])).toBe(false);
  });
});

// P-21 S3 (D2 decision 12): P-19 reads both components of the composed root transform, through
// the one matrix reader the swipe also uses. Every case of the former vertical-only reader stands.
describe('the composed matrix reader (translationOf)', () => {
  it.each<[string, number, number]>([
    ['none', 0, 0],
    ['matrix(1, 0, 0, 1, 0, 0)', 0, 0],
    ['matrix(1, 0, 0, 1, 7, 24)', 7, 24],
    ['matrix(1, 0, 0, 1, 7, -24)', 7, -24],
    ['matrix(1, 0, 0, 1, 0, -12.375)', 0, -12.375],
    ['matrix(1,0,0,1,0,3.5)', 0, 3.5],
    ['  matrix(1, 0, 0, 1, 0, 8)  ', 0, 8],
    ['matrix(1, 0, 0, 1, 0, 1e-5)', 0, 0.00001],
    ['matrix(0.98, 0, 0, 0.98, 0, 16)', 0, 16],
    ['matrix(1, 0, 0, 1, -142.5, 19.6)', -142.5, 19.6],
    ['matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, -40, 3, 1)', 7, -40],
    ['matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)', 0, 0],
    ['matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2.25, 0, 1)', 0, 2.25],
  ])('reads %j as X %d and Y %d', (value, x, y) => {
    expect(translationOf(value)).toEqual({ x, y });
  });

  // The safe fallback is (0, 0), "no offset in flight": never NaN and never a throw.
  it.each([
    '',
    'auto',
    'matrix()',
    'matrix(1, 0, 0, 1, 0)',
    'matrix(1, 0, 0, 1, 0, 5, 9)',
    'matrix(1, 0, 0, 1, 0, )',
    'matrix(1, 0, 0, 1, 0, abc)',
    'matrix(1, 0, 0, 1, 0, 5px)',
    'matrix(1, 0, 0, 1, 0, NaN)',
    'matrix(1, 0, 0, 1, 0, Infinity)',
    'matrix(1, 0, 0, 1, Infinity, 5)',
    'matrix(1, 0, 0, 1, 0, 5',
    'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 5, 0)',
    'matrix3d(1, 0, 0, 1, 0, 5)',
    'translateY(10px)',
    'translate(0, 10px)',
    'scale(0.98)',
    'rotate(45deg)',
    'MATRIX(1, 0, 0, 1, 0, 5)',
  ])('reads the unsupported or malformed %j as (0, 0)', value => {
    expect(translationOf(value)).toEqual({ x: 0, y: 0 });
  });
});

describe('currentTranslationOf', () => {
  it("reads the root's resolved transform from its own window, both components", () => {
    const item = document.createElement('li');
    const read = vi
      .spyOn(window, 'getComputedStyle')
      .mockReturnValue({ transform: 'matrix(1, 0, 0, 1, 33, -18)' } as CSSStyleDeclaration);
    expect(currentTranslationOf(item)).toEqual({ x: 33, y: -18 });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(item);
    read.mockRestore();
  });

  it('reads (0, 0) from jsdom, which resolves no matrix', () => {
    const item = document.createElement('li');
    document.body.append(item);
    item.style.transform = 'translate(20px, 12px)';
    expect(currentTranslationOf(item)).toEqual({ x: 0, y: 0 });
  });

  it('reads (0, 0) for a root whose document has no window', () => {
    const item = document.implementation.createHTMLDocument().createElement('li');
    expect(currentTranslationOf(item)).toEqual({ x: 0, y: 0 });
  });
});

describe('measureList', () => {
  it('measures every toast root of a top stack, in DOM order', () => {
    const { list, items } = stack(BOXES, 200);
    expect(measureList(list, 'top')).toEqual([
      { item: items[0], distance: 0 },
      { item: items[1], distance: 60 },
      { item: items[2], distance: 140 },
    ]);
  });

  it('measures every toast root of a bottom stack from the list bottom', () => {
    const { list, items } = stack(BOXES, 200);
    expect(measureList(list, 'bottom')).toEqual([
      { item: items[0], distance: 150 },
      { item: items[1], distance: 70 },
      { item: items[2], distance: 0 },
    ]);
  });

  it('returns the live roots themselves, so a surviving toast keeps its identity', () => {
    const { list, items } = stack(BOXES, 200);
    const first = measureList(list, 'top');
    place(items[1]!, list, 80, 90);
    const second = measureList(list, 'top');
    expect(second.map(m => m.item)).toEqual(first.map(m => m.item));
    expect(second[1]!.item).toBe(items[1]);
  });

  it('is empty for an empty list', () => {
    const { list } = stack([], 0);
    expect(measureList(list, 'top')).toEqual([]);
    expect(measureList(list, 'bottom')).toEqual([]);
  });

  it("counts only the list's own <li> children, not list items inside custom content", () => {
    const { list, items } = stack([[0, 50]], 50);
    const nested = document.createElement('li');
    const content = document.createElement('ul');
    content.append(nested);
    items[0]!.append(content);
    place(nested, list, 10, 10);
    const other = document.createElement('div');
    list.append(other);
    expect(measureList(list, 'top').map(m => m.item)).toEqual([items[0]]);
  });

  it('gives no distance to a root that is not laid out in its list', () => {
    const { list, items } = stack(BOXES, 200);
    place(items[1]!, null, 0, 0);
    expect(measureList(list, 'top')).toEqual([
      { item: items[0], distance: 0 },
      { item: items[1], distance: undefined },
      { item: items[2], distance: 140 },
    ]);
  });

  it('reads each root once and the list height once, in one pass', () => {
    const { list, items } = stack(BOXES, 200);
    const reads: string[] = [];
    const spy = (element: Element, name: string, key: string, value: unknown) =>
      Object.defineProperty(element, key, {
        configurable: true,
        get: () => {
          reads.push(`${name}.${key}`);
          return value;
        },
      });
    spy(list, 'list', 'clientHeight', 200);
    items.forEach((item, index) => {
      const [top, height] = BOXES[index]!;
      spy(item, `li${index}`, 'offsetParent', list);
      spy(item, `li${index}`, 'offsetTop', top);
      spy(item, `li${index}`, 'offsetHeight', height);
    });
    measureList(list, 'bottom');
    expect(reads).toEqual([
      'list.clientHeight',
      ...[0, 1, 2].flatMap(index => [
        `li${index}.offsetParent`,
        `li${index}.offsetTop`,
        `li${index}.offsetHeight`,
      ]),
    ]);
  });

  it('reads layout-space offsets only: no rect, computed style or frame callback', () => {
    const { list, items } = stack(BOXES, 200);
    // P-18's individual properties and P-19's own transform play no part in the measurement.
    for (const item of items) {
      item.style.setProperty('translate', '0 -8px');
      item.style.setProperty('scale', '0.98');
      item.style.transform = 'translateY(40px)';
    }
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    const style = vi.spyOn(window, 'getComputedStyle');
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    expect(measureList(list, 'top').map(m => m.distance)).toEqual([0, 60, 140]);
    expect(rect).not.toHaveBeenCalled();
    expect(style).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
    rect.mockRestore();
    style.mockRestore();
    raf.mockRestore();
  });

  it('writes nothing to the DOM', () => {
    const { list } = stack(BOXES, 200);
    const observer = new MutationObserver(() => {});
    observer.observe(list, { subtree: true, attributes: true, childList: true });
    measureList(list, 'top');
    measureList(list, 'bottom');
    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
    for (const element of [list, ...list.children]) {
      expect(element.hasAttribute('style')).toBe(false);
    }
  });
});

describe('the geometry cache', () => {
  it('is populated from a measurement and returns each root its distance', () => {
    const { list, items } = stack(BOXES, 200);
    const cache: GeometryCache = new WeakMap();
    remember(cache, measureList(list, 'bottom'));
    expect(items.map(item => cache.get(item))).toEqual([150, 70, 0]);
  });

  it('is refreshed by a later measurement: changed geometry replaces the old', () => {
    const { list, items } = stack(BOXES, 200);
    const cache: GeometryCache = new WeakMap();
    remember(cache, measureList(list, 'top'));
    // The middle toast's content wraps onto another line: it grows, and the one after it moves.
    place(items[1]!, list, 60, 100);
    place(items[2]!, list, 170, 60);
    remember(cache, measureList(list, 'top'));
    expect(items.map(item => cache.get(item))).toEqual([0, 60, 170]);
  });

  it('keeps the previous distance until refreshed, for the next move to start from', () => {
    const { list, items } = stack(BOXES, 200);
    const cache: GeometryCache = new WeakMap();
    remember(cache, measureList(list, 'top'));
    // A new toast at the edge pushes the others down; the cache still holds where they were.
    const added = document.createElement('li');
    list.prepend(added);
    place(added, list, 0, 40);
    place(items[0]!, list, 50, 50);
    place(items[1]!, list, 110, 70);
    place(items[2]!, list, 190, 60);
    const now = measureList(list, 'top');
    expect(now.map(m => cache.get(m.item))).toEqual([undefined, 0, 60, 140]);
    expect(now.map(m => m.distance)).toEqual([0, 50, 110, 190]);
  });

  it('forgets a root that can no longer be measured, so no stale distance survives', () => {
    const { list, items } = stack(BOXES, 200);
    const cache: GeometryCache = new WeakMap();
    remember(cache, measureList(list, 'top'));
    place(items[0]!, null, 0, 0);
    remember(cache, measureList(list, 'top'));
    expect(cache.has(items[0]!)).toBe(false);
    expect(cache.get(items[1]!)).toBe(60);
  });

  it('holds its roots weakly, so a detached root is never kept alive by it', () => {
    const { list, items } = stack(BOXES, 200);
    const cache: GeometryCache = new WeakMap();
    remember(cache, measureList(list, 'top'));
    expect(cache).toBeInstanceOf(WeakMap);
    // A removed root is no longer measured, and nothing enumerates the cache to find it again.
    items[0]!.remove();
    expect(measureList(list, 'top').map(m => m.item)).toEqual([items[1], items[2]]);
  });

  it('is plain data: refreshing it touches no DOM and needs no React', () => {
    expect(SOURCE).not.toMatch(/from 'react'|useState|useReducer|setState/);
    const { list } = stack(BOXES, 200);
    const observer = new MutationObserver(() => {});
    observer.observe(list, { subtree: true, attributes: true });
    remember(new WeakMap(), measureList(list, 'top'));
    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
  });
});

/** A local ResizeObserver: jsdom has none, and no global polyfill is installed. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observed = new Set<Element>();
  readonly calls: string[] = [];
  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.calls.push('observe');
    this.observed.add(target);
  }
  unobserve(target: Element) {
    this.calls.push('unobserve');
    this.observed.delete(target);
  }
  disconnect() {
    this.calls.push('disconnect');
    this.observed.clear();
  }
  /** Reports a size change of every observed root, as the browser would. */
  resize() {
    const entries = [...this.observed].map(target => ({ target }) as ResizeObserverEntry);
    this.callback(entries, this);
  }
}

function withResizeObserver(): () => FakeResizeObserver {
  FakeResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  return () => {
    const [observer] = FakeResizeObserver.instances;
    if (!observer) throw new Error('no ResizeObserver was created');
    return observer;
  };
}

describe('watchResize', () => {
  it('does nothing without ResizeObserver, and never throws', () => {
    expect(typeof ResizeObserver).toBe('undefined');
    const { items } = stack(BOXES, 200);
    const onResize = vi.fn();
    const watch = watchResize(onResize);
    expect(() => {
      watch.sync(items);
      watch.sync([]);
      watch.disconnect();
    }).not.toThrow();
    expect(onResize).not.toHaveBeenCalled();
  });

  it('creates no observer until asked, and one per watch', () => {
    withResizeObserver();
    expect(FakeResizeObserver.instances).toHaveLength(0);
    watchResize(() => {});
    expect(FakeResizeObserver.instances).toHaveLength(1);
  });

  it('observes exactly the roots it is given, each once', () => {
    const observer = withResizeObserver();
    const { items } = stack(BOXES, 200);
    const watch = watchResize(() => {});
    watch.sync(items);
    watch.sync(items);
    expect([...observer().observed]).toEqual(items);
    expect(observer().calls).toEqual(['observe', 'observe', 'observe']);
  });

  it('observes a new root and releases one that left, and only those', () => {
    const observer = withResizeObserver();
    const { list, items } = stack(BOXES, 200);
    const watch = watchResize(() => {});
    watch.sync(items);
    items[0]!.remove();
    const added = document.createElement('li');
    list.append(added);
    watch.sync([items[1]!, items[2]!, added]);
    expect([...observer().observed]).toEqual([items[1], items[2], added]);
    expect(observer().calls).toEqual(['observe', 'observe', 'observe', 'unobserve', 'observe']);
  });

  it('releases every root when its list empties', () => {
    const observer = withResizeObserver();
    const { items } = stack(BOXES, 200);
    const watch = watchResize(() => {});
    watch.sync(items);
    watch.sync([]);
    expect(observer().observed.size).toBe(0);
  });

  it('releases everything on disconnect, and can start over afterwards', () => {
    const observer = withResizeObserver();
    const { items } = stack(BOXES, 200);
    const watch = watchResize(() => {});
    watch.sync(items);
    watch.disconnect();
    expect(observer().observed.size).toBe(0);
    expect(observer().calls).toEqual(['observe', 'observe', 'observe', 'disconnect']);
    watch.sync([items[0]!]);
    expect([...observer().observed]).toEqual([items[0]]);
  });

  it('refreshes the cache on a size change, and moves nothing', () => {
    const observer = withResizeObserver();
    const { list, items } = stack(BOXES, 200);
    const cache: GeometryCache = new WeakMap();
    remember(cache, measureList(list, 'bottom'));
    const watch = watchResize(() => remember(cache, measureList(list, 'bottom')));
    watch.sync(items);
    const mutations = new MutationObserver(() => {});
    mutations.observe(list, { subtree: true, attributes: true, childList: true });
    // The toast at the edge rewraps taller; the bottom stack grows upward, pushing the others up.
    define(list, { clientHeight: 230 });
    place(items[2]!, list, 140, 90);
    observer().resize();
    expect(items.map(item => cache.get(item))).toEqual([180, 100, 0]);
    expect(mutations.takeRecords()).toEqual([]);
    mutations.disconnect();
    for (const item of items) expect(item.hasAttribute('style')).toBe(false);
  });

  it('calls back once per batch of entries, with no arguments', () => {
    const observer = withResizeObserver();
    const { items } = stack(BOXES, 200);
    const onResize = vi.fn();
    watchResize(onResize).sync(items);
    observer().resize();
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith();
  });
});

describe('the module boundary', () => {
  it('is internal: not reachable from the package entry', () => {
    expect(fs.readFileSync(path.join(root, 'src/index.ts'), 'utf8')).not.toMatch(/reposition/);
  });

  it('uses no rect, frame callback, media query, global listener or style write', () => {
    expect(SOURCE).not.toMatch(
      /getBoundingClientRect|requestAnimationFrame|matchMedia|addEventListener|\.style\b|setProperty|setAttribute|classList/
    );
  });
});
