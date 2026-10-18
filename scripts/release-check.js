// The release checks and the non-publishing release rehearsal (§29, P-28 S3, design B1). Run by
// .github/workflows/release.yml, which never publishes during P-28; P-29 owns the live publish job.
//
//   node scripts/release-check.js check [--mode=rehearsal|publish] [--tag=<dist-tag>]
//   node scripts/release-check.js rehearse
//
// `check` validates the release state: the package manifest, both lockfile version fields, the
// Changesets pre mode, the version and its dist-tag, and the Node and npm minimums for Trusted
// Publishing. Releasable versions are 2.0.0-next.N in pre mode `next` (dist-tag `next`) and stable
// 2.x.y with pre mode off (`latest`). Parked versions (0.1.2, the unpublished 2.0.0-0 baseline and
// anything already on npm) pass in rehearsal mode only; publish mode refuses them.
//
// `rehearse` checks in rehearsal mode, builds once, packs once, verifies the exact tarball
// contents and runs `npm publish --dry-run` on the packed tarball. A releasable version is dry-run
// as it is. A parked version is rehearsed with SIMULATED_VERSION in a disposable copy of the
// tarball, whose contents must stay byte-identical apart from that version, and its output is
// labelled SIMULATED. The real package.json is never modified, and every npm call goes through
// npm(), which refuses `publish` without `--dry-run`.
//
// checkWorkflow() is the structural check of release.yml that release-check.test.js runs: it parses
// the YAML and compares triggers, permissions, jobs, steps, actions and run commands with fixed
// allowlists, so multiline or reformatted YAML cannot slip a publishing step past it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAlias, isScalar, parseDocument, visit } from 'yaml';
import { compareFileList } from './package-contents.js';

export const PACKAGE_NAME = 'react-elegant-toasts';
// Never published by the release path: the 0.x version on npm and the S4 baseline (§29).
export const PARKED_VERSIONS = Object.freeze(['0.1.2', '2.0.0-0']);
// npm Trusted Publishing's minimums (P-28 D0).
export const MINIMUM_NODE = '22.14.0';
export const MINIMUM_NPM = '11.5.1';
// The stand-in version for a parked version's rehearsal. It is a pre-release, so it is dry-run on
// `next`, and checkRelease() rejects it as unsupported, so it can never pass as a real candidate.
export const SIMULATED_VERSION = '2.0.0-rehearsal.0';
export const SIMULATED_TAG = 'next';

const NEXT_VERSION = /^2\.0\.0-next\.(0|[1-9]\d*)$/;
const STABLE_VERSION = /^2\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DIST_TAGS = ['next', 'latest'];
const PROVENANCE_ERROR = /provenance|id-token|oidc/i;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class ReleaseCheckError extends Error {}

function assert(condition, message) {
  if (!condition) throw new ReleaseCheckError(message);
}

// ---------------------------------------------------------------------------------------------
// Release state

function parseRelease(version, label) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/.exec(String(version));
  assert(match, `${label} version is not x.y.z: ${JSON.stringify(version)}`);
  return match.slice(1).map(Number);
}

export function atLeast(version, minimum, label) {
  const actual = parseRelease(version, label);
  const wanted = parseRelease(minimum, label);
  for (let i = 0; i < 3; i++) {
    if (actual[i] !== wanted[i]) return actual[i] > wanted[i];
  }
  return true;
}

export function checkToolchain({ node, npm }) {
  assert(
    atLeast(node, MINIMUM_NODE, 'Node'),
    `Node ${node} is older than the minimum ${MINIMUM_NODE}`
  );
  assert(atLeast(npm, MINIMUM_NPM, 'npm'), `npm ${npm} is older than the minimum ${MINIMUM_NPM}`);
}

export function checkManifest(pkg) {
  assert(pkg.name === PACKAGE_NAME, `package.json name is ${JSON.stringify(pkg.name)}`);
  assert(typeof pkg.version === 'string', 'package.json has no version');
  assert(pkg.publishConfig?.provenance === true, 'publishConfig.provenance must stay true');
  assert(pkg.publishConfig?.access === 'public', 'publishConfig.access must be "public"');
  assert(
    Array.isArray(pkg.files) && pkg.files.length === 1 && pkg.files[0] === 'dist',
    `package.json files must be ["dist"], not ${JSON.stringify(pkg.files)}`
  );
}

