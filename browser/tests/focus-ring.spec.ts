import { expect, test, type Page } from '@playwright/test';
import type { ToasterProps } from '../../src';
import { openHarness } from './harness';

// P-22 S4.2 (V2_PLAN.md, P-22 D2 and the S4 decisions): Class 1 in Chromium, Firefox and WebKit.
// - CF-11 A: the region's `aria-keyshortcuts` attribute in the DOM (§17.2). The accessibility tree
//   is CF-11 B, Class 2 evidence (S4.3).
// - CF-12: the §17.4 ring styles while `:focus-visible` matches, on a keyboard-established path that
//   starts with trusted Tab. The toast root and the region take focus from script only (Alt+T and
//   restoration), so for them the match is asserted as a precondition after earlier Tab input;
//   script focus with no earlier keyboard input is Class 2 (S4.3). No engine's heuristic is the
//   product contract. Colours are the tokens resolved on the focused element, never hard-coded.
// - CF-13: while the region has focus, its ring takes no pointer input and stacks above the lists.
//   The production assertions use the production stylesheet only; one separate, labelled
//   diagnostic test overrides `pointer-events` to observe stacking by hit-testing.

/** A persistent toast labelled `id`, with an action when asked, logging its dismissal. */
async function showToast(page: Page, id: string, withAction = false, duration = Infinity) {
  await page.evaluate(
    ([id, withAction, duration]) => {
      const h = window.__retHarness!;
      h.toast(`Toast ${id}`, {
        id,
        className: `h-${id}`,
        duration,
        action: withAction ? { label: `Undo ${id}`, onClick: () => undefined } : undefined,
        onDismiss: (_toast, reason) => h.log('dismiss', { id, reason }),
      });
    },
    [id, withAction, duration] as const
  );
  await expect(page.locator(`.ret-toast.h-${id}`)).toHaveAttribute('data-phase', 'visible');
}

const active = (page: Page) => page.evaluate(() => window.__retHarness!.focusState().active);

async function press(page: Page, key: string, expected: string, precondition: string) {
  await page.keyboard.press(key);
  expect(await active(page), `precondition: ${precondition}`).toBe(expected);
}

interface Ring {
  readonly focusVisible: boolean;
  readonly outlineStyle: string;
  readonly outlineWidth: string;
  readonly outlineColor: string;
  readonly outlineOffset: string;
  /** The element's own `color`, which `currentColor` resolves to. */
  readonly color: string;
  /** `--ret-focus` and `--ret-surface` as they apply to the element, resolved to colours. */
  readonly focus: string;
  readonly surface: string;
}

