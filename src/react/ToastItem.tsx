import { Fragment, memo, useEffect, useRef, type MouseEvent } from 'react';
import { dismiss, entered, exited } from '../store/store';
import type { ToastView } from '../store/types';
import { warnInaccessiblePersistent } from '../store/warnings';
import { CLOSE_ICON, typeIcon } from './icons';
import { useFocusWithinPause } from './useFocusWithinPause';

// The close button's name until `labels` arrives (§6.5, §17.2).
const CLOSE_LABEL = 'Close notification';
// The lifecycle fallback (§9 rule 3) until motion arrives (P-18): with no animation to wait for,
// an enter or exit completes on the next task.
const LIFECYCLE_FALLBACK_MS = 0;

interface ToastItemProps {
  readonly view: ToastView;
  /** Whether the close button shows, already resolved against the Toaster default. */
  readonly closeButton: boolean;
}

// One rendered toast (§12, §17.2, §21). Memoised on its view, which the store keeps while nothing
// render-visible changes, and on its resolved close button, so a change to one toast, or to a
// Toaster default it does not use, re-renders no other toast (§32, D-16). The content is keyed by
// `revision`: a replacement re-keys the content without remounting the toast or its controls (§7,
// §14). Clicking the toast body never dismisses it (D-17). An exiting toast's controls do nothing
// (§9 rule 4).
export const ToastItem = memo(function ToastItem({ view, closeButton }: ToastItemProps) {
  const { id, phase, custom, persistent, options } = view;
  const { action } = options;
  const ref = useRef<HTMLLIElement>(null);
  useFocusWithinPause(ref, id);

  // Reports the end of an enter or exit. The store ignores a report that no longer matches the
  // toast's phase, so a replacement, revival or detach in between completes nothing stale.
  useEffect(() => {
    if (phase === 'visible') return;
    const complete = phase === 'entering' ? entered : exited;
    const timeout = setTimeout(function lifecycleFallback() {
      complete(id);
    }, LIFECYCLE_FALLBACK_MS);
    return () => clearTimeout(timeout);
  }, [id, phase]);

  // A persistent normal toast that, as rendered, cannot be dismissed with a keyboard (§17.2).
  // Custom content may bring its own controls (§17.3).
  useEffect(() => {
    if (!custom && persistent && !closeButton && !action) warnInaccessiblePersistent(options);
  }, [custom, persistent, closeButton, action, options]);

  const onClose = () => {
    if (phase !== 'exiting') dismiss(id, 'close-button');
  };
  // The action's handler runs first and may veto the dismissal; if it throws, nothing is dismissed.
  const onAction = (event: MouseEvent<HTMLButtonElement>) => {
    if (phase === 'exiting' || !action) return;
    action.onClick(event);
    if (!event.defaultPrevented) dismiss(id, 'action');
  };

  const className = `ret-toast ret-toast--${view.type}${
    options.className ? ` ${options.className}` : ''
  }`;
  // An explicit icon replaces the type's, and `null` removes it. Either way it is decorative.
  const icon = custom ? undefined : options.icon !== undefined ? options.icon : typeIcon(view.type);
  const close = closeButton && (
    <button type="button" className="ret-toast__close" aria-label={CLOSE_LABEL} onClick={onClose}>
      {CLOSE_ICON}
    </button>
  );

  // Custom toasts are chrome-less (§6.4): their content, and the close button only when asked for.
  if (custom) {
    return (
      <li ref={ref} className={className} data-phase={phase} data-position={view.position}>
        <Fragment key={view.revision}>{view.content}</Fragment>
        {close}
      </li>
    );
  }
  return (
    <li ref={ref} className={className} data-phase={phase} data-position={view.position}>
      {icon != null && (
        <span className="ret-toast__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div key={view.revision} className="ret-toast__content">
        <div className="ret-toast__title">{view.content}</div>
        {view.description != null && (
          <div className="ret-toast__description">{view.description}</div>
        )}
      </div>
      {action && (
        <button type="button" className="ret-toast__action" onClick={onAction}>
          {action.label}
        </button>
      )}
      {close}
    </li>
  );
});
