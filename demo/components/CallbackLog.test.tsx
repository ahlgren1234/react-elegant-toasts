import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { appendEntry, type CallbackEvent, type LogEntry } from '../utils/lifecycle';
import { CallbackLog } from './CallbackLog';

const UUID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
const at = new Date(2026, 9, 13, 14, 5, 7);

const entries = (...events: CallbackEvent[]): LogEntry[] =>
  events.reduce<LogEntry[]>((log, event) => appendEntry(log, event, at), []);

const dismissed: CallbackEvent = {
  callback: 'onDismiss',
  id: UUID,
  title: 'Draft saved',
  reason: 'close-button',
};
const autoClosed: CallbackEvent = { callback: 'onAutoClose', id: UUID, title: 'Draft saved' };

describe('CallbackLog', () => {
  it('shows an empty state, with Clear disabled', () => {
    render(<CallbackLog entries={[]} onClear={() => undefined} />);
    expect(screen.getByText('No callbacks yet.').textContent).toBe('No callbacks yet.');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Clear' }).disabled).toBe(true);
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('lists the entries newest first, as words with spaces between the parts', () => {
    render(<CallbackLog entries={entries(autoClosed, dismissed)} onClear={() => undefined} />);
    const items = within(screen.getByRole('list', { name: 'Callback log' })).getAllByRole(
      'listitem'
    );
    expect(items.map(item => item.textContent)).toEqual([
      '14:05:07 onDismiss close-button Removed after its close button. ID\u00a01b9d6bcd…',
      '14:05:07 onAutoClose The duration ran out; the toast starts to leave. ID\u00a01b9d6bcd…',
    ]);
  });

  it('isolates the shortened ID in <bdi>, with the full ID as its title', () => {
    // Regression: unisolated, the left-to-right ID's "…" moved to the wrong end in RTL pages.
    const { container } = render(
      <div dir="rtl">
        <CallbackLog entries={entries(dismissed)} onClear={() => undefined} />
      </div>
    );
    const ids = container.querySelectorAll('bdi');
    expect(ids).toHaveLength(1);
    expect(ids[0]?.textContent).toBe('1b9d6bcd…');
    expect(ids[0]?.getAttribute('title')).toBe(UUID);
    expect(ids[0]?.querySelector('*')).toBeNull();
  });

  it('is not a live region, so entries are not announced over the toasts', () => {
    const { container } = render(
      <CallbackLog entries={entries(dismissed)} onClear={() => undefined} />
    );
    expect(
      container.querySelector('[aria-live], [role="log"], [role="status"], [role="alert"]')
    ).toBeNull();
  });

  it('clears through its button', () => {
    const onClear = vi.fn();
    render(<CallbackLog entries={entries(dismissed)} onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
