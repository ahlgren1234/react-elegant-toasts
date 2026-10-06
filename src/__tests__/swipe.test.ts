// Swipe gesture decisions (§19, P-21 D0 and D2): the pure rules S2 and S3 build on. Physical
// directions, activation, clamping, the distance and velocity commits, the release decision and
// the opacity curve, plus the two small DOM reads for protected targets and selection.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activationOf,
  allowedDirections,
  allowedOffset,
  directionOf,
  distanceCommits,
  distanceThreshold,
  isDirectionAllowed,
  isSwipePointer,
  protectedTarget,
  releaseDecision,
  releaseVelocity,
  selectionIntersects,
  SWIPE_ACTIVATION_SLOP_PX,
  SWIPE_DISTANCE_MAX_PX,
  SWIPE_DISTANCE_WIDTH_FRACTION,
  SWIPE_DOMINANCE_RATIO,
  SWIPE_FADE_WIDTH_FRACTION,
  SWIPE_MIN_OPACITY,
  SWIPE_VELOCITY_THRESHOLD,
  SWIPE_VELOCITY_WINDOW_MS,
  swipeOpacity,
  type SwipeSample,
  velocityCommits,
} from '../react/swipe';
import type { ToastPosition } from '../types';

const LEFT_POSITIONS: readonly ToastPosition[] = ['top-left', 'bottom-left'];
const RIGHT_POSITIONS: readonly ToastPosition[] = ['top-right', 'bottom-right'];
const CENTRE_POSITIONS: readonly ToastPosition[] = ['top-center', 'bottom-center'];
const POSITIONS = [...LEFT_POSITIONS, ...RIGHT_POSITIONS, ...CENTRE_POSITIONS];

describe('the locked constants (D2)', () => {
  it('match the prototype values the maintainer approved on both devices', () => {
    expect({
      slop: SWIPE_ACTIVATION_SLOP_PX,
      dominance: SWIPE_DOMINANCE_RATIO,
      fraction: SWIPE_DISTANCE_WIDTH_FRACTION,
      cap: SWIPE_DISTANCE_MAX_PX,
      window: SWIPE_VELOCITY_WINDOW_MS,
      velocity: SWIPE_VELOCITY_THRESHOLD,
      fade: SWIPE_FADE_WIDTH_FRACTION,
      minOpacity: SWIPE_MIN_OPACITY,
    }).toEqual({
      slop: 10,
      dominance: 1.5,
      fraction: 0.4,
      cap: 100,
      window: 100,
      velocity: 0.4,
      fade: 0.8,
      minOpacity: 0.3,
    });
  });
});

describe('physical directions (§19, §20, D0 decision 2)', () => {
  it.each([
    ['top-left', [-1]],
    ['bottom-left', [-1]],
    ['top-right', [1]],
    ['bottom-right', [1]],
    ['top-center', [-1, 1]],
    ['bottom-center', [-1, 1]],
  ] as const)('%s allows %j', (position, expected) => {
    expect([...allowedDirections(position)]).toEqual(expected);
    for (const direction of [-1, 1] as const) {
      expect(isDirectionAllowed(position, direction)).toBe(
        (expected as readonly number[]).includes(direction)
      );
    }
  });

  it('never allows the zero direction', () => {
    for (const position of POSITIONS) expect(isDirectionAllowed(position, 0)).toBe(false);
  });

  it('reads a physical sign, 0 for zero and non-finite values', () => {
    expect([-3, -0.001, 0, -0, 0.001, 7].map(directionOf)).toEqual([-1, -1, 0, 0, 1, 1]);
    expect([NaN, Infinity, -Infinity].map(directionOf)).toEqual([0, 0, 0]);
  });

  it('has no notion of document direction, and reads no global, React or store', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../react/swipe.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bdir\b|:dir\(|\brtl\b|\bltr\b|getComputedStyle/i);
    expect(code).not.toMatch(/\b(window|document|navigator|globalThis|matchMedia|performance)\b/);
    expect(code).not.toMatch(/from 'react'|store\//);
  });
});

describe('pointer types (§19, D0 decision 10)', () => {
  it.each([
    ['touch', true],
    ['pen', true],
    ['mouse', false],
    ['', false],
    ['Touch', false],
    ['unknown', false],
  ])('%j → %s', (pointerType, expected) => {
    expect(isSwipePointer(pointerType)).toBe(expected);
  });
});

