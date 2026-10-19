// The publish workflow's guard tests (P-29 S7b-2), run with the release security tests: release-check
// .test.js imports this file, so `node --test scripts/release-check.test.js` runs both. Every guard is
// given a deliberately wrong run, input, commit, version, tarball or registry state and must refuse
// it. Nothing here reaches the network or npm: their effects are stubbed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { EXPECTED_FILES } from './package-contents.js';
import {
  MAIN_REF,
  REPOSITORY,
  WORKFLOW_REF,
  artifact,
  checkHead,
  checkIntegrity,
  checkMode,
  checkPublished,
  checkRunContext,
  checkTarball,
  checkVersionInput,
  dryRun,
  dryRunCommand,
  final,
  integrityOf,
  knownVersions,
  parseLsRemote,
  planRelease,
  preflight,
  readTarball,
  tarballName,
  verify,
} from './publish-guard.js';
import { ReleaseCheckError } from './release-policy.js';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const NEXT = '2.0.0-next.0';
const PRE = { mode: 'pre', tag: 'next' };
export const RUN = Object.freeze({
  GITHUB_REPOSITORY: REPOSITORY,
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: MAIN_REF,
  GITHUB_WORKFLOW_REF: WORKFLOW_REF,
  GITHUB_SHA: SHA,
  GITHUB_RUN_ATTEMPT: '1',
});
const PACKUMENT = Object.freeze({
  'dist-tags': { latest: '0.1.2' },
  versions: { '0.1.0': {}, '0.1.1': {}, '0.1.2': {} },
  time: { created: 'x', modified: 'x', '0.1.0': 'x', '0.1.1': 'x', '0.1.2': 'x' },
});

function refused(fn, pattern) {
  assert.throws(fn, error => error instanceof ReleaseCheckError && pattern.test(error.message));
}

async function refusedAsync(promise, pattern) {
  await assert.rejects(
    promise,
    error => error instanceof ReleaseCheckError && pattern.test(error.message)
  );
}

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-guard-test-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A gzipped tar like npm pack's: the expected files under package/, with `extra` files added, and
// `omit` left out. Plain ustar, files only, as npm writes it.
export function makeTarball({
  name = 'react-elegant-toasts',
  version = NEXT,
  extra = {},
  omit = [],
  link,
} = {}) {
  const dir = tempDir();
  const files = { ...Object.fromEntries(EXPECTED_FILES.map(f => [f, `${f}\n`])), ...extra };
  files['package.json'] = JSON.stringify({ name, version });
  const entries = [];
  for (const [file, content] of Object.entries(files)) {
    if (omit.includes(file)) continue;
    const full = path.join(dir, file.startsWith('../') ? file.slice(3) : `package/${file}`);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    entries.push(file.startsWith('../') ? file.slice(3) : `package/${file}`);
  }
  if (link) {
    fs.symlinkSync('/etc/passwd', path.join(dir, 'package', link));
    entries.push(`package/${link}`);
  }
  const out = path.join(dir, 'out.tgz');
  execFileSync('tar', ['--format=ustar', '-czf', out, '-C', dir, ...entries]);
  return fs.readFileSync(out);
}

// A checkout with package.json, pre mode for a `next` version, and the effects stubbed.
function fixture({ version = NEXT, packument = PACKUMENT, head = SHA, npm = '11.19.0' } = {}) {
  const dir = tempDir();
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'react-elegant-toasts', version })
  );
  if (version.includes('-')) {
    fs.mkdirSync(path.join(dir, '.changeset'));
    fs.writeFileSync(path.join(dir, '.changeset', 'pre.json'), JSON.stringify(PRE));
  }
  const outputs = {};
  const calls = [];
  const deps = {
    dir,
    mainHead: () => head,
    packument: async () => packument,
    npmVersion: () => npm,
    npm: (args, env) => {
      calls.push({ args, env });
      return { status: 0 };
    },
    output: values => Object.assign(outputs, values),
    sleep: async () => {},
    log: () => {},
  };
  return { dir, deps, outputs, calls };
}

