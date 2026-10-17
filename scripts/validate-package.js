// Validates the packed package as consumers receive it (§27, P-07; the F1 to F4 matrix and the
// Next.js App Router consumer, P-23 S5b to S7; the Jest consumer, P-27 S2).
// Run through `npm run validate:package`, which builds the library first.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { checkProgressDirection, directionSelectors } from './progress-direction.js';

const PACKAGE_NAME = 'react-elegant-toasts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = path.join(root, 'fixtures', 'consumer-vite');
const nextFixtureDir = path.join(root, 'fixtures', 'consumer-next');
const jestFixtureDir = path.join(root, 'fixtures', 'consumer-jest');
const npmFlags = ['--ignore-scripts', '--no-audit', '--no-fund'];

const EXPECTED_FILES = [
  'LICENSE',
  'README.md',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/index.js.map',
  'dist/styles.css',
  'package.json',
];
const FORBIDDEN_EXTENSIONS = /\.(cjs|cts|mjs|mts)$/;
const PEERS = { react: '^18.0.0 || ^19.0.0', 'react-dom': '^18.0.0 || ^19.0.0' };
const BLOCKED_DEEP_IMPORTS = [
  'dist/index.js',
  'dist/styles.css',
  'dist/index.d.ts',
  'src/index.ts',
  'index.js',
];
// The 2.x stylesheet's root class (P-17). The 0.x stylesheet had no `ret-` selector, so stale CSS
// cannot satisfy it, and minifiers keep class names.
const CSS_MARKER = '.ret-toaster';
// The fixture's progress toast (fixtures/consumer-vite/src/app.ts), for the direction check.
const PROGRESS_TOAST = 'Progress from the consumer fixture';
// The public export surface (§6.1, §6.7, AC-API-1).
const VALUE_EXPORTS = ['Toaster', 'toast'];
const TYPE_EXPORTS = [
  'CustomToastOptions',
  'DismissReason',
  'ToastAction',
  'ToastId',
  'ToastOptions',
  'ToastPosition',
  'ToastPromiseMessages',
  'ToastSnapshot',
  'ToastTheme',
  'ToastType',
  'ToasterProps',
];

// The packed consumer matrix (§27 step 6, P-23 D0-5). Every leg shares the fixture's sources and
// tsconfig, and installs the same tarball from its own committed manifest and lockfile: F1 is the
// fixture's own, F2 to F4 live in `fixtures/consumer-vite/legs/<leg>/`. The manifests pin exact
// versions; the table fixes what each leg is for, so a drifted manifest cannot quietly change it.
// TypeScript 7 is only ever run as the `tsc` CLI (D0-3).
const LEGS = [
  { id: 'F1', manifestDir: fixtureDir, react: 18, typescript: '5.0.4' },
  { id: 'F2', manifestDir: path.join(fixtureDir, 'legs', 'f2'), react: 19, typescript: '5.0.4' },
  { id: 'F3', manifestDir: path.join(fixtureDir, 'legs', 'f3'), react: 18, typescript: '7.0.2' },
  { id: 'F4', manifestDir: path.join(fixtureDir, 'legs', 'f4'), react: 19, typescript: '7.0.2' },
];
const LEG_PACKAGES = ['react', 'react-dom', '@types/react', '@types/react-dom', 'typescript'];
// The Next.js App Router consumer (§27 step 8, P-23 D0-7): React 19 through Next.js, whose App
// Router renders with the React canary built into Next.js, and TypeScript 7.0.2 through Next.js's
// default tsc CLI checker. scripts/check-next-app.js builds, starts and drives it in Chromium.
const NEXT_LEG = {
  id: 'N1',
  sourceDir: nextFixtureDir,
  manifestDir: nextFixtureDir,
  react: 19,
  typescript: '7.0.2',
  next: '16.4.0',
};
// The Jest consumer (§27 step 9, P-27 S2): Jest 30 with jsdom loads the package as native ESM
// under Node's --experimental-vm-modules, with no transform, and maps the CSS import to a stub.
// It backs the Jest configuration the migration guide shows; React 19 only (P-27 S2, D1).
const JEST_LEG = {
  id: 'J1',
  sourceDir: jestFixtureDir,
  manifestDir: jestFixtureDir,
  react: 19,
  packages: { jest: '30.5.2', 'jest-environment-jsdom': '30.5.2' },
};
// The fixture's tests, by title. The run must pass exactly these, so it cannot pass with none.
const JEST_TEST_FILE = 'toaster.test.js';
const JEST_TESTS = [
  'resolves the package to the copy installed in this consumer',
  'shows a success toast and removes it from its close button',
];

