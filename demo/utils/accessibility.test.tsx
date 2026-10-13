import { act, fireEvent, render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The library from source, never the built package (P-25 decision 9): CI's `test` job has no
// `dist/`. Internals are imported only as evidence for the guidance's claims.
import { Toaster, toast as libraryToast, type DismissReason } from '../../src/index';
import { DEFAULT_LABELS } from '../../src/react/defaults';
import {
  activationOf,
  allowedDirections,
  isSwipePointer,
  protectedTarget,
  releaseDecision,
  selectionIntersects,
} from '../../src/react/swipe';
import { DEFAULT_HOTKEY, keyShortcutsOf } from '../../src/react/useHotkey';
import { inspectRecords } from '../../src/store/store';
import {
  ANNOUNCEMENTS,
  HOTKEY,
  KEYBOARD,
  LABELS,
  PRACTICE,
  REDUCED_MOTION,
  SWIPE,
  SWIPE_WAYS,
  showPracticeToasts,
  type AnnouncementClaim,
  type KeyboardClaim,
  type MotionClaim,
  type SwipeClaim,
} from './accessibility';

// The accessibility guidance (P-25 S6a). Each claim in `accessibility.ts` has an ID, and each ID
// has evidence here: the library's behaviour, run from source, or its stylesheet. A claim added
// without evidence, or evidence left behind by a removed claim, fails the coverage tests.

const ROOT = resolve(__dirname, '../..');
const LIBRARY_CSS = readFileSync(resolve(ROOT, 'src/styles.css'), 'utf8');
const DEMO_CSS = readFileSync(resolve(ROOT, 'demo/styles/styles.css'), 'utf8');
const SECTION = readFileSync(resolve(ROOT, 'demo/components/Accessibility.tsx'), 'utf8');

const inToasts = { ignore: 'script, style, [aria-live] *' };
const ids = (claims: readonly { id: string }[]) => claims.map(claim => claim.id).sort();

/** Runs the lifecycle fallbacks due now, so entering and exiting toasts finish. */
const flush = () =>
  act(() => {
    vi.advanceTimersByTime(0);
  });

const region = () => screen.getByRole('region');
const toasts = () => [...document.querySelectorAll<HTMLElement>('.ret-toast')];
const live = (politeness: 'polite' | 'assertive') =>
  [...document.querySelectorAll(`[aria-live="${politeness}"] > *`)].map(node => node.textContent);
const pressHotkey = (init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: 't',
    code: 'KeyT',
    altKey: true,
    ...init,
  });
const pressEscape = () =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });

