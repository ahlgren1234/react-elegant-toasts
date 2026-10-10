import { expect, test, type Page } from '@playwright/test';
import type { ToastPosition } from '../../src';
import type { FrameSample, ToastState } from '../harness/api';
import {
  edgeOf,
  expectInterpolatedMove,
  openHarness,
  openReducedMotionHarness,
  POSITIONS,
  PX,
} from './harness';

// P-22 S2: stack repositioning (AC-MO-2, CF-21) and reduced-motion reflow (AC-MO-3, CF-22) in real
// Chromium, Firefox and WebKit, at production timing. Each scenario samples from its first frame
// (D2-12): frame 0 is read before the change, in the same task.

type States = Record<string, ToastState>;

/** Mixed heights: a normal toast with a description, a tall custom toast and a plain one. */
type Kind = 'described' | 'custom' | 'plain';
const MARKUP = '.ret-toast.harness-tall { height: 96px; }';

type Action =
  | {
      readonly create: {
        readonly kind: Kind;
        readonly label: string;
        readonly position: ToastPosition;
      };
    }
  | { readonly dismiss: string };

/** When a scenario has settled: these labels gone, visible, and with no `transform` left. */
interface Settled {
  readonly gone?: readonly string[];
  readonly visible?: readonly string[];
  readonly still?: readonly string[];
}

/**
 * Samples the labelled toasts from frame 0 while `action` runs in the same task (D2-12), and at each
 * commit that adds or removes a toast, until `settled` holds after at least one frame.
 */
async function sample(
  page: Page,
  labels: readonly string[],
  action: Action,
  settled: Settled
): Promise<FrameSample<States>[]> {
  return page.evaluate(
    ({ labels, action, settled }) => {
      const h = window.__retHarness!;
      const samples = h.sampleFrames<States>(
        () => Object.fromEntries(labels.map(label => [label, h.toastState(label)])),
        {
          maxFrames: 180,
          atToastMutations: true,
          until: (states, frame) =>
            frame > 1 &&
            (settled.gone ?? []).every(label => !states[label]!.connected) &&
            (settled.visible ?? []).every(label => states[label]!.phase === 'visible') &&
            (settled.still ?? []).every(label => states[label]!.transform === 'none'),
        }
      );
      if ('dismiss' in action) {
        h.toast.dismiss(action.dismiss);
      } else {
        const { kind, label, position } = action.create;
        const options = { id: label, className: `h-${label}`, position, duration: Infinity };
        if (kind === 'described')
          h.toast.success('Alpha', { ...options, description: 'Described' });
        else if (kind === 'custom') {
          h.toast.custom('Custom', { ...options, className: `h-${label} harness-tall` });
        } else h.toast('Plain', options);
      }
      return samples;
    },
    { labels, action, settled }
  );
}

/** Creates a toast and waits until it is visible. */
async function show(page: Page, kind: Kind, label: string, position: ToastPosition) {
  await sample(page, [label], { create: { kind, label, position } }, { visible: [label] });
}

/**
 * The survivor `label` holds still until `changed` (an exit still in progress), starts from where
 * it was at the commit that changed its stack (the seed, read before any frame of the new move),
 * interpolates to its new place with no horizontal component, and rests there with
 * `transform: none` in its list.
 */
function expectReposition(
  frames: readonly FrameSample<States>[],
  label: string,
  changed: (states: States) => boolean
): void {
  const states = frames.map(frame => frame.value[label]!);
  const before = states[0]!;
  const firstChanged = frames.findIndex(frame => changed(frame.value));
  expect(firstChanged, `${label}: the change commits`).toBeGreaterThan(0);
  for (const state of states.slice(0, firstChanged)) {
    expect(Math.abs(state.top - before.top), `${label} holds until the change`).toBeLessThan(PX);
  }
  expect(frames[firstChanged]!.mutation, `${label}: read at the commit`).toBe(true);
  const seeded = states[firstChanged]!;
  expect(Math.abs(seeded.top - before.top), `${label} starts where it was`).toBeLessThan(PX);
  expect(seeded.transformY, `${label} is seeded`).not.toBe(0);
  expectInterpolatedMove(
    states.slice(firstChanged).map(state => state.top),
    `${label} reposition`
  );
  for (const state of states) expect(Math.abs(state.left - before.left)).toBeLessThan(PX);
  expect(states[states.length - 1]).toMatchObject({ transform: 'none', offsetParentIsList: true });
}

