import { expect, test, type CDPSession, type Page } from '@playwright/test';
import type { ToastPosition } from '../../src';
import { openHarness } from './harness';

// P-22 S5.2 (V2_PLAN.md, P-22 D2 and the S5 decisions): TRUSTED touch in Chromium, Class 1.
// - CF-29 layer B: the swipe logic with real touch: distance commit, spring-back, centre
//   directions, the forbidden clamp and interactive descendants.
// - CF-30 and CF-41: a vertical drag that starts on a toast scrolls the page under `pan-y`, with
//   the browser's own `pointercancel`, and dismisses nothing.
// - CF-32: a programmatic dismissal and a genuine loss of capture during an active drag.
// The input is CDP `Input.dispatchTouchEvent` in a context with `hasTouch` at 1280 × 720 (S5
// decision 3): the browser generates trusted `touch` pointer events, with real capture and
// `touch-action`. It is Chromium only: Firefox and WebKit have no trusted touch drag in Playwright
// (D1), so these tests skip there, and their touch integration stays with the device checkpoints.
// Layer A (synthetic, all three engines) is `swipe.spec.ts`; it never stands in for this.

test.use({ hasTouch: true });
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'Trusted touch drag is Chromium only (CDP); Firefox and WebKit touch integration is MC-4 ' +
    '(Firefox for Android), MC-2 (iOS Safari) and MC-3 (Android Chrome)'
);

/** The D2 distance (P-21 D2 decision 2), written here so an implementation change fails. */
const thresholdFor = (width: number) => Math.min(0.4 * width, 100);
/** The D2 velocity window: a release this long after the last move has no release velocity. */
const VELOCITY_WINDOW_MS = 100;
/** How long the finger rests before lifting, so only the distance decides (no release velocity). */
const REST_MS = 150;

interface PointerRecord {
  readonly type: string;
  readonly trusted: boolean;
  readonly pointerType: string;
  readonly pointerId: number;
  readonly target: string;
  readonly x: number;
  readonly time: number;
}

/**
 * Records the browser's own pointer events (as dispatched to the page, before the library), apart
 * from the test's CDP input, with their `isTrusted`, `pointerId` and `timeStamp`.
 */
async function recordPointers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = window.__retHarness!;
    const types = [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'gotpointercapture',
      'lostpointercapture',
      'click',
    ];
    for (const type of types) {
      document.addEventListener(
        type,
        event => {
          const pointer = event as PointerEvent;
          const target = event.target as Element;
          const item = target.closest?.('.ret-toast');
          const label = item ? [...item.classList].find(name => name.startsWith('h-')) : undefined;
          // A library control by its class, whatever inside it (an SVG path) was hit.
          const control = target.closest?.('.ret-toast__close, .ret-toast__action');
          const name = control
            ? control.classList[0]
            : typeof target.className === 'string' && target.className
              ? target.className
              : target.tagName;
          h.log(`pointer:${type}`, {
            type,
            trusted: event.isTrusted,
            pointerType: pointer.pointerType ?? '',
            pointerId: pointer.pointerId ?? -1,
            target:
              target === item ? `root:${label}` : item ? `in:${label}:${name}` : target.tagName,
            x: Math.round(pointer.clientX),
            time: event.timeStamp,
          });
        },
        { capture: true }
      );
    }
  });
}

const pointers = (page: Page): Promise<PointerRecord[]> =>
  page.evaluate(() =>
    window
      .__retHarness!.events.filter(event => event.type.startsWith('pointer:'))
      .map(event => event.detail as PointerRecord)
  );

interface ToastSpec {
  readonly id: string;
  readonly position?: ToastPosition;
  readonly action?: boolean;
}

/** Finite toasts, so a pause shows as `data-paused`, each logging its dismissal. */
async function showToasts(page: Page, toasts: readonly ToastSpec[]): Promise<void> {
  await page.evaluate(toasts => {
    const h = window.__retHarness!;
    for (const spec of toasts) {
      h.toast(`Toast ${spec.id} with some text`, {
        id: spec.id,
        className: `h-${spec.id}`,
        duration: 60_000,
        position: spec.position ?? 'top-right',
        action: spec.action ? { label: `Undo ${spec.id}`, onClick: () => undefined } : undefined,
        onDismiss: (_toast, reason) => h.log('dismiss', { id: spec.id, reason }),
      });
    }
  }, toasts);
  for (const spec of toasts) {
    await expect(page.locator(`.ret-toast.h-${spec.id}`)).toHaveAttribute('data-phase', 'visible');
  }
}

