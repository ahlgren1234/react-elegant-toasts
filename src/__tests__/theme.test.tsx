// The theme attribute on the server and the client (§21, §23, AC-CSS-2, D-24). Themes are CSS-only,
// so the server HTML already carries the final `data-theme` and hydration changes nothing.
import { act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { Toaster } from '../index';
import type { ToastTheme } from '../types';

function renderOnServer(element: ReactElement): string {
  vi.stubGlobal('window', undefined);
  try {
    return renderToString(element);
  } finally {
    vi.unstubAllGlobals();
  }
}

describe('AC-CSS-2: theme hydration', () => {
  it.each<[string, ToastTheme | undefined, ToastTheme]>([
    ['light', 'light', 'light'],
    ['dark', 'dark', 'dark'],
    ['system', 'system', 'system'],
    ['the default', undefined, 'system'],
    ['an invalid value', 'sepia' as ToastTheme, 'system'],
  ])('hydrates %s without a mismatch', async (_name, theme, expected) => {
    // Watches the server render and the hydration alike.
    const error = vi.spyOn(console, 'error');
    onTestFinished(() => error.mockRestore());
    const html = renderOnServer(<Toaster theme={theme} />);
    expect(html).toContain(`data-theme="${expected}"`);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const root = await act(async () => {
      const hydrated = hydrateRoot(container, <Toaster theme={theme} />);
      await Promise.resolve();
      return hydrated;
    });
    expect(container.querySelector('section')?.getAttribute('data-theme')).toBe(expected);
    expect(container.innerHTML).toBe(html);
    expect(error.mock.calls).toEqual([]);
    act(() => root.unmount());
    container.remove();
  });
});