describe('16. publish guards: the run', () => {
  test('the expected run passes', () => {
    assert.equal(checkRunContext(RUN), SHA);
  });
  for (const [key, values, pattern] of [
    ['GITHUB_REPOSITORY', ['someone/react-elegant-toasts', undefined], /repository/],
    ['GITHUB_EVENT_NAME', ['push', 'pull_request', 'workflow_call', undefined], /event/],
    ['GITHUB_REF', ['refs/heads/v2', 'refs/tags/v2.0.0', 'refs/pull/1/merge', undefined], /ref/],
    [
      'GITHUB_WORKFLOW_REF',
      [
        `${REPOSITORY}/.github/workflows/release.yml@${MAIN_REF}`,
        `${REPOSITORY}/.github/workflows/publish.yml@refs/heads/feature`,
        `someone/fork/.github/workflows/publish.yml@${MAIN_REF}`,
        undefined,
      ],
      /workflow/,
    ],
    ['GITHUB_SHA', ['main', 'A'.repeat(40), undefined], /commit/],
    ['GITHUB_RUN_ATTEMPT', ['2', '0', undefined], /run attempt/],
  ]) {
    test(`a wrong ${key}`, () => {
      for (const value of values) refused(() => checkRunContext({ ...RUN, [key]: value }), pattern);
    });
  }
  test('verification alone may run again', () => {
    assert.equal(
      checkRunContext({ ...RUN, GITHUB_RUN_ATTEMPT: '2' }, { firstAttempt: false }),
      SHA
    );
  });
});

describe('17. publish guards: inputs, head and version', () => {
  test('mode', () => {
    assert.equal(checkMode('dry-run'), 'dry-run');
    assert.equal(checkMode('publish'), 'publish');
    for (const mode of ['', 'Publish', 'publish ', 'live', undefined])
      refused(() => checkMode(mode), /mode/);
  });
  test('the typed version', () => {
    assert.equal(checkVersionInput(NEXT, NEXT), NEXT);
    for (const input of ['2.0.0-next.1', ` ${NEXT}`, `v${NEXT}`, '', undefined])
      refused(() => checkVersionInput(input, NEXT), /version/);
  });
  test("main's head", () => {
    assert.equal(parseLsRemote(`${SHA}\t${MAIN_REF}\n`), SHA);
    refused(() => parseLsRemote(''), /one line/);
    refused(() => parseLsRemote(`${SHA}\t${MAIN_REF}\n${OTHER_SHA}\t${MAIN_REF}\n`), /one line/);
    refused(() => parseLsRemote(`${SHA}\trefs/heads/v2\n`), /unexpected/);
    checkHead(SHA, SHA);
    refused(() => checkHead(SHA, OTHER_SHA), /main moved/);
    refused(() => checkHead(SHA, ''), /head/);
  });
  test('a releasable version and its dist-tag', () => {
    assert.deepEqual(planRelease({ version: NEXT, preState: PRE, packument: PACKUMENT }), {
      distTag: 'next',
      previousLatest: '0.1.2',
    });
    assert.equal(planRelease({ version: NEXT, preState: PRE, packument: null }).distTag, 'next');
    assert.equal(
      planRelease({ version: '2.0.0', preState: null, packument: PACKUMENT }).distTag,
      'latest'
    );
  });
  test('a parked version', () => {
    for (const version of ['2.0.0-0', '0.1.2'])
      refused(
        () => planRelease({ version, preState: PRE, packument: PACKUMENT }),
        /cannot be published/
      );
  });
  test('an invalid version or one that does not fit pre mode', () => {
    for (const version of ['1.0.0', '2.0.0-beta.0', '3.0.0'])
      refused(
        () => planRelease({ version, preState: PRE, packument: PACKUMENT }),
        /unsupported|pre mode/
      );
    refused(
      () => planRelease({ version: '2.0.0', preState: PRE, packument: PACKUMENT }),
      /pre mode/
    );
  });
  test('a version already on npm, or unpublished from it', () => {
    const published = { ...PACKUMENT, versions: { ...PACKUMENT.versions, [NEXT]: {} } };
    refused(() => planRelease({ version: NEXT, preState: PRE, packument: published }), /already/);
    const unpublished = { ...PACKUMENT, time: { ...PACKUMENT.time, [NEXT]: 'x' } };
    assert.ok(knownVersions(unpublished).includes(NEXT));
    refused(() => planRelease({ version: NEXT, preState: PRE, packument: unpublished }), /already/);
  });
  test('a dist-tag other than the one preflight chose', () => {
    for (const expectedTag of ['latest', 'beta', ''])
      refused(
        () => planRelease({ version: NEXT, preState: PRE, packument: PACKUMENT, expectedTag }),
        /dist-tag/
      );
  });
});

