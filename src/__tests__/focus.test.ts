// Where focus is (§10, §18): the active element of a node's own tree, and the focused element
// itself through open shadow roots.
import { afterEach, describe, expect, it } from 'vitest';
import { activeElementOf, deepActiveElement } from '../react/focus';

/** A host in the document with a shadow root holding one button. */
function shadowButton(mode: ShadowRootMode, parent: ParentNode = document.body) {
  const host = document.createElement('div');
  parent.append(host);
  const shadow = host.attachShadow({ mode });
  const button = document.createElement('button');
  shadow.append(button);
  return { host, shadow, button };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('activeElementOf', () => {
  it("is the document's active element for a node in the document", () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    expect(activeElementOf(document.body)).toBe(button);
  });

  it("is the shadow root's active element for a node inside it, not the host", () => {
    const { host, shadow, button } = shadowButton('open');
    const sibling = document.createElement('span');
    shadow.append(sibling);
    button.focus();
    expect(document.activeElement).toBe(host);
    expect(activeElementOf(sibling)).toBe(button);
    expect(activeElementOf(document.body)).toBe(host);
  });

  it('is null in a shadow root that holds no focus', () => {
    const { shadow } = shadowButton('open');
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    expect(activeElementOf(shadow)).toBeNull();
  });

  it('is null for a node in no document or shadow root', () => {
    expect(activeElementOf(document.createElement('div'))).toBeNull();
  });
});

describe('deepActiveElement', () => {
  it("is the document's active element when no shadow root holds focus", () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    expect(deepActiveElement(document)).toBe(button);
    button.blur();
    expect(deepActiveElement(document)).toBe(document.body);
  });

  it('follows focus through nested open shadow roots', () => {
    const outer = shadowButton('open');
    const inner = shadowButton('open', outer.shadow);
    inner.button.focus();
    expect(document.activeElement).toBe(outer.host);
    expect(deepActiveElement(document)).toBe(inner.button);
  });

  it('stops at the host of a closed shadow root, which cannot be entered', () => {
    const { host, button } = shadowButton('closed');
    button.focus();
    expect(deepActiveElement(document)).toBe(host);
  });
});
