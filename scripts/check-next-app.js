// Checks the packed package in a real Next.js App Router app (§23, §27 step 8, P-23 D0-7).
// Usage: `node scripts/check-next-app.js <consumer> <css-marker>`, run by `validate:package` on an
// installed copy of fixtures/consumer-next. It builds the app (Next.js type-checks it with the
// project's TypeScript CLI), checks the CSS, starts it, reads the server HTML, and drives it in
// Chromium with the root @playwright/test: the toast shows only once the app has hydrated.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [consumer, cssMarker] = process.argv.slice(2);
if (!consumer || !cssMarker) throw new Error('usage: check-next-app.js <consumer> <css-marker>');
const PORT = Number(process.env.CONSUMER_NEXT_PORT ?? 4310);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const TOAST = 'Saved by the Next.js fixture';
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
const next = path.join(consumer, 'node_modules', 'next', 'dist', 'bin', 'next');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function ok(message) {
  console.log(`  ✓ ${message}`);
}

// The one accepted notice: under CI (the `CI` variable), next build advises that `.next/cache` is
// empty, which it always is in a freshly installed consumer. Only this exact line, its text and
// its documentation link together, is accepted; any other warning or error, cache-related or not,
// still fails the check.
const NO_CACHE_NOTICE =
  /^\s*⚠ No build cache found\. Please configure build caching for faster rebuilds\. Read more: https:\/\/nextjs\.org\/docs\/messages\/no-cache\s*$/;

/** Lines a Next.js command printed that look like a warning or an error. */
const problems = output =>
  output
    .split('\n')
    .filter(line => /⚠|\bwarn(ing)?\b|\berror\b|\bfailed\b/i.test(line))
    .filter(line => !NO_CACHE_NOTICE.test(line));

// Next.js rewrites these, or installs packages, when it finds the project incomplete; a build
// must leave the committed setup exactly as it is.
const KEPT = ['package.json', 'package-lock.json', 'tsconfig.json'];
const before = KEPT.map(name => fs.readFileSync(path.join(consumer, name)));

const build = spawnSync(process.execPath, [next, 'build'], {
  cwd: consumer,
  env,
  encoding: 'utf8',
});
const buildOutput = `${build.stdout}${build.stderr}`;
console.log(buildOutput.replace(/^/gm, '    '));
check(build.status === 0, `next build failed with exit code ${build.status}`);
check(/Finished TypeScript/.test(buildOutput), 'next build did not type-check the app');
check(
  problems(buildOutput).length === 0,
  `next build reported: ${problems(buildOutput).join(' | ')}`
);
KEPT.forEach((name, index) =>
  check(
    before[index].equals(fs.readFileSync(path.join(consumer, name))),
    `next build changed ${name}`
  )
);
ok('next build type-checked and built the app, with no warning, and changed no committed file');

const cssFiles = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.css')) cssFiles.push(file);
  }
};
walk(path.join(consumer, '.next', 'static'));
const withMarker = cssFiles.filter(file => fs.readFileSync(file, 'utf8').includes(cssMarker));
check(withMarker.length > 0, `no built CSS contains ${cssMarker}`);
ok(`${path.relative(consumer, withMarker[0])} contains ${cssMarker} from the packed styles.css`);

const server = spawn(process.execPath, [next, 'start', '-p', String(PORT), '-H', '127.0.0.1'], {
  cwd: consumer,
  env,
});
let serverOutput = '';
server.stdout.on('data', chunk => (serverOutput += chunk));
server.stderr.on('data', chunk => (serverOutput += chunk));
let browser;
try {
  let html;
  for (const deadline = Date.now() + 30_000; ;) {
    try {
      const response = await fetch(`${ORIGIN}/`);
      check(response.status === 200, `GET / returned ${response.status}`);
      html = await response.text();
      break;
    } catch (error) {
      if (Date.now() > deadline || server.exitCode !== null) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  // The server HTML has the empty region and its live regions, and no toast (§23).
  check(
    /<section class="ret-toaster"[^>]*aria-label="Notifications"/.test(html),
    'no region in the server HTML'
  );
  check(!/class="ret-toast /.test(html), 'the server HTML contains a toast');
  check(
    html.includes('aria-live="polite"') && html.includes('aria-live="assertive"'),
    'no live regions in the server HTML'
  );
  check(/<link[^>]+rel="stylesheet"[^>]+\.css/.test(html), 'the server HTML links no stylesheet');
  ok('next start serves the empty region and its live regions, with no toast and a stylesheet');

  browser = await chromium.launch();
  const page = await browser.newPage();
  const messages = [];
  page.on('console', message => messages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => messages.push(`pageerror: ${error.message}`));
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Show a toast' }).click();
  const item = page.locator('li.ret-toast', { hasText: TOAST });
  await item.waitFor({ state: 'visible', timeout: 10_000 });
  // The stylesheet positions each stack's list, not the region (§21, P-17).
  const position = await item.evaluate(
    li => li.ownerDocument.defaultView?.getComputedStyle(li.closest('ol') ?? li).position
  );
  check(position === 'fixed', `the toast's list is ${position}, so the stylesheet is not applied`);
  check(messages.length === 0, `the page logged: ${messages.join(' | ')}`);
  ok(
    `Chromium: hydrated, the button showed "${TOAST}", its list is fixed, and the page logged nothing`
  );
} finally {
  await browser?.close();
  server.kill();
}
check(
  problems(serverOutput).length === 0,
  `next start reported: ${problems(serverOutput).join(' | ')}`
);
ok('next start reported no warning or error');