class ValidationError extends Error {}

function assert(condition, message) {
  if (!condition) throw new ValidationError(message);
}

function step(title) {
  console.log(`\n▶ ${title}`);
}

function ok(message) {
  console.log(`  ✓ ${message}`);
}

function run(command, args, { cwd, capture = false, label, env }) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    // Only the npm fallback needs a shell (npm.cmd on Windows); everything else runs through node.
    shell: process.platform === 'win32' && command === 'npm',
  });
  if (result.error) throw result.error;
  assert(result.status === 0, `${label} failed with exit code ${result.status}`);
  return result.stdout;
}

function npm(args, options) {
  // Under `npm run`, npm_execpath points at the npm CLI, which works on every platform.
  const npmCli = process.env.npm_execpath;
  return npmCli ? run(process.execPath, [npmCli, ...args], options) : run('npm', args, options);
}

function binOf(packageDir, name) {
  const pkg = readJson(path.join(packageDir, 'package.json'));
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin[name];
  return path.join(packageDir, bin);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function sameMembers(actual, expected) {
  return actual.length === expected.length && expected.every(item => actual.includes(item));
}

function findRequireCondition(value, trail = 'exports') {
  if (value === null || typeof value !== 'object') return undefined;
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'require') return `${trail}.${key}`;
    const found = findRequireCondition(nested, `${trail}[${JSON.stringify(key)}]`);
    if (found) return found;
  }
  return undefined;
}

function pack(tmp) {
  step('Pack the library');
  const output = npm(['pack', '--json', '--ignore-scripts', '--pack-destination', tmp], {
    cwd: root,
    capture: true,
    label: 'npm pack',
  });
  const [info] = JSON.parse(output);
  const tarball = path.join(tmp, info.filename);
  assert(fs.existsSync(tarball), `npm pack did not write ${tarball}`);
  ok(`${info.filename} (${info.files.length} files)`);
  return { tarball, info };
}

function checkTarballContents(info) {
  step('Check tarball contents');
  const files = info.files.map(file => file.path).sort();
  for (const file of files) console.log(`    ${file}`);
  const unexpected = files.filter(file => !EXPECTED_FILES.includes(file));
  const missing = EXPECTED_FILES.filter(file => !files.includes(file));
  assert(
    unexpected.length === 0 && missing.length === 0,
    `tarball contents differ: unexpected [${unexpected.join(', ')}], missing [${missing.join(', ')}]`
  );
  const nonEsm = files.filter(file => FORBIDDEN_EXTENSIONS.test(file));
  assert(nonEsm.length === 0, `tarball contains non-ESM-only files: ${nonEsm.join(', ')}`);
  ok(`exactly the ${EXPECTED_FILES.length} expected files, no .cjs/.cts/.mjs/.mts/.d.cts/.d.mts`);
}

function runPackageLinters(tarball) {
  step('publint');
  run(
    process.execPath,
    [binOf(path.join(root, 'node_modules', 'publint'), 'publint'), 'run', tarball, '--strict'],
    {
      cwd: root,
      label: 'publint',
    }
  );
  ok('publint passed (strict)');

  step('Are the Types Wrong (ESM-only profile)');
  // The CSS entry has no declarations by design (P-03), so it is excluded.
  run(
    process.execPath,
    [
      binOf(path.join(root, 'node_modules', '@arethetypeswrong', 'cli'), 'attw'),
      tarball,
      '--profile',
      'esm-only',
      '--exclude-entrypoints',
      './styles.css',
    ],
    { cwd: root, label: 'attw' }
  );
  ok('attw passed');
}

