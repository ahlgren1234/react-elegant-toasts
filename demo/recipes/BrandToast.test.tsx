import { act, fireEvent, render, within } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { axe } from 'vitest-axe';
// The library from source, never the built package (P-25 decision 9): CI's `test` job has no
// `dist/`.
import { Toaster, toast as libraryToast, type ToastTheme } from '../../src/index';

// The branded toast (P-25 S6b). The demo runs `showBrandToast` from BrandToast.tsx and shows that
// file and brand-toast.css as its code, so these tests read the same files. The module is compiled
// from its source and run with a `toast` of the test's choosing, as the S5b recipe tests do. Its
// types are checked by `typecheck:demo`, against the package's public declarations.

const ROOT = resolve(__dirname, '../..');
const COMPONENT = readFileSync(resolve(__dirname, 'BrandToast.tsx'), 'utf8');
const STYLES = readFileSync(resolve(__dirname, 'brand-toast.css'), 'utf8');
const LIBRARY_CSS = readFileSync(resolve(ROOT, 'src/styles.css'), 'utf8');

const BRAND = 'brand-toast';

interface Recipe {
  showBrandToast: () => string | undefined;
}

/** The recipe module, compiled to CommonJS and run with `api` as the package's `toast`. */
function loadRecipe(api: unknown): Recipe {
  const { outputText } = ts.transpileModule(COMPONENT, {
    fileName: 'BrandToast.tsx',
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const modules: Record<string, unknown> = {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'react-elegant-toasts': { toast: api },
    './brand-toast.css': {},
  };
  const exports = {};
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const load = new Function('require', 'exports', outputText) as (
    require: (id: string) => unknown,
    exports: object
  ) => void;
  load(id => {
    if (!(id in modules)) throw new Error(`The recipe imports ${id}`);
    return modules[id];
  }, exports);
  return exports as Recipe;
}

interface Rule {
  selector: string;
  media: string | null;
  style: CSSStyleDeclaration;
}

/** Every style rule in `css`, with the media condition it sits in, if any. */
function rulesOf(css: string): Rule[] {
  const element = document.createElement('style');
  element.textContent = css;
  document.head.append(element);
  const sheet = element.sheet!;
  element.remove();
  const found: Rule[] = [];
  const walk = (rules: CSSRuleList, media: string | null) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        found.push({ selector: rule.selectorText, media, style: rule.style });
      } else if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, rule.conditionText);
      }
    }
  };
  walk(sheet.cssRules, null);
  return found;
}

const declarations = (style: CSSStyleDeclaration): Record<string, string> =>
  Object.fromEntries([...style].map(property => [property, style.getPropertyValue(property)]));

const LIBRARY_RULES = rulesOf(LIBRARY_CSS);
/** The library's public tokens: every custom property its stylesheet declares. */
const PUBLIC_TOKENS = new Set(
  LIBRARY_RULES.flatMap(rule => [...rule.style].filter(p => p.startsWith('--')))
);
const libraryBlock = (selector: string) =>
  declarations(LIBRARY_RULES.find(r => r.selector === selector && r.media === null)!.style);
const LIBRARY_LIGHT = libraryBlock(':where(.ret-toaster)');
const LIBRARY_DARK = libraryBlock(":where(.ret-toaster[data-theme='dark'])");

const BRAND_RULES = rulesOf(STYLES);
const LIGHT_SELECTOR = `.${BRAND}`;
const DARK_SELECTOR = `.ret-toaster[data-theme='dark'] .${BRAND}`;
const SYSTEM_SELECTOR = `.ret-toaster[data-theme='system'] .${BRAND}`;
const SYSTEM_MEDIA = '(prefers-color-scheme: dark)';
const brandBlock = (selector: string, media: string | null = null) =>
  declarations(BRAND_RULES.find(r => r.selector === selector && r.media === media)!.style);