export function checkLockfile(pkg, lock) {
  const rootEntry = lock?.packages?.[''];
  assert(lock?.name === pkg.name, `package-lock.json name ${JSON.stringify(lock?.name)}`);
  assert(
    lock.version === pkg.version,
    `package-lock.json version ${JSON.stringify(lock.version)} does not match ${pkg.version}`
  );
  assert(rootEntry, 'package-lock.json has no root package entry');
  assert(
    rootEntry.name === pkg.name,
    `package-lock.json packages[""].name ${JSON.stringify(rootEntry.name)}`
  );
  assert(
    rootEntry.version === pkg.version,
    `package-lock.json packages[""].version ${JSON.stringify(rootEntry.version)} does not match ${pkg.version}`
  );
}

// `.changeset/pre.json`, or null when pre mode is off.
export function checkPreState(preState) {
  if (preState === null) return;
  assert(
    preState !== null && typeof preState === 'object' && !Array.isArray(preState),
    '.changeset/pre.json is not an object'
  );
  assert(
    preState.mode === 'pre' || preState.mode === 'exit',
    `.changeset/pre.json mode ${JSON.stringify(preState.mode)}`
  );
  assert(preState.tag === 'next', `.changeset/pre.json tag ${JSON.stringify(preState.tag)}`);
}

// Classifies a version as `next`, `stable` or `parked`; throws when it is unsupported or does not
// fit the pre mode, and in publish mode when it is parked.
export function classifyVersion({ version, preState, published, mode }) {
  assert(mode === 'rehearsal' || mode === 'publish', `unknown mode ${JSON.stringify(mode)}`);
  assert(Array.isArray(published), 'the published versions are unknown');
  checkPreState(preState);
  if (PARKED_VERSIONS.includes(version) || published.includes(version)) {
    const reason = published.includes(version) ? 'already published on npm' : 'a parked version';
    assert(mode === 'rehearsal', `${version} is ${reason} and cannot be published`);
    return { version, kind: 'parked', distTag: null, releasable: false, reason };
  }
  if (NEXT_VERSION.test(version)) {
    assert(
      preState?.mode === 'pre',
      `${version} needs Changesets pre mode "next" (pre.json mode "pre"), found ${
        preState ? `mode "${preState.mode}"` : 'pre mode off'
      }`
    );
    return { version, kind: 'next', distTag: 'next', releasable: true, reason: 'pre-release' };
  }
  if (STABLE_VERSION.test(version)) {
    assert(preState === null, `${version} needs pre mode off, but .changeset/pre.json exists`);
    return { version, kind: 'stable', distTag: 'latest', releasable: true, reason: 'stable' };
  }
  throw new ReleaseCheckError(
    `unsupported version ${JSON.stringify(version)}: expected 2.0.0-next.N or 2.x.y`
  );
}

export function checkDistTag(classification, tag) {
  if (tag === undefined) return classification.distTag;
  assert(DIST_TAGS.includes(tag), `invalid dist-tag ${JSON.stringify(tag)}`);
  assert(classification.releasable, `${classification.version} is parked and has no dist-tag`);
  assert(
    tag === classification.distTag,
    `${classification.version} must use dist-tag "${classification.distTag}", not "${tag}"`
  );
  return tag;
}

