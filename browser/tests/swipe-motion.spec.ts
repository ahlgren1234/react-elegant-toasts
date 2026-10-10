import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { expectInterpolatedMove, openHarness, PX } from './harness';

// P-22 S5.2, CF-35 Class 1 (V2_PLAN.md, P-22 D2; P-21 D2 decisions 11 and 12): swipe and stack
// repositioning compose with no jump. Chromium with TRUSTED touch (CDP, `hasTouch`); Firefox and
// WebKit with SYNTHETIC pointer events, which exercise the same composition logic but never real
// touch. Each scenario is a top-right stack; `b` is the toast that is dragged.
// - Activation during a reposition starts from the toast's current visual position.
// - Freeze Y: while `b` is dragged, an insertion and a removal around it move neither its Y nor X.
// - A reposition during the snap-back keeps X; on release, the toast reaches its new place smoothly.
// - A reposition during the fly-out keeps X travelling (the accepted one-frame hold allowed).
// Positions are read at every frame and at each toast mutation, after the renderer's commit
// (D2-12); an allowance is only the motion the measured speed explains over the elapsed time.

test.use({ hasTouch: true });

/** A point away from every stack. */
const AWAY = { x: 640, y: 360 } as const;

interface Sample {
  /** `performance.now()` when the sample was read: WebKit's motion follows it within a task. */
  readonly time: number;
  readonly mutation: boolean;
  /** `b`'s rendered top (transforms included), its computed transform X and Y, and its swipe state. */
  readonly top: number;
  readonly x: number;
  readonly transformY: number;
  readonly swiping: string | null;
  readonly connected: boolean;
}

/** A gesture on `b`'s title: trusted CDP touch in Chromium, synthetic touch elsewhere. */
interface Driver {
  readonly kind: 'trusted' | 'synthetic';
  down(): Promise<void>;
  /** To (dx, 0) from the start, in `steps` moves about a frame apart. */
  moveTo(dx: number, steps?: number): Promise<void>;
  up(): Promise<void>;
}

async function driverFor(page: Page, browserName: string): Promise<Driver> {
  // The last pointer move the page received, so a step waits until the browser has delivered it:
  // Chromium dispatches trusted touch moves with the next frame, after CDP has returned.
  await page.evaluate(() => {
    const h = window.__retHarness!;
    document.addEventListener(
      'pointermove',
      event => h.log('delivered', Math.round(event.clientX)),
      { capture: true }
    );
  });
  const delivered = (target: number) =>
    page.waitForFunction(
      target =>
        window.__retHarness!.events.some(
          event => event.type === 'delivered' && event.detail === target
        ),
      Math.round(target)
    );
  const box = (await page.locator('.ret-toast.h-b .ret-toast__title').boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  let x = start.x;
  const pause = () => new Promise(resolve => setTimeout(resolve, 16));
  if (browserName === 'chromium') {
    const cdp: CDPSession = await page.context().newCDPSession(page);
    const touch = async (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      touchPoints: { x: number; y: number }[]
    ): Promise<void> => {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    };
    return {
      kind: 'trusted',
      down: () => touch('touchStart', [start]),
      async moveTo(dx, steps = 4) {
        const from = x;
        for (let step = 1; step <= steps; step += 1) {
          await pause();
          x = from + ((start.x + dx - from) * step) / steps;
          await touch('touchMove', [{ x, y: start.y }]);
        }
        await delivered(x);
      },
      up: () => touch('touchEnd', []),
    };
  }
  // Synthetic: dispatched on the element the contact started on, as touch's implicit capture would.
  const dispatch = (type: string, clientX: number, buttons: number) =>
    page.evaluate(
      ({ type, clientX, clientY, buttons }) => {
        document.querySelector('.ret-toast.h-b .ret-toast__title')!.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 43,
            pointerType: 'touch',
            isPrimary: true,
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX,
            clientY,
            button: type === 'pointermove' ? -1 : 0,
            buttons,
          })
        );
      },
      { type, clientX, clientY: start.y, buttons }
    );
  return {
    kind: 'synthetic',
    down: () => dispatch('pointerdown', start.x, 1),
    async moveTo(dx, steps = 4) {
      const from = x;
      for (let step = 1; step <= steps; step += 1) {
        await pause();
        x = from + ((start.x + dx - from) * step) / steps;
        await dispatch('pointermove', x, 1);
      }
      await delivered(x);
    },
    up: () => dispatch('pointerup', x, 0),
  };
}

