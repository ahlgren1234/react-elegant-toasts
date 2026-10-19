// The publish workflow's guards (P-29 S7b-2; .github/workflows/publish.yml). They import nothing
// but Node's own modules and the dependency-free release policy, so the privileged `publish` job runs
// them without installing the repository's dependencies.
//
//   node scripts/publish-guard.js preflight   the run, the inputs, main's head and the version
//   node scripts/publish-guard.js artifact    the downloaded tarball: digest, name, version, files
//   node scripts/publish-guard.js final       everything again, immediately before publishing
//   node scripts/publish-guard.js dry-run     `npm publish --dry-run` without any npm credential
//   node scripts/publish-guard.js verify      the published version on npm, after a publication
//
// Every value comes from the environment (the workflow passes inputs and outputs through `env`,
// never into the shell), and every command fails closed: it throws on the first problem, and a
// workflow step that fails stops the job. The live `npm publish` is not here: it is the workflow's
// last step, behind these guards and the npm-publish Environment.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { compareFileList } from './package-contents.js';
import {
  PACKAGE_NAME,
  ReleaseCheckError,
  assert,
  checkToolchain,
  classifyVersion,
} from './release-policy.js';

export const REPOSITORY = 'ahlgren1234/react-elegant-toasts';
export const REPOSITORY_URL = `https://github.com/${REPOSITORY}.git`;
export const MAIN_REF = 'refs/heads/main';
export const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/publish.yml@${MAIN_REF}`;
export const MODES = Object.freeze(['dry-run', 'publish']);
export const REGISTRY = 'https://registry.npmjs.org';

const SHA = /^[0-9a-f]{40}$/;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;
// Removed from the dry run's environment (matched lower-cased): the OIDC request variables, any
// token or auth setting, and the user .npmrc that setup-node's registry-url writes for a token.
const CREDENTIAL_ENV = /token|auth|^npm_config_userconfig$/;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------------------------
// Checks

// The run must be this repository's publish.yml, dispatched on main; `firstAttempt` refuses a
// re-run, which would reuse an approval given to an earlier attempt.
export function checkRunContext(env, { firstAttempt = true } = {}) {
  assert(
    env.GITHUB_REPOSITORY === REPOSITORY,
    `repository ${JSON.stringify(env.GITHUB_REPOSITORY)}`
  );
  assert(
    env.GITHUB_EVENT_NAME === 'workflow_dispatch',
    `event ${JSON.stringify(env.GITHUB_EVENT_NAME)}`
  );
  assert(env.GITHUB_REF === MAIN_REF, `ref ${JSON.stringify(env.GITHUB_REF)}: only ${MAIN_REF}`);
  assert(
    env.GITHUB_WORKFLOW_REF === WORKFLOW_REF,
    `workflow ${JSON.stringify(env.GITHUB_WORKFLOW_REF)}: only ${WORKFLOW_REF}`
  );
  assert(SHA.test(env.GITHUB_SHA ?? ''), `commit ${JSON.stringify(env.GITHUB_SHA)}`);
  if (firstAttempt)
    assert(
      env.GITHUB_RUN_ATTEMPT === '1',
      `run attempt ${JSON.stringify(env.GITHUB_RUN_ATTEMPT)}: dispatch a new run instead`
    );
  return env.GITHUB_SHA;
}

export function checkMode(mode) {
  assert(MODES.includes(mode), `mode ${JSON.stringify(mode)}: only ${MODES.join(' or ')}`);
  return mode;
}

// The typed confirmation: exactly the version in package.json, nothing around it.
export function checkVersionInput(input, version) {
  assert(
    typeof input === 'string' && input === version,
    `version ${JSON.stringify(input)} is not package.json's ${JSON.stringify(version)}`
  );
  return version;
}

