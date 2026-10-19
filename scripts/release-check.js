// The release checks and the non-publishing release rehearsal (§29, P-28 S3, design B1). Run by
// .github/workflows/release.yml, which never publishes during P-28; P-29 owns the live publish job.
//
//   node scripts/release-check.js check [--mode=rehearsal|publish] [--tag=<dist-tag>]
//   node scripts/release-check.js rehearse
//   node scripts/release-check.js pack --tag=<dist-tag> --out=<dir>
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
import {
  checkTarball,
  defaults as guardDefaults,
  integrityOf,
  readTarball,
  tarballName,
} from './publish-guard.js';
import { PACKAGE_NAME, ReleaseCheckError, assert, checkRelease } from './release-policy.js';

export {
  PACKAGE_NAME,
  PARKED_VERSIONS,
  MINIMUM_NODE,
  MINIMUM_NPM,
  NEXT_VERSION,
  STABLE_VERSION,
  DIST_TAGS,
  ReleaseCheckError,
  atLeast,
  checkToolchain,
  checkManifest,
  checkLockfile,
  checkPreState,
  classifyVersion,
  checkDistTag,
  checkRelease,
} from './release-policy.js';

// The stand-in version for a parked version's rehearsal. It is a pre-release, so it is dry-run on
// `next`, and checkRelease() rejects it as unsupported, so it can never pass as a real candidate.
export const SIMULATED_VERSION = '2.0.0-rehearsal.0';
export const SIMULATED_TAG = 'next';

const PROVENANCE_ERROR = /provenance|id-token|oidc/i;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------------------------
// Release state

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