describe('activation (D2 decisions 1 and 15)', () => {
  it.each([
    // dx, dy, top-right, top-left, top-center
    [9.999, 0, 'pending', 'pending', 'pending'],
    [10, 0, 'activate', 'forbidden', 'activate'],
    [-10, 0, 'forbidden', 'activate', 'activate'],
    [15, 10, 'activate', 'forbidden', 'activate'], // exactly 1.5
    [14.999, 10, 'drop', 'drop', 'drop'], // just below 1.5, travel past the slop
    [-15, -10, 'forbidden', 'activate', 'activate'],
    [10, 6.6, 'activate', 'forbidden', 'activate'],
    [10, 6.7, 'drop', 'drop', 'drop'],
    [0, 10, 'drop', 'drop', 'drop'], // vertical: the browser scrolls
    [0, 9.999, 'pending', 'pending', 'pending'],
    [9, 5, 'pending', 'pending', 'pending'], // dominant, travel ≥ 10, but |dx| < 10
    [7, 7, 'pending', 'pending', 'pending'], // 45°, travel 9.9: not yet decided
  ] as const)('dx %s, dy %s', (dx, dy, right, left, centre) => {
    const kind = (position: ToastPosition) => activationOf(position, dx, dy).kind;
    expect(kind('top-right')).toBe(right);
    expect(kind('top-left')).toBe(left);
    expect(kind('top-center')).toBe(centre);
  });

  it('activates exactly at the slop and the ratio, not a hair before either', () => {
    expect(activationOf('top-right', 10, 0)).toEqual({ kind: 'activate', direction: 1 });
    expect(activationOf('top-right', 9.999, 0).kind).toBe('pending');
    expect(activationOf('top-right', 30, 20)).toEqual({ kind: 'activate', direction: 1 });
    expect(activationOf('top-right', 30, 20.001).kind).toBe('drop');
    expect(activationOf('bottom-left', -30, 20)).toEqual({ kind: 'activate', direction: -1 });
  });

  it('drops a 45° diagonal once it has travelled the slop', () => {
    expect(activationOf('top-center', 7.08, 7.08).kind).toBe('drop');
    expect(activationOf('top-center', 7, 7).kind).toBe('pending');
  });

  it('never activates in a forbidden direction, at any distance', () => {
    for (const position of RIGHT_POSITIONS) {
      expect(activationOf(position, -500, 0).kind).toBe('forbidden');
    }
    for (const position of LEFT_POSITIONS) {
      expect(activationOf(position, 500, 0).kind).toBe('forbidden');
    }
  });

  it('activates both ways at every centre position', () => {
    for (const position of CENTRE_POSITIONS) {
      expect(activationOf(position, -40, 5)).toEqual({ kind: 'activate', direction: -1 });
      expect(activationOf(position, 40, -5)).toEqual({ kind: 'activate', direction: 1 });
    }
  });

  it('stays pending for non-finite input', () => {
    expect(activationOf('top-right', NaN, 0).kind).toBe('pending');
    expect(activationOf('top-right', 50, NaN).kind).toBe('pending');
    expect(activationOf('top-right', Infinity, 0).kind).toBe('pending');
  });
});

describe('allowed offset (D0 decision 2)', () => {
  it.each([
    ['top-left', -80, -80],
    ['top-left', 80, 0],
    ['bottom-left', -0.5, -0.5],
    ['top-right', 80, 80],
    ['top-right', -80, 0],
    ['bottom-right', 0.5, 0.5],
    ['top-center', -80, -80],
    ['bottom-center', 80, 80],
  ] as const)('%s keeps %s as %s', (position, raw, expected) => {
    expect(allowedOffset(position, raw)).toBe(expected);
  });

  it('keeps zero at zero and has no maximum or rubber band in an allowed direction', () => {
    for (const position of POSITIONS) expect(allowedOffset(position, 0)).toBe(0);
    expect(allowedOffset('top-right', 5000)).toBe(5000);
    expect(allowedOffset('top-left', -5000)).toBe(-5000);
  });

  it('turns non-finite offsets into 0', () => {
    expect(allowedOffset('top-center', NaN)).toBe(0);
    expect(allowedOffset('top-center', Infinity)).toBe(0);
  });
});

describe('distance threshold (D2 decision 2)', () => {
  it.each([
    [200, 80],
    [249, 99.6],
    [250, 100],
    [251, 100],
    [350, 100],
    [100, 40],
  ])('width %s → %s px', (width, expected) => {
    expect(distanceThreshold(width)).toBeCloseTo(expected, 10);
  });

  it('uses the cap for an unusable width, never 0', () => {
    for (const width of [0, -10, NaN, -Infinity]) {
      expect(distanceThreshold(width)).toBe(SWIPE_DISTANCE_MAX_PX);
    }
    expect(distanceThreshold(Infinity)).toBe(SWIPE_DISTANCE_MAX_PX);
  });
});