async function showToasts(page: Page, ids: readonly string[], duration = 60_000): Promise<void> {
  await page.evaluate(
    ([ids, duration]) => {
      const h = window.__retHarness!;
      for (const id of ids) {
        h.toast(`Toast ${id}`, {
          id,
          className: `h-${id}`,
          duration,
          onDismiss: (_toast, reason) => h.log('dismiss', { id, reason }),
        });
      }
    },
    [ids, duration] as const
  );
  for (const id of ids) {
    await expect(page.locator(`.ret-toast.h-${id}`)).toHaveAttribute('data-phase', 'visible');
  }
}

/** Shows toast `id` on top of the stack, from the page, with no wait. */
const insert = (page: Page, id: string) =>
  page.evaluate(id => {
    const h = window.__retHarness!;
    h.log('stage', `insert ${id}`);
    h.toast(`Toast ${id}`, { id, className: `h-${id}`, duration: 60_000 });
  }, id);

/**
 * Starts sampling `b` at every frame and at every toast mutation, until `stop`, and records the
 * activating move's own task: `b`'s rendered top and time just before the library handled it
 * (capture phase) and just after (bubble phase).
 */
async function startSampling(page: Page): Promise<() => Promise<Sample[]>> {
  const sampling = page.evaluate(() => {
    const h = window.__retHarness!;
    const read = () => {
      const state = h.toastState('b');
      return {
        now: performance.now(),
        top: state.top,
        x: state.transformX,
        transformY: state.transformY,
        swiping: state.swiping,
        connected: state.connected,
      };
    };
    let before: Activation['before'] | null = null;
    document.addEventListener(
      'pointermove',
      () => {
        const state = h.toastState('b');
        const style = getComputedStyle(document.querySelector('.ret-toast.h-b')!);
        before =
          state.swiping === null
            ? {
                top: state.top,
                time: performance.now(),
                transformY: state.transformY,
                duration: style.transitionDuration,
                easing: style.transitionTimingFunction,
              }
            : null;
      },
      { capture: true }
    );
    document.addEventListener('pointermove', () => {
      const state = h.toastState('b');
      if (before && state.swiping === 'drag') {
        h.log('activation', { before, after: { top: state.top, time: performance.now() } });
      }
      before = null;
    });
    const samples = h.sampleFrames(read, {
      maxFrames: 3000,
      atToastMutations: true,
      until: () => h.events.some(event => event.type === 'stop'),
    });
    h.log('sampling');
    return samples;
  });
  await page.waitForFunction(() => window.__retHarness!.events.some(e => e.type === 'sampling'));
  return async () => {
    await page.evaluate(() => window.__retHarness!.log('stop'));
    return (await sampling).map(({ mutation, value: { now, ...value } }) => ({
      time: now,
      mutation: mutation === true,
      ...value,
    }));
  };
}

const stageTime = (page: Page, name: string) =>
  page.evaluate(
    name =>
      window.__retHarness!.events.find(event => event.type === 'stage' && event.detail === name)!
        .time,
    name
  );

/**
 * The activating move's task: `b` just before the library handled it, with its reposition
 * transition's computed timing, and just after.
 */
interface Activation {
  readonly before: {
    readonly top: number;
    readonly time: number;
    readonly transformY: number;
    readonly duration: string;
    readonly easing: string;
  };
  readonly after: { readonly top: number; readonly time: number };
}

