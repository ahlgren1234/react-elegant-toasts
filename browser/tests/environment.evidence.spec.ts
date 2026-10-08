import { expect, test, type CDPSession, type Page, type TestInfo } from '@playwright/test';
import type { ToasterProps } from '../../src';
import { openHarness } from './harness';

// P-22 S4.3 evidence (V2_PLAN.md, P-22 D2 and the S4.3 record): the environment around a toast,
// recorded, never asserted as the product contract. Run by `npm run test:browser:evidence`, never
// by the blocking `test:browser`. Each test asserts only that it obtained genuine evidence; one
// that cannot is skipped in that engine, naming the manual checkpoint or gap that covers it.
// - CF-1 and CF-5: genuine window blur and focus, from Chromium's CDP minimise (D2-4). Genuine
//   hidden documents are never produced by it, and `visibilitychange` is never dispatched.
// - CF-4: a stack appearing under a stationary pointer, with no synthetic boundary events.
// - CF-11 B: `keyshortcuts` in Chromium's accessibility tree (CDP). Not assistive technology.

function record(info: TestInfo, name: string, data: unknown): Promise<void> {
  console.log(`[evidence] ${info.project.name} ${name} ${JSON.stringify(data)}`);
  return info.attach(`${name}.json`, {
    body: JSON.stringify(data, null, 2),
    contentType: 'application/json',
  });
}

/** A point away from every stack. */
const AWAY = { x: 640, y: 360 } as const;

/** Holds a state long enough to see whether a frozen progress fill stays frozen. */
const HOLD_MS = 500;

/**
 * Turns Playwright's focus emulation off after navigation, with the page in front, so minimising
 * the window blurs it for real (the S3 method: emulation is re-applied on navigation). Logs the
 * window's own trusted `focus` and `blur` through the harness recorder (`focus:window`).
 */
async function genuineWindow(page: Page): Promise<{ cdp: CDPSession; windowId: number }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  await cdp.send('Page.bringToFront');
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  return { cdp, windowId };
}

const setWindow = (cdp: CDPSession, windowId: number, windowState: 'minimized' | 'normal') =>
  cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState } });

/** The environment and toast `a` in one read. */
const environment = (page: Page) =>
  page.evaluate(() => {
    const h = window.__retHarness!;
    const item = h.toastRoot('a');
    const progress = h.progressState('a');
    return {
      time: Math.round(performance.now()),
      focus: h.focusState().active,
      hasFocus: document.hasFocus(),
      visibilityState: document.visibilityState,
      hidden: document.hidden,
      paused: item?.hasAttribute('data-paused') ?? null,
      progress: progress.present ? Math.round(progress.scale * 1000) / 1000 : null,
    };
  });

const windowEvents = (page: Page) =>
  page.evaluate(() =>
    window
      .__retHarness!.events.filter(
        event =>
          event.type.endsWith(':window') ||
          event.type === 'focusin' ||
          event.type === 'focusout' ||
          event.type === 'visibilitychange'
      )
      .map(event => ({
        type: event.type,
        time: Math.round(event.time),
        ...(event.detail as object),
      }))
  );

/** Logs `visibilitychange`, if the browser ever dispatches one; never dispatched by the spec. */
const watchVisibility = (page: Page) =>
  page.evaluate(() => {
    const h = window.__retHarness!;
    document.addEventListener('visibilitychange', event =>
      h.log('visibilitychange', { state: document.visibilityState, trusted: event.isTrusted })
    );
  });

async function showProgressToast(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.__retHarness!.toast('Toast a', {
      id: 'a',
      className: 'h-a',
      duration: 10_000,
      progress: true,
    })
  );
  await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
  await page.waitForFunction(() => window.__retHarness!.progressState('a').scale < 0.97);
}

