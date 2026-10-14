import { useEffect, type RefObject } from 'react';

export const HEADER_OFFSET = '--d-header-offset';

/**
 * Keeps `--d-header-offset` on the root element equal to the header's height (P-25 S7). The
 * page's scroll padding and the sticky code panel read it, so a link target or a focused control
 * is never left under the sticky header, whatever the header's wrapping, text size or zoom.
 * Without `ResizeObserver` the stylesheet's fallback applies.
 */
export function useHeaderOffset(header: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = header.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const update = () => root.style.setProperty(HEADER_OFFSET, `${element.offsetHeight}px`);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => {
      observer.disconnect();
      root.style.removeProperty(HEADER_OFFSET);
    };
  }, [header]);
}
