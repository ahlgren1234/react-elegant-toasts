import { expect, test, type Page } from '@playwright/test';
import type { ToastPosition } from '../../src';
import type { ToastEventDetail } from '../harness/api';
import {
  edgeOf,
  expectInterpolatedMove,
  openHarness,
  openReducedMotionHarness,
  POSITIONS,
  PX,
} from './harness';

// P-22 S2: enter and exit motion (AC-MO-1, CF-16), the spinner (CF-19), individual transform
// properties (CF-20) and reduced motion (AC-MO-3, CF-18), in real Chromium, Firefox and WebKit.
// V2_PLAN.md, P-22 D2 and S2. Production timing unless a test says otherwise: frame-by-frame
// interpolation is observed with the public motion tokens slowed (D0-11), since a 120 ms exit can
// fall between two frames of a loaded machine.

/** Diagnostic timing: the public motion tokens, slowed for observation only. */
const SLOWED = '.ret-toaster { --ret-enter-duration: 600ms; --ret-exit-duration: 400ms; }';

/** Tolerances for unitless motion values. */
const SCALE = 0.001;
const OPACITY = 0.005;

/** A toast at rest has no motion left on it. */
const AT_REST = {
  animationName: 'none',
  transform: 'none',
  translate: 'none',
  scale: 'none',
  opacity: 1,
} as const;

async function toastEvents(page: Page, label: string) {
  const events = await page.evaluate(() => window.__retHarness!.events);
  return events
    .filter(event => (event.detail as ToastEventDetail | undefined)?.label === label)
    .map(event => ({ type: event.type, time: event.time, ...(event.detail as ToastEventDetail) }));
}

/**
 * One toast's enter and exit at `position`: its edge's trusted animations, completion on the root's
 * own `animationend`, the exit's last frame held, and a clean rest at the stack's gutters. With
 * `slowed`, also the frame-by-frame direction and interpolation of `translate`, `scale` and
 * `opacity`, with `transform` untouched (CF-20).
 */
