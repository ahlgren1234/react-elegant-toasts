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
