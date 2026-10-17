// The TypeScript examples of docs/MIGRATION.md (P-27 S3) that the README does not already show;
// the guide reuses the README's regions for the rest. Each named region is copied verbatim into the
// guide, and scripts/check-docs.js fails when the two differ or a region goes unused.
// validate-package.js type-checks this file against the packed package in F1 to F4. Nothing
// imports it, so the fixture's Vite build never bundles it and its calls never run.

// #region migration-quick-start
import 'react-elegant-toasts/styles.css';
import { Toaster, toast } from 'react-elegant-toasts';

export function App() {
  return (
    <>
      <SaveButton />
      <Toaster />
    </>
  );
}

function SaveButton() {
  const save = () => toast.success('Changes saved', { description: 'Your profile is up to date.' });
  return (
    <button type="button" onClick={save}>
      Save
    </button>
  );
}
// #endregion

// #region migration-replace
toast.loading('Uploading report.pdf', { id: 'upload', position: 'bottom-center' });

// The replacement keeps nothing it leaves out: repeat every option you still want.
toast.success('Report uploaded', { id: 'upload', position: 'bottom-center' });
// #endregion
