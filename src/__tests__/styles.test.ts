// The shipped stylesheet's contract (§21, OQ-25, P-17 S1): the `ret-` namespace and its lint gate
// (AC-CSS-1, D-23), the token set scoped to `.ret-toaster`, the CSS-only light, dark and system
// themes (§23), no motion before P-18, and the package-validation marker (P-07). These are
// structural checks of the CSS text. Layout, contrast and focus appearance are checked elsewhere
// (P-17 S4, P-22).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

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
];
const LAYOUT_TOKENS = [
  '--ret-font-family',
  '--ret-radius',
  '--ret-gap',
  '--ret-offset',
  '--ret-width',
  '--ret-z-index',
];

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
    const documented = [...COLOUR_TOKENS, ...LAYOUT_TOKENS].sort();
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

  it('defines no motion, stack, progress or swipe token, which later phases own', () => {
    const tokens = rules.flatMap(rule => tokensOf(rule.style));
    expect(
      tokens.filter(token =>
        /motion|duration|delay|eas(e|ing)|animation|transition|enter|exit|spin|stack|progress|swipe/.test(
          token
        )
      )
    ).toEqual([]);
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

  it('matches no live region, which keeps its own inline hiding (§17.1)', () => {
    for (const attributes of [
      { role: 'status', 'aria-live': 'polite' },
      { 'aria-live': 'assertive' },
    ]) {
      const region = document.createElement('div');
      for (const [name, value] of Object.entries(attributes)) region.setAttribute(name, value);
      expect(rules.filter(r => region.matches(r.selector))).toEqual([]);
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

  it('gives a custom toast no card chrome, only its box sizing and the close anchor', () => {
    const custom = declared(toastOf('custom', ['custom', 'close']));
    expect(Object.keys(custom).filter(p => CARD.test(p))).toEqual([]);
    expect(custom).toEqual({ 'box-sizing': 'border-box', position: 'relative' });
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
    for (const rule of rules.filter(r => r.selector.includes('ret-toast'))) {
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

describe('motion boundary (P-17; P-18 owns motion)', () => {
  it('has no keyframes, animations, transitions, transforms or reduced-motion rules', () => {
    expect(css).not.toMatch(/@keyframes|prefers-reduced-motion/);
    for (const rule of rules) {
      expect(
        [...rule.style].filter(p =>
          /^(animation|transition|transform|translate|scale|rotate)/.test(p)
        )
      ).toEqual([]);
    }
  });
});

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
