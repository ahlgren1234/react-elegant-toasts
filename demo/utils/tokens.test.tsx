import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { TokenList } from '../components/TokenList';
import { OVERRIDE_EXAMPLE, TOKEN_GROUPS, TOKENS, isSwatchColour, tokenReference } from './tokens';

// The CSS token reference (P-25 S6b). The public token set is what the library's stylesheet
// declares: its own contract test (src/__tests__/styles.test.ts) allows custom property
// declarations only in the token blocks on `.ret-toaster`. Properties the stylesheet only reads,
// such as the swipe offsets the renderer writes inline, are internal. These tests read the
// stylesheet through the CSSOM, a parser independent of the reference's own, and compare.

const ROOT = resolve(__dirname, '../..');
const LIBRARY_CSS = readFileSync(resolve(ROOT, 'src/styles.css'), 'utf8');

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
      if (rule instanceof CSSStyleRule)
        found.push({ selector: rule.selectorText, media, style: rule.style });
      else if (rule instanceof CSSMediaRule) walk(rule.cssRules, rule.conditionText);
    }
  };
  walk(sheet.cssRules, null);
  return found;
}

/** A value with its whitespace normalised: the CSSOM drops it around `/` and after commas. */
const canonical = (value: string | null | undefined): string | undefined =>
  value
    ?.replace(/\s+/g, ' ')
    .replace(/\s*([/,()])\s*/g, '$1')
    .trim();

const customProperties = (style: CSSStyleDeclaration): Record<string, string> =>
  Object.fromEntries(
    [...style]
      .filter(property => property.startsWith('--'))
      .map(property => [property, canonical(style.getPropertyValue(property))!])
  );

const RULES = rulesOf(LIBRARY_CSS);
const block = (selector: string, media: string | null = null) => {
  const rule = RULES.find(r => r.selector === selector && r.media === media);
  if (!rule) throw new Error(`no rule ${selector}`);
  return customProperties(rule.style);
};
const LIGHT = block(':where(.ret-toaster)');
const DARK = block(":where(.ret-toaster[data-theme='dark'])");
const SYSTEM_DARK = block(
  ":where(.ret-toaster[data-theme='system'])",
  '(prefers-color-scheme: dark)'
);

/** Every custom property the stylesheet declares, in any rule: the public token set. */
const DECLARED = [...new Set(RULES.flatMap(rule => Object.keys(customProperties(rule.style))))];
const NAMES = TOKENS.map(token => token.name);
const REFERENCE = tokenReference(LIBRARY_CSS);