/** The focused element's outline, and the tokens resolved where it is. */
const ringOf = (page: Page, selector: string): Promise<Ring> =>
  page.evaluate(selector => {
    const element = document.querySelector(selector)!;
    const style = getComputedStyle(element);
    const resolve = (name: string) => {
      const probe = document.createElement('span');
      probe.style.color = style.getPropertyValue(name).trim();
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    return {
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
      color: style.color,
      focus: resolve('--ret-focus'),
      surface: resolve('--ret-surface'),
    };
  }, selector);

/** A `--ret-focus` ring, 2px solid, at `offset`, while `:focus-visible` matches. */
function expectFocusRing(ring: Ring, offset: string, what: string) {
  expect(ring.focusVisible, `${what} matches :focus-visible`).toBe(true);
  expect(ring.outlineStyle, what).toBe('solid');
  expect(ring.outlineWidth, what).toBe('2px');
  expect(ring.outlineColor, what).toBe(ring.focus);
  expect(ring.outlineOffset, what).toBe(offset);
}

interface RegionRing {
  readonly focused: boolean;
  readonly focusVisible: boolean;
  readonly outlineStyle: string;
  readonly after: Record<string, string>;
  readonly focus: string;
  readonly surface: string;
  readonly zIndex: string;
  readonly lists: { readonly zIndex: string; readonly position: string; readonly child: boolean }[];
}

/** The region's own outline, its `::after` ring, and its lists' stacking. */
const regionRing = (page: Page): Promise<RegionRing> =>
  page.evaluate(() => {
    const region = document.querySelector<HTMLElement>('.ret-toaster')!;
    const style = getComputedStyle(region);
    const after = getComputedStyle(region, '::after');
    const resolve = (name: string) => {
      const probe = document.createElement('span');
      probe.style.color = style.getPropertyValue(name).trim();
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    const read = (...names: string[]) =>
      Object.fromEntries(names.map(name => [name, after.getPropertyValue(name)]));
    return {
      focused: document.activeElement === region,
      focusVisible: region.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      after: read(
        'content',
        'position',
        'top',
        'right',
        'bottom',
        'left',
        'z-index',
        'pointer-events',
        'border-top-width',
        'border-right-width',
        'border-bottom-width',
        'border-left-width',
        'border-top-style',
        'border-top-color',
        'border-right-color',
        'border-bottom-color',
        'border-left-color',
        'border-top-left-radius',
        'outline-style',
        'outline-width',
        'outline-color'
      ),
      focus: resolve('--ret-focus'),
      surface: resolve('--ret-surface'),
      zIndex: style.getPropertyValue('--ret-z-index').trim(),
      lists: [...document.querySelectorAll('.ret-toaster__list')].map(list => ({
        zIndex: getComputedStyle(list).zIndex,
        position: getComputedStyle(list).position,
        child: list.parentElement === region,
      })),
    };
  });

/**
 * Leaves the region focused, with its ring shown, by trusted keyboard input only: Tab to the only
 * toast's close, Enter, and restoration to the region (§18). Then shows `b` and `a`, finite so
 * their hover pause shows, which take no focus.
 */
async function focusRegionThenShow(page: Page, first: string): Promise<void> {
  await showToast(page, 'z');
  await press(page, 'Tab', first, `Tab reaches ${first}`);
  if (first !== 'close:z') await press(page, 'Tab', 'close:z', 'Tab reaches close:z');
  await press(page, 'Enter', 'region', 'the keyboard close restores to the region');
  await expect(page.locator('.ret-toast.h-z')).toHaveCount(0);
  await showToast(page, 'b', false, 60_000);
  await showToast(page, 'a', false, 60_000);
  const ring = await regionRing(page);
  expect(ring.focused, 'precondition: new toasts took no focus').toBe(true);
  expect(ring.focusVisible, 'precondition: the region matches :focus-visible').toBe(true);
  expect(ring.after['content'], 'precondition: the ring is drawn').not.toBe('none');
}

const centreOf = async (page: Page, selector: string) => {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** What `elementFromPoint` hits there, named: a toast's label, `region`, or another element. */
const hitAt = (page: Page, point: { x: number; y: number }) =>
  page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return null;
    if (hit.classList.contains('ret-toaster')) return 'region';
    const item = hit.closest('.ret-toast');
    if (item) return `toast:${[...item.classList].find(name => name.startsWith('h-'))!.slice(2)}`;
    return `other:${hit.tagName.toLowerCase()}`;
  }, point);

/** A point away from every stack, inside the region ring's box. */
const AWAY = { x: 640, y: 360 } as const;

test('CF-11 A: aria-keyshortcuts names the hotkey in effect, or is absent', async ({ page }) => {
  await openHarness(page);
  const shortcutsWith = async (props: ToasterProps) => {
    await page.evaluate(props => window.__retHarness!.mount(props), props);
    return page.locator('.ret-toaster').getAttribute('aria-keyshortcuts');
  };
  expect(await page.locator('.ret-toaster').getAttribute('aria-keyshortcuts')).toBe('Alt+T');
  expect(await shortcutsWith({ hotkey: ['ctrlKey', 'shiftKey', 'KeyK'] })).toBe('Control+Shift+K');
  // Modifiers are written in ARIA's order whatever order they are given in (§17.2).
  expect(await shortcutsWith({ hotkey: ['shiftKey', 'ctrlKey', 'KeyK'] })).toBe('Control+Shift+K');
  expect(await shortcutsWith({ hotkey: ['F6'] })).toBe('F6');
  // A punctuation key's label depends on the layout: the hotkey works but is not advertised.
  expect(await shortcutsWith({ hotkey: ['altKey', 'Comma'] })).toBeNull();
  expect(await shortcutsWith({ hotkey: false })).toBeNull();
  expect(await shortcutsWith({})).toBe('Alt+T');
});

test.describe('CF-12: focus rings while :focus-visible matches', () => {
  test('the action and close rings, reached by Tab', async ({ page }) => {
    await openHarness(page);
    await showToast(page, 'a', true);
    await press(page, 'Tab', 'action:a', 'Tab reaches the action');
    expectFocusRing(await ringOf(page, '.ret-toast.h-a .ret-toast__action'), '2px', 'action');
    await press(page, 'Tab', 'close:a', 'Tab reaches the close');
    expectFocusRing(await ringOf(page, '.ret-toast.h-a .ret-toast__close'), '2px', 'close');
  });

  test('the toast root’s ring, inside its edge, after Tab and Alt+T', async ({ page }) => {
    await openHarness(page);
    await showToast(page, 'a', true);
    await press(page, 'Tab', 'action:a', 'Tab reaches the action');
    expect((await ringOf(page, '.ret-toast.h-a .ret-toast__action')).focusVisible).toBe(true);
    await press(page, 'Alt+t', 'toast:a', 'Alt+T focuses the toast');
    expectFocusRing(await ringOf(page, '.ret-toast.h-a'), '-1px', 'toast root');
  });

  test('a custom toast’s close ring in its colour, and its root ring outside it', async ({
    page,
  }) => {
    await openHarness(page);
    // Consumer CSS: the custom toast's colour, which its close and that ring inherit (P-17 S5).
    await page.evaluate(() =>
      window.__retHarness!.setStyle('.ret-toast.h-a { color: rgb(170, 20, 90); }')
    );
    await page.evaluate(() =>
      window.__retHarness!.toast.custom('Custom a', {
        id: 'a',
        className: 'h-a',
        closeButton: true,
        duration: Infinity,
      })
    );
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
    await press(page, 'Tab', 'close:a', 'Tab reaches the custom close');
    const close = await ringOf(page, '.ret-toast.h-a .ret-toast__close');
    expect(close.focusVisible, 'custom close matches :focus-visible').toBe(true);
    expect(close.outlineStyle).toBe('solid');
    expect(close.outlineWidth).toBe('2px');
    expect(close.outlineOffset).toBe('2px');
    expect(close.color).toBe('rgb(170, 20, 90)');
    expect(close.outlineColor, 'currentColor').toBe(close.color);
    expect(close.outlineColor).not.toBe(close.focus);
    await press(page, 'Alt+t', 'toast:a', 'Alt+T focuses the custom toast');
    expectFocusRing(await ringOf(page, '.ret-toast.h-a'), '2px', 'custom toast root');
  });

  test('the region’s ring after restoration from a keyboard close', async ({ page }) => {
    await openHarness(page);
    await showToast(page, 'a');
    await press(page, 'Tab', 'close:a', 'Tab reaches the close');
    await press(page, 'Enter', 'region', 'the keyboard close restores to the region');
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    const ring = await regionRing(page);
    expect(ring.focusVisible, 'precondition: the region matches :focus-visible').toBe(true);
    // The section's own outline gives way to the fixed, viewport-inset ::after ring.
    expect(ring.outlineStyle).toBe('none');
    expect(ring.after).toMatchObject({
      position: 'fixed',
      top: '4px',
      right: '4px',
      bottom: '4px',
      left: '4px',
      'border-top-width': '3px',
      'border-right-width': '3px',
      'border-bottom-width': '3px',
      'border-left-width': '3px',
      'border-top-style': 'solid',
      'border-top-color': ring.focus,
      'border-right-color': ring.focus,
      'border-bottom-color': ring.focus,
      'border-left-color': ring.focus,
      'border-top-left-radius': '12px',
      'outline-style': 'solid',
      'outline-width': '2px',
      'outline-color': ring.surface,
    });
    expect(ring.after['content']).not.toBe('none');
  });
});

test.describe('CF-13: the region ring takes no pointer input and stacks above the lists', () => {
  test('production: hit-testing, hover and clicks reach the toasts through the ring', async ({
    page,
  }) => {
    await openHarness(page);
    await page.mouse.move(AWAY.x, AWAY.y);
    await focusRegionThenShow(page, 'close:z');
    const ring = await regionRing(page);
    expect(ring.after['pointer-events']).toBe('none');
    // Stacking, from the production stylesheet: the fixed ring is the region's ::after, at the
    // lists' z-index and after them in tree order, so it paints above them.
    expect(ring.after['position']).toBe('fixed');
    expect(ring.after['z-index']).toBe(ring.zIndex);
    expect(ring.lists.length).toBeGreaterThan(0);
    for (const list of ring.lists) {
      expect(list).toEqual({ zIndex: ring.zIndex, position: 'fixed', child: true });
    }
    // The ring's box covers the viewport, yet hit-testing never finds it.
    expect(await hitAt(page, await centreOf(page, '.ret-toast.h-a'))).toBe('toast:a');
    expect(await hitAt(page, await centreOf(page, '.ret-toast.h-b'))).toBe('toast:b');
    expect(await hitAt(page, AWAY)).not.toBe('region');
    expect(await hitAt(page, { x: 5, y: 360 }), 'on the ring band itself').not.toBe('region');
    // A pointer over a toast reaches its list: the stack's hover pause (§10).
    const a = await centreOf(page, '.ret-toast.h-a');
    await page.mouse.move(a.x, a.y);
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-paused', '');
    await expect(page.locator('.ret-toast.h-b')).toHaveAttribute('data-paused', '');
    await page.mouse.move(AWAY.x, AWAY.y);
    await expect(page.locator('.ret-toast.h-a')).not.toHaveAttribute('data-paused', /.*/);
    await expect(page.locator('.ret-toast.h-b')).not.toHaveAttribute('data-paused', /.*/);
    expect((await regionRing(page)).focused, 'precondition: the ring is still shown').toBe(true);
    // A trusted click on a toast's close, under the ring, works.
    await page.locator('.ret-toast.h-a .ret-toast__close').click();
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        window.__retHarness!.events.filter(event => event.type === 'dismiss').map(e => e.detail)
      )
    ).toEqual([
      { id: 'z', reason: 'close-button' },
      { id: 'a', reason: 'close-button' },
    ]);
  });

  test('production: a click on a page control under the ring works', async ({ page }) => {
    await openHarness(page, 'long-page');
    await page.mouse.move(AWAY.x, AWAY.y);
    await focusRegionThenShow(page, 'outside');
    const outside = (await page.locator('[data-harness="outside"]').boundingBox())!;
    // The button lies inside the ring's box (inset 4px from the viewport).
    expect(outside.x).toBeGreaterThan(4);
    expect(outside.y).toBeGreaterThan(4);
    await page.evaluate(() => {
      const h = window.__retHarness!;
      document
        .querySelector('[data-harness="outside"]')!
        .addEventListener('click', event => h.log('outside-click', event.isTrusted));
    });
    await page.mouse.click(outside.x + outside.width / 2, outside.y + outside.height / 2);
    expect(await active(page)).toBe('outside');
    expect(
      await page.evaluate(() =>
        window.__retHarness!.events.filter(e => e.type === 'outside-click').map(e => e.detail)
      )
    ).toEqual([true]);
  });

  test('diagnostic (consumer CSS override, not production): the ring box stacks above the lists', async ({
    page,
  }) => {
    await openHarness(page);
    await page.mouse.move(AWAY.x, AWAY.y);
    await focusRegionThenShow(page, 'close:z');
    const a = await centreOf(page, '.ret-toast.h-a');
    const b = await centreOf(page, '.ret-toast.h-b');
    // Diagnostic only: makes the ring hit-testable, so hit-testing, which follows the painting
    // order, shows what lies on top. Production never takes pointer input there (the test above).
    await page.evaluate(() =>
      window.__retHarness!.setStyle('.ret-toaster:focus-visible::after { pointer-events: auto; }')
    );
    expect((await regionRing(page)).after['pointer-events']).toBe('auto');
    expect(await hitAt(page, a), 'the ring is above toast a').toBe('region');
    expect(await hitAt(page, b), 'the ring is above toast b').toBe('region');
    expect(await hitAt(page, AWAY)).toBe('region');
    // Without the override, the production stylesheet alone: the toasts are hit again.
    await page.evaluate(() => window.__retHarness!.setStyle(''));
    expect((await regionRing(page)).after['pointer-events']).toBe('none');
    expect(await hitAt(page, a)).toBe('toast:a');
    expect(await hitAt(page, b)).toBe('toast:b');
  });
});
