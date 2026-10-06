// The shipped stylesheet's contract (§21, OQ-25, P-17 S1): the `ret-` namespace and its lint gate
// (AC-CSS-1, D-23), the token set scoped to `.ret-toaster`, the CSS-only light, dark and system
// themes (§23), no motion before P-18, and the package-validation marker (P-07). These are
// structural checks of the CSS text and its token palette (S4, S5). Rendered layout, focus and
// forced-colour appearance are verified in real browsers (P-22).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { LIVE_REGION, VISUALLY_HIDDEN } from '../react/announcer';
import { libraryAnimationName } from '../react/motion';

const root = path.resolve(__dirname, '../..');
const STYLES = path.join(root, 'src/styles.css');
const CHECK = path.join(root, 'scripts/check-styles.js');
const css = fs.readFileSync(STYLES, 'utf8');

/** Every style rule in the stylesheet, with the media condition it sits in, if any. */
function styleRules(): { selector: string; media: string | null; style: CSSStyleDeclaration }[] {
  const element = document.createElement('style');
  element.textContent = css;
  document.head.append(element);
  const sheet = element.sheet;
  element.remove();
  const found: { selector: string; media: string | null; style: CSSStyleDeclaration }[] = [];
  const walk = (rules: CSSRuleList, media: string | null) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        found.push({ selector: rule.selectorText, media, style: rule.style });
      } else if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, rule.conditionText);
      }
    }
  };
  if (sheet) walk(sheet.cssRules, null);
  return found;
}

const declarations = (style: CSSStyleDeclaration): Record<string, string> =>
  Object.fromEntries([...style].map(property => [property, style.getPropertyValue(property)]));

const tokensOf = (style: CSSStyleDeclaration): string[] =>
  [...style].filter(property => property.startsWith('--'));

const rules = styleRules();
const ruleFor = (selector: string, media: string | null = null) => {
  const rule = rules.find(r => r.selector === selector && r.media === media);
  if (!rule) throw new Error(`no rule ${selector} in ${media ?? 'the top level'}`);
  return rule;
};
const LIGHT = ruleFor(':where(.ret-toaster)');
const DARK = ruleFor(":where(.ret-toaster[data-theme='dark'])");
const SYSTEM_DARK = ruleFor(
  ":where(.ret-toaster[data-theme='system'])",
  '(prefers-color-scheme: dark)'
);

// The initial documented token set (§21, OQ-24, OQ-25).
const COLOUR_TOKENS = [
  '--ret-surface',
  '--ret-text',
  '--ret-text-muted',
  '--ret-border',
  '--ret-shadow',
  '--ret-focus',
  '--ret-action-surface',
  '--ret-action-text',
  ...['success', 'error', 'warning', 'info', 'loading'].flatMap(type => [
    `--ret-${type}`,
    `--ret-${type}-subtle`,
  ]),
  // P-20 S3 (decision 8, D1 sign-off): the neutral progress fill, set by every theme.
  '--ret-progress',
];
const LAYOUT_TOKENS = [
  '--ret-font-family',
  '--ret-radius',
  '--ret-gap',
  '--ret-offset',
  '--ret-width',
  '--ret-z-index',
  // P-20 S3: the progress strip's thickness, the same in every theme.
  '--ret-progress-height',
];
// Enter and exit motion (P-18 D0, decision 5; S2), with their defaults.
const MOTION_DEFAULTS: Readonly<Record<string, string>> = {
  '--ret-enter-duration': '180ms',
  '--ret-exit-duration': '120ms',
  '--ret-enter-easing': 'cubic-bezier(0.2, 0, 0, 1)',
  '--ret-exit-easing': 'cubic-bezier(0.4, 0, 1, 1)',
};
const MOTION_TOKENS = Object.keys(MOTION_DEFAULTS);

// Class names of the 0.x stylesheet, none of which is part of the 2.x contract.
const LEGACY_CLASSES = [
  'toast',
  'toast-container',
  'toast-content',
  'toast-icon',
  'toast-message',
  'toast-title',
  'toast-progress',
  'success',
  'error',
  'warning',
  'info',
  'rtl',
  'top-right',
  'top-left',
  'top-center',
  'bottom-right',
  'bottom-left',
  'bottom-center',
  'slideIn',
  'fadeIn',
  'zoomIn',
  'bounceIn',
];

// Samples the check must reject, each with a fragment of the expected message.
const FAILING: readonly (readonly [name: string, css: string, message: string])[] = [
  ['a legacy .toast selector', '.toast { color: red; }', 'unprefixed class .toast'],
  ['a legacy .toast-container selector', '.toast-container {}', '.toast-container'],
  ['an arbitrary unprefixed class', '.foo { color: red; }', 'unprefixed class .foo'],
  ['an unprefixed class beside a ret- one', '.ret-toast.success {}', '.success'],
  ['an unprefixed class in :where()', ':where(.ret-toast, .foo) {}', '.foo'],
  ['an unprefixed class in :not()', '.ret-toast:not(.foo) {}', '.foo'],
  ['a :root rule', ':root { --ret-surface: red; }', 'no ret- class'],
  ['an element-only selector', 'button { color: red; }', 'no ret- class'],
  ['an ID selector', '.ret-toast#main {}', 'ID selector'],
  ['an undocumented attribute', '.ret-toast[data-foo] {}', '[data-foo]'],
  ['an attribute outside a ret- compound', '[data-theme] .ret-toast {}', 'outside a ret-'],
  ['an unprefixed custom property', '.ret-toaster { --toast-bg: red; }', '--toast-bg'],
  ['an unprefixed var() read', '.ret-toast { color: var(--brand); }', '--brand'],
  ['unprefixed keyframes', '@keyframes slideIn { to { opacity: 1; } }', 'slideIn'],
  ['!important', '.ret-toast { color: red !important; }', '!important'],
  ['an unprefixed selector inside @media', '@media (min-width: 1px) { .foo {} }', '.foo'],
  ['an @import', "@import 'x.css';", 'not allowed'],
];

// Constructs the check must accept.
const PASSING = [
  "@media (prefers-color-scheme: dark) { :where(.ret-toaster[data-theme='system']) {} }",
  '@supports (inset: 0) { .ret-toaster__list[data-position^="top-"] {} }',
  ':where(.ret-toast):focus-visible::after { color: var(--ret-focus); }',
  '.ret-toast[data-phase="exiting"] > .ret-toast__close svg {}',
  // P-20 S2: `data-paused` is documented (decision 1); S3 styles it.
  '.ret-toast[data-phase="visible"]:not([data-paused]) > .ret-toast__progress {}',
  '@keyframes ret-example { to { opacity: 1; } }',
].join('\n');

/**
 * One run of the check over the shipped stylesheet and every sample, in a single process. Reports
 * are in that order: the stylesheet, the failing samples, then the passing one.
 */
