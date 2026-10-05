// Announcements (§17.1). The active Toaster renders two persistent, visually hidden live regions,
// polite and assertive, from its first render, so they exist before anything is announced. Each
// toast revision is announced once, in its own transient node, appended imperatively and removed
// after a retention period: no React state, so an announcement re-renders nothing. The store
// decides which revisions are announced (`claimAnnouncement`); this module only writes them.
import { createContext, useContext, useEffect, type CSSProperties } from 'react';
import { claimAnnouncement } from '../store/store';
import type { ToastView } from '../store/types';
import type { ToastType } from '../types';

export type Politeness = 'polite' | 'assertive';

// Hidden visually but not from assistive technology, whether or not the stylesheet is loaded.
// Inline for now (P-16); P-17 may move it into the stylesheet.
export const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  border: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

/** Only errors interrupt (§17.1). */
export const politenessOf = (type: ToastType): Politeness =>
  type === 'error' ? 'assertive' : 'polite';

/**
 * How long an announcement's node stays in its live region (§17.1): long enough for assistive
 * technology to observe the addition, then gone, so the region does not keep a second copy of the
 * toast's text. Internal, not API. The value follows established practice (react-aria's live
 * announcer keeps messages for 7000 ms) rather than a normative requirement; P-22/P-29 verify it
 * with real screen readers.
 */
export const ANNOUNCEMENT_RETENTION_MS = 7000;

export interface Announcer {
  /**
   * Announces text in a new node of the live region of the Toaster rendering `item`, and removes
   * that node, and only it, after `ANNOUNCEMENT_RETENTION_MS`. Every announcement has its own node,
   * so the same text announced twice is two additions, and announcements close together coexist.
   */
  announce(item: HTMLElement, politeness: Politeness, text: string): void;
  /** Removes every pending node and cancels its timer, when the Toaster unmounts. */
  dispose(): void;
}

/** A node waiting for its removal, with the window whose timer will remove it. */
interface Pending {
  readonly node: HTMLElement;
  readonly view: Window;
  readonly timer: number;
}

/**
 * One Toaster's announcer. It writes into the regions of the Toaster that renders the toast, found
 * by DOM containment from the toast's own element: they are direct children of its section. A
 * node's lifetime is its own: it does not depend on the toast, which may leave or be replaced
 * while its announcement is still pending.
 */
export function createAnnouncer(): Announcer {
  const pending = new Set<Pending>();
  return {
    announce(item, politeness, text) {
      const region = item
        .closest('.ret-toaster')
        ?.querySelector<HTMLElement>(`:scope > [aria-live="${politeness}"]`);
      // The region's own document and window, so the node and its timer belong to the realm the
      // Toaster renders in. Without a window the node could not be removed, so none is added.
      const view = region?.ownerDocument.defaultView;
      if (!region || !view) return;
      const node = region.ownerDocument.createElement('div');
      node.textContent = text;
      region.append(node);
      const entry: Pending = {
        node,
        view,
        timer: view.setTimeout(() => {
          node.remove();
          pending.delete(entry);
        }, ANNOUNCEMENT_RETENTION_MS),
      };
      pending.add(entry);
    },
    dispose() {
      // No disposed state: StrictMode replays this cleanup on mount, and the announcer must keep
      // working afterwards.
      for (const { node, view, timer } of pending) {
        view.clearTimeout(timer);
        node.remove();
      }
      pending.clear();
    },
  };
}

/** The active Toaster's announcer; null outside one. */
export const AnnouncerContext = createContext<Announcer | null>(null);

const collapse = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim();

/**
 * A rendered toast's announcement text (§17.1): its text content, content plus description, from
 * the DOM. A normal toast's icon and controls are outside its content. A custom toast's text is
 * everything it renders except the library close button; its quality is the consumer's (§17.3).
 */
export function announcementText(item: HTMLElement, custom: boolean): string {
  const parts = custom
    ? [...item.childNodes].filter(
        node => !(node.nodeType === 1 && (node as Element).matches('.ret-toast__close'))
      )
    : [...item.querySelectorAll(':scope > .ret-toast__content > *')];
  return parts
    .map(node => collapse(node.textContent))
    .filter(Boolean)
    .join(' ');
}

/**
 * Announces each revision of a rendered toast once (§17.1). After the commit, so the DOM shows the
 * revision: the store's claim comes first, and only a successful claim reads and writes anything.
 * Re-renders, StrictMode replay, a relocation arriving and another Toaster rendering the same
 * revision all find it claimed. A revision with no text is claimed and not announced.
 */
export function useAnnouncement(
  ref: { readonly current: HTMLElement | null },
  view: Pick<ToastView, 'id' | 'revision' | 'type' | 'custom'>,
  prefix: string | undefined
): void {
  const announcer = useContext(AnnouncerContext);
  const { id, revision, type, custom } = view;
  useEffect(() => {
    const item = ref.current;
    if (!announcer || !item || !claimAnnouncement(id, revision)) return;
    const text = announcementText(item, custom);
    if (text) announcer.announce(item, politenessOf(type), prefix ? `${prefix} ${text}` : text);
  }, [announcer, ref, id, revision, type, custom, prefix]);
}