// WCAG 2.x contrast of two opaque `#rrggbb` colours.
function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`${hex} is not an opaque #rrggbb colour`);
  const [r, g, b] = [1, 3, 5].map(i => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

// The library's required pairs (AC-A11Y-6, styles.test.ts) that a success toast draws.
const PAIRS = [
  ['--ret-text', '--ret-surface', 4.5],
  ['--ret-text-muted', '--ret-surface', 4.5],
  ['--ret-action-text', '--ret-action-surface', 4.5],
  ['--ret-success', '--ret-success-subtle', 3],
  ['--ret-focus', '--ret-surface', 3],
  ['--ret-progress', '--ret-surface', 3],
] as const;

describe('the branded toast recipe, with a recording toast', () => {
  it('shows a built-in success toast with the brand class, not a custom toast', () => {
    const calls: { method: string; args: unknown[] }[] = [];
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ method, args });
        return 'generated';
      };
    const api = Object.assign(record('toast'), {
      success: record('success'),
      custom: record('custom'),
    });
    expect(loadRecipe(api).showBrandToast()).toBe('generated');
    expect(calls.map(call => call.method)).toEqual(['success']);
    const [message, options] = calls[0]!.args as [
      string,
      { action: { label: string; onClick: () => void } } & Record<string, unknown>,
    ];
    expect(message).toBe('Your site is live');
    const { action, ...rest } = options;
    expect(rest).toEqual({
      description: 'Visitors now see the version you published.',
      duration: 8000,
      progress: true,
      className: BRAND,
    });
    expect(Object.keys(action)).toEqual(['label', 'onClick']);
    expect(action.label).toBe('Undo');
    calls.length = 0;
    action.onClick();
    expect(calls).toEqual([{ method: 'toast', args: ['Publishing undone'] }]);
  });
});