/**
 * WebKit's `performance.now()` reads in whole milliseconds here (P-22 S6 preflight), so the
 * difference of two reads can understate the elapsed time by up to one tick.
 */
const WEBKIT_CLOCK_TICK_MS = 1;

/** A single `transition-duration` in ms; NaN for anything else. */
function durationMs(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(value.trim());
  return match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : Number.NaN;
}

/**
 * The steepest slope (output progress per input progress) of a single `cubic-bezier()` timing
 * function: the largest y'(u) / x'(u) over the curve's parameter u, so no inversion of x is
 * needed. NaN when the value is not one `cubic-bezier()`, or x'(u) reaches 0.
 */
function maxSlopeOf(easing: string): number {
  const match = /^cubic-bezier\(([^,]+),([^,]+),([^,]+),([^,)]+)\)$/.exec(easing.trim());
  if (!match) return Number.NaN;
  const [x1, y1, x2, y2] = match.slice(1).map(Number) as [number, number, number, number];
  if (![x1, y1, x2, y2].every(Number.isFinite)) return Number.NaN;
  // The derivative of a cubic Bézier from 0 to 1 with control points p1, p2.
  const derivative = (p1: number, p2: number, u: number) =>
    3 * (1 - u) ** 2 * p1 + 6 * (1 - u) * u * (p2 - p1) + 3 * u ** 2 * (1 - p2);
  let slope = 0;
  for (let step = 0; step <= 1000; step += 1) {
    const u = step / 1000;
    const dx = derivative(x1, x2, u);
    if (dx <= 0) return Number.NaN;
    slope = Math.max(slope, Math.abs(derivative(y1, y2, u)) / dx);
  }
  return slope;
}

/** The fastest frame-to-frame motion of `key` among `samples`, in px/ms. */
function speedOf(samples: readonly Sample[], key: 'top' | 'x'): number {
  let speed = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const elapsed = samples[index]!.time - samples[index - 1]!.time;
    if (elapsed > 0) {
      speed = Math.max(speed, Math.abs(samples[index]![key] - samples[index - 1]![key]) / elapsed);
    }
  }
  return speed;
}

interface Measured {
  readonly before: { readonly x: number; readonly time: number };
  readonly after: { readonly x: number; readonly time: number };
}

/**
 * Shows toast `id` on top of the stack and commits it at once, in one task with a read of `b`
 * just before and just after: the harness's `mount()` re-renders the same Toaster under
 * `flushSync`, so the insertion's repositioning seed runs inside that task. Chromium and Firefox
 * hold animation time within a task; WebKit advances it, which the allowance covers.
 */
const insertMeasured = (page: Page, id: string): Promise<Measured> =>
  page.evaluate(id => {
    const h = window.__retHarness!;
    const read = () => ({ x: h.toastState('b').transformX, time: performance.now() });
    h.log('stage', `insert ${id}`);
    const before = read();
    h.toast(`Toast ${id}`, { id, className: `h-${id}`, duration: 60_000 });
    h.mount();
    const after = read();
    if (!h.toastRoot(id)) throw new Error(`${id} was not committed in the task`);
    return { before, after };
  }, id);

/**
 * X kept across the insertion: no more change than the settle's own speed explains over the task.
 * Chromium and Firefox hold animation time within a task, so their window is the task itself.
 * WebKit advances it, and its `after` read can already show motion that the next frame would
 * otherwise show (P-22 S6.2 diagnostic): its window runs to the first frame sampled after the
 * task, and its speed leaves out the frame interval that spans the insertion, so a jump there
 * cannot raise its own allowance. Without such a frame the measurement is not judged.
 */