describe('18. publish guards: the tarball', () => {
  test('the packed tarball passes', () => {
    const buffer = makeTarball();
    checkTarball(readTarball(buffer), { name: 'react-elegant-toasts', version: NEXT });
    checkIntegrity(integrityOf(buffer), integrityOf(buffer));
  });
  test('a wrong digest', () => {
    const buffer = makeTarball();
    refused(
      () =>
        checkIntegrity(integrityOf(buffer), integrityOf(makeTarball({ extra: { 'x.md': '' } }))),
      /integrity/
    );
    for (const expected of ['', 'sha1-abc', undefined])
      refused(() => checkIntegrity(integrityOf(buffer), expected), /expected integrity/);
  });
  test('a wrong package name or version', () => {
    const check = buffer =>
      checkTarball(readTarball(buffer), { name: 'react-elegant-toasts', version: NEXT });
    refused(() => check(makeTarball({ name: 'react-elegant-toast' })), /name/);
    refused(() => check(makeTarball({ version: '2.0.0-next.1' })), /version/);
  });
  test('an added, missing or CommonJS file', () => {
    const check = buffer =>
      checkTarball(readTarball(buffer), { name: 'react-elegant-toasts', version: NEXT });
    refused(() => check(makeTarball({ extra: { 'CHANGELOG.md': '#\n' } })), /CHANGELOG/);
    refused(() => check(makeTarball({ omit: ['dist/styles.css'] })), /styles\.css/);
    refused(() => check(makeTarball({ extra: { 'dist/index.cjs': '' } })), /contents differ/);
  });
  test('a link or a path outside package/', () => {
    refused(() => readTarball(makeTarball({ link: 'evil' })), /type/);
    refused(() => readTarball(makeTarball({ extra: { '../evil.txt': 'x' } })), /outside package/);
  });
  test('the artifact command: exactly the named tarball with the packed digest', () => {
    const { dir, deps, outputs } = fixture();
    const buffer = makeTarball();
    const artifactDir = path.join(dir, 'publish-tarball');
    fs.mkdirSync(artifactDir);
    fs.writeFileSync(path.join(artifactDir, tarballName(NEXT)), buffer);
    const env = { VERSION: NEXT, EXPECTED_INTEGRITY: integrityOf(buffer) };
    assert.equal(artifact(env, deps), path.join(artifactDir, tarballName(NEXT)));
    assert.equal(outputs.tarball, path.join(artifactDir, tarballName(NEXT)));
    refused(
      () =>
        artifact(
          { ...env, EXPECTED_INTEGRITY: integrityOf(makeTarball({ version: '2.0.0-next.1' })) },
          deps
        ),
      /integrity/
    );
    refused(() => artifact({ ...env, VERSION: '2.0.0-next.1' }, deps), /version/);
    fs.writeFileSync(path.join(artifactDir, 'other.tgz'), buffer);
    refused(() => artifact(env, deps), /expected only/);
  });
});

describe('19. publish guards: preflight and final', () => {
  const env = { ...RUN, MODE: 'dry-run', VERSION: NEXT };
  test('preflight passes and reports the dist-tag and latest', async () => {
    const { deps, outputs } = fixture();
    await preflight(env, deps);
    assert.deepEqual(outputs, { 'dist-tag': 'next', 'previous-latest': '0.1.2' });
  });
  test('preflight refuses a wrong run, mode, version or head', async () => {
    await refusedAsync(preflight({ ...env, GITHUB_REF: 'refs/heads/v2' }, fixture().deps), /ref/);
    await refusedAsync(preflight({ ...env, GITHUB_RUN_ATTEMPT: '2' }, fixture().deps), /attempt/);
    await refusedAsync(preflight({ ...env, MODE: 'live' }, fixture().deps), /mode/);
    await refusedAsync(preflight({ ...env, VERSION: '2.0.0-next.1' }, fixture().deps), /version/);
    await refusedAsync(preflight(env, fixture({ head: OTHER_SHA }).deps), /main moved/);
  });
  test('preflight refuses a parked or published version', async () => {
    await refusedAsync(
      preflight({ ...env, VERSION: '2.0.0-0' }, fixture({ version: '2.0.0-0' }).deps),
      /parked/
    );
    const published = { ...PACKUMENT, versions: { ...PACKUMENT.versions, [NEXT]: {} } };
    await refusedAsync(preflight(env, fixture({ packument: published }).deps), /already/);
  });
  test('final rechecks everything, with the toolchain and the chosen dist-tag', async () => {
    const finalEnv = { ...env, EXPECTED_DIST_TAG: 'next' };
    const { deps, outputs } = fixture();
    await final(finalEnv, deps);
    assert.deepEqual(outputs, { 'dist-tag': 'next' });
    await refusedAsync(final(finalEnv, fixture({ npm: '11.5.0' }).deps), /npm 11\.5\.0/);
    await refusedAsync(final(finalEnv, fixture({ head: OTHER_SHA }).deps), /main moved/);
    await refusedAsync(
      final({ ...finalEnv, EXPECTED_DIST_TAG: 'latest' }, fixture().deps),
      /dist-tag/
    );
    await refusedAsync(final({ ...finalEnv, GITHUB_RUN_ATTEMPT: '2' }, fixture().deps), /attempt/);
    await refusedAsync(final({ ...finalEnv, GITHUB_EVENT_NAME: 'push' }, fixture().deps), /event/);
    const published = { ...PACKUMENT, versions: { ...PACKUMENT.versions, [NEXT]: {} } };
    await refusedAsync(final(finalEnv, fixture({ packument: published }).deps), /already/);
  });
});

