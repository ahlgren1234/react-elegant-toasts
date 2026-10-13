import { Fragment } from 'react';
import { toast } from 'react-elegant-toasts';
import labelsSource from '../recipes/LocalizedToaster.tsx?raw';
import {
  ANNOUNCEMENTS,
  KEYBOARD,
  LABELS,
  REDUCED_MOTION,
  SWIPE,
  SWIPE_WAYS,
  showPracticeToasts,
  type KeyboardClaim,
} from '../utils/accessibility';
import { highlight } from '../utils/highlight';
import { useMediaQuery } from '../utils/useMediaQuery';
import { CodePanel } from './CodePanel';

// The accessibility guidance (P-25 S6a). Its claims come from `utils/accessibility.ts`, where each
// is checked against the library; the labels example is a recipe file, shown as it is.
const LABELS_CODE = highlight(labelsSource);

/** A key combination as keys joined by `+`, read as "Alt plus T". */
const Combo = ({ keys }: { keys: readonly string[] }) =>
  keys.map((key, index) => (
    <Fragment key={key}>
      {index > 0 && '+'}
      <kbd>{key}</kbd>
    </Fragment>
  ));

const KeyTerm = ({ claim }: { claim: KeyboardClaim }) =>
  claim.keys.length === 0
    ? claim.when
    : claim.keys.map((keys, index) => (
        <Fragment key={keys.join('+')}>
          {index > 0 && ' and '}
          <Combo keys={keys} />
        </Fragment>
      ));

export function Accessibility() {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    <section id="accessibility" className="d-section" aria-labelledby="accessibility-heading">
      <div className="d-container">
        <header className="d-section__header">
          <p className="d-eyebrow">Accessibility</p>
          <h2 id="accessibility-heading" className="d-section__title">
            Keyboard, screen readers, touch and motion
          </h2>
          <p className="d-section__lede">
            What the library does for the people using your app, with its default settings, and what
            it leaves to you.
          </p>
        </header>

        <div className="d-a11y-try">
          <p className="d-a11y-try__text">
            Show two toasts that stay until they are closed, then try the keys below. They appear at
            the playground&apos;s position.
          </p>
          <button
            type="button"
            className="d-button d-button--primary"
            onClick={() => showPracticeToasts(toast)}
          >
            Show practice toasts
          </button>
        </div>

        <div className="d-a11y">
          <article className="d-a11y__topic" aria-labelledby="a11y-keyboard-heading">
            <h3 id="a11y-keyboard-heading" className="d-recipe__title">
              Keyboard
            </h3>
            <dl className="d-keys">
              {KEYBOARD.map(claim => (
                <div key={claim.id} className="d-keys__row">
                  <dt className="d-keys__term">
                    <KeyTerm claim={claim} />
                  </dt>
                  <dd className="d-keys__text">{claim.text}</dd>
                </div>
              ))}
            </dl>
            <p className="d-a11y__note">
              Choose another shortcut with the Toaster&apos;s <code>hotkey</code> prop, or pass{' '}
              <code>false</code> to turn it off; Escape keeps working. Alt+T means the physical T
              key, whatever the keyboard layout.
            </p>
          </article>

          <article className="d-a11y__topic" aria-labelledby="a11y-announcements-heading">
            <h3 id="a11y-announcements-heading" className="d-recipe__title">
              Announcements
            </h3>
            <ul className="d-a11y__list">
              {ANNOUNCEMENTS.map(claim => (
                <li key={claim.id}>{claim.text}</li>
              ))}
            </ul>
            <p className="d-a11y__note">
              Your part: messages that make sense heard on their own, meaning that never rests on an
              icon or a colour, and the error type kept for errors, since it interrupts. For custom
              content, see <a href="#custom">Bring your own markup</a>.
            </p>
          </article>

          <article className="d-a11y__topic" aria-labelledby="a11y-motion-heading">
            <h3 id="a11y-motion-heading" className="d-recipe__title">
              Reduced motion
            </h3>
            <p className="d-a11y__body">
              Toasts follow the <code>prefers-reduced-motion</code> setting through the stylesheet,
              so a change applies at once, and no toast stays a moment shorter or longer.
            </p>
            <ul className="d-a11y__list">
              {REDUCED_MOTION.map(claim => (
                <li key={claim.id}>{claim.text}</li>
              ))}
            </ul>
            <h4 className="d-a11y__subtitle">Try it</h4>
            <ul className="d-a11y__list">
              <li>
                Turn on Reduce motion in macOS or iOS, turn off Animation effects in Windows, or
                turn on Remove animations in Android.
              </li>
              <li>
                Or, in Chromium DevTools, set &ldquo;Emulate CSS media feature
                prefers-reduced-motion&rdquo; in the Rendering panel.
              </li>
            </ul>
            <p className="d-a11y__status">
              This browser {reducedMotion ? 'asks' : 'does not ask'} for reduced motion right now.
            </p>
          </article>

          <article className="d-a11y__topic" aria-labelledby="a11y-touch-heading">
            <h3 id="a11y-touch-heading" className="d-recipe__title">
              Touch and swipe
            </h3>
            <ul className="d-a11y__list">
              {SWIPE.map(claim => (
                <li key={claim.id}>{claim.text}</li>
              ))}
            </ul>
            <table className="d-a11y__table">
              <caption className="d-a11y__caption">
                Which way to swipe. Directions are physical, so RTL pages swipe the same way.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Position</th>
                  <th scope="col">Swipe</th>
                </tr>
              </thead>
              <tbody>
                {SWIPE_WAYS.map(row => (
                  <tr key={row.way}>
                    <th scope="row">{row.label}</th>
                    <td>{row.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="d-a11y__touch-hint">
              On this touch screen: show the practice toasts, then swipe one toward its edge.
            </p>
          </article>
        </div>

        <article className="d-recipe d-a11y__labels" aria-labelledby="a11y-labels-heading">
          <div className="d-recipe__text">
            <h3 id="a11y-labels-heading" className="d-recipe__title">
              Accessible labels
            </h3>
            <p className="d-recipe__body">
              The Toaster&apos;s <code>labels</code> prop sets the text it gives assistive
              technology, for localisation. Each label left out keeps its default.
            </p>
            <dl className="d-keys">
              {LABELS.map(label => (
                <div key={label.name} className="d-keys__row">
                  <dt className="d-keys__term">
                    <code>{label.name}</code>
                  </dt>
                  <dd className="d-keys__text">
                    {label.use}. Default: <bdi>{label.fallback}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <CodePanel tokens={LABELS_CODE} fileName="LocalizedToaster.tsx" />
        </article>
      </div>
    </section>
  );
}