function runCheck(): { status: number | null; reports: string[] } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-styles-'));
  try {
    const samples = [...FAILING.map(([, text]) => text), PASSING].map((text, index) => {
      const file = path.join(tmp, `case-${index}.css`);
      fs.writeFileSync(file, text);
      return file;
    });
    const files = [STYLES, ...samples];
    const result = spawnSync(process.execPath, [CHECK, ...files], { cwd: root, encoding: 'utf8' });
    // Each file's report: its OK line, or its header and the violation lines under it.
    const lines = `${result.stdout}${result.stderr}`.split('\n');
    const reports = files.map(file => {
      const name = file === STYLES ? 'src/styles.css' : file;
      const start = lines.findIndex(
        line => line.startsWith(`${name}:`) || line.startsWith(`${name} `)
      );
      const block = [lines[start] ?? ''];
      for (let i = start + 1; start >= 0 && lines[i]?.startsWith('  - '); i++)
        block.push(lines[i] ?? '');
      return block.join('\n');
    });
    return { status: result.status, reports };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe('AC-CSS-1: the ret- namespace check (D-23)', () => {
  let result: ReturnType<typeof runCheck>;
  beforeAll(() => {
    result = runCheck();
  }, 30_000);
  const report = (index: number) => result.reports[index] ?? '';

  it('passes the shipped stylesheet', () => {
    expect(report(0)).toBe('src/styles.css: stylesheet contract OK');
  });

  it('exits with a failure when any file breaks the contract', () => {
    expect(result.status).toBe(1);
  });

  it.each(FAILING.map(([name, , message], index) => [name, message, index + 1] as const))(
    'fails %s',
    (_name, message, index) => {
      expect(report(index)).toContain('breaks the stylesheet contract');
      expect(report(index)).toContain(message);
    }
  );

  it('accepts at-rules, pseudo-classes, pseudo-elements and anchored documented attributes', () => {
    expect(report(FAILING.length + 1)).toMatch(/: stylesheet contract OK$/);
  });
});

describe('namespace (§21, OQ-25)', () => {
  it('keeps no 0.x class', () => {
    const classes = new Set(
      rules.flatMap(rule => [...rule.selector.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map(m => m[1]))
    );
    expect(LEGACY_CLASSES.filter(name => classes.has(name))).toEqual([]);
    expect([...classes].every(name => name?.startsWith('ret-'))).toBe(true);
  });

  it('declares and reads only --ret- custom properties', () => {
    for (const rule of rules) {
      for (const [property, value] of Object.entries(declarations(rule.style))) {
        if (property.startsWith('--')) expect(property).toMatch(/^--ret-/);
        for (const match of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
          expect(match[1]).toMatch(/^--ret-/);
        }
      }
    }
  });

  it('anchors data-theme to the toaster root', () => {
    for (const rule of rules.filter(r => r.selector.includes('data-theme'))) {
      expect(rule.selector).toMatch(/^:where\(\.ret-toaster\[data-theme='(dark|system)'\]\)$/);
    }
  });
});

describe('tokens (§21, OQ-25)', () => {
  it('declares every documented token on the toaster root, and no other token anywhere', () => {
    const documented = [...COLOUR_TOKENS, ...LAYOUT_TOKENS, ...MOTION_TOKENS].sort();
    // 28 until P-20 S3, which adds exactly the two progress tokens.
    expect(documented).toHaveLength(30);
    expect(tokensOf(LIGHT.style).sort()).toEqual(documented);
    expect([...new Set(rules.flatMap(rule => tokensOf(rule.style)))].sort()).toEqual(documented);
  });

  it('scopes every token to .ret-toaster, never :root or a document element', () => {
    for (const rule of rules.filter(r => tokensOf(r.style).length > 0)) {
      expect(rule.selector).toMatch(/^:where\(\.ret-toaster(\[data-theme='(dark|system)'\])?\)$/);
    }
    for (const rule of rules) expect(rule.selector).not.toMatch(/:root|\bhtml\b|\bbody\b/);
  });

  // OQ-25: an ordinary consumer rule such as `.ret-toaster { --ret-surface: … }` overrides every
  // default without `!important`. A selector made only of one `:where()` has zero specificity, so
  // any consumer selector outranks it, and no default is important.
  it('lets any consumer selector override every token default without !important', () => {
    for (const rule of rules.filter(r => tokensOf(r.style).length > 0)) {
      expect(rule.selector).toMatch(/^:where\([^()]*\)$/);
      for (const token of tokensOf(rule.style)) {
        expect(rule.style.getPropertyPriority(token)).toBe('');
      }
    }
  });

  it('defines exactly four motion tokens, with their defaults, on the root only (P-18 S2)', () => {
    const tokens = rules.flatMap(rule => tokensOf(rule.style));
    expect(
      tokens.filter(token => /motion|duration|delay|eas(e|ing)|animation|enter|exit/.test(token))
    ).toEqual(MOTION_TOKENS);
    for (const [token, value] of Object.entries(MOTION_DEFAULTS)) {
      // jsdom drops the spaces after commas in a custom property's value.
      expect(LIGHT.style.getPropertyValue(token).replace(/\s+/g, '')).toBe(
        value.replace(/\s+/g, '')
      );
    }
    // Not theme values: neither dark block repeats them.
    for (const block of [DARK, SYSTEM_DARK]) {
      expect(tokensOf(block.style).filter(token => MOTION_TOKENS.includes(token))).toEqual([]);
    }
  });

  // Narrowed by P-20 S3 from "no progress token": exactly the two locked progress tokens, and
  // still no stack, spinner, swipe, track, duration or easing token.
  it('defines exactly the two progress tokens, and no stack, spinner or swipe token', () => {
    const tokens = [...new Set(rules.flatMap(rule => tokensOf(rule.style)))];
    expect(tokens.filter(token => /progress/.test(token)).sort()).toEqual([
      '--ret-progress',
      '--ret-progress-height',
    ]);
    expect(tokens.filter(token => /transition|spin|stack|swipe|track/.test(token))).toEqual([]);
  });
});

describe('themes (§21, §23, AC-CSS-2)', () => {
  it('defaults to the light colour scheme, which also covers system in light mode', () => {
    expect(LIGHT.style.getPropertyValue('color-scheme')).toBe('light');
  });

  it('gives dark every colour token', () => {
    expect(DARK.style.getPropertyValue('color-scheme')).toBe('dark');
    expect(tokensOf(DARK.style).sort()).toEqual([...COLOUR_TOKENS].sort());
  });

  it('resolves system through prefers-color-scheme, with exactly the dark values', () => {
    expect(declarations(SYSTEM_DARK.style)).toEqual(declarations(DARK.style));
  });

  it('changes only token values and the colour scheme per theme, with no theme-specific rules', () => {
    for (const rule of [DARK, SYSTEM_DARK]) {
      expect([...rule.style].filter(p => !p.startsWith('--') && p !== 'color-scheme')).toEqual([]);
    }
  });

  it('adds no JavaScript colour-scheme listener', () => {
    const sources = ['react', 'store']
      .flatMap(dir =>
        fs.readdirSync(path.join(root, 'src', dir)).map(f => path.join('src', dir, f))
      )
      .concat('src/index.ts', 'src/toast.ts', 'src/types.ts');
    for (const file of sources) {
      expect(fs.readFileSync(path.join(root, file), 'utf8')).not.toMatch(
        /matchMedia|prefers-color-scheme/
      );
    }
  });
});

/**
 * The declarations that the stylesheet's top-level rules give `element`, by selector matching,
 * later rules winning. Every default has the same zero specificity, so source order decides. This
 * is the cascade of the stylesheet's own rules, not computed layout.
 */
function declared(element: Element): Record<string, string> {
  return Object.assign(
    {},
    ...rules
      .filter(r => r.media === null && element.matches(r.selector))
      .map(r => declarations(r.style))
  ) as Record<string, string>;
}

function listAt(position: string): HTMLOListElement {
  const list = document.createElement('ol');
  list.className = 'ret-toaster__list';
  list.setAttribute('data-position', position);
  return list;
}

const POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;
// Placement and box properties that would let the region cover the viewport.
const OVERLAY =
  /^(position|inset|top|right|bottom|left|width|height|min-|max-|z-index|pointer-events)/;

describe('positions and stacks (§12, P-17 S2)', () => {
  it.each(POSITIONS)('places %s in the viewport from its physical edges', position => {
    const [vertical, horizontal] = position.split('-') as [string, string];
    const css = declared(listAt(position));
    expect(css.position).toBe('fixed');
    const other = vertical === 'top' ? 'bottom' : 'top';
    expect(css[vertical]).toBe(`calc(var(--ret-offset) + env(safe-area-inset-${vertical}, 0px))`);
    expect(css[other]).toBeUndefined();
    if (horizontal === 'center') {
      expect([css.left, css.right, css['margin-left'], css['margin-right']]).toEqual([
        '0px',
        '0px',
        'auto',
        'auto',
      ]);
    } else {
      const opposite = horizontal === 'left' ? 'right' : 'left';
      expect(css[horizontal]).toBe(
        `calc(var(--ret-offset) + env(safe-area-inset-${horizontal}, 0px))`
      );
      expect(css[opposite]).toBeUndefined();
    }
  });

  it('stacks each list as a plain column in DOM order, with no reordering anywhere', () => {
    const css = declared(listAt('top-right'));
    expect([css.display, css['flex-direction']]).toEqual(['flex', 'column']);
    for (const rule of rules) {
      for (const [property, value] of Object.entries(declarations(rule.style))) {
        expect(property).not.toMatch(/^(order|direction|grid-auto-flow|writing-mode)$/);
        expect(value).not.toMatch(/reverse|dense/);
      }
    }
  });

  it('resets the list and spaces toasts with the gap token, above the page by the z-index token', () => {
    const css = declared(listAt('bottom-left'));
    expect(css).toMatchObject({
      margin: '0px',
      padding: '0px',
      'list-style': 'none',
      'box-sizing': 'border-box',
      gap: 'var(--ret-gap)',
      'z-index': 'var(--ret-z-index)',
    });
  });

  it('bounds the stack to --ret-width and to the viewport minus both gutters, so it shrinks', () => {
    expect(declared(listAt('top-center')).width?.replace(/\s+/g, ' ')).toBe(
      'min( var(--ret-width), 100% - 2 * var(--ret-offset) - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) )'
    );
    // Viewport units would include the scrollbar; the fixed list's 100% is the viewport without it.
    expect(css).not.toMatch(/\d(vw|vh|dvw|svw|lvw)\b/);
  });

  it('keeps every position physical: no logical inset, margin or size and no direction selector', () => {
    for (const rule of rules.filter(r => r.selector.includes('ret-toaster__list'))) {
      expect(rule.selector).not.toMatch(/dir/);
      expect([...rule.style].filter(p => /inline|block|inset/.test(p))).toEqual([]);
    }
  });

  it('gives the region no box or pointer rule, so it never covers the page', () => {
    const region = document.createElement('section');
    region.className = 'ret-toaster';
    for (const theme of ['light', 'dark', 'system']) {
      region.setAttribute('data-theme', theme);
      expect(Object.keys(declared(region)).filter(p => OVERLAY.test(p))).toEqual([]);
    }
  });

  it('leaves pointer input on for the lists and the toasts', () => {
    const toast = document.createElement('li');
    toast.className = 'ret-toast ret-toast--success';
    for (const element of [listAt('top-right'), toast]) {
      expect(declared(element)['pointer-events']).not.toBe('none');
    }
  });

  it('lets a toast fill its stack with its padding and border inside it', () => {
    const toast = document.createElement('li');
    toast.className = 'ret-toast ret-toast--default';
    expect(declared(toast)['box-sizing']).toBe('border-box');
  });

  it('gives the live regions only their visually hidden class rule (§17.1, S5)', () => {
    for (const attributes of [
      { role: 'status', 'aria-live': 'polite' },
      { 'aria-live': 'assertive' },
    ]) {
      const region = document.createElement('div');
      region.className = LIVE_REGION;
      for (const [name, value] of Object.entries(attributes)) region.setAttribute(name, value);
      expect(rules.filter(r => region.matches(r.selector)).map(r => r.selector)).toEqual([
        `.${LIVE_REGION}`,
      ]);
    }
  });
});

/** A toast `<li>` of `type`, with the normal or custom children the renderer gives it. */
function toastOf(type: string, parts: readonly string[] = []): HTMLLIElement {
  const item = document.createElement('li');
  item.className = `ret-toast ret-toast--${type}`;
  for (const part of parts) {
    const child = document.createElement(
      part === 'icon' ? 'span' : part.endsWith('n') ? 'button' : 'div'
    );
    if (part !== 'custom') child.className = `ret-toast__${part}`;
    item.append(child);
  }
  return item;
}

const partOf = (item: Element, part: string): Element => {
  const element = item.querySelector(`.ret-toast__${part}`);
  if (!element) throw new Error(`no ${part}`);
  return element;
};

// The card's properties, none of which a custom toast may receive (§6.4).
const CARD =
  /^(display|gap|padding|border|background|box-shadow|color|font|line-height|letter-spacing|text-)/;

describe('the toast card, content and controls (§17.2, OQ-24, P-17 S3)', () => {
  it('makes every normal type a neutral elevated card from the public tokens', () => {
    for (const type of ['default', 'success', 'error', 'warning', 'info', 'loading']) {
      expect(declared(toastOf(type))).toMatchObject({
        display: 'flex',
        'align-items': 'flex-start',
        border: '1px solid var(--ret-border)',
        'border-radius': 'var(--ret-radius)',
        background: 'var(--ret-surface)',
        'box-shadow': 'var(--ret-shadow)',
        color: 'var(--ret-text)',
        'font-family': 'var(--ret-font-family)',
        'font-size': '14px',
        'line-height': '20px',
        'font-weight': '400',
      });
    }
  });

  it('gives a custom toast no card chrome, only its box sizing, the close anchor and repositioning', () => {
    const custom = declared(toastOf('custom', ['custom', 'close']));
    expect(Object.keys(custom).filter(p => CARD.test(p))).toEqual([]);
    expect(custom).toEqual({ 'box-sizing': 'border-box', position: 'relative', ...REPOSITION });
  });

  it('sets the description below the primary text: smaller, muted, still the same column', () => {
    const item = toastOf('info', ['icon', 'content', 'close']);
    const content = partOf(item, 'content');
    const title = document.createElement('div');
    title.className = 'ret-toast__title';
    const description = document.createElement('div');
    description.className = 'ret-toast__description';
    content.append(title, description);
    expect(declared(title)['font-weight']).toBe('600');
    expect(declared(description)).toMatchObject({
      color: 'var(--ret-text-muted)',
      'font-size': '13px',
      'line-height': '18px',
    });
  });

  it('lets the text column shrink and wrap long words and URLs, without truncating', () => {
    const content = partOf(toastOf('default', ['content']), 'content');
    expect(declared(content)).toMatchObject({
      'flex-grow': '1',
      'flex-shrink': '1',
      'min-inline-size': '0px',
      'overflow-wrap': 'anywhere',
    });
    // Toast parts only: the visually hidden live regions clip by design (S5).
    for (const rule of rules.filter(r => /ret-toast(?!er)/.test(r.selector))) {
      const css = declarations(rule.style);
      expect(css['white-space']).toBeUndefined();
      expect(css['text-overflow']).toBeUndefined();
      expect(Object.keys(css).filter(p => /line-clamp|^overflow(-x|-y)?$/.test(p))).toEqual([]);
    }
  });

  it('gives the icon a fixed 28px footprint with an 18px glyph, in the content order', () => {
    const icon = partOf(toastOf('success', ['icon', 'content']), 'icon');
    expect(declared(icon)).toMatchObject({
      'flex-grow': '0',
      'flex-shrink': '0',
      'inline-size': '28px',
      'block-size': '28px',
    });
    const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.append(glyph);
    expect(declared(glyph)).toMatchObject({ 'inline-size': '18px', 'block-size': '18px' });
  });

  it('styles the action as a compact filled control that wraps a long label', () => {
    const action = partOf(toastOf('success', ['content', 'action', 'close']), 'action');
    expect(declared(action)).toMatchObject({
      background: 'var(--ret-action-surface)',
      color: 'var(--ret-action-text)',
      'font-size': '13px',
      'max-inline-size': '45%',
      'overflow-wrap': 'anywhere',
      'flex-shrink': '0',
    });
  });

  it('gives the close button exactly a 24×24 target with a muted 16px glyph', () => {
    const close = partOf(toastOf('default', ['content', 'close']), 'close');
    expect(declared(close)).toMatchObject({
      'inline-size': '24px',
      'block-size': '24px',
      padding: '0px',
      color: 'var(--ret-text-muted)',
      'flex-shrink': '0',
    });
    const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    close.append(glyph);
    expect(declared(glyph)).toMatchObject({ 'inline-size': '16px', 'block-size': '16px' });
  });

  it("puts a custom toast's close in the inline-end top corner, in the root's colour", () => {
    const close = partOf(toastOf('custom', ['custom', 'close']), 'close');
    expect(declared(close)).toMatchObject({
      position: 'absolute',
      'inset-block-start': '8px',
      'inset-inline-end': '8px',
      color: 'inherit',
      'inline-size': '24px',
      'block-size': '24px',
    });
    // No hover or other state rule recolours it with a theme token.
    for (const rule of rules.filter(r => /:hover|:active/.test(r.selector))) {
      expect(close.matches(rule.selector.replace(/:(hover|active)/g, ''))).toBe(false);
    }
  });

  it('mirrors in RTL: toast parts use logical spacing and no physical side insets', () => {
    for (const rule of rules.filter(r => /ret-toast(?!er)/.test(r.selector))) {
      const css = declarations(rule.style);
      expect(css.left ?? css.right).toBeUndefined();
      for (const box of ['margin', 'padding']) {
        expect(css[`${box}-left`]).toBe(css[`${box}-right`]);
      }
    }
  });
});

const TYPES = ['success', 'error', 'warning', 'info', 'loading'] as const;

/** WCAG 2.x relative luminance of an opaque `#rrggbb` colour. */
function luminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`${hex} is not an opaque #rrggbb colour, so its contrast is unknown`);
  const [r, g, b] = match.slice(1).map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two opaque colours. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

// The pairs AC-A11Y-6 requires (§17.4, §17.5), as [foreground, background, minimum]. Toast text is
// 13 to 14px, which is never large text, so all of it needs 4.5:1. The icon glyphs, the close glyph
// and the focus colour are meaningful non-text and need 3:1 against what they sit on. The border,
// the tints against the surface, and the shadow are decorative: the card is told apart by surface,
// border and shadow together, so no single pair of them is claimed.
const PAIRS: readonly (readonly [string, string, number])[] = [
  ['--ret-text', '--ret-surface', 4.5],
  ['--ret-text-muted', '--ret-surface', 4.5],
  ['--ret-action-text', '--ret-action-surface', 4.5],
  ...TYPES.map(type => [`--ret-${type}`, `--ret-${type}-subtle`, 3] as const),
  ['--ret-focus', '--ret-surface', 3],
  // P-20 decision 8: progress is information, so its fill is meaningful non-text.
  ['--ret-progress', '--ret-surface', 3],
];

describe('semantic accents (OQ-24, P-17 S4)', () => {
  it.each(TYPES)('colours only the %s icon slot, from its own token family', type => {
    const item = toastOf(type, ['icon', 'content']);
    expect(declared(partOf(item, 'icon'))).toMatchObject({
      background: `var(--ret-${type}-subtle)`,
      color: `var(--ret-${type})`,
    });
    // The card itself stays neutral: no semantic surface, border or text.
    expect(declared(item)).toMatchObject({
      background: 'var(--ret-surface)',
      border: '1px solid var(--ret-border)',
      color: 'var(--ret-text)',
    });
  });

  it("keeps a default toast's icon neutral, with no tint", () => {
    const icon = partOf(toastOf('default', ['icon', 'content']), 'icon');
    expect(declared(icon).color).toBe('var(--ret-text-muted)');
    expect(declared(icon).background).toBeUndefined();
  });

  it('limits type rules to the icon slot, so no type restyles the card or its other parts', () => {
    for (const rule of rules.filter(r => /ret-toast--(?!custom)/.test(r.selector))) {
      expect(rule.selector).toMatch(/^:where\(\.ret-toast--[a-z]+ > \.ret-toast__icon\)$/);
      expect([...rule.style].filter(p => !/^(color|background)/.test(p))).toEqual([]);
    }
  });

  it('reads every semantic token, so none is left unused', () => {
    const read = new Set(
      rules.flatMap(rule =>
        Object.values(declarations(rule.style)).flatMap(value =>
          [...value.matchAll(/var\((--ret-[\w-]+)\)/g)].map(m => m[1])
        )
      )
    );
    for (const type of TYPES) {
      expect(read).toContain(`--ret-${type}`);
      expect(read).toContain(`--ret-${type}-subtle`);
    }
  });

  it('never gives a custom toast or its contents a semantic colour', () => {
    const item = toastOf('custom', ['custom', 'close']);
    const inside = item.firstElementChild as Element;
    inside.className = 'ret-toast__icon';
    // Every rule that reads a semantic token, whatever its selector.
    const semantic = rules.filter(r =>
      Object.values(declarations(r.style)).some(v =>
        /var\(--ret-(success|error|warning|info|loading)/.test(v)
      )
    );
    expect(semantic.length).toBeGreaterThan(0);
    for (const rule of semantic) {
      expect([item, inside, ...item.children].some(e => e.matches(rule.selector))).toBe(false);
    }
  });

  it('has no light-scheme media rule, so system in a light scheme is exactly the light default', () => {
    expect(css).not.toMatch(/prefers-color-scheme:\s*light/);
  });
});

describe('AC-A11Y-6: palette contrast in both themes (D-20)', () => {
  const themes = {
    light: declarations(LIGHT.style),
    dark: { ...declarations(LIGHT.style), ...declarations(DARK.style) },
    'system dark': { ...declarations(LIGHT.style), ...declarations(SYSTEM_DARK.style) },
  };

  it.each(Object.entries(themes))('meets every required ratio in %s', (theme, tokens) => {
    for (const [foreground, background, minimum] of PAIRS) {
      const ratio = contrast(tokens[foreground] ?? '', tokens[background] ?? '');
      expect(
        ratio,
        `${theme}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1, below ${minimum}:1`
      ).toBeGreaterThanOrEqual(minimum);
    }
  });

  it('computes WCAG ratios correctly', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(() => contrast('rgb(0 0 0 / 0.5)', '#ffffff')).toThrow(/opaque/);
  });
});

const FORCED = '(forced-colors: active)';

/**
 * `selector` as if every user-action state held: each `:focus-visible` and `:hover` becomes
 * `:is(*)`, which every element matches. Removing them instead would change the selector's
 * structure: `.ret-toast--custom :focus-visible` would shrink to `.ret-toast--custom`.
 */
const inEveryState = (selector: string): string =>
  selector.replace(/:(focus-visible|hover)/g, ':is(*)');

/**
 * The declarations the stylesheet gives `element`, or its `pseudo` element, while it shows focus
 * (and is hovered): the rules that match in every state, later rules winning, as in `declared`. With
 * `media`, the rules inside that media query apply too, after the top-level ones.
 */
function declaredWhenFocused(
  element: Element,
  { pseudo = '', media = null }: { pseudo?: string; media?: string | null } = {}
): Record<string, string> {
  return Object.assign(
    {},
    ...rules
      .filter(r => r.media === null || r.media === media)
      .filter(r => {
        const [, base = '', own = ''] = /^(.*?)(::[\w-]+)?$/s.exec(r.selector) ?? [];
        return own === pseudo && element.matches(inEveryState(base));
      })
      .map(r => declarations(r.style))
  ) as Record<string, string>;
}

/** A section like the one the Toaster renders. */
function regionOf(theme = 'system'): HTMLElement {
  const region = document.createElement('section');
  region.className = 'ret-toaster';
  region.setAttribute('data-theme', theme);
  return region;
}

/** A custom toast with the library close and consumer content holding its own controls. */
function customToast(): { item: HTMLLIElement; consumer: Element[] } {
  const item = toastOf('custom', ['custom', 'close']);
  const content = item.firstElementChild as Element;
  content.innerHTML =
    '<button type="button">Open</button><a href="#x">Link</a><input aria-label="x">' +
    '<div tabindex="0"><button type="button">Nested</button></div><ol><li>Item</li></ol>';
  return { item, consumer: [content, ...content.querySelectorAll('*')] };
}

const focusRules = rules.filter(r => r.selector.includes(':focus-visible'));
const SYSTEM_COLOURS =
  /^(canvas|canvastext|buttonface|buttontext|buttonborder|field|fieldtext|highlight|highlighttext|selecteditem|selecteditemtext|linktext|visitedtext|activetext|graytext|mark|marktext|accentcolor|accentcolortext)$/;

describe('focus (§17.4, §18, P-17 S5)', () => {
  it('draws the region focus with a fixed pseudo-element just inside the viewport', () => {
    for (const theme of ['light', 'dark', 'system']) {
      const region = regionOf(theme);
      expect(declaredWhenFocused(region)).toMatchObject({ outline: 'none' });
      expect(declaredWhenFocused(region, { pseudo: '::after' })).toMatchObject({
        content: '""',
        position: 'fixed',
        inset: '4px',
        'z-index': 'var(--ret-z-index)',
        border: '3px solid var(--ret-focus)',
        outline: '2px solid var(--ret-surface)',
        'pointer-events': 'none',
      });
    }
  });

  it('never gives the region a box of its own, focused or not, so it is never an overlay', () => {
    const region = regionOf();
    for (const css of [declared(region), declaredWhenFocused(region)]) {
      expect(Object.keys(css).filter(p => OVERLAY.test(p))).toEqual([]);
    }
  });

  it('has the region pseudo-element only while the region itself shows focus', () => {
    const pseudo = rules.filter(r => r.selector.includes('::'));
    expect(pseudo.length).toBeGreaterThan(0);
    for (const rule of pseudo) {
      expect(rule.selector).toBe(':where(.ret-toaster:focus-visible)::after');
    }
  });

  it.each(['default', 'success', 'error', 'warning', 'info', 'loading'])(
    'rings a focused %s toast root inside its edge, on the card surface',
    type => {
      const item = toastOf(type, ['icon', 'content', 'close']);
      expect(declared(item).outline).toBeUndefined();
      expect(declaredWhenFocused(item)).toMatchObject({
        outline: '2px solid var(--ret-focus)',
        'outline-offset': '-1px',
      });
    }
  );

  it('rings a focused custom toast root just outside it, never over its content', () => {
    const { item } = customToast();
    expect(declaredWhenFocused(item)).toMatchObject({
      outline: '2px solid var(--ret-focus)',
      'outline-offset': '2px',
    });
  });

  it('rings the focused action and close buttons on the card surface', () => {
    const item = toastOf('error', ['icon', 'content', 'action', 'close']);
    for (const part of ['action', 'close']) {
      const control = partOf(item, part);
      expect(declared(control).outline).toBeUndefined();
      expect(declaredWhenFocused(control)).toMatchObject({
        outline: '2px solid var(--ret-focus)',
        'outline-offset': '2px',
      });
      expect(declaredWhenFocused(control)['outline-color']).toBeUndefined();
    }
  });

  it("rings a custom toast's focused library close in its own glyph colour", () => {
    const close = partOf(customToast().item, 'close');
    expect(declaredWhenFocused(close)).toMatchObject({
      outline: '2px solid var(--ret-focus)',
      'outline-offset': '2px',
      'outline-color': 'currentcolor',
      color: 'inherit',
    });
  });

  it('changes no layout when focus arrives: rings are outlines only', () => {
    for (const rule of focusRules.filter(r => !r.selector.includes('::'))) {
      expect([...rule.style].filter(p => !p.startsWith('outline'))).toEqual([]);
    }
  });

  it('styles nothing inside custom content except the library close, in any state or media', () => {
    const { item, consumer } = customToast();
    for (const element of consumer) {
      const matched = rules.filter(r =>
        element.matches(inEveryState(r.selector.replace(/::[\w-]+$/, '')))
      );
      expect(matched.map(r => r.selector)).toEqual([]);
    }
    // The library close is a direct child of the root, and the only one styled.
    const styled = [...item.children].filter(child =>
      rules.some(r => child.matches(inEveryState(r.selector.replace(/::[\w-]+$/, ''))))
    );
    expect(styled).toEqual([partOf(item, 'close')]);
  });
});

/** The opaque colour a focus declaration draws, from the theme's tokens; null for currentColor. */
function colourOf(value: string, tokens: Record<string, string>): string | null {
  const rest = value
    .replace(/(^|\s)-?\d*\.?\d+px\b/g, ' ')
    .replace(/\b(solid|dashed|dotted|double|auto|none)\b/g, ' ')
    .trim();
  if (rest === '') return '';
  if (rest === 'currentcolor') return null;
  const token = /^var\((--ret-[\w-]+)\)$/.exec(rest)?.[1];
  return token ? (tokens[token] ?? '') : rest;
}

describe('focus contrast (§17.4, AC-A11Y-6, P-17 S5)', () => {
  const themes = {
    light: declarations(LIGHT.style),
    dark: { ...declarations(LIGHT.style), ...declarations(DARK.style) },
    'system dark': { ...declarations(LIGHT.style), ...declarations(SYSTEM_DARK.style) },
  };

  // Every ring is drawn next to the card surface, or with a surface halo for the region, so each
  // colour a focus rule draws must reach 3:1 against `--ret-surface`.
  it.each(Object.entries(themes))('draws every library ring at 3:1 or more in %s', (_, tokens) => {
    const drawn = focusRules
      .filter(r => r.media === null)
      .flatMap(r =>
        ['outline', 'outline-color', 'border', 'border-color'].map(p => ({
          selector: r.selector,
          value: r.style.getPropertyValue(p),
        }))
      )
      .filter(({ value }) => value !== '');
    expect(drawn.length).toBeGreaterThan(0);
    for (const { selector, value } of drawn) {
      const colour = colourOf(value, tokens);
      if (colour === '' || (selector.includes('::after') && value.includes('--ret-surface'))) {
        continue;
      }
      if (colour === null) {
        // currentColor: only the custom close, whose colour the consumer owns (§17.3).
        expect(selector).toBe(':where(.ret-toast--custom > .ret-toast__close:focus-visible)');
        continue;
      }
      const ratio = contrast(colour, tokens['--ret-surface'] ?? '');
      expect(ratio, `${selector} draws ${value} at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        3
      );
    }
  });

  it('gives the region ring a surface halo, so the 3:1 pair holds over any page', () => {
    const after = declaredWhenFocused(regionOf(), { pseudo: '::after' });
    expect(after.outline).toContain('var(--ret-surface)');
    expect(after.border).toContain('var(--ret-focus)');
  });
});

describe('forced colours (§17.5, P-17 S5)', () => {
  const forced = rules.filter(r => r.media === FORCED);

  it('has a forced-colours block', () => {
    expect(forced.length).toBeGreaterThan(0);
  });

  it('uses only system colours there, and no authored token or semantic hue', () => {
    for (const rule of forced) {
      for (const [property, value] of Object.entries(declarations(rule.style))) {
        expect(value, `${rule.selector} ${property}`).not.toMatch(/var\(|#|rgb|hsl/);
        if (/color$/.test(property)) expect(value).toMatch(SYSTEM_COLOURS);
      }
    }
  });

  it('never opts out of forced colours', () => {
    expect(css).not.toMatch(/forced-color-adjust/);
  });

  it('rings every focused library element in Highlight, the custom close included', () => {
    const item = toastOf('success', ['icon', 'content', 'action', 'close']);
    const custom = customToast().item;
    for (const element of [item, partOf(item, 'action'), partOf(item, 'close'), custom]) {
      expect(declaredWhenFocused(element, { media: FORCED })['outline-color']).toBe('highlight');
    }
    expect(declaredWhenFocused(partOf(custom, 'close'), { media: FORCED })['outline-color']).toBe(
      'highlight'
    );
    expect(declaredWhenFocused(regionOf(), { pseudo: '::after', media: FORCED })).toMatchObject({
      'border-color': 'highlight',
      'outline-color': 'canvas',
      'pointer-events': 'none',
    });
  });

  it('keeps the card edge and gives the action a border, with its size unchanged', () => {
    const item = toastOf('warning', ['icon', 'content', 'action', 'close']);
    expect(declaredWhenFocused(item, { media: FORCED })['border-color']).toBe('canvastext');
    const action = declaredWhenFocused(partOf(item, 'action'), { media: FORCED });
    expect(action).toMatchObject({
      'border-width': '1px',
      'border-style': 'solid',
      'border-color': 'buttontext',
      'padding-block': '3px',
      'padding-inline': '9px',
    });
    // The 1px border replaces 1px of the S3 padding (4px and 10px) on each side.
    expect(declared(partOf(item, 'action'))).toMatchObject({
      'padding-block': '4px',
      'padding-inline': '10px',
    });
  });

  it('gives a custom toast no forced chrome beyond the library close ring', () => {
    const { item } = customToast();
    const forcedOnRoot = forced.filter(r => item.matches(inEveryState(r.selector)));
    expect(forcedOnRoot.flatMap(r => [...r.style])).toEqual(['outline-color']);
  });
});

describe('live regions: the hybrid visually hidden class (§17.1, §34, P-17 S5)', () => {
  const block = new RegExp(`\\.${LIVE_REGION} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  const written = block
    .split(';')
    .map(line => line.trim())
    .filter(Boolean);

  it('repeats the inline declarations exactly', () => {
    const kebab = (name: string) => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
    const inline = Object.entries(VISUALLY_HIDDEN).map(([name, value]) => {
      const text = String(value);
      return `${kebab(name)}: ${text}`;
    });
    expect(written.sort()).toEqual(inline.sort());
  });

  it('hides visually without removing the regions from the accessibility tree', () => {
    const region = document.createElement('div');
    region.className = LIVE_REGION;
    region.setAttribute('aria-live', 'polite');
    // Whatever matches it, in any media: nothing that would drop it from the accessibility tree.
    for (const media of [null, FORCED, '(prefers-color-scheme: dark)']) {
      const properties = Object.keys(declaredWhenFocused(region, { media }));
      expect(
        properties.filter(p => /^(display|visibility|content-visibility|opacity)$/.test(p))
      ).toEqual([]);
    }
    // Clipped to nothing in place, not removed.
    expect(written).toEqual(expect.arrayContaining(['overflow: hidden', 'clip-path: inset(50%)']));
  });
});

/** Every `@keyframes` rule in the stylesheet: its name and each frame's key and declarations. */
function keyframes(): Map<string, { key: string; style: Record<string, string> }[]> {
  const element = document.createElement('style');
  element.textContent = css;
  document.head.append(element);
  const sheet = element.sheet;
  element.remove();
  const found = new Map<string, { key: string; style: Record<string, string> }[]>();
  const walk = (list: CSSRuleList) => {
    for (const rule of list) {
      if (rule instanceof CSSKeyframesRule) {
        found.set(
          rule.name,
          [...rule.cssRules].map(frame => ({
            key: (frame as CSSKeyframeRule).keyText,
            style: declarations((frame as CSSKeyframeRule).style),
          }))
        );
      } else if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules);
      }
    }
  };
  if (sheet) walk(sheet.cssRules);
  return found;
}

const PHASES = ['entering', 'visible', 'exiting'] as const;

/** A rendered toast root in `phase` at `position`, normal or custom. */
function toastIn(
  phase: (typeof PHASES)[number],
  position: string,
  type = 'success'
): HTMLLIElement {
  const item = toastOf(type, type === 'custom' ? ['custom'] : ['icon', 'content']);
  item.setAttribute('data-phase', phase);
  item.setAttribute('data-position', position);
  return item;
}

const ANIMATION = /^animation/;

/** The toast root's stack-repositioning transition (P-19 D2 decision 8): internal timing. */
const REPOSITION = {
  'transition-property': 'transform',
  'transition-duration': '200ms',
  'transition-timing-function': 'cubic-bezier(0.2, 0, 0, 1)',
  'transition-delay': '0s',
};
const animationOf = (element: Element): Record<string, string> =>
  Object.fromEntries(
    Object.entries(declared(element)).filter(([property]) => ANIMATION.test(property))
  );

describe('enter and exit motion (§22, P-18 S2)', () => {
  const frames = keyframes();

  describe('keyframes', () => {
    it('are the four library enter and exit animations and the spinner, all ret- prefixed', () => {
      expect([...frames.keys()].sort()).toEqual([
        'ret-enter-bottom',
        'ret-enter-top',
        'ret-exit-bottom',
        'ret-exit-top',
        'ret-progress',
        'ret-spin',
      ]);
    });

    it.each([
      ['ret-enter-top', '0%', '-8px'],
      ['ret-enter-bottom', '0%', '8px'],
      ['ret-exit-top', '100%', '-8px'],
      ['ret-exit-bottom', '100%', '8px'],
    ])(
      '%s authors only its moving end (%s): opacity 0, 0 %s of travel, scale 0.98',
      (name, key, travel) => {
        expect(frames.get(name)).toEqual([
          { key, style: { opacity: '0', translate: `0 ${travel}`, scale: '0.98' } },
        ]);
      }
    );

    it('move only opacity and the individual translate and scale, never transform', () => {
      for (const [name, list] of frames) {
        // The spinner and the progress fill have their own exact tests.
        if (name === 'ret-spin' || name === 'ret-progress') continue;
        for (const frame of list) {
          expect(Object.keys(frame.style).sort()).toEqual(['opacity', 'scale', 'translate']);
        }
      }
    });
  });

  describe('which animation each toast runs', () => {
    it.each(POSITIONS.flatMap(position => PHASES.map(phase => [position, phase] as const)))(
      'a toast at %s while %s',
      (position, phase) => {
        const expected = phase === 'visible' ? undefined : libraryAnimationName(phase, position);
        for (const type of ['success', 'default', 'custom']) {
          expect(declared(toastIn(phase, position, type))['animation-name']).toBe(expected);
        }
      }
    );

    it('depends only on the vertical edge, never on left, centre or right', () => {
      for (const phase of ['entering', 'exiting'] as const) {
        for (const edge of ['top', 'bottom']) {
          const names = ['left', 'center', 'right'].map(
            side => declared(toastIn(phase, `${edge}-${side}`))['animation-name']
          );
          expect(new Set(names).size).toBe(1);
          expect(names[0]).toBe(`ret-${phase === 'entering' ? 'enter' : 'exit'}-${edge}`);
        }
      }
    });

    it('gives a visible toast no animation at all, so its settled look is P-17 unchanged', () => {
      for (const position of POSITIONS) {
        for (const type of ['success', 'custom']) {
          expect(animationOf(toastIn('visible', position, type))).toEqual({});
        }
      }
    });
  });

  describe('timing', () => {
    it('enters on the enter tokens, once, without delay and without fill', () => {
      expect(animationOf(toastIn('entering', 'top-right'))).toEqual({
        'animation-name': 'ret-enter-top',
        'animation-duration': 'var(--ret-enter-duration)',
        'animation-timing-function': 'var(--ret-enter-easing)',
        'animation-delay': '0s',
        'animation-iteration-count': '1',
        'animation-fill-mode': 'none',
      });
    });

    it('exits on the exit tokens, once, without delay, keeping its last frame until removal', () => {
      expect(animationOf(toastIn('exiting', 'bottom-left'))).toEqual({
        'animation-name': 'ret-exit-bottom',
        'animation-duration': 'var(--ret-exit-duration)',
        'animation-timing-function': 'var(--ret-exit-easing)',
        'animation-delay': '0s',
        'animation-iteration-count': '1',
        'animation-fill-mode': 'forwards',
      });
    });

    // Narrowed by P-20 S3: only the internal progress fill sets a play state (§22). No rule sets
    // the shorthand or a direction, and no other rule a play state.
    it('uses longhands only: no animation shorthand, direction or play state but the fill', () => {
      for (const rule of rules) {
        const own = Object.keys(declarations(rule.style));
        expect(own).not.toEqual(
          expect.arrayContaining([expect.stringMatching(/^animation(-direction)?$/)])
        );
        if (!/ret-toast__progress-fill\b/.test(rule.selector)) {
          expect(own, rule.selector).not.toContain('animation-play-state');
        }
      }
    });

    it("keeps the toast's names in their own rules, apart from the timing", () => {
      const named = rules.filter(r => r.style.getPropertyValue('animation-name'));
      for (const rule of named.filter(r => r.selector.includes('data-phase'))) {
        expect(Object.keys(declarations(rule.style))).toEqual(['animation-name']);
      }
    });
  });

  describe('boundaries', () => {
    it('gives custom toasts the root motion and still no card chrome (§6.4)', () => {
      for (const phase of PHASES) {
        const item = toastIn(phase, 'top-center', 'custom');
        expect(
          Object.keys(declared(item)).filter(
            property => CARD.test(property) && !ANIMATION.test(property)
          )
        ).toEqual([]);
      }
      expect(declared(toastIn('exiting', 'top-center', 'custom'))['animation-name']).toBe(
        'ret-exit-top'
      );
    });

    // Narrowed by P-20 S3: the internal progress fill's rules may set `transform-origin` (§20),
    // and nothing else of these. Every other rule still sets none of them.
    it('authors no settled opacity, translate, scale, rotate or transform on any rule', () => {
      for (const rule of rules) {
        const own = Object.keys(declarations(rule.style)).filter(property =>
          /^(opacity|translate|scale|rotate|transform)/.test(property)
        );
        if (/ret-toast__progress-fill\b/.test(rule.selector)) {
          expect(
            own.filter(property => property !== 'transform-origin'),
            rule.selector
          ).toEqual([]);
        } else {
          expect(own, rule.selector).toEqual([]);
        }
      }
    });

    it('never animates the region, the lists, the toast parts or the icon', () => {
      const item = toastIn('entering', 'top-right');
      const animated = [
        regionOf(),
        ...POSITIONS.map(listAt),
        ...item.children,
        ...toastIn('exiting', 'bottom-right', 'loading').children,
      ];
      for (const element of animated) expect(animationOf(element)).toEqual({});
    });

    // Narrowed by P-19 S2 from "adds no transition": the one transition is stack repositioning's,
    // and P-19 S4 adds its reduced-motion duration.
    it("adds no transition of its own: the only one is the toast root's reposition transition", () => {
      expect(
        rules
          .filter(r => Object.keys(declarations(r.style)).some(p => /^transition/.test(p)))
          .map(r => [r.selector, r.media])
      ).toEqual([
        [':where(.ret-toast)', null],
        [':where(.ret-toast)', REDUCED],
      ]);
    });

    it('leaves motion to CSS: no JavaScript reads the reduced-motion preference', () => {
      const sources = ['react', 'store']
        .flatMap(dir =>
          fs.readdirSync(path.join(root, 'src', dir)).map(f => path.join('src', dir, f))
        )
        .concat('src/index.ts', 'src/toast.ts', 'src/types.ts');
      for (const file of sources) {
        expect(fs.readFileSync(path.join(root, file), 'utf8')).not.toMatch(
          /matchMedia|prefers-reduced-motion/
        );
      }
    });
  });
});

/** A built-in or consumer `<svg>` inside a toast's icon slot. */
function iconSvg(type: string, className?: string): SVGSVGElement {
  const item = toastIn('visible', 'top-right', type);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (className) svg.setAttribute('class', className);
  partOf(item, 'icon').append(svg);
  return svg;
}

describe('the loading spinner (§22, P-18 S3)', () => {
  const frames = keyframes();

  it('turns once from 0deg to 360deg with the individual rotate, and nothing else', () => {
    expect(frames.get('ret-spin')).toEqual([
      { key: '0%', style: { rotate: '0deg' } },
      { key: '100%', style: { rotate: '360deg' } },
    ]);
  });

  it('runs on the internal spinner class: steady, endless, one turn a second', () => {
    const spinner = rules.filter(r => r.style.getPropertyValue('animation-name') === 'ret-spin');
    expect(spinner.map(r => r.selector)).toEqual([':where(.ret-toast__spinner)']);
    expect(declarations(spinner[0]?.style as CSSStyleDeclaration)).toEqual({
      'animation-name': 'ret-spin',
      'animation-duration': '1s',
      'animation-timing-function': 'linear',
      'animation-delay': '0s',
      'animation-iteration-count': 'infinite',
    });
  });

  it('spins the library loading icon in every phase and position', () => {
    for (const position of POSITIONS) {
      for (const phase of PHASES) {
        const item = toastIn(phase, position, 'loading');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'ret-toast__spinner');
        partOf(item, 'icon').append(svg);
        expect(declared(svg)['animation-name']).toBe('ret-spin');
      }
    }
  });

  it('never spins a consumer icon, another type or the icon slot', () => {
    for (const type of ['success', 'error', 'warning', 'info', 'default', 'loading']) {
      expect(animationOf(iconSvg(type))).toEqual({});
      expect(animationOf(iconSvg(type, 'consumer-icon'))).toEqual({});
    }
    const loading = toastIn('entering', 'top-right', 'loading');
    expect(animationOf(partOf(loading, 'icon'))).toEqual({});
  });

  it('adds no token and leaves the enter and exit motion as it was', () => {
    expect(rules.flatMap(rule => tokensOf(rule.style)).filter(t => /spin/.test(t))).toEqual([]);
    expect(animationOf(toastIn('entering', 'bottom-center', 'loading'))).toMatchObject({
      'animation-name': 'ret-enter-bottom',
      'animation-duration': 'var(--ret-enter-duration)',
    });
  });

  it('is not one of the library animations that complete a toast (§9 rule 3)', () => {
    for (const position of POSITIONS) {
      for (const phase of ['entering', 'exiting'] as const) {
        expect(libraryAnimationName(phase, position)).not.toBe('ret-spin');
      }
    }
  });

  it('stays out of forced colours', () => {
    for (const rule of rules.filter(r => r.media === '(forced-colors: active)')) {
      expect(rule.selector).not.toContain('spinner');
      expect(Object.keys(declarations(rule.style)).filter(p => ANIMATION.test(p))).toEqual([]);
    }
  });
});

const REDUCED = '(prefers-reduced-motion: reduce)';
const reducedRules = rules.filter(r => r.media === REDUCED);
/** P-18's reduced-motion rules: every rule of the block but P-19's repositioning one. */
const p18ReducedRules = reducedRules.filter(r => r.selector !== ':where(.ret-toast)');

/**
 * The declarations `element` gets under reduced motion: the top-level rules, then the
 * reduced-motion block, which the stylesheet places after every motion rule, so it wins at the
 * same zero specificity (checked below).
 */
function declaredReduced(element: Element): Record<string, string> {
  return Object.assign(
    declared(element),
    ...reducedRules.filter(r => element.matches(r.selector)).map(r => declarations(r.style))
  ) as Record<string, string>;
}

function spinnerIn(phase: (typeof PHASES)[number], position = 'top-right'): Element {
  const item = toastIn(phase, position, 'loading');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ret-toast__spinner');
  partOf(item, 'icon').append(svg);
  return svg;
}

describe('stack repositioning (§22, P-19 S2)', () => {
  const transitionsOf = (element: Element): Record<string, string> =>
    Object.fromEntries(
      Object.entries(declared(element)).filter(([property]) => /^transition/.test(property))
    );

  it('transitions only transform on the toast root, with the internal D2 timing', () => {
    const rule = rules.filter(
      r => r.selector === ':where(.ret-toast)' && r.style.getPropertyValue('transition-property')
    );
    expect(rule).toHaveLength(1);
    expect(declarations(rule[0]!.style)).toEqual(REPOSITION);
  });

  it('declares no transform, so a toast at rest has none', () => {
    for (const rule of rules) {
      expect(Object.keys(declarations(rule.style))).not.toContain('transform');
    }
  });

  it.each(POSITIONS)('applies to normal and custom toasts in every phase at %s', position => {
    for (const phase of PHASES) {
      for (const type of ['success', 'default', 'loading', 'custom']) {
        expect(transitionsOf(toastIn(phase, position, type))).toEqual(REPOSITION);
      }
    }
  });

  it('never transitions the region, the lists, the toast parts or the icon', () => {
    const item = toastIn('visible', 'top-right');
    const others = [
      regionOf(),
      ...POSITIONS.map(listAt),
      ...item.children,
      ...toastIn('exiting', 'bottom-right', 'loading').children,
      spinnerIn('visible'),
    ];
    for (const element of others) expect(transitionsOf(element)).toEqual({});
  });

  it('uses longhands only, fixed values and no token', () => {
    for (const rule of rules) {
      expect(Object.keys(declarations(rule.style))).not.toContain('transition');
    }
    for (const value of Object.values(REPOSITION)) expect(value).not.toMatch(/var\(/);
  });

  it('leaves the P-18 enter and exit animations on the individual properties', () => {
    expect(animationOf(toastIn('entering', 'top-left'))['animation-name']).toBe('ret-enter-top');
    expect(animationOf(toastIn('exiting', 'bottom-right'))['animation-name']).toBe(
      'ret-exit-bottom'
    );
  });
});

describe('reduced motion (§17.5, §22, P-18 S4)', () => {
  // Narrowed by P-19 S4: the block's third rule is stack repositioning's (tested below); P-18's
  // two rules are unchanged and still only remove animation names.
  it('is one media block, after every motion rule: P-18 only removes animation names', () => {
    expect((css.match(/@media \(prefers-reduced-motion/g) ?? []).length).toBe(1);
    expect(reducedRules.map(r => r.selector)).toEqual([
      ":where(.ret-toast[data-phase='entering'], .ret-toast[data-phase='exiting'])",
      ':where(.ret-toast__spinner)',
      ':where(.ret-toast)',
    ]);
    for (const rule of p18ReducedRules) {
      expect(declarations(rule.style)).toEqual({ 'animation-name': 'none' });
    }
    const animated = rules
      .map((rule, index) => ({ rule, index }))
      .filter(
        ({ rule }) =>
          rule.media === null && Object.keys(declarations(rule.style)).some(p => ANIMATION.test(p))
      );
    const firstReduced = rules.indexOf(reducedRules[0] as (typeof rules)[number]);
    expect(Math.max(...animated.map(({ index }) => index))).toBeLessThan(firstReduced);
  });

  it.each(POSITIONS.flatMap(position => PHASES.map(phase => [position, phase] as const)))(
    'leaves a toast at %s while %s with no library animation',
    (position, phase) => {
      for (const type of ['success', 'custom']) {
        const name = declaredReduced(toastIn(phase, position, type))['animation-name'];
        expect(name === undefined || name === 'none').toBe(true);
      }
    }
  );

  it('names nothing an entering or exiting toast could run, so the lifecycle completes at once', () => {
    for (const phase of ['entering', 'exiting'] as const) {
      for (const position of POSITIONS) {
        expect(declaredReduced(toastIn(phase, position))['animation-name']).toBe('none');
      }
    }
  });

  it('keeps the spinner still, and changes nothing else about it', () => {
    for (const phase of PHASES) {
      const svg = spinnerIn(phase);
      expect(declared(svg)['animation-name']).toBe('ret-spin');
      const reduced = declaredReduced(svg);
      expect(reduced['animation-name']).toBe('none');
      const withoutName = (values: Record<string, string>) =>
        Object.entries(values).filter(([property]) => property !== 'animation-name');
      expect(withoutName(reduced)).toEqual(withoutName(declared(svg)));
    }
  });

  it('adds no keyframes, fade, token or settled style of its own', () => {
    // Six since P-20 S3 (`ret-progress`), none of them in the block.
    expect([...keyframes().keys()]).toHaveLength(6);
    for (const rule of reducedRules) expect(tokensOf(rule.style)).toEqual([]);
    // Narrowed by P-19 S4: only P-18's rules; P-19's one declaration is tested below.
    for (const rule of p18ReducedRules) {
      expect(
        Object.keys(declarations(rule.style)).filter(p =>
          /^(opacity|translate|scale|rotate|transform|transition|animation-(duration|delay|fill))/.test(
            p
          )
        )
      ).toEqual([]);
    }
  });

  it('leaves the normal motion as it was outside the media block', () => {
    expect(animationOf(toastIn('entering', 'top-left'))['animation-name']).toBe('ret-enter-top');
    expect(animationOf(toastIn('exiting', 'bottom-right'))).toMatchObject({
      'animation-name': 'ret-exit-bottom',
      'animation-fill-mode': 'forwards',
    });
    expect(declared(spinnerIn('visible'))['animation-name']).toBe('ret-spin');
  });

  it('is independent of forced colours: neither block touches the other', () => {
    for (const rule of rules.filter(r => r.media === '(forced-colors: active)')) {
      expect(Object.keys(declarations(rule.style)).filter(p => ANIMATION.test(p))).toEqual([]);
    }
    expect(css).not.toMatch(/forced-color-adjust/);
  });
});

describe('reduced-motion stack repositioning (§17.5, §22, P-19 S4)', () => {
  const transitionsOf = (values: Record<string, string>) =>
    Object.fromEntries(Object.entries(values).filter(([property]) => /^transition/.test(property)));
  const rule = () => reducedRules.find(r => r.selector === ':where(.ret-toast)');

  it('takes the reposition transition no time: one declaration, the duration, on the toast root', () => {
    expect(rule()).toBeDefined();
    expect(declarations(rule()!.style)).toEqual({ 'transition-duration': '0s' });
  });

  it.each(POSITIONS)('makes every toast at %s move instantly, in every phase', position => {
    for (const phase of PHASES) {
      for (const type of ['success', 'default', 'loading', 'custom']) {
        expect(transitionsOf(declaredReduced(toastIn(phase, position, type)))).toEqual({
          ...REPOSITION,
          'transition-duration': '0s',
        });
      }
    }
  });

  it('leaves the normal 200 ms and its easing as they are outside the media block', () => {
    for (const phase of PHASES) {
      expect(transitionsOf(declared(toastIn(phase, 'bottom-center', 'custom')))).toEqual(
        REPOSITION
      );
    }
    expect(REPOSITION['transition-duration']).toBe('200ms');
    expect(REPOSITION['transition-timing-function']).toBe('cubic-bezier(0.2, 0, 0, 1)');
  });

  it('adds no transform, fade, scale, translation, animation or token under reduced motion', () => {
    const own = Object.keys(declarations(rule()!.style));
    expect(
      own.filter(p => /^(transform|opacity|scale|translate|rotate|animation)/.test(p))
    ).toEqual([]);
    expect(tokensOf(rule()!.style)).toEqual([]);
    for (const phase of PHASES) {
      const reduced = declaredReduced(toastIn(phase, 'top-left'));
      expect(reduced.transform).toBeUndefined();
      expect(reduced.opacity).toBeUndefined();
      expect(reduced.scale).toBeUndefined();
      expect(reduced.translate).toBeUndefined();
    }
  });

  it('reaches no other element: the region, lists, parts and spinner have no transition', () => {
    const item = toastIn('visible', 'top-right');
    for (const element of [
      regionOf(),
      ...POSITIONS.map(listAt),
      ...item.children,
      spinnerIn('visible'),
    ]) {
      expect(transitionsOf(declaredReduced(element))).toEqual({});
    }
  });

  it('comes after the normal transition, so it wins at the same zero specificity', () => {
    const normal = rules.findIndex(
      r => r.media === null && r.style.getPropertyValue('transition-property')
    );
    expect(normal).toBeGreaterThanOrEqual(0);
    expect(rules.indexOf(rule()!)).toBeGreaterThan(normal);
  });

  // Updated by P-20 S3: 30 tokens and the documented `data-paused` hook; still no reposition token.
  it('keeps the public contract: 30 tokens, no reposition token, no other hook', () => {
    const tokens = [...new Set(rules.flatMap(r => tokensOf(r.style)))];
    expect(tokens).toHaveLength(30);
    expect(tokens.filter(t => /reposition|move|transition|stack/.test(t))).toEqual([]);
    const attributes = new Set(css.match(/\[[a-z-]+/g)?.map(a => a.slice(1)));
    expect([...attributes].sort()).toEqual([
      'data-paused',
      'data-phase',
      'data-position',
      'data-theme',
    ]);
  });
});

describe('progress (§20, §22, P-20 S3, D1 candidate B)', () => {
  /** A normal toast root with the S2 progress DOM, optionally held, inside a `dir` container. */
  function progressIn(
    phase: (typeof PHASES)[number],
    { paused = false, dir = 'ltr' }: { paused?: boolean; dir?: 'ltr' | 'rtl' } = {}
  ) {
    const host = document.createElement('div');
    host.setAttribute('dir', dir);
    const item = toastIn(phase, 'top-right');
    if (paused) item.setAttribute('data-paused', '');
    const strip = document.createElement('div');
    strip.className = 'ret-toast__progress';
    const fill = document.createElement('div');
    fill.className = 'ret-toast__progress-fill';
    strip.append(fill);
    item.append(strip);
    host.append(item);
    document.body.append(host);
    return { host, item, strip, fill };
  }
  const STRIP = {
    position: 'absolute',
    'inset-block-end': '0px',
    'inset-inline': '0px',
    'block-size': 'var(--ret-progress-height)',
    'clip-path':
      'inset(calc(-1 * var(--ret-radius)) 0 0 0 round 0 0 max(0px, var(--ret-radius) - 1px) max(0px, var(--ret-radius) - 1px) )',
    'pointer-events': 'none',
  };
  const FILL = {
    display: 'block',
    'block-size': '100%',
    background: 'var(--ret-progress)',
    'transform-origin': 'left',
    'animation-name': 'ret-progress',
    'animation-timing-function': 'linear',
    'animation-iteration-count': '1',
    'animation-fill-mode': 'both',
    'animation-play-state': 'paused',
  };

  it('defaults its two tokens: 3px, #52525b in light and #a1a1aa in dark and system dark', () => {
    expect(LIGHT.style.getPropertyValue('--ret-progress-height').trim()).toBe('3px');
    expect(LIGHT.style.getPropertyValue('--ret-progress').trim()).toBe('#52525b');
    for (const block of [DARK, SYSTEM_DARK]) {
      expect(block.style.getPropertyValue('--ret-progress').trim()).toBe('#a1a1aa');
      expect(tokensOf(block.style)).not.toContain('--ret-progress-height');
    }
  });

  it('shrinks only the fill, by scaleX from 1 to 0, and nothing else', () => {
    expect(keyframes().get('ret-progress')).toEqual([
      { key: '0%', style: { transform: 'scaleX(1)' } },
      { key: '100%', style: { transform: 'scaleX(0)' } },
    ]);
  });

  it('lays a static, clipped strip over the block-end edge, out of flow, with no track', () => {
    const { host, strip } = progressIn('visible');
    expect(squashed(declared(strip))).toEqual(STRIP);
    host.remove();
  });

  it('gives the fill the neutral token, a straight moving edge, and a held linear animation', () => {
    const { host, fill } = progressIn('visible', { paused: true });
    expect(declared(fill)).toEqual(FILL);
    expect(Object.keys(declared(fill)).filter(p => /radius|duration|delay/.test(p))).toEqual([]);
    host.remove();
  });

  it('D-11: anchors the fill at the inline start, left in LTR and right in RTL', () => {
    const ltr = progressIn('visible');
    const rtl = progressIn('visible', { dir: 'rtl' });
    expect(declared(ltr.fill)['transform-origin']).toBe('left');
    expect(declared(rtl.fill)['transform-origin']).toBe('right');
    expect(squashed(declared(rtl.strip))).toEqual(STRIP);
    ltr.host.remove();
    rtl.host.remove();
  });

  it('runs only while the timer runs: visible and not data-paused', () => {
    for (const phase of PHASES) {
      for (const paused of [false, true]) {
        const { host, fill } = progressIn(phase, { paused });
        const running = phase === 'visible' && !paused;
        expect(declared(fill)['animation-play-state'], `${phase} paused=${paused}`).toBe(
          running ? 'running' : 'paused'
        );
        host.remove();
      }
    }
  });

  it('anchors the strip to the card, and still never clips, transforms or moves the toast', () => {
    const { host, item } = progressIn('visible');
    const own = declared(item);
    expect(own.position).toBe('relative');
    expect(Object.keys(own).filter(p => /overflow|clip|mask|^transform|contain/.test(p))).toEqual(
      []
    );
    expect(transitionsOfRoot(own)).toEqual(REPOSITION);
    expect(animationOf(item)).toEqual({});
    host.remove();
  });

  it('keeps every other toast part, the region and the lists unanimated', () => {
    const { host, item } = progressIn('visible');
    const others = [
      regionOf(),
      ...POSITIONS.map(listAt),
      ...[...item.children].filter(child => !child.classList.contains('ret-toast__progress')),
      item.querySelector('.ret-toast__progress') as Element,
    ];
    for (const element of others) expect(animationOf(element)).toEqual({});
    host.remove();
  });

  it('keeps depleting under reduced motion: no reduced-motion rule reaches the strip or fill', () => {
    const { host, strip, fill } = progressIn('visible');
    for (const element of [strip, fill]) {
      expect(reducedRules.filter(r => element.matches(r.selector))).toEqual([]);
    }
    expect(declaredReduced(fill)).toEqual({ ...FILL, 'animation-play-state': 'running' });
    host.remove();
  });

  it('draws the fill in a system colour under forced colours, with no track', () => {
    const { host, strip, fill } = progressIn('visible');
    const forced = rules.filter(r => r.media === FORCED);
    const own = forced.filter(r => fill.matches(r.selector)).map(r => declarations(r.style));
    expect(own.map(d => Object.keys(d))).toEqual([['background-color']]);
    expect(own[0]?.['background-color']?.toLowerCase()).toBe('canvastext');
    expect(forced.filter(r => strip.matches(r.selector))).toEqual([]);
    host.remove();
  });

  it('keeps every progress rule at zero specificity, inside :where()', () => {
    for (const rule of rules.filter(r => /ret-toast__progress/.test(r.selector))) {
      expect(rule.selector, rule.selector).toMatch(/^:where\(.*\)$/s);
    }
  });

  it('styles no custom toast: progress rules need the strip, which custom toasts never get', () => {
    const custom = toastIn('visible', 'top-right', 'custom');
    expect(rules.filter(r => /progress/.test(r.selector) && custom.matches(r.selector))).toEqual(
      []
    );
  });
});

/** Declarations with runs of whitespace collapsed, as the stylesheet's formatting may wrap them. */
function squashed(own: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(own).map(([p, v]) => [p, v.replace(/\s+/g, ' ').replace(/\( /g, '(')])
  );
}

/** The toast root's transition longhands, from its declared styles. */
function transitionsOfRoot(own: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(own).filter(([p]) => /^transition/.test(p)));
}

describe('the D1 prototype stays demo-only (P-17)', () => {
  it('is never referenced by library source, the stylesheet or what builds the package', () => {
    const library = ['react', 'store']
      .flatMap(dir =>
        fs.readdirSync(path.join(root, 'src', dir)).map(f => path.join('src', dir, f))
      )
      .concat('src/index.ts', 'src/toast.ts', 'src/types.ts', 'tsup.config.ts');
    for (const file of library) {
      expect(fs.readFileSync(path.join(root, file), 'utf8')).not.toMatch(/p17-prototype|demo\//);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
      files: string[];
      exports: unknown;
    };
    const shipped = [pkg.scripts.build, pkg.scripts['build:js'], pkg.scripts['build:css']];
    expect(JSON.stringify([shipped, pkg.files, pkg.exports])).not.toMatch(/prototype|demo/);
    expect(css).not.toMatch(/PROTOTYPE/);
  });
});

describe('package validation marker (P-07)', () => {
  const marker = /const CSS_MARKER = '([^']+)';/.exec(
    fs.readFileSync(path.join(root, 'scripts/validate-package.js'), 'utf8')
  )?.[1];

  it('is a ret- class, which the 0.x stylesheet never had', () => {
    expect(marker).toMatch(/^\.ret-[\w-]+$/);
  });

  it('is a selector of the shipped stylesheet', () => {
    expect(rules.some(rule => marker !== undefined && rule.selector.includes(marker))).toBe(true);
  });
});
