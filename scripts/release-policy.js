// The release policy (§29, P-28 S3): which versions may be published, on which dist-tag, and the
// manifest, lockfile, pre-mode and toolchain conditions for it. It imports nothing but Node's own
// modules, so the publish workflow's privileged job can run it without installing the repository's
// dependencies (P-29 S7b-2). release-check.js re-exports all of it.
export const PACKAGE_NAME = 'react-elegant-toasts';
// Never published by the release path: the 0.x version on npm and the S4 baseline (§29).
export const PARKED_VERSIONS = Object.freeze(['0.1.2', '2.0.0-0']);
// npm Trusted Publishing's minimums (P-28 D0).
export const MINIMUM_NODE = '22.14.0';
export const MINIMUM_NPM = '11.5.1';

export const NEXT_VERSION = /^2\.0\.0-next\.(0|[1-9]\d*)$/;
export const STABLE_VERSION = /^2\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const DIST_TAGS = Object.freeze(['next', 'latest']);

export class ReleaseCheckError extends Error {}

export function assert(condition, message) {
  if (!condition) throw new ReleaseCheckError(message);
}

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
