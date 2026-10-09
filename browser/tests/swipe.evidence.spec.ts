import { expect, test, type CDPSession, type Page, type TestInfo } from '@playwright/test';
import { openHarness } from './harness';

// P-22 S5.3 evidence (V2_PLAN.md, P-22 D2 and the S5.3 record): swipe behaviour recorded, never
// asserted as the product contract. Run by `npm run test:browser:evidence`, never by the blocking
// `test:browser`. Each test asserts only that its scenario genuinely occurred (the S4.4 rule).
// Every record names its input:
// - `trusted`: Chromium CDP touch, which the browser turns into trusted `touch` pointer events;
// - `protocol`: Chromium CDP pen (`pointerType: 'pen'`), trusted events whose properties CDP
//   decides: never physical stylus evidence (MC-7);
// - `synthetic`: script-dispatched `PointerEvent`s (`isTrusted` false), logic only.
// Chromium-only tests skip in Firefox and WebKit naming the checkpoint or gap that covers them.
// Playwright WebKit is never Safari.

test.use({ hasTouch: true });

function record(info: TestInfo, name: string, data: unknown): Promise<void> {
  console.log(`[evidence] ${info.project.name} ${name} ${JSON.stringify(data)}`);
  return info.attach(`${name}.json`, {
    body: JSON.stringify(data, null, 2),
    contentType: 'application/json',
  });
}

const CHROMIUM_TOUCH =
  'Trusted touch through CDP is Chromium only; Firefox and WebKit touch is MC-4, MC-2 and MC-3';
const CHROMIUM_PEN = 'Protocol pen through CDP is Chromium only; real pens are MC-7';

/** The D2 values (P-21 D2 decisions 2 and 3), for preconditions only. */
const thresholdFor = (width: number) => Math.min(0.4 * width, 100);
const VELOCITY_PX_PER_MS = 0.4;
const VELOCITY_WINDOW_MS = 100;
const SLOP_PX = 10;

interface PointerRecord {
  readonly type: string;
  readonly trusted: boolean;
  readonly pointerType: string;
  readonly pointerId: number;
  readonly target: string;
  /** The innermost target, through open shadow roots (`composedPath()[0]`). */
  readonly origin: string;
  readonly x: number;
  readonly y: number;
  readonly time: number;
}

