// Checks the reference documentation (P-26, §31; AC-REL-2 and AC-PKG-6 in part). Run by
// `npm run lint`. With path arguments it checks those files instead of DOCS, and
// `--examples <dir>` reads the example regions from another directory.
//
// The checks are deliberately narrow: each one matches a fixed pattern that cannot occur by
// accident, so a pass means something and a failure points at one line. Prose accuracy and
// claims about behaviour or browsers stay with manual review. A line scanner separates fenced
// code from prose; nothing else of Markdown is parsed.
// - every `--ret-*` name is a token the stylesheet declares, and THEMING.md names all of them;
// - every `ret-*` class is a documented one, and every `data-*` name a documented attribute;
// - every `react-elegant-toasts/…` subpath is in the package's `exports` map (no `dist/` paths);
// - no 0.x API names, and no placeholders. MIGRATION.md alone may name the 0.x API and its
//   stylesheet path, inside inline code or a fence marked `<!-- 0.x -->`; it must say "0.x → 2.0"
//   and never "v1";
// - relative links reach an existing file, and anchors a heading or `id` in it; links to this
//   repository on GitHub (`…/blob/<ref>/<path>`) are checked the same way against the local file;
// - README.md has no relative links other than `#anchors`, since npm shows it without the docs,
//   and names every public type the package entry exports;
// - every fence names its language, so no TypeScript example escapes the checks below untagged;
// - each TS or TSX fence follows an `<!-- example: <id> -->` marker and equals that region of the
//   fixture's examples, which validate-package.js type-checks against the packed package; every
//   region is used by a checked document. In MIGRATION.md a fence marked `<!-- 0.x -->` instead
//   shows 0.x code, which is never type-checked;
// - MIGRATION.md has exactly one json fence, after `<!-- jest-config -->`, and no other JSON fence.
//   Parsed, it has exactly the `type`, `scripts.test` and `jest` fields of the Jest consumer's
//   package.json (J1, P-27 S3), with equal values in any key order. `--jest <file>` reads another
//   manifest.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// docs/V2_PLAN.md and browser/MANUAL_QA.md are internal records and are never checked.
const DOCS = ['README.md', 'docs/THEMING.md', 'docs/ACCESSIBILITY.md', 'docs/MIGRATION.md'];
const EXAMPLES = 'fixtures/consumer-vite/src/docs';
// The Jest consumer (J1) whose configuration MIGRATION.md shows (P-27 S3).
const JEST_FIXTURE = 'fixtures/consumer-jest/package.json';
// The document that must name every token.
const TOKEN_REFERENCE = 'THEMING.md';
// The document that must name every public type, and may link only absolutely.
const README = 'README.md';
// The migration guide (P-27), the one document that may name the 0.x API on purpose.
const MIGRATION = 'MIGRATION.md';
const MIGRATION_PHRASE = '0.x → 2.0';
// A file of this repository on GitHub, at any branch or tag: the path, then an optional anchor.
const REPO_FILE =
  /^https:\/\/github\.com\/ahlgren1234\/react-elegant-toasts\/blob\/[^/]+\/([^#?]+)(?:#(.*))?$/;

// The documented classes (OQ-25, P-26 S2). Everything else with the prefix is internal, such as
// the live regions, the progress fill, the spinner, the keyframes and the toast's text block.
const CLASSES = [
  'ret-toaster',
  'ret-toaster__list',
  'ret-toast',
  ...['default', 'success', 'error', 'warning', 'info', 'loading', 'custom'].map(
    type => `ret-toast--${type}`
  ),
  'ret-toast__icon',
  'ret-toast__content',
  'ret-toast__description',
  'ret-toast__action',
  'ret-toast__close',
  'ret-toast__progress',
];
// The documented data attributes, as in scripts/check-styles.js.
const ATTRIBUTES = ['data-theme', 'data-position', 'data-phase', 'data-paused'];
// The 0.x API (§6.8) and its options and props, none of which exists in 2.x.
const V1_NAMES = [
  'ToastProvider',
  'useToast',
  'addToast',
  'updateToast',
  'removeToast',
  'removeAll',
  'ToastContainer',
  'ToastAnimation',
  'ToastProps',
  'ToastProviderProps',
  'ToastContextValue',
  'pauseOnHover',
  'pauseOnFocusLoss',
  'pauseOnPageIdle',
  'closeOnClick',
  'progressBar',
  'maxToasts',
  'defaultPosition',
  'defaultAnimation',
  'defaultDuration',
  'containerClassName',
  'containerStyle',
];
// The 0.x stylesheet path, which MIGRATION.md shows as the import to replace.
const LEGACY_SUBPATHS = ['dist/styles.css'];
const PLACEHOLDERS = [
  /\b(?:TODO|TBD|FIXME|XXX)\b/,
  /lorem ipsum/i,
  /yourusername/i,
  /\byour name\b/i,
  /coming soon/i,
  /\]\(\s*\)/,
];
const TS_LANGUAGES = ['ts', 'tsx', 'typescript', 'js', 'jsx', 'javascript'];

const MARKER = /^<!--\s*example:\s*([\w-]+)\s*-->$/;
const LEGACY_MARKER = /^<!--\s*0\.x\s*-->$/;
const JEST_MARKER = /^<!--\s*jest-config\s*-->$/;
const JSON_LANGUAGES = ['json', 'jsonc', 'json5'];
// The Jest consumer's fields the guide shows: `true` is a value compared whole.
const JEST_FIELDS = { type: true, scripts: { test: true }, jest: true };
const INLINE_CODE = /`[^`]*`/g;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w-]*)/;
// `--ret-*` custom properties and bare `ret-*` names, which are classes or keyframes.
const RET_NAME = /(?<![\w-])(--)?ret-[\w-]*\w/g;
const PACKAGE_PATH = /(?<![\w./-])react-elegant-toasts\/([\w./-]*\w)/g;
const LINK = /\[[^\]]*\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/g;

/** The custom properties the stylesheet declares in any rule: the public token set. */
function readTokens() {
  const { document } = new JSDOM().window;
  const element = document.createElement('style');
  element.textContent = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
  document.head.append(element);
  const tokens = new Set();
  const walk = rules => {
    for (const rule of rules) {
      if (rule.cssRules) walk(rule.cssRules);
      for (const property of rule.style ?? []) if (property.startsWith('--')) tokens.add(property);
    }
  };
  walk(element.sheet.cssRules);
  return tokens;
}

/** The types the package entry exports, from the `export type { … }` lists of src/index.ts. */
function readTypeExports() {
  const entry = fs.readFileSync(path.join(root, 'src/index.ts'), 'utf8');
  return [...entry.matchAll(/export type \{([^}]*)\}/g)].flatMap(([, list]) =>
    list
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)
  );
}

/** The package's public subpaths, from its `exports` map. */
function readSubpaths() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return Object.keys(pkg.exports)
    .filter(key => key !== '.')
    .map(key => key.slice(2));
}

/** Splits a document into prose lines and fenced blocks, with 1-based line numbers. */
function scan(text) {
  const prose = [];
  const fences = [];
  let fence = null;
  text.split('\n').forEach((line, index) => {
    const number = index + 1;
    if (fence) {
      const close = line.match(FENCE);
      if (close && close[1][0] === fence.marker[0] && close[1].length >= fence.marker.length) {
        fences.push(fence);
        fence = null;
      } else fence.body.push(line);
      return;
    }
    const open = line.match(FENCE);
    if (open) fence = { line: number, marker: open[1], language: open[2], body: [] };
    else prose.push({ line: number, text: line });
  });
  if (fence) fences.push({ ...fence, unclosed: true });
  return { prose, fences };
}

/** GitHub's heading anchor: lowercase, punctuation dropped, spaces as hyphens. */
const slug = heading =>
  heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');

/** The anchors a document defines: its headings (with GitHub's `-1` suffixes) and HTML ids. */
function anchorsOf(text) {
  const anchors = new Set();
  const counts = new Map();
  for (const { text: line } of scan(text).prose) {
    const heading = line.match(/^ {0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/);
    if (heading) {
      const base = slug(heading[1]);
      const count = counts.get(base) ?? 0;
      counts.set(base, count + 1);
      anchors.add(count === 0 ? base : `${base}-${count}`);
    }
    for (const match of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) anchors.add(match[1]);
  }
  return anchors;
}

/** Trailing spaces and surrounding blank lines removed, and the common indentation. */
function normalise(lines) {
  const trimmed = lines.map(line => line.trimEnd());
  while (trimmed.length > 0 && trimmed[0] === '') trimmed.shift();
  while (trimmed.length > 0 && trimmed.at(-1) === '') trimmed.pop();
  const indent = Math.min(
    ...trimmed.filter(Boolean).map(line => line.length - line.trimStart().length)
  );
  return trimmed.map(line => line.slice(Number.isFinite(indent) ? indent : 0));
}

/** The `// #region <id>` blocks of every TS or TSX file under `dir`. */
function readRegions(dir, report) {
  const regions = new Map();
  if (!fs.existsSync(dir)) return regions;
  const files = fs
    .readdirSync(dir, { recursive: true })
    .filter(name => /\.(ts|tsx)$/.test(name))
    .sort();
  for (const name of files) {
    const file = path.join(dir, name);
    const where = display(file);
    let open = null;
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const start = line.match(/^\s*\/\/ #region ([\w-]+)\s*$/);
        if (start) {
          if (open) report(`${where}:${index + 1}: region ${start[1]} opens inside ${open.id}`);
          else {
            // A duplicate is still read to its #endregion, but the first region of that id wins.
            const duplicate = regions.has(start[1]);
            if (duplicate) report(`${where}:${index + 1}: duplicate region ${start[1]}`);
            open = { id: start[1], duplicate, lines: [] };
          }
        } else if (/^\s*\/\/ #endregion\b/.test(line)) {
          if (!open) report(`${where}:${index + 1}: #endregion without a region`);
          else if (!open.duplicate) regions.set(open.id, { where, lines: normalise(open.lines) });
          open = null;
        } else open?.lines.push(line);
      });
    if (open) report(`${where}: region ${open.id} is never closed`);
  }
  return regions;
}

