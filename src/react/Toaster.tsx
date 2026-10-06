import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import { POSITIONS } from '../store/options';
import {
  attach,
  configure,
  getServerSnapshot,
  getSnapshot,
  setStackPause,
  subscribe,
} from '../store/store';
import type { ToasterToken, ToastView } from '../store/types';
import type { ToastId, ToasterProps, ToastPosition, ToastTheme } from '../types';
import { AnnouncerContext, createAnnouncer, LIVE_REGION, VISUALLY_HIDDEN } from './announcer';
import { resolveCloseButton, resolveLabels, resolveProgress } from './defaults';
import { ToastItem } from './ToastItem';
import { useEnvironmentPause } from './useEnvironmentPause';
import { keyShortcutsOf, useHotkey } from './useHotkey';
import { useStackReposition } from './useStackReposition';

const createToken = (): ToasterToken => ({});

const THEMES: readonly unknown[] = ['light', 'dark', 'system'] satisfies readonly ToastTheme[];

interface PositionListProps {
  readonly position: ToastPosition;
  readonly views: readonly ToastView[];
  /** The Toaster's `closeButton` prop, as given. */
  readonly closeButton: boolean | undefined;
  /** The Toaster's `progress` prop, as given. */
  readonly progress: boolean | undefined;
  /** The close button's resolved name. */
  readonly closeLabel: string;
  /** The resolved prefixes of warning and error announcements. */
  readonly warningPrefix: string;
  readonly errorPrefix: string;
}

// One position's toasts (§12). The store lists them oldest first. The newest toast is nearest the
// anchored edge, and DOM order is visual order: top positions reverse the list, bottom positions
// keep it. Memoised on the store's list, which keeps its identity while it is unchanged. Each
// item gets its close button already resolved, and its name only when it shows, and only its own
// type's announcement prefix, so a changed Toaster default or label re-renders only the items it
// changes.
const PositionList = memo(function PositionList({
  position,
  views,
  closeButton,
  progress,
  closeLabel,
  warningPrefix,
  errorPrefix,
}: PositionListProps) {
  const ordered = useMemo(
    () => (position.startsWith('top-') ? [...views].reverse() : views),
    [position, views]
  );
  const ids = useMemo(() => ordered.map(view => view.id), [ordered]);
  if (ordered.length === 0) return null;
  return (
    <StackList position={position} ids={ids}>
      {ordered.map(view => {
        const shown = resolveCloseButton(view, closeButton);
        return (
          <ToastItem
            key={view.id}
            view={view}
            closeButton={shown}
            closeLabel={shown ? closeLabel : undefined}
            // Only a finite toast has a countdown to show (P-20), so a persistent or loading toast
            // never re-renders for a Toaster `progress` change.
            progress={!view.persistent && resolveProgress(view, progress)}
            announcePrefix={
              view.type === 'warning'
                ? warningPrefix
                : view.type === 'error'
                  ? errorPrefix
                  : undefined
            }
          />
        );
      })}
    </StackList>
  );
});

interface StackListProps {
  readonly position: ToastPosition;
  /** The IDs of its toasts, in DOM order. */
  readonly ids: readonly ToastId[];
  readonly children: ReactNode;
}

// A position's `<ol>`, which exists only while the position has toasts. A pointer over it pauses
// the whole stack (§10). The listeners are native, so hover follows the DOM, not React portals.
// The list owns the reason: when it unmounts, for example as its last toast leaves under the
// pointer, the hover goes with it, since no `pointerleave` will ever arrive. The list also moves
// its surviving toasts smoothly when its toasts change (§22).
function StackList({ position, ids, children }: StackListProps) {
  const ref = useRef<HTMLOListElement>(null);
  useStackReposition(ref, position, ids);
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const onPointerEnter = () => setStackPause(position, true);
    const onPointerLeave = () => setStackPause(position, false);
    list.addEventListener('pointerenter', onPointerEnter);
    list.addEventListener('pointerleave', onPointerLeave);
    return () => {
      list.removeEventListener('pointerenter', onPointerEnter);
      list.removeEventListener('pointerleave', onPointerLeave);
      setStackPause(position, false);
    };
  }, [position]);
  return (
    <ol ref={ref} className="ret-toaster__list" data-position={position}>
      {children}
    </ol>
  );
}

// Attaches this Toaster to the store, which decides which mounted Toaster is active (§8.5), and
// renders the store's snapshot while it is the active one. Before any Toaster is active, including
// on the server and during hydration, it renders the empty region (§23). While another Toaster is
// active it renders nothing.
/**
 * Shows the toasts. Render one `<Toaster />`, near the root of the app. Toasts created before it
 * mounts appear once it does. If more than one is mounted, only the first shows toasts; another
 * takes over when it unmounts.
 */
export const Toaster: (props: ToasterProps) => ReactElement | null = ({
  maxVisible,
  position,
  duration,
  closeButton,
  progress,
  theme,
  hotkey,
  labels,
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
  useEnvironmentPause(owner);
  const section = useRef<HTMLElement>(null);
  const hotkeySpec = useHotkey(owner, section, hotkey);
  // Writes into this Toaster's live regions. Its pending announcements go with it.
  const [announcer] = useState(createAnnouncer);
  useEffect(() => () => announcer.dispose(), [announcer]);

  if (!owner && snapshot.active !== null) return null;
  // Resolved to strings on every render, so a new `labels` object with the same text changes no
  // prop below the region.
  const { region, close, warningPrefix, errorPrefix } = resolveLabels(labels);
  // The region takes focus from script only, as the last place focus restoration can go (§18). It
  // advertises the hotkey in effect when ARIA can name it (§17.2); its role is the named section's.
  return (
    <section
      ref={section}
      className={className ? `ret-toaster ${className}` : 'ret-toaster'}
      aria-label={region}
      aria-keyshortcuts={hotkeySpec ? keyShortcutsOf(hotkeySpec) : undefined}
      data-theme={THEMES.includes(theme) ? theme : 'system'}
      tabIndex={-1}
    >
      {/* Persistent and empty until something is announced (§17.1), on the server too (§23). */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className={LIVE_REGION}
        style={VISUALLY_HIDDEN}
      />
      <div
        aria-live="assertive"
        aria-atomic="false"
        className={LIVE_REGION}
        style={VISUALLY_HIDDEN}
      />
      {owner && (
        <AnnouncerContext.Provider value={announcer}>
          {POSITIONS.map(position => (
            <PositionList
              key={position}
              position={position}
              views={snapshot.byPosition[position]}
              closeButton={closeButton}
              progress={progress}
              closeLabel={close}
              warningPrefix={warningPrefix}
              errorPrefix={errorPrefix}
            />
          ))}
        </AnnouncerContext.Provider>
      )}
    </section>
  );
};