describe('distance commit (D2 decision 2)', () => {
  it('commits at the threshold, inclusive, and not below it', () => {
    expect(distanceCommits('top-right', 80, 200)).toBe(true);
    expect(distanceCommits('top-right', 79.999, 200)).toBe(false);
    expect(distanceCommits('top-right', 100, 350)).toBe(true);
    expect(distanceCommits('top-right', 99.999, 350)).toBe(false);
  });

  it('takes the smaller of the fraction and the cap', () => {
    // max() instead of min() would need 140 px at 350 px wide, and 80 px at 200 px is not 100.
    expect(distanceCommits('top-right', 100, 350)).toBe(true);
    expect(distanceCommits('top-right', 81, 200)).toBe(true);
  });

  it('never commits a forbidden direction, however far', () => {
    expect(distanceCommits('top-right', -500, 350)).toBe(false);
    expect(distanceCommits('bottom-left', 500, 350)).toBe(false);
    expect(distanceCommits('top-left', -100, 350)).toBe(true);
    expect(distanceCommits('top-center', -100, 350)).toBe(true);
    expect(distanceCommits('top-center', 100, 350)).toBe(true);
  });

  it('never commits a zero or non-finite offset, even with an unusable width', () => {
    for (const width of [0, NaN, 350]) {
      expect(distanceCommits('top-center', 0, width)).toBe(false);
      expect(distanceCommits('top-center', NaN, width)).toBe(false);
    }
  });
});

describe('release velocity (D2 decision 3)', () => {
  const at = (pairs: readonly (readonly [number, number])[]): SwipeSample[] =>
    pairs.map(([time, x]) => ({ time, x }));

  it('is the slope between the first and last samples in the window', () => {
    expect(
      releaseVelocity(
        at([
          [900, 0],
          [950, 20],
          [1000, 50],
        ]),
        1000
      )
    ).toBeCloseTo(0.5, 10);
    expect(
      releaseVelocity(
        at([
          [900, 50],
          [1000, 0],
        ]),
        1000
      )
    ).toBeCloseTo(-0.5, 10);
  });

  it('includes a sample exactly 100 ms before release', () => {
    expect(
      releaseVelocity(
        at([
          [900, 0],
          [1000, 40],
        ]),
        1000
      )
    ).toBeCloseTo(0.4, 10);
  });

  it('excludes a sample just outside the window', () => {
    // Included, the stale fast start would give 1.0 px/ms; excluded, only the slow tail counts.
    const samples = at([
      [899.999, 0],
      [950, 90],
      [1000, 95],
    ]);
    expect(releaseVelocity(samples, 1000)).toBeCloseTo(0.1, 10);
  });

  it('ignores samples after the release time', () => {
    expect(
      releaseVelocity(
        at([
          [950, 0],
          [1000, 10],
          [1001, 500],
        ]),
        1000
      )
    ).toBeCloseTo(0.2, 10);
  });

  it('is 0 with no sample, one sample, or no elapsed time', () => {
    expect(releaseVelocity([], 1000)).toBe(0);
    expect(releaseVelocity(at([[1000, 50]]), 1000)).toBe(0);
    expect(
      releaseVelocity(
        at([
          [990, 0],
          [990, 80],
        ]),
        1000
      )
    ).toBe(0);
    expect(
      releaseVelocity(
        at([
          [800, 0],
          [850, 80],
        ]),
        1000
      )
    ).toBe(0); // all stale
  });

  it('skips unusable samples and an unusable release time', () => {
    expect(
      releaseVelocity(
        at([
          [950, NaN],
          [960, 0],
          [1000, 20],
        ]),
        1000
      )
    ).toBeCloseTo(0.5, 10);
    expect(
      releaseVelocity(
        at([
          [950, 0],
          [1000, 20],
        ]),
        NaN
      )
    ).toBe(0);
  });

  it('applies no smoothing: only the two end samples matter', () => {
    const jagged = at([
      [900, 0],
      [920, 80],
      [940, -30],
      [1000, 40],
    ]);
    expect(releaseVelocity(jagged, 1000)).toBeCloseTo(0.4, 10);
  });
});