function expectXKept(measured: Measured, samples: readonly Sample[], browserName: string): void {
  let end = measured.after.time;
  let speed = speedOf(samples, 'x');
  if (browserName === 'webkit') {
    const next = samples.find(sample => sample.time >= measured.after.time);
    expect(next, 'precondition: a frame sampled after the insertion task').toBeDefined();
    end = next!.time;
    speed = Math.max(
      speedOf(
        samples.filter(sample => sample.time <= measured.before.time),
        'x'
      ),
      speedOf(
        samples.filter(sample => sample.time >= measured.after.time),
        'x'
      )
    );
  }
  const allowance = PX + speed * (end - measured.before.time);
  expect(
    Math.abs(measured.after.x - measured.before.x),
    'X across the insertion'
  ).toBeLessThanOrEqual(allowance);
}

/**
 * The change at activation along the reposition, positive toward `b`'s layout place, and never
 * more than half a pixel the other way, in any engine. The reposition carries the root's transform
 * from its offset to none, so `b` moves against the offset's sign (activation is mid-reposition,
 * so the offset is not 0).
 */
function forwardAtActivation({ before, after }: Activation): number {
  const forward = (after.top - before.top) * Math.sign(-before.transformY);
  expect(forward, 'no jump against the reposition at activation').toBeGreaterThanOrEqual(-PX);
  return forward;
}

/**
 * No jump at activation, in WebKit. WebKit advances animation time within a task, so the change
 * from `before` to `after` is real reposition motion, and frame samples, taken in the ease's slow
 * start, underestimate its speed (P-22 post-merge, run 38037247122: 1.03 px against 0.89 px). The
 * bound is the transition's own: no motion is faster than its distance times the timing
 * function's steepest slope over its duration. The window is the measured interval from `before`
 * to `after`, plus one clock tick.
 */
function expectNoActivationJumpWebKit(activation: Activation, samples: readonly Sample[]): void {
  const { before, after } = activation;
  const rest = samples[0]!;
  expect(rest.mutation, 'precondition: the first sample precedes the insertion').toBe(false);
  expect(Math.abs(rest.transformY), 'precondition: `b` at rest before the insertion').toBeLessThan(
    PX
  );
  // The reposition carries `b` from its place before the insertion to its new layout place.
  const distance = before.top - before.transformY - rest.top;
  expect(Math.abs(distance), 'precondition: a measured reposition distance').toBeGreaterThan(PX);
  const duration = durationMs(before.duration);
  expect(duration, `precondition: the transition's duration (${before.duration})`).toBeGreaterThan(
    0
  );
  const slope = maxSlopeOf(before.easing);
  expect(
    slope,
    `precondition: the transition's timing function (${before.easing})`
  ).toBeGreaterThan(0);
  const maxSpeed = (Math.abs(distance) * slope) / duration;
  const allowance = PX + maxSpeed * (after.time - before.time + WEBKIT_CLOCK_TICK_MS);
  expect(forwardAtActivation(activation), 'no jump at activation').toBeLessThanOrEqual(allowance);
}

