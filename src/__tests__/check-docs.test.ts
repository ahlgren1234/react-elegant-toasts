// The documentation checks (P-26 S2 to S4, P-27): scripts/check-docs.js, which `npm run lint` runs
// on the reference documents. Each sample is a Markdown file in a temporary directory, checked
// together with a temporary examples directory and a temporary Jest manifest, so the controls never
// depend on the real documents or fixtures. The last test runs the script on the real documents,
// the fixture's examples and the Jest consumer's package.json.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const CHECK = path.join(root, 'scripts/check-docs.js');

const REGION = `// #region sample
import { toast } from 'react-elegant-toasts';

toast.success('Saved');
// #endregion
`;
const FENCE =
  "```tsx\nimport { toast } from 'react-elegant-toasts';\n\ntoast.success('Saved');\n```";

// A Jest consumer manifest, and the guide's fence showing its synchronised fields: `type`,
// `scripts.test` and `jest` (P-27 S3).
const JEST_CONFIG = {
  type: 'module',
  scripts: { test: 'node --experimental-vm-modules node_modules/jest/bin/jest.js' },
  jest: { testEnvironment: 'jsdom', moduleNameMapper: { '\\.css$': '<rootDir>/style-stub.js' } },
};
const JEST_MANIFEST = JSON.stringify(
  { name: 'consumer-jest', private: true, ...JEST_CONFIG, devDependencies: { jest: '30.5.2' } },
  null,
  2
);
const jestFence = (config: unknown) =>
  `<!-- jest-config -->\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``;
const JEST_FENCE = jestFence(JEST_CONFIG);

interface Run {
  status: number | null;
  output: string;
  /** Each document's violation lines, or an empty list when it passed. */
  reports: Record<string, string[]>;
  /** The temporary Jest manifest the run compared with. */
  jestFile: string;
}

/**
 * Runs the check on `docs` (name → Markdown) with `examples` (file name → source) and `jest`, the
 * text of the Jest consumer's package.json.
 */
function runCheck(
  docs: Record<string, string>,
  examples: Record<string, string> = { 'sample.tsx': REGION },
  jest = JEST_MANIFEST
): Run {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-docs-'));
  try {
    const exampleDir = path.join(tmp, 'examples');
    fs.mkdirSync(exampleDir);
    for (const [name, text] of Object.entries(examples)) {
      fs.writeFileSync(path.join(exampleDir, name), text);
    }
    const jestFile = path.join(tmp, 'consumer-jest', 'package.json');
    fs.mkdirSync(path.dirname(jestFile));
    fs.writeFileSync(jestFile, jest);
    const files = Object.entries(docs).map(([name, text]) => {
      const file = path.join(tmp, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      return file;
    });
    const result = spawnSync(
      process.execPath,
      [CHECK, '--examples', exampleDir, '--jest', jestFile, ...files],
      { cwd: root, encoding: 'utf8' }
    );
    const output = `${result.stdout}${result.stderr}`;
    const lines = output.split('\n');
    const reports = Object.fromEntries(
      Object.keys(docs).map((name, index) => {
        const file = files[index]!;
        if (lines.includes(`${file}: documentation checks OK`)) return [name, []];
        const start = lines.indexOf(`${file} breaks the documentation checks:`);
        expect(start, `no report for ${name}:\n${output}`).toBeGreaterThanOrEqual(0);
        const end = lines.findIndex((line, i) => i > start && !line.startsWith('  '));
        return [name, lines.slice(start + 1, end === -1 ? undefined : end)];
      })
    );
    return { status: result.status, output, reports, jestFile };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// A document that every check accepts: public names, the package's public subpaths, a repository
// URL, valid links and anchors, a marked fence equal to its region and an unmarked CSS fence.
const REPO = 'https://github.com/ahlgren1234/react-elegant-toasts';

const PASSING = `# Passing sample