describe('velocity commit (D2 decision 3)', () => {
  it.each([
    // position, velocity, offset, commits
    ['top-right', 0.4, 30, true], // exactly the threshold
    ['top-right', 0.3999, 30, false],
    ['top-right', -2, 30, false], // against the offset
    ['top-right', -2, -30, false], // forbidden direction (offset clamps to 0 too)
    ['top-right', 2, 0, false], // no allowed offset
    ['top-left', -0.4, -30, true],
    ['top-left', 2, -30, false],
    ['top-center', -0.5, -30, true],
    ['top-center', 0.5, 30, true],
    ['top-center', 0.5, -30, false], // fast right while displaced left
    ['top-center', -0.5, 30, false], // fast left while displaced right
    ['bottom-center', 0, 30, false],
    ['bottom-right', NaN, 30, false],
  ] as const)('%s v=%s offset=%s → %s', (position, velocity, offset, expected) => {
    expect(velocityCommits(position, velocity, offset)).toBe(expected);
  });
});

describe('release decision (§19, D2 decisions 2 and 3)', () => {
  const fast: SwipeSample[] = [
    { time: 950, x: 0 },
    { time: 1000, x: 40 }, // 0.8 px/ms rightward
  ];
  const still: SwipeSample[] = [
    { time: 950, x: 100 },
    { time: 1000, x: 100 },
  ];

  it('commits by distance alone', () => {
    expect(releaseDecision('top-right', 100, 350, still, 1000)).toEqual({
      commit: true,
      distancePassed: true,
      velocityPassed: false,
      direction: 1,
      offsetX: 100,
      threshold: 100,
      velocity: 0,
    });
  });

  it('commits by velocity alone: distance OR velocity, never AND', () => {
    const release = releaseDecision('top-right', 20, 350, fast, 1000);
    expect(release).toMatchObject({
      commit: true,
      distancePassed: false,
      velocityPassed: true,
      direction: 1,
      offsetX: 20,
    });
    expect(release.velocity).toBeCloseTo(0.8, 10);
  });

  it('springs back when neither passes', () => {
    expect(releaseDecision('top-right', 20, 350, still, 1000)).toMatchObject({
      commit: false,
      distancePassed: false,
      velocityPassed: false,
      direction: null,
    });
  });

  it('reports both when both pass, in the committed physical direction', () => {
    const leftward = fast.map(({ time, x }) => ({ time, x: -x }));
    expect(releaseDecision('bottom-center', -120, 350, leftward, 1000)).toMatchObject({
      commit: true,
      distancePassed: true,
      velocityPassed: true,
      direction: -1,
    });
  });

  it('clamps a forbidden offset first, so it can commit neither way', () => {
    const leftward = fast.map(({ time, x }) => ({ time, x: -x }));
    expect(releaseDecision('top-right', -300, 350, leftward, 1000)).toMatchObject({
      commit: false,
      direction: null,
      offsetX: 0,
    });
  });

  it('does not commit a fast flick back toward the origin', () => {
    const back = fast.map(({ time, x }) => ({ time, x: 100 - x }));
    expect(releaseDecision('top-center', 60, 350, back, 1000)).toMatchObject({ commit: false });
  });
});

describe('opacity (D2 decision 4)', () => {
  it.each([
    [0, 300, 1],
    [120, 300, 1 - 0.7 * (120 / 240)],
    [-120, 300, 1 - 0.7 * (120 / 240)],
    [240, 300, 0.3], // exactly 0.8 × width
    [241, 300, 0.3],
    [5000, 300, 0.3],
  ])('offset %s at width %s → %s', (offset, width, expected) => {
    expect(swipeOpacity(offset, width)).toBeCloseTo(expected, 10);
  });

  it('never falls below the minimum', () => {
    for (const offset of [240, 1000, 1e9, Infinity, -Infinity]) {
      expect(swipeOpacity(offset, 300)).toBeGreaterThanOrEqual(SWIPE_MIN_OPACITY);
    }
  });

  it('stays opaque for an unusable width or offset', () => {
    for (const width of [0, -1, NaN]) expect(swipeOpacity(100, width)).toBe(1);
    expect(swipeOpacity(NaN, 300)).toBe(1);
    expect(swipeOpacity(100, Infinity)).toBe(1);
  });
});

