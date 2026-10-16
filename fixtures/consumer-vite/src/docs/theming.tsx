// The TypeScript examples in docs/THEMING.md (P-26 S2). Each named region is copied verbatim into
// the document, and scripts/check-docs.js fails when the two differ or a region goes unused.
// validate-package.js type-checks this file against the packed package in F1 to F4. Nothing
// imports it, so the fixture's Vite build never bundles it and its calls never run.

// #region theming-setup
import 'react-elegant-toasts/styles.css';
import { Toaster, toast } from 'react-elegant-toasts';

export function App() {
  return <Toaster theme="system" />;
}
// #endregion

// #region theming-toaster-class
export function BrandedApp() {
  return <Toaster theme="dark" className="app-toaster" />;
}
// #endregion

// #region theming-toast-class
toast.success('Payment received', { className: 'receipt-toast' });
// #endregion

// #region theming-custom
toast.custom(
  <div className="sync-banner">
    <strong>Sync paused</strong>
    <p>Changes are saved on this device until you are back online.</p>
  </div>,
  { id: 'sync-status', className: 'sync-toast', closeButton: true }
);
// #endregion

// #region theming-progress
toast.info('Uploading report.pdf', { duration: 8000, progress: true });
// #endregion