/** Renders a Toaster beside an outside button, which starts with focus. */
function setup(props: Parameters<typeof Toaster>[0] = {}) {
  render(
    <>
      <button type="button">Outside</button>
      <Toaster {...props} />
    </>
  );
  const outside = screen.getByRole('button', { name: 'Outside' });
  outside.focus();
  return outside;
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe('the keyboard guidance', () => {
  // Each claim's evidence, by ID.
  const evidence: Record<KeyboardClaim['id'], () => void> = {
    hotkey: () => {
      setup();
      act(() => {
        libraryToast('Older below', { position: 'bottom-right', duration: Infinity });
        libraryToast('Newer below', { position: 'bottom-right', duration: Infinity });
      });
      flush();
      // At the bottom the newest toast is nearest the edge, so the older one is on top.
      pressHotkey();
      expect(document.activeElement?.textContent).toBe('Older below');
      act(() => {
        libraryToast('Older above', { position: 'top-left', duration: Infinity });
        libraryToast('Newer above', { position: 'top-left', duration: Infinity });
      });
      flush();
      // At the top the newest toast is on top, and the top of the screen comes first.
      pressHotkey();
      expect(document.activeElement?.textContent).toBe('Newer above');
    },
    tab: () => {
      setup();
      act(() => showPracticeToasts(libraryToast));
      flush();
      // The toasts themselves are not Tab stops: only their native buttons are, in visual order.
      for (const item of toasts()) expect(item.tabIndex).toBe(-1);
      const stops = toasts().flatMap(item =>
        [...item.querySelectorAll('button')].map(
          button => button.textContent || button.getAttribute('aria-label')
        )
      );
      expect(stops).toEqual(['Close notification', 'Done', 'Close notification']);
      // No focus trap: the library never takes Tab.
      const close = toasts()[0]!.querySelector('button')!;
      close.focus();
      expect(fireEvent.keyDown(close, { key: 'Tab', code: 'Tab' })).toBe(true);
      expect(fireEvent.keyDown(close, { key: 'Tab', code: 'Tab', shiftKey: true })).toBe(true);
    },
    escape: () => {
      const outside = setup();
      act(() => showPracticeToasts(libraryToast));
      flush();
      pressHotkey();
      expect(region().contains(document.activeElement)).toBe(true);
      pressEscape();
      expect(document.activeElement).toBe(outside);
      expect(toasts().map(item => item.getAttribute('data-phase'))).toEqual(['visible', 'visible']);
    },
    'focus-pause': () => {
      setup();
      act(() => {
        libraryToast('Timed', { id: 'timed', duration: 1000 });
      });
      flush();
      pressHotkey();
      expect(inspectRecords().find(record => record.id === 'timed')?.pausedBy).toContain(
        'focus-within'
      );
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(toasts()[0]?.getAttribute('data-phase')).toBe('visible');
      pressEscape();
      expect(inspectRecords().find(record => record.id === 'timed')?.pausedBy).not.toContain(
        'focus-within'
      );
    },
    closing: () => {
      setup();
      act(() => showPracticeToasts(libraryToast));
      flush();
      const [first, second] = toasts();
      // From a close button to the next toast's close button.
      const close = first!.querySelector<HTMLButtonElement>('[aria-label="Close notification"]')!;
      close.focus();
      fireEvent.click(close);
      expect(document.activeElement).toBe(
        second!.querySelector('[aria-label="Close notification"]')
      );
      flush();
      // The last toast, from its own root: no next toast and no previous, so the region.
      second!.focus();
      act(() => {
        libraryToast.dismiss(PRACTICE[0].id);
      });
      expect(document.activeElement).toBe(region());
    },
  };

  it('has evidence for every claim, and no evidence without a claim', () => {
    expect(ids(KEYBOARD)).toEqual(Object.keys(evidence).sort());
  });

  it.each(Object.keys(evidence) as KeyboardClaim['id'][])('%s: matches the library', id => {
    evidence[id]();
  });

  it('names the shortcut the region advertises by default', () => {
    setup();
    expect(HOTKEY.join('+')).toBe(keyShortcutsOf(DEFAULT_HOTKEY));
    expect(region().getAttribute('aria-keyshortcuts')).toBe(HOTKEY.join('+'));
  });

  it('matches the physical T key, whatever character the layout types', () => {
    setup();
    act(() => {
      libraryToast('Saved', { duration: Infinity });
    });
    flush();
    pressHotkey({ key: '†' });
    expect(document.activeElement).toBe(toasts()[0]);
  });

  it('keeps Escape working when the hotkey is turned off with false', () => {
    setup({ hotkey: false });
    act(() => {
      libraryToast('Saved', { duration: Infinity });
    });
    flush();
    pressHotkey();
    expect(region().contains(document.activeElement)).toBe(false);
    toasts()[0]!.querySelector('button')!.focus();
    pressEscape();
    expect(region().contains(document.activeElement)).toBe(false);
    expect(toasts()).toHaveLength(1);
  });
});

describe('the practice toasts', () => {
  it('stay until closed and can each be closed from the keyboard', () => {
    setup();
    act(() => showPracticeToasts(libraryToast));
    flush();
    for (const record of inspectRecords()) expect(record.options.duration).toBe(Infinity);
    for (const item of toasts()) {
      expect(item.querySelector('[aria-label="Close notification"]')).not.toBeNull();
    }
  });

  it('replace themselves when shown again, by their fixed IDs', () => {
    setup();
    act(() => {
      showPracticeToasts(libraryToast);
      showPracticeToasts(libraryToast);
    });
    flush();
    expect(inspectRecords().map(record => record.id)).toEqual(PRACTICE.map(p => p.id));
  });
});

describe('the reduced-motion guidance', () => {
  // The stylesheet's reduced-motion block, comments removed.
  const start = LIBRARY_CSS.indexOf('@media (prefers-reduced-motion: reduce)');
  const block = LIBRARY_CSS.slice(start, LIBRARY_CSS.indexOf('\n}\n', start) + 2).replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  );
  /** The declarations of the block's rule for exactly this selector. */
  const rule = (selector: string) => {
    const at = block.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return block.slice(at, block.indexOf('}', at));
  };

  const evidence: Record<MotionClaim['id'], () => void> = {
    'enter-exit': () => {
      expect(
        rule(":where(.ret-toast[data-phase='entering'], .ret-toast[data-phase='exiting'])")
      ).toContain('animation-name: none');
    },
    spinner: () => {
      expect(rule(':where(.ret-toast__spinner)')).toContain('animation-name: none');
    },
    stack: () => {
      expect(rule(':where(.ret-toast)')).toContain('transition-duration: 0s');
    },
    swipe: () => {
      // The snap-back is a transition, which takes no time; the release keeps the dragged offset
      // and adds no travel.
      expect(rule(':where(.ret-toast)')).toContain('transition-duration: 0s');
      const release = rule(":where(.ret-toast[data-swiping='release'])");
      expect(release).toContain('var(--ret-swipe-x');
      expect(release).not.toContain('--ret-swipe-travel');
    },
    progress: () => {
      expect(block).not.toContain('progress');
    },
  };

  it('has evidence for every claim, and no evidence without a claim', () => {
    expect(ids(REDUCED_MOTION)).toEqual(Object.keys(evidence).sort());
  });

  it.each(Object.keys(evidence) as MotionClaim['id'][])('%s: matches the stylesheet', id => {
    evidence[id]();
  });

  it('is applied by the stylesheet alone, so it never changes how long a toast stays', () => {
    const scripts = (dir: string): string[] =>
      ['react', 'store', '.'].flatMap(sub => {
        const path = resolve(dir, sub);
        return readdirSync(path)
          .filter(name => /\.tsx?$/.test(name))
          .map(name => readFileSync(resolve(path, name), 'utf8'));
      });
    for (const source of scripts(resolve(ROOT, 'src'))) {
      expect(source).not.toMatch(/prefers-reduced-motion|matchMedia/);
    }
  });
});

