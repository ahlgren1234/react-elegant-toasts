import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { openHarness } from './harness';

// P-22 S4.1 evidence (V2_PLAN.md, P-22 S4.1 record): which mouse buttons, and which touch and pen
// presses, reach S4-H2's guard on a bare toast list, and what each does without it. Observations
// recorded, never asserted as the product contract; run by `npm run test:browser:evidence`, never
// by the blocking `test:browser`. Production code is not changed: the "without the guard" layer is
// a pure-DOM control page in the same engine, a focusable section around a list.

function record(info: TestInfo, name: string, data: unknown): Promise<void> {
  console.log(`[evidence] ${info.project.name} ${name} ${JSON.stringify(data)}`);
  return info.attach(`${name}.json`, {
    body: JSON.stringify(data, null, 2),
    contentType: 'application/json',
  });
}

const BUTTONS = ['left', 'middle', 'right'] as const;

/** Logs every press, release, click and context menu: its target, button and prevented default. */
async function recordPresses(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = window.__retHarness!;
    for (const type of ['mousedown', 'mouseup', 'click', 'auxclick', 'contextmenu']) {
      document.addEventListener(type, event => {
        const target = event.target as Element;
        h.log(`press:${type}`, {
          target: target.className || target.tagName.toLowerCase(),
          button: (event as MouseEvent).button,
          prevented: event.defaultPrevented,
        });
      });
    }
  });
}

/** The press entries and the active element after them, then clears the log's press entries. */
const take = (page: Page) =>
  page.evaluate(() => {
    const h = window.__retHarness!;
    const presses = h.events
      .filter(event => event.type.startsWith('press:'))
      .map(event => ({ type: event.type.slice(6), ...(event.detail as object) }));
    h.events.splice(0, h.events.length);
    return { presses, active: h.focusState().active };
  });

/** Two toasts at `top-right` and the middle of the gap between them, with `outside` focused. */
async function gapWithOutsideFocused(page: Page): Promise<{ x: number; y: number }> {
  await page.evaluate(() => {
    const h = window.__retHarness!;
    for (const id of ['b', 'a'])
      h.toast(`Toast ${id}`, { id, className: `h-${id}`, duration: Infinity });
  });
  await expect(page.locator('.ret-toast[data-phase="visible"]')).toHaveCount(2);
  const a = (await page.locator('.ret-toast.h-a').boundingBox())!;
  const b = (await page.locator('.ret-toast.h-b').boundingBox())!;
  return { x: a.x + a.width / 2, y: (a.y + a.height + b.y) / 2 };
}

test.describe('mouse buttons on a bare toast list (S4-H2 follow-up)', { tag: '@evidence' }, () => {
  test('each mouse button on a gap, with the guard', async ({ page }, info) => {
    await openHarness(page, 'long-page');
    await recordPresses(page);
    const at = await gapWithOutsideFocused(page);
    const results: Record<string, unknown> = {};
    for (const button of BUTTONS) {
      await page.locator('[data-harness="outside"]').focus();
      await take(page);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down({ button });
      const pressed = await take(page);
      await page.mouse.up({ button });
      results[button] = { pressed, released: await take(page) };
      // A secondary press may open a context menu in headed runs; close it.
      await page.keyboard.press('Escape');
    }
    await record(info, 'h2-mouse-buttons-guarded', results);
    expect(Object.keys(results)).toHaveLength(3);
  });

  test('each mouse button on a pure-DOM focusable section around a list (no guard)', async ({
    page,
  }, info) => {
    await openHarness(page, 'long-page');
    await recordPresses(page);
    // The library's shape without the library: a script-focusable section, no box of its own, and
    // a fixed list with a box, which is the press target.
    await page.evaluate(() => {
      const h = window.__retHarness!;
      h.setStyle(
        '.h-control-list { position: fixed; top: 200px; left: 200px; width: 300px; height: 80px; margin: 0; }'
      );
      const section = document.createElement('section');
      section.tabIndex = -1;
      section.className = 'h-control-section';
      section.setAttribute('aria-label', 'Control');
      const list = document.createElement('ol');
      list.className = 'h-control-list';
      section.append(list);
      document.body.append(section);
      section.addEventListener('focus', () => h.log('press:section-focus', { target: 'section' }));
    });
    const results: Record<string, unknown> = {};
    for (const button of BUTTONS) {
      await page.locator('[data-harness="outside"]').focus();
      await take(page);
      await page.mouse.move(350, 240);
      await page.mouse.down({ button });
      const pressed = await take(page);
      await page.mouse.up({ button });
      results[button] = { pressed, released: await take(page) };
      await page.keyboard.press('Escape');
    }
    await record(info, 'h2-mouse-buttons-control', results);
    expect(Object.keys(results)).toHaveLength(3);
  });

  test('a touch tap on a gap, with the guard', async ({ browser }, info) => {
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { width: 1280, height: 720 },
    });
    try {
      const page = await context.newPage();
      await openHarness(page, 'long-page');
      await recordPresses(page);
      const at = await gapWithOutsideFocused(page);
      await page.locator('[data-harness="outside"]').focus();
      await take(page);
      await page.touchscreen.tap(at.x, at.y);
      const tapped = await take(page);
      await record(info, 'h2-touch-tap', tapped);
      expect(tapped).toBeDefined();
    } finally {
      await context.close();
    }
  });

  test('a protocol pen press on a gap, tip and barrel button (Chromium)', async ({
    page,
    browserName,
  }, info) => {
    test.skip(
      browserName !== 'chromium',
      'CDP pen is Chromium only, and protocol pen is not pen evidence; real pens are MC-7'
    );
    await openHarness(page, 'long-page');
    await recordPresses(page);
    const at = await gapWithOutsideFocused(page);
    const cdp = await page.context().newCDPSession(page);
    const results: Record<string, unknown> = {};
    for (const [name, button, buttons] of [
      ['tip', 'left', 1],
      ['barrel', 'right', 2],
    ] as const) {
      await page.locator('[data-harness="outside"]').focus();
      await take(page);
      for (const type of ['mousePressed', 'mouseReleased'] as const) {
        await cdp.send('Input.dispatchMouseEvent', {
          type,
          ...at,
          button,
          buttons: type === 'mousePressed' ? buttons : 0,
          clickCount: 1,
          pointerType: 'pen',
        });
      }
      results[name] = await take(page);
    }
    await record(info, 'h2-protocol-pen', results);
    expect(Object.keys(results)).toHaveLength(2);
  });
});