const gutterOf = (page: Page) =>
  page.evaluate(() =>
    Number.parseFloat(
      getComputedStyle(document.querySelector('.ret-toaster')!).getPropertyValue('--ret-offset')
    )
  );

test.describe('stack repositioning (AC-MO-2)', () => {
  for (const position of POSITIONS) {
    test(`at ${position}: insertion, removal with promotion, and removal after the exit`, async ({
      page,
    }) => {
      const towardEdge = edgeOf(position) === 'top' ? -1 : 1;
      await openHarness(page);
      await page.evaluate(css => {
        const h = window.__retHarness!;
        h.setStyle(css);
        h.mount({ maxVisible: 2 });
      }, MARKUP);
      await show(page, 'described', 'a', position);

      // Insertion: the tall custom toast arrives at the anchored edge and pushes A away from it.
      const insertion = await sample(
        page,
        ['a', 'b'],
        { create: { kind: 'custom', label: 'b', position } },
        { visible: ['b'], still: ['a'] }
      );
      expectReposition(insertion, 'a', states => states.b!.connected);
      const inserted = insertion[insertion.length - 1]!.value;
      expect(
        (inserted.b!.top - inserted.a!.top) * towardEdge,
        'newest at the edge'
      ).toBeGreaterThan(0);

      // A third toast is queued: two is the position's limit.
      await page.evaluate(position => {
        window.__retHarness!.toast('Plain', {
          id: 'c',
          className: 'h-c',
          position,
          duration: Infinity,
        });
      }, position);
      expect(await page.evaluate(() => window.__retHarness!.toastState('c').connected)).toBe(false);

      // Removal plus promotion: B exits; when it is removed, C enters in its slot.
      const promotion = await sample(
        page,
        ['a', 'b', 'c'],
        { dismiss: 'b' },
        { gone: ['b'], visible: ['c'], still: ['a'] }
      );
      const removedAt = promotion.findIndex(frame => !frame.value.b!.connected);
      expect(promotion[removedAt]!.value.c!.connected, 'promoted in the removal commit').toBe(true);
      expectReposition(promotion, 'a', states => !states.b!.connected);

      // Removal after the exit: C leaves and A returns to the edge.
      const removal = await sample(
        page,
        ['a', 'c'],
        { dismiss: 'c' },
        { gone: ['c'], still: ['a'] }
      );
      expectReposition(removal, 'a', states => !states.c!.connected);
      const rest = removal[removal.length - 1]!.value.a!;
      const gutter = await gutterOf(page);
      if (towardEdge < 0) expect(rest.top).toBeCloseTo(gutter, 0);
      else expect(rest.bottom).toBeCloseTo(page.viewportSize()!.height - gutter, 0);
    });
  }

  for (const position of ['top-right', 'bottom-right'] as const) {
    test(`at ${position}: an interrupted move continues from where the toast is`, async ({
      page,
    }) => {
      await openHarness(page);
      await show(page, 'described', 'a', position);

      // B arrives; three frames later, mid-move, C arrives too, in that frame's task. A is read just
      // before C is added and again once React has committed C (a microtask later), in that task.
      const { frames, beforeCommit, afterCommit } = await page.evaluate(position => {
        const h = window.__retHarness!;
        const add = (label: string) =>
          h.toast('Plain', { id: label, className: `h-${label}`, position, duration: Infinity });
        const read = () => ({
          time: performance.now(),
          a: h.toastState('a'),
          c: h.toastState('c'),
        });
        let beforeCommit: ReturnType<typeof read> | undefined;
        let afterCommit: ReturnType<typeof read> | undefined;
        const samples = h.sampleFrames(() => h.toastState('a'), {
          maxFrames: 180,
          onFrame: frame => {
            if (frame !== 3) return;
            beforeCommit = read();
            add('c');
            queueMicrotask(() =>
              queueMicrotask(() => {
                afterCommit = read();
              })
            );
          },
          until: (state, frame) => frame > 4 && state.transform === 'none',
        });
        add('b');
        return samples.then(frames => ({ frames, beforeCommit, afterCommit }));
      }, position);

      const tops = frames.map(frame => frame.value.top);
      const atInterrupt = frames[3]!.value;
      expect(atInterrupt.transformY, 'still moving when interrupted').not.toBe(0);
      expect(
        Math.abs(atInterrupt.top - tops[0]!),
        'already moving when interrupted'
      ).toBeGreaterThan(PX);
      // The new move starts where the toast is on screen, not where it was going or coming from.
      // WebKit advances running motion with the clock inside a task (Chromium and Firefox hold the
      // frame's time), so the reads allow the motion the elapsed time explains at the speed sampled.
      expect(beforeCommit?.c.connected, 'C not yet committed').toBe(false);
      expect(afterCommit?.c.connected, 'C committed before the read').toBe(true);
      const speed = Math.max(
        ...frames
          .slice(1, 4)
          .map(
            (frame, index) =>
              Math.abs(frame.value.top - frames[index]!.value.top) /
              Math.max(frame.time - frames[index]!.time, 1)
          )
      );
      const allowance = PX + speed * (afterCommit!.time - beforeCommit!.time);
      expect(
        Math.abs(afterCommit!.a.top - beforeCommit!.a.top),
        'continues from where it is'
      ).toBeLessThan(allowance);
      // And no reversal over both moves.
      expectInterpolatedMove(tops, 'interrupted reposition');
      expect(frames[frames.length - 1]!.value).toMatchObject({
        transform: 'none',
        offsetParentIsList: true,
      });
    });
  }
});