// The publish workflow's `package` job (P-29 S7b-2): validates in publish mode, builds once,
// packs once into `outDir`, checks the exact files and the tarball's own name and version, runs the
// real `npm publish --dry-run` and returns the tarball's sha512 integrity. A parked or published
// version stops it before anything is built. It runs without id-token, so it cannot publish.
export function packForPublish({
  dir = root,
  outDir,
  tag,
  runner = spawnRunner,
  log = console.log,
  toolchain,
} = {}) {
  const npm = makeNpm(runner);
  const tools = toolchain ?? {
    node: process.version,
    npm: expectSuccess(npm(['--version'], { cwd: dir }), 'npm --version').trim(),
  };
  assert(tag !== undefined, 'pack needs --tag');
  assert(outDir && !fs.existsSync(outDir), `the output directory ${outDir} must not exist yet`);
  const state = readReleaseState(dir);
  const published = fetchPublishedVersions(npm);
  const release = checkRelease({ ...state, published, mode: 'publish', tag, toolchain: tools });
  log(`▶ release check: ${release.version} on ${release.distTag}`);

  log('▶ build');
  expectSuccess(npm(['run', 'build'], { cwd: dir }), 'npm run build');

  log('▶ pack');
  const { tarball, info } = pack(npm, dir, outDir);
  assert(
    info.filename === tarballName(release.version) &&
      fs.readdirSync(outDir).join() === info.filename,
    `expected only ${tarballName(release.version)} in ${outDir}`
  );
  const contents = compareFileList(info.files.map(file => file.path));
  assert(
    contents.unexpected.length === 0 && contents.missing.length === 0,
    `tarball contents differ: unexpected [${contents.unexpected.join(', ')}], missing [${contents.missing.join(', ')}]`
  );
  const buffer = fs.readFileSync(tarball);
  checkTarball(readTarball(buffer), { name: PACKAGE_NAME, version: release.version });
  const integrity = integrityOf(buffer);
  assert(
    info.integrity === integrity,
    `npm pack reported ${info.integrity}, the file is ${integrity}`
  );
  log(`  ${info.filename}: exactly the ${contents.files.length} expected files, ${integrity}`);

  log(`▶ REAL dry run: ${release.version} on dist-tag ${release.distTag}`);
  dryRun(npm, tarball, release.distTag, log, '[real]');
  return { tarball, filename: info.filename, integrity, release };
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

// Parses a workflow strictly: no duplicate keys, anchors, aliases, merge keys or custom tags.
// Returns the parsed mapping, or the problems that stopped it.
function parseStrict(source) {
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
  if (problems.length) return { problems };
  const workflow = doc.toJS();
  if (!workflow || typeof workflow !== 'object')
    return { problems: ['the workflow is not a mapping'] };
  return { workflow, problems };
}

// Returns the ways in which `source` (release.yml) departs from the rehearsal-only design; empty
// when it conforms. `others` are the repository's other workflow files, for name shadowing.
export function checkWorkflow(source, others = []) {
  const parsed = parseStrict(source);
  if (parsed.problems.length) return parsed.problems;
  const { workflow, problems } = parsed;
  const fail = message => problems.push(message);

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
// CI as the publication gate (P-29 S7b-1)
//
// ci.yml is reusable through `workflow_call`, so the publish workflow can run the full gate on the
// commit it publishes, in its own run (§29, item 2). checkCiWorkflow() keeps what the main ruleset
// and that gate rely on: the triggers, the read-only permissions, the concurrency, the jobs and
// their dependencies, the six required check names and the fail-closed `test` aggregator. It does
// not pin actions or commands, which Dependabot and later phases change.

export const CI_WORKFLOW_NAME = 'CI';
export const CI_BRANCHES = Object.freeze(['main', 'v2']);
export const CI_CONCURRENCY = Object.freeze({
  group: '${{ github.workflow }}-${{ github.ref }}',
  'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
});
// Each job and the jobs it needs; only `test` needs another.
export const CI_JOBS = Object.freeze({
  quality: [],
  'test-react': [],
  test: ['test-react'],
  'build-package': [],
  size: [],
  browser: [],
  demo: [],
});
const CI_AGGREGATOR_STEPS = [
  {
    env: { RESULT: '${{ needs.test-react.result }}' },
    run: 'echo "test-react: $RESULT"\n[ "$RESULT" = success ]\n',
  },
];

function emptyTrigger(value) {
  return value === null || sameJson(value, {});
}

function needsList(needs) {
  if (needs === undefined) return [];
  return typeof needs === 'string' ? [needs] : needs;
}

// Returns the ways in which `source` (ci.yml) departs from the gate it must stay; empty when it
// conforms.
export function checkCiWorkflow(source) {
  const parsed = parseStrict(source);
  if (parsed.problems.length) return parsed.problems;
  const { workflow, problems } = parsed;
  const fail = message => problems.push(message);

  if (workflow.name !== CI_WORKFLOW_NAME) fail(`workflow name ${JSON.stringify(workflow.name)}`);
  if (!sameJson(workflow.permissions, { contents: 'read' }))
    fail('top-level permissions must be exactly contents: read');
  if (!sameJson(workflow.concurrency, CI_CONCURRENCY)) fail('unexpected concurrency');

  // Triggers: a push to and a PR into main or v2, a manual dispatch and a call from another
  // workflow, without filters, inputs, outputs or secrets.
  const on = workflow.on;
  if (!on || typeof on !== 'object' || Array.isArray(on)) fail('`on` must be a mapping');
  else {
    const triggers = ['pull_request', 'push', 'workflow_call', 'workflow_dispatch'];
    if (!sameJson(Object.keys(on).sort(), triggers)) fail(`triggers ${Object.keys(on).join(', ')}`);
    if (!sameJson(on.push, { branches: CI_BRANCHES })) fail('push must be on main and v2 only');
    if (!sameJson(on.pull_request, { branches: CI_BRANCHES }))
      fail('pull_request must target main and v2 only');
    if ('workflow_dispatch' in on && !emptyTrigger(on.workflow_dispatch))
      fail('workflow_dispatch must have no inputs');
    if ('workflow_call' in on && !emptyTrigger(on.workflow_call))
      fail('workflow_call must have no inputs, outputs or secrets');
  }

  const jobs = workflow.jobs && typeof workflow.jobs === 'object' ? workflow.jobs : {};
  if (!sameJson(Object.keys(jobs).sort(), Object.keys(CI_JOBS).sort()))
    fail(`jobs ${Object.keys(jobs).join(', ')}`);
  for (const [id, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object') {
      fail(`job ${id} is not a mapping`);
      continue;
    }
    for (const key of ['permissions', 'uses', 'secrets', 'environment', 'continue-on-error'])
      if (key in job) fail(`job ${id} has ${key}`);
    if (CI_JOBS[id] && !sameJson(needsList(job.needs), CI_JOBS[id]))
      fail(`job ${id} needs ${JSON.stringify(job.needs ?? [])}`);
    // A skipped job reports success to a required check, so only the aggregator may have an `if`.
    if ('if' in job && id !== 'test') fail(`job ${id} has a job-level if`);
    for (const [index, step] of (Array.isArray(job.steps) ? job.steps : []).entries())
      if (step && typeof step === 'object' && 'continue-on-error' in step)
        fail(`job ${id} step ${index + 1} has continue-on-error`);
  }

  // The six required checks: each is the name of exactly one job, the job of the same id.
  for (const check of REQUIRED_CHECKS) {
    const named = Object.entries(jobs).filter(([id, job]) => (job?.name ?? id) === check);
    if (named.length !== 1 || named[0][0] !== check)
      fail(`required check ${check} must be the name of job ${check} only`);
  }

  // The `test` check fails closed: it always runs and passes only when every matrix leg passed.
  const test = jobs.test;
  if (test && typeof test === 'object') {
    if (test.if !== '${{ always() }}') fail('the test aggregator must run with if: always()');
    if (!sameJson(test.steps, CI_AGGREGATOR_STEPS)) fail('the test aggregator steps changed');
  }

  walk(workflow, text => {
    if (/id-token|secrets\./i.test(text)) fail(`forbidden text in ${JSON.stringify(text)}`);
  });
  return problems;
}

// Returns the workflows that call ci.yml and would share its concurrency group: a called workflow
// takes the caller's name in `github.workflow`, so a caller whose own group, or whose calling job's
// group, is ci.yml's group expression waits on itself.
export function checkCiCallers(workflows) {
  const problems = [];
  for (const { file, source } of workflows) {
    const { workflow } = parseStrict(source);
    if (!workflow) continue;
    for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
      if (!/(^|\/)\.github\/workflows\/ci\.ya?ml(@|$)/.test(String(job?.uses ?? ''))) continue;
      for (const concurrency of [workflow.concurrency, job.concurrency]) {
        const group = typeof concurrency === 'string' ? concurrency : concurrency?.group;
        if (group === CI_CONCURRENCY.group)
          problems.push(`${file} job ${id} calls ci.yml in its own concurrency group`);
      }
    }
  }
  return problems;
}

// The Changesets configuration, exactly: `baseBranch` is main, the canonical branch since the
// integration (P-29 S5), and every other setting is as P-28 S2 set it.
export const CHANGESET_CONFIG = Object.freeze({
  $schema: 'https://unpkg.com/@changesets/config@4.0.1/schema.json',
  changelog: '@changesets/cli/changelog',
  commit: false,
  format: 'prettier',
  fixed: [],
  linked: [],
  access: 'public',
  baseBranch: 'main',
  updateInternalDependencies: 'patch',
  ignore: [],
});

export function checkChangesetConfig(config) {
  const problems = [];
  const keys = Object.keys(config ?? {});
  for (const key of keys.filter(k => !(k in CHANGESET_CONFIG))) problems.push(`extra key ${key}`);
  for (const [key, value] of Object.entries(CHANGESET_CONFIG))
    if (!sameJson(config?.[key], value))
      problems.push(
        `${key} must be ${JSON.stringify(value)}, not ${JSON.stringify(config?.[key])}`
      );
  return problems;
}

export function readChangesetConfig(dir = root) {
  return readJson(path.join(dir, '.changeset', 'config.json'));
}

// ---------------------------------------------------------------------------------------------
// publish.yml (P-29 S7b-2)
//
// checkPublishWorkflow() names each security invariant of the publish workflow, then compares every
// job and step with the approved ones below, so anything else, however it is written, fails. Actions
// are matched by name with any pinned commit, so Dependabot can move a pin.

export const PUBLISH_WORKFLOW_NAME = 'Publish';
export const PUBLISH_CONCURRENCY = Object.freeze({
  group: 'npm-publish',
  'cancel-in-progress': false,
});
export const PUBLISH_JOBS = Object.freeze({
  preflight: [],
  ci: ['preflight'],
  package: ['preflight', 'ci'],
  publish: ['preflight', 'ci', 'package'],
  verify: ['preflight', 'package', 'publish'],
});
export const PUBLISH_PERMISSIONS = Object.freeze({
  preflight: { contents: 'read' },
  ci: { contents: 'read' },
  package: { contents: 'read' },
  publish: { contents: 'read', 'id-token': 'write' },
  verify: { contents: 'read' },
});
export const LIVE_PUBLISH_COMMAND =
  'npm publish "$TARBALL" --tag "$DIST_TAG" --ignore-scripts --access public --provenance';
const MODE_IS_PUBLISH = "inputs.mode == 'publish'";
const PUBLISH_IFS = {
  preflight: "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'",
  verify: MODE_IS_PUBLISH,
};
const PUBLISH_INPUTS = {
  mode: {
    description:
      'dry-run: every gate and a dry run, nothing published. publish: publish after approval.',
    type: 'choice',
    options: ['dry-run', 'publish'],
    default: 'dry-run',
    required: true,
  },
  version: {
    description: 'The version in package.json, typed exactly to confirm it.',
    type: 'string',
    required: true,
  },
};
const PUBLISH_OUTPUTS = {
  preflight: {
    'dist-tag': '${{ steps.guard.outputs.dist-tag }}',
    'previous-latest': '${{ steps.guard.outputs.previous-latest }}',
  },
  package: { integrity: '${{ steps.pack.outputs.integrity }}' },
};
const PUBLISH_ACTIONS = {
  preflight: ['actions/checkout', 'actions/setup-node'],
  package: ['actions/checkout', 'actions/setup-node', 'actions/upload-artifact'],
  publish: ['actions/checkout', 'actions/setup-node', 'actions/download-artifact'],
  verify: ['actions/checkout', 'actions/setup-node'],
};
const CHECKOUT = { uses: 'actions/checkout', with: { 'persist-credentials': false } };
const SETUP_NODE = {
  uses: 'actions/setup-node',
  with: { 'node-version': '${{ env.NODE_VERSION }}', 'package-manager-cache': false },
};
const NPM_CI = { run: 'npm ci --ignore-scripts --no-audit --no-fund' };
// The approved steps of each job.
const PUBLISH_STEPS = {
  preflight: [
    CHECKOUT,
    SETUP_NODE,
    {
      id: 'guard',
      env: { MODE: '${{ inputs.mode }}', VERSION: '${{ inputs.version }}' },
      run: 'node scripts/publish-guard.js preflight',
    },
    NPM_CI,
    { run: 'node --test scripts/release-check.test.js' },
    {
      env: { DIST_TAG: '${{ steps.guard.outputs.dist-tag }}' },
      run: 'node scripts/release-check.js check --mode=publish --tag="$DIST_TAG"',
    },
  ],
  package: [
    CHECKOUT,
    SETUP_NODE,
    NPM_CI,
    {
      id: 'pack',
      env: { DIST_TAG: '${{ needs.preflight.outputs.dist-tag }}' },
      run: 'node scripts/release-check.js pack --tag="$DIST_TAG" --out=publish-tarball',
    },
    {
      uses: 'actions/upload-artifact',
      with: {
        name: 'npm-tarball',
        path: 'publish-tarball/',
        'if-no-files-found': 'error',
        'retention-days': 7,
      },
    },
  ],
  publish: [
    CHECKOUT,
    {
      uses: 'actions/setup-node',
      with: {
        'node-version': '${{ env.NODE_VERSION }}',
        'registry-url': 'https://registry.npmjs.org',
        'package-manager-cache': false,
      },
    },
    {
      uses: 'actions/download-artifact',
      with: { name: 'npm-tarball', path: 'publish-tarball', 'digest-mismatch': 'error' },
    },
    {
      id: 'artifact',
      env: {
        VERSION: '${{ inputs.version }}',
        EXPECTED_INTEGRITY: '${{ needs.package.outputs.integrity }}',
      },
      run: 'node scripts/publish-guard.js artifact',
    },
    {
      id: 'final',
      env: {
        MODE: '${{ inputs.mode }}',
        VERSION: '${{ inputs.version }}',
        EXPECTED_DIST_TAG: '${{ needs.preflight.outputs.dist-tag }}',
      },
      run: 'node scripts/publish-guard.js final',
    },
    {
      if: "inputs.mode == 'dry-run'",
      env: {
        MODE: '${{ inputs.mode }}',
        TARBALL: '${{ steps.artifact.outputs.tarball }}',
        DIST_TAG: '${{ steps.final.outputs.dist-tag }}',
      },
      run: 'node scripts/publish-guard.js dry-run',
    },
    {
      if: MODE_IS_PUBLISH,
      env: {
        TARBALL: '${{ steps.artifact.outputs.tarball }}',
        DIST_TAG: '${{ steps.final.outputs.dist-tag }}',
      },
      run: LIVE_PUBLISH_COMMAND,
    },
  ],
  verify: [
    CHECKOUT,
    SETUP_NODE,
    {
      env: {
        VERSION: '${{ inputs.version }}',
        DIST_TAG: '${{ needs.preflight.outputs.dist-tag }}',
        EXPECTED_INTEGRITY: '${{ needs.package.outputs.integrity }}',
        PREVIOUS_LATEST: '${{ needs.preflight.outputs.previous-latest }}',
      },
      run: 'node scripts/publish-guard.js verify',
    },
  ],
};
const PUBLISH_FORBIDDEN_TEXT = [
  [/secrets\./i, 'a secret'],
  [/NPM_TOKEN|NODE_AUTH_TOKEN|_authToken|github\.token/i, 'a token'],
  [/pull_request_target/i, 'pull_request_target'],
  [/\bgh\s+release\b|create-release|gh-release/i, 'a GitHub release'],
  [/\bgit\s+(tag|push)\b/i, 'a Git tag or push'],
  [/changeset/i, 'Changesets'],
  [/\bnpm\s+(version|dist-tag|unpublish|deprecate|stage)\b/i, 'an npm version or tag mutation'],
  [/\b(always|failure|cancelled)\s*\(/i, 'a status function'],
  [/self-hosted/i, 'a self-hosted runner'],
];

// The published workflow's labels, without the action pins: `owner/name@SHA` becomes `owner/name`.
function unpinned(step, where, fail) {
  if (!step || typeof step !== 'object' || !('uses' in step)) return step;
  const match = /^([\w.-]+\/[\w.-]+)@([0-9a-f]{40})$/.exec(String(step.uses));
  if (!match) {
    fail(`${where} uses ${step.uses}: not a SHA-pinned action`);
    return step;
  }
  return { ...step, uses: match[1] };
}

// Returns the ways in which `source` (publish.yml) departs from the approved workflow; empty when
// it conforms. `others` are the repository's other workflow files, for name shadowing.
export function checkPublishWorkflow(source, others = []) {
  const parsed = parseStrict(source);
  if (parsed.problems.length) return parsed.problems;
  const { workflow, problems } = parsed;
  const fail = message => problems.push(message);

  for (const key of keysOutside(workflow, [
    'name',
    'on',
    'permissions',
    'concurrency',
    'env',
    'jobs',
  ]))
    fail(`top-level key ${key}`);
  if (workflow.name !== PUBLISH_WORKFLOW_NAME)
    fail(`workflow name ${JSON.stringify(workflow.name)}`);
  if (!sameJson(workflow.env, { NODE_VERSION: '24' }))
    fail('top-level env must be NODE_VERSION only');
  if (!sameJson(workflow.permissions, {})) fail('top-level permissions must be {}');
  if (!sameJson(workflow.concurrency, PUBLISH_CONCURRENCY))
    fail('concurrency must be the fixed group npm-publish, never cancelled');
  for (const problem of checkCiCallers([{ file: 'publish.yml', source }])) fail(problem);

  // Triggers: a manual dispatch only, with exactly the two inputs.
  const on = workflow.on;
  if (
    !on ||
    typeof on !== 'object' ||
    Array.isArray(on) ||
    !sameJson(Object.keys(on), ['workflow_dispatch'])
  )
    fail('workflow_dispatch must be the only trigger');
  else if (!sameJson(on.workflow_dispatch, { inputs: PUBLISH_INPUTS }))
    fail('workflow_dispatch inputs must be exactly mode and version');

  const jobs = workflow.jobs && typeof workflow.jobs === 'object' ? workflow.jobs : {};
  if (!sameJson(Object.keys(jobs), Object.keys(PUBLISH_JOBS)))
    fail(`jobs must be exactly ${Object.keys(PUBLISH_JOBS).join(', ')}`);
  const shadowed = new Set(REQUIRED_CHECKS);
  for (const other of others) for (const label of jobLabels(other.source)) shadowed.add(label);
  if (shadowed.has(`workflow:${workflow.name}`)) fail(`workflow name ${workflow.name} is taken`);

  for (const [id, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object') {
      fail(`job ${id} is not a mapping`);
      continue;
    }
    if (shadowed.has(id) || ('name' in job && shadowed.has(job.name)))
      fail(`job ${id} shadows a check name`);
    if (PUBLISH_JOBS[id] && !sameJson(needsList(job.needs), PUBLISH_JOBS[id]))
      fail(`job ${id} needs ${JSON.stringify(job.needs ?? [])}`);
    if (!sameJson(job.permissions, PUBLISH_PERMISSIONS[id] ?? null))
      fail(`job ${id} permissions ${JSON.stringify(job.permissions)}`);
    if ('environment' in job && (id !== 'publish' || job.environment !== 'npm-publish'))
      fail(`job ${id} environment ${JSON.stringify(job.environment)}: only publish, npm-publish`);
    if (id === 'publish' && job.environment !== 'npm-publish')
      fail('job publish must run in the npm-publish environment');
    if ((job.if ?? null) !== (PUBLISH_IFS[id] ?? null))
      fail(`job ${id} if ${JSON.stringify(job.if)}`);
    if ('continue-on-error' in job) fail(`job ${id} has continue-on-error`);

    if (id === 'ci') {
      if (
        !sameJson(job, {
          needs: 'preflight',
          permissions: PUBLISH_PERMISSIONS.ci,
          uses: './.github/workflows/ci.yml',
        })
      )
        fail('job ci must only call ./.github/workflows/ci.yml, with contents: read');
      continue;
    }
    const allowed = [
      'needs',
      'if',
      'runs-on',
      'timeout-minutes',
      'permissions',
      'outputs',
      'steps',
    ];
    if (id === 'publish') allowed.push('environment');
    for (const key of keysOutside(job, allowed)) fail(`job ${id} has key ${key}`);
    if (typeof job['runs-on'] !== 'string' || !/^ubuntu-\d+\.\d+$/.test(job['runs-on']))
      fail(`job ${id} runs-on must be a pinned GitHub-hosted Ubuntu image`);
    if (!Number.isInteger(job['timeout-minutes']) || job['timeout-minutes'] > 30)
      fail(`job ${id} needs a timeout of at most 30 minutes`);
    if (!sameJson(job.outputs ?? null, PUBLISH_OUTPUTS[id] ?? null))
      fail(`job ${id} outputs ${JSON.stringify(job.outputs)}`);

    const steps = Array.isArray(job.steps) ? job.steps : [];
    const runs = steps.filter(step => step && typeof step === 'object' && 'run' in step);
    for (const [index, step] of steps.entries()) {
      const where = `job ${id} step ${index + 1}`;
      if (step && typeof step === 'object') {
        if ('continue-on-error' in step) fail(`${where} has continue-on-error`);
        if (typeof step.run === 'string' && step.run.includes('${{'))
          fail(`${where} interpolates an expression into the shell`);
        if ('uses' in step) {
          const name = String(step.uses).split('@')[0];
          if (!(PUBLISH_ACTIONS[id] ?? []).includes(name))
            fail(`${where} uses ${name}, which job ${id} may not use`);
          if (name === 'actions/setup-node') {
            if ('cache' in (step.with ?? {}) || step.with?.['package-manager-cache'] !== false)
              fail(`${where} must not cache`);
            if ('registry-url' in (step.with ?? {}) && id !== 'publish')
              fail(`${where} sets registry-url outside the publish job`);
          }
        }
      }
      if (typeof step?.run === 'string' && /\bnpm\s+publish\b/.test(step.run)) {
        const live = !/--dry-run\b/.test(step.run);
        if (live && (id !== 'publish' || step.run !== LIVE_PUBLISH_COMMAND))
          fail(`${where} runs a live npm publish outside the protected path`);
        if (live && (step.if !== MODE_IS_PUBLISH || index !== steps.length - 1))
          fail(`${where}: the live publish must be the last step, only if ${MODE_IS_PUBLISH}`);
      }
    }
    if (
      id === 'publish' &&
      runs.some(step => /\bnpm\s+(ci|install|i|run|exec)\b|\bnpx\b/.test(step.run))
    )
      fail('job publish installs dependencies or runs repository scripts');
    if (
      !sameJson(
        steps.map((step, index) => unpinned(step, `job ${id} step ${index + 1}`, fail)),
        PUBLISH_STEPS[id] ?? null
      )
    )
      fail(`job ${id} steps differ from the approved steps`);
  }

  walk(workflow, text => {
    for (const [pattern, label] of PUBLISH_FORBIDDEN_TEXT)
      if (pattern.test(text)) fail(`forbidden text (${label}) in ${JSON.stringify(text)}`);
  });
  return problems;
}

// ---------------------------------------------------------------------------------------------
// CLI

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (const arg of rest) {
    const match = /^--(mode|tag|out)=(.*)$/.exec(arg);
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
  } else if (options.command === 'pack') {
    const result = packForPublish({ outDir: path.resolve(options.out ?? ''), tag: options.tag });
    guardDefaults.output({ tarball: result.filename, integrity: result.integrity });
    console.log(`\n✓ packed and dry-run ${result.filename}; nothing was published`);
  } else {
    throw new ReleaseCheckError(
      'usage: release-check.js check [--mode=…] [--tag=…] | rehearse | pack --tag=… --out=…'
    );
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