async function enterAndExit(page: Page, position: ToastPosition, slowed: boolean): Promise<void> {
  const edge = edgeOf(position);
  // Above at the top, below at the bottom: the sign of the off-edge `translate`.
  const away = edge === 'top' ? -1 : 1;

  if (slowed) await page.evaluate(css => window.__retHarness!.setStyle(css), SLOWED);

  // Enter, sampled from its first frame (D2-12).
  const enter = await page.evaluate(position => {
    const h = window.__retHarness!;
    const samples = h.sampleFrames(() => h.toastState('a'), {
      maxFrames: 120,
      until: state => state.phase === 'visible',
    });
    h.toast('Enters', { id: 'a', className: 'h-a', position, duration: Infinity });
    return samples;
  }, position);

  expect(enter[0]?.value.connected, 'not rendered before the call').toBe(false);
  if (slowed) {
    const entering = enter.filter(sample => sample.value.phase === 'entering');
    const first = entering[0]?.value;
    expect(first, 'an entering frame').toBeDefined();
    expect(first!.opacity).toBeLessThan(1);
    expect(first!.scaleY).toBeLessThan(1);
    expect(first!.translateY * away, 'starts off its own edge').toBeGreaterThan(0);
    // Individual properties only (CF-20): `transform` stays free for repositioning.
    for (const { value } of entering) expect(value.transform).toBe('none');
    expectInterpolatedMove(
      [...entering.map(sample => sample.value.translateY), 0],
      'enter translate'
    );
    expectInterpolatedMove(
      [...entering.map(sample => sample.value.scaleY), 1],
      'enter scale',
      SCALE
    );
    expectInterpolatedMove(
      [...entering.map(sample => sample.value.opacity), 1],
      'enter opacity',
      OPACITY
    );
  }

  const settled = enter[enter.length - 1]!.value;
  expect(settled).toMatchObject({ phase: 'visible', ...AT_REST });

  // The resting place: the stack's gutters, with no leftover offset at any position (D-14).
  const gutter = await page.evaluate(() =>
    Number.parseFloat(
      getComputedStyle(document.querySelector('.ret-toaster')!).getPropertyValue('--ret-offset')
    )
  );
  const viewport = page.viewportSize()!;
  if (position.endsWith('-left')) expect(settled.left).toBeCloseTo(gutter, 0);
  if (position.endsWith('-right')) expect(settled.right).toBeCloseTo(viewport.width - gutter, 0);
  if (position.endsWith('-center')) {
    expect(Math.abs((settled.left + settled.right) / 2 - viewport.width / 2)).toBeLessThan(1);
  }
  if (edge === 'top') expect(settled.top).toBeCloseTo(gutter, 0);
  else expect(settled.bottom).toBeCloseTo(viewport.height - gutter, 0);

  // Exit: the last frame is held at the toast's own `animationend` and until removal.
  const exit = await page.evaluate(() => {
    const h = window.__retHarness!;
    const item = h.toastRoot('a')!;
    let atEnd: ReturnType<typeof h.toastState> | undefined;
    item.addEventListener(
      'animationend',
      event => {
        if (event.target === item) atEnd = h.toastState('a');
      },
      { once: true }
    );
    const samples = h.sampleFrames(() => h.toastState('a'), {
      maxFrames: 120,
      until: state => !state.connected,
    });
    h.toast.dismiss('a');
    return samples.then(frames => ({ frames, atEnd }));
  });

  if (slowed) {
    const exiting = exit.frames
      .filter(sample => sample.value.phase === 'exiting')
      .map(sample => sample.value);
    expect(exiting.length, 'exiting frames').toBeGreaterThan(0);
    for (const value of exiting) expect(value.transform).toBe('none');
    expectInterpolatedMove([0, ...exiting.map(value => value.translateY)], 'exit translate');
    expectInterpolatedMove([1, ...exiting.map(value => value.opacity)], 'exit opacity', OPACITY);
  }
  expect(exit.atEnd, 'state at animationend').toBeDefined();
  expect(exit.atEnd!.phase).toBe('exiting');
  expect(exit.atEnd!.opacity).toBeLessThan(0.01);
  expect(exit.atEnd!.translateY * away).toBeGreaterThan(0);
  expect(exit.frames[exit.frames.length - 1]!.value.connected).toBe(false);

  // Completion on the root's own trusted animationend for this edge's names, not the fallback,
  // which would come 100 ms after the nominal end.
  const events = await toastEvents(page, 'a');
  for (const [phase, name, next] of [
    ['entering', `ret-enter-${edge}`, 'phase'],
    ['exiting', `ret-exit-${edge}`, 'removed'],
  ] as const) {
    const start = events.find(
      event => event.type === 'animationstart' && event.root && event.name === name
    );
    expect(start, `${phase} animationstart`).toMatchObject({ trusted: true });
    const end = events.find(
      event => event.type === 'animationend' && event.root && event.name === name
    );
    expect(end, `${phase} animationend`).toMatchObject({ trusted: true });
    const completion = events.find(
      event =>
        event.time >= end!.time &&
        (next === 'phase'
          ? event.type === 'phase' && event.phase === 'visible'
          : event.type === next)
    );
    expect(completion, `${phase} completes`).toBeDefined();
    expect(completion!.time - end!.time, `${phase} completes on its animationend`).toBeLessThan(50);
  }
  const names = events
    .filter(event => event.type === 'animationstart' && event.root)
    .map(event => event.name);
  expect(names).toEqual([`ret-enter-${edge}`, `ret-exit-${edge}`]);
}