describe('the swipe guidance', () => {
  /** A touch, pen or mouse drag on a toast, as browsers report it. */
  function drag(target: Element, type: string, distance: number, ms = 300) {
    const events: [string, number, number][] = [
      ['pointerdown', 0, 0],
      ['pointermove', distance / 2, ms / 2],
      ['pointermove', distance, ms],
      ['pointerup', distance, ms],
    ];
    for (const [kind, x, time] of events) {
      const event = new PointerEvent(kind, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: type,
        clientX: x,
        clientY: 0,
        buttons: kind === 'pointerup' ? 0 : 1,
      });
      Object.defineProperty(event, 'timeStamp', { value: time });
      act(() => {
        fireEvent(target, event);
      });
    }
  }

  /** Shows one toast at the top right and returns its root and the reasons it was dismissed with. */
  function show() {
    const reasons: DismissReason[] = [];
    setup();
    act(() => {
      libraryToast('Swipe me', {
        duration: Infinity,
        onDismiss: (_, reason) => reasons.push(reason),
      });
    });
    flush();
    const root = screen.getByText('Swipe me', inToasts).closest('li')!;
    // jsdom has no pointer capture.
    Object.assign(root, {
      setPointerCapture: () => undefined,
      releasePointerCapture: () => undefined,
      hasPointerCapture: () => true,
    });
    return { root, reasons };
  }

  const evidence: Record<SwipeClaim['id'], () => void> = {
    pointers: () => {
      expect(['touch', 'pen', 'mouse'].map(isSwipePointer)).toEqual([true, true, false]);
      const { root, reasons } = show();
      drag(root, 'mouse', 300);
      flush();
      expect(reasons).toEqual([]);
      expect(root.getAttribute('data-phase')).toBe('visible');
    },
    commit: () => {
      // jsdom measures no width, so the distance threshold is its 100 px cap.
      expect(releaseDecision('top-right', 300, 0, [], 0).commit).toBe(true);
      expect(releaseDecision('top-right', 30, 0, [], 0).commit).toBe(false);
      // A flick: 40 px in 50 ms is 0.8 px/ms.
      const flick = [
        { x: 0, time: 0 },
        { x: 40, time: 50 },
      ];
      expect(releaseDecision('top-right', 40, 0, flick, 50).commit).toBe(true);
      const { root, reasons } = show();
      drag(root, 'touch', 30);
      flush();
      expect(reasons).toEqual([]);
      drag(root, 'touch', 300);
      flush();
      expect(reasons).toEqual(['swipe']);
    },
    scroll: () => {
      expect(activationOf('top-right', 2, 30).kind).toBe('drop');
      const rule = LIBRARY_CSS.indexOf('touch-action: pan-y');
      expect(rule).toBeGreaterThan(-1);
    },
    controls: () => {
      const { root, reasons } = show();
      const close = root.querySelector('button')!;
      expect(protectedTarget(close, root)).toBe(close);
      drag(close, 'touch', 300);
      flush();
      expect(reasons).toEqual([]);
      window.getSelection()?.selectAllChildren(root);
      expect(selectionIntersects(root)).toBe(true);
      drag(root, 'touch', 300);
      flush();
      expect(reasons).toEqual([]);
      window.getSelection()?.removeAllRanges();
    },
    reason: () => {
      const { root, reasons } = show();
      drag(root, 'pen', 300);
      flush();
      expect(reasons).toEqual(['swipe']);
    },
  };

  it('has evidence for every claim, and no evidence without a claim', () => {
    expect(ids(SWIPE)).toEqual(Object.keys(evidence).sort());
  });

  it.each(Object.keys(evidence) as SwipeClaim['id'][])('%s: matches the library', id => {
    evidence[id]();
  });

  it('gives each position the physical directions the library allows', () => {
    const covered = SWIPE_WAYS.flatMap(row => row.positions).sort();
    expect(covered).toEqual(
      ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'].sort()
    );
    const expected = { left: [-1], right: [1], either: [-1, 1] };
    for (const row of SWIPE_WAYS) {
      for (const position of row.positions) {
        expect(allowedDirections(position), position).toEqual(expected[row.way]);
      }
    }
  });

  it('allows the same directions in RTL, since they are physical', () => {
    document.documentElement.dir = 'rtl';
    try {
      const { root, reasons } = show();
      // A top-right toast still goes right, toward its own edge.
      drag(root, 'touch', -300);
      flush();
      expect(reasons).toEqual([]);
      drag(root, 'touch', 300);
      flush();
      expect(reasons).toEqual(['swipe']);
    } finally {
      document.documentElement.removeAttribute('dir');
    }
  });
});