Set \`--ret-surface\` on \`.ret-toaster\`, or select \`.ret-toast--custom\` and
\`.ret-toaster__list[data-position='bottom-center']\` with \`data-phase\` and \`data-paused\`.
Import \`react-elegant-toasts/styles.css\` or read \`react-elegant-toasts/package.json\`. The
source is at https://github.com/ahlgren1234/react-elegant-toasts/blob/v2/src/styles.css, and a
pretext or interpret-style word is not a class.

See [the heading](#passing-sample), [the other file](other.md) and
[its section](other.md#a-section-with-code), and the
[token reference](${REPO}/blob/v2/docs/THEMING.md#token-reference) in this repository.

<!-- example: sample -->

${FENCE}

\`\`\`css
.ret-toaster[data-theme='dark'] {
  --ret-focus: #93c5fd;
}
\`\`\`

\`\`\`text
toast.success(content, options?)
\`\`\`
`;
const OTHER = '# Other\n\n## A section with `code`\n';

// Samples the check must reject, each with a fragment of the expected message.
const FAILING: readonly (readonly [name: string, markdown: string, message: string])[] = [
  ['an unknown token', 'Set `--ret-colour`.', '--ret-colour is not a public token'],
  ['an internal swipe property', '`--ret-swipe-x`', '--ret-swipe-x is not a public token'],
  ['the progress fill', '`.ret-toast__progress-fill`', 'ret-toast__progress-fill is not a'],
  ['the toast title', '`.ret-toast__title`', '.ret-toast__title is not a documented class'],
  ['the live regions', '`.ret-toaster__live-region`', 'ret-toaster__live-region is not a'],
  ['a keyframe name', 'the `ret-spin` keyframes', '.ret-spin is not a documented class'],
  ['the swipe attribute', '`[data-swiping]`', 'data-swiping is not a documented attribute'],
  [
    'a dist/ deep import',
    "```css\n@import 'react-elegant-toasts/dist/styles.css';\n```",
    'react-elegant-toasts/dist/styles.css is not a package export',
  ],
  [
    'a src/ deep import',
    'From `react-elegant-toasts/src/index.ts`.',
    'react-elegant-toasts/src/index.ts is not a package export',
  ],
  ['a 0.x component', 'Wrap the app in `ToastProvider`.', 'ToastProvider is 0.x API'],
  ['a 0.x option', 'Pass `pauseOnHover: false`.', 'pauseOnHover is 0.x API'],
  ['a 0.x props type', 'Type it as `ToastProviderProps`.', 'ToastProviderProps is 0.x API'],
  ['a 0.x context type', 'Type it as `ToastContextValue`.', 'ToastContextValue is 0.x API'],
  ['a missing link target', 'See [the guide](missing.md).', 'link target missing.md does not'],
  ['a missing anchor', 'See [below](#nowhere).', 'anchor #nowhere is not in'],
  ['a missing anchor elsewhere', 'See [it](other.md#nope).', 'anchor #nope is not in'],
  [
    'a missing anchor in a repository link',
    `See [it](${REPO}/blob/v2/docs/THEMING.md#nope).`,
    'anchor #nope is not in docs/THEMING.md',
  ],
  [
    'a missing file in a repository link',
    `See [it](${REPO}/blob/v2/docs/MISSING.md).`,
    'link target docs/MISSING.md does not exist',
  ],
  ['a TODO', 'TODO: write this.', 'placeholder "TODO"'],
  ['a placeholder URL', 'github.com/yourusername/repo', 'placeholder "yourusername"'],
  ['an empty link', 'See [this]().', 'placeholder "]()"'],
  [
    'a fence out of sync',
    "<!-- example: sample -->\n\n```tsx\nimport { toast } from 'react-elegant-toasts';\n\ntoast.error('Saved');\n```",
    'line 8: example sample differs from',
  ],
  [
    'an unmarked TSX fence',
    "```tsx\ntoast('Hi');\n```",
    'tsx fence has no <!-- example: <id> --> marker',
  ],
  ['a marker for an unknown region', `<!-- example: other -->\n\n${FENCE}`, 'example other has no'],
  ['a marker without a fence', '<!-- example: sample -->\n\nText.', 'is not followed by a code'],
  [
    'a marker on a CSS fence',
    '<!-- example: sample -->\n\n```css\n.ret-toast {}\n```',
    'example sample must be a TS or TSX fence',
  ],
  ['an unclosed fence', '```css\n.ret-toast {}', 'code fence is never closed'],
  ['an untagged fence', "```\ntoast('Hi');\n```", 'line 3: code fence has no language tag'],
];