function prepareConsumer(tmp, tarball, leg) {
  const sourceDir = leg.sourceDir ?? fixtureDir;
  const fixture = path.relative(root, sourceDir);
  step(`${leg.id}: install the tarball into an isolated copy of ${fixture}`);
  const consumer = path.join(tmp, `${path.basename(sourceDir)}-${leg.id.toLowerCase()}`);
  fs.cpSync(sourceDir, consumer, {
    recursive: true,
    filter: source =>
      !['node_modules', 'dist', 'dist-render', 'legs', '.next'].includes(path.basename(source)),
  });
  for (const name of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(leg.manifestDir, name), path.join(consumer, name));
  }
  const manifests = ['package.json', 'package-lock.json'].map(name => ({
    name,
    content: fs.readFileSync(path.join(consumer, name)),
  }));
  for (const { name, content } of manifests) {
    assert(
      !content.toString().includes(PACKAGE_NAME),
      `the fixture ${name} must not reference ${PACKAGE_NAME}`
    );
  }

  npm(['ci', ...npmFlags], { cwd: consumer, label: 'npm ci (fixture)' });
  npm(['install', '--no-save', ...npmFlags, tarball], {
    cwd: consumer,
    label: 'npm install <tarball>',
  });

  for (const { name, content } of manifests) {
    assert(
      content.equals(fs.readFileSync(path.join(consumer, name))),
      `installing the tarball changed the fixture ${name}`
    );
  }
  ok('fixture package.json and package-lock.json unchanged');

  const installed = path.join(consumer, 'node_modules', PACKAGE_NAME);
  assert(
    !fs.lstatSync(installed).isSymbolicLink(),
    `${installed} is a symlink, not an installed copy`
  );
  assert(
    isInside(fs.realpathSync(installed), consumer),
    'the installed package resolves outside the consumer'
  );
  assert(!isInside(consumer, root), 'the consumer must live outside the repository');
  ok(`installed copy at ${installed}`);
  return { consumer, installed };
}

