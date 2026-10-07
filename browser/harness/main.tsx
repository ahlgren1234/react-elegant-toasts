import { version } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Toaster, toast } from '../../src';
import type { HarnessEvent, RetHarness } from './api';

// P-22 browser harness: the real library and the production stylesheet, with no demo UI. Specs drive
// it only through `window.__retHarness` and the DOM. Each test opens a fresh page, so no scenario
// state carries over.

async function stylesheetLoaded(): Promise<void> {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel="stylesheet"][href="/styles.css"]'
  );
  if (!link) throw new Error('The production stylesheet is not linked.');
  if (link.sheet) return;
  await new Promise<void>((resolve, reject) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => reject(new Error('The production stylesheet failed.')), {
      once: true,
    });
  });
}

const container = document.getElementById('root');
if (!container) throw new Error('The harness has no #root.');
const root = createRoot(container);
const events: HarnessEvent[] = [];

const harness: RetHarness = {
  reactVersion: version,
  toast,
  mount(props = {}) {
    flushSync(() => root.render(<Toaster {...props} />));
  },
  unmount() {
    flushSync(() => root.render(null));
  },
  events,
  log(type, detail) {
    events.push({ type, time: performance.now(), detail });
  },
};

void stylesheetLoaded().then(() => {
  harness.mount();
  window.__retHarness = harness;
});
