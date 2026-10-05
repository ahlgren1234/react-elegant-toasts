// Where focus is, for the focus-within pause (§10), the hotkey and focus restoration (§18).

/**
 * The active element of the tree `node` is in: its document, or the shadow root it renders into,
 * where the document's active element is only the shadow host.
 */
export function activeElementOf(node: Node): Element | null {
  const root = node.getRootNode();
  return 'activeElement' in root ? (root as Document | ShadowRoot).activeElement : null;
}

/**
 * The focused element itself, followed down through open shadow roots from the document's active
 * element. A closed shadow root cannot be entered, so focus inside one is reported as its host.
 */
export function deepActiveElement(doc: Document): Element | null {
  let active = doc.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

/** An element that may take focus. */
type Focusable = Element & Partial<Pick<HTMLOrSVGElement, 'focus'>>;

/** Focuses `target`, true only when its own tree reports it focused afterwards. */
function tryFocus(target: Focusable): boolean {
  target.focus?.();
  return activeElementOf(target) === target;
}

/**
 * The region's toasts in DOM order, which is visual order (§12), across every position, exiting
 * ones included: `:scope > ol > li`. Only the region's own lists and their items count, because
 * custom content may contain list items of its own. Walked rather than queried, since jsdom does
 * not match `:scope` inside a shadow root.
 */
export function* toastItems(region: Element): Generator<HTMLElement> {
  for (const list of region.children) {
    if (list.tagName !== 'OL') continue;
    for (const item of list.children) {
      if (item.tagName === 'LI') yield item as HTMLElement;
    }
  }
}

/** A toast that focus may move to: rendered and not exiting. */
export const isEligibleToast = (item: Element): boolean =>
  item.getAttribute('data-phase') !== 'exiting';

type LibraryControl = 'close' | 'action';

// The library's own close and action buttons, registered by their refs. Markup cannot join it, so
// custom content can never pass for a library control, whatever its classes or names.
const libraryControls = new WeakMap<Element, LibraryControl>();

export const registerClose = (element: Element | null): void => {
  if (element) libraryControls.set(element, 'close');
};

export const registerAction = (element: Element | null): void => {
  if (element) libraryControls.set(element, 'action');
};

/** The toast's own library control of that kind, which is always one of its direct children. */
function controlOf(item: Element, kind: LibraryControl): Element | null {
  for (const child of item.children) {
    if (libraryControls.get(child) === kind) return child;
  }
  return null;
}

/**
 * Moves focus out of a toast that has started to exit while it holds focus (§17.4, §18), before it
 * becomes inert. From its library close or action, to the same control of the next toast; from
 * the toast itself, to the next toast. Otherwise, and always from custom content, which has no
 * equivalent, to the previous toast; otherwise to the region. Next and previous are the adjacent
 * toasts that are not exiting, in DOM order across every position, read from `data-phase`, which
 * the whole commit has already written, while `inert` is set later by each toast. Only those two
 * neighbours are tried, each focus is verified, and the record of where focus was before the
 * hotkey is not used: Escape is the way out of the region. Does nothing unless focus is inside.
 */
export function restoreFocusFrom(item: HTMLElement): void {
  const active = activeElementOf(item);
  const region = item.parentElement?.parentElement;
  if (!active || !item.contains(active) || !region) return;
  const items = [...toastItems(region)];
  const index = items.indexOf(item);
  if (index === -1) return;
  const next = items.slice(index + 1).find(isEligibleToast);
  const previous = items.slice(0, index).reverse().find(isEligibleToast);

  const kind =
    active === item
      ? 'root'
      : active.parentElement === item
        ? libraryControls.get(active)
        : undefined;
  if (next && kind) {
    const target = kind === 'root' ? next : controlOf(next, kind);
    if (target && tryFocus(target)) return;
  }
  if (previous && tryFocus(previous)) return;
  tryFocus(region);
}