/** Compares dotted versions such as "5.0" and "5.6", numerically. */
function compareVersions(a, b) {
  const [x, y] = [a, b].map(version => version.split('.').map(Number));
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const difference = (x[i] ?? 0) - (y[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function checkLegVersions(consumer, leg) {
  step(`${leg.id}: check the installed versions`);
  const manifest = readJson(path.join(consumer, 'package.json'));
  const pins = { ...manifest.dependencies, ...manifest.devDependencies };
  const installed = {};
  for (const name of LEG_PACKAGES) {
    const pin = pins[name];
    assert(/^\d+\.\d+\.\d+$/.test(pin ?? ''), `${leg.id} must pin ${name} exactly, found ${pin}`);
    installed[name] = readJson(path.join(consumer, 'node_modules', name, 'package.json'));
    assert(
      installed[name].version === pin,
      `${leg.id} installed ${name} ${installed[name].version}, but its manifest pins ${pin}`
    );
  }
  for (const name of ['react', 'react-dom', '@types/react', '@types/react-dom']) {
    const major = Number(installed[name].version.split('.')[0]);
    assert(major === leg.react, `${leg.id} is a React ${leg.react} leg, but has ${name} ${major}`);
  }
  assert(
    installed.typescript.version === leg.typescript,
    `${leg.id} must use TypeScript ${leg.typescript}, found ${installed.typescript.version}`
  );
  if (leg.next) {
    const nextVersion = readJson(
      path.join(consumer, 'node_modules', 'next', 'package.json')
    ).version;
    assert(
      nextVersion === leg.next && pins.next === leg.next,
      `${leg.id} must pin and install Next.js ${leg.next}, found ${pins.next} and ${nextVersion}`
    );
    installed.next = { version: nextVersion };
  }
  // The type packages must declare support for this leg's TypeScript (D0-4).
  for (const name of ['@types/react', '@types/react-dom']) {
    const minimum = installed[name].typeScriptVersion;
    assert(
      minimum === undefined || compareVersions(minimum, leg.typescript) <= 0,
      `${leg.id}: ${name} ${installed[name].version} needs TypeScript ${minimum}, the leg uses ${leg.typescript}`
    );
  }
  ok(
    `${Object.keys(installed)
      .map(name => `${name} ${installed[name].version}`)
      .join(', ')} (React ${leg.react}, TypeScript ${leg.typescript})`
  );
}

function checkNextApp(consumer, leg) {
  step(`${leg.id}: build, start and drive the Next.js App Router app in Chromium`);
  run(process.execPath, [path.join(root, 'scripts', 'check-next-app.js'), consumer, CSS_MARKER], {
    cwd: root,
    label: 'Next.js App Router check',
  });
  ok('the App Router app built, served the empty region and showed a toast in Chromium');
}

function checkJestVersions(consumer, leg) {
  step(`${leg.id}: check the installed versions`);
  const manifest = readJson(path.join(consumer, 'package.json'));
  const pins = { ...manifest.dependencies, ...manifest.devDependencies };
  const installed = {};
  for (const name of ['react', 'react-dom', ...Object.keys(leg.packages)]) {
    const pin = pins[name];
    assert(/^\d+\.\d+\.\d+$/.test(pin ?? ''), `${leg.id} must pin ${name} exactly, found ${pin}`);
    installed[name] = readJson(path.join(consumer, 'node_modules', name, 'package.json')).version;
    assert(
      installed[name] === pin,
      `${leg.id} installed ${name} ${installed[name]}, but its manifest pins ${pin}`
    );
  }
  for (const [name, version] of Object.entries(leg.packages)) {
    assert(installed[name] === version, `${leg.id} must use ${name} ${version}`);
  }
  for (const name of ['react', 'react-dom']) {
    const major = Number(installed[name].split('.')[0]);
    assert(major === leg.react, `${leg.id} is a React ${leg.react} leg, but has ${name} ${major}`);
  }
  ok(
    `${Object.entries(installed)
      .map(([name, version]) => `${name} ${version}`)
      .join(', ')} (React ${leg.react})`
  );
}

function checkJest(consumer, tmp, leg) {
  step(`${leg.id}: run the fixture's Jest tests against the packed package`);
  // Outside the consumer, so the results file is never mistaken for part of the fixture.
  const resultsFile = path.join(tmp, `jest-${leg.id.toLowerCase()}-results.json`);
  npm(['test', '--', '--ci', '--json', '--outputFile', resultsFile], {
    cwd: consumer,
    label: `Jest ${leg.packages.jest}`,
  });
  const results = readJson(resultsFile);
  assert(results.success === true, 'the Jest run did not succeed');
  assert(
    results.numTotalTestSuites === 1 && results.numPassedTestSuites === 1,
    `expected 1 passing test suite, found ${results.numPassedTestSuites} of ${results.numTotalTestSuites}`
  );
  assert(
    results.numTotalTests === JEST_TESTS.length && results.numPassedTests === JEST_TESTS.length,
    `expected ${JEST_TESTS.length} passing tests, found ${results.numPassedTests} of ${results.numTotalTests}`
  );
  const [suite] = results.testResults;
  const testFile = fs.realpathSync(suite.name);
  assert(
    isInside(testFile, fs.realpathSync(consumer)) && path.basename(testFile) === JEST_TEST_FILE,
    `the test suite ran from ${suite.name}, not the consumer's ${JEST_TEST_FILE}`
  );
  const passed = suite.assertionResults
    .filter(test => test.status === 'passed')
    .map(test => test.title)
    .sort();
  assert(
    JSON.stringify(passed) === JSON.stringify([...JEST_TESTS].sort()),
    `the passing tests are [${passed.join(', ')}], expected [${JEST_TESTS.join(', ')}]`
  );
  ok(
    `Jest ${leg.packages.jest} passed exactly the ${JEST_TESTS.length} tests of ${JEST_TEST_FILE}`
  );
}

function checkPackedManifest(installed, info) {
  step('Check the packed package.json');
  const pkg = readJson(path.join(installed, 'package.json'));
  assert(pkg.name === PACKAGE_NAME, `name is ${pkg.name}`);
  assert(
    pkg.version === info.version,
    `version ${pkg.version} differs from the packed ${info.version}`
  );
  assert(pkg.type === 'module', `type is ${pkg.type}`);
  assert(pkg.types === './dist/index.d.ts', `types is ${pkg.types}`);
  assert(
    JSON.stringify(pkg.files) === JSON.stringify(['dist']),
    `files is ${JSON.stringify(pkg.files)}`
  );
  assert(
    JSON.stringify(pkg.sideEffects) === JSON.stringify(['**/*.css']),
    `sideEffects is ${JSON.stringify(pkg.sideEffects)}`
  );
  assert(
    JSON.stringify(pkg.peerDependencies) === JSON.stringify(PEERS),
    `peerDependencies are ${JSON.stringify(pkg.peerDependencies)}`
  );
  assert(
    pkg.dependencies === undefined || Object.keys(pkg.dependencies).length === 0,
    `runtime dependencies: ${JSON.stringify(pkg.dependencies)}`
  );
  for (const field of ['main', 'module', 'style', 'engines', 'packageManager']) {
    assert(!(field in pkg), `unexpected "${field}" field`);
  }
  assert(
    sameMembers(Object.keys(pkg.exports ?? {}), ['.', './styles.css', './package.json']),
    `exports keys are ${JSON.stringify(Object.keys(pkg.exports ?? {}))}`
  );
  assert(
    JSON.stringify(pkg.exports['.']) ===
      JSON.stringify({ types: './dist/index.d.ts', default: './dist/index.js' }),
    `root export is ${JSON.stringify(pkg.exports['.'])}`
  );
  assert(pkg.exports['./styles.css'] === './dist/styles.css', 'the ./styles.css export is wrong');
  assert(pkg.exports['./package.json'] === './package.json', 'the ./package.json export is wrong');
  const requireCondition = findRequireCondition(pkg.exports);
  assert(!requireCondition, `CommonJS condition found at ${requireCondition}`);
  ok(
    `${pkg.name}@${pkg.version}: ESM-only manifest, no runtime dependencies, peers ${PEERS.react}`
  );
}

function checkUseClient(installed) {
  step('Check "use client"');
  const bytes = fs.readFileSync(path.join(installed, 'dist', 'index.js'));
  assert(
    !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf),
    'dist/index.js starts with a BOM'
  );
  const source = bytes.toString('utf8');
  assert(/^"use client";\r?\n/.test(source), 'dist/index.js does not start with "use client";');
  const count = source.match(/["']use client["']/g)?.length ?? 0;
  assert(count === 1, `"use client" occurs ${count} times in dist/index.js`);
  ok('no BOM, first line is "use client";, occurs exactly once');
}

function checkDeclarations(installed) {
  step('Check the declarations');
  const declarationFile = path.join(installed, 'dist', 'index.d.ts');
  assert(fs.existsSync(declarationFile), 'dist/index.d.ts is missing');
  const source = fs.readFileSync(declarationFile, 'utf8');
  const specifiers = [
    ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/\/\/\/\s*<reference\s+(?:path|types)=['"]([^'"]+)['"]/g),
  ].map(match => match[1]);
  for (const specifier of specifiers) {
    if (specifier.startsWith('.')) {
      const target = path.resolve(path.dirname(declarationFile), specifier);
      assert(
        isInside(target, installed),
        `dist/index.d.ts references ${specifier} outside the package`
      );
      const candidates = [target, `${target}.d.ts`, target.replace(/\.js$/, '.d.ts')];
      assert(
        candidates.some(file => fs.existsSync(file)),
        `dist/index.d.ts references unpublished ${specifier}`
      );
    } else {
      assert(
        ['react', 'react-dom'].includes(specifier.split('/')[0]),
        `dist/index.d.ts imports undeclared ${specifier}`
      );
    }
  }
  assert(!/\bsrc\//.test(source), 'dist/index.d.ts mentions repository source');
  ok(`dist/index.d.ts present; imports only ${[...new Set(specifiers)].join(', ') || 'nothing'}`);

  // The bundled declarations end in a single export list; any other export form is a leak.
  const exportStatements = source.match(/^export\b.*$/gm) ?? [];
  assert(
    exportStatements.length === 1 && /^export\s*\{[^}]*\};?$/.test(exportStatements[0]),
    `dist/index.d.ts must have exactly one export list, found: ${exportStatements.join(' | ')}`
  );
  const exported = exportStatements[0]
    .replace(/^export\s*\{|\};?$/g, '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const typeOnly = item.startsWith('type ');
      const name = item
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop();
      return { name, typeOnly };
    });
  const values = exported
    .filter(item => !item.typeOnly)
    .map(item => item.name)
    .sort();
  const types = exported
    .filter(item => item.typeOnly)
    .map(item => item.name)
    .sort();
  assert(
    JSON.stringify(values) === JSON.stringify(VALUE_EXPORTS),
    `declared value exports are [${values.join(', ')}], expected [${VALUE_EXPORTS.join(', ')}]`
  );
  assert(
    JSON.stringify(types) === JSON.stringify([...TYPE_EXPORTS].sort()),
    `declared type exports are [${types.join(', ')}], expected [${TYPE_EXPORTS.join(', ')}]`
  );
  ok(
    `declarations export exactly ${VALUE_EXPORTS.join(', ')} and the ${TYPE_EXPORTS.length} public types`
  );
}

function checkResolution(consumer, installed, leg) {
  step(`${leg.id}: check Node ESM resolution from the consumer`);
  const script = `
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const name = ${JSON.stringify(PACKAGE_NAME)};
const result = { resolved: {}, blocked: {}, react: {} };
const entry = await import(name);
result.rootImport = true;
result.runtimeExports = Object.keys(entry).sort();
for (const subpath of ['styles.css', 'package.json']) {
  result.resolved[subpath] = fs.realpathSync(new URL(import.meta.resolve(name + '/' + subpath)));
}
for (const subpath of ${JSON.stringify(BLOCKED_DEEP_IMPORTS)}) {
  try {
    import.meta.resolve(name + '/' + subpath);
    result.blocked[subpath] = 'RESOLVED';
  } catch (error) {
    result.blocked[subpath] = error.code;
  }
}
const fromConsumer = createRequire(path.join(process.cwd(), 'index.js'));
const packageEntry = fs.realpathSync(new URL(import.meta.resolve(name)));
const fromPackage = createRequire(packageEntry);
result.react.consumer = fs.realpathSync(fromConsumer.resolve('react'));
result.react.package = fs.realpathSync(fromPackage.resolve('react'));
const copies = [];
const walk = modulesDir => {
  for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const scopeDir = path.join(modulesDir, entry.name);
    const packages = entry.name.startsWith('@')
      ? fs.readdirSync(scopeDir, { withFileTypes: true })
          .filter(scoped => scoped.isDirectory())
          .map(scoped => [entry.name + '/' + scoped.name, path.join(scopeDir, scoped.name)])
      : [[entry.name, scopeDir]];
    for (const [packageName, packageDir] of packages) {
      if (packageName === 'react') copies.push(packageDir);
      const nested = path.join(packageDir, 'node_modules');
      if (fs.existsSync(nested)) walk(nested);
    }
  }
};
walk(path.join(process.cwd(), 'node_modules'));
result.react.copies = copies;
console.log(JSON.stringify(result));
`;
  const scriptFile = path.join(consumer, 'check-resolution.mjs');
  fs.writeFileSync(scriptFile, script);
  const result = JSON.parse(
    run(process.execPath, [scriptFile], { cwd: consumer, capture: true, label: 'resolution check' })
  );

  assert(result.rootImport, 'the root ESM import failed');
  ok(`import "${PACKAGE_NAME}" succeeds`);
  assert(
    JSON.stringify(result.runtimeExports) === JSON.stringify(VALUE_EXPORTS),
    `runtime exports are [${result.runtimeExports.join(', ')}], expected [${VALUE_EXPORTS.join(', ')}] and no default`
  );
  ok(`runtime exports are exactly ${VALUE_EXPORTS.join(', ')}, with no default export`);
  for (const [subpath, file] of Object.entries(result.resolved)) {
    assert(isInside(file, installed), `${subpath} resolved outside the installed package: ${file}`);
    ok(`${PACKAGE_NAME}/${subpath} → ${path.relative(consumer, file)}`);
  }
  for (const [subpath, code] of Object.entries(result.blocked)) {
    assert(
      code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
      `${PACKAGE_NAME}/${subpath} is not blocked (${code})`
    );
    ok(`${PACKAGE_NAME}/${subpath} → ${code}`);
  }
  assert(
    result.react.consumer === result.react.package,
    'the package and the consumer resolve different React copies'
  );
  assert(
    isInside(result.react.consumer, consumer),
    `React resolved outside the consumer: ${result.react.consumer}`
  );
  assert(
    result.react.copies.length === 1,
    `found ${result.react.copies.length} React copies: ${result.react.copies.join(', ')}`
  );
  ok(
    `one React copy, shared by consumer and package (${path.relative(consumer, result.react.copies[0])})`
  );
}

async function checkFixture(consumer, installed, leg) {
  step(`${leg.id}: type-check the fixture`);
  const typescript = readJson(
    path.join(consumer, 'node_modules', 'typescript', 'package.json')
  ).version;
  npm(['run', 'typecheck'], { cwd: consumer, label: `tsc ${typescript}` });
  ok(
    `TypeScript ${typescript} accepts the packed declarations; the deep type import stays blocked`
  );

  step(`${leg.id}: build the fixture with Vite`);
  const vite = readJson(path.join(consumer, 'node_modules', 'vite', 'package.json')).version;
  npm(['run', 'build'], { cwd: consumer, label: `vite ${vite} build` });
  ok(`vite ${vite} build succeeded`);

  step(`${leg.id}: check the CSS reached the bundle`);
  const packedCss = fs.readFileSync(path.join(installed, 'dist', 'styles.css'), 'utf8');
  assert(
    packedCss.includes(CSS_MARKER),
    `the packed styles.css no longer contains ${CSS_MARKER}; update CSS_MARKER`
  );
  const assets = path.join(consumer, 'dist', 'assets');
  const cssFiles = fs.existsSync(assets)
    ? fs.readdirSync(assets).filter(file => file.endsWith('.css'))
    : [];
  assert(cssFiles.length > 0, 'the Vite build emitted no CSS');
  const bundled = cssFiles.map(file => fs.readFileSync(path.join(assets, file), 'utf8')).join('\n');
  assert(bundled.includes(CSS_MARKER), `the Vite CSS output does not contain ${CSS_MARKER}`);
  ok(`${cssFiles.join(', ')} contains ${CSS_MARKER} from the packed styles.css`);
  // Vite 8 minifies with Lightning CSS, which lowers `:dir()` for older targets (Issue #45).
  const rewritten = directionSelectors(bundled);
  assert(
    rewritten.length === 0,
    `the Vite CSS output has direction selectors: ${rewritten.join(', ')}`
  );
  ok('the Vite CSS output has no :dir() or :lang() selector');

  // The built app in a real browser, once: every leg builds the same sources with the same Vite.
  if (leg.id === 'F1') await checkViteProgressDirection(consumer, leg);

  step(`${leg.id}: render a toast from the packed package in jsdom`);
  const jsdom = readJson(path.join(consumer, 'node_modules', 'jsdom', 'package.json')).version;
  npm(['run', 'test:render'], { cwd: consumer, label: `render check (jsdom ${jsdom})` });
  ok(`the fixture app rendered, showed and closed a toast (jsdom ${jsdom})`);

  // A fresh plain-Node process each time, with no DOM: the package as a server imports it.
  for (const mode of ['development', 'production']) {
    step(`${leg.id}: render on the server under native Node ESM (${mode})`);
    run(process.execPath, ['ssr-check.mjs'], {
      cwd: consumer,
      env: { ...process.env, NODE_ENV: mode },
      label: `SSR smoke test (${mode})`,
    });
    ok(`server rendering passed in ${mode}`);
  }
}

/**
 * Serves the fixture's Vite build with `vite preview` and checks in Chromium that the remaining
 * progress sits at the inline start (§20, Issue #45): `?progress` makes the app show a progress
 * toast.
 */
async function checkViteProgressDirection(consumer, leg) {
  step(`${leg.id}: anchor the progress at the inline start in Chromium`);
  const port = Number(process.env.CONSUMER_VITE_PORT ?? 4311);
  const origin = `http://127.0.0.1:${port}`;
  const vite = path.join(consumer, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(
    process.execPath,
    [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: consumer }
  );
  let serverOutput = '';
  server.stdout.on('data', chunk => (serverOutput += chunk));
  server.stderr.on('data', chunk => (serverOutput += chunk));
  let browser;
  try {
    for (const deadline = Date.now() + 30_000; ;) {
      try {
        const response = await fetch(`${origin}/`);
        assert(response.status === 200, `vite preview returned ${response.status}`);
        break;
      } catch (error) {
        if (Date.now() > deadline || server.exitCode !== null) {
          throw new ValidationError(
            `vite preview did not start: ${error.message}\n${serverOutput}`
          );
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    browser = await chromium.launch();
    const anchored = await checkProgressDirection(browser, {
      open: page => page.goto(`${origin}/?progress`, { waitUntil: 'networkidle' }),
      show: async page => page.locator('li.ret-toast', { hasText: PROGRESS_TOAST }),
    });
    ok(`Chromium: the progress fill ${anchored.join(', and ')}`);
  } finally {
    await browser?.close();
    server.kill();
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-validate-package-'));
let failed = false;
try {
  const { tarball, info } = pack(tmp);
  checkTarballContents(info);
  runPackageLinters(tarball);
  for (const [index, leg] of LEGS.entries()) {
    const { consumer, installed } = prepareConsumer(tmp, tarball, leg);
    checkLegVersions(consumer, leg);
    // The package itself is the same in every leg, so its own checks run once.
    if (index === 0) {
      checkPackedManifest(installed, info);
      checkUseClient(installed);
      checkDeclarations(installed);
    }
    checkResolution(consumer, installed, leg);
    await checkFixture(consumer, installed, leg);
  }
  {
    const { consumer, installed } = prepareConsumer(tmp, tarball, NEXT_LEG);
    checkLegVersions(consumer, NEXT_LEG);
    checkResolution(consumer, installed, NEXT_LEG);
    checkNextApp(consumer, NEXT_LEG);
  }
  {
    const { consumer, installed } = prepareConsumer(tmp, tarball, JEST_LEG);
    checkJestVersions(consumer, JEST_LEG);
    checkResolution(consumer, installed, JEST_LEG);
    checkJest(consumer, tmp, JEST_LEG);
  }
  const ids = [...LEGS, NEXT_LEG, JEST_LEG].map(leg => leg.id);
  console.log(`\nPackage validation passed (${ids.join(', ')}).`);
} catch (error) {
  failed = true;
  console.error(
    `\n✗ Package validation failed: ${error instanceof ValidationError ? error.message : error.stack}`
  );
} finally {
  if (process.env.KEEP_VALIDATE_TMP === '1') {
    console.log(`Temporary directory kept: ${tmp}`);
  } else {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
process.exitCode = failed ? 1 : 0;