const dismissals = (page: Page) =>
  page.evaluate(() =>
    window.__retHarness!.events.filter(event => event.type === 'dismiss').map(event => event.detail)
  );
const expectDismissals = (page: Page, expected: unknown[]) =>
  expect.poll(() => dismissals(page)).toEqual(expected);

interface TouchState {
  readonly phase: string | null;
  readonly swiping: string | null;
  readonly paused: boolean;
  readonly inert: boolean;
  readonly transformX: number;
  readonly scrollY: number;
}

/** Toast `id` once the renderer has committed: after the next frame and a task. */
const stateOf = (page: Page, id: string): Promise<TouchState> =>
  page.evaluate(
    id =>
      new Promise<TouchState>(resolve =>
        requestAnimationFrame(() =>
          setTimeout(() => {
            const h = window.__retHarness!;
            const item = h.toastRoot(id);
            const state = h.toastState(id);
            resolve({
              phase: state.phase,
              swiping: state.swiping,
              paused: item?.hasAttribute('data-paused') ?? false,
              inert: item?.hasAttribute('inert') ?? false,
              transformX: state.transformX,
              scrollY: Math.round(window.scrollY),
            });
          }, 0)
        )
      ),
    id
  );

/** One finger, driven through CDP: each call resolves once the browser has taken the event. */
class Finger {
  private start = { x: 0, y: 0 };
  private point = { x: 0, y: 0 };
  constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession
  ) {}
  async down(x: number, y: number): Promise<void> {
    this.start = { x, y };
    this.point = { x, y };
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
  }
  /** Moves to (dx, dy) from where the contact started, in `steps` moves about a frame apart. */
  async moveTo(dx: number, dy: number, steps = 8): Promise<void> {
    const from = { ...this.point };
    const to = { x: this.start.x + dx, y: this.start.y + dy };
    for (let step = 1; step <= steps; step += 1) {
      await new Promise(resolve => setTimeout(resolve, 16));
      this.point = {
        x: from.x + ((to.x - from.x) * step) / steps,
        y: from.y + ((to.y - from.y) * step) / steps,
      };
      await this.cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [this.point],
      });
    }
    // Chromium dispatches the moves with the next frame, after CDP returns: wait until the last
    // one has reached the page, or the browser has cancelled the pointer (a scroll).
    await this.page.waitForFunction(
      x =>
        window.__retHarness!.events.some(
          event =>
            event.type === 'pointer:pointercancel' ||
            (event.type === 'pointer:pointermove' && (event.detail as { x: number }).x === x)
        ),
      Math.round(this.point.x)
    );
  }
  async up(): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
}

async function fingerOn(page: Page, id: string, selector = '.ret-toast__title') {
  const box = (await page.locator(`.ret-toast.h-${id} ${selector}`).boundingBox())!;
  const finger = new Finger(page, await page.context().newCDPSession(page));
  await finger.down(box.x + box.width / 2, box.y + box.height / 2);
  return finger;
}

/** Rests, then lifts: with no move inside the velocity window, only the distance can decide. */
async function restAndLift(finger: Finger): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, REST_MS));
  await finger.up();
}

/** From the trusted events: the release came more than the velocity window after the last move. */
function expectNoReleaseVelocity(records: readonly PointerRecord[]): void {
  const ups = records.filter(record => record.type === 'pointerup');
  const up = ups[ups.length - 1]!;
  const moves = records.filter(record => record.type === 'pointermove' && record.time <= up.time);
  const move = moves[moves.length - 1]!;
  expect(up.time - move.time, 'precondition: no move within the velocity window').toBeGreaterThan(
    VELOCITY_WINDOW_MS
  );
}

/** Every recorded pointer event is the browser's own trusted touch input. */
function expectTrustedTouch(records: readonly PointerRecord[]): void {
  const input = records.filter(record => !record.type.endsWith('pointercapture'));
  expect(input.length, 'precondition: pointer events arrived').toBeGreaterThan(0);
  for (const record of input.filter(record => record.type !== 'click')) {
    expect(record, `${record.type} is trusted touch`).toMatchObject({
      trusted: true,
      pointerType: 'touch',
    });
  }
}

const widthOf = (page: Page, id: string) =>
  page.evaluate(id => window.__retHarness!.toastRoot(id)!.offsetWidth, id);

