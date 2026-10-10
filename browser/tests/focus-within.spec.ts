import { expect, test, type Page } from '@playwright/test';
import type { FocusEventDetail, FocusFixtureMode, ToastEventDetail } from '../harness/api';
import { FRAME_MS, LATE_TOLERANCE_MS, openHarness } from './harness';

// P-22 S4.2, CF-2 Class 1 (V2_PLAN.md, P-22 D2): when the focused node inside a toast is removed
// or re-keyed by the content's own React state, the focus-within reason follows the DOM (P-15
// reconciliation), the toast does not stay paused, another reason is not cleared with it, and the
// timer runs out with the time it had left. Chromium, Firefox and WebKit, trusted keyboard and
// mouse input. A focused control that becomes disabled, hidden or `inert` is CF-2's Class 2 layer
// (S4.3), not this one.

const DURATION_MS = 1500;
/** How long the toast runs before it is paused, so the remaining time differs from the duration. */
const RUN_BEFORE_MS = 400;
/**
 * The page reads the visible, held and released times from its recorders, each a little after the
 * store acted on it; a timeout up to two frames before the computed one is that latency, not an
 * early timeout.
 */
const EARLY_SLACK_MS = 2 * FRAME_MS;
/** A point away from every stack, so no hover reason is set there. */
const AWAY = { x: 640, y: 360 } as const;

/**
 * Shows a custom toast, `a`, with the fixture content, and records every change of its
 * `data-paused` as it happens (`held`, true or false), with the harness log's time.
 */
async function showFixture(page: Page, mode: FocusFixtureMode): Promise<void> {
  await page.mouse.move(AWAY.x, AWAY.y);
  await page.evaluate(
    ([mode, duration]) => {
      const h = window.__retHarness!;
      new MutationObserver(records => {
        for (const record of records) {
          h.log('held', (record.target as Element).hasAttribute('data-paused'));
        }
      }).observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-paused'],
      });
      h.toast.custom(h.focusFixture(mode), {
        id: 'a',
        className: 'h-a',
        duration,
        onDismiss: (_toast, reason) => h.log('dismiss', reason),
      });
    },
    [mode, DURATION_MS] as const
  );
  await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
  // Let the timer run for a while first.
  await page.waitForFunction(wait => {
    const visible = window.__retHarness!.events.find(
      event => event.type === 'phase' && (event.detail as ToastEventDetail).phase === 'visible'
    );
    return visible !== undefined && performance.now() >= visible.time + wait;
  }, RUN_BEFORE_MS);
}

/** Tabs into the fixture's button and checks that it holds focus and pauses the toast. */
async function focusTarget(page: Page): Promise<void> {
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() =>
      document.activeElement?.matches('.ret-toast.h-a .h-target[data-round="0"]')
    ),
    'precondition: Tab focuses the fixture button'
  ).toBe(true);
  await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-paused', '');
}

/** Whether focus is anywhere inside the toast, by the DOM. */
const focusInside = (page: Page) =>
  page.evaluate(() =>
    Boolean(window.__retHarness!.toastRoot('a')?.contains(document.activeElement))
  );

/** Activates the focused button with Enter and checks that the focused node genuinely left. */
async function activate(page: Page, mode: FocusFixtureMode): Promise<void> {
  const button = await page.evaluateHandle(() => document.activeElement!);
  await page.keyboard.press('Enter');
  if (mode === 'remove') {
    await expect(page.locator('.ret-toast.h-a .h-target')).toHaveCount(0);
  } else {
    // Re-keyed: a new button, a new element, which nothing has focused.
    await expect(page.locator('.ret-toast.h-a .h-target[data-round="1"]')).toHaveCount(1);
    expect(
      await page.evaluate(() =>
        document.activeElement?.matches('.ret-toast.h-a .h-target[data-round="1"]')
      )
    ).toBe(false);
  }
  expect(
    await button.evaluate(element => element.isConnected),
    'precondition: the focused node left the DOM'
  ).toBe(false);
  expect(await focusInside(page), 'precondition: no focus is left inside the toast').toBe(false);
}

