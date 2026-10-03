import { memo, useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import { POSITIONS } from '../store/options';
import { attach, configure, getServerSnapshot, getSnapshot, subscribe } from '../store/store';
import type { ToasterToken, ToastView } from '../store/types';
import type { ToasterProps, ToastPosition, ToastTheme } from '../types';
import { resolveCloseButton } from './defaults';
import { ToastItem } from './ToastItem';

const createToken = (): ToasterToken => ({});

const THEMES: readonly unknown[] = ['light', 'dark', 'system'] satisfies readonly ToastTheme[];
// The region's name until `labels` arrives (§6.5, §17.2).
const REGION_LABEL = 'Notifications';

interface PositionListProps {
  readonly position: ToastPosition;
  readonly views: readonly ToastView[];
  /** The Toaster's `closeButton` prop, as given. */
  readonly closeButton: boolean | undefined;
}

// One position's toasts (§12). The store lists them oldest first. The newest toast is nearest the
// anchored edge, and DOM order is visual order: top positions reverse the list, bottom positions
// keep it. Memoised on the store's list, which keeps its identity while it is unchanged. Each
// item gets its close button already resolved, so a changed Toaster default re-renders only the
// items it changes.
const PositionList = memo(function PositionList({
  position,
  views,
  closeButton,
}: PositionListProps) {
  const ordered = useMemo(
    () => (position.startsWith('top-') ? [...views].reverse() : views),
    [position, views]
  );
  if (ordered.length === 0) return null;
  return (
    <ol className="ret-toaster__list" data-position={position}>
      {ordered.map(view => (
        <ToastItem key={view.id} view={view} closeButton={resolveCloseButton(view, closeButton)} />
      ))}
    </ol>
  );
});

// Attaches this Toaster to the store, which decides which mounted Toaster is active (§8.5), and
// renders the store's snapshot while it is the active one. Before any Toaster is active, including
// on the server and during hydration, it renders the empty region (§23). While another Toaster is
// active it renders nothing.
export const Toaster: (props: ToasterProps) => ReactElement | null = ({
  maxVisible,
  position,
  duration,
  closeButton,
  theme,
  className,
}: ToasterProps) => {
  const [token] = useState(createToken);
  // Every Toaster subscribes, so a waiting one sees when it takes over.
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Configured before attaching, so the first promotion already uses this Toaster's limit and
  // toasts created before it mounted get its defaults. The store validates the values. The attach
  // effect depends only on the token: changing a prop never detaches or re-queues.
  useEffect(() => {
    configure(token, { maxVisible, position, duration });
  }, [token, maxVisible, position, duration]);
  useEffect(() => attach(token), [token]);

  const owner = snapshot.active === token;
  if (!owner && snapshot.active !== null) return null;
  return (
    <section
      className={className ? `ret-toaster ${className}` : 'ret-toaster'}
      aria-label={REGION_LABEL}
      data-theme={THEMES.includes(theme) ? theme : 'system'}
    >
      {owner &&
        POSITIONS.map(position => (
          <PositionList
            key={position}
            position={position}
            views={snapshot.byPosition[position]}
            closeButton={closeButton}
          />
        ))}
    </section>
  );
};