test.describe('enter and exit (AC-MO-1)', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  for (const position of POSITIONS) {
    test(`at ${position}: plays its edge's animations and settles clean (slowed tokens)`, async ({
      page,
    }) => {
      await enterAndExit(page, position, true);
    });
  }

  for (const position of ['top-right', 'bottom-left'] as const) {
    test(`at ${position}: completes on its own animations at production timing`, async ({
      page,
    }) => {
      await enterAndExit(page, position, false);
    });
  }

  test('turns the loading spinner about its own centre without completing the toast (CF-19)', async ({
    page,
  }) => {
    // Diagnostic timing: the enter is slowed and held, so only its fallback (1.5 s + 100 ms) can
    // complete it, while the spinner's own events arrive.
    await page.evaluate(() => {
      const h = window.__retHarness!;
      h.setStyle(`
        .ret-toaster { --ret-enter-duration: 1500ms; }
        .ret-toast.h-a { animation-play-state: paused; }
      `);
      h.toast.loading('Loading', { id: 'a', className: 'h-a' });
    });

    const turn = await page.evaluate(() => {
      const h = window.__retHarness!;
      const spinner = h.toastRoot('a')!.querySelector('.ret-toast__spinner')!;
      return h.sampleFrames(
        () => {
          const rect = spinner.getBoundingClientRect();
          return {
            rotate: getComputedStyle(spinner).rotate,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        },
        { maxFrames: 20 }
      );
    });
    const rotations = new Set(turn.map(sample => sample.value.rotate));
    expect(rotations.size, 'rotate interpolates (CF-20)').toBeGreaterThan(2);
    const centre = turn[0]!.value;
    for (const { value } of turn) {
      expect(Math.abs(value.x - centre.x)).toBeLessThan(PX);
      expect(Math.abs(value.y - centre.y)).toBeLessThan(PX);
    }

    await expect
      .poll(async () =>
        (await toastEvents(page, 'a')).some(
          event => event.type === 'animationiteration' && !event.root && event.name === 'ret-spin'
        )
      )
      .toBe(true);
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'entering');
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
    const spinnerEnds = (await toastEvents(page, 'a')).filter(
      event => event.type === 'animationend' && !event.root
    );
    expect(spinnerEnds).toEqual([]);
  });
});

test.describe('reduced motion (AC-MO-3)', () => {
  test.beforeEach(async ({ page }) => {
    await openReducedMotionHarness(page);
  });

  for (const position of ['top-right', 'bottom-left'] as const) {
    test(`at ${position}: no translation, scale or fade, and the lifecycle completes`, async ({
      page,
    }) => {
      const enter = await page.evaluate(position => {
        const h = window.__retHarness!;
        const samples = h.sampleFrames(() => h.toastState('a'), {
          maxFrames: 30,
          until: state => state.phase === 'visible',
        });
        h.toast('Still', {
          id: 'a',
          className: 'h-a',
          position,
          duration: Infinity,
          onDismiss: (_toast, reason) => h.log('dismiss', reason),
        });
        return samples;
      }, position);
      const shown = enter.filter(sample => sample.value.connected).map(sample => sample.value);
      expect(shown.length).toBeGreaterThan(0);
      for (const value of shown) expect(value).toMatchObject(AT_REST);
      expect(shown[shown.length - 1]!.phase).toBe('visible');

      const exit = await page.evaluate(() => {
        const h = window.__retHarness!;
        const samples = h.sampleFrames(() => h.toastState('a'), {
          maxFrames: 30,
          until: state => !state.connected,
        });
        h.toast.dismiss('a');
        return samples;
      });
      for (const { value } of exit.filter(sample => sample.value.connected)) {
        expect(value).toMatchObject(AT_REST);
      }
      expect(exit[exit.length - 1]!.value.connected).toBe(false);

      const events = await toastEvents(page, 'a');
      expect(events.filter(event => event.type.startsWith('animation') && event.root)).toEqual([]);
      const dismissals = await page.evaluate(() =>
        window.__retHarness!.events.filter(event => event.type === 'dismiss')
      );
      expect(dismissals.map(event => event.detail)).toEqual(['programmatic']);
    });
  }

  test('keeps the loading spinner still', async ({ page }) => {
    await page.evaluate(() => {
      window.__retHarness!.toast.loading('Loading', { id: 'a', className: 'h-a' });
    });
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
    const turn = await page.evaluate(() => {
      const h = window.__retHarness!;
      const spinner = h.toastRoot('a')!.querySelector('.ret-toast__spinner')!;
      return h.sampleFrames(
        () => {
          const style = getComputedStyle(spinner);
          return { animationName: style.animationName, rotate: style.rotate };
        },
        { maxFrames: 10 }
      );
    });
    for (const { value } of turn) expect(value).toEqual({ animationName: 'none', rotate: 'none' });
  });
});