describe('the announcement guidance', () => {
  const evidence: Record<AnnouncementClaim['id'], () => void> = {
    politeness: () => {
      setup();
      act(() => {
        libraryToast.success('Saved', { duration: Infinity });
        libraryToast.warning('Low space', { duration: Infinity });
        libraryToast.error('Failed', { duration: Infinity });
      });
      flush();
      // Announced in DOM order, which puts the newest toast of a top stack first.
      expect(live('polite').sort()).toEqual(['Saved', 'Warning: Low space']);
      expect(live('assertive')).toEqual(['Error: Failed']);
    },
    once: () => {
      setup();
      act(() => {
        libraryToast('Uploading', { id: 'upload', duration: Infinity });
      });
      flush();
      flush();
      expect(live('polite')).toEqual(['Uploading']);
      act(() => {
        libraryToast('Uploaded', { id: 'upload', duration: Infinity });
      });
      flush();
      expect(live('polite')).toEqual(['Uploading', 'Uploaded']);
    },
    text: () => {
      setup();
      act(() => {
        libraryToast.success('Saved', {
          description: 'All changes are stored',
          duration: Infinity,
          action: { label: 'Undo', onClick: () => undefined },
        });
      });
      flush();
      expect(live('polite')).toEqual(['Saved All changes are stored']);
    },
    custom: () => {
      setup();
      act(() => {
        libraryToast.custom(
          <p>
            Invited <button type="button">Join</button>
          </p>,
          { duration: Infinity, closeButton: true }
        );
      });
      flush();
      expect(live('polite')).toEqual(['Invited Join']);
    },
  };

  it('has evidence for every claim, and no evidence without a claim', () => {
    expect(ids(ANNOUNCEMENTS)).toEqual(Object.keys(evidence).sort());
  });

  it.each(Object.keys(evidence) as AnnouncementClaim['id'][])('%s: matches the library', id => {
    evidence[id]();
  });

  it('never shows the warning and error prefixes in the toast itself', () => {
    setup();
    act(() => {
      libraryToast.error('Failed', { duration: Infinity });
    });
    flush();
    expect(toasts()[0]?.textContent).toBe('Failed');
  });
});

