import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEADER_OFFSET, useHeaderOffset } from './useHeaderOffset';

/** A `ResizeObserver` whose callbacks the test runs, as a resize would. */
function stubResizeObserver() {
  const observers: { callback: () => void; observed: Element[]; disconnected: boolean }[] = [];
  class FakeResizeObserver {
    entry: (typeof observers)[number];
    constructor(callback: () => void) {
      this.entry = { callback, observed: [], disconnected: false };
      observers.push(this.entry);
    }
    observe(element: Element) {
      this.entry.observed.push(element);
    }
    disconnect() {
      this.entry.disconnected = true;
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  return observers;
}

function Header() {
  const ref = useRef<HTMLElement>(null);
  useHeaderOffset(ref);
  return <header ref={ref} />;
}

/** jsdom has no layout, so the header's height is set by hand. */
const setHeight = (height: number) =>
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height);

const offset = () => document.documentElement.style.getPropertyValue(HEADER_OFFSET);

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty(HEADER_OFFSET);
});

describe('useHeaderOffset', () => {
  it('publishes the header’s height, follows its resizes and cleans up', () => {
    const observers = stubResizeObserver();
    setHeight(97);
    const { container, unmount } = render(<Header />);
    const header = container.querySelector('header')!;
    expect(offset()).toBe('97px');
    expect(observers).toHaveLength(1);
    expect(observers[0]!.observed).toEqual([header]);

    // The header wraps to another row, at a narrower width or a larger text size.
    setHeight(141);
    act(() => observers[0]!.callback());
    expect(offset()).toBe('141px');

    unmount();
    expect(observers[0]!.disconnected).toBe(true);
    expect(offset()).toBe('');
  });

  it('leaves the stylesheet’s fallback in place without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    setHeight(97);
    render(<Header />);
    expect(offset()).toBe('');
  });
});
