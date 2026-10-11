// Native Node ESM server-rendering smoke test of the packed package (§23, §27 step 7, P-23 D0-6).
// `validate:package` runs it with plain `node` in each installed consumer, once in development and
// once with NODE_ENV=production: no bundler, no JSX, and no DOM. react, react-dom/server and
// react-elegant-toasts resolve from this consumer's node_modules, where the tarball is installed,
// so the export map and the built file's `react/jsx-runtime` import resolve under native ESM.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = 'react-elegant-toasts';
const production = process.env.NODE_ENV === 'production';

// The server markup of <Toaster /> (§23, the same contract as src/__tests__/ssr.test.tsx): only the
// named region, which takes focus from script only, and its two empty live regions (§17.1).
const HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap';
const LIVE_REGIONS =
  `<div role="status" aria-live="polite" aria-atomic="false" class="ret-toaster__live-region" style="${HIDDEN}"></div>` +
  `<div aria-live="assertive" aria-atomic="false" class="ret-toaster__live-region" style="${HIDDEN}"></div>`;
const EXPECTED = `<section class="ret-toaster" aria-label="Notifications" aria-keyshortcuts="Alt+T" data-theme="system" tabindex="-1">${LIVE_REGIONS}</section>`;

// No browser here. `window` is only checked, never defined: defining it would turn the library's
// server check off (§8.3).
assert.equal(typeof window, 'undefined', 'window exists in the SSR process');
assert.equal(typeof document, 'undefined', 'document exists in the SSR process');
console.log('  ✓ no window and no document');

// Any read of these, by the package or by React, is recorded and fails the check, typeof included.
const TRAPPED = [
  'document',
  'navigator',
  'location',
  'HTMLElement',
  'Element',
  'MutationObserver',
  'ResizeObserver',
  'IntersectionObserver',
  'matchMedia',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'addEventListener',
  'removeEventListener',
  'localStorage',
  'sessionStorage',
];
const accesses = [];
for (const name of TRAPPED) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      const frame = new Error().stack?.split('\n')[2]?.trim() ?? 'unknown';
      accesses.push(`${name} (${frame})`);
      return undefined;
    },
  });
}

// Every warning and error from importing, rendering and calling toast() on the server.
const logged = { warn: [], error: [] };
for (const level of ['warn', 'error']) {
  console[level] = (...args) => logged[level].push(args.map(String).join(' '));
}

const entryUrl = import.meta.resolve(PACKAGE_NAME);
const entry = fileURLToPath(entryUrl);
assert.ok(
  entry.startsWith(path.join(process.cwd(), 'node_modules', PACKAGE_NAME) + path.sep),
  `${PACKAGE_NAME} resolved outside the installed package: ${entry}`
);
const { createElement, version } = await import('react');
const { renderToString } = await import('react-dom/server');
const exported = await import(PACKAGE_NAME);
const { Toaster, toast } = exported;
assert.deepEqual(Object.keys(exported).sort(), ['Toaster', 'toast'], 'unexpected exports');
console.log(
  `  ✓ ${PACKAGE_NAME} imports from ${path.relative(process.cwd(), entry)} under React ${version}`
);

const first = renderToString(createElement(Toaster));
assert.equal(first, EXPECTED, 'the server markup of <Toaster /> differs from §23');
assert.equal(
  renderToString(createElement(Toaster)),
  first,
  'a second request rendered differently'
);
console.log('  ✓ renderToString(<Toaster />) is the empty region and its live regions, twice');
assert.deepEqual(logged, { warn: [], error: [] }, 'importing or rendering logged something');

// On the server, creation is rejected and stores nothing (§8.3, AC-API-9).
assert.equal(toast('On the server'), undefined, 'toast() returned an ID on the server');
assert.equal(
  toast.success('Saved', { id: 'explicit' }),
  undefined,
  'toast.success() with an id returned an ID on the server'
);
assert.equal(renderToString(createElement(Toaster)), EXPECTED, 'a server toast was rendered');
console.log('  ✓ toast() and toast.success(…, { id }) return undefined and store nothing');

assert.deepEqual(logged.error, [], 'an error was logged');
if (production) {
  assert.deepEqual(logged.warn, [], 'a warning was logged in production');
  console.log('  ✓ no warning in production');
} else {
  assert.equal(logged.warn.length, 1, `expected one warning, got: ${logged.warn.join(' | ')}`);
  assert.match(logged.warn[0], /called on the server/, 'unexpected warning');
  console.log('  ✓ exactly one development warning, that toast() was called on the server');
}

assert.deepEqual(accesses, [], `browser globals were read:\n  ${accesses.join('\n  ')}`);
console.log(`  ✓ none of ${TRAPPED.length} browser globals was read`);
