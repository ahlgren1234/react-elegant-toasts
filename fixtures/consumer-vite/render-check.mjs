// Runtime check of the packed package (§27 step 6, P-14): runs the fixture app (src/app.ts) in
// jsdom and checks that a toast renders, becomes visible, and closes from its close button.
// `npm run test:render` builds this file with Vite in SSR mode, which transpiles the app and
// leaves every package import to Node: react, react-dom and react-elegant-toasts resolve from
// this consumer's node_modules, where the tarball is installed.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const PACKAGE_NAME = 'react-elegant-toasts';
const TIMEOUT_MS = 5000;

/** Polls until `find` returns a truthy value. */
async function waitFor(description, find) {
  const deadline = Date.now() + TIMEOUT_MS;
  for (;;) {
    const found = find();
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

const entry = fileURLToPath(import.meta.resolve(PACKAGE_NAME));
assert.ok(
  entry.startsWith(path.join(process.cwd(), 'node_modules', PACKAGE_NAME) + path.sep),
  `${PACKAGE_NAME} resolved outside the installed package: ${entry}`
);
console.log(`  ✓ ${PACKAGE_NAME} resolves to ${path.relative(process.cwd(), entry)}`);

// The DOM globals a browser would provide, set before React DOM and the app are loaded.
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
});
for (const name of ['window', 'document']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
}

const { APP_TOAST, mountApp, showToast } = await import('./src/app.ts');
const { document } = dom.window;

const root = mountApp(document.getElementById('root'));
await waitFor('the region', () => document.querySelector('section[aria-label="Notifications"]'));
console.log('  ✓ <Toaster /> mounted its region');

const id = showToast();
assert.equal(typeof id, 'string', 'toast.success did not return an ID');
const item = await waitFor('the toast', () =>
  [...document.querySelectorAll('li.ret-toast')].find(li => li.textContent.includes(APP_TOAST))
);
assert.ok(item.closest('ol[data-position="bottom-center"]'), 'the toast is not at bottom-center');
await waitFor('the toast to become visible', () => item.getAttribute('data-phase') === 'visible');
console.log(`  ✓ toast.success rendered "${APP_TOAST}" and it became visible`);

const close = item.querySelector('button[aria-label="Close notification"]');
assert.ok(close, 'the toast has no close button');
close.click();
await waitFor('the toast to be removed', () => !document.contains(item));
console.log('  ✓ the close button removed the toast');

root.unmount();
dom.window.close();