test.describe('CF-29 layer B: swipe with trusted touch (Chromium)', () => {
  for (const [position, sign] of [
    ['top-right', 1],
    ['top-center', -1],
    ['top-center', 1],
  ] as const) {
    test(`at ${position}, a touch drag ${sign < 0 ? 'left' : 'right'} past the distance commits`, async ({
      page,
    }) => {
      await openHarness(page);
      await recordPointers(page);
      await showToasts(page, [{ id: 'a', position }]);
      const threshold = thresholdFor(await widthOf(page, 'a'));
      const finger = await fingerOn(page, 'a');
      await finger.moveTo(sign * 140, 0);
      const dragging = await stateOf(page, 'a');
      expect(dragging, 'activated, under the finger').toMatchObject({ swiping: 'drag' });
      expect(Math.abs(dragging.transformX)).toBeGreaterThanOrEqual(threshold);
      expect(Math.sign(dragging.transformX)).toBe(sign);
      await restAndLift(finger);
      await expectDismissals(page, [{ id: 'a', reason: 'swipe' }]);
      const records = await pointers(page);
      expectTrustedTouch(records);
      expectNoReleaseVelocity(records);
      // The root took real capture at activation, and released it after the release.
      expect(records.some(r => r.type === 'gotpointercapture' && r.target === 'root:h-a')).toBe(
        true
      );
      await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    });
  }

  test('below the distance, a touch drag springs back with no dismissal', async ({ page }) => {
    await openHarness(page);
    await recordPointers(page);
    await showToasts(page, [{ id: 'a' }]);
    const finger = await fingerOn(page, 'a');
    await finger.moveTo(60, 0);
    const dragging = await stateOf(page, 'a');
    expect(dragging.swiping).toBe('drag');
    expect(Math.abs(dragging.transformX)).toBeLessThan(thresholdFor(await widthOf(page, 'a')));
    await restAndLift(finger);
    await expect
      .poll(() => stateOf(page, 'a'))
      .toMatchObject({ swiping: null, transformX: 0, phase: 'visible', paused: false });
    const records = await pointers(page);
    expectTrustedTouch(records);
    expectNoReleaseVelocity(records);
    expect(await dismissals(page)).toEqual([]);
  });

  test('the forbidden direction never moves the toast', async ({ page }) => {
    await openHarness(page);
    await recordPointers(page);
    await showToasts(page, [{ id: 'a', position: 'top-right' }]);
    const finger = await fingerOn(page, 'a');
    await finger.moveTo(-140, 0);
    expect(await stateOf(page, 'a')).toMatchObject({ swiping: null, transformX: 0 });
    await restAndLift(finger);
    expectTrustedTouch(await pointers(page));
    await expect
      .poll(() => stateOf(page, 'a'))
      .toMatchObject({ swiping: null, transformX: 0, phase: 'visible', paused: false });
    expect(await dismissals(page)).toEqual([]);
  });

  for (const selector of ['.ret-toast__action', '.ret-toast__close']) {
    test(`never starts from ${selector.slice(12)}`, async ({ page }) => {
      await openHarness(page);
      await recordPointers(page);
      await showToasts(page, [{ id: 'a', action: true }]);
      const finger = await fingerOn(page, 'a', selector);
      await finger.moveTo(140, 0);
      expect(await stateOf(page, 'a')).toMatchObject({ swiping: null, transformX: 0 });
      await restAndLift(finger);
      const records = await pointers(page);
      expectTrustedTouch(records);
      expect(records[0]!.target, 'precondition: the contact started on the control').toContain(
        selector.slice(1)
      );
      await expect
        .poll(() => stateOf(page, 'a'))
        .toMatchObject({ swiping: null, phase: 'visible', paused: false });
      expect(await dismissals(page)).toEqual([]);
    });
  }
});

