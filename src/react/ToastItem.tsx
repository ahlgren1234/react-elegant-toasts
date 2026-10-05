import { Fragment, memo, useEffect, useRef, type MouseEvent } from 'react';
import { dismiss, entered, exited } from '../store/store';
import type { ToastView } from '../store/types';
import { warnInaccessiblePersistent } from '../store/warnings';
import { useAnnouncement } from './announcer';
import { registerAction, registerClose, restoreFocusFrom } from './focus';
import { CLOSE_ICON, typeIcon } from './icons';
import { fallbackDelayOf, libraryAnimationName } from './motion';
import { useFocusWithinPause } from './useFocusWithinPause';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

interface ToastItemProps {
  readonly view: ToastView;
  /** Whether the close button shows, already resolved against the Toaster default. */
  readonly closeButton: boolean;
  /** The close button's name, from the Toaster's labels, while the close button shows. */
  readonly closeLabel: string | undefined;
  /** The announcement prefix of a warning or error toast, from the Toaster's labels (§17.1). */
  readonly announcePrefix: string | undefined;
}

// One rendered toast (§12, §17.2, §21). Memoised on its view, which the store keeps while nothing
// render-visible changes, and on its resolved close button and its name, so a change to one toast,
// or to a Toaster default or label it does not use, re-renders no other toast (§32, D-16). The
// content is keyed by `revision`: a replacement re-keys the content without remounting the toast
// or its controls (§7, §14). Clicking the toast body never dismisses it (D-17). An exiting toast is
// inert, and its controls also do nothing where `inert` is not enforced (§9 rule 4).
export const ToastItem = memo(function ToastItem({
  view,
  closeButton,
  closeLabel,
  announcePrefix,
}: ToastItemProps) {
  const { id, phase, position, custom, persistent, options } = view;
  const { action } = options;
  const ref = useRef<HTMLLIElement>(null);
  useFocusWithinPause(ref, id);
  useAnnouncement(ref, view, announcePrefix);

  // An exiting toast is inert (§9 rule 4), and only an exiting one: revival removes it. Set here,
  // not as a prop: React 18 drops `inert={true}` and React 19 treats `""` as false, and a prop would
  // be applied before any layout effect. React never touches the attribute, because it is not
  // rendered.
  //
  // Focus restoration (§18) runs first, in the same effect, while the focused control can still be
  // found inside the toast: only on the change from entering or visible to exiting, never on a
  // mount, which also keeps a StrictMode replay from restoring again, and never in a cleanup, so
  // an unmount restores nothing. Keep that order, and `inert` set whatever restoration achieved.
  const committedPhase = useRef<ToastView['phase'] | null>(null);
  useIsomorphicLayoutEffect(() => {
    const previous = committedPhase.current;
    committedPhase.current = phase;
    const item = ref.current;
    if (!item) return;
    if (phase === 'exiting' && (previous === 'entering' || previous === 'visible')) {
      restoreFocusFrom(item);
    }
    item.toggleAttribute('inert', phase === 'exiting');
  }, [phase]);

  // Reports the end of an enter or exit (§9 rule 3): the toast root's own `animationend` for the
  // library animation of this phase and edge, or the fallback, whichever comes first. The listener
  // is native, since jsdom has no `AnimationEvent` for React to map. It ignores events bubbling
  // from descendants, other animations, a consumer's included, and any event once the committed
  // phase has moved on. The fallback follows the computed animation, or is immediate when no
  // library animation runs. The store ignores a report that no longer matches the toast's phase,
  // so a replacement, revival or detach in between completes nothing stale.
  useEffect(() => {
    if (phase === 'visible') return;
    const item = ref.current;
    const complete = phase === 'entering' ? entered : exited;
    const expected = libraryAnimationName(phase, position);
    const timeout = setTimeout(
      function lifecycleFallback() {
        complete(id);
      },
      item ? fallbackDelayOf(item, expected) : 0
    );
    if (!item) return () => clearTimeout(timeout);
    const onAnimationEnd = (event: Event) => {
      if (event.target !== item || item.getAttribute('data-phase') !== phase) return;
      if ((event as AnimationEvent).animationName !== expected) return;
      clearTimeout(timeout);
      item.removeEventListener('animationend', onAnimationEnd);
      complete(id);
    };
    item.addEventListener('animationend', onAnimationEnd);
    return () => {
      clearTimeout(timeout);
      item.removeEventListener('animationend', onAnimationEnd);
    };
  }, [id, phase, position]);

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
    <button
      ref={registerClose}
      type="button"
      className="ret-toast__close"
      aria-label={closeLabel}
      onClick={onClose}
    >
      {CLOSE_ICON}
    </button>
  );

  // Custom toasts are chrome-less (§6.4): their content, and the close button only when asked for.
  if (custom) {
    return (
      <li
        ref={ref}
        className={className}
        data-phase={phase}
        data-position={view.position}
        tabIndex={-1}
      >
        <Fragment key={view.revision}>{view.content}</Fragment>
        {close}
      </li>
    );
  }
  return (
    <li
      ref={ref}
      className={className}
      data-phase={phase}
      data-position={view.position}
      tabIndex={-1}
    >
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
        <button ref={registerAction} type="button" className="ret-toast__action" onClick={onAction}>
          {action.label}
        </button>
      )}
      {close}
    </li>
  );
});
