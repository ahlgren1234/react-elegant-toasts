// The release security tests (P-28 S3), run by `node --test scripts/release-check.test.js` and by
// release.yml before its rehearsal. Each negative control feeds a deliberately wrong workflow,
// version, lockfile or tarball to the checks and expects a refusal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { parse, stringify } from 'yaml';
import { EXPECTED_FILES, compareFileList } from './package-contents.js';
import {
  CHANGESET_CONFIG,
  CI_JOBS,
  JOB_ID,
  PARKED_VERSIONS,
  REHEARSAL_BRANCHES,
  REQUIRED_CHECKS,
  RUN_COMMANDS,
  ReleaseCheckError,
  SIMULATED_VERSION,
  assertDryRunOnly,
  checkChangesetConfig,
  checkCiCallers,
  checkCiWorkflow,
  checkDistTag,
  checkLockfile,
  checkManifest,
  checkRelease,
  checkToolchain,
  checkWorkflow,
  classifyVersion,
  compareExtracted,
  publishDryRunArgs,
  readChangesetConfig,
  readReleaseState,
  readWorkflows,
  rehearse,
  setVersion,
} from './release-check.js';

const { release, others } = readWorkflows();
const PRE = { mode: 'pre', tag: 'next', initialVersions: {}, changesets: [] };
const TOOLCHAIN = { node: 'v24.21.0', npm: '11.19.0' };

function refused(fn, pattern) {
  assert.throws(fn, error => error instanceof ReleaseCheckError && pattern.test(error.message));
}

// Applies `mutate` to a parsed copy of release.yml and returns the re-serialised workflow.
function mutated(mutate) {
  const workflow = parse(release.source);
  mutate(workflow);
  return stringify(workflow);
}

function job(workflow) {
  return workflow.jobs[JOB_ID];
}

function rejects(source, pattern) {
  const problems = checkWorkflow(source, others);
  assert.ok(problems.length > 0, 'the workflow was accepted');
  if (pattern)
    assert.ok(
      problems.some(p => pattern.test(p)),
      problems.join('\n')
    );
}

