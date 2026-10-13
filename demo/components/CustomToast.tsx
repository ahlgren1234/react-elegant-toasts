import { useState } from 'react';
import styleSource from '../recipes/invite-toast.css?raw';
import { showInvite } from '../recipes/InviteToast';
import componentSource from '../recipes/InviteToast.tsx?raw';
import { highlight, highlightCss } from '../utils/highlight';
import { CodePanel } from './CodePanel';

// The custom toast (P-25 S5b). The button runs `showInvite` from the recipe module, and the code
// panels show that module's own source files, so the code shown is the code that runs.
const CODE = {
  component: highlight(componentSource),
  styles: highlightCss(styleSource),
};

const DISMISS_CHOICES = [
  { value: false, label: 'Its own button' },
  { value: true, label: 'Library close' },
] as const;

export function CustomToast() {
  const [closeButton, setCloseButton] = useState(false);

  return (
    <section id="custom" className="d-section" aria-labelledby="custom-heading">
      <div className="d-container">
        <header className="d-section__header">
          <p className="d-eyebrow">Custom toast</p>
          <h2 id="custom-heading" className="d-section__title">
            Bring your own markup
          </h2>
          <p className="d-section__lede">
            <code>toast.custom</code> renders your component with no card around it. The library
            still places, queues, times, animates and announces it; what is inside is yours.
          </p>
        </header>

        <article className="d-recipe" aria-labelledby="invite-heading">
          <div className="d-recipe__text">
            <h3 id="invite-heading" className="d-recipe__title">
              An accessible invitation
            </h3>
            <p className="d-recipe__body">
              A persistent toast with its own icon, text and buttons, styled through its{' '}
              <code>className</code> with the library&apos;s theme tokens, so it follows the
              Toaster&apos;s theme and the page&apos;s direction. Its buttons dismiss it by its{' '}
              <code>id</code>, so no other toast closes.
            </p>

            <fieldset className="d-field d-custom__field" aria-describedby="custom-dismiss-hint">
              <legend className="d-field__legend">Dismissed with</legend>
              <div className="d-segmented d-segmented--fill">
                {DISMISS_CHOICES.map(({ value, label }) => (
                  <label key={label} className="d-segmented__option">
                    <input
                      type="radio"
                      name="custom-dismiss"
                      className="d-visually-hidden"
                      checked={closeButton === value}
                      onChange={() => setCloseButton(value)}
                    />
                    <span className="d-segmented__face">{label}</span>
                  </label>
                ))}
              </div>
              <p id="custom-dismiss-hint" className="d-field__hint">
                A toast that stays until it is answered needs a keyboard way to close it. Custom
                toasts have no close button unless you pass <code>closeButton: true</code>.
              </p>
            </fieldset>

            <div className="d-recipe__actions">
              <button
                type="button"
                className="d-button d-button--primary"
                onClick={() => showInvite({ closeButton })}
              >
                Show the invitation
              </button>
            </div>

            <div className="d-boundary">
              <div className="d-boundary__column">
                <h4 className="d-boundary__title">The library provides</h4>
                <ul className="d-boundary__list">
                  <li>The toast region, its list and the polite announcement</li>
                  <li>
                    <kbd>Alt</kbd>+<kbd>T</kbd> and <kbd>Escape</kbd>, and focus kept in the region
                    when a focused toast closes
                  </li>
                  <li>Pausing, motion and reduced motion</li>
                </ul>
              </div>
              <div className="d-boundary__column">
                <h4 className="d-boundary__title">Your content provides</h4>
                <ul className="d-boundary__list">
                  <li>Roles and accessible names for its controls</li>
                  <li>Keyboard use, visible focus, contrast and target sizes</li>
                  <li>A way to dismiss a persistent toast</li>
                </ul>
              </div>
            </div>
            <p className="d-recipe__body">
              The announcement is the toast&apos;s text content: button labels and hidden text
              included. Keep it meaningful, and keep text out of decorative elements.
            </p>
          </div>

          <div className="d-custom__code">
            <CodePanel tokens={CODE.component} fileName="InviteToast.tsx" />
            <CodePanel tokens={CODE.styles} fileName="invite-toast.css" />
          </div>
        </article>
      </div>
    </section>
  );
}
