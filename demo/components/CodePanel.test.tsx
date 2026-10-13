import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, toInvocation, toToasterSettings } from '../utils/playground';
import { snippetText, snippetTokens } from '../utils/snippet';
import { CodePanel } from './CodePanel';

const config = { ...DEFAULT_CONFIG, action: true, duration: 'persistent' as const };
const tokens = snippetTokens(toInvocation(config), toToasterSettings(config, 'dark'));

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

const renderPanel = () => {
  render(<CodePanel tokens={tokens} fileName="App.tsx" />);
  return {
    code: () => document.querySelector('pre code')!,
    status: () => screen.getByRole('status'),
    button: () => screen.getByRole('button', { name: /^Cop/ }),
  };
};

/** Clicks Copy and lets the clipboard promise settle, inside act. */
async function clickCopy(button: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(button);
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
  });
}

afterEach(() => {
  setClipboard(undefined);
});

describe('CodePanel', () => {
  it('shows the generated code', () => {
    const { code } = renderPanel();
    expect(code().textContent).toBe(snippetText(tokens));
  });

  it('copies exactly the code it shows, and announces it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    vi.useFakeTimers();
    const { code, status, button } = renderPanel();

    await clickCopy(button());

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(snippetText(tokens));
    expect(writeText.mock.calls[0]?.[0]).toBe(code().textContent);
    expect(status().textContent).toBe('Code copied to the clipboard.');
    expect(button().textContent).toBe('Copied');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(status().textContent).toBe('');
    expect(button().textContent).toBe('Copy code');
  });

  it.each([
    [
      'rejects the write',
      () => setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) }),
    ],
    ['is unavailable', () => setClipboard(undefined)],
  ])('selects the code and explains what to do when the clipboard %s', async (_, arrange) => {
    arrange();
    const { code, status, button } = renderPanel();

    await clickCopy(button());

    expect(status().textContent).toMatch(/^Could not copy\. The code is selected/);
    expect(button().textContent).toBe('Copy code');
    const selection = window.getSelection()!;
    expect(selection.rangeCount).toBe(1);
    expect(selection.getRangeAt(0).toString()).toBe(code().textContent);
  });
});