describe('the branded toast, with the library', () => {
  let error: MockInstance<typeof console.error>;
  let styles: HTMLStyleElement;

  beforeEach(() => {
    vi.useFakeTimers();
    error = vi.spyOn(console, 'error');
    styles = document.createElement('style');
    styles.textContent = `${LIBRARY_CSS}\n${STYLES}`;
    document.head.append(styles);
  });

  afterEach(() => {
    styles.remove();
    expect(error).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** Renders a Toaster with `theme`, shows the branded toast and a plain one, and settles them. */
  function show(theme?: ToastTheme) {
    render(<Toaster theme={theme} />);
    act(() => {
      libraryToast.success('Plain', { duration: Infinity });
      loadRecipe(libraryToast).showBrandToast();
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    const branded = document.querySelector<HTMLElement>(`.ret-toast.${BRAND}`)!;
    const plain = [...document.querySelectorAll<HTMLElement>('.ret-toast')].find(
      item => item !== branded
    )!;
    return { branded, plain };
  }

  const token = (element: Element, name: string) =>
    getComputedStyle(element).getPropertyValue(name).trim();

  it('puts the class on the root of a normal success toast, beside the library classes', () => {
    const { branded } = show();
    expect(branded.tagName).toBe('LI');
    expect([...branded.classList]).toEqual(['ret-toast', 'ret-toast--success', BRAND]);
    expect(branded.querySelector('.ret-toast__icon')).not.toBeNull();
    expect(branded.querySelector('.ret-toast__progress')).not.toBeNull();
    expect(within(branded).getByRole('button', { name: 'Undo' })).not.toBeNull();
    expect(within(branded).getByRole('button', { name: 'Close notification' })).not.toBeNull();
  });

  it.each([
    ['light', undefined],
    ['light', 'light'],
    ['dark', 'dark'],
  ] as const)('resolves the %s brand tokens on the toast (theme %s)', (variant, theme) => {
    const { branded, plain } = show(theme);
    const brand = variant === 'light' ? brandBlock(LIGHT_SELECTOR) : brandBlock(DARK_SELECTOR);
    const library = variant === 'light' ? LIBRARY_LIGHT : { ...LIBRARY_LIGHT, ...LIBRARY_DARK };
    for (const [name, value] of Object.entries({ ...brandBlock(LIGHT_SELECTOR), ...brand })) {
      expect(token(branded, name), name).toBe(value);
      // Inherited by the parts inside the card.
      expect(token(branded.querySelector('.ret-toast__icon')!, name), name).toBe(value);
      // Every other toast keeps the library's value.
      expect(token(plain, name), name).toBe(library[name]);
    }
  });

  it('matches the system rule under theme="system", and the dark rule only under dark', () => {
    const { branded } = show('system');
    expect(branded.matches(SYSTEM_SELECTOR)).toBe(true);
    expect(branded.matches(DARK_SELECTOR)).toBe(false);
  });

  it('keeps its classes and tokens in a right-to-left page', () => {
    document.documentElement.dir = 'rtl';
    try {
      const { branded } = show('dark');
      expect(branded.classList.contains(BRAND)).toBe(true);
      expect(token(branded, '--ret-surface')).toBe(brandBlock(DARK_SELECTOR)['--ret-surface']);
    } finally {
      document.documentElement.removeAttribute('dir');
    }
  });

  it('closes on Undo and confirms with a default toast', () => {
    const { branded } = show();
    fireEvent.click(within(branded).getByRole('button', { name: 'Undo' }));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(document.querySelector(`.ret-toast.${BRAND}`)).toBeNull();
    const confirmation = [...document.querySelectorAll('.ret-toast')].find(
      item => item.textContent === 'Publishing undone'
    );
    expect(confirmation?.className).toBe('ret-toast ret-toast--default');
  });

  it.each(['light', 'dark'] as const)('has no axe violations in %s', async theme => {
    show(theme);
    vi.useRealTimers();
    expect((await axe(document.body)).violations).toEqual([]);
  });
});

describe('the brand styles', () => {
  it('set only public library tokens, without !important', () => {
    expect(BRAND_RULES.length).toBeGreaterThan(0);
    for (const rule of BRAND_RULES) {
      for (const property of rule.style) {
        expect(PUBLIC_TOKENS.has(property), `${rule.selector} sets ${property}`).toBe(true);
        expect(rule.style.getPropertyPriority(property)).toBe('');
      }
    }
  });

  it('hold only style rules and the one colour-scheme query', () => {
    const css = STYLES.replace(/\/\*[\s\S]*?\*\//g, '');
    expect([...css.matchAll(/@[\w-]+[^{]*/g)].map(match => match[0].trim())).toEqual([
      `@media ${SYSTEM_MEDIA}`,
    ]);
  });

  it('select only the brand class, under the documented theme selectors', () => {
    expect(BRAND_RULES.map(rule => [rule.selector, rule.media])).toEqual([
      [LIGHT_SELECTOR, null],
      [DARK_SELECTOR, null],
      [SYSTEM_SELECTOR, SYSTEM_MEDIA],
    ]);
    // No internal or documented inner class: the tokens reach the parts by inheritance.
    expect(STYLES).not.toMatch(/\.ret-toast(?!er\b)/);
  });

  it('use the class the recipe passes as its className', () => {
    expect(COMPONENT).toContain(`className: '${BRAND}'`);
  });

  it('give dark every colour the light block sets, so no light colour reaches a dark toast', () => {
    const light = brandBlock(LIGHT_SELECTOR);
    const dark = brandBlock(DARK_SELECTOR);
    const themed = Object.keys(light).filter(name => name in LIBRARY_DARK);
    expect(Object.keys(dark).sort()).toEqual(themed.sort());
    expect(brandBlock(SYSTEM_SELECTOR, SYSTEM_MEDIA)).toEqual(dark);
  });

  it.each([
    ['light', () => ({ ...LIBRARY_LIGHT, ...brandBlock(LIGHT_SELECTOR) })],
    [
      'dark',
      () => ({
        ...LIBRARY_LIGHT,
        ...LIBRARY_DARK,
        ...brandBlock(LIGHT_SELECTOR),
        ...brandBlock(DARK_SELECTOR),
      }),
    ],
    [
      'system dark',
      () => ({
        ...LIBRARY_LIGHT,
        ...LIBRARY_DARK,
        ...brandBlock(LIGHT_SELECTOR),
        ...brandBlock(SYSTEM_SELECTOR, SYSTEM_MEDIA),
      }),
    ],
  ])('keep the library’s contrast pairs in %s', (theme, tokens) => {
    const values: Record<string, string> = tokens();
    for (const [foreground, background, minimum] of PAIRS) {
      const ratio = contrast(values[foreground]!, values[background]!);
      expect(
        ratio,
        `${theme}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(minimum);
    }
  });

  it('set a brand focus colour in every theme', () => {
    for (const block of [
      brandBlock(LIGHT_SELECTOR),
      brandBlock(DARK_SELECTOR),
      brandBlock(SYSTEM_SELECTOR, SYSTEM_MEDIA),
    ]) {
      expect(block['--ret-focus']).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('add no motion and leave the motion tokens alone, so reduced motion holds', () => {
    const css = STYLES.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/\b(transition|animation|transform|translate|scale|rotate)\b/);
    expect(css).not.toMatch(/@keyframes/);
    expect(css).not.toMatch(/--ret-(enter|exit)-/);
  });

  it('set no physical side, so the toast mirrors in RTL', () => {
    const css = STYLES.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/\b(left|right|top|bottom)\b/);
    expect(css).not.toMatch(/\bdirection\b/);
  });
});

describe('the recipe source', () => {
  it('is what the demo runs and shows', () => {
    const section = readFileSync(resolve(ROOT, 'demo/components/Theming.tsx'), 'utf8');
    expect(section).toContain("import { showBrandToast } from '../recipes/BrandToast';");
    expect(section).toContain("from '../recipes/BrandToast.tsx?raw';");
    expect(section).toContain("from '../recipes/brand-toast.css?raw';");
    expect(COMPONENT).toContain("import './brand-toast.css';");
  });
});
