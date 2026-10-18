// The exact contents of the packed package (§27, P-07), shared by validate-package.js and the
// release rehearsal (release-check.js, P-28 S3), so both check the same list. `files: ["dist"]`
// in package.json keeps CHANGELOG.md and .changeset/ out of the tarball (P-28 S2).
export const EXPECTED_FILES = Object.freeze([
  'LICENSE',
  'README.md',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/index.js.map',
  'dist/styles.css',
  'package.json',
]);

export const FORBIDDEN_EXTENSIONS = /\.(cjs|cts|mjs|mts)$/;

// Compares a tarball's file paths with EXPECTED_FILES. Returns the unexpected and missing paths
// and any CommonJS or .m*/.c* file; the tarball is right only when all three are empty.
export function compareFileList(paths) {
  const files = [...paths].sort();
  return {
    files,
    unexpected: files.filter(file => !EXPECTED_FILES.includes(file)),
    missing: EXPECTED_FILES.filter(file => !files.includes(file)),
    nonEsm: files.filter(file => FORBIDDEN_EXTENSIONS.test(file)),
  };
}
