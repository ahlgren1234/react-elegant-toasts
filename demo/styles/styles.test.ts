import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

// The page stylesheet's S7 contract (P-25): the sticky header never covers a link target or a
// focused control, the header stops sticking where it would take too much of the screen, controls
// meet the target sizes of decision 7, nothing moves under reduced motion, and every state drawn
// with a fill or a shadow is redrawn in system colours under forced colours. Layout itself is
// checked in real browsers; these tests keep the rules that produce it from regressing.

const CSS = readFileSync(resolve(__dirname, 'styles.css'), 'utf8');

interface Rule {
  selector: string;
  media: string | null;
  style: CSSStyleDeclaration;
}

/** Every style rule, with the media condition it sits in, if any. */
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
        found.push({ selector: rule.selectorText.replace(/\s+/g, ' '), media, style: rule.style });
      } else if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, rule.conditionText);
      }
    }
  };
  walk(sheet.cssRules, null);
  return found;
}

const RULES = rulesOf(CSS);
const FORCED = '(forced-colors: active)';
const STATIC_HEADER = '(max-width: 639.98px), (max-height: 499.98px)';

/** The value of `property` in the one rule for `selector` under `media`. */
function valueOf(selector: string, property: string, media: string | null = null): string {
  const matches = RULES.filter(rule => rule.selector === selector && rule.media === media);
  expect(matches, `${selector} in ${media ?? 'no media'}`).toHaveLength(1);
  return matches[0]!.style.getPropertyValue(property);
}

const px = (value: string) => {
  expect(value).toMatch(/^\d+px$/);
  return parseInt(value, 10);
};

describe('the sticky header', () => {
  it('sticks by default', () => {
    expect(valueOf('.d-header', 'position')).toBe('sticky');
  });

  it('keeps fragment targets and focused controls below it, by its measured height', () => {
    expect(valueOf('html', '--d-sticky-top')).toBe('var(--d-header-offset,var(--d-header-height))');
    expect(valueOf('html', 'scroll-padding-block-start')).toBe('var(--d-sticky-top)');
    // No fixed per-section margin that the header's real height could outgrow.
    expect(CSS).not.toMatch(/scroll-margin/);
  });

  it('stops sticking on narrow or short viewports, and then covers nothing', () => {
    expect(valueOf('.d-header', 'position', STATIC_HEADER)).toBe('static');
    expect(valueOf('html', '--d-sticky-top', STATIC_HEADER)).toBe('0px');
  });

  it('is cleared by the sticky code panel', () => {
    expect(valueOf('.d-playground__code', 'inset-block-start', '(min-width: 1024px)')).toBe(
      'calc(var(--d-sticky-top) + var(--d-space-5))'
    );
  });
});

describe('target sizes (decision 7)', () => {
  it.each([
    '.d-button',
    '.d-copy-button',
    '.d-section-nav__link',
    '.d-switch',
    '.d-choice__face',
    '.d-footer-link',
  ])('%s is 40px tall or more', selector => {
    expect(px(valueOf(selector, 'min-height'))).toBeGreaterThanOrEqual(40);
  });

  it.each([
    ['.d-icon-link', 'height', 'min-width'],
    ['.d-segmented__face', 'height', 'min-width'],
  ])('%s is at least 24 × 24px', (selector, height, width) => {
    expect(px(valueOf(selector, height))).toBeGreaterThanOrEqual(24);
    expect(px(valueOf(selector, width))).toBeGreaterThanOrEqual(24);
  });

  it('keeps the small button at 24px or more', () => {
    expect(px(valueOf('.d-button--small', 'min-height'))).toBeGreaterThanOrEqual(24);
  });
});

describe('the install command and the section links', () => {
  it('wrap instead of scrolling, so they fit at 320px', () => {
    expect(valueOf('.d-install', 'flex-wrap')).toBe('wrap');
    expect(valueOf('.d-install', 'overflow-x')).toBe('');
    // It breaks only at its spaces: each word stays whole, the package name's hyphens included.
    expect(valueOf('.d-install__command code', 'white-space')).toBe('');
    expect(valueOf('.d-install__word', 'white-space')).toBe('nowrap');
    expect(valueOf('.d-section-nav__list', 'flex-wrap')).toBe('wrap');
    expect(valueOf('.d-section-nav__list', 'overflow-x')).toBe('');
  });

  it('read the command left to right in an RTL page', () => {
    expect(valueOf('.d-install__command', 'direction')).toBe('ltr');
  });

  it('use logical properties only, so they mirror in RTL', () => {
    // The source, not the parsed rules: the parser expands shorthands into physical longhands.
    const blocks = [...CSS.matchAll(/^\.d-(?:install|section-nav)[^{]*\{([^}]*)\}/gm)];
    expect(blocks.length).toBeGreaterThan(5);
    for (const [block, body] of blocks) {
      expect(body, block).not.toMatch(/(^|[\s;])(left|right|top|bottom|width|height)\s*:/);
      expect(body, block).not.toMatch(/-(left|right|top|bottom)\s*:/);
    }
  });
});

