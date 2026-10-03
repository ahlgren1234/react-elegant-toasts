// @vitest-environment node
// Server rendering of <Toaster /> from source (§8.3, §23). The packed-package smoke test is P-23.
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Toaster } from '../index';
import { getServerSnapshot, getSnapshot, inspectRecords } from '../store/store';

let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn');
  error = vi.spyOn(console, 'error');
});

describe('<Toaster /> on the server (§23)', () => {
  it('runs without a window', () => {
    expect(typeof window).toBe('undefined');
  });

  it('renders only the empty, named region', () => {
    expect(renderToString(<Toaster />)).toBe(
      '<section class="ret-toaster" aria-label="Notifications" data-theme="system"></section>'
    );
  });

  it('renders the className and theme hooks', () => {
    expect(renderToString(<Toaster className="mine" theme="dark" />)).toBe(
      '<section class="ret-toaster mine" aria-label="Notifications" data-theme="dark"></section>'
    );
  });

  it('names the region from labels', () => {
    expect(renderToString(<Toaster labels={{ region: 'Benachrichtigungen', close: '' }} />)).toBe(
      '<section class="ret-toaster" aria-label="Benachrichtigungen" data-theme="system"></section>'
    );
  });

  it('attaches nothing, stores nothing and logs nothing', () => {
    renderToString(<Toaster maxVisible={2} position="bottom-left" />);
    renderToString(<Toaster />);
    expect(getSnapshot()).toBe(getServerSnapshot());
    expect(getSnapshot().active).toBeNull();
    expect(inspectRecords()).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
