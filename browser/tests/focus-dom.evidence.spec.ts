import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { FocusFixtureMode } from '../harness/api';
import { openHarness } from './harness';

// P-22 S4.3 evidence (V2_PLAN.md, P-22 D2 and the S4.3 record): focus behaviour in each engine,
// recorded, never asserted as the product contract. Run by `npm run test:browser:evidence`, never
// by the blocking `test:browser`. Each test asserts only that its scenario genuinely ran.
// - CF-2 Class 2: a focused control becomes disabled, hidden or inert (a D0-16 trigger if focus
//   genuinely leaves while the toast stays paused).
// - CF-3: where focus goes when a focused node is removed outside restoration.
// - CF-6 Class 2: `inert` applied to focused content without restoration.
// - CF-9: revival of an exiting toast, and whether `inert` refuses focus meanwhile.
// - CF-10: the order of restoration, focus events, `inert` and the focus-within handover.
// - CF-12 Class 2: whether each engine matches `:focus-visible` after script focus.
// - CF-7 and CF-8 (Class 4): a pointer close, and focus after it. Playwright WebKit is not Safari.

function record(info: TestInfo, name: string, data: unknown): Promise<void> {
  console.log(`[evidence] ${info.project.name} ${name} ${JSON.stringify(data)}`);
  return info.attach(`${name}.json`, {
    body: JSON.stringify(data, null, 2),
    contentType: 'application/json',
  });
}

/** A point away from every stack. */
const AWAY = { x: 640, y: 360 } as const;

/**
 * Records, as it happens, every toast's `data-paused` change (`held`, with the toast's label) and
 * every activation of the fixture button (`activate`), in the harness log.
 */
async function recordHeldAndActivation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = window.__retHarness!;
    const labelOf = (element: Element) =>
      [...element.classList].find(name => name.startsWith('h-'))?.slice(2);
    new MutationObserver(records => {
      for (const entry of records) {
        const item = entry.target as Element;
        h.log('held', { toast: labelOf(item), on: item.hasAttribute('data-paused') });
      }
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-paused'],
    });
    document.addEventListener(
      'click',
      event => {
        if ((event.target as Element).closest?.('.h-target')) h.log('activate', null);
      },
      { capture: true }
    );
  });
}

/** The focus, `inert`, held, phase, activation and dismissal entries, with times, from `since`. */
const timeline = (page: Page, since = 0) =>
  page.evaluate(
    since =>
      window
        .__retHarness!.events.filter(event =>
          ['focusin', 'focusout', 'inert', 'held', 'phase', 'activate', 'dismiss'].includes(
            event.type
          )
        )
        .filter(event => event.time >= since)
        .map(event => ({
          type: event.type,
          time: Math.round(event.time),
          ...(event.detail === null || typeof event.detail !== 'object'
            ? { value: event.detail }
            : event.detail),
        })),
    since
  );

/** Focus on the fixture's button, read synchronously. */
const fixtureFocus = (page: Page) =>
  page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('.ret-toast.h-a .h-target');
    const item = window.__retHarness!.toastRoot('a');
    return {
      active: window.__retHarness!.focusState().active,
      buttonConnected: button?.isConnected ?? false,
      buttonIsActive: button !== null && document.activeElement === button,
      buttonMatchesFocus: button?.matches(':focus') ?? false,
      insideToast: Boolean(item?.contains(document.activeElement)),
      paused: item?.hasAttribute('data-paused') ?? null,
    };
  });