export function checkRelease({ pkg, lock, preState, published, mode, tag, toolchain }) {
  checkToolchain(toolchain);
  checkManifest(pkg);
  checkLockfile(pkg, lock);
  const classification = classifyVersion({ version: pkg.version, preState, published, mode });
  return { ...classification, distTag: checkDistTag(classification, tag) };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function readReleaseState(dir = root) {
  const preFile = path.join(dir, '.changeset', 'pre.json');
  return {
    pkg: readJson(path.join(dir, 'package.json')),
    lock: readJson(path.join(dir, 'package-lock.json')),
    preState: fs.existsSync(preFile) ? readJson(preFile) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Commands

// Every npm call goes through here. `publish` is only ever a dry run.
export function assertDryRunOnly(args) {
  if (args.includes('publish')) {
    assert(args.includes('--dry-run'), `refusing npm ${args.join(' ')}: publish without --dry-run`);
    assert(
      !args.some(arg => /^--(no-dry-run|dry-run=(false|0)?)$/.test(arg)),
      `refusing npm ${args.join(' ')}: --dry-run disabled`
    );
  }
}

export function publishDryRunArgs(tarball, tag, { provenance = true } = {}) {
  const args = ['publish', tarball, '--dry-run', '--ignore-scripts', '--tag', tag];
  if (!provenance) args.push('--provenance=false');
  return args;
}

export function spawnRunner(command, args, { cwd, env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32' && command === 'npm',
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function makeNpm(runner) {
  return (args, options = {}) => {
    assertDryRunOnly(args);
    const env = args.includes('publish')
      ? { ...options.env, npm_config_dry_run: 'true' }
      : options.env;
    // Under `npm run`, npm_execpath points at the npm CLI.
    const npmCli = process.env.npm_execpath;
    return npmCli
      ? runner(process.execPath, [npmCli, ...args], { ...options, env })
      : runner('npm', args, { ...options, env });
  };
}

function expectSuccess(result, label) {
  assert(result.status === 0, `${label} failed (exit ${result.status}):\n${result.stderr ?? ''}`);
  return result.stdout;
}

export function fetchPublishedVersions(npm) {
  const result = npm(['view', PACKAGE_NAME, 'versions', '--json'], { cwd: root });
  if (result.status !== 0 && /E404/.test(`${result.stdout}${result.stderr}`)) return [];
  const versions = JSON.parse(expectSuccess(result, 'npm view'));
  return Array.isArray(versions) ? versions : [versions];
}

function listFiles(dir, base = dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
    })
    .map(file => file.split(path.sep).join('/'))
    .sort();
}

function versionLine(version) {
  return `"version": ${JSON.stringify(version)}`;
}

// Rewrites the version in a package.json text. The text must hold the version line exactly once,
// so nothing but that line changes.
export function setVersion(text, from, to) {
  const parts = text.split(versionLine(from));
  assert(parts.length === 2, `package.json does not hold ${versionLine(from)} exactly once`);
  const updated = parts.join(versionLine(to));
  assert(JSON.parse(updated).version === to, 'the rewritten package.json has the wrong version');
  return updated;
}

// Compares two extracted packages: the same files, byte-identical, except package.json, which may
// differ only in its version line.
export function compareExtracted(realDir, simulatedDir, { from, to }) {
  const realFiles = listFiles(realDir);
  const simulatedFiles = listFiles(simulatedDir);
  assert(
    realFiles.join('\n') === simulatedFiles.join('\n'),
    `the simulated tarball's files differ: [${simulatedFiles.join(', ')}]`
  );
  for (const file of realFiles) {
    const real = fs.readFileSync(path.join(realDir, file));
    const simulated = fs.readFileSync(path.join(simulatedDir, file));
    if (file === 'package.json') {
      const restored = setVersion(simulated.toString('utf8'), to, from);
      assert(Buffer.from(restored, 'utf8').equals(real), 'package.json differs beyond its version');
    } else {
      assert(real.equals(simulated), `${file} is not byte-identical in the simulated tarball`);
    }
  }
  return realFiles;
}

function pack(npm, cwd, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const output = expectSuccess(
    npm(['pack', '--json', '--ignore-scripts', '--pack-destination', destination], { cwd }),
    'npm pack'
  );
  const [info] = JSON.parse(output);
  const tarball = path.join(destination, info.filename);
  assert(fs.existsSync(tarball), `npm pack did not write ${tarball}`);
  return { tarball, info };
}

function extract(runner, tarball, destination) {
  fs.mkdirSync(destination, { recursive: true });
  expectSuccess(runner('tar', ['-xzf', tarball, '-C', destination]), 'tar');
  return path.join(destination, 'package');
}

function dryRun(npm, tarball, tag, log, label) {
  const show = result => {
    for (const line of `${result.stdout}${result.stderr}`.trimEnd().split('\n')) {
      log(`  ${label} ${line}`);
    }
  };
  let result = npm(publishDryRunArgs(tarball, tag), { cwd: path.dirname(tarball) });
  show(result);
  if (result.status !== 0 && PROVENANCE_ERROR.test(`${result.stdout}${result.stderr}`)) {
    log(`${label} the dry run failed for provenance credentials (recorded above); retrying the`);
    log(`${label} dry run only with --provenance=false. publishConfig.provenance is unchanged.`);
    result = npm(publishDryRunArgs(tarball, tag, { provenance: false }), {
      cwd: path.dirname(tarball),
    });
    show(result);
  }
  expectSuccess(result, `${label} npm publish --dry-run`);
}

export function rehearse({
  dir = root,
  workDir,
  runner = spawnRunner,
  log = console.log,
  toolchain,
} = {}) {
  const npm = makeNpm(runner);
  const tools = toolchain ?? {
    node: process.version,
    npm: expectSuccess(npm(['--version'], { cwd: dir }), 'npm --version').trim(),
  };
  const state = readReleaseState(dir);
  const published = fetchPublishedVersions(npm);
  // Validation comes first: nothing is built, packed or dry-run if it fails.
  const release = checkRelease({ ...state, published, mode: 'rehearsal', toolchain: tools });
  log(`▶ release check: ${release.version} is ${release.kind} (${release.reason})`);
  log(`  Node ${tools.node}, npm ${tools.npm}; published: [${published.join(', ')}]`);

  log('▶ build');
  expectSuccess(npm(['run', 'build'], { cwd: dir }), 'npm run build');

  log('▶ pack');
  const { tarball, info } = pack(npm, dir, path.join(workDir, 'real'));
  const contents = compareFileList(info.files.map(file => file.path));
  assert(
    contents.unexpected.length === 0 && contents.missing.length === 0,
    `tarball contents differ: unexpected [${contents.unexpected.join(', ')}], missing [${contents.missing.join(', ')}]`
  );
  assert(contents.nonEsm.length === 0, `non-ESM files: ${contents.nonEsm.join(', ')}`);
  const realDir = extract(runner, tarball, path.join(workDir, 'real-x'));
  assert(
    listFiles(realDir).join('\n') === contents.files.join('\n'),
    'the extracted tarball does not match npm pack --json'
  );
  log(`  ${info.filename}: exactly the ${contents.files.length} expected files`);

  if (release.releasable) {
    log(`▶ REAL dry run: ${release.version} on dist-tag ${release.distTag}`);
    dryRun(npm, tarball, release.distTag, log, '[real]');
    return { release, simulated: false, files: contents.files };
  }

  assert(!published.includes(SIMULATED_VERSION), `${SIMULATED_VERSION} exists on npm`);
  log(`▶ SIMULATED dry run: ${release.version} is parked, so a disposable copy of the tarball`);
  log(`  is rehearsed as ${SIMULATED_VERSION} on dist-tag ${SIMULATED_TAG}. Not a real candidate.`);
  const simulatedPackage = extract(runner, tarball, path.join(workDir, 'simulated-x'));
  const manifest = path.join(simulatedPackage, 'package.json');
  fs.writeFileSync(
    manifest,
    setVersion(fs.readFileSync(manifest, 'utf8'), release.version, SIMULATED_VERSION)
  );
  const simulated = pack(npm, simulatedPackage, path.join(workDir, 'simulated'));
  const simulatedDir = extract(runner, simulated.tarball, path.join(workDir, 'simulated-check'));
  const files = compareExtracted(realDir, simulatedDir, {
    from: release.version,
    to: SIMULATED_VERSION,
  });
  log(`  ${simulated.info.filename}: ${files.length} files byte-identical except the version`);
  assert(readJson(path.join(dir, 'package.json')).version === release.version, 'version changed');
  dryRun(npm, simulated.tarball, SIMULATED_TAG, log, '[SIMULATED]');
  return { release, simulated: true, files };
}

// ---------------------------------------------------------------------------------------------
// The workflow's structure

// The ruleset's required checks on v2 (V2_PLAN.md; ruleset 24353657).
export const REQUIRED_CHECKS = Object.freeze([
  'quality',
  'test',
  'build-package',
  'demo',
  'browser',
  'size',
]);
export const WORKFLOW_NAME = 'Release rehearsal';
export const REHEARSAL_BRANCHES = Object.freeze(['main', 'v2']);
export const JOB_ID = 'rehearsal';
export const JOB_NAME = 'release rehearsal';
export const RUN_COMMANDS = Object.freeze([
  'npm ci --ignore-scripts --no-audit --no-fund',
  'node --test scripts/release-check.test.js',
  'node scripts/release-check.js rehearse',
]);
const ACTIONS = {
  'actions/checkout': { 'persist-credentials': [false] },
  'actions/setup-node': {
    'node-version': ['${{ env.NODE_VERSION }}'],
    cache: ['npm'],
    'cache-dependency-path': ['package-lock.json'],
  },
};
const EXPRESSIONS = new Set([
  '${{ env.NODE_VERSION }}',
  '${{ github.workflow }}',
  '${{ github.ref }}',
  "${{ github.event_name == 'pull_request' }}",
]);
const FORBIDDEN_TEXT = [
  /id-token/i,
  /secrets/i,
  /token/i,
  /registry-url/i,
  /npmrc/i,
  /environment/i,
  /\brelease\s+create\b|gh-release|create-release/i,
];

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function keysOutside(value, allowed) {
  return value && typeof value === 'object'
    ? Object.keys(value).filter(k => !allowed.includes(k))
    : [];
}

function walk(value, visitString) {
  if (typeof value === 'string') visitString(value);
  else if (Array.isArray(value)) value.forEach(item => walk(item, visitString));
  else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      visitString(key);
      walk(nested, visitString);
    }
  }
}

function jobLabels(source) {
  const doc = parseDocument(source);
  const workflow = doc.toJS() ?? {};
  const labels = new Set(typeof workflow.name === 'string' ? [`workflow:${workflow.name}`] : []);
  for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
    labels.add(id);
    if (typeof job?.name === 'string') {
      labels.add(job.name);
      labels.add(job.name.replace(/\s*\$\{\{.*$/, '').trim());
    }
  }
  return labels;
}

// Returns the ways in which `source` (release.yml) departs from the rehearsal-only design; empty
// when it conforms. `others` are the repository's other workflow files, for name shadowing.
export function checkWorkflow(source, others = []) {
  const problems = [];
  const fail = message => problems.push(message);
  const doc = parseDocument(source, { uniqueKeys: true, merge: false });
  for (const error of [...doc.errors, ...doc.warnings]) fail(`YAML: ${error.message}`);
  visit(doc, {
    Node(_, node) {
      if (isAlias(node) || node.anchor) fail('YAML anchors and aliases are not allowed');
      if (node.tag && !node.tag.startsWith('tag:yaml.org,2002:')) fail(`YAML tag ${node.tag}`);
    },
    Pair(_, pair) {
      if (isScalar(pair.key) && pair.key.value === '<<') fail('YAML merge keys are not allowed');
    },
  });
  if (problems.length) return problems;
  const workflow = doc.toJS();
  if (!workflow || typeof workflow !== 'object') return ['the workflow is not a mapping'];

  for (const key of keysOutside(workflow, [
    'name',
    'on',
    'permissions',
    'concurrency',
    'env',
    'jobs',
  ]))
    fail(`top-level key ${key}`);
  if (workflow.name !== WORKFLOW_NAME) fail(`workflow name ${JSON.stringify(workflow.name)}`);
  if (!sameJson(workflow.env, { NODE_VERSION: '24' }))
    fail('top-level env must be NODE_VERSION only');
  if (!sameJson(workflow.permissions, {})) fail('top-level permissions must be {}');
  if (
    !sameJson(workflow.concurrency, {
      group: '${{ github.workflow }}-${{ github.ref }}',
      'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
    })
  )
    fail('unexpected concurrency');

  // Triggers: a PR into main or v2, a push to main or v2 and a manual dispatch, all without
  // filters or inputs. Both branches, so the rehearsal runs across the integration (P-29 S2).
  const on = workflow.on;
  if (!on || typeof on !== 'object' || Array.isArray(on)) fail('`on` must be a mapping');
  else {
    if (!sameJson(Object.keys(on).sort(), ['pull_request', 'push', 'workflow_dispatch']))
      fail(`triggers ${Object.keys(on).join(', ')}`);
    if (!sameJson(on.pull_request, { branches: REHEARSAL_BRANCHES }))
      fail('pull_request must target main and v2 only');
    if (!sameJson(on.push, { branches: REHEARSAL_BRANCHES }))
      fail('push must be on main and v2 only');
    if (on.workflow_dispatch !== null && !sameJson(on.workflow_dispatch, {}))
      fail('workflow_dispatch must have no inputs');
  }

  const jobs = workflow.jobs;
  if (!jobs || typeof jobs !== 'object' || !sameJson(Object.keys(jobs), [JOB_ID])) {
    fail(`the only job must be ${JOB_ID}`);
  }
  const shadowed = new Set(REQUIRED_CHECKS);
  for (const other of others) for (const label of jobLabels(other.source)) shadowed.add(label);
  if (shadowed.has(`workflow:${workflow.name}`)) fail(`workflow name ${workflow.name} is taken`);

  for (const [id, job] of Object.entries(jobs ?? {})) {
    if (!job || typeof job !== 'object') {
      fail(`job ${id} is not a mapping`);
      continue;
    }
    for (const key of keysOutside(job, [
      'name',
      'runs-on',
      'timeout-minutes',
      'permissions',
      'steps',
    ]))
      fail(`job ${id} has key ${key}`);
    if (shadowed.has(id)) fail(`job id ${id} shadows a check name`);
    if (job.name !== JOB_NAME || shadowed.has(job.name))
      fail(`job name ${JSON.stringify(job.name)}`);
    if (!sameJson(job.permissions, { contents: 'read' }))
      fail(`job ${id} permissions must be exactly contents: read`);
    if (typeof job['runs-on'] !== 'string' || !/^ubuntu-\d+\.\d+$/.test(job['runs-on']))
      fail(`job ${id} runs-on must be a pinned GitHub-hosted Ubuntu image`);
    const steps = Array.isArray(job.steps) ? job.steps : [];
    if (!Array.isArray(job.steps)) fail(`job ${id} has no steps list`);
    const runs = [];
    for (const [index, stepValue] of steps.entries()) {
      const where = `job ${id} step ${index + 1}`;
      if (!stepValue || typeof stepValue !== 'object') {
        fail(`${where} is not a mapping`);
        continue;
      }
      for (const key of keysOutside(stepValue, ['name', 'uses', 'with', 'run']))
        fail(`${where} has key ${key}`);
      if ('uses' in stepValue === 'run' in stepValue)
        fail(`${where} needs exactly one of uses/run`);
      if ('run' in stepValue) {
        if ('with' in stepValue) fail(`${where} has with on a run step`);
        runs.push(stepValue.run);
      }
      if ('uses' in stepValue) {
        const match = /^([\w.-]+\/[\w.-]+)@([0-9a-f]{40})$/.exec(String(stepValue.uses));
        const allowed = match && ACTIONS[match[1]];
        if (!allowed) {
          fail(`${where} uses ${stepValue.uses}: not an allowed, SHA-pinned action`);
          continue;
        }
        for (const [key, value] of Object.entries(stepValue.with ?? {})) {
          if (!allowed[key]?.includes(value)) fail(`${where} with.${key}=${JSON.stringify(value)}`);
        }
      }
    }
    if (!sameJson(runs, RUN_COMMANDS)) fail(`job ${id} run commands differ from the allowlist`);
  }

  walk(workflow, text => {
    for (const expression of text.match(/\$\{\{[\s\S]*?\}\}/g) ?? []) {
      if (!EXPRESSIONS.has(expression)) fail(`expression ${expression}`);
    }
    for (const pattern of FORBIDDEN_TEXT) {
      if (pattern.test(text)) fail(`forbidden text ${pattern} in ${JSON.stringify(text)}`);
    }
    if (/\bpublish\b/.test(text)) fail(`"publish" in ${JSON.stringify(text)}`);
  });
  return problems;
}

export function readWorkflows(dir = root) {
  const workflowDir = path.join(dir, '.github', 'workflows');
  const files = fs.readdirSync(workflowDir).filter(file => /\.ya?ml$/.test(file));
  const read = file => ({ file, source: fs.readFileSync(path.join(workflowDir, file), 'utf8') });
  return {
    release: read('release.yml'),
    others: files.filter(file => file !== 'release.yml').map(read),
  };
}

// ---------------------------------------------------------------------------------------------
// CLI

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (const arg of rest) {
    const match = /^--(mode|tag)=(.*)$/.exec(arg);
    assert(match, `unknown argument ${arg}`);
    options[match[1]] = match[2];
  }
  return options;
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.command === 'check') {
    const npm = makeNpm(spawnRunner);
    const release = checkRelease({
      ...readReleaseState(),
      published: fetchPublishedVersions(npm),
      mode: options.mode ?? 'rehearsal',
      tag: options.tag,
      toolchain: {
        node: process.version,
        npm: expectSuccess(npm(['--version'], { cwd: root }), 'npm --version').trim(),
      },
    });
    console.log(JSON.stringify(release, null, 2));
  } else if (options.command === 'rehearse') {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-release-'));
    try {
      const result = rehearse({ workDir });
      console.log(
        `\n✓ release rehearsal passed (${result.simulated ? 'SIMULATED' : 'real'} dry run); nothing was published`
      );
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  } else {
    throw new ReleaseCheckError('usage: release-check.js check [--mode=…] [--tag=…] | rehearse');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`\n✗ ${error instanceof ReleaseCheckError ? error.message : error.stack}`);
    process.exit(1);
  }
}