export function parseLsRemote(output) {
  const lines = String(output).trim().split('\n').filter(Boolean);
  assert(lines.length === 1, `expected one line for ${MAIN_REF}, got ${lines.length}`);
  const [sha, ref] = lines[0].split('\t');
  assert(
    ref === MAIN_REF && SHA.test(sha),
    `unexpected ls-remote line ${JSON.stringify(lines[0])}`
  );
  return sha;
}

// The commit being published must still be main's head.
export function checkHead(sha, mainHead) {
  assert(SHA.test(mainHead ?? ''), `main's head ${JSON.stringify(mainHead)}`);
  assert(sha === mainHead, `${sha} is not main's head ${mainHead}: main moved, dispatch a new run`);
}

// The registry's versions, including unpublished ones (npm never reuses a version number).
export function knownVersions(packument) {
  if (packument === null) return [];
  return [
    ...new Set([
      ...Object.keys(packument.versions ?? {}),
      ...Object.keys(packument.time ?? {}).filter(k => k !== 'created' && k !== 'modified'),
    ]),
  ];
}

// The version must be releasable in publish mode (not parked, not on npm) and its dist-tag fixed.
export function planRelease({ version, preState, packument, expectedTag }) {
  const published = knownVersions(packument);
  const release = classifyVersion({ version, preState, published, mode: 'publish' });
  assert(!published.includes(version), `${version} is already on npm`);
  if (expectedTag !== undefined)
    assert(
      release.distTag === expectedTag,
      `dist-tag ${release.distTag}, but preflight chose ${JSON.stringify(expectedTag)}`
    );
  return { distTag: release.distTag, previousLatest: packument?.['dist-tags']?.latest ?? '' };
}

export function integrityOf(buffer) {
  return `sha512-${crypto.createHash('sha512').update(buffer).digest('base64')}`;
}

export function checkIntegrity(actual, expected) {
  assert(INTEGRITY.test(expected ?? ''), `expected integrity ${JSON.stringify(expected)}`);
  assert(actual === expected, `tarball integrity ${actual} is not the packed ${expected}`);
}

// Reads a gzipped tar (npm pack's format) into a map of path → contents. Only regular files under
// package/ are accepted: links, devices or a path outside package/ refuse the whole tarball.
export function readTarball(gzipped) {
  const tar = zlib.gunzipSync(gzipped);
  const files = new Map();
  let offset = 0;
  let paxPath = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const field = (start, length) =>
      header
        .subarray(start, start + length)
        .toString('utf8')
        .replace(/\0[\s\S]*$/, '');
    const size = Number.parseInt(field(124, 12).trim() || '0', 8);
    assert(Number.isSafeInteger(size) && size >= 0, 'tarball entry with an invalid size');
    const type = field(156, 1) || '0';
    const prefix = field(345, 155);
    let name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    const body = tar.subarray(offset + 512, offset + 512 + size);
    assert(body.length === size, 'truncated tarball');
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      const match = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'));
      paxPath = match ? match[1] : null;
      continue;
    }
    if (paxPath !== null) [name, paxPath] = [paxPath, null];
    assert(
      type === '0' || type === '5',
      `tarball entry ${JSON.stringify(name)} of type ${JSON.stringify(type)}`
    );
    assert(
      name.startsWith('package/') && !name.split('/').includes('..'),
      `tarball entry outside package/: ${JSON.stringify(name)}`
    );
    if (type === '5') continue;
    assert(!files.has(name), `duplicate tarball entry ${name}`);
    files.set(name, Buffer.from(body));
  }
  return files;
}

// The tarball must hold exactly the expected files and a package.json naming this version.
export function checkTarball(files, { name, version }) {
  const paths = [...files.keys()].map(file => file.slice('package/'.length));
  const contents = compareFileList(paths);
  assert(
    contents.unexpected.length === 0 &&
      contents.missing.length === 0 &&
      contents.nonEsm.length === 0,
    `tarball contents differ: unexpected [${contents.unexpected.join(', ')}], missing [${contents.missing.join(', ')}]`
  );
  const manifest = JSON.parse(files.get('package/package.json').toString('utf8'));
  assert(manifest.name === name, `tarball package name ${JSON.stringify(manifest.name)}`);
  assert(manifest.version === version, `tarball version ${JSON.stringify(manifest.version)}`);
}

