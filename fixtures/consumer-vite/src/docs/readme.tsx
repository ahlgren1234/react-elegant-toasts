// The TypeScript examples in README.md (P-26 S4), except the Next.js ones, which live in
// readme-next/ because each is its own module there. Each named region is copied verbatim into the
// README, and scripts/check-docs.js fails when the two differ or a region goes unused.
// validate-package.js type-checks this file against the packed package in F1 to F4. Nothing
// imports it, so the fixture's Vite build never bundles it and its calls never run.

// Stand-ins for application code the examples call. They are not shown in the README.
declare function restoreMessage(): void;
declare function saveProject(): Promise<{ name: string }>;

// #region readme-quick-start
import 'react-elegant-toasts/styles.css';
import { Toaster, toast } from 'react-elegant-toasts';

export function App() {
  return (
    <>
      <button type="button" onClick={() => toast.success('Changes saved')}>
        Save
      </button>
      <Toaster />
    </>
  );
}
// #endregion

// #region readme-types
toast('Draft created');
toast.success('Profile updated');
toast.error('Could not upload the file');
toast.warning('Your session expires in 5 minutes');
toast.info('A new version is available');
toast.loading('Uploading report.pdf');
// #endregion

// #region readme-options
toast.success('Message archived', {
  description: 'You can find it in the Archive folder.',
  duration: 8000,
  position: 'bottom-center',
  action: { label: 'Undo', onClick: () => restoreMessage() },
});
// #endregion

// #region readme-update-dismiss
toast.loading('Uploading report.pdf', { id: 'upload' });

// Later: the same id replaces that toast. Options are not merged with the earlier call.
toast.success('Report uploaded', { id: 'upload' });

// Dismiss one toast by its id, or every toast.
toast.dismiss('upload');
toast.dismiss();

// A creation call returns undefined when it is rejected, so check the id before using it.
const id = toast('Link copied');
if (id) toast.dismiss(id);
// #endregion

// #region readme-promise
toast.promise(saveProject(), {
  loading: 'Saving project…',
  success: project => `Saved ${project.name}`,
  error: error => (error instanceof Error ? error.message : 'Could not save the project'),
});
// #endregion

// #region readme-callbacks
toast('Export started', {
  onAutoClose: snapshot => console.log(`${snapshot.id} timed out`),
  onDismiss: (snapshot, reason) => console.log(`${snapshot.id} closed: ${reason}`),
});
// #endregion

// #region readme-custom
const INVITE_ID = 'team-invite';

toast.custom(
  <div className="invite-toast">
    <p>Sam invited you to the Design team.</p>{' '}
    <button type="button" onClick={() => toast.dismiss(INVITE_ID)}>
      Dismiss
    </button>
  </div>,
  { id: INVITE_ID, duration: Infinity }
);
// #endregion

// #region readme-toaster
export function ConfiguredToaster() {
  return (
    <Toaster
      position="bottom-right"
      maxVisible={3}
      duration={6000}
      progress
      theme="dark"
      className="app-toaster"
    />
  );
}
// #endregion