/** Holds for a full duration, a fixed span on purpose, and checks that the toast did not expire. */
async function expectHeldThroughDuration(page: Page): Promise<void> {
  // Bounded timing is the property here: a paused toast outlives its own duration.
  await page.waitForTimeout(DURATION_MS);
  await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-phase', 'visible');
  await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-paused', '');
}

/**
 * The timeout comes when the time left at the pause has run after the release, not a full
 * duration again and never early: from the recorder's visible, held, released and exiting times.
 */
async function expectTimeoutOnRemainingTime(page: Page): Promise<void> {
  await expect(page.locator('.ret-toast.h-a')).toHaveCount(0, { timeout: 5_000 });
  const times = await page.evaluate(() => {
    const events = window.__retHarness!.events;
    const phase = (name: string) =>
      events.find(
        event => event.type === 'phase' && (event.detail as ToastEventDetail).phase === name
      )!.time;
    const held = events.filter(event => event.type === 'held');
    return {
      visible: phase('visible'),
      exiting: phase('exiting'),
      held: held.map(event => ({ on: event.detail as boolean, time: event.time })),
      dismissals: events.filter(event => event.type === 'dismiss').map(event => event.detail),
    };
  });
  // Held once and released once: no flicker, nothing resumed early.
  expect(times.held.map(entry => entry.on)).toEqual([true, false]);
  const [pausedAt, releasedAt] = times.held.map(entry => entry.time) as [number, number];
  const remaining = DURATION_MS - (pausedAt - times.visible);
  expect(remaining).toBeLessThan(DURATION_MS - RUN_BEFORE_MS / 2);
  const elapsed = times.exiting - releasedAt;
  expect(elapsed, 'not before the remaining time').toBeGreaterThanOrEqual(
    remaining - EARLY_SLACK_MS
  );
  expect(elapsed, 'when the remaining time has run').toBeLessThanOrEqual(
    remaining + LATE_TOLERANCE_MS
  );
  expect(times.dismissals).toEqual(['timeout']);
}

test.describe('CF-2: the focus-within reason follows the DOM', () => {
  for (const mode of ['remove', 'rekey'] as const) {
    const what = mode === 'remove' ? 'removed' : 're-keyed';
    test(`a focused button ${what} by the content’s own state releases the toast`, async ({
      page,
    }) => {
      await openHarness(page);
      await showFixture(page, mode);
      await focusTarget(page);
      await expectHeldThroughDuration(page);
      await activate(page, mode);
      await expect(page.locator('.ret-toast.h-a')).not.toHaveAttribute('data-paused', /.*/);
      // The focus that left was never reported by a focusout the library could rely on: the
      // reconciliation released it. Whatever an engine dispatched, focus is no longer inside.
      expect(await focusInside(page)).toBe(false);
      await expectTimeoutOnRemainingTime(page);
    });
  }

  test('removing the focused button keeps the hover reason, and the timer waits for it', async ({
    page,
  }) => {
    await openHarness(page);
    await showFixture(page, 'remove');
    const box = (await page.locator('.ret-toast.h-a').boundingBox())!;
    await page.mouse.move(box.x + 8, box.y + 8);
    await expect(page.locator('.ret-toast.h-a')).toHaveAttribute('data-paused', '');
    await focusTarget(page);
    await activate(page, 'remove');
    // Focus-within has gone with the node; hover still holds the stack, past a full duration.
    await expectHeldThroughDuration(page);
    const focusEvents = await page.evaluate(() =>
      window
        .__retHarness!.events.filter(event => event.type === 'focusin')
        .map(event => (event.detail as FocusEventDetail).target)
    );
    expect(focusEvents).toEqual(['content:a']);
    await page.mouse.move(AWAY.x, AWAY.y);
    await expect(page.locator('.ret-toast.h-a')).not.toHaveAttribute('data-paused', /.*/);
    await expectTimeoutOnRemainingTime(page);
  });
});