describe('scripts/check-docs.js', () => {
  it('accepts a document that uses only the public contract', () => {
    const run = runCheck({ 'passing.md': PASSING, 'other.md': OTHER });
    expect(run.reports).toEqual({ 'passing.md': [], 'other.md': [] });
    expect(run.status, run.output).toBe(0);
  });

  describe('rejects', () => {
    // One run for every sample; the passing sample uses the region, so none is reported unused.
    const docs: Record<string, string> = { 'passing.md': PASSING, 'other.md': OTHER };
    FAILING.forEach(
      ([, markdown], index) => (docs[`case-${index}.md`] = `# Case\n\n${markdown}\n`)
    );
    const run = runCheck(docs);

    it('with a failing exit status', () => expect(run.status).toBe(1));

    it.each(FAILING.map(([name, , message], index) => [name, message, index] as const))(
      '%s',
      (_name, message, index) => {
        const report = run.reports[`case-${index}.md`]!;
        expect(report.join('\n')).toContain(message);
        // Each sample breaks exactly one rule. A sync failure adds detail lines under its message.
        expect(report.filter(line => line.startsWith('  - '))).toHaveLength(1);
      }
    );
  });

  it('requires THEMING.md to name every token', () => {
    const run = runCheck({ 'docs/THEMING.md': 'Only `--ret-surface` here.\n' }, {});
    const report = run.reports['docs/THEMING.md']!;
    expect(report).toContain('  - the token reference does not name --ret-exit-easing');
    expect(report.join('\n')).not.toContain('--ret-surface\n');
    expect(report).toHaveLength(29);
    expect(run.status).toBe(1);
  });

  describe('the README', () => {
    const TYPES = [
      'ToasterProps',
      'ToastOptions',
      'CustomToastOptions',
      'ToastPromiseMessages',
      'ToastAction',
      'ToastSnapshot',
      'DismissReason',
      'ToastId',
      'ToastPosition',
      'ToastType',
      'ToastTheme',
    ];
    const readme = (types: readonly string[], extra = '') =>
      `# Sample\n\nTypes: ${types.map(name => `\`${name}\``).join(', ')}.\n\n` +
      `See [the top](#sample) and [the reference](${REPO}/blob/v2/docs/ACCESSIBILITY.md).\n${extra}`;

    it('accepts absolute repository links, anchors and every public type', () => {
      const run = runCheck({ 'README.md': readme(TYPES) }, {});
      expect(run.reports).toEqual({ 'README.md': [] });
      expect(run.status, run.output).toBe(0);
    });

    it('rejects a relative link, which npm cannot follow', () => {
      const run = runCheck({ 'README.md': readme(TYPES, 'See [theming](docs/THEMING.md).\n') }, {});
      expect(run.reports['README.md']).toEqual([
        '  - line 6: relative link docs/THEMING.md: the README links with absolute GitHub URLs',
      ]);
      expect(run.status).toBe(1);
    });

    it('requires every public type the package entry exports', () => {
      const run = runCheck(
        { 'README.md': readme(TYPES.filter(name => name !== 'ToastTheme')) },
        {}
      );
      expect(run.reports['README.md']).toEqual([
        '  - the README does not name the type ToastTheme',
      ]);
      expect(run.status).toBe(1);
    });
  });

  describe('the migration guide', () => {
    // A guide that names the 0.x API only in inline code and in a 0.x fence, beside a v2 example.
    const GUIDE = `# Migrating from 0.x → 2.0

Version 2.0.0 directly follows 0.1.x; there was no 1.x. Replace \`ToastProvider\` and
\`useToast().addToast({ message })\` with \`<Toaster />\` and \`toast\`, the import of
\`react-elegant-toasts/dist/styles.css\` with \`react-elegant-toasts/styles.css\`, and
\`.toast-message\` with \`.ret-toast__content\`. See [the top](#migrating-from-0x--20).

<!-- 0.x -->

\`\`\`tsx
import { ToastProvider, useToast, type ToastContextValue } from 'react-elegant-toasts';
import 'react-elegant-toasts/dist/styles.css';

const { addToast }: ToastContextValue = useToast();
addToast({ type: 'success', message: 'Saved', progressBar: true, closeOnClick: false });
\`\`\`

<!-- example: sample -->

${FENCE}

\`\`\`css
.ret-toaster {
  --ret-focus: #93c5fd;
}
\`\`\`

${JEST_FENCE}
`;
    // A guide around `markdown`; its required Jest fence follows, so line 5 starts the sample.
    const guide = (markdown: string) =>
      `# Guide\n\nFrom 0.x → 2.0.\n\n${markdown}\n\n${JEST_FENCE}\n`;
    // A v2 region whose comment names the 0.x hook, for the rule that examples get every check.
    const LEGACY_REGION = "// #region legacy\n// Replaces useToast.\ntoast('Hi');\n// #endregion\n";
    const examples = { 'sample.tsx': `${REGION}${LEGACY_REGION}` };

    it('accepts 0.x names in inline code and in a marked 0.x fence', () => {
      const run = runCheck(
        { 'MIGRATION.md': GUIDE, 'legacy/MIGRATION.md': guide('No examples here.') },
        { 'sample.tsx': REGION }
      );
      expect(run.reports).toEqual({ 'MIGRATION.md': [], 'legacy/MIGRATION.md': [] });
      expect(run.status, run.output).toBe(0);
    });

    // Samples the check must reject in MIGRATION.md, each breaking one rule.
    const GUIDE_FAILING: readonly (readonly [name: string, markdown: string, message: string])[] = [
      ['a 0.x name in prose', 'Remove the ToastProvider.', 'ToastProvider is 0.x API'],
      [
        'a 0.x name beside inline code',
        'Replace `toast` calls for useToast.',
        'useToast is 0.x API',
      ],
      [
        'the 0.x stylesheet path in prose',
        'Delete the react-elegant-toasts/dist/styles.css import.',
        'react-elegant-toasts/dist/styles.css is not a package export',
      ],
      [
        'another deep import in inline code',
        'Not `react-elegant-toasts/src/index.ts`.',
        'react-elegant-toasts/src/index.ts is not a package export',
      ],
      [
        'another deep import in a 0.x fence',
        "<!-- 0.x -->\n\n```ts\nimport 'react-elegant-toasts/dist/index.mjs';\n```",
        'react-elegant-toasts/dist/index.mjs is not a package export',
      ],
      [
        'a 0.x name in a v2 example',
        "<!-- example: legacy -->\n\n```tsx\n// Replaces useToast.\ntoast('Hi');\n```",
        'useToast is 0.x API',
      ],
      ['a 0.x name in an unmarked fence', '```text\nuseToast()\n```', 'useToast is 0.x API'],
      [
        'an unmarked TSX fence',
        "```tsx\ntoast('Hi');\n```",
        'tsx fence has no <!-- example: <id> --> marker',
      ],
      ['an orphan 0.x marker', '<!-- 0.x -->\n\nText.', 'the 0.x marker is not followed by a code'],
      [
        'a 0.x marker followed by another marker',
        `<!-- 0.x -->\n<!-- example: sample -->\n\n${FENCE}`,
        'the 0.x marker is not followed by a code',
      ],
      ['an untagged 0.x fence', '<!-- 0.x -->\n\n```\nuseToast();\n```', 'has no language tag'],
      ['"v1"', 'Upgrading from v1.', '"v1": 2.0.0 follows 0.x'],
      ['"V1" in a heading', '## From V1', '"v1": 2.0.0 follows 0.x'],
      ['an unknown token', 'Set `--ret-colour`.', '--ret-colour is not a public token'],
      [
        'an internal class in a 0.x fence',
        '<!-- 0.x -->\n\n```css\n.ret-toast__title {}\n```',
        '.ret-toast__title is not a documented class',
      ],
      ['a placeholder in a 0.x fence', '<!-- 0.x -->\n\n```ts\n// TODO\n```', 'placeholder "TODO"'],
      ['a missing link target', 'See [it](missing.md).', 'link target missing.md does not'],
      ['a missing anchor', 'See [below](#nowhere).', 'anchor #nowhere is not in'],
    ];

    describe('rejects', () => {
      const docs: Record<string, string> = {};
      GUIDE_FAILING.forEach(
        ([, markdown], index) => (docs[`case-${index}/MIGRATION.md`] = guide(markdown))
      );
      const run = runCheck(docs, examples);

      it('with a failing exit status', () => expect(run.status).toBe(1));

      it.each(GUIDE_FAILING.map(([name, , message], index) => [name, message, index] as const))(
        '%s',
        (_name, message, index) => {
          const report = run.reports[`case-${index}/MIGRATION.md`]!;
          expect(report.join('\n')).toContain(message);
          expect(report.filter(line => line.startsWith('  - '))).toHaveLength(1);
        }
      );
    });

    // The inline-code exemption trusts only single backticks in pairs (P-27 S1 pre-PR review). The
    // first four cases are the review's probes: before the fix, the last three hid a bare name.
    describe('inline code', () => {
      const DOUBLE = 'inline code in MIGRATION.md must use single backticks';
      const UNPAIRED =
        'unpaired backtick: inline code in MIGRATION.md must open and close on one line';
      const CASES: readonly (readonly [name: string, markdown: string, messages: string[]])[] = [
        ['a double-backtick span', 'Use ``useToast`` here.', [DOUBLE, 'useToast is 0.x API']],
        [
          'a double-backtick span around a backtick',
          'Use `` `useToast` `` here.',
          [DOUBLE, 'useToast is 0.x API'],
        ],
        [
          'a bare name between double-backtick spans',
          'A `` ` `` then useToast then `` ` ``.',
          [DOUBLE, 'useToast is 0.x API'],
        ],
        [
          'a bare name after a stray backtick',
          'Odd ` tick, then useToast, then `x`.',
          [UNPAIRED, 'useToast is 0.x API'],
        ],
        ['a double backtick with no 0.x name', 'Call ``toast``.', [DOUBLE]],
        ['a stray backtick with no 0.x name', 'Call ` toast.', [UNPAIRED]],
        [
          'a bare name before a valid span',
          'Remove useToast, then call `toast`.',
          ['useToast is 0.x API'],
        ],
        [
          'a bare name between valid spans',
          'Use `toast`, not useToast or `addToast`.',
          ['useToast is 0.x API'],
        ],
      ];
      const docs: Record<string, string> = {
        'valid/MIGRATION.md': guide(
          'Replace `useToast` and `ToastProvider` with `toast` and `<Toaster />`, and ' +
            "`import 'react-elegant-toasts/dist/styles.css'` with the public stylesheet.\n\n" +
            // Fences are not prose: backticks inside them are not inline code.
            '<!-- 0.x -->\n\n```tsx\nconst label = `${addToast.name}`; // ``\n```\n\n' +
            '<!-- example: ticks -->\n\n```tsx\n// ``\ntoast(`Saved ${1}`);\n```'
        ),
      };
      CASES.forEach(
        ([, markdown], index) => (docs[`case-${index}/MIGRATION.md`] = guide(markdown))
      );
      const run = runCheck(docs, {
        'sample.tsx': '// #region ticks\n// ``\ntoast(`Saved ${1}`);\n// #endregion\n',
      });

      it('accepts single-backtick spans, 0.x fences and v2 examples with backticks', () =>
        expect(run.reports['valid/MIGRATION.md']).toEqual([]));

      it.each(CASES.map(([name, , messages], index) => [name, messages, index] as const))(
        'rejects %s',
        (_name, messages, index) =>
          expect(run.reports[`case-${index}/MIGRATION.md`]).toEqual(
            messages.map(message => `  - line 5: ${message}`)
          )
      );

      // The delimiter rule belongs to the guide's exemption; the other documents need none, since
      // they check the whole line, inline code included.
      it.each(['README.md', 'docs/THEMING.md', 'docs/ACCESSIBILITY.md'])(
        'still rejects the names in any inline code in %s',
        name => {
          const markdown = '# Doc\n\nUse `useToast`, `` `addToast` `` and ``ToastProvider``.\n';
          const report = runCheck({ [name]: markdown }, {}).reports[name]!;
          expect(report).toEqual(
            expect.arrayContaining([
              '  - line 3: useToast is 0.x API',
              '  - line 3: addToast is 0.x API',
              '  - line 3: ToastProvider is 0.x API',
            ])
          );
          expect(report.join('\n')).not.toContain('backtick');
        }
      );
    });

    it('requires the phrase "0.x → 2.0"', () => {
      const run = runCheck(
        { 'MIGRATION.md': `# Guide\n\nFrom 0.x to 2.0.\n\n${JEST_FENCE}\n` },
        {}
      );
      expect(run.reports['MIGRATION.md']).toEqual([
        '  - the migration guide does not say "0.x → 2.0"',
      ]);
      expect(run.status).toBe(1);
    });

    // The guide's Jest configuration equals the J1 fixture's `type`, `scripts.test` and `jest`
    // (P-27 S3): exactly one json fence after `<!-- jest-config -->`, compared as parsed JSON.
    describe('the Jest configuration', () => {
      const FIXTURE = 'consumer-jest/package.json';
      // A guide with `markdown` and no Jest fence of its own.
      const bare = (markdown: string) => `# Guide\n\nFrom 0.x → 2.0.\n\n${markdown}\n`;
      const { type, scripts, jest } = JEST_CONFIG;
      const fence = (language: string, body: string) => `\`\`\`${language}\n${body}\n\`\`\``;

      it('accepts the configuration with its keys in any order', () => {
        const run = runCheck(
          {
            'MIGRATION.md': bare(jestFence({ jest, scripts, type })),
            'nested/MIGRATION.md': bare(
              jestFence({
                type,
                scripts,
                jest: {
                  moduleNameMapper: jest.moduleNameMapper,
                  testEnvironment: jest.testEnvironment,
                },
              })
            ),
          },
          {}
        );
        expect(run.reports).toEqual({ 'MIGRATION.md': [], 'nested/MIGRATION.md': [] });
        expect(run.status, run.output).toBe(0);
      });

      // Samples the check must reject, each breaking one rule.
      const CASES: readonly (readonly [name: string, markdown: string, message: string])[] = [
        [
          'a missing fence',
          'No configuration here.',
          'the migration guide has no <!-- jest-config --> fence',
        ],
        [
          'a duplicated fence',
          `${JEST_FENCE}\n\n${JEST_FENCE}`,
          'line 24: a second <!-- jest-config --> fence',
        ],
        [
          'invalid JSON',
          `<!-- jest-config -->\n\n${fence('json', '{ "type": "module", }')}`,
          'line 7: the Jest configuration is not valid JSON',
        ],
        [
          'a JSON array',
          `<!-- jest-config -->\n\n${fence('json', '[]')}`,
          'the Jest configuration must be a JSON object',
        ],
        [
          'a changed type',
          jestFence({ type: 'commonjs', scripts, jest }),
          'the Jest configuration\'s "type" differs from',
        ],
        [
          'a test script without the flag',
          jestFence({ type, scripts: { test: 'jest' }, jest }),
          'the Jest configuration\'s "scripts.test" differs from',
        ],
        [
          'a changed CSS mapping',
          jestFence({ type, scripts, jest: { ...jest, moduleNameMapper: {} } }),
          'the Jest configuration\'s "jest" differs from',
        ],
        [
          'an extra Jest option',
          jestFence({ type, scripts, jest: { ...jest, transformIgnorePatterns: [] } }),
          'the Jest configuration\'s "jest" differs from',
        ],
        [
          'an extra top-level field',
          jestFence({ ...JEST_CONFIG, devDependencies: { jest: '30.5.2' } }),
          'the Jest configuration\'s "devDependencies" is not a synchronised field',
        ],
        [
          'an extra script',
          jestFence({ type, scripts: { ...scripts, lint: 'eslint .' }, jest }),
          'the Jest configuration\'s "scripts.lint" is not a synchronised field',
        ],
        ['a missing type', jestFence({ scripts, jest }), 'the Jest configuration has no "type"'],
        [
          'a missing test script',
          jestFence({ type, scripts: {}, jest }),
          'the Jest configuration has no "scripts.test"',
        ],
        [
          'scripts that are not an object',
          jestFence({ type, scripts: 'jest', jest }),
          'the Jest configuration\'s "scripts" must be an object',
        ],
        [
          'the marker on a text fence',
          `<!-- jest-config -->\n\n${fence('text', JSON.stringify(JEST_CONFIG))}`,
          'the Jest configuration must be a json fence',
        ],
        [
          'an orphan marker',
          `<!-- jest-config -->\n\nText.\n\n${JEST_FENCE}`,
          'line 5: the Jest marker is not followed by a code fence',
        ],
        [
          'a marker followed by another marker',
          `<!-- jest-config -->\n${JEST_FENCE}`,
          'line 5: the Jest marker is not followed by a code fence',
        ],
        [
          'an unmarked json fence',
          `${fence('json', '{}')}\n\n${JEST_FENCE}`,
          'line 5: json fence has no <!-- jest-config --> marker',
        ],
        [
          'an unmarked jsonc fence',
          `${fence('jsonc', '{}')}\n\n${JEST_FENCE}`,
          'line 5: jsonc fence has no <!-- jest-config --> marker',
        ],
        [
          'an unmarked JSON5 fence',
          `${fence('JSON5', '{}')}\n\n${JEST_FENCE}`,
          'line 5: JSON5 fence has no <!-- jest-config --> marker',
        ],
      ];

      describe('rejects', () => {
        const docs: Record<string, string> = {};
        CASES.forEach(
          ([, markdown], index) => (docs[`case-${index}/MIGRATION.md`] = bare(markdown))
        );
        const run = runCheck(docs, {});

        it('with a failing exit status', () => expect(run.status).toBe(1));

        it.each(CASES.map(([name, , message], index) => [name, message, index] as const))(
          '%s',
          (_name, message, index) => {
            const report = run.reports[`case-${index}/MIGRATION.md`]!;
            expect(report.join('\n')).toContain(message);
            // A difference adds detail lines under its message.
            expect(report.filter(line => line.startsWith('  - '))).toHaveLength(1);
          }
        );
      });

      it('shows both values of a difference', () => {
        const run = runCheck(
          { 'MIGRATION.md': bare(jestFence({ type: 'commonjs', scripts, jest })) },
          {}
        );
        expect(run.reports['MIGRATION.md']).toEqual([
          `  - line 7: the Jest configuration's "type" differs from ${run.jestFile}:`,
          '      doc:     "commonjs"',
          '      fixture: "module"',
        ]);
      });

      // The fixture side: a changed, invalid or incomplete manifest fails the unchanged guide.
      it.each([
        [
          'a changed fixture',
          JSON.stringify({ ...JEST_CONFIG, jest: { testEnvironment: 'node' } }),
          'the Jest configuration\'s "jest" differs from',
        ],
        ['an invalid fixture', '{ "type": "module", }', `${FIXTURE} cannot be read as JSON`],
        ['a fixture without jest', JSON.stringify({ type, scripts }), `${FIXTURE} has no "jest"`],
        [
          'a fixture without a test script',
          JSON.stringify({ type, scripts: {}, jest }),
          `${FIXTURE} has no "scripts.test"`,
        ],
      ])('rejects %s', (_name, manifest, message) => {
        const run = runCheck({ 'MIGRATION.md': bare(JEST_FENCE) }, {}, manifest);
        const report = run.reports['MIGRATION.md']!;
        expect(report.join('\n')).toContain(message);
        expect(report.filter(line => line.startsWith('  - '))).toHaveLength(1);
        expect(run.status).toBe(1);
      });

      // The marker is the guide's alone; elsewhere it binds nothing and json fences need none.
      it.each(['README.md', 'docs/THEMING.md', 'docs/ACCESSIBILITY.md'])(
        'rejects the marker in %s',
        name => {
          const markdown = `# Doc\n\n${JEST_FENCE}\n\n${fence('json', '{}')}\n`;
          // README.md and THEMING.md also report the types and tokens this sample leaves out.
          const report = runCheck({ [name]: markdown }, {}).reports[name]!;
          expect(report.filter(line => /jest|json/i.test(line))).toEqual([
            '  - line 3: the Jest marker is allowed only in MIGRATION.md',
          ]);
        }
      );
    });

    // The guide's allowances apply to no other document: the reference names stay rejected.
    it.each(['README.md', 'docs/THEMING.md', 'docs/ACCESSIBILITY.md'])(
      'keeps rejecting 0.x names and markers in %s',
      name => {
        const markdown =
          '# Doc\n\nFrom 0.x → 2.0: replace `useToast` and ' +
          '`react-elegant-toasts/dist/styles.css`.\n\n' +
          '<!-- 0.x -->\n\n```tsx\nconst { addToast } = useToast();\n```\n';
        const report = runCheck({ [name]: markdown }, {}).reports[name]!;
        expect(report).toEqual(
          expect.arrayContaining([
            '  - line 3: useToast is 0.x API',
            '  - line 3: react-elegant-toasts/dist/styles.css is not a package export',
            '  - line 5: the 0.x marker is allowed only in MIGRATION.md',
            '  - line 8: addToast is 0.x API',
            '  - line 8: useToast is 0.x API',
          ])
        );
      }
    );
  });

  it('rejects unused, duplicate and unclosed example regions', () => {
    const run = runCheck(
      { 'passing.md': PASSING, 'other.md': OTHER },
      {
        'sample.tsx': `${REGION}// #region spare\ntoast('Spare');\n// #endregion\n`,
        // Read after sample.tsx, so its `sample` is the duplicate.
        'z-broken.tsx': '// #region sample\n// #endregion\n// #region open\ntoast();\n',
      }
    );
    expect(run.reports).toEqual({ 'passing.md': [], 'other.md': [] });
    expect(run.output).toContain('region spare is not used by any document');
    expect(run.output).toMatch(/z-broken\.tsx:1: duplicate region sample/);
    expect(run.output).toMatch(/z-broken\.tsx: region open is never closed/);
    expect(run.status).toBe(1);
  });

  it('passes on the real documents and the fixture examples', () => {
    const result = spawnSync(process.execPath, [CHECK], { cwd: root, encoding: 'utf8' });
    expect(result.stdout).toContain('README.md: documentation checks OK');
    expect(result.stdout).toContain('docs/THEMING.md: documentation checks OK');
    expect(result.stdout).toContain('docs/ACCESSIBILITY.md: documentation checks OK');
    expect(result.stdout).toContain('docs/MIGRATION.md: documentation checks OK');
    expect(result.stdout).toContain(
      'fixtures/consumer-vite/src/docs: 21 example regions, all in use'
    );
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  });
});