const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The fields of `value` that `shape` names, by dotted path. Each missing field, and each nested one
 * that is not an object, is a problem for `subject`; with `strict`, so is each field not in `shape`.
 */
function syncedFields(value, shape, subject, problem, strict, prefix = '') {
  const fields = new Map();
  if (strict) {
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(shape, key)) {
        problem(`${subject}'s "${prefix}${key}" is not a synchronised field`);
      }
    }
  }
  for (const [key, nested] of Object.entries(shape)) {
    const name = `${prefix}${key}`;
    if (!Object.hasOwn(value, key)) problem(`${subject} has no "${name}"`);
    else if (nested === true) fields.set(name, value[key]);
    else if (!isObject(value[key])) problem(`${subject}'s "${name}" must be an object`);
    else {
      for (const field of syncedFields(value[key], nested, subject, problem, strict, `${name}.`)) {
        fields.set(...field);
      }
    }
  }
  return fields;
}

/** The Jest consumer's synchronised fields, or the problems that prevent reading them. */
function readJestFixture(file) {
  const where = display(file);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { where, problems: [`${where} cannot be read as JSON: ${error.message}`] };
  }
  if (!isObject(value)) return { where, problems: [`${where} is not a JSON object`] };
  const problems = [];
  const fields = syncedFields(value, JEST_FIELDS, where, message => problems.push(message), false);
  return { where, fields, problems };
}

