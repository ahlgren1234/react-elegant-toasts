import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster, toast, type ToastOptions, type ToastPosition, type ToastTheme } from '../src';
import '../src/styles.css';
import './styles.css';

// P-17 D1: the interim visual prototype for the OQ-24 sign-off. Demo only, not the production
// stylesheet, and not the P-25 demo rebuild. It loads after the production stylesheet and masks
// it, so `?production-css` skips it and shows the production stylesheet alone (P-17 review).
const PRODUCTION_CSS_ONLY = new URLSearchParams(window.location.search).has('production-css');
if (PRODUCTION_CSS_ONLY) document.documentElement.classList.add('demo-production-css');
else void import('./p17-prototype.css');

const POSITIONS: readonly ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];
const THEMES: readonly ToastTheme[] = ['system', 'light', 'dark'];
const LONG_TEXT =
  'Your export of 1,284 records finished, but 3 rows were skipped because their dates could not be parsed. https://example.com/a-very-long-unbroken-link-to-the-export-report-that-must-wrap';

// P-17 D1 review harness: drives the real toast API and Toaster props. P-25 replaces it.
function Prototype() {
  const [theme, setTheme] = useState<ToastTheme>('system');
  const [position, setPosition] = useState<ToastPosition>('top-right');
  const [description, setDescription] = useState(true);
  const [action, setAction] = useState(false);
  const [closeButton, setCloseButton] = useState(true);
  const [persistent, setPersistent] = useState(true);
  const [rtl, setRtl] = useState(false);

  const options = (at: ToastPosition = position): ToastOptions => ({
    position: at,
    closeButton,
    ...(persistent ? { duration: Infinity } : {}),
    ...(description ? { description: 'Changes are synced to all of your devices.' } : {}),
    ...(action ? { action: { label: 'Undo', onClick: () => undefined } } : {}),
  });

  const custom = (withClose: boolean) => {
    const id = `custom-${Date.now()}`;
    toast.custom(
      <div className="demo-custom-toast">
        <span className="demo-custom-avatar" aria-hidden="true">
          AL
        </span>
        <div>
          <strong>Ada Lovelace invited you</strong>
          <p>Join the Analytics workspace to view shared reports.</p>
          <button type="button" onClick={() => toast.dismiss(id)}>
            View invitation
          </button>
        </div>
      </div>,
      {
        id,
        position,
        closeButton: withClose,
        // The consumer's foreground on the toast root, which the library close button inherits.
        className: 'demo-custom-root',
        ...(persistent ? { duration: Infinity } : {}),
      }
    );
  };

  return (
    <section className="demo-prototype" aria-labelledby="prototype-heading">
      <h2 id="prototype-heading">P-17 visual prototype</h2>
      <p className="demo-note">
        Interim harness for the OQ-24 review: a neutral elevated card with a semantic accent. Not
        final styling. Alt+T focuses the first toast, Escape returns focus.
      </p>
      <p className="demo-note">
        {PRODUCTION_CSS_ONLY ? (
          <>
            Showing the production stylesheet only, with dotted outlines around each stack's hit
            area. <a href="?">Show the D1 prototype</a>
          </>
        ) : (
          <>
            Showing the D1 prototype. <a href="?production-css">Show production CSS only</a>
          </>
        )}
      </p>

      <div className="demo-controls">
        <label>
          Theme
          <select value={theme} onChange={e => setTheme(e.target.value as ToastTheme)}>
            {THEMES.map(value => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Position
          <select value={position} onChange={e => setPosition(e.target.value as ToastPosition)}>
            {POSITIONS.map(value => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={description}
            onChange={e => setDescription(e.target.checked)}
          />
          Description
        </label>
        <label>
          <input type="checkbox" checked={action} onChange={e => setAction(e.target.checked)} />
          Action
        </label>
        <label>
          <input
            type="checkbox"
            checked={closeButton}
            onChange={e => setCloseButton(e.target.checked)}
          />
          Close button
        </label>
        <label>
          <input
            type="checkbox"
            checked={persistent}
            onChange={e => setPersistent(e.target.checked)}
          />
          Persistent
        </label>
        <label>
          <input type="checkbox" checked={rtl} onChange={e => setRtl(e.target.checked)} />
          RTL
        </label>
      </div>

      <div className="demo-actions">
        <button
          type="button"
          className="demo-button"
          onClick={() => toast('Event has been created', options())}
        >
          Default
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={() => toast.success('Profile saved', options())}
        >
          Success
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={() => toast.error('Payment failed', options())}
        >
          Error
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={() => toast.warning('Storage almost full', options())}
        >
          Warning
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={() => toast.info('New version available', options())}
        >
          Info
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={() => toast.loading('Uploading report…', options())}
        >
          Loading
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={() =>
            toast.promise(
              () => new Promise<void>(resolve => setTimeout(resolve, 2000)),
              { loading: 'Publishing…', success: 'Published', error: 'Could not publish' },
              options()
            )
          }
        >
          Promise
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={() => toast.warning(LONG_TEXT, { ...options(), description: LONG_TEXT })}
        >
          Long text
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={() =>
            toast(
              'Your weekly analytics summary for the Marketing, Sales and Customer Success workspaces is ready to download',
              { ...options(), description: undefined }
            )
          }
        >
          Long title
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={() =>
            toast.info('Link copied', {
              ...options(),
              description:
                'https://example.com/shared/reports/2026/q3/a-very-long-unbroken-path-segment-without-any-spaces-at-all',
            })
          }
        >
          Unbroken URL
        </button>
        <button type="button" className="demo-button" onClick={() => custom(false)}>
          Custom
        </button>
        <button type="button" className="demo-button" onClick={() => custom(true)}>
          Custom + close
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={() => {
            toast.info('First (oldest)', options());
            toast.success('Second', options());
            toast.error('Third (newest)', options());
          }}
        >
          Stack of three
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={() => {
            toast('Default: event created', options());
            toast.success('Success: profile saved', options());
            toast.error('Error: payment failed', options());
            toast.warning('Warning: storage almost full', options());
            toast.info('Info: new version available', options());
            toast.loading('Loading: uploading report', options());
          }}
        >
          All types
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={() => POSITIONS.forEach(at => toast.success(at, options(at)))}
        >
          All six positions
        </button>
        <button type="button" className="demo-button danger" onClick={() => toast.dismiss()}>
          Dismiss all
        </button>
      </div>
      {/* Direction is inherited from the DOM (§20): the toasts mirror, the positions do not. */}
      <div dir={rtl ? 'rtl' : 'ltr'}>
        {/* Six visible per stack, so the All types matrix shows at once (the default is 4). */}
        <Toaster theme={theme} maxVisible={6} />
      </div>
    </section>
  );
}

const Demo = () => (
  <div className="demo-container">
    <header className="demo-header">
      <h1>react-elegant-toasts</h1>
      <p>The demo is being rebuilt for 2.0.</p>
      <div className="demo-links">
        <a
          href="https://github.com/ahlgren1234/react-elegant-toasts"
          target="_blank"
          rel="noopener noreferrer"
          className="demo-link"
        >
          <svg height="24" width="24" viewBox="0 0 16 16" className="demo-icon">
            <path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              fill="currentColor"
            />
          </svg>
          GitHub Repository
        </a>
        <a
          href="https://www.npmjs.com/package/react-elegant-toasts"
          target="_blank"
          rel="noopener noreferrer"
          className="demo-link"
        >
          <svg height="24" width="24" viewBox="0 0 24 24" className="demo-icon">
            <path
              d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331zM10.665 10H12v2.667h-1.335V10z"
              fill="currentColor"
            />
          </svg>
          npm Package
        </a>
        <a
          href="https://anyawantana.se"
          target="_blank"
          rel="noopener noreferrer"
          className="demo-link portfolio"
        >
          <svg height="24" width="24" viewBox="0 0 24 24" className="demo-icon">
            <path
              d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 22c-5.523 0-10-4.477-10-10S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm1-11v6h-2v-6H8l4-4 4 4h-3z"
              fill="currentColor"
            />
          </svg>
          Portfolio
        </a>
        <a
          href="https://buymeacoffee.com/peterahlgren"
          target="_blank"
          rel="noopener noreferrer"
          className="demo-link coffee"
        >
          <svg height="24" width="24" viewBox="0 0 24 24" className="demo-icon">
            <path
              d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4v-2z"
              fill="currentColor"
            />
          </svg>
          Buy me a coffee
        </a>
      </div>
    </header>

    <main className="demo-content">
      <Prototype />
    </main>
  </div>
);

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<Demo />);
}