describe('reduced motion', () => {
  it('scrolls smoothly only without a reduced-motion preference', () => {
    const smooth = RULES.filter(rule => rule.style.getPropertyValue('scroll-behavior') !== '');
    expect(smooth.map(rule => [rule.selector, rule.media])).toEqual([
      ['html', '(prefers-reduced-motion: no-preference)'],
    ]);
  });

  it('turns off every page transition, which only page elements have', () => {
    const reduce = RULES.filter(rule => rule.media === '(prefers-reduced-motion: reduce)');
    expect(reduce).toHaveLength(1);
    expect(reduce[0]!.selector).toBe('.d-page *, .d-page *::before, .d-page *::after');
    expect(reduce[0]!.style.getPropertyValue('transition')).toBe('none');
    expect(reduce[0]!.style.getPropertyPriority('transition')).toBe('important');
    expect(CSS).not.toMatch(/animation|@keyframes/);
    for (const rule of RULES.filter(rule => rule.style.getPropertyValue('transition') !== '')) {
      expect(rule.selector).toMatch(/^\.d-/);
    }
  });
});

describe('forced colours', () => {
  const forced = RULES.filter(rule => rule.media === FORCED);

  it('redraw every selected and on state in system colours', () => {
    const selectors = forced.map(rule => rule.selector);
    expect(selectors).toEqual(
      expect.arrayContaining([
        '.d-segmented input:checked + .d-segmented__face, .d-choice input:checked + .d-choice__face',
        '.d-switch__thumb',
        '.d-switch input:checked + .d-switch__track',
        '.d-switch input:checked + .d-switch__track .d-switch__thumb',
        '.d-position:has(input:checked)',
        '.d-position input:checked ~ .d-position__glyph',
        '.d-button:disabled',
      ])
    );
    expect(
      valueOf(
        '.d-segmented input:checked + .d-segmented__face, .d-choice input:checked + .d-choice__face',
        'background-color',
        FORCED
      )
    ).toBe('selecteditem');
  });

  it('draw the switch thumb in a colour unlike its track, on and off', () => {
    const color = (selector: string) => valueOf(selector, 'background-color', FORCED);
    expect(color('.d-switch__thumb')).not.toBe(color('.d-switch__track'));
    expect(color('.d-switch input:checked + .d-switch__track .d-switch__thumb')).not.toBe(
      color('.d-switch input:checked + .d-switch__track')
    );
  });

  it('keep the focus ring on the selected position', () => {
    const selected = RULES.findIndex(
      rule => rule.media === FORCED && rule.selector === '.d-position:has(input:checked)'
    );
    const focused = RULES.findIndex(
      rule => rule.media === FORCED && rule.selector === '.d-position:has(input:focus-visible)'
    );
    expect(focused).toBeGreaterThan(selected);
    expect(valueOf('.d-position:has(input:focus-visible)', 'outline', FORCED)).toMatch(
      /^2px solid/
    );
  });

  it('use system colours only, and opt out of forcing only where they set every colour', () => {
    for (const rule of forced) {
      for (const property of rule.style) {
        const value = rule.style.getPropertyValue(property);
        expect(value, `${rule.selector} ${property}`).not.toMatch(/var\(|#[0-9a-f]{3,8}\b|rgb/i);
      }
    }
    const optedOut = forced
      .filter(rule => rule.style.getPropertyValue('forced-color-adjust') === 'none')
      .map(rule => rule.selector);
    expect(optedOut).toEqual([
      '.d-segmented input:checked + .d-segmented__face, .d-choice input:checked + .d-choice__face',
      '.d-switch__track',
      '.d-position__glyph',
      // A swatch shows a token's value, so it keeps its real colour.
      '.d-token__swatch',
    ]);
  });
});