/**
 * MIGRATION.md's Jest configuration: one json fence after the Jest marker, and no other JSON fence,
 * so the configuration cannot also appear unchecked. Its fields must equal the fixture's.
 */
function checkJestConfig(fences, jestFences, fixture, at, report) {
  for (const fence of fences) {
    if (JSON_LANGUAGES.includes(fence.language.toLowerCase()) && !jestFences.includes(fence)) {
      at(fence.line)(`${fence.language} fence has no <!-- jest-config --> marker`);
    }
  }
  if (jestFences.length === 0) {
    report('the migration guide has no <!-- jest-config --> fence');
    return;
  }
  for (const extra of jestFences.slice(1)) {
    at(extra.line)(
      'a second <!-- jest-config --> fence: the guide shows the Jest configuration once'
    );
  }
  const [fence] = jestFences;
  const here = at(fence.line);
  if (fence.language.toLowerCase() !== 'json') {
    here('the Jest configuration must be a json fence');
    return;
  }
  let value;
  try {
    value = JSON.parse(fence.body.join('\n'));
  } catch (error) {
    here(`the Jest configuration is not valid JSON: ${error.message}`);
    return;
  }
  if (!isObject(value)) {
    here('the Jest configuration must be a JSON object');
    return;
  }
  if (fixture.problems.length > 0) {
    for (const problem of fixture.problems) report(problem);
    return;
  }
  const fields = syncedFields(value, JEST_FIELDS, 'the Jest configuration', here, true);
  for (const [name, expected] of fixture.fields) {
    if (!fields.has(name) || isDeepStrictEqual(fields.get(name), expected)) continue;
    here(
      `the Jest configuration's "${name}" differs from ${fixture.where}`,
      `:\n      doc:     ${JSON.stringify(fields.get(name))}\n      fixture: ${JSON.stringify(expected)}`
    );
  }
}

