import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { openHarness, showToast, timeDismissal, timeToken } from './harness';

// P-22 S2 Class 2 evidence (V2_PLAN.md, P-22 D2): observations recorded, never asserted as the
// product contract. Run by `npm run test:browser:evidence`, never by the blocking `test:browser`.
// Each test asserts only that its scenario ran, and attaches and prints what it saw.

const FALLBACK_MARGIN_MS = 100;

function record(info: TestInfo, name: string, data: unknown): Promise<void> {
  console.log(`[evidence] ${info.project.name} ${name} ${JSON.stringify(data)}`);
  return info.attach(`${name}.json`, {
    body: JSON.stringify(data, null, 2),
    contentType: 'application/json',
  });
}

test.describe('lifecycle and motion evidence', { tag: '@evidence' }, () => {
  test('CF-17: fallback timings, including the region hidden before creation', async ({
    page,
  }, info) => {
    const scenarios = [
      {
        name: 'held, default exit',
        css: '.ret-toast { animation-play-state: paused; }',
        before: true,
      },
      {
        name: 'held, exit token 600ms',
        css: '.ret-toast { animation-play-state: paused; } .ret-toaster { --ret-exit-duration: 600ms; }',
        before: true,
      },
      {
        name: 'hidden after shown, default exit',
        css: '.ret-toaster { display: none; }',
        before: false,
      },
      {
        name: 'hidden before creation, default exit',
        css: '.ret-toaster { display: none; }',
        before: true,
      },
      {
        name: 'hidden before creation, exit token 600ms',
        css: '.ret-toaster { display: none; --ret-exit-duration: 600ms; }',
        before: true,
      },
    ] as const;
    const rows = [];
    for (const { name, css, before } of scenarios) {
      await openHarness(page);
      const apply = (page: Page) => page.evaluate(css => window.__retHarness!.setStyle(css), css);
      if (before) await apply(page);
      await showToast(page);
      if (!before) await apply(page);
      const expected = (await timeToken(page, '--ret-exit-duration')) + FALLBACK_MARGIN_MS;
      const elapsed = Math.round(await timeDismissal(page));
      rows.push({ name, expected, elapsed });
    }

    // Hidden before creation and dismissed while still entering, a frame after it rendered.
    for (const exitToken of [undefined, '600ms'] as const) {
      await openHarness(page);
      const elapsed = await page.evaluate(
        exitToken =>
          new Promise<number>(resolve => {
            const h = window.__retHarness!;
            h.setStyle(
              `.ret-toaster { display: none; ${exitToken ? `--ret-exit-duration: ${exitToken};` : ''} }`
            );
            h.toast('Toast', {
              id: 'a',
              className: 'h-a',
              duration: Infinity,
              onDismiss: () => resolve(performance.now() - start),
            });
            let start = 0;
            requestAnimationFrame(() => {
              start = performance.now();
              h.toast.dismiss('a');
            });
          }),
        exitToken
      );
      rows.push({
        name: `hidden before creation, dismissed while entering, exit ${exitToken ?? 'default'}`,
        expected: (exitToken ? 600 : 120) + FALLBACK_MARGIN_MS,
        elapsed: Math.round(elapsed),
      });
    }

    await record(info, 'cf-17-fallback-timing', rows);
    expect(rows).toHaveLength(scenarios.length + 2);
  });

  test('CF-23: the scale × transform composition while a toast enters or exits and moves', async ({
    page,
  }, info) => {
    await openHarness(page);
    await showToast(page);

    // How far the rendered top departs from layout + translate + transform + the scale's own
    // centring: the composition's offset (P-19 accepted up to about 1.79 px, in Chromium).
    const overlap = (label: 'b' | 'c', exitFirst: boolean) =>
      page.evaluate(
        ({ label, exitFirst }) => {
          const h = window.__retHarness!;
          const add = (id: string) =>
            h.toast('Plain', { id, className: `h-${id}`, duration: Infinity });
          const read = () => {
            const item = h.toastRoot(label);
            const list = item?.offsetParent;
            if (!item || !list) return null;
            const state = h.toastState(label);
            const naive =
              list.getBoundingClientRect().top +
              state.offsetTop +
              state.translateY +
              state.transformY +
              (state.offsetHeight * (1 - state.scaleY)) / 2;
            return {
              moving: state.transformY !== 0,
              scaled: state.scaleY !== 1,
              offset: state.top - naive,
            };
          };
          const samples = h.sampleFrames(read, {
            maxFrames: 60,
            onFrame: frame => {
              if (frame === 2) add('c');
            },
          });
          if (exitFirst) h.toast.dismiss('b');
          else add('b');
          return samples;
        },
        { label, exitFirst }
      );

    const summarise = (samples: Awaited<ReturnType<typeof overlap>>) => {
      const both = samples
        .map(sample => sample.value)
        .filter(value => value !== null && value.moving && value.scaled);
      return {
        overlappingFrames: both.length,
        maxOffsetPx: Math.max(0, ...both.map(value => Math.abs(value!.offset))),
      };
    };
    const entering = summarise(await overlap('b', false));
    await openHarness(page);
    await showToast(page);
    await page.evaluate(() =>
      window.__retHarness!.toast('Plain', { id: 'b', className: 'h-b', duration: Infinity })
    );
    await page.locator('.ret-toast.h-b[data-phase="visible"]').waitFor({ state: 'attached' });
    const exiting = summarise(await overlap('b', true));

    await record(info, 'cf-23-composition-offset', { entering, exiting });
    expect(entering.overlappingFrames + exiting.overlappingFrames).toBeGreaterThan(0);
  });
});