test.describe('CF-35: swipe and repositioning compose with no jump', () => {
  test('activation during a reposition starts from the current position, then freezes Y', async ({
    page,
    browserName,
  }) => {
    await openHarness(page);
    await page.mouse.move(AWAY.x, AWAY.y);
    await showToasts(page, ['b']);
    const driver = await driverFor(page, browserName);
    const stop = await startSampling(page);
    await driver.down();
    await insert(page, 'n');
    // Activate once `b` is visibly on its way down (before the 200 ms reposition ends).
    await page.waitForFunction(() => window.__retHarness!.toastState('b').transformY < -10);
    await driver.moveTo(30, 1);
    await page.evaluate(() => window.__retHarness!.log('stage', 'activated'));
    await driver.moveTo(30, 3); // the finger holds still at the same X
    await page.waitForTimeout(300); // longer than the reposition: Y must stay frozen meanwhile
    await page.evaluate(() => window.__retHarness!.log('stage', 'held'));
    await driver.up();
    await expect(page.locator('.ret-toast.h-b')).not.toHaveAttribute('data-swiping', /.*/);
    const samples = await stop();
    const activation = await page.evaluate(
      () =>
        window.__retHarness!.events.find(event => event.type === 'activation')?.detail as
          Activation | undefined
    );
    expect(activation, `precondition: the gesture activated (${driver.kind})`).toBeDefined();
    expect(activation!.before.transformY, 'precondition: activated mid-reposition').toBeLessThan(
      -PX
    );
    if (browserName === 'webkit') expectNoActivationJumpWebKit(activation!, samples);
    else {
      // The speed includes the activating move's own `before` read: activation lands early in the
      // reposition, whose first frames are the ease's slow start (S6 preflight). Chromium and
      // Firefox hold animation time within a task, so the change here is the motion over the task.
      const moving = [
        ...samples.filter(sample => sample.time < activation!.before.time && !sample.mutation),
        {
          time: activation!.before.time,
          mutation: false,
          top: activation!.before.top,
          x: 0,
          transformY: activation!.before.transformY,
          swiping: null,
          connected: true,
        },
      ];
      const allowance =
        PX + speedOf(moving, 'top') * (activation!.after.time - activation!.before.time);
      forwardAtActivation(activation!);
      expect(
        Math.abs(activation!.after.top - activation!.before.top),
        'no jump at activation'
      ).toBeLessThanOrEqual(allowance);
    }
    // Frozen while held: the rendered top does not move from the activation on.
    const held = samples.filter(
      sample => sample.time >= activation!.after.time && sample.swiping === 'drag'
    );
    expect(held.length).toBeGreaterThan(5);
    for (const sample of held) {
      expect(Math.abs(sample.top - activation!.after.top), 'Y frozen').toBeLessThanOrEqual(PX);
    }
  });

  test('an insertion and a removal during a drag keep X and Y; release reaches the new place', async ({
    page,
    browserName,
  }) => {
    await openHarness(page);
    await page.mouse.move(AWAY.x, AWAY.y);
    await showToasts(page, ['b', 'a']);
    const driver = await driverFor(page, browserName);
    await driver.down();
    await driver.moveTo(40, 4);
    await expect(page.locator('.ret-toast.h-b')).toHaveAttribute('data-swiping', 'drag');
    const stop = await startSampling(page);
    await page.evaluate(() => window.__retHarness!.log('stage', 'frozen'));
    // Two insertions above it and one removal above it: its layout place moves down by one slot.
    await insert(page, 'n');
    await insert(page, 'm');
    await page.evaluate(() => window.__retHarness!.toast.dismiss('a'));
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    await page.waitForTimeout(300); // past the repositions the insertion and removal started
    await page.evaluate(() => window.__retHarness!.log('stage', 'release'));
    await driver.up();
    await expect(page.locator('.ret-toast.h-b')).not.toHaveAttribute('data-swiping', /.*/);
    await page.waitForTimeout(100);
    const samples = await stop();
    const release = await stageTime(page, 'release');
    const frozen = samples.filter(sample => sample.time < release);
    expect(
      frozen.filter(sample => sample.mutation).length,
      'precondition: mutations seen'
    ).toBeGreaterThan(1);
    const first = frozen[0]!;
    expect(first.swiping).toBe('drag');
    for (const sample of frozen) {
      expect(Math.abs(sample.top - first.top), 'Y frozen').toBeLessThanOrEqual(PX);
      expect(Math.abs(sample.x - first.x), 'X kept').toBeLessThanOrEqual(PX);
    }
    // On release it goes to its new layout place and to X 0, without a discontinuity.
    const after = samples.filter(sample => sample.time >= release);
    const rest = after[after.length - 1]!;
    expect(rest.swiping).toBeNull();
    expect(rest.x).toBeCloseTo(0, 0);
    expect(Math.abs(rest.top - first.top), 'precondition: its layout place moved').toBeGreaterThan(
      5
    );
    const path = [frozen[frozen.length - 1]!, ...after];
    expectInterpolatedMove(
      path.map(sample => sample.top),
      'Y to the new place'
    );
    expectInterpolatedMove(
      path.map(sample => sample.x),
      'X to rest'
    );
  });

  test('a reposition during the snap-back keeps X', async ({ page, browserName }) => {
    await openHarness(page);
    await page.mouse.move(AWAY.x, AWAY.y);
    await showToasts(page, ['b']);
    const driver = await driverFor(page, browserName);
    await driver.down();
    await driver.moveTo(60, 4);
    await expect(page.locator('.ret-toast.h-b')).toHaveAttribute('data-swiping', 'drag');
    await page.waitForTimeout(150); // no release velocity: below the distance, it springs back
    const stop = await startSampling(page);
    await page.evaluate(() => window.__retHarness!.log('stage', 'release'));
    await driver.up();
    await expect(page.locator('.ret-toast.h-b')).toHaveAttribute('data-swiping', 'settle');
    const measured = await insertMeasured(page, 'n');
    await expect(page.locator('.ret-toast.h-b')).not.toHaveAttribute('data-swiping', /.*/);
    await page.waitForTimeout(100);
    const samples = await stop();
    const release = await stageTime(page, 'release');
    const settling = samples.filter(sample => sample.time >= release);
    expect(measured.before.x, 'precondition: inserted during the snap-back').toBeGreaterThan(5);
    expectXKept(
      measured,
      settling.filter(sample => !sample.mutation),
      browserName
    );
    expectInterpolatedMove(
      settling.map(sample => sample.x),
      'X back to rest'
    );
    expect(settling[settling.length - 1]!.x).toBeCloseTo(0, 0);
  });

  test('a reposition during the fly-out keeps X travelling', async ({ page, browserName }) => {
    await openHarness(page);
    await page.mouse.move(AWAY.x, AWAY.y);
    // The public exit token, slowed so the fly-out spans several frames (D0-11).
    await page.evaluate(() =>
      window.__retHarness!.setStyle('.ret-toaster { --ret-exit-duration: 600ms; }')
    );
    await showToasts(page, ['b']);
    const driver = await driverFor(page, browserName);
    await driver.down();
    await driver.moveTo(150, 6);
    await expect(page.locator('.ret-toast.h-b')).toHaveAttribute('data-swiping', 'drag');
    await page.waitForTimeout(150); // no release velocity: the distance commits
    const stop = await startSampling(page);
    await page.evaluate(() => window.__retHarness!.log('stage', 'release'));
    await driver.up();
    await expect(page.locator('.ret-toast.h-b')).toHaveAttribute('data-swiping', 'release');
    await page.waitForTimeout(100);
    const measured = await insertMeasured(page, 'n');
    await expect(page.locator('.ret-toast.h-b')).toHaveCount(0);
    const samples = await stop();
    const release = await stageTime(page, 'release');
    const flying = samples.filter(sample => sample.time >= release && sample.connected);
    expect(measured.before.x, 'precondition: inserted during the fly-out').toBeGreaterThan(100);
    expectXKept(
      measured,
      flying.filter(sample => !sample.mutation),
      browserName
    );
    // X never goes back toward rest (a one-frame hold is the accepted limitation), and travels on.
    flying.forEach((sample, index) => {
      const previous = flying[index - 1];
      if (previous) expect(sample.x - previous.x, 'X never reverses').toBeGreaterThanOrEqual(-PX);
    });
    const later = flying.filter(sample => sample.time > measured.after.time && !sample.mutation);
    expect(Math.max(...later.map(sample => sample.x)), 'travels on').toBeGreaterThan(
      measured.after.x + 1
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__retHarness!.events.filter(e => e.type === 'dismiss').map(e => e.detail)
        )
      )
      .toEqual([{ id: 'b', reason: 'swipe' }]);
  });
});
