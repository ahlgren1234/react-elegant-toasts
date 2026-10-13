import libraryStyles from 'react-elegant-toasts/styles.css?raw';
import brandStyles from '../recipes/brand-toast.css?raw';
import { showBrandToast } from '../recipes/BrandToast';
import brandSource from '../recipes/BrandToast.tsx?raw';
import { highlight, highlightCss } from '../utils/highlight';
import { OVERRIDE_EXAMPLE, TOKENS, tokenReference } from '../utils/tokens';
import { CodePanel } from './CodePanel';
import { TokenList } from './TokenList';

// Theming (P-25 S6b). The button runs `showBrandToast` from the recipe module, and the code panels
// show that module's own files. The reference reads its values from the package's stylesheet text,
// the file the page itself loads, so they are the values that ship.
const REFERENCE = tokenReference(libraryStyles);
const CODE = {
  component: highlight(brandSource),
  styles: highlightCss(brandStyles),
  overrides: highlightCss(OVERRIDE_EXAMPLE),
};

export function Theming() {
  return (
    <section id="theming" className="d-section" aria-labelledby="theming-heading">
      <div className="d-container">
        <header className="d-section__header">
          <p className="d-eyebrow">Theming</p>
          <h2 id="theming-heading" className="d-section__title">
            Restyle it with CSS tokens
          </h2>
          <p className="d-section__lede">
            The stylesheet reads its colours, shape, spacing and motion from {TOKENS.length}{' '}
            <code>--ret-*</code> custom properties. Set them on a Toaster, on one theme, or on a
            single toast through its <code>className</code>.
          </p>
        </header>

        <article className="d-recipe" aria-labelledby="brand-heading">
          <div className="d-recipe__text">
            <h3 id="brand-heading" className="d-recipe__title">
              A branded toast
            </h3>
            <p className="d-recipe__body">
              A built-in success toast with one extra class. Its CSS sets tokens on that class, so
              the card, icon, action, progress strip and focus rings follow, and every other toast
              keeps the defaults.
            </p>
            <div className="d-recipe__actions">
              <button
                type="button"
                className="d-button d-button--primary"
                onClick={() => showBrandToast()}
              >
                Show the branded toast
              </button>
            </div>

            <div className="d-boundary">
              <div className="d-boundary__column">
                <h4 className="d-boundary__title">It keeps</h4>
                <ul className="d-boundary__list">
                  <li>
                    Light and dark values, through the documented <code>data-theme</code> selectors
                  </li>
                  <li>Right-to-left mirroring, as it sets no physical side</li>
                  <li>Reduced motion, as no motion is added</li>
                  <li>Focus rings, with a brand focus colour at 3:1 or more</li>
                </ul>
              </div>
              <div className="d-boundary__column">
                <h4 className="d-boundary__title">Leave to the library</h4>
                <ul className="d-boundary__list">
                  <li>
                    The root&apos;s <code>transform</code> and transitions, which move the stack
                  </li>
                  <li>Inner markup without a documented class</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="d-custom__code">
            <CodePanel tokens={CODE.component} fileName="BrandToast.tsx" />
            <CodePanel tokens={CODE.styles} fileName="brand-toast.css" />
          </div>
        </article>

        <section className="d-tokens" aria-labelledby="tokens-heading">
          <div className="d-tokens__intro">
            <div>
              <h3 id="tokens-heading" className="d-recipe__title">
                Token reference
              </h3>
              <p className="d-recipe__body">
                All {TOKENS.length} tokens, with their defaults. Colour tokens have a value for each
                theme; <code>system</code> uses the dark values when the operating system is dark.
                The rest are the same in every theme. Defaults have no specificity, so any selector
                overrides them without <code>!important</code>.
              </p>
            </div>
            <CodePanel tokens={CODE.overrides} fileName="overrides.css" />
          </div>
          <TokenList groups={REFERENCE} />
        </section>
      </div>
    </section>
  );
}
