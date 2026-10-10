import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './harness';

// P-22 S3: the library's forced-colours rules (§17.5; CF-14, with CF-28's emulated layer) under
// Playwright's `forced-colors: active` emulation in real Chromium, Firefox and WebKit. This is
// emulation, not Windows High Contrast (MC-6, S6). System colours are resolved in the same page,
// never hard-coded, since each engine resolves them differently.
//
// Only the library's own rules are asserted. How far an engine's emulation also forces author
// colours (text, icons) is the browser's, not the library's: WebKit's does not.

type SystemColour = 'CanvasText' | 'Canvas' | 'Highlight' | 'ButtonText';

async function openForcedColours(page: Page): Promise<Record<SystemColour, string>> {
  await page.emulateMedia({ forcedColors: 'active' });
  await openHarness(page);
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  return page.evaluate(() => {
    const resolve = (colour: string) => {
      const probe = document.createElement('span');
      probe.style.color = colour;
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    return {
      CanvasText: resolve('CanvasText'),
      Canvas: resolve('Canvas'),
      Highlight: resolve('Highlight'),
      ButtonText: resolve('ButtonText'),
    };
  });
}

/** Shows a success toast with an action and progress, labelled `a`, and waits until visible. */
async function showToast(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__retHarness!.toast.success('Saved', {
      id: 'a',
      className: 'h-a',
      duration: 60000,
      progress: true,
      action: { label: 'Undo', onClick: () => undefined },
    });
  });
  await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
}

/** Computed styles of an element (or one of its pseudo-elements), by selector. */
const styleOf = (page: Page, selector: string, properties: readonly string[], pseudo?: string) =>
  page.evaluate(
    ({ selector, properties, pseudo }) => {
      const style = getComputedStyle(document.querySelector(selector)!, pseudo ?? null);
      return Object.fromEntries(properties.map(name => [name, style.getPropertyValue(name)]));
    },
    { selector, properties, pseudo }
  );

const EDGES = ['top', 'right', 'bottom', 'left'] as const;

test('draws the card edge, the action border and the progress fill in system colours', async ({
  page,
}) => {
  const system = await openForcedColours(page);
  await showToast(page);

  // The card edge: a 1px CanvasText border on every side.
  const card = await styleOf(
    page,
    '.ret-toast.h-a',
    EDGES.flatMap(edge => [`border-${edge}-color`, `border-${edge}-width`, `border-${edge}-style`])
  );
  for (const edge of EDGES) {
    expect(card[`border-${edge}-color`]).toBe(system.CanvasText);
    expect(card[`border-${edge}-width`]).toBe('1px');
    expect(card[`border-${edge}-style`]).toBe('solid');
  }

  // The action keeps a visible ButtonText border (forced colours remove its background).
  const action = await styleOf(
    page,
    '.ret-toast__action',
    EDGES.flatMap(edge => [`border-${edge}-color`, `border-${edge}-width`, `border-${edge}-style`])
  );
  for (const edge of EDGES) {
    expect(action[`border-${edge}-color`]).toBe(system.ButtonText);
    expect(action[`border-${edge}-width`]).toBe('1px');
    expect(action[`border-${edge}-style`]).toBe('solid');
  }

  // The progress fill is CanvasText and visible; the strip draws no track (P-20).
  const fill = await styleOf(page, '.ret-toast__progress-fill', ['background-color']);
  expect(fill['background-color']).toBe(system.CanvasText);
  const strip = await styleOf(page, '.ret-toast__progress', ['background-color']);
  expect(strip['background-color']).toMatch(/^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/);
  const fillBox = (await page.evaluate(() => window.__retHarness!.progressState('a').fill))!;
  expect(fillBox.width).toBeGreaterThan(0);
  expect(fillBox.height).toBeGreaterThan(0);

  // Each type keeps its icon, so it stays recognisable by shape.
  const icon = (await page.locator('.ret-toast.h-a .ret-toast__icon svg').boundingBox())!;
  expect(icon.width).toBeGreaterThan(0);
  expect(icon.height).toBeGreaterThan(0);
});

test('rings the focused controls, the toast and the region in Highlight', async ({ page }) => {
  const system = await openForcedColours(page);
  await showToast(page);
  const ring = async (selector: string) => {
    const style = await styleOf(page, selector, [
      'outline-color',
      'outline-style',
      'outline-width',
    ]);
    expect(
      await page.evaluate(
        selector => document.querySelector(selector)!.matches(':focus-visible'),
        selector
      )
    ).toBe(true);
    expect(style['outline-color']).toBe(system.Highlight);
    expect(style['outline-style']).not.toBe('none');
    expect(Number.parseFloat(style['outline-width']!)).toBeGreaterThan(0);
  };

  // Trusted keyboard paths only reach these states; S3 asserts only their styles (§17.4).
  await page.keyboard.press('Tab');
  await ring('.ret-toast__action');
  await page.keyboard.press('Tab');
  await ring('.ret-toast__close');
  await page.keyboard.press('Alt+t');
  await ring('.ret-toast.h-a');

  // The region's ring, drawn by its ::after while it has focus: after the only toast is closed
  // from the keyboard, focus restoration leaves focus on the region (§18).
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ret-toast')).toHaveCount(0);
  expect(
    await page.evaluate(() => document.activeElement?.matches('.ret-toaster:focus-visible'))
  ).toBe(true);
  const region = await styleOf(
    page,
    '.ret-toaster',
    [...EDGES.map(edge => `border-${edge}-color`), 'outline-color'],
    '::after'
  );
  for (const edge of EDGES) expect(region[`border-${edge}-color`]).toBe(system.Highlight);
  expect(region['outline-color']).toBe(system.Canvas);
});