/** Logs the page's pointer and capture events, as the browser (or a script) dispatched them. */
async function recordPointers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = window.__retHarness!;
    const name = (node: EventTarget | undefined) => {
      if (!(node instanceof Element)) return 'none';
      const item = node.closest('.ret-toast');
      const label = item ? [...item.classList].find(c => c.startsWith('h-')) : undefined;
      const control = node.closest('.ret-toast__close, .ret-toast__action');
      const own =
        control?.classList[0] ??
        (typeof node.className === 'string' && node.className ? node.className : node.tagName);
      if (node === item) return `root:${label}`;
      if (item) return `in:${label}:${own}`;
      if (node.getRootNode() instanceof ShadowRoot) return `shadow:${own}`;
      return own;
    };
    for (const type of [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'gotpointercapture',
      'lostpointercapture',
    ]) {
      document.addEventListener(
        type,
        event => {
          const pointer = event as PointerEvent;
          h.log(`pointer:${type}`, {
            type,
            trusted: event.isTrusted,
            pointerType: pointer.pointerType,
            pointerId: pointer.pointerId,
            target: name(event.target ?? undefined),
            origin: name(event.composedPath()[0]),
            x: Math.round(pointer.clientX),
            y: Math.round(pointer.clientY),
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

const dismissals = (page: Page) =>
  page.evaluate(() =>
    window.__retHarness!.events.filter(event => event.type === 'dismiss').map(event => event.detail)
  );

/** Waits for `onDismiss`, which runs when the exit completes, or a bounded settle with none. */
async function outcome(page: Page, id: string): Promise<unknown[]> {
  await expect
    .poll(() =>
      page.evaluate(id => {
        const item = window.__retHarness!.toastRoot(id);
        return item === null || (item.getAttribute('data-swiping') === null && !item.inert);
      }, id)
    )
    .toBe(true);
  return dismissals(page);
}

async function showToast(
  page: Page,
  id: string,
  options: { position?: string; content?: 'shadow'; duration?: number } = {}
): Promise<void> {
  await page.evaluate(
    ([id, options]) => {
      const h = window.__retHarness!;
      const common = {
        id,
        className: `h-${id}`,
        duration: options.duration ?? 60_000,
        position: (options.position ?? 'top-right') as 'top-right',
        onDismiss: (_toast: unknown, reason: string) => h.log('dismiss', { id, reason }),
      };
      if (options.content === 'shadow') h.toast.custom(h.shadowFixture(), common);
      else h.toast(`Toast ${id} with some text`, common);
    },
    [id, options] as const
  );
  await expect(page.locator(`.ret-toast.h-${id}`)).toHaveAttribute('data-phase', 'visible');
}

interface Probe {
  readonly phase: string | null;
  readonly swiping: string | null;
  readonly paused: boolean;
  readonly transformX: number;
  readonly opacity: number;
  readonly scrollY: number;
  readonly active: string | null;
}

/** Toast `id` once the renderer has committed: after the next frame and a task. */
const probe = (page: Page, id: string): Promise<Probe> =>
  page.evaluate(
    id =>
      new Promise<Probe>(resolve =>
        requestAnimationFrame(() =>
          setTimeout(() => {
            const h = window.__retHarness!;
            const item = h.toastRoot(id);
            const state = h.toastState(id);
            resolve({
              phase: state.phase,
              swiping: state.swiping,
              paused: item?.hasAttribute('data-paused') ?? false,
              transformX: state.transformX,
              opacity: state.opacity,
              scrollY: Math.round(window.scrollY),
              active: h.focusState().active,
            });
          }, 0)
        )
      ),
    id
  );

/** The centre of `selector` inside toast `id`, or of an element in its shadow root. */
async function centreOf(page: Page, id: string, selector: string, shadow = false) {
  return page.evaluate(
    ([id, selector, shadow]) => {
      const root = window.__retHarness!.toastRoot(id)!;
      const element = shadow
        ? root.querySelector('.h-shadow-host')!.shadowRoot!.querySelector(selector)!
        : root.querySelector(selector)!;
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },
    [id, selector, shadow] as const
  );
}

/**
 * One trusted touch (CDP), or a protocol pen when `pen`: each move resolves once the page has
 * received it (Chromium delivers moves with the next frame), or once the browser cancelled.
 */
class Contact {
  private start = { x: 0, y: 0 };
  private point = { x: 0, y: 0 };
  constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession,
    private readonly pen = false
  ) {}
  static async on(page: Page, pen = false) {
    return new Contact(page, await page.context().newCDPSession(page), pen);
  }
  private async send(kind: 'down' | 'move' | 'up', x: number, y: number) {
    if (this.pen) {
      const type =
        kind === 'down' ? 'mousePressed' : kind === 'up' ? 'mouseReleased' : 'mouseMoved';
      await this.cdp.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: kind === 'move' ? 'none' : 'left',
        buttons: kind === 'up' ? 0 : 1,
        clickCount: 1,
        pointerType: 'pen',
      });
      return;
    }
    const type = kind === 'down' ? 'touchStart' : kind === 'up' ? 'touchEnd' : 'touchMove';
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: kind === 'up' ? [] : [{ x, y }],
    });
  }
  async down(point: { x: number; y: number }) {
    this.start = { ...point };
    this.point = { ...point };
    await this.send('down', point.x, point.y);
  }
  /** To (dx, dy) from the start in `steps` moves, each delivered before the next is sent. */
  async moveTo(dx: number, dy: number, steps = 6) {
    const from = { ...this.point };
    for (let step = 1; step <= steps; step += 1) {
      this.point = {
        x: from.x + ((this.start.x + dx - from.x) * step) / steps,
        y: from.y + ((this.start.y + dy - from.y) * step) / steps,
      };
      await this.send('move', this.point.x, this.point.y);
      await this.page.waitForFunction(
        ({ x, y }) =>
          window.__retHarness!.events.some(
            event =>
              event.type === 'pointer:pointercancel' ||
              (event.type === 'pointer:pointermove' &&
                (event.detail as { x: number; y: number }).x === x &&
                (event.detail as { x: number; y: number }).y === y)
          ),
        { x: Math.round(this.point.x), y: Math.round(this.point.y) }
      );
    }
  }
  async up() {
    await this.send('up', this.point.x, this.point.y);
  }
}