function checkDocument(file, context, report) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const { prose, fences } = scan(text);
  const at =
    line =>
    (message, detail = '') =>
      report(`line ${line}: ${message}${detail}`);

  const migration = path.basename(file) === MIGRATION;

  // Example, 0.x and Jest markers. Each binds the fence on the next non-blank line.
  const markers = new Map();
  const legacy = new Set();
  const jestFences = [];
  for (const { line, text: content } of prose) {
    const marker = content.trim().match(MARKER);
    const legacyMarker = LEGACY_MARKER.test(content.trim());
    const jestMarker = JEST_MARKER.test(content.trim());
    if (!marker && !legacyMarker && !jestMarker) continue;
    const name = marker
      ? `example ${marker[1]}`
      : legacyMarker
        ? 'the 0.x marker'
        : 'the Jest marker';
    if (!marker && !migration) at(line)(`${name} is allowed only in ${MIGRATION}`);
    const next = lines.findIndex((l, index) => index >= line && l.trim() !== '') + 1;
    const fence = fences.find(f => f.line === next);
    if (!fence) at(line)(`${name} is not followed by a code fence`);
    else if (marker) markers.set(fence, marker[1]);
    // Elsewhere these markers bind nothing, so their fences keep every check.
    else if (!migration) continue;
    else if (legacyMarker) legacy.add(fence);
    else jestFences.push(fence);
  }
  if (migration) checkJestConfig(fences, jestFences, context.jest, at, report);
  // The text of a line that must not name the 0.x API or its stylesheet path. MIGRATION.md may
  // name them in its 0.x fences and in inline code in its prose; anywhere else, and in every other
  // document, the whole line is checked. The exemption trusts only plain inline code: single
  // backticks, in pairs. A prose line with a double backtick or an unpaired one is reported and
  // checked whole, so a malformed span can never hide a name.
  const legacyLines = new Set();
  for (const fence of legacy) fence.body.forEach((_, i) => legacyLines.add(fence.line + 1 + i));
  const proseLines = new Set(prose.map(({ line }) => line));
  const modern = (line, number, here) => {
    if (!migration) return line;
    if (legacyLines.has(number)) return '';
    if (!proseLines.has(number)) return line;
    if (line.includes('``')) {
      here(`inline code in ${MIGRATION} must use single backticks`);
      return line;
    }
    if (line.split('`').length % 2 === 0) {
      here(`unpaired backtick: inline code in ${MIGRATION} must open and close on one line`);
      return line;
    }
    return line.replace(INLINE_CODE, '');
  };

  // Names, subpaths, 0.x API and placeholders, everywhere, code included.
  const named = new Set();
  lines.forEach((line, index) => {
    const here = at(index + 1);
    const checked = modern(line, index + 1, here);
    for (const [name, dashes] of line.matchAll(RET_NAME)) {
      if (dashes) {
        named.add(name);
        if (!context.tokens.has(name)) here(`${name} is not a public token`);
      } else if (!CLASSES.includes(name)) here(`.${name} is not a documented class`);
    }
    for (const [name] of line.matchAll(/(?<![\w-])data-[a-z][\w-]*/g)) {
      if (!ATTRIBUTES.includes(name)) here(`${name} is not a documented attribute`);
    }
    for (const [specifier, subpath] of line.matchAll(PACKAGE_PATH)) {
      if (context.subpaths.includes(subpath)) continue;
      if (!LEGACY_SUBPATHS.includes(subpath) || checked.includes(specifier)) {
        here(`${specifier} is not a package export`);
      }
    }
    for (const name of V1_NAMES) {
      if (new RegExp(`\\b${name}\\b`).test(checked)) here(`${name} is 0.x API`);
    }
    if (migration && /\bv1\b/i.test(line)) here('"v1": 2.0.0 follows 0.x, and there was no 1.x');
    for (const pattern of PLACEHOLDERS) {
      const match = line.match(pattern);
      if (match) here(`placeholder "${match[0]}"`);
    }
  });
  if (path.basename(file) === TOKEN_REFERENCE) {
    for (const token of context.tokens) {
      if (!named.has(token)) report(`the token reference does not name ${token}`);
    }
  }
  if (migration && !text.includes(MIGRATION_PHRASE)) {
    report(`the migration guide does not say "${MIGRATION_PHRASE}"`);
  }
  const readme = path.basename(file) === README;
  if (readme) {
    for (const name of context.types) {
      if (!new RegExp(`\\b${name}\\b`).test(text))
        report(`the README does not name the type ${name}`);
    }
  }

  // Relative links and anchors, in prose only, outside inline code.
  for (const { line, text: content } of prose) {
    for (const [, target] of content.replace(/`[^`]*`/g, '').matchAll(LINK)) {
      const repoFile = target.match(REPO_FILE);
      if (target === '' || (!repoFile && /^[a-z][\w+.-]*:|^\/\//i.test(target))) continue;
      const [pathPart, anchor] = repoFile ? [repoFile[1], repoFile[2]] : target.split('#');
      if (readme && !repoFile && pathPart) {
        at(line)(`relative link ${target}: the README links with absolute GitHub URLs`);
        continue;
      }
      const linked = repoFile
        ? path.resolve(root, decodeURI(pathPart))
        : pathPart
          ? path.resolve(path.dirname(file), decodeURI(pathPart))
          : file;
      if (!fs.existsSync(linked)) {
        at(line)(`link target ${pathPart} does not exist`);
      } else if (anchor !== undefined && linked.endsWith('.md')) {
        if (!anchorsOf(fs.readFileSync(linked, 'utf8')).has(anchor)) {
          at(line)(`anchor #${anchor} is not in ${display(linked)}`);
        }
      }
    }
  }

  // Example fences. A 0.x fence is never compared with a region.
  for (const fence of fences) {
    if (fence.unclosed) at(fence.line)('code fence is never closed');
    if (fence.language === '') at(fence.line)('code fence has no language tag');
    if (legacy.has(fence)) continue;
    const id = markers.get(fence);
    const typed = TS_LANGUAGES.includes(fence.language.toLowerCase());
    if (!id) {
      if (typed) at(fence.line)(`${fence.language} fence has no <!-- example: <id> --> marker`);
      continue;
    }
    if (!typed) {
      at(fence.line)(`example ${id} must be a TS or TSX fence`);
      continue;
    }
    context.used.add(id);
    const region = context.regions.get(id);
    if (!region) {
      at(fence.line)(`example ${id} has no region in ${context.examplesName}`);
      continue;
    }
    const body = normalise(fence.body);
    // The number of the fence's first compared line: blank lines at its top are not compared.
    const first =
      fence.line +
      1 +
      Math.max(
        0,
        fence.body.findIndex(l => l.trim() !== '')
      );
    const differs = Math.max(body.length, region.lines.length);
    for (let i = 0; i < differs; i++) {
      if (body[i] !== region.lines[i]) {
        at(first + i)(
          `example ${id} differs from ${region.where}`,
          `:\n      doc:     ${JSON.stringify(body[i] ?? '')}\n      fixture: ${JSON.stringify(region.lines[i] ?? '')}`
        );
        break;
      }
    }
  }
}

