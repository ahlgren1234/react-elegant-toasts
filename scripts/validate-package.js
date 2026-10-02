// Validates the packed package as consumers receive it (§27, P-07).
// Run through `npm run validate:package`, which builds the library first.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = 'react-elegant-toasts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = path.join(root, 'fixtures', 'consumer-vite');
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
// A selector from the current packed stylesheet. P-17 updates it with the stylesheet redesign.
const CSS_MARKER = '.toast-progress';
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

function run(command, args, { cwd, capture = false, label }) {
  const result = spawnSync(command, args, {
    cwd,
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

function prepareConsumer(tmp, tarball) {
  step('Install the tarball into an isolated copy of fixtures/consumer-vite');
  const consumer = path.join(tmp, 'consumer-vite');
  fs.cpSync(fixtureDir, consumer, {
    recursive: true,
    filter: source => !['node_modules', 'dist'].includes(path.basename(source)),
  });
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

function checkResolution(consumer, installed) {
  step('Check Node ESM resolution from the consumer');
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

function checkFixture(consumer, installed) {
  step('Type-check the fixture');
  const typescript = readJson(
    path.join(consumer, 'node_modules', 'typescript', 'package.json')
  ).version;
  npm(['run', 'typecheck'], { cwd: consumer, label: `tsc ${typescript}` });
  ok(
    `TypeScript ${typescript} accepts the packed declarations; the deep type import stays blocked`
  );

  step('Build the fixture with Vite');
  const vite = readJson(path.join(consumer, 'node_modules', 'vite', 'package.json')).version;
  npm(['run', 'build'], { cwd: consumer, label: `vite ${vite} build` });
  ok(`vite ${vite} build succeeded`);

  step('Check the CSS reached the bundle');
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
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-validate-package-'));
let failed = false;
try {
  const { tarball, info } = pack(tmp);
  checkTarballContents(info);
  runPackageLinters(tarball);
  const { consumer, installed } = prepareConsumer(tmp, tarball);
  checkPackedManifest(installed, info);
  checkUseClient(installed);
  checkDeclarations(installed);
  checkResolution(consumer, installed);
  checkFixture(consumer, installed);
  console.log('\nPackage validation passed.');
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