describe('release.yml structure', () => {
  test('the committed workflow conforms', () => {
    assert.deepEqual(checkWorkflow(release.source, others), []);
  });

  test('a re-serialised copy still conforms, so the mutations below test only their change', () => {
    assert.deepEqual(
      checkWorkflow(
        mutated(() => {}),
        others
      ),
      []
    );
  });

  describe('1. no publishing command without --dry-run', () => {
    test('an added npm publish step', () => {
      rejects(
        mutated(w => job(w).steps.push({ run: 'npm publish' })),
        /run commands|publish/
      );
    });
    test('npm publish hidden in a multiline block with line continuations', () => {
      const source = release.source.replace(
        '      - run: node scripts/release-check.js rehearse\n',
        '      - run: node scripts/release-check.js rehearse\n      - run: |\n          npm \\\n            pub""lish --tag next\n'
      );
      assert.notEqual(source, release.source);
      rejects(source, /run commands/);
    });
    test('an allowlisted command extended with shell syntax', () => {
      rejects(
        mutated(w => {
          job(w).steps.at(-1).run = 'node scripts/release-check.js rehearse && npm publish';
        }),
        /run commands/
      );
    });
    test('a flow-style step', () => {
      const source = release.source.replace(
        '      - run: node scripts/release-check.js rehearse\n',
        '      - run: node scripts/release-check.js rehearse\n      - { run: "npm publish --provenance" }\n'
      );
      rejects(source, /run commands/);
    });
    test('a publishing action', () => {
      rejects(
        mutated(w =>
          job(w).steps.push({
            uses: 'JS-DevTools/npm-publish@0000000000000000000000000000000000000000',
          })
        ),
        /not an allowed/
      );
    });
    test('the npm guard refuses publish without --dry-run', () => {
      refused(() => assertDryRunOnly(['publish']), /without --dry-run/);
      refused(() => assertDryRunOnly(['publish', 'x.tgz', '--tag', 'next']), /without --dry-run/);
      refused(() => assertDryRunOnly(['publish', '--dry-run=false']), /without --dry-run/);
      refused(() => assertDryRunOnly(['publish', '--dry-run', '--dry-run=false']), /disabled/);
      refused(() => assertDryRunOnly(['publish', '--dry-run', '--no-dry-run']), /disabled/);
      assertDryRunOnly(['pack', '--json']);
      assertDryRunOnly(publishDryRunArgs('x.tgz', 'next'));
      assertDryRunOnly(publishDryRunArgs('x.tgz', 'next', { provenance: false }));
      assert.ok(publishDryRunArgs('x.tgz', 'latest').includes('--dry-run'));
    });
    test('no npm script publishes', () => {
      const { pkg } = readReleaseState();
      for (const [name, script] of Object.entries(pkg.scripts)) {
        assert.doesNotMatch(script, /\bpublish\b/, name);
      }
    });
  });

  describe('2. no id-token permission', () => {
    test('at job level', () => {
      rejects(
        mutated(w => (job(w).permissions['id-token'] = 'write')),
        /permissions|id-token/
      );
    });
    test('at top level', () => {
      rejects(
        mutated(w => (w.permissions = { 'id-token': 'write' })),
        /permissions|id-token/
      );
    });
    test('write-all and read-all', () => {
      rejects(
        mutated(w => (w.permissions = 'write-all')),
        /permissions/
      );
      rejects(
        mutated(w => (job(w).permissions = 'read-all')),
        /permissions/
      );
    });
    test('any extra job permission', () => {
      rejects(
        mutated(w => (job(w).permissions.contents = 'write')),
        /permissions/
      );
      rejects(
        mutated(w => (job(w).permissions.packages = 'read')),
        /permissions/
      );
    });
  });

  describe('3. no secrets or npm authentication', () => {
    test('a secret in a step env', () => {
      rejects(
        mutated(w => {
          job(w).steps.at(-1).env = { NODE_AUTH_TOKEN: '${{ secrets.NPM_TOKEN }}' };
        }),
        /secrets|env|expression/
      );
    });
    test('the workflow token', () => {
      rejects(
        mutated(w => (w.env.GH = '${{ github.token }}')),
        /expression|env/
      );
    });
    test('setup-node registry-url', () => {
      rejects(
        mutated(w => (job(w).steps[1].with['registry-url'] = 'https://registry.npmjs.org')),
        /registry-url/
      );
    });
    test('an .npmrc written by a step', () => {
      rejects(
        mutated(w =>
          job(w).steps.splice(2, 0, { run: 'echo //registry.npmjs.org/:_authToken=x > .npmrc' })
        ),
        /run commands|npmrc|token/
      );
    });
    test('checkout persisting credentials', () => {
      rejects(
        mutated(w => (job(w).steps[0].with['persist-credentials'] = true)),
        /persist-credentials/
      );
    });
  });

  describe('4. no GitHub release creation', () => {
    test('a release action', () => {
      rejects(
        mutated(w =>
          job(w).steps.push({
            uses: 'softprops/action-gh-release@0000000000000000000000000000000000000000',
          })
        ),
        /not an allowed|gh-release/
      );
    });
    test('gh release create', () => {
      rejects(
        mutated(w => job(w).steps.push({ run: 'gh release create v2.0.0' })),
        /run commands|release/
      );
    });
    test('a write permission for contents', () => {
      rejects(
        mutated(w => (job(w).permissions.contents = 'write')),
        /permissions/
      );
    });
  });

  describe('5. no publishing on push, PR or dispatch; only the approved triggers', () => {
    const triggers = {
      'release: created': w => (w.on.release = { types: ['created'] }),
      workflow_call: w => (w.on.workflow_call = {}),
      workflow_run: w => (w.on.workflow_run = { workflows: ['CI'], types: ['completed'] }),
      schedule: w => (w.on.schedule = [{ cron: '0 0 * * *' }]),
      'push to another branch': w => (w.on.push.branches = ['main', 'v2', 'release/next']),
      'push to every branch': w => (w.on.push.branches = ['**']),
      'push to v2 only': w => (w.on.push.branches = ['v2']),
      'a PR into another branch': w => (w.on.pull_request.branches = ['main', 'v2', 'next']),
      'a PR into main only': w => (w.on.pull_request.branches = ['main']),
      'branches-ignore': w => (w.on.push = { 'branches-ignore': ['gh-pages'] }),
      'push tags': w => (w.on.push.tags = ['v*']),
      'a path filter': w => (w.on.pull_request.paths = ['src/**']),
      'dispatch inputs': w =>
        (w.on.workflow_dispatch = { inputs: { publish: { type: 'boolean' } } }),
      'no dispatch': w => delete w.on.workflow_dispatch,
    };
    for (const [name, mutate] of Object.entries(triggers)) {
      test(name, () =>
        rejects(mutated(mutate), /trigger|pull_request|push|workflow_dispatch|publish/)
      );
    }
    test('the rehearsal runs on main and v2, the branches ci.yml runs on (P-29 S2)', () => {
      assert.deepEqual(REHEARSAL_BRANCHES, ['main', 'v2']);
      const workflow = parse(release.source);
      assert.deepEqual(workflow.on.push.branches, REHEARSAL_BRANCHES);
      assert.deepEqual(workflow.on.pull_request.branches, REHEARSAL_BRANCHES);
    });
    test('a deployment environment', () => {
      rejects(
        mutated(w => (job(w).environment = 'npm')),
        /environment|key/
      );
    });
    test('a reusable workflow job', () => {
      rejects(
        mutated(w => (w.jobs.publish = { uses: './.github/workflows/ci.yml' })),
        /only job|publish/
      );
    });
  });

  describe('6. no publishing after failed or cancelled validation', () => {
    for (const condition of ['always()', 'failure()', 'cancelled()', '!cancelled()']) {
      test(`a step with if: ${condition}`, () => {
        rejects(
          mutated(w => (job(w).steps.at(-1).if = condition)),
          /key if/
        );
      });
    }
    test('continue-on-error on a step or the job', () => {
      rejects(
        mutated(w => (job(w).steps[3]['continue-on-error'] = true)),
        /continue-on-error/
      );
      rejects(
        mutated(w => (job(w)['continue-on-error'] = true)),
        /continue-on-error/
      );
    });
    test('a second job after the rehearsal', () => {
      rejects(
        mutated(w => (w.jobs.later = { needs: JOB_ID, if: 'always()', 'runs-on': 'ubuntu-24.04' })),
        /only job/
      );
    });
    test('the security tests and validation run before the rehearsal', () => {
      assert.deepEqual(RUN_COMMANDS, [
        'npm ci --ignore-scripts --no-audit --no-fund',
        'node --test scripts/release-check.test.js',
        'node scripts/release-check.js rehearse',
      ]);
      rejects(
        mutated(w => job(w).steps.splice(3, 1)),
        /run commands/
      );
    });
    test('a failed validation stops the rehearsal before any build, pack or dry run', () => {
      const calls = [];
      const runner = (command, args) => {
        calls.push(args.join(' '));
        if (args.includes('view')) return { status: 0, stdout: '["0.1.0"]', stderr: '' };
        return { status: 0, stdout: '', stderr: '' };
      };
      const dir = fixtureRepo({ version: '1.0.0' });
      refused(
        () => rehearse({ dir, workDir: dir, runner, log: () => {}, toolchain: TOOLCHAIN }),
        /unsupported/
      );
      assert.ok(
        calls.every(call => !/\b(build|pack|publish)\b/.test(call)),
        calls.join('\n')
      );
    });
    test('a wrong tarball stops the rehearsal before the dry run', () => {
      const calls = [];
      const runner = (command, args) => {
        calls.push(args.join(' '));
        if (args.includes('view')) return { status: 0, stdout: '["0.1.2"]', stderr: '' };
        if (args.includes('pack')) {
          const files = [...EXPECTED_FILES, 'CHANGELOG.md'].map(p => ({ path: p }));
          fs.writeFileSync(path.join(dir, 'real', 'x.tgz'), '');
          return { status: 0, stdout: JSON.stringify([{ filename: 'x.tgz', files }]), stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      };
      const dir = fixtureRepo({ version: '0.1.2' });
      refused(
        () => rehearse({ dir, workDir: dir, runner, log: () => {}, toolchain: TOOLCHAIN }),
        /CHANGELOG/
      );
      assert.ok(
        calls.every(call => !/\bpublish\b/.test(call)),
        calls.join('\n')
      );
    });
  });

  describe('7. no required-check name shadowing', () => {
    for (const name of REQUIRED_CHECKS) {
      test(`job name ${name}`, () => {
        rejects(
          mutated(w => (job(w).name = name)),
          /job name/
        );
      });
    }
    test('a job id taken by another workflow', () => {
      rejects(
        mutated(w => {
          w.jobs['build-package'] = job(w);
          delete w.jobs[JOB_ID];
        }),
        /only job|shadows/
      );
    });
    test("another workflow's job name or workflow name", () => {
      rejects(
        mutated(w => (job(w).name = 'node26-quality')),
        /job name/
      );
      rejects(
        mutated(w => (w.name = 'CI')),
        /workflow name/
      );
    });
    test('the shadowing set includes the CI and Node 26 job names', () => {
      const problems = checkWorkflow(
        mutated(w => (job(w).name = 'node26-test')),
        others
      );
      assert.ok(problems.some(p => /job name/.test(p)));
    });
  });

  describe('YAML tricks', () => {
    test('anchors, aliases and merge keys', () => {
      const source = release.source
        .replace('permissions:\n      contents: read', 'permissions: &p\n      contents: read')
        .replace('timeout-minutes: 10', 'timeout-minutes: 10\n    extra: *p');
      rejects(source, /anchors/);
      rejects(
        release.source.replace(
          '    timeout-minutes: 10\n',
          '    <<: { if: always() }\n    timeout-minutes: 10\n'
        ),
        /merge/
      );
    });
    test('duplicate keys', () => {
      rejects(
        release.source.replace(
          '    timeout-minutes: 10\n',
          '    timeout-minutes: 10\n    timeout-minutes: 20\n'
        ),
        /YAML/
      );
    });
    test('an unpinned action', () => {
      rejects(
        mutated(w => (job(w).steps[0].uses = 'actions/checkout@v7')),
        /SHA-pinned/
      );
    });
    test('a custom tag', () => {
      rejects(release.source.replace("NODE_VERSION: '24'", "NODE_VERSION: !secret '24'"), /tag/);
    });
  });
});

describe('8. invalid versions are rejected', () => {
  const cases = [
    ['1.0.0', null],
    ['1.0.0-next.0', PRE],
    ['3.0.0', null],
    ['2.0.0-next', PRE],
    ['2.0.0-next.01', PRE],
    ['2.0.0-beta.0', PRE],
    ['2.0.0-next.0.1', PRE],
    ['2.1.0-next.0', PRE],
    ['2.01.0', null],
    ['v2.0.0', null],
    ['2.0.0 ', null],
    ['', null],
    [SIMULATED_VERSION, PRE],
    [SIMULATED_VERSION, null],
  ];
  for (const [version, preState] of cases) {
    test(JSON.stringify(version), () => {
      for (const mode of ['rehearsal', 'publish']) {
        refused(() => classifyVersion({ version, preState, published: [], mode }), /unsupported/);
      }
    });
  }
  test('incompatible pre-mode state', () => {
    const publish = (version, preState) => () =>
      classifyVersion({ version, preState, published: [], mode: 'publish' });
    refused(publish('2.0.0-next.0', null), /pre mode/);
    refused(publish('2.0.0-next.0', { ...PRE, mode: 'exit' }), /pre mode/);
    refused(publish('2.0.0', PRE), /pre mode off/);
    refused(publish('2.0.0', { ...PRE, mode: 'exit' }), /pre mode off/);
    refused(publish('2.0.0-next.0', { ...PRE, tag: 'beta' }), /tag/);
    refused(publish('2.0.0-next.0', { ...PRE, mode: 'other' }), /mode/);
    refused(publish('2.0.0-next.0', []), /not an object/);
  });
  test('Node and npm minimums', () => {
    checkToolchain({ node: 'v22.14.0', npm: '11.5.1' });
    checkToolchain(TOOLCHAIN);
    refused(() => checkToolchain({ node: 'v22.13.1', npm: '11.19.0' }), /Node/);
    refused(() => checkToolchain({ node: 'v20.19.0', npm: '11.19.0' }), /Node/);
    refused(() => checkToolchain({ node: 'v24.21.0', npm: '11.5.0' }), /npm/);
    refused(() => checkToolchain({ node: 'v24.21.0', npm: '10.9.9' }), /npm/);
    refused(() => checkToolchain({ node: 'latest', npm: '11.19.0' }), /not x\.y\.z/);
  });
});

describe('9. parked versions cannot pass publish-mode validation', () => {
  for (const version of PARKED_VERSIONS) {
    for (const preState of [null, PRE]) {
      test(`${version}, pre mode ${preState ? 'on' : 'off'}`, () => {
        refused(
          () => classifyVersion({ version, preState, published: [], mode: 'publish' }),
          /parked/
        );
        const rehearsal = classifyVersion({ version, preState, published: [], mode: 'rehearsal' });
        assert.equal(rehearsal.kind, 'parked');
        assert.equal(rehearsal.releasable, false);
      });
    }
  }
  test('versions already on npm', () => {
    for (const [version, preState] of [
      ['2.0.0-next.0', PRE],
      ['2.0.0', null],
      ['0.1.0', null],
    ]) {
      refused(
        () =>
          classifyVersion({ version, preState, published: ['0.1.0', version], mode: 'publish' }),
        /already published/
      );
    }
  });
  test('the published list must be known', () => {
    refused(
      () =>
        classifyVersion({
          version: '2.0.0',
          preState: null,
          published: undefined,
          mode: 'publish',
        }),
      /unknown/
    );
  });
  // The committed version changes with each version PR, so this holds for whatever it is: it
  // passes rehearsal mode, and publish mode refuses it exactly when it is parked.
  test('the repository state as committed', () => {
    const state = readReleaseState();
    const args = { ...state, published: [], toolchain: TOOLCHAIN };
    const rehearsal = checkRelease({ ...args, mode: 'rehearsal' });
    if (PARKED_VERSIONS.includes(state.pkg.version)) {
      assert.equal(rehearsal.kind, 'parked');
      refused(() => checkRelease({ ...args, mode: 'publish' }), /parked/);
    } else {
      assert.equal(checkRelease({ ...args, mode: 'publish' }).releasable, true);
    }
  });
});

describe('10. pre-release and stable dist-tags', () => {
  const classify = (version, preState) =>
    classifyVersion({ version, preState, published: [], mode: 'publish' });
  test('classification', () => {
    assert.equal(classify('2.0.0-next.0', PRE).distTag, 'next');
    assert.equal(classify('2.0.0-next.12', PRE).distTag, 'next');
    assert.equal(classify('2.0.0', null).distTag, 'latest');
    assert.equal(classify('2.3.10', null).distTag, 'latest');
  });
  test('requested tags', () => {
    assert.equal(checkDistTag(classify('2.0.0-next.1', PRE), 'next'), 'next');
    assert.equal(checkDistTag(classify('2.0.0', null), 'latest'), 'latest');
    assert.equal(checkDistTag(classify('2.0.0', null), undefined), 'latest');
    refused(
      () => checkDistTag(classify('2.0.0-next.1', PRE), 'latest'),
      /must use dist-tag "next"/
    );
    refused(() => checkDistTag(classify('2.0.0', null), 'next'), /must use dist-tag "latest"/);
    for (const tag of ['beta', 'Next', '', '2.0.0', 'v2']) {
      refused(() => checkDistTag(classify('2.0.0', null), tag), /invalid dist-tag/);
    }
    const parked = classifyVersion({
      version: '0.1.2',
      preState: null,
      published: [],
      mode: 'rehearsal',
    });
    refused(() => checkDistTag(parked, 'latest'), /parked/);
  });
});

describe('11. lockfile mismatches are rejected', () => {
  const pkg = { name: 'react-elegant-toasts', version: '2.0.0-next.0' };
  const lock = version => ({
    name: 'react-elegant-toasts',
    version,
    packages: { '': { name: 'react-elegant-toasts', version } },
  });
  test('matching', () => checkLockfile(pkg, lock('2.0.0-next.0')));
  test('top-level version', () => {
    refused(
      () => checkLockfile(pkg, { ...lock('2.0.0-next.0'), version: '0.1.2' }),
      /lock.*version/
    );
  });
  test('root package version', () => {
    const stale = lock('2.0.0-next.0');
    stale.packages[''].version = '2.0.0-0';
    refused(() => checkLockfile(pkg, stale), /packages\[""\]\.version/);
  });
  test('missing root entry or names', () => {
    refused(() => checkLockfile(pkg, { ...lock('2.0.0-next.0'), packages: {} }), /root package/);
    refused(() => checkLockfile(pkg, { ...lock('2.0.0-next.0'), name: 'other' }), /name/);
    const renamed = lock('2.0.0-next.0');
    renamed.packages[''].name = 'other';
    refused(() => checkLockfile(pkg, renamed), /packages\[""\]\.name/);
  });
  test('the committed lockfile matches', () => {
    const state = readReleaseState();
    checkLockfile(state.pkg, state.lock);
  });
});

describe('12. package contents remain unchanged', () => {
  test('the expected file list', () => {
    assert.deepEqual(
      [...EXPECTED_FILES],
      [
        'LICENSE',
        'README.md',
        'dist/index.d.ts',
        'dist/index.js',
        'dist/index.js.map',
        'dist/styles.css',
        'package.json',
      ]
    );
    assert.ok(Object.isFrozen(EXPECTED_FILES));
  });
  test('compareFileList', () => {
    const exact = compareFileList([...EXPECTED_FILES].reverse());
    assert.deepEqual([exact.unexpected, exact.missing, exact.nonEsm], [[], [], []]);
    assert.deepEqual(compareFileList([...EXPECTED_FILES, 'CHANGELOG.md']).unexpected, [
      'CHANGELOG.md',
    ]);
    assert.deepEqual(compareFileList([...EXPECTED_FILES, '.changeset/config.json']).unexpected, [
      '.changeset/config.json',
    ]);
    assert.deepEqual(compareFileList(EXPECTED_FILES.slice(1)).missing, ['LICENSE']);
    assert.deepEqual(compareFileList([...EXPECTED_FILES, 'dist/index.cjs']).nonEsm, [
      'dist/index.cjs',
    ]);
  });
  test('the manifest keeps files, provenance and access', () => {
    const { pkg } = readReleaseState();
    checkManifest(pkg);
    refused(() => checkManifest({ ...pkg, files: ['dist', 'CHANGELOG.md'] }), /files/);
    refused(() => checkManifest({ ...pkg, publishConfig: { access: 'public' } }), /provenance/);
    refused(
      () => checkManifest({ ...pkg, publishConfig: { access: 'public', provenance: false } }),
      /provenance/
    );
    refused(() => checkManifest({ ...pkg, publishConfig: { provenance: true } }), /access/);
    refused(() => checkManifest({ ...pkg, name: 'other' }), /name/);
  });
  test('setVersion changes the version line only', () => {
    const text = '{\n  "name": "x",\n  "version": "0.1.2",\n  "a": 1\n}\n';
    const updated = setVersion(text, '0.1.2', SIMULATED_VERSION);
    assert.equal(updated, text.replace('0.1.2', SIMULATED_VERSION));
    assert.equal(setVersion(updated, SIMULATED_VERSION, '0.1.2'), text);
    refused(() => setVersion(text + text, '0.1.2', SIMULATED_VERSION), /exactly once/);
    refused(() => setVersion(text, '9.9.9', SIMULATED_VERSION), /exactly once/);
  });
  describe('compareExtracted', () => {
    const write = (dir, files) => {
      for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), content);
      }
      return dir;
    };
    const manifest = version => `{\n  "name": "x",\n  "version": "${version}"\n}\n`;
    const pair = simulated => {
      const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-release-test-'));
      const real = write(path.join(base, 'real'), {
        'package.json': manifest('0.1.2'),
        'dist/index.js': 'export {};\n',
      });
      const sim = write(path.join(base, 'sim'), {
        'package.json': manifest(SIMULATED_VERSION),
        'dist/index.js': 'export {};\n',
        ...simulated,
      });
      return { real, sim, cleanup: () => fs.rmSync(base, { recursive: true, force: true }) };
    };
    const compare = ({ real, sim }) =>
      compareExtracted(real, sim, { from: '0.1.2', to: SIMULATED_VERSION });
    test('identical except the version', () => {
      const dirs = pair({});
      try {
        assert.deepEqual(compare(dirs), ['dist/index.js', 'package.json']);
      } finally {
        dirs.cleanup();
      }
    });
    for (const [name, simulated, pattern] of [
      ['a changed byte', { 'dist/index.js': 'export {} ;\n' }, /byte-identical/],
      ['an added file', { 'CHANGELOG.md': '#\n' }, /files differ/],
      ['another manifest change', { 'package.json': manifest(SIMULATED_VERSION) + ' ' }, /beyond/],
    ]) {
      test(name, () => {
        const dirs = pair(simulated);
        try {
          refused(() => compare(dirs), pattern);
        } finally {
          dirs.cleanup();
        }
      });
    }
  });
});