describe('protected targets (D0 decision 9)', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  function toast(inner: string): HTMLLIElement {
    const root = document.createElement('li');
    root.tabIndex = -1;
    root.innerHTML = inner;
    document.body.append(root);
    return root;
  }

  it.each([
    ['<button>x</button>', 'button'],
    ['<a href="#x">x</a>', 'a'],
    ['<input>', 'input'],
    ['<select><option>a</option></select>', 'select'],
    ['<textarea></textarea>', 'textarea'],
    ['<label>x</label>', 'label'],
    ['<details><summary>x</summary></details>', 'summary'],
    ['<div contenteditable="true">x</div>', 'div'],
    ['<div contenteditable="">x</div>', 'div'],
    ['<span role="button">x</span>', 'span'],
    ['<span role="switch">x</span>', 'span'],
    ['<span role="slider">x</span>', 'span'],
    ['<span tabindex="0">x</span>', 'span'],
    ['<span tabindex="-1">x</span>', 'span'],
  ])('protects %s', (inner, tag) => {
    const root = toast(inner);
    const target = root.firstElementChild?.matches('details')
      ? root.querySelector('summary')
      : root.firstElementChild;
    expect(protectedTarget(target, root)?.tagName.toLowerCase()).toBe(tag);
  });

  it('protects from a descendant of a control, and from its text node', () => {
    const root = toast(
      '<button><svg><path></path></svg> Undo</button><a href="#x"><b>link</b></a>'
    );
    const button = root.querySelector('button');
    expect(protectedTarget(root.querySelector('path'), root)).toBe(button);
    expect(protectedTarget(button?.lastChild, root)).toBe(button);
    expect(protectedTarget(root.querySelector('b'), root)).toBe(root.querySelector('a'));
  });

  it('never classes the toast root itself as interactive, despite its tabindex', () => {
    const root = toast('<div class="content"><p>Saved <em>now</em></p></div>');
    expect(protectedTarget(root, root)).toBeNull();
    expect(protectedTarget(root.querySelector('em'), root)).toBeNull();
    expect(protectedTarget(root.querySelector('p')?.firstChild, root)).toBeNull();
  });

  it('does not protect plain content, an anchor without href or contenteditable="false"', () => {
    const root = toast(
      '<a>no href</a><div contenteditable="false">x</div><span role="img">x</span>'
    );
    for (const child of root.children) expect(protectedTarget(child, root)).toBeNull();
  });

  it('stops at the root: an interactive ancestor outside the toast does not count', () => {
    const outer = document.createElement('div');
    outer.setAttribute('role', 'button');
    const root = document.createElement('li');
    root.innerHTML = '<p>text</p>';
    outer.append(root);
    document.body.append(outer);
    expect(protectedTarget(root.querySelector('p'), root)).toBeNull();
  });

  it('has no protected target outside the toast or for a non-node', () => {
    const root = toast('<p>text</p>');
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    expect(protectedTarget(elsewhere, root)).toBeNull();
    expect(protectedTarget(null, root)).toBeNull();
    expect(protectedTarget({}, root)).toBeNull();
  });
});

describe('selection (D0 decision 9)', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  function setup() {
    document.body.innerHTML =
      '<p id="before">before</p><li id="toast"><p id="text">Saved</p></li><p id="after">after</p>';
    const byId = (id: string) => document.getElementById(id) as HTMLElement;
    const select = (start: Node, startOffset: number, end: Node, endOffset: number) => {
      const range = document.createRange();
      range.setStart(start, startOffset);
      range.setEnd(end, endOffset);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    };
    return { toast: byId('toast'), byId, select };
  }

  it('is blocked by a selection wholly inside the toast', () => {
    const { toast, byId, select } = setup();
    const text = byId('text').firstChild as Node;
    select(text, 0, text, 3);
    expect(selectionIntersects(toast)).toBe(true);
  });

  it('is blocked by a selection that crosses into the toast', () => {
    const { toast, byId, select } = setup();
    select(byId('before').firstChild as Node, 2, byId('text').firstChild as Node, 2);
    expect(selectionIntersects(toast)).toBe(true);
  });

  it('is not blocked by a selection elsewhere, or a collapsed one inside', () => {
    const { toast, byId, select } = setup();
    select(byId('after').firstChild as Node, 0, byId('after').firstChild as Node, 3);
    expect(selectionIntersects(toast)).toBe(false);
    const text = byId('text').firstChild as Node;
    select(text, 2, text, 2);
    expect(selectionIntersects(toast)).toBe(false);
  });

  it('is not blocked with no selection', () => {
    const { toast } = setup();
    document.getSelection()?.removeAllRanges();
    expect(selectionIntersects(toast)).toBe(false);
  });
});
