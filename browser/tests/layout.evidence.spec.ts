import { expect, test, type TestInfo } from '@playwright/test';
import { openHarness } from './harness';

// P-22 S3 Class 2 evidence (V2_PLAN.md, P-22 D2): observations recorded, never asserted as the
// product contract. Run by `npm run test:browser:evidence`, never by the blocking `test:browser`.
// The Chromium-only tests use CDP, which no other engine offers; they skip elsewhere, naming the
// manual checkpoint that covers that engine.

/** How long a state is held to observe it. */
const HOLD_MS = 500;

function record(info: TestInfo, name: string, data: unknown): Promise<void> {
  console.log(`[evidence] ${info.project.name} ${name} ${JSON.stringify(data)}`);
  return info.attach(`${name}.json`, {
    body: JSON.stringify(data, null, 2),
    contentType: 'application/json',
  });
}

test.describe('layout and progress evidence', { tag: '@evidence' }, () => {
  test('CF-15: gutters under Chromium’s safe-area override (an approximation)', async ({
    page,
    browserName,
  }, info) => {
    test.skip(
      browserName !== 'chromium',
      'CDP safe-area override is Chromium only; real notched devices are MC-2 and MC-3'
    );
    // Injected through the browser's own env() values, without the device's viewport-fit gating:
    // a synthetic approximation of the arithmetic, never real notched-device evidence (D2-9).
    const insets = { top: 47, right: 20, bottom: 34, left: 20 };
    await page.setViewportSize({ width: 412, height: 915 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
    await openHarness(page);
    await page.evaluate(() => {
      const h = window.__retHarness!;
      for (const position of ['top-left', 'bottom-right'] as const) {
        h.toast('Toast', {
          id: position,
          className: `h-${position}`,
          position,
          duration: Infinity,
        });
      }
    });
    await expect(page.locator('.ret-toast[data-phase="visible"]')).toHaveCount(2);
    const measured = await page.evaluate(() => {
      const rect = (position: string) =>
        document
          .querySelector(`.ret-toaster__list[data-position="${position}"]`)!
          .getBoundingClientRect();
      const top = rect('top-left');
      const bottom = rect('bottom-right');
      return {
        top: top.top,
        left: top.left,
        bottom: innerHeight - bottom.bottom,
        right: innerWidth - bottom.right,
        width: top.width,
      };
    });
    // --ret-offset 16px plus each edge's inset; width = 412 - 2 × 16 - (20 + 20).
    const expected = { top: 63, left: 36, bottom: 50, right: 36, width: 340 };
    await record(info, 'cf-15-cdp-safe-area', { insets, measured, expected });
    expect(Object.keys(measured)).toHaveLength(5);
  });

  test('CF-25: progress across a genuine window blur in Chromium (CDP minimise)', async ({
    page,
    browserName,
  }, info) => {
    test.skip(
      browserName !== 'chromium',
      'Genuine blur through CDP is Chromium only; Firefox and Safari are MC-5 and MC-1'
    );
    await openHarness(page);
    // Playwright emulates focus and re-applies that on navigation, so it is turned off afterwards,
    // with the page in front (D1's method): minimising then blurs the window for real.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    await cdp.send('Page.bringToFront');
    await page.evaluate(() => {
      const h = window.__retHarness!;
      h.toast('Toast', { id: 'a', className: 'h-a', duration: 8000, progress: true });
      window.addEventListener('blur', event => h.log('window-blur', event.isTrusted));
      window.addEventListener('focus', event => h.log('window-focus', event.isTrusted));
    });
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
    await page.waitForFunction(() => window.__retHarness!.progressState('a').scale < 0.9);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    const toast = page.locator('.ret-toast.h-a');
    const read = () =>
      page.evaluate(() => ({
        time: Math.round(performance.now()),
        paused: document.querySelector('.ret-toast.h-a')!.hasAttribute('data-paused'),
        scale: Math.round(window.__retHarness!.progressState('a').scale * 1000) / 1000,
        hasFocus: document.hasFocus(),
      }));

    const before = await read();
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    await expect(toast).toHaveAttribute('data-paused', '');
    const minimised = await read();
    // A deliberate observation window: frames may be throttled while the window is minimised.
    await page.waitForTimeout(HOLD_MS);
    const stillMinimised = await read();
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await expect(toast).not.toHaveAttribute('data-paused', /.*/);
    const restored = await read();
    await page.waitForTimeout(HOLD_MS);
    const later = await read();
    const events = await page.evaluate(() =>
      window
        .__retHarness!.events.filter(event => event.type.startsWith('window-'))
        .map(event => ({ type: event.type, trusted: event.detail }))
    );
    await record(info, 'cf-25-cdp-blur', {
      before,
      minimised,
      stillMinimised,
      restored,
      later,
      events,
    });
    expect(events.length).toBeGreaterThan(0);
  });

  test('CF-27: the strip’s clip and the fill’s moving edge', async ({ page }, info) => {
    await openHarness(page);
    await page.evaluate(() => {
      window.__retHarness!.toast('Toast', {
        id: 'a',
        className: 'h-a',
        duration: 4000,
        progress: true,
      });
    });
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
    const samples = [];
    for (const below of [0.9, 0.5, 0.1]) {
      await page.waitForFunction(
        below => window.__retHarness!.progressState('a').scale < below,
        below
      );
      samples.push(
        await page.evaluate(() => {
          const h = window.__retHarness!;
          const item = h.toastRoot('a')!;
          const strip = item.querySelector('.ret-toast__progress')!;
          const progress = h.progressState('a');
          return {
            scale: Math.round(progress.scale * 1000) / 1000,
            clipPath: getComputedStyle(strip).clipPath,
            cardRadius: getComputedStyle(item).borderBottomLeftRadius,
            cardBorder: getComputedStyle(item).borderBottomWidth,
            strip: progress.strip,
            fill: progress.fill,
            // A straight moving edge: the fill is an unrotated box (its transform is scaleX only).
            fillTransform: getComputedStyle(item.querySelector('.ret-toast__progress-fill')!)
              .transform,
          };
        })
      );
    }
    await record(info, 'cf-27-strip-clip', samples);
    expect(samples).toHaveLength(3);
  });
});