test.describe('environment evidence', { tag: '@evidence' }, () => {
  test('CF-1: a genuine window blur while a toast holds focus (Chromium CDP minimise)', async ({
    page,
    browserName,
  }, info) => {
    test.skip(
      browserName !== 'chromium',
      'Genuine blur through CDP is Chromium only; Firefox and Safari are MC-5 and MC-1'
    );
    await openHarness(page);
    await page.mouse.move(AWAY.x, AWAY.y);
    const { cdp, windowId } = await genuineWindow(page);
    await watchVisibility(page);
    await showProgressToast(page);
    await page.keyboard.press('Tab');
    const focused = await environment(page);
    expect(focused.focus, 'precondition: the toast holds focus').toBe('close:a');
    await setWindow(cdp, windowId, 'minimized');
    await page.waitForFunction(() => !document.hasFocus());
    const minimised = await environment(page);
    // A deliberate observation window: does the fill stay frozen while minimised?
    await page.waitForTimeout(HOLD_MS);
    const stillMinimised = await environment(page);
    await setWindow(cdp, windowId, 'normal');
    await page.waitForFunction(() => document.hasFocus());
    const restored = await environment(page);
    await page.waitForTimeout(HOLD_MS);
    const restoredLater = await environment(page);
    // Focus leaves the toast by Escape (§18: released to the document, nothing recorded).
    await page.keyboard.press('Escape');
    await expect(page.locator('.ret-toast.h-a')).not.toHaveAttribute('data-paused', /.*/);
    const released = await environment(page);
    await page.waitForTimeout(HOLD_MS);
    const releasedLater = await environment(page);
    const events = await windowEvents(page);
    // Genuine evidence: the window's own trusted blur and focus.
    expect(events.filter(event => event.type === 'blur:window')).toHaveLength(1);
    await record(info, 'cf-1-blur-with-focus', {
      focused,
      minimised,
      stillMinimised,
      restored,
      restoredLater,
      released,
      releasedLater,
      events,
    });
  });

  test('CF-5: a genuine window blur with nothing focused, and visibility (Chromium CDP minimise)', async ({
    page,
    browserName,
  }, info) => {
    test.skip(
      browserName !== 'chromium',
      'Genuine blur through CDP is Chromium only; Firefox and Safari are MC-5 and MC-1. ' +
        'Hidden documents are MC-1, MC-2, MC-3 and MC-5 in every engine'
    );
    await openHarness(page);
    await page.mouse.move(AWAY.x, AWAY.y);
    const { cdp, windowId } = await genuineWindow(page);
    await watchVisibility(page);
    await showProgressToast(page);
    const before = await environment(page);
    await setWindow(cdp, windowId, 'minimized');
    await page.waitForFunction(() => !document.hasFocus());
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-paused', '');
    const minimised = await environment(page);
    await page.waitForTimeout(HOLD_MS);
    const stillMinimised = await environment(page);
    await setWindow(cdp, windowId, 'normal');
    await page.waitForFunction(() => document.hasFocus());
    await expect(page.locator('.ret-toast.h-a')).not.toHaveAttribute('data-paused', /.*/);
    const restored = await environment(page);
    await page.waitForTimeout(HOLD_MS);
    const restoredLater = await environment(page);
    const events = await windowEvents(page);
    expect(events.filter(event => event.type === 'blur:window')).toHaveLength(1);
    await record(info, 'cf-5-blur-and-visibility', {
      before,
      minimised,
      stillMinimised,
      restored,
      restoredLater,
      events,
      // Whether minimising ever produced a hidden document: D1 found it never does.
      everHidden: [minimised, stillMinimised].some(state => state.hidden),
    });
  });

  test('CF-4: a stack appearing under a stationary pointer', async ({ page }, info) => {
    await openHarness(page);
    await page.evaluate(() => {
      const h = window.__retHarness!;
      for (const type of ['pointerenter', 'pointerleave', 'pointerover', 'pointermove']) {
        document.addEventListener(
          type,
          event => {
            const target = event.target as Element;
            if (!target.classList?.contains('ret-toaster__list')) return;
            h.log(`list-${type}`, { trusted: event.isTrusted });
          },
          { capture: true }
        );
      }
    });
    // Where toast `a` will appear: shown once to measure, then removed.
    await page.evaluate(() =>
      window.__retHarness!.toast('Probe', { id: 'probe', className: 'h-probe', duration: Infinity })
    );
    await expect(page.locator('.ret-toast.h-probe')).toHaveAttribute('data-phase', 'visible');
    const box = (await page.locator('.ret-toast.h-probe').boundingBox())!;
    await page.evaluate(() => window.__retHarness!.toast.dismiss('probe'));
    await expect(page.locator('.ret-toast.h-probe')).toHaveCount(0);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.evaluate(() => window.__retHarness!.events.splice(0));
    const since = await page.evaluate(() => performance.now());
    await page.evaluate(() =>
      window.__retHarness!.toast('Toast a', { id: 'a', className: 'h-a', duration: 60_000 })
    );
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
    // The pointer stays still for a while: does the stack learn that it is under it?
    await page.waitForTimeout(HOLD_MS);
    const stationary = await page.evaluate(
      since => ({
        paused: window.__retHarness!.toastRoot('a')!.hasAttribute('data-paused'),
        events: window
          .__retHarness!.events.filter(event => event.type.startsWith('list-'))
          .map(event => ({ type: event.type, after: Math.round(event.time - since) })),
      }),
      since
    );
    await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2);
    await expect
      .poll(() =>
        page.evaluate(() => window.__retHarness!.toastRoot('a')!.hasAttribute('data-paused'))
      )
      .toBe(true);
    const moved = await page.evaluate(() =>
      window.__retHarness!.events.filter(event => event.type.startsWith('list-')).map(e => e.type)
    );
    await record(info, 'cf-4-stationary-pointer', { stationary, afterOnePixel: moved });
  });

  test('CF-11 B: keyshortcuts in Chromium’s accessibility tree (CDP)', async ({
    page,
    browserName,
  }, info) => {
    test.skip(
      browserName !== 'chromium',
      'Firefox and WebKit accessibility trees are not reachable with Playwright: an unverified ' +
        'gap, not a pass; assistive technology is P-29'
    );
    await openHarness(page);
    const cdp = await page.context().newCDPSession(page);
    const regionNode = async () => {
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');
      const region = nodes.find(
        node => node.role?.value === 'region' && node.name?.value === 'Notifications'
      );
      if (!region) return null;
      // CDP types AX values as `any`: read them as the strings they are, or null.
      const text = (value: unknown) => (typeof value === 'string' ? value : null);
      return {
        role: text(region.role?.value),
        name: text(region.name?.value),
        keyshortcuts: text(
          region.properties?.find(property => property.name === 'keyshortcuts')?.value.value
        ),
      };
    };
    const results: Record<string, unknown> = {};
    const configs: [string, ToasterProps][] = [
      ['default', {}],
      ['ctrlKey shiftKey KeyK', { hotkey: ['ctrlKey', 'shiftKey', 'KeyK'] }],
      ['F6', { hotkey: ['F6'] }],
      ['altKey Comma', { hotkey: ['altKey', 'Comma'] }],
      ['false', { hotkey: false }],
    ];
    for (const [name, props] of configs) {
      await page.evaluate(props => window.__retHarness!.mount(props), props);
      results[name] = {
        dom: await page.locator('.ret-toaster').getAttribute('aria-keyshortcuts'),
        tree: await regionNode(),
      };
    }
    expect(Object.values(results).every(result => (result as { tree: unknown }).tree)).toBe(true);
    await record(info, 'cf-11-b-accessibility-tree', results);
  });
});