// The CI gate that the publish workflow will call (P-29 S7b-1).
const ci = [release, ...others].find(({ file }) => file === 'ci.yml');

function ciMutated(mutate) {
  const workflow = parse(ci.source);
  mutate(workflow);
  return stringify(workflow);
}

function ciRejects(source, pattern) {
  const problems = checkCiWorkflow(source);
  assert.ok(problems.length > 0, 'ci.yml was accepted');
  assert.ok(
    problems.some(p => pattern.test(p)),
    problems.join('\n')
  );
}

describe('13. ci.yml stays the full, reusable gate', () => {
  test('the committed workflow conforms', () => {
    assert.deepEqual(checkCiWorkflow(ci.source), []);
  });
  test('a re-serialised copy still conforms, so the mutations below test only their change', () => {
    assert.deepEqual(checkCiWorkflow(ciMutated(() => {})), []);
  });
  test('the committed jobs are exactly the expected jobs', () => {
    assert.deepEqual(Object.keys(parse(ci.source).jobs).sort(), Object.keys(CI_JOBS).sort());
  });

  describe('triggers', () => {
    test('workflow_call removed', () => {
      ciRejects(
        ciMutated(w => delete w.on.workflow_call),
        /triggers/
      );
    });
    test('workflow_call with inputs, outputs or secrets', () => {
      for (const extra of [
        { inputs: { ref: { type: 'string' } } },
        { outputs: { ok: { value: 'yes' } } },
        { secrets: { token: { required: false } } },
      ])
        ciRejects(
          ciMutated(w => (w.on.workflow_call = extra)),
          /workflow_call/
        );
    });
    test('push or pull_request changed or removed', () => {
      ciRejects(
        ciMutated(w => (w.on.push.branches = ['main'])),
        /push/
      );
      ciRejects(
        ciMutated(w => delete w.on.pull_request),
        /triggers/
      );
      ciRejects(
        ciMutated(w => (w.on.pull_request = { branches: ['main', 'v2'], paths: ['src/**'] })),
        /pull_request/
      );
    });
    test('an extra trigger', () => {
      ciRejects(
        ciMutated(w => (w.on.pull_request_target = { branches: ['main'] })),
        /triggers/
      );
    });
    test('workflow_dispatch with inputs', () => {
      ciRejects(
        ciMutated(w => (w.on.workflow_dispatch = { inputs: { x: { type: 'string' } } })),
        /workflow_dispatch/
      );
    });
  });

  describe('permissions and credentials', () => {
    test('broader top-level permissions', () => {
      for (const permissions of [
        { contents: 'write' },
        { contents: 'read', 'id-token': 'write' },
        'write-all',
      ])
        ciRejects(
          ciMutated(w => (w.permissions = permissions)),
          /permissions|forbidden/
        );
    });
    test('job-level permissions, environment, secrets or a called workflow', () => {
      for (const [key, value] of [
        ['permissions', { contents: 'read' }],
        ['environment', 'npm-publish'],
        ['secrets', 'inherit'],
        ['uses', './.github/workflows/release.yml'],
      ])
        ciRejects(
          ciMutated(w => (w.jobs.size[key] = value)),
          new RegExp(`job size has ${key}`)
        );
    });
    test('a secret in a step', () => {
      ciRejects(
        ciMutated(w => (w.jobs.quality.steps[0].with.token = '${{ secrets.NPM_TOKEN }}')),
        /forbidden/
      );
    });
  });

  test('concurrency changed', () => {
    ciRejects(
      ciMutated(w => (w.concurrency['cancel-in-progress'] = true)),
      /concurrency/
    );
    ciRejects(
      ciMutated(w => (w.concurrency.group = 'ci')),
      /concurrency/
    );
  });

  describe('jobs, dependencies and the required checks', () => {
    for (const check of REQUIRED_CHECKS) {
      test(`required check ${check} renamed`, () => {
        ciRejects(
          ciMutated(w => (w.jobs[check].name = `${check}-renamed`)),
          new RegExp(`required check ${check}`)
        );
      });
    }
    test('a second job named like a required check', () => {
      ciRejects(
        ciMutated(w => (w.jobs['test-react'].name = 'size')),
        /required check size/
      );
    });
    test('a job removed or added', () => {
      ciRejects(
        ciMutated(w => delete w.jobs.demo),
        /jobs|required check demo/
      );
      ciRejects(
        ciMutated(w => (w.jobs.extra = { 'runs-on': 'ubuntu-24.04', steps: [{ run: 'true' }] })),
        /jobs/
      );
    });
    test('a dependency removed or added', () => {
      ciRejects(
        ciMutated(w => delete w.jobs.test.needs),
        /job test needs/
      );
      ciRejects(
        ciMutated(w => (w.jobs.demo.needs = 'quality')),
        /job demo needs/
      );
    });
    test('a job-level if on a required job', () => {
      ciRejects(
        ciMutated(w => (w.jobs['build-package'].if = "github.event_name != 'workflow_call'")),
        /job-level if/
      );
    });
    test('continue-on-error on a job or a step', () => {
      ciRejects(
        ciMutated(w => (w.jobs.browser['continue-on-error'] = true)),
        /continue-on-error/
      );
      ciRejects(
        ciMutated(w => (w.jobs.quality.steps.at(-1)['continue-on-error'] = true)),
        /continue-on-error/
      );
    });
  });

  describe('the fail-closed test aggregator', () => {
    test('no longer always runs', () => {
      ciRejects(
        ciMutated(w => (w.jobs.test.if = '${{ success() }}')),
        /always/
      );
      ciRejects(
        ciMutated(w => delete w.jobs.test.if),
        /always/
      );
    });
    test('passes on a failed or skipped leg', () => {
      ciRejects(
        ciMutated(w => (w.jobs.test.steps[0].run = 'echo "test-react: $RESULT"\n')),
        /aggregator steps/
      );
      ciRejects(
        ciMutated(w => (w.jobs.test.steps[0].env.RESULT = '${{ needs.test-react.outputs.x }}')),
        /aggregator steps/
      );
    });
  });

  test('YAML tricks', () => {
    ciRejects(
      ci.source.replace(
        '    timeout-minutes: 5\n',
        '    timeout-minutes: 5\n    timeout-minutes: 6\n'
      ),
      /YAML/
    );
    ciRejects(ci.source.replace('  workflow_call:\n', '  workflow_call: !custom\n'), /tag/);
  });
});