describe('the token inventory', () => {
  it('documents every token the stylesheet declares', () => {
    const missing = DECLARED.filter(name => !NAMES.includes(name as never));
    expect(missing, 'declared in src/styles.css but not in the reference').toEqual([]);
  });

  it('documents no token the stylesheet does not declare', () => {
    const unexpected = NAMES.filter(name => !DECLARED.includes(name));
    expect(unexpected, 'in the reference but not declared in src/styles.css').toEqual([]);
  });

  it('has the 30 public tokens of the approved plan, each once, all --ret-*', () => {
    expect(NAMES).toHaveLength(30);
    expect(new Set(NAMES).size).toBe(NAMES.length);
    expect(NAMES.every(name => /^--ret-[a-z]+(-[a-z]+)*$/.test(name))).toBe(true);
    expect(new Set(TOKEN_GROUPS.map(group => group.id)).size).toBe(TOKEN_GROUPS.length);
  });

  it('gives every token a default on the toaster root', () => {
    expect(Object.keys(LIGHT).sort()).toEqual([...NAMES].sort());
  });

  it('leaves out the internal properties the stylesheet only reads', () => {
    const read = [...LIBRARY_CSS.matchAll(/var\((--[\w-]+)/g)].map(match => match[1]!);
    const internal = [...new Set(read)].filter(name => !DECLARED.includes(name));
    // The swipe offsets and opacity, written inline by the renderer (P-21): not tokens.
    expect(internal.length).toBeGreaterThan(0);
    expect(internal.every(name => name.startsWith('--ret-swipe-'))).toBe(true);
    expect(internal.filter(name => NAMES.includes(name as never))).toEqual([]);
  });

  it('gives every token a purpose', () => {
    for (const token of TOKENS) expect(token.purpose.trim(), token.name).not.toBe('');
  });
});

describe('the reference values', () => {
  const entries = REFERENCE.flatMap(group => group.tokens);

  it('shows each default as the stylesheet declares it', () => {
    for (const entry of entries) expect(canonical(entry.light), entry.name).toBe(LIGHT[entry.name]);
  });

  it('shows a dark value exactly for the tokens the dark theme sets', () => {
    expect(
      entries
        .filter(entry => entry.dark !== undefined)
        .map(entry => entry.name)
        .sort()
    ).toEqual(Object.keys(DARK).sort());
    for (const entry of entries) expect(canonical(entry.dark), entry.name).toBe(DARK[entry.name]);
  });

  it('can say system uses the dark values, because the system block repeats them', () => {
    expect(SYSTEM_DARK).toEqual(DARK);
  });

  it('keeps layout, motion and progress height the same in every theme', () => {
    const themed = Object.keys(DARK);
    for (const id of ['layout', 'motion']) {
      const group = TOKEN_GROUPS.find(g => g.id === id)!;
      expect(group.tokens.filter(token => themed.includes(token.name))).toEqual([]);
    }
    expect(themed).not.toContain('--ret-progress-height');
    expect(themed).toContain('--ret-progress');
  });

  it('reads the values from the stylesheet it is given', () => {
    const changed = LIBRARY_CSS.replace('--ret-radius: 10px;', '--ret-radius: 12px;').replace(
      '--ret-surface: #27272a;',
      '--ret-surface: #111111;'
    );
    const values = tokenReference(changed).flatMap(group => group.tokens);
    expect(values.find(entry => entry.name === '--ret-radius')?.light).toBe('12px');
    expect(values.find(entry => entry.name === '--ret-surface')?.dark).toBe('#111111');
  });

  it('shows a renamed token as unset, so the drift is visible', () => {
    const renamed = LIBRARY_CSS.replace(/--ret-gap:/g, '--ret-spacing:');
    const gap = tokenReference(renamed)
      .flatMap(group => group.tokens)
      .find(entry => entry.name === '--ret-gap');
    expect(gap?.light).toBeUndefined();
  });
});

describe('the rendered reference', () => {
  it('lists every token name, in reference order, as code', () => {
    const { container } = render(<TokenList groups={REFERENCE} />);
    const shown = [...container.querySelectorAll('dt code')].map(code => code.textContent);
    expect(shown).toEqual(NAMES);
    expect([...shown].sort()).toEqual([...DECLARED].sort());
  });

  it('shows each token’s values, labelled by theme', () => {
    const { container } = render(<TokenList groups={REFERENCE} />);
    for (const row of container.querySelectorAll('.d-token')) {
      const name = row.querySelector('dt')!.textContent!;
      const values = [...row.querySelectorAll('.d-token__value')].map(value => [
        value.querySelector('.d-token__theme')!.textContent,
        canonical(value.querySelector('code')!.textContent),
      ]);
      expect(values).toEqual(
        name in DARK
          ? [
              ['Light', LIGHT[name]],
              ['Dark', DARK[name]],
            ]
          : [['All themes', LIGHT[name]]]
      );
    }
  });

  it('heads each group, and marks colour swatches as decorative', () => {
    const { container } = render(<TokenList groups={REFERENCE} />);
    expect(screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent)).toEqual(
      TOKEN_GROUPS.map(group => group.title)
    );
    const swatches = [...container.querySelectorAll<HTMLElement>('.d-token__swatch')];
    expect(swatches.length).toBeGreaterThan(0);
    for (const swatch of swatches) {
      expect(swatch.getAttribute('aria-hidden')).toBe('true');
      const value = swatch.nextElementSibling!.textContent!;
      expect(isSwatchColour(value)).toBe(true);
      expect(swatch.textContent).toBe('');
    }
  });

  it('names each group region by its heading', () => {
    render(<TokenList groups={REFERENCE} />);
    for (const group of TOKEN_GROUPS) {
      const region = screen.getByRole('region', { name: group.title });
      expect(within(region).getAllByRole('term')).toHaveLength(group.tokens.length);
    }
  });

  it('has no axe violations', async () => {
    render(<TokenList groups={REFERENCE} />);
    expect((await axe(document.body)).violations).toEqual([]);
  });
});