describe('20. publish guards: the dry run requests no credential', () => {
  const env = {
    MODE: 'dry-run',
    TARBALL: '/tmp/x.tgz',
    DIST_TAG: 'next',
    PATH: '/usr/bin',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example/oidc',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'secret',
    NODE_AUTH_TOKEN: 'XXXXX-XXXXX-XXXXX-XXXXX',
    NPM_TOKEN: 'npm_x',
    'npm_config_//registry.npmjs.org/:_authToken': 'npm_y',
    NPM_CONFIG_USERCONFIG: '/home/runner/work/_temp/.npmrc',
  };
  test('--dry-run, no provenance and no credential in the environment', () => {
    const command = dryRunCommand(env.TARBALL, env.DIST_TAG, env);
    assert.deepEqual(command.args, [
      'publish',
      '/tmp/x.tgz',
      '--dry-run',
      '--ignore-scripts',
      '--provenance=false',
      '--tag',
      'next',
    ]);
    for (const key of Object.keys(command.env))
      assert.ok(
        !/token|auth|^npm_config_userconfig$/i.test(key) || key === 'npm_config_userconfig',
        key
      );
    assert.equal(command.env.npm_config_userconfig, os.devNull);
    assert.equal(command.env.npm_config_dry_run, 'true');
    assert.equal(command.env.PATH, '/usr/bin');
  });
  test('the dry-run command runs npm with that command only in mode dry-run', () => {
    const { deps, calls } = fixture();
    dryRun(env, deps);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].args.includes('--dry-run'));
    assert.equal(calls[0].env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, undefined);
    for (const MODE of ['publish', '', undefined])
      refused(() => dryRun({ ...env, MODE }, deps), /mode dry-run/);
    assert.equal(calls.length, 1);
    refused(() => dryRun({ ...env, TARBALL: '' }, deps), /required/);
    refused(() => dryRun(env, { ...deps, npm: () => ({ status: 1 }) }), /failed/);
  });
});

describe('21. publish guards: verification after a publication', () => {
  const buffer = makeTarball();
  const integrity = integrityOf(buffer);
  const expected = { version: NEXT, distTag: 'next', integrity, previousLatest: '0.1.2' };
  const attestations = { provenance: { predicateType: 'https://slsa.dev/provenance/v1' } };
  const good = {
    'dist-tags': { latest: '0.1.2', next: NEXT },
    versions: { ...PACKUMENT.versions, [NEXT]: { dist: { integrity, attestations } } },
  };
  test('a verified publication', () => {
    assert.deepEqual(checkPublished(good, expected), []);
  });
  test('each failed verification', () => {
    const with_ = (tags, dist) => ({
      'dist-tags': { ...good['dist-tags'], ...tags },
      versions: { ...good.versions, [NEXT]: { dist: { integrity, attestations, ...dist } } },
    });
    assert.match(checkPublished(PACKUMENT, expected).join(), /not on npm/);
    assert.match(
      checkPublished(with_({}, { integrity: 'sha512-x' }), expected).join(),
      /integrity/
    );
    assert.match(checkPublished(with_({ next: '0.1.2' }, {}), expected).join(), /dist-tag next/);
    assert.match(checkPublished(with_({ latest: NEXT }, {}), expected).join(), /latest moved/);
    assert.match(
      checkPublished(with_({}, { attestations: undefined }), expected).join(),
      /provenance/
    );
  });
  test('the verify command reports a partial success and never retries the publication', async () => {
    const env = {
      ...RUN,
      GITHUB_RUN_ATTEMPT: '2',
      VERSION: NEXT,
      DIST_TAG: 'next',
      EXPECTED_INTEGRITY: integrity,
      PREVIOUS_LATEST: '0.1.2',
    };
    await verify(env, fixture({ packument: good }).deps, { attempts: 1, delay: 0 });
    const { deps, calls } = fixture({ packument: PACKUMENT });
    await refusedAsync(verify(env, deps, { attempts: 2, delay: 0 }), /PARTIAL SUCCESS/);
    assert.equal(calls.length, 0);
  });
});