const args = process.argv.slice(2);
/** Removes `<flag> <value>` from the arguments and returns the value, or `fallback`. */
function option(flag, fallback) {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  return args.splice(index, 2)[1];
}
const examplesDir = path.resolve(root, option('--examples', EXAMPLES));
const jestFile = path.resolve(root, option('--jest', JEST_FIXTURE));
const files = (args.length > 0 ? args : DOCS).map(name => path.resolve(root, name));
// Paths are printed as given relative to the repository, or absolute outside it.
const display = file =>
  path.relative(root, file).startsWith('..') ? file : path.relative(root, file);

const regionProblems = [];
const context = {
  tokens: readTokens(),
  subpaths: readSubpaths(),
  types: readTypeExports(),
  regions: readRegions(examplesDir, message => regionProblems.push(message)),
  examplesName: display(examplesDir),
  jest: readJestFixture(jestFile),
  used: new Set(),
};

for (const file of files) {
  const violations = [];
  checkDocument(file, context, message => violations.push(message));
  if (violations.length > 0) {
    console.error(`${display(file)} breaks the documentation checks:`);
    for (const message of violations) console.error(`  - ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`${display(file)}: documentation checks OK`);
  }
}

for (const id of context.regions.keys()) {
  if (!context.used.has(id)) regionProblems.push(`region ${id} is not used by any document`);
}
if (regionProblems.length > 0) {
  console.error(`${context.examplesName} breaks the example checks:`);
  for (const message of regionProblems) console.error(`  - ${message}`);
  process.exitCode = 1;
} else {
  console.log(`${context.examplesName}: ${context.regions.size} example regions, all in use`);
}
