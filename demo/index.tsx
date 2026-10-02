import { createRoot } from 'react-dom/client';
import { Toaster, toast } from '../src';
import '../src/styles.css';
import './styles.css';

// P-08 placeholder: the 0.x demo is gone and P-25 rebuilds the demo for 2.0.
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
      <div className="demo-actions">
        <button type="button" onClick={() => toast('Hello')} className="demo-button primary">
          Show toast
        </button>
      </div>
    </main>

    <Toaster />
  </div>
);

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<Demo />);
}