export function tarballName(version) {
  return `${PACKAGE_NAME}-${version}.tgz`;
}

// The dry run's npm arguments and environment: --dry-run, no provenance (which would need OIDC),
// and no OIDC request variables or tokens, so no npm credential can be requested or used.
export function dryRunCommand(tarball, distTag, env) {
  const args = [
    'publish',
    tarball,
    '--dry-run',
    '--ignore-scripts',
    '--provenance=false',
    '--tag',
    distTag,
  ];
  const clean = Object.fromEntries(
    Object.entries(env).filter(([key]) => !CREDENTIAL_ENV.test(key.toLowerCase()))
  );
  return {
    args,
    env: {
      ...clean,
      npm_config_dry_run: 'true',
      npm_config_provenance: 'false',
      npm_config_userconfig: os.devNull,
    },
  };
}

// After a publication: the version, its integrity, its dist-tag, `latest` left alone by a `next`
// release, and a provenance attestation. Returns the problems; empty when all hold.
export function checkPublished(packument, { version, distTag, integrity, previousLatest }) {
  const problems = [];
  const entry = packument?.versions?.[version];
  if (!entry) return [`${version} is not on npm yet`];
  if (entry.dist?.integrity !== integrity)
    problems.push(`npm integrity ${entry.dist?.integrity} is not the packed ${integrity}`);
  const tags = packument['dist-tags'] ?? {};
  if (tags[distTag] !== version) problems.push(`dist-tag ${distTag} is ${tags[distTag]}`);
  if (distTag === 'next' && tags.latest !== previousLatest)
    problems.push(`latest moved from ${previousLatest} to ${tags.latest}`);
  const predicate = entry.dist?.attestations?.provenance?.predicateType;
  if (!/^https:\/\/slsa\.dev\/provenance\//.test(predicate ?? ''))
    problems.push(`no provenance attestation (predicateType ${JSON.stringify(predicate)})`);
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Commands, with their effects injected for the tests

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readState(dir) {
  const preFile = path.join(dir, '.changeset', 'pre.json');
  return {
    pkg: readJson(path.join(dir, 'package.json')),
    preState: fs.existsSync(preFile) ? readJson(preFile) : null,
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return result;
}

export const defaults = {
  dir: root,
  mainHead() {
    const result = run('git', ['ls-remote', '--exit-code', REPOSITORY_URL, MAIN_REF]);
    assert(result.status === 0, `git ls-remote failed: ${result.stderr}`);
    return parseLsRemote(result.stdout);
  },
  async packument() {
    const response = await fetch(`${REGISTRY}/${PACKAGE_NAME}`, {
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    });
    if (response.status === 404) return null;
    assert(response.ok, `the registry answered ${response.status}`);
    return response.json();
  },
  npmVersion() {
    const result = run('npm', ['--version']);
    assert(result.status === 0, 'npm --version failed');
    return result.stdout.trim();
  },
  npm(args, env) {
    return run('npm', args, { env, stdio: 'inherit' });
  },
  output(values) {
    const lines = Object.entries(values).map(([key, value]) => {
      assert(!/[\r\n]/.test(String(value)), `output ${key} contains a newline`);
      return `${key}=${value}\n`;
    });
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join(''));
    process.stdout.write(lines.join(''));
  },
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  log: message => console.log(message),
};

export async function preflight(env, deps = defaults) {
  const sha = checkRunContext(env);
  checkMode(env.MODE);
  const { pkg, preState } = readState(deps.dir);
  assert(pkg.name === PACKAGE_NAME, `package.json name ${JSON.stringify(pkg.name)}`);
  const version = checkVersionInput(env.VERSION, pkg.version);
  checkHead(sha, deps.mainHead());
  const plan = planRelease({ version, preState, packument: await deps.packument() });
  deps.log(`✓ preflight: ${version} on ${plan.distTag} from ${sha} (${env.MODE})`);
  deps.output({ 'dist-tag': plan.distTag, 'previous-latest': plan.previousLatest });
  return plan;
}

export function artifact(env, deps = defaults) {
  const { pkg } = readState(deps.dir);
  const version = checkVersionInput(env.VERSION, pkg.version);
  const directory = path.resolve(deps.dir, env.ARTIFACT_DIR ?? 'publish-tarball');
  const entries = fs.readdirSync(directory);
  assert(
    entries.length === 1 && entries[0] === tarballName(version),
    `expected only ${tarballName(version)} in the artifact, found [${entries.join(', ')}]`
  );
  const tarball = path.join(directory, entries[0]);
  const buffer = fs.readFileSync(tarball);
  checkIntegrity(integrityOf(buffer), env.EXPECTED_INTEGRITY);
  checkTarball(readTarball(buffer), { name: PACKAGE_NAME, version });
  deps.log(`✓ artifact: ${entries[0]}, ${env.EXPECTED_INTEGRITY}`);
  deps.output({ tarball });
  return tarball;
}

export async function final(env, deps = defaults) {
  const sha = checkRunContext(env);
  checkMode(env.MODE);
  const { pkg, preState } = readState(deps.dir);
  const version = checkVersionInput(env.VERSION, pkg.version);
  checkToolchain({ node: process.version, npm: deps.npmVersion() });
  checkHead(sha, deps.mainHead());
  const plan = planRelease({
    version,
    preState,
    packument: await deps.packument(),
    expectedTag: env.EXPECTED_DIST_TAG,
  });
  deps.log(`✓ final: ${version} on ${plan.distTag} from ${sha}, main's head (${env.MODE})`);
  deps.output({ 'dist-tag': plan.distTag });
  return plan;
}

export function dryRun(env, deps = defaults) {
  assert(env.MODE === 'dry-run', `the dry run needs mode dry-run, not ${JSON.stringify(env.MODE)}`);
  assert(env.TARBALL && env.DIST_TAG, 'TARBALL and DIST_TAG are required');
  const command = dryRunCommand(env.TARBALL, env.DIST_TAG, env);
  assert(command.args.includes('--dry-run'), 'refusing a publish without --dry-run');
  const result = deps.npm(command.args, command.env);
  assert(result.status === 0, `npm publish --dry-run failed (exit ${result.status})`);
  deps.log('✓ dry run: nothing was published');
  return command;
}

export async function verify(env, deps = defaults, { attempts = 20, delay = 15000 } = {}) {
  checkRunContext(env, { firstAttempt: false });
  const expected = {
    version: env.VERSION,
    distTag: env.DIST_TAG,
    integrity: env.EXPECTED_INTEGRITY,
    previousLatest: env.PREVIOUS_LATEST,
  };
  let problems = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    problems = checkPublished(await deps.packument(), expected);
    if (problems.length === 0) {
      deps.log(
        `✓ verified on npm: ${expected.version} on ${expected.distTag}, ${expected.integrity}`
      );
      return;
    }
    if (attempt < attempts) await deps.sleep(delay);
  }
  throw new ReleaseCheckError(
    `PARTIAL SUCCESS: ${expected.version} was published, but its verification failed. Do not ` +
      `republish or retry; check it by hand.\n  ${problems.join('\n  ')}`
  );
}

const COMMANDS = { preflight, artifact, final, 'dry-run': dryRun, verify };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = COMMANDS[process.argv[2]];
  try {
    assert(
      command && process.argv.length === 3,
      `usage: publish-guard.js ${Object.keys(COMMANDS).join('|')}`
    );
    await command(process.env);
  } catch (error) {
    console.error(`\n✗ ${error instanceof ReleaseCheckError ? error.message : error.stack}`);
    process.exit(1);
  }
}