describe('the labels guidance', () => {
  it('lists every label with the library’s default', () => {
    expect(Object.fromEntries(LABELS.map(label => [label.name, label.fallback]))).toEqual(
      DEFAULT_LABELS
    );
  });
});

describe('the section', () => {
  it('renders every claim list from the checked claims', () => {
    for (const name of ['KEYBOARD', 'REDUCED_MOTION', 'SWIPE', 'SWIPE_WAYS', 'ANNOUNCEMENTS']) {
      expect(SECTION).toContain(`{${name}.map(`);
    }
    expect(SECTION).toContain('{LABELS.map(');
  });

  it('adds no live region: only the copy button’s existing status announces anything', () => {
    expect(SECTION).not.toMatch(/aria-live|role="(status|alert|log)"/);
  });
});

describe('the section styles', () => {
  const start = DEMO_CSS.indexOf(' * Accessibility (P-25 S6a)');
  const end = DEMO_CSS.indexOf('/* No page motion under reduced motion.');
  const css = DEMO_CSS.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');

  it('exist, and style the section’s own classes only', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const styled = new Set([...css.matchAll(/\.(d-[\w-]+)/g)].map(match => match[1]!));
    const used = new Set(
      [...SECTION.matchAll(/className="([^"]+)"/g)].flatMap(match => match[1]!.split(' '))
    );
    expect([...styled].filter(name => !used.has(name))).toEqual([]);
    expect([...styled].every(name => /^d-(a11y|keys)/.test(name))).toBe(true);
  });

  it('use logical properties only, so the section mirrors in RTL', () => {
    expect(css).not.toMatch(/(^|[\s;{])(left|right|top|bottom|width|height)\s*:/);
    expect(css).not.toMatch(/-(left|right|top|bottom)\s*:/);
    expect(css).not.toMatch(/:\s*(left|right)\s*;/);
  });

  it('animate nothing', () => {
    expect(css).not.toMatch(/\b(transition|animation)/);
  });

  it('show the swipe hint only where the primary pointer is coarse', () => {
    const base = css.indexOf('.d-a11y__touch-hint {');
    expect(css.slice(base, css.indexOf('}', base))).toContain('display: none');
    const coarse = css.indexOf('@media (pointer: coarse)');
    expect(coarse).toBeGreaterThan(base);
    const media = css.slice(coarse, css.indexOf('}\n}', coarse));
    expect(media).toContain('.d-a11y__touch-hint {');
    expect(media).toContain('display: block');
  });
});

afterEach(() => {
  vi.useRealTimers();
});