describe('the override example', () => {
  const rules = rulesOf(OVERRIDE_EXAMPLE);

  it('sets only public tokens, and nothing else', () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      const set = [...rule.style];
      expect(set.length).toBeGreaterThan(0);
      expect(
        set.filter(property => !DECLARED.includes(property)),
        rule.selector
      ).toEqual([]);
      for (const property of set) expect(rule.style.getPropertyPriority(property)).toBe('');
    }
  });

  it('uses the documented Toaster and theme selectors, or a toast class of its own', () => {
    const selectors = rules.map(rule => [rule.selector, rule.media]);
    expect(selectors).toEqual([
      ['.ret-toaster', null],
      [".ret-toaster[data-theme='dark']", null],
      [".ret-toaster[data-theme='system']", '(prefers-color-scheme: dark)'],
      ['.receipt-toast', null],
    ]);
  });

  it('gives system dark the same values as dark', () => {
    expect(customProperties(rules[2]!.style)).toEqual(customProperties(rules[1]!.style));
  });
});

describe('the section source', () => {
  it('reads the reference from the stylesheet the package ships', () => {
    const section = readFileSync(resolve(ROOT, 'demo/components/Theming.tsx'), 'utf8');
    expect(section).toContain("import libraryStyles from 'react-elegant-toasts/styles.css?raw';");
    expect(section).toContain('tokenReference(libraryStyles)');
    expect(section).toContain('<TokenList groups={REFERENCE} />');
  });
});

describe('the section styles', () => {
  const DEMO_CSS = readFileSync(resolve(ROOT, 'demo/styles/styles.css'), 'utf8');
  const start = DEMO_CSS.indexOf(' * Theming (P-25 S6b)');
  const end = DEMO_CSS.indexOf(' * Accessibility (P-25 S6a)');
  const css = DEMO_CSS.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const used = new Set(
    ['demo/components/Theming.tsx', 'demo/components/TokenList.tsx']
      .map(file => readFileSync(resolve(ROOT, file), 'utf8'))
      .flatMap(source => [...source.matchAll(/className="([^"]+)"/g)])
      .flatMap(match => match[1]!.split(' '))
  );

  it('exist, and style the reference’s own classes only', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const styled = new Set([...css.matchAll(/\.(d-[\w-]+)/g)].map(match => match[1]!));
    expect(styled.size).toBeGreaterThan(0);
    expect([...styled].filter(name => !used.has(name))).toEqual([]);
    expect([...styled].every(name => /^d-tokens?(-|_|$)/.test(name))).toBe(true);
  });

  it('use logical properties only, so the reference mirrors in RTL', () => {
    expect(css).not.toMatch(/(^|[\s;{])(left|right|top|bottom|width|height)\s*:/);
    expect(css).not.toMatch(/-(left|right|top|bottom)\s*:/);
    expect(css).not.toMatch(/:\s*(left|right)\s*;/);
  });

  it('keep token names and values left to right inside any page direction', () => {
    const rule = css.slice(css.indexOf('.d-token code {'));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).toContain('direction: ltr');
    expect(body).toContain('unicode-bidi: isolate');
  });

  it('animate nothing', () => {
    expect(css).not.toMatch(/\b(transition|animation)/);
  });
});
