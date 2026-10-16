// The TypeScript examples in docs/ACCESSIBILITY.md (P-26 S3). Each named region is copied verbatim
// into the document, and scripts/check-docs.js fails when the two differ or a region goes unused.
// validate-package.js type-checks this file against the packed package in F1 to F4. Nothing
// imports it, so the fixture's Vite build never bundles it and its calls never run.

// #region accessibility-labels
import { Toaster, toast } from 'react-elegant-toasts';

export function LocalizedToaster() {
  return (
    <Toaster
      labels={{
        region: 'Benachrichtigungen',
        close: 'Benachrichtigung schließen',
        warningPrefix: 'Warnung:',
        errorPrefix: 'Fehler:',
      }}
    />
  );
}
// #endregion

// #region accessibility-hotkey
export function ShortcutToaster() {
  return <Toaster hotkey={['altKey', 'shiftKey', 'KeyN']} />;
}
// #endregion

// #region accessibility-persistent-action
export function notifyDraftDeleted(restoreDraft: () => void) {
  toast('Draft deleted', {
    description: 'Use Undo to restore it.',
    duration: Infinity,
    action: { label: 'Undo', onClick: restoreDraft },
  });
}
// #endregion

// #region accessibility-custom
import { useId } from 'react';

const UPDATE_ID = 'app-update';

function UpdateToast() {
  const titleId = useId();
  return (
    <div className="update-toast" role="group" aria-labelledby={titleId}>
      <p id={titleId}>A new version is available.</p>{' '}
      <p>Reload the page to switch to it. Your saved work is kept.</p>{' '}
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>{' '}
      <button type="button" onClick={() => toast.dismiss(UPDATE_ID)}>
        Later
      </button>
    </div>
  );
}

export function showUpdateToast() {
  toast.custom(<UpdateToast />, { id: UPDATE_ID, duration: Infinity });
}
// #endregion
