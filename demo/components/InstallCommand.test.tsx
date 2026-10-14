import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { INSTALL_COMMAND } from '../utils/site';
import { FEEDBACK_MS } from '../utils/useCopy';
import { InstallCommand } from './InstallCommand';

// The install command (P-25 S7). It shares the code panels' copy logic, so these tests check what
// is its own: the command, the button's name and the one status.

const ROOT = resolve(__dirname, '../..');
const PACKAGE = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  name: string;
  peerDependencies: Record<string, string>;
};
const HERO = readFileSync(resolve(__dirname, 'Hero.tsx'), 'utf8');

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

const renderInstall = () => {
  const { container } = render(<InstallCommand />);
  return {
    container,
    code: () => container.querySelector('code')!,
    status: () => screen.getByRole('status'),
    button: () => screen.getByRole('button'),
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
  vi.useRealTimers();
});

describe('the install command', () => {
  it('installs this package and nothing else: React and React DOM are peers', () => {
    expect(INSTALL_COMMAND).toBe(`npm install ${PACKAGE.name}`);
    expect(Object.keys(PACKAGE.peerDependencies).sort()).toEqual(['react', 'react-dom']);
  });

  it('is what the hero shows, through this component only', () => {
    expect(HERO).toContain('<InstallCommand />');
    expect(HERO).not.toContain('npm install');
    const { code } = renderInstall();
    expect(code().textContent).toBe(INSTALL_COMMAND);
  });

  it('can wrap only at its spaces, as whole words', () => {
    const { code } = renderInstall();
    const words = [...code().querySelectorAll('.d-install__word')].map(word => word.textContent);
    expect(words).toEqual(['npm', 'install', PACKAGE.name]);
  });

  it('keeps the prompt out of the accessibility tree and out of the copied text', () => {
    const { container, code } = renderInstall();
    const prompt = container.querySelector('.d-install__prompt')!;
    expect(prompt.textContent).toBe('$');
    expect(prompt.getAttribute('aria-hidden')).toBe('true');
    expect(code().contains(prompt)).toBe(false);
  });

  it('has a button named for what it copies, and one status that is empty at rest', () => {
    const { container, status, button } = renderInstall();
    expect(button().getAttribute('type')).toBe('button');
    expect(screen.getByRole('button', { name: 'Copy the install command' })).toBe(button());
    expect(container.querySelectorAll('[role="status"], [aria-live], [role="alert"]')).toHaveLength(
      1
    );
    expect(status().textContent).toBe('');
    expect(status().className).toBe('d-visually-hidden');
  });

  it('copies exactly the command, announces it once, then returns to rest', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    vi.useFakeTimers();
    const { status, button } = renderInstall();

    await clickCopy(button());

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(INSTALL_COMMAND);
    expect(status().textContent).toBe('Install command copied to the clipboard.');
    // The success is announced by the status only; it is not shown as a second message.
    expect(status().className).toBe('d-visually-hidden');
    expect(screen.getByRole('button', { name: 'Copied the install command' })).toBe(button());

    act(() => {
      vi.advanceTimersByTime(FEEDBACK_MS.copied);
    });
    expect(status().textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Copy the install command' })).toBe(button());
  });

  it.each([
    [
      'rejects the write',
      () => setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) }),
    ],
    ['is unavailable', () => setClipboard(undefined)],
  ])('selects the command and shows what to do when the clipboard %s', async (_, arrange) => {
    arrange();
    vi.useFakeTimers();
    const { code, status, button } = renderInstall();

    await clickCopy(button());

    expect(status().textContent).toMatch(/^Could not copy\. The command is selected/);
    expect(status().className).toBe('d-install__status');
    expect(screen.getByRole('button', { name: 'Copy the install command' })).toBe(button());
    const selection = window.getSelection()!;
    expect(selection.rangeCount).toBe(1);
    expect(selection.getRangeAt(0).toString()).toBe(INSTALL_COMMAND);
    expect(selection.getRangeAt(0).toString()).toBe(code().textContent);

    act(() => {
      vi.advanceTimersByTime(FEEDBACK_MS.failed);
    });
    expect(status().textContent).toBe('');
  });

  it('has no axe violations', async () => {
    // In a landmark, as on the page, where it sits in the hero inside <main>.
    render(
      <main>
        <InstallCommand />
      </main>
    );
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
