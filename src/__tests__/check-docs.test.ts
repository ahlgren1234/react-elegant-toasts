// The documentation checks (P-26 S2 to S4): scripts/check-docs.js, which `npm run lint` runs on the
// reference documents. Each sample is a Markdown file in a temporary directory, checked together
// with a temporary examples directory, so the controls never depend on the real documents. The
// last test runs the script on the real documents and the fixture's examples.
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

interface Run {
  status: number | null;
  output: string;
  /** Each document's violation lines, or an empty list when it passed. */
  reports: Record<string, string[]>;
}

/** Runs the check on `docs` (name → Markdown) with `examples` (file name → source). */
function runCheck(
  docs: Record<string, string>,
  examples: Record<string, string> = { 'sample.tsx': REGION }
): Run {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-docs-'));
  try {
    const exampleDir = path.join(tmp, 'examples');
    fs.mkdirSync(exampleDir);
    for (const [name, text] of Object.entries(examples)) {
      fs.writeFileSync(path.join(exampleDir, name), text);
    }
    const files = Object.entries(docs).map(([name, text]) => {
      const file = path.join(tmp, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      return file;
    });
    const result = spawnSync(process.execPath, [CHECK, '--examples', exampleDir, ...files], {
      cwd: root,
      encoding: 'utf8',
    });
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
    return { status: result.status, output, reports };
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
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  });
});
