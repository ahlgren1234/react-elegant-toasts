// Checks the shipped stylesheet's namespace contract (§21, OQ-25, AC-CSS-1, D-23).
// Run by `npm run lint`. With path arguments it checks those files instead of src/styles.css.
//
// The stylesheet is parsed by jsdom's CSSOM, so rules, at-rules, declarations and priorities come
// from a real CSS parser. Selectors are then split with a scanner that respects parentheses,
// brackets and strings. Every rule must be one of the allowed kinds, and:
// - every complex selector carries at least one class, and every class is `ret-*`;
// - no ID selectors;
// - attribute selectors use only the documented hooks, in a compound that has a `ret-*` class;
// - every keyframe name is `ret-*`;
// - every custom property declared or read through `var()` is `--ret-*`;
// - no `!important`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'ret-';
// The documented data attributes (OQ-25). Later phases extend this list as they document more.
const ATTRIBUTES = ['data-theme', 'data-position', 'data-phase'];

/**
 * Splits `text` at top-level occurrences of characters matched by `isSeparator`: outside
 * parentheses, brackets and strings.
 */
function splitTopLevel(text, isSeparator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (depth === 0 && isSeparator(char)) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

/** Replaces strings and attribute selectors with placeholders, returning the attribute names. */
function maskAttributes(selector) {
  const attributes = [];
  let masked = '';
  let quote = null;
  let bracket = -1;
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (bracket >= 0) {
      if (char === ']') {
        attributes.push(
          selector
            .slice(bracket + 1, i)
            .split(/[~|^$*]?=/)[0]
            .trim()
        );
        masked += '[]';
        bracket = -1;
      }
    } else if (char === '[') {
      bracket = i;
    } else {
      masked += char;
    }
  }
  return { masked, attributes };
}

const classesOf = text => [...text.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map(match => match[1]);

function checkSelector(selector, report) {
  const { masked, attributes } = maskAttributes(selector);
  const classes = classesOf(masked);
  if (classes.length === 0) report(`selector "${selector}" has no ret- class`);
  for (const name of classes) {
    if (!name.startsWith(PREFIX)) report(`selector "${selector}" uses unprefixed class .${name}`);
  }
  if (/#-?[A-Za-z_]/.test(masked)) report(`selector "${selector}" uses an ID selector`);
  for (const name of attributes) {
    if (!ATTRIBUTES.includes(name)) {
      report(`selector "${selector}" uses undocumented attribute [${name}]`);
    }
  }
  // Each compound that has an attribute selector must also have a ret- class.
  for (const compound of splitTopLevel(selector, char => /[\s>+~]/.test(char))) {
    const parts = maskAttributes(compound);
    if (parts.attributes.length > 0 && !classesOf(parts.masked).some(c => c.startsWith(PREFIX))) {
      report(`selector "${selector}" has an attribute selector outside a ret- compound`);
    }
  }
}

function checkDeclarations(rule, where, report) {
  const { style } = rule;
  for (let i = 0; i < style.length; i++) {
    const property = style[i];
    const value = style.getPropertyValue(property);
    if (property.startsWith('--') && !property.startsWith(`--${PREFIX}`)) {
      report(`${where} declares unprefixed custom property ${property}`);
    }
    for (const match of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!match[1].startsWith(`--${PREFIX}`)) {
        report(`${where} reads unprefixed custom property ${match[1]}`);
      }
    }
    if (style.getPropertyPriority(property) === 'important') {
      report(`${where} uses !important on ${property}`);
    }
  }
}

function checkRules(rules, report) {
  for (const rule of rules) {
    const kind = rule.constructor.name;
    if (kind === 'CSSStyleRule') {
      for (const selector of splitTopLevel(rule.selectorText, char => char === ',')) {
        checkSelector(selector, report);
      }
      checkDeclarations(rule, `rule "${rule.selectorText}"`, report);
    } else if (kind === 'CSSMediaRule' || kind === 'CSSSupportsRule') {
      checkRules(rule.cssRules, report);
    } else if (kind === 'CSSKeyframesRule') {
      if (!rule.name.startsWith(PREFIX)) report(`keyframes "${rule.name}" are not ret- prefixed`);
      for (const frame of rule.cssRules) {
        checkDeclarations(frame, `keyframes "${rule.name}"`, report);
      }
    } else {
      report(`${kind} is not allowed in the stylesheet`);
    }
  }
}

/** The contract violations in a stylesheet's text, empty when it passes. */
function checkStyles(css) {
  const { document } = new JSDOM().window;
  const element = document.createElement('style');
  element.textContent = css;
  document.head.append(element);
  const violations = [];
  checkRules(element.sheet.cssRules, message => violations.push(message));
  return violations;
}

const files = process.argv.length > 2 ? process.argv.slice(2) : ['src/styles.css'];
for (const file of files.map(name => path.resolve(root, name))) {
  const violations = checkStyles(fs.readFileSync(file, 'utf8'));
  // Paths are printed as given relative to the repository, or absolute outside it.
  const name = path.relative(root, file).startsWith('..') ? file : path.relative(root, file);
  if (violations.length > 0) {
    console.error(`${name} breaks the stylesheet contract (AC-CSS-1):`);
    for (const message of violations) console.error(`  - ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`${name}: stylesheet contract OK`);
  }
}