test.describe('CF-30 and CF-41: vertical scrolling from a toast (Chromium)', () => {
  test('a vertical drag on a toast scrolls the page and dismisses nothing', async ({ page }) => {
    await openHarness(page, 'long-page');
    await recordPointers(page);
    await showToasts(page, [{ id: 'a' }]);
    // Control: the same kind of drag on page content scrolls, so this context scrolls by touch.
    await page.evaluate(() => window.scrollTo(0, 1000));
    const control = new Finger(page, await page.context().newCDPSession(page));
    await control.down(400, 300);
    await control.moveTo(0, 250);
    await control.up();
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { message: 'precondition: touch scrolls' })
      .toBeLessThan(900);
    await page.evaluate(() => {
      window.scrollTo(0, 1000);
      window.__retHarness!.events.splice(0);
    });
    // The drag that matters starts on the toast.
    const finger = await fingerOn(page, 'a');
    await finger.moveTo(0, 250);
    await finger.up();
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { message: 'the page scrolled' })
      .toBeLessThan(900);
    const records = await pointers(page);
    expectTrustedTouch(records);
    expect(records[0]!.target, 'precondition: the contact started on the toast').toContain('h-a');
    // The browser took the pointer for scrolling.
    expect(records.some(record => record.type === 'pointercancel')).toBe(true);
    expect(records.some(record => record.type === 'pointerup')).toBe(false);
    await expect
      .poll(() => stateOf(page, 'a'))
      .toMatchObject({ swiping: null, transformX: 0, phase: 'visible', paused: false });
    expect(await dismissals(page)).toEqual([]);
  });
});

test.describe('CF-32: interruptions during an active trusted-touch drag (Chromium)', () => {
  test('a programmatic dismissal mid-drag wins, once, and the gesture lets go', async ({
    page,
  }) => {
    await openHarness(page);
    await recordPointers(page);
    await showToasts(page, [{ id: 'a' }]);
    const finger = await fingerOn(page, 'a');
    await finger.moveTo(60, 0);
    expect(await stateOf(page, 'a'), 'precondition: dragging').toMatchObject({ swiping: 'drag' });
    const pointerId = (await pointers(page)).find(
      record => record.type === 'pointerdown'
    )!.pointerId;
    await page.evaluate(() => window.__retHarness!.toast.dismiss('a'));
    const exiting = await page.evaluate(pointerId => {
      const item = window.__retHarness!.toastRoot('a')!;
      return {
        phase: item.getAttribute('data-phase'),
        inert: item.hasAttribute('inert'),
        paused: item.hasAttribute('data-paused'),
        captured: item.hasPointerCapture(pointerId),
      };
    }, pointerId);
    expect(exiting).toEqual({ phase: 'exiting', inert: true, paused: false, captured: false });
    // The finger goes on past the distance and lifts: nothing more happens.
    await finger.moveTo(160, 0);
    await restAndLift(finger);
    await expectDismissals(page, [{ id: 'a', reason: 'programmatic' }]);
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    const records = await pointers(page);
    expectTrustedTouch(records);
    expect(
      records.some(record => record.type === 'lostpointercapture' && record.target === 'root:h-a'),
      'the root lost its capture'
    ).toBe(true);
  });

  test('a genuine loss of the root’s capture mid-drag restores the toast', async ({ page }) => {
    await openHarness(page);
    await recordPointers(page);
    await showToasts(page, [{ id: 'a' }]);
    const finger = await fingerOn(page, 'a');
    await finger.moveTo(60, 0);
    const pointerId = (await pointers(page)).find(
      record => record.type === 'pointerdown'
    )!.pointerId;
    const before = await page.evaluate(
      pointerId => window.__retHarness!.toastRoot('a')!.hasPointerCapture(pointerId),
      pointerId
    );
    expect(before, 'precondition: the root holds real capture').toBe(true);
    const since = (await pointers(page)).length;
    // The browser releases the capture, at the page's request: a real lostpointercapture, not a
    // dispatched one.
    await page.evaluate(
      pointerId => window.__retHarness!.toastRoot('a')!.releasePointerCapture(pointerId),
      pointerId
    );
    // The browser processes a released capture before the pointer's next event (Pointer Events):
    // one more move delivers it.
    await finger.moveTo(64, 0, 1);
    await expect
      .poll(async () =>
        (await pointers(page)).slice(since).some(record => record.type === 'lostpointercapture')
      )
      .toBe(true);
    const lost = (await pointers(page)).slice(since);
    expect(lost.find(record => record.type === 'lostpointercapture')).toMatchObject({
      trusted: true,
      target: 'root:h-a',
    });
    // The drag has ended (the finger still touches the stack, whose hover reason is P-15's).
    expect((await stateOf(page, 'a')).swiping).not.toBe('drag');
    // Moving on past the distance and lifting dismisses nothing; the toast is at rest, unheld.
    await finger.moveTo(160, 0);
    await restAndLift(finger);
    await expect
      .poll(() => stateOf(page, 'a'))
      .toMatchObject({ swiping: null, transformX: 0, phase: 'visible', paused: false });
    expect(await dismissals(page)).toEqual([]);
  });
});
