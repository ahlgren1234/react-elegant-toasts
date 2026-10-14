// Consumer checks for the progress direction (§20, Issue #45), shared by validate-package.js (the
// Vite fixture, F1) and check-next-app.js (the Next.js fixture, N1). Default consumer builds
// minify CSS with Lightning CSS, which lowers `:dir()` to a `:lang()` list for older targets, so
// the emitted CSS must keep no direction or language selector, and a real browser must anchor
// the remaining progress at the inline start: the right in RTL, whatever the language.

/** The `:dir(` and `:lang(` selectors in emitted CSS, outside comments. */
export function directionSelectors(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').match(/:(dir|lang)\(/gi) ?? [];
}

// Each case sets direction and language on <html>, as an application does.
const CASES = [
  { name: 'dir="rtl"', dir: 'rtl', lang: null, edge: 'right' },
  { name: 'dir="ltr" lang="ar"', dir: 'ltr', lang: 'ar', edge: 'left' },
];
// The visible fill has run this far below the strip's width when it is measured, so both of its
// edges are clear of the strip's.
const DEPLETED = 0.9;
const PX = 0.5;

/**
 * Checks the visible progress fill in Chromium for each case. `open(page)` loads the built app;
 * `show(page)` shows one finite toast with progress on and returns its locator. The fill is twice
 * the strip's inline size and clipped by it, so only its part inside the strip is measured.
 */
export async function checkProgressDirection(browser, { open, show }) {
  const results = [];
  for (const { name, dir, lang, edge } of CASES) {
    const page = await browser.newPage();
    try {
      await open(page);
      await page.locator('html').evaluate(
        (html, { dir, lang }) => {
          html.setAttribute('dir', dir);
          if (lang === null) html.removeAttribute('lang');
          else html.setAttribute('lang', lang);
        },
        { dir, lang }
      );
      const item = await show(page);
      const strip = item.locator('.ret-toast__progress');
      await strip.waitFor({ state: 'attached', timeout: 10_000 });
      const measure = () =>
        strip.evaluate(element => {
          const fill = element.querySelector('.ret-toast__progress-fill');
          const s = element.getBoundingClientRect();
          const f = fill.getBoundingClientRect();
          const left = Math.max(s.left, f.left);
          const right = Math.max(left, Math.min(s.right, f.right));
          return {
            direction: element.ownerDocument.defaultView.getComputedStyle(fill).direction,
            stripLeft: s.left,
            stripRight: s.right,
            stripWidth: s.width,
            left,
            right,
          };
        });
      await page.waitForFunction(
        ([element, depleted]) => {
          const fill = element.querySelector('.ret-toast__progress-fill');
          const s = element.getBoundingClientRect();
          const f = fill.getBoundingClientRect();
          const visible = Math.min(s.right, f.right) - Math.max(s.left, f.left);
          return visible < depleted * s.width;
        },
        [await strip.elementHandle(), DEPLETED],
        { timeout: 10_000 }
      );
      const box = await measure();
      if (box.direction !== dir) {
        throw new Error(`${name}: the fill's direction is ${box.direction}, not ${dir}`);
      }
      const anchored =
        edge === 'left'
          ? Math.abs(box.left - box.stripLeft) < PX && box.stripRight - box.right > PX
          : Math.abs(box.stripRight - box.right) < PX && box.left - box.stripLeft > PX;
      if (!anchored) {
        const at = `visible fill ${box.left.toFixed(1)}–${box.right.toFixed(1)} in strip ${box.stripLeft.toFixed(1)}–${box.stripRight.toFixed(1)}`;
        throw new Error(`${name}: the remaining progress is not anchored ${edge} (${at})`);
      }
      results.push(`${name} anchors ${edge}`);
    } finally {
      await page.close();
    }
  }
  return results;
}