/** A synthetic contact on an element of toast `id` (`isTrusted` false: logic only). */
function synthetic(page: Page, id: string, selector: string, shadow = false) {
  let start: { x: number; y: number } | null = null;
  let x = 0;
  const dispatch = (type: string, clientX: number, clientY: number, buttons: number) =>
    page.evaluate(
      ([id, selector, shadow, type, clientX, clientY, buttons]) => {
        const root = window.__retHarness!.toastRoot(id)!;
        const element = shadow
          ? root.querySelector('.h-shadow-host')!.shadowRoot!.querySelector(selector)!
          : root.querySelector(selector)!;
        element.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 47,
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
      [id, selector, shadow, type, clientX, clientY, buttons] as const
    );
  return {
    async down() {
      start = await centreOf(page, id, selector, shadow);
      x = start.x;
      await dispatch('pointerdown', start.x, start.y, 1);
    },
    async moveTo(dx: number, steps = 6) {
      const from = x;
      for (let step = 1; step <= steps; step += 1) {
        await new Promise(resolve => setTimeout(resolve, 16));
        x = from + ((start!.x + dx - from) * step) / steps;
        await dispatch('pointermove', x, start!.y, 1);
      }
    },
    up: () => dispatch('pointerup', x, start!.y, 0),
    /** Where the contact is now, for a release dispatched from inside the page. */
    position: () => ({ x, y: start!.y }),
  };
}

/** The D2 release velocity from recorded events: from the activating move, within the window. */
function releaseVelocity(records: readonly PointerRecord[]) {
  const down = records.find(record => record.type === 'pointerdown')!;
  const up = records.filter(record => record.type === 'pointerup').pop()!;
  const activation = records.find(
    record => record.type === 'pointermove' && Math.abs(record.x - down.x) >= SLOP_PX
  )!;
  const samples = records
    .filter(record => record.type === 'pointermove' || record.type === 'pointerup')
    .filter(record => record.time >= activation.time && record.time <= up.time)
    .filter(record => record.time >= up.time - VELOCITY_WINDOW_MS);
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const velocity = last.time > first.time ? (last.x - first.x) / (last.time - first.time) : 0;
  return { velocity, offset: up.x - activation.x, samples: samples.length };
}

test.describe('swipe evidence', { tag: '@evidence' }, () => {
  test('CF-29: a trusted flick under the distance (Chromium)', async ({
    page,
    browserName,
  }, info) => {
    test.skip(browserName !== 'chromium', CHROMIUM_TOUCH);
    await openHarness(page);
    await recordPointers(page);
    await showToast(page, 'a');
    const width = await page.evaluate(() => window.__retHarness!.toastRoot('a')!.offsetWidth);
    const finger = await Contact.on(page);
    await finger.down(await centreOf(page, 'a', '.ret-toast__title'));
    // Activation, then one move a delivered frame later, then the lift at once.
    await finger.moveTo(12, 0, 1);
    await finger.moveTo(92, 0, 1);
    await finger.up();
    const result = await outcome(page, 'a');
    const records = await pointers(page);
    const { velocity, offset, samples } = releaseVelocity(records);
    // The scenario: trusted touch, released under the distance, fast by D2's own measure.
    expect(records.every(r => r.trusted && r.pointerType === 'touch')).toBe(true);
    expect(Math.abs(offset)).toBeLessThan(thresholdFor(width));
    expect(velocity, 'precondition: a fast release').toBeGreaterThanOrEqual(2 * VELOCITY_PX_PER_MS);
    await record(info, 'cf-29-trusted-velocity', {
      input: 'trusted',
      width,
      threshold: thresholdFor(width),
      offset,
      velocity: Number(velocity.toFixed(3)),
      samples,
      result,
    });
  });

  test('CF-30 and CF-41: trusted diagonal drags from a toast (Chromium)', async ({
    page,
    browserName,
  }, info) => {
    test.skip(browserName !== 'chromium', CHROMIUM_TOUCH);
    await openHarness(page, 'long-page');
    await recordPointers(page);
    const results: Record<string, unknown> = {};
    for (const angle of [20, 30, 45, 60]) {
      const id = `d${angle}`;
      await showToast(page, id);
      await page.evaluate(() => {
        window.scrollTo(0, 1000);
        window.__retHarness!.events.splice(0);
      });
      const radians = (angle * Math.PI) / 180;
      const finger = await Contact.on(page);
      await finger.down(await centreOf(page, id, '.ret-toast__title'));
      await finger.moveTo(70 * Math.cos(radians), 70 * Math.sin(radians), 4);
      const mid = await probe(page, id);
      await finger.moveTo(150 * Math.cos(radians), 150 * Math.sin(radians), 4);
      await finger.up();
      const result = await outcome(page, id);
      const after = await probe(page, id);
      const records = await pointers(page);
      // The scenario: a trusted touch that started on this toast and moved.
      expect(records[0]).toMatchObject({
        type: 'pointerdown',
        trusted: true,
        pointerType: 'touch',
      });
      expect(records[0]!.target).toContain(`h-${id}`);
      expect(records.some(r => r.type === 'pointermove')).toBe(true);
      results[`${angle}°`] = {
        activated: mid.swiping === 'drag',
        cancelled: records.some(r => r.type === 'pointercancel'),
        scrolled: 1000 - after.scrollY,
        dismissals: result,
        pausedAfter: after.paused,
        swipingAfter: after.swiping,
      };
      await page.evaluate(id => window.__retHarness!.toast.dismiss(id), id);
      await expect(page.locator(`.ret-toast.h-${id}`)).toHaveCount(0);
      await page.evaluate(() => window.__retHarness!.events.splice(0));
    }
    await record(info, 'cf-30-cf-41-diagonals', { input: 'trusted', results });
  });

  test('CF-31: a protocol pen drag on a toast and on the page (Chromium)', async ({
    page,
    browserName,
  }, info) => {
    test.skip(browserName !== 'chromium', CHROMIUM_PEN);
    await openHarness(page, 'long-page');
    await recordPointers(page);
    const results: Record<string, unknown> = {};
    // A horizontal pen drag past the distance, resting before the lift.
    await showToast(page, 'a');
    const pen = await Contact.on(page, true);
    await pen.down(await centreOf(page, 'a', '.ret-toast__title'));
    await pen.moveTo(140, 0);
    const dragging = await probe(page, 'a');
    await new Promise(resolve => setTimeout(resolve, 150));
    await pen.up();
    const horizontal = await pointers(page);
    expect(horizontal.some(r => r.type === 'pointerdown' && r.pointerType === 'pen')).toBe(true);
    results['horizontal on a toast'] = {
      pointerTypes: [...new Set(horizontal.map(r => r.pointerType))],
      trusted: horizontal.every(r => r.trusted),
      capturedByRoot: horizontal.some(
        r => r.type === 'gotpointercapture' && r.target === 'root:h-a'
      ),
      activated: dragging.swiping === 'drag',
      dismissals: await outcome(page, 'a'),
    };
    // Vertical pen drags: does `touch-action: pan-y` let a pen scroll, from a toast or the page?
    for (const [name, onToast] of [
      ['vertical on a toast', true],
      ['vertical on the page', false],
    ] as const) {
      if (onToast) await showToast(page, 'b');
      await page.evaluate(() => {
        window.scrollTo(0, 1000);
        window.__retHarness!.events.splice(0);
      });
      const vertical = await Contact.on(page, true);
      await vertical.down(
        onToast ? await centreOf(page, 'b', '.ret-toast__title') : { x: 400, y: 300 }
      );
      await vertical.moveTo(0, 250);
      await vertical.up();
      const after = await probe(page, 'b');
      const records = await pointers(page);
      expect(records[0]).toMatchObject({ type: 'pointerdown', pointerType: 'pen' });
      results[name] = {
        scrolled: 1000 - after.scrollY,
        cancelled: records.some(r => r.type === 'pointercancel'),
        dismissals: onToast ? await outcome(page, 'b') : undefined,
      };
    }
    await record(info, 'cf-31-protocol-pen', { input: 'protocol', results });
  });

  test('CF-32: capture mechanics around a programmatic dismissal mid-drag (Chromium)', async ({
    page,
    browserName,
  }, info) => {
    test.skip(browserName !== 'chromium', CHROMIUM_TOUCH);
    await openHarness(page);
    await recordPointers(page);
    await showToast(page, 'a');
    const finger = await Contact.on(page);
    await finger.down(await centreOf(page, 'a', '.ret-toast__title'));
    await finger.moveTo(60, 0);
    const beforeDismissal = (await pointers(page)).length;
    await page.evaluate(() => window.__retHarness!.toast.dismiss('a'));
    await finger.moveTo(90, 0, 2);
    await finger.up();
    await outcome(page, 'a');
    const records = await pointers(page);
    // The scenario: the root took real capture, then the dismissal came during the drag.
    expect(records.some(r => r.type === 'gotpointercapture' && r.target === 'root:h-a')).toBe(true);
    expect(beforeDismissal).toBeGreaterThan(0);
    const describe = (r: PointerRecord) => `${r.type} → ${r.target}`;
    await record(info, 'cf-32-capture-mechanics', {
      input: 'trusted',
      beforeDismissal: records
        .slice(0, beforeDismissal)
        .filter(r => r.type !== 'pointermove')
        .map(describe),
      afterDismissal: records.slice(beforeDismissal).map(describe),
      dismissals: await dismissals(page),
    });
  });

  test('CF-35: the one-frame hold when a reposition restarts a fly-out', async ({
    page,
    browserName,
  }, info) => {
    const results: Record<string, unknown> = {};
    for (const reposition of [false, true]) {
      await openHarness(page);
      await recordPointers(page);
      await page.evaluate(() =>
        window.__retHarness!.setStyle('.ret-toaster { --ret-exit-duration: 600ms; }')
      );
      await showToast(page, 'b');
      const trusted = browserName === 'chromium';
      const finger = trusted ? await Contact.on(page) : null;
      const fake = trusted ? null : synthetic(page, 'b', '.ret-toast__title');
      if (finger) await finger.down(await centreOf(page, 'b', '.ret-toast__title'));
      else await fake!.down();
      if (finger) await finger.moveTo(150, 0);
      else await fake!.moveTo(150);
      await new Promise(resolve => setTimeout(resolve, 150));
      // Release and sample in the page: each read with its own clock, until the toast goes.
      const sampling = page.evaluate(() => {
        const h = window.__retHarness!;
        return h.sampleFrames(
          () => ({
            now: performance.now(),
            x: h.toastState('b').transformX,
            swiping: h.toastState('b').swiping,
            connected: h.toastRoot('b') !== null,
          }),
          { maxFrames: 120, atToastMutations: true, until: value => !value.connected }
        );
      });
      if (finger) await finger.up();
      else await fake!.up();
      await expect(page.locator('.ret-toast.h-b')).toHaveAttribute('data-swiping', 'release');
      let insertedAt: number | null = null;
      if (reposition) {
        await page.waitForTimeout(100);
        insertedAt = await page.evaluate(() => {
          const h = window.__retHarness!;
          const at = performance.now();
          h.toast('Toast n', { id: 'n', className: 'h-n', duration: 60_000 });
          return at;
        });
      }
      const samples = (await sampling)
        .filter(sample => sample.value.connected && !sample.mutation)
        .map(sample => sample.value);
      // Frames in which X did not move while the fly-out was still running.
      const holds = samples
        .map((sample, index) => ({
          sample,
          previous: samples[index - 1],
          next: samples[index + 1],
        }))
        .filter(({ sample, previous, next }) => previous && next && sample.swiping === 'release')
        .filter(({ sample, previous }) => Math.abs(sample.x - previous!.x) <= 0.05)
        .map(({ sample }) => Math.round(sample.now - samples[0]!.now));
      // The scenario: a fly-out (release state) that the insertion, when there is one, interrupted.
      expect(samples.some(sample => sample.swiping === 'release')).toBe(true);
      if (insertedAt !== null) {
        const releasing = samples.filter(sample => sample.swiping === 'release');
        expect(releasing[releasing.length - 1]!.now, 'inserted during the fly-out').toBeGreaterThan(
          insertedAt
        );
      }
      results[reposition ? 'with a reposition' : 'control, no reposition'] = {
        input: trusted ? 'trusted' : 'synthetic',
        frames: samples.length,
        holdsAtMs: holds,
        insertedAtMs: insertedAt === null ? null : Math.round(insertedAt - samples[0]!.now),
        x: samples.map(sample => Math.round(sample.x * 10) / 10),
      };
    }
    await record(info, 'cf-35-one-frame-hold', results);
  });

  test('CF-36 and CF-40: opacity when a dismissal lands in the snap-back, and on a commit', async ({
    page,
  }, info) => {
    const results: Record<string, unknown> = {};
    for (const [name, distance, dismissAfter] of [
      ['snap-back, dismissed at 0 ms', 60, 0],
      ['snap-back, dismissed at 16 ms', 60, 16],
      ['snap-back, dismissed at 50 ms', 60, 50],
      ['snap-back, dismissed at 100 ms', 60, 100],
      ['commit by distance', 150, null],
    ] as const) {
      await openHarness(page);
      await recordPointers(page);
      await showToast(page, 'a');
      const fake = synthetic(page, 'a', '.ret-toast__title');
      await fake.down();
      await fake.moveTo(distance);
      await new Promise(resolve => setTimeout(resolve, 150));
      // Release, sample from the release's task (D2-12), and dismiss on schedule.
      const data = await page.evaluate(
        async ([dismissAfter, at]) => {
          const h = window.__retHarness!;
          const read = () => {
            const state = h.toastState('a');
            return {
              opacity: state.opacity,
              phase: state.phase,
              swiping: state.swiping,
              connected: state.connected,
            };
          };
          const releaseOpacity = h.toastState('a').opacity;
          const title = h.toastRoot('a')!.querySelector('.ret-toast__title')!;
          title.dispatchEvent(
            new PointerEvent('pointerup', {
              pointerId: 47,
              pointerType: 'touch',
              isPrimary: true,
              bubbles: true,
              composed: true,
              clientX: at.x,
              clientY: at.y,
              buttons: 0,
            })
          );
          const sampling = h.sampleFrames(read, {
            maxFrames: 120,
            until: value => !value.connected,
          });
          if (dismissAfter !== null) {
            if (dismissAfter > 0) await new Promise(resolve => setTimeout(resolve, dismissAfter));
            h.toast.dismiss('a');
          }
          const frames = (await sampling).map(sample => sample.value);
          return { releaseOpacity, frames };
        },
        [dismissAfter, fake.position()] as const
      );
      const exiting = data.frames.filter(frame => frame.connected && frame.phase === 'exiting');
      // The opacity the toast had when the dismissal landed: the last frame before its exit (for
      // a dismissal in the release's own task, the release opacity).
      const settling = data.frames.filter(frame => frame.connected && frame.phase === 'visible');
      const atDismissal =
        dismissAfter === null || dismissAfter === 0 || settling.length === 0
          ? data.releaseOpacity
          : settling[settling.length - 1]!.opacity;
      // The scenario: released below 1, as the snap-back or the commit, then exiting, then gone.
      expect(data.releaseOpacity).toBeLessThan(1);
      expect(data.frames[0]!.swiping).toBe(dismissAfter === null ? 'release' : 'settle');
      expect(exiting.length, 'reached the exit').toBeGreaterThan(0);
      expect(data.frames[data.frames.length - 1]!.connected).toBe(false);
      const opacities = exiting.map(frame => frame.opacity);
      results[name] = {
        input: 'synthetic',
        releaseOpacity: Number(data.releaseOpacity.toFixed(3)),
        exitFirst: Number(opacities[0]!.toFixed(3)),
        exitMax: Number(Math.max(...opacities).toFixed(3)),
        atDismissal: Number(atDismissal.toFixed(3)),
        firstStep: Number((opacities[0]! - atDismissal).toFixed(3)),
        maxRiseOverDismissal: Number((Math.max(...opacities) - atDismissal).toFixed(3)),
        monotoneAfterFirst: opacities
          .slice(1)
          .every((value, index) => value <= opacities[index]! + 0.001),
        exitFrames: opacities.length,
        dismissals: await outcome(page, 'a'),
      };
    }
    await record(info, 'cf-36-cf-40-opacity', results);
  });

  test('CF-38: a drag from a button inside a shadow root, against a light-DOM button', async ({
    page,
    browserName,
  }, info) => {
    const results: Record<string, unknown> = {};
    for (const [name, selector, shadow] of [
      ['shadow-root button', '.h-shadow-target', true],
      ['light-DOM button', '.h-light-target', false],
    ] as const) {
      await openHarness(page);
      await recordPointers(page);
      await showToast(page, 'a', { content: 'shadow' });
      const trusted = browserName === 'chromium';
      if (trusted) {
        const finger = await Contact.on(page);
        await finger.down(await centreOf(page, 'a', selector, shadow));
        await finger.moveTo(140, 0);
        results[name] = {
          input: 'trusted',
          activated: (await probe(page, 'a')).swiping === 'drag',
        };
        await new Promise(resolve => setTimeout(resolve, 150));
        await finger.up();
      } else {
        const fake = synthetic(page, 'a', selector, shadow);
        await fake.down();
        await fake.moveTo(140);
        results[name] = {
          input: 'synthetic',
          activated: (await probe(page, 'a')).swiping === 'drag',
        };
        await new Promise(resolve => setTimeout(resolve, 150));
        await fake.up();
      }
      const records = await pointers(page);
      const down = records.find(r => r.type === 'pointerdown')!;
      // The scenario: the contact began on the intended button, and the root saw a retargeted host.
      expect(down.origin).toBe(shadow ? 'shadow:h-shadow-target' : 'in:h-a:h-light-target');
      results[name] = {
        ...(results[name] as object),
        pointerdownTarget: down.target,
        pointerdownOrigin: down.origin,
        dismissals: await outcome(page, 'a'),
      };
    }
    await record(info, 'cf-38-shadow-dom', results);
  });

  test('CF-39: where a press on the toast body puts focus', async ({ page, browserName }, info) => {
    const results: Record<string, unknown> = {};
    const fresh = async () => {
      await openHarness(page);
      await recordPointers(page);
      await showToast(page, 'a');
      return centreOf(page, 'a', '.ret-toast__title');
    };
    // Trusted mouse, in every engine.
    let at = await fresh();
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    const pressed = await probe(page, 'a');
    await page.mouse.up();
    let records = await pointers(page);
    expect(records.find(r => r.type === 'pointerdown')).toMatchObject({
      trusted: true,
      pointerType: 'mouse',
    });
    results['mouse press'] = { input: 'trusted', active: pressed.active, paused: pressed.paused };
    if (browserName === 'chromium') {
      for (const [name, pen, drag] of [
        ['touch tap', false, false],
        ['touch drag (held)', false, true],
        ['pen press', true, false],
      ] as const) {
        at = await fresh();
        const contact = await Contact.on(page, pen);
        await contact.down(at);
        if (drag) await contact.moveTo(60, 0);
        const during = await probe(page, 'a');
        await contact.up();
        const after = await probe(page, 'a');
        records = await pointers(page);
        expect(records.find(r => r.type === 'pointerdown')).toMatchObject({
          trusted: true,
          pointerType: pen ? 'pen' : 'touch',
        });
        results[name] = {
          input: pen ? 'protocol' : 'trusted',
          activeDuring: during.active,
          activeAfter: after.active,
          swipingDuring: during.swiping,
        };
      }
    } else {
      results['touch and pen'] = 'not available in this engine: MC-2, MC-3, MC-7';
    }
    await record(info, 'cf-39-press-focus', results);
  });

  test('CF-33 (Class 4): focus after a swipe dismissal of the focused toast', async ({
    page,
    browserName,
  }, info) => {
    await openHarness(page);
    await recordPointers(page);
    await showToast(page, 'b');
    await showToast(page, 'a');
    await page.keyboard.press('Alt+t');
    // The scenario: the swiped toast holds focus, by the keyboard.
    expect(await page.evaluate(() => window.__retHarness!.focusState().active)).toBe('toast:a');
    const trusted = browserName === 'chromium';
    if (trusted) {
      const finger = await Contact.on(page);
      await finger.down(await centreOf(page, 'a', '.ret-toast__title'));
      await finger.moveTo(140, 0);
      await new Promise(resolve => setTimeout(resolve, 150));
      await finger.up();
    } else {
      const fake = synthetic(page, 'a', '.ret-toast__title');
      await fake.down();
      await fake.moveTo(140);
      await new Promise(resolve => setTimeout(resolve, 150));
      await fake.up();
    }
    const result = await outcome(page, 'a');
    expect(result).toEqual([{ id: 'a', reason: 'swipe' }]);
    const after = await page.evaluate(() => ({
      focus: window.__retHarness!.focusState(),
      bPaused: window.__retHarness!.toastRoot('b')!.hasAttribute('data-paused'),
    }));
    await record(info, 'cf-33-swipe-restoration', {
      input: trusted ? 'trusted' : 'synthetic',
      active: after.focus.active,
      focusVisible: after.focus.focusVisible,
      bPaused: after.bPaused,
    });
  });
});