describe("14. a workflow calling ci.yml does not share ci.yml's concurrency group", () => {
  const caller = (concurrency, jobConcurrency) => ({
    file: 'caller.yml',
    source: stringify({
      name: 'Caller',
      on: { workflow_dispatch: null },
      permissions: {},
      ...(concurrency && { concurrency }),
      jobs: {
        gate: {
          uses: './.github/workflows/ci.yml',
          permissions: { contents: 'read' },
          ...(jobConcurrency && { concurrency: jobConcurrency }),
        },
      },
    }),
  });
  const shared = '${{ github.workflow }}-${{ github.ref }}';

  test('the committed workflows', () => {
    assert.deepEqual(checkCiCallers([release, ...others]), []);
  });
  test('a caller with its own fixed group, or with none', () => {
    assert.deepEqual(checkCiCallers([caller({ group: 'npm-publish' })]), []);
    assert.deepEqual(checkCiCallers([caller()]), []);
  });
  test("a caller using ci.yml's group, at workflow or job level", () => {
    assert.equal(checkCiCallers([caller({ group: shared })]).length, 1);
    assert.equal(checkCiCallers([caller(shared)]).length, 1);
    assert.equal(checkCiCallers([caller(undefined, { group: shared })]).length, 1);
  });
});

describe('15. the Changesets configuration', () => {
  test('the committed configuration conforms, with baseBranch main', () => {
    const config = readChangesetConfig();
    assert.deepEqual(checkChangesetConfig(config), []);
    assert.equal(config.baseBranch, 'main');
  });
  test('baseBranch v2 or missing', () => {
    assert.match(
      checkChangesetConfig({ ...CHANGESET_CONFIG, baseBranch: 'v2' }).join('\n'),
      /baseBranch/
    );
    const missing = { ...CHANGESET_CONFIG };
    delete missing.baseBranch;
    assert.match(checkChangesetConfig(missing).join('\n'), /baseBranch/);
  });
  test('any other setting changed or added', () => {
    for (const [key, value] of [
      ['access', 'restricted'],
      ['commit', true],
      ['changelog', false],
      ['ignore', ['react-elegant-toasts']],
    ])
      assert.match(
        checkChangesetConfig({ ...CHANGESET_CONFIG, [key]: value }).join('\n'),
        new RegExp(key)
      );
    assert.match(
      checkChangesetConfig({ ...CHANGESET_CONFIG, privatePackages: {} }).join('\n'),
      /extra key privatePackages/
    );
  });
});

// A throwaway directory with a manifest, lockfile and no pre mode, for the rehearsal tests.
function fixtureRepo({ version }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-release-test-'));
  const name = 'react-elegant-toasts';
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      version,
      files: ['dist'],
      publishConfig: { access: 'public', provenance: true },
    })
  );
  fs.writeFileSync(
    path.join(dir, 'package-lock.json'),
    JSON.stringify({ name, version, packages: { '': { name, version } } })
  );
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