const frames = (page: Page, count: number) =>
  page.evaluate(
    count =>
      new Promise<void>(resolve => {
        let left = count;
        const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    count
  );

/** A finite custom toast `a` with the fixture, focused by trusted Tab and activated by Enter. */
async function activateFixture(page: Page, mode: FocusFixtureMode) {
  await openHarness(page);
  await page.mouse.move(AWAY.x, AWAY.y);
  await recordHeldAndActivation(page);
  await page.evaluate(mode => {
    const h = window.__retHarness!;
    h.toast.custom(h.focusFixture(mode), {
      id: 'a',
      className: 'h-a',
      duration: 2000,
      onDismiss: (_toast, reason) => h.log('dismiss', reason),
    });
  }, mode);
  await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
  await page.keyboard.press('Tab');
  const before = await fixtureFocus(page);
  const since = await page.evaluate(() => performance.now());
  await page.keyboard.press('Enter');
  const afterPress = await fixtureFocus(page);
  await frames(page, 3);
  const afterFrames = await fixtureFocus(page);
  await expect(page.locator('.ret-toast.h-a')).toHaveCount(0, { timeout: 6_000 });
  return { before, afterPress, afterFrames, timeline: await timeline(page, since) };
}

test.describe('focus behaviour evidence', { tag: '@evidence' }, () => {
  test('CF-2 Class 2 and CF-6 Class 2: a focused control disabled, hidden or made inert', async ({
    page,
  }, info) => {
    const results: Record<string, unknown> = {};
    for (const mode of ['disable', 'hide', 'inert'] as const) {
      const result = await activateFixture(page, mode);
      // Precondition of the scenario: the button held focus and paused the toast.
      expect(result.before).toMatchObject({ buttonIsActive: true, paused: true });
      results[mode] = result;
    }
    await record(info, 'cf-2-attribute-changes', results);
  });

  test('CF-3: where focus goes when a focused node is removed outside restoration', async ({
    page,
  }, info) => {
    const results: Record<string, unknown> = {};
    for (const mode of ['remove', 'rekey'] as const) {
      const result = await activateFixture(page, mode);
      expect(result.before).toMatchObject({ buttonIsActive: true, paused: true });
      results[mode] = result;
    }
    // The Toaster unmounted while a toast's close holds focus: an unmount restores nothing (§18).
    await openHarness(page);
    await page.evaluate(() =>
      window.__retHarness!.toast('Toast a', { id: 'a', className: 'h-a', duration: Infinity })
    );
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
    await page.keyboard.press('Tab');
    const before = await page.evaluate(() => window.__retHarness!.focusState().active);
    expect(before).toBe('close:a');
    const since = await page.evaluate(() => performance.now());
    await page.evaluate(() => window.__retHarness!.unmount());
    await frames(page, 3);
    results['toaster-unmount'] = {
      before,
      after: await page.evaluate(() => window.__retHarness!.focusState().active),
      timeline: await timeline(page, since),
    };
    await record(info, 'cf-3-removal', results);
  });

  test('CF-6 Class 2: the page makes the Toaster’s container inert while a toast holds focus', async ({
    page,
  }, info) => {
    await openHarness(page);
    await recordHeldAndActivation(page);
    await page.evaluate(() =>
      window.__retHarness!.toast('Toast a', { id: 'a', className: 'h-a', duration: 60_000 })
    );
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => window.__retHarness!.focusState().active)).toBe('close:a');
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-paused', '');
    const since = await page.evaluate(() => performance.now());
    // A modal pattern: the application makes everything behind a dialog inert.
    await page.evaluate(() => document.getElementById('root')!.toggleAttribute('inert', true));
    const afterSet = await page.evaluate(() => ({
      focus: window.__retHarness!.focusState().active,
      paused: window.__retHarness!.toastRoot('a')!.hasAttribute('data-paused'),
    }));
    await frames(page, 3);
    const afterFrames = await page.evaluate(() => ({
      focus: window.__retHarness!.focusState().active,
      paused: window.__retHarness!.toastRoot('a')!.hasAttribute('data-paused'),
    }));
    await record(info, 'cf-6-container-inert', {
      afterSet,
      afterFrames,
      timeline: await timeline(page, since),
    });
  });

  test('CF-9: reviving an exiting toast, and whether inert refuses focus meanwhile', async ({
    page,
  }, info) => {
    await openHarness(page);
    await page.evaluate(() =>
      window.__retHarness!.setStyle('.ret-toaster { --ret-exit-duration: 2000ms; }')
    );
    await page.evaluate(() =>
      window.__retHarness!.toast('Toast a', { id: 'a', className: 'h-a', duration: Infinity })
    );
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
    await page.evaluate(() => window.__retHarness!.toast.dismiss('a'));
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('inert', '');
    const attempts = await page.evaluate(async () => {
      const h = window.__retHarness!;
      const out: unknown[] = [];
      const attempt = (when: string) => {
        const item = h.toastRoot('a')!;
        const inert = item.hasAttribute('inert');
        const phase = item.getAttribute('data-phase');
        item.focus();
        out.push({ when, inert, phase, focused: document.activeElement === item });
        (document.activeElement as HTMLElement | null)?.blur();
      };
      attempt('exiting, before revival');
      h.toast('Toast a again', { id: 'a', className: 'h-a', duration: Infinity });
      attempt('same task as the revival call');
      await Promise.resolve();
      attempt('after a microtask');
      await new Promise(resolve => setTimeout(resolve, 0));
      attempt('next task');
      await new Promise(resolve => requestAnimationFrame(resolve));
      attempt('next frame');
      return out;
    });
    // Alt+T, a trusted keyboard path, right after a further revival.
    await page.evaluate(() => window.__retHarness!.toast.dismiss('a'));
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('inert', '');
    await page.evaluate(() =>
      window.__retHarness!.toast('Toast a third', {
        id: 'a',
        className: 'h-a',
        duration: Infinity,
      })
    );
    await page.keyboard.press('Alt+t');
    const hotkey = await page.evaluate(() => ({
      focus: window.__retHarness!.focusState().active,
      inert: window.__retHarness!.toastRoot('a')!.hasAttribute('inert'),
      phase: window.__retHarness!.toastRoot('a')!.getAttribute('data-phase'),
    }));
    expect(attempts.length).toBe(5);
    await record(info, 'cf-9-revival', { attempts, hotkey });
  });

  test('CF-10: the order of restoration, focus events, inert and the pause handover', async ({
    page,
  }, info) => {
    const results: Record<string, unknown> = {};
    for (const path of ['keyboard', 'mouse', 'programmatic'] as const) {
      await openHarness(page);
      await page.mouse.move(AWAY.x, AWAY.y);
      await recordHeldAndActivation(page);
      await page.evaluate(() => {
        const h = window.__retHarness!;
        for (const id of ['b', 'a']) {
          h.toast(`Toast ${id}`, {
            id,
            className: `h-${id}`,
            duration: 60_000,
            onDismiss: (_toast, reason) => h.log('dismiss', { id, reason }),
          });
        }
      });
      await expect(page.locator('.ret-toast[data-phase="visible"]')).toHaveCount(2);
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => window.__retHarness!.focusState().active)).toBe('close:a');
      const since = await page.evaluate(() => performance.now());
      if (path === 'keyboard') await page.keyboard.press('Enter');
      else if (path === 'mouse') {
        await page.locator('.ret-toast.h-a .ret-toast__close').click();
        await page.mouse.move(AWAY.x, AWAY.y);
      } else await page.evaluate(() => window.__retHarness!.toast.dismiss('a'));
      await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
      results[path] = await timeline(page, since);
    }
    await record(info, 'cf-10-ordering', results);
  });

  test('CF-12 Class 2: :focus-visible after script focus, per engine', async ({ page }, info) => {
    const results: Record<string, unknown> = {};
    const fresh = async (ids: readonly string[]) => {
      await openHarness(page);
      await page.evaluate(ids => {
        const h = window.__retHarness!;
        for (const id of ids) {
          h.toast(`Toast ${id}`, {
            id,
            className: `h-${id}`,
            duration: Infinity,
            action: { label: `Undo ${id}`, onClick: () => undefined },
          });
        }
      }, ids);
      await expect(page.locator('.ret-toast[data-phase="visible"]')).toHaveCount(ids.length);
    };
    const state = () => page.evaluate(() => window.__retHarness!.focusState());

    await fresh(['a']);
    await page.evaluate(() => window.__retHarness!.toastRoot('a')!.focus());
    results['programmatic root, no keyboard before'] = await state();
    await fresh(['a']);
    await page.evaluate(() =>
      document.querySelector<HTMLElement>('.ret-toast.h-a .ret-toast__close')!.focus()
    );
    results['programmatic close, no keyboard before'] = await state();
    await fresh(['a']);
    await page.keyboard.press('Alt+t');
    results['Alt+T, no keyboard before'] = await state();
    await fresh(['a']);
    await page.keyboard.press('Tab');
    results['Tab to the action'] = await state();
    await page.keyboard.press('Alt+t');
    results['Alt+T after Tab'] = await state();
    await fresh(['a']);
    await page.locator('.ret-toast.h-a .ret-toast__title').click();
    results['body click (CF-39)'] = await state();
    await page.keyboard.press('Alt+t');
    results['Alt+T after a body click'] = await state();
    await fresh(['b', 'a']);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    results['restoration to the next close after a keyboard close'] = await state();
    await fresh(['a']);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    results['restoration to the region after a keyboard close'] = await state();
    await fresh(['a']);
    await page.evaluate(() => window.__retHarness!.toastRoot('a')!.focus());
    await page.evaluate(() => window.__retHarness!.toast.dismiss('a'));
    await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
    results['restoration to the region after programmatic focus and dismissal'] = await state();
    expect(Object.keys(results)).toHaveLength(10);
    await record(info, 'cf-12-focus-visible', results);
  });

  test('CF-7 and CF-8 (Class 4): a pointer close against a keyboard close', async ({
    page,
  }, info) => {
    const results: Record<string, unknown> = {};
    for (const path of ['mouse', 'keyboard'] as const) {
      await openHarness(page);
      await page.mouse.move(AWAY.x, AWAY.y);
      await recordHeldAndActivation(page);
      await page.evaluate(() => {
        const h = window.__retHarness!;
        for (const type of ['pointerdown', 'mousedown', 'click']) {
          document.addEventListener(
            type,
            event => {
              const target = event.target as Element;
              if (target.closest('.ret-toast__close')) h.log(`close-${type}`, null);
            },
            { capture: true }
          );
        }
        for (const id of ['b', 'a']) {
          h.toast(`Toast ${id}`, {
            id,
            className: `h-${id}`,
            duration: 60_000,
            progress: true,
            onDismiss: (_toast, reason) => h.log('dismiss', { id, reason }),
          });
        }
      });
      await expect(page.locator('.ret-toast[data-phase="visible"]')).toHaveCount(2);
      const since = await page.evaluate(() => performance.now());
      if (path === 'mouse') {
        await page.locator('.ret-toast.h-a .ret-toast__close').click();
      } else {
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
      }
      await expect(page.locator('.ret-toast.h-a')).toHaveCount(0);
      // The pointer leaves the stack: does focus-within alone keep the remaining toast paused?
      await page.mouse.move(AWAY.x, AWAY.y);
      const after = await page.evaluate(() => ({
        focus: window.__retHarness!.focusState(),
        bPaused: window.__retHarness!.toastRoot('b')!.hasAttribute('data-paused'),
        bProgress: window.__retHarness!.progressState('b').scale,
      }));
      await frames(page, 30);
      const later = await page.evaluate(() => ({
        bPaused: window.__retHarness!.toastRoot('b')!.hasAttribute('data-paused'),
        bProgress: window.__retHarness!.progressState('b').scale,
      }));
      const order = await page.evaluate(
        since =>
          window
            .__retHarness!.events.filter(
              event =>
                event.time >= since && (event.type.startsWith('close-') || event.type === 'focusin')
            )
            .map(event =>
              event.type === 'focusin'
                ? `focusin ${(event.detail as { target: string }).target}`
                : event.type
            ),
        since
      );
      results[path] = { order, after, later };
    }
    await record(info, 'cf-7-cf-8-pointer-close', results);
  });
});
