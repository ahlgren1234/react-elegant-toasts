import { useId } from 'react';
import { toast } from 'react-elegant-toasts';
import './invite-toast.css';

// A custom toast renders your own component. The library still positions, queues, times, animates
// and announces it, and keeps focus in the toast region when a focused toast closes. Everything
// inside is yours to make accessible: roles, names, keyboard use, focus styles and contrast.

// A fixed ID, so the toast's own buttons can dismiss exactly this toast. Showing it again
// replaces it instead of adding a second one.
const INVITE_ID = 'workspace-invite';

interface InviteToastProps {
  /** Whether the toast brings its own Not now button. */
  dismissible: boolean;
}

function InviteToast({ dismissible }: InviteToastProps) {
  const titleId = useId();

  const join = () => {
    toast.dismiss(INVITE_ID);
    toast.success('You joined Design');
  };

  // The library announces the toast's text content, which ignores layout, so the {' '} keep the
  // title, message and button labels apart. The grid and flex layouts do not show them. The group
  // names the buttons' context. The icon is decorative: hidden, and with no text of its own.
  return (
    <div className="invite-toast__body" role="group" aria-labelledby={titleId}>
      <span className="invite-toast__icon" aria-hidden="true">
        <svg
          viewBox="0 0 20 20"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          <circle cx="8" cy="7" r="3" />
          <path d="M2.5 16.5c.8-2.9 3-4.5 5.5-4.5s4.7 1.6 5.5 4.5" />
          <path d="M15.5 6.5v5M13 9h5" />
        </svg>
      </span>
      <p id={titleId} className="invite-toast__title">
        Maya Chen invited you to Design
      </p>{' '}
      <p className="invite-toast__message">Join to see and comment on its files.</p>{' '}
      <div className="invite-toast__actions">
        <button
          type="button"
          className="invite-toast__button invite-toast__button--primary"
          onClick={join}
        >
          Join
        </button>{' '}
        {dismissible && (
          <button
            type="button"
            className="invite-toast__button"
            onClick={() => toast.dismiss(INVITE_ID)}
          >
            Not now
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Shows the invitation until it is answered. A persistent custom toast needs a keyboard-accessible
 * way to dismiss it: by default its own Not now button. With `closeButton: true` the library adds
 * its close button instead, in the toast's inline-end top corner, named by the Toaster's
 * `labels.close` ("Close notification" by default).
 */
export function showInvite({ closeButton = false } = {}) {
  return toast.custom(<InviteToast dismissible={!closeButton} />, {
    id: INVITE_ID,
    duration: Infinity,
    closeButton,
    className: closeButton ? 'invite-toast invite-toast--close' : 'invite-toast',
  });
}