test.describe('reduced-motion repositioning (AC-MO-3)', () => {
  for (const position of ['top-right', 'bottom-left'] as const) {
    test(`at ${position}: survivors take their new places at once`, async ({ page }) => {
      await openReducedMotionHarness(page);
      await page.evaluate(css => window.__retHarness!.setStyle(css), MARKUP);
      await show(page, 'described', 'a', position);

      const steps: readonly [Action, Settled, (states: States) => boolean][] = [
        [
          { create: { kind: 'custom', label: 'b', position } },
          { visible: ['b'] },
          states => states.b!.connected,
        ],
        [{ dismiss: 'b' }, { gone: ['b'] }, states => !states.b!.connected],
      ];
      for (const [action, settled, changed] of steps) {
        const frames = await sample(page, ['a', 'b'], action, settled);
        const firstChanged = frames.findIndex(frame => changed(frame.value));
        expect(firstChanged).toBeGreaterThan(0);
        const placed = frames.slice(firstChanged).map(frame => frame.value.a!);
        const final = placed[placed.length - 1]!;
        expect(Math.abs(placed[0]!.top - frames[0]!.value.a!.top), 'moved').toBeGreaterThan(PX);
        for (const state of placed) {
          expect(
            Math.abs(state.top - final.top),
            'at its new place from the first frame'
          ).toBeLessThan(PX);
        }
        for (const { value } of frames) {
          expect(value.a).toMatchObject({
            transform: 'none',
            translate: 'none',
            scale: 'none',
            opacity: 1,
          });
          if (value.b!.connected) {
            expect(value.b).toMatchObject({ translate: 'none', scale: 'none', opacity: 1 });
          }
        }
      }
    });
  }
});
