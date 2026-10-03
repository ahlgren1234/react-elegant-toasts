// @vitest-environment node
// Server rendering of <Toaster /> from source (§8.3, §23). The packed-package smoke test is P-23.
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Toaster } from '../index';
import { useIsomorphicLayoutEffect } from '../react/useIsomorphicLayoutEffect';
import { getServerSnapshot, getSnapshot, inspectRecords } from '../store/store';

let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn');
  error = vi.spyOn(console, 'error');
});

// The two persistent live regions (§17.1): present and empty in the server HTML, so hydration
// matches and they exist before anything is announced.
const HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap';
const LIVE_REGIONS =
  `<div role="status" aria-live="polite" aria-atomic="false" style="${HIDDEN}"></div>` +
  `<div aria-live="assertive" aria-atomic="false" style="${HIDDEN}"></div>`;

describe('<Toaster /> on the server (§23)', () => {
  it('runs without a window', () => {
    expect(typeof window).toBe('undefined');
  });

  it('renders only the named region and its empty live regions', () => {
    expect(renderToString(<Toaster />)).toBe(
      `<section class="ret-toaster" aria-label="Notifications" data-theme="system">${LIVE_REGIONS}</section>`
    );
  });

  it('renders the className and theme hooks', () => {
    expect(renderToString(<Toaster className="mine" theme="dark" />)).toBe(
      `<section class="ret-toaster mine" aria-label="Notifications" data-theme="dark">${LIVE_REGIONS}</section>`
    );
  });

  it('names the region from labels', () => {
    expect(renderToString(<Toaster labels={{ region: 'Benachrichtigungen', close: '' }} />)).toBe(
      `<section class="ret-toaster" aria-label="Benachrichtigungen" data-theme="system">${LIVE_REGIONS}</section>`
    );
  });

  it('renders the same region whatever the hotkey, and reads no DOM for it (P-16)', () => {
    const markup = renderToString(<Toaster />);
    for (const hotkey of [['ctrlKey', 'KeyY'], false, ['F6']] as const) {
      expect(renderToString(<Toaster hotkey={hotkey} />)).toBe(markup);
    }
    expect(error).not.toHaveBeenCalled();
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

describe('useIsomorphicLayoutEffect on the server (§23)', () => {
  it('logs no layout-effect warning and does not run the effect', () => {
    const effect = vi.fn();
    function Probe() {
      useIsomorphicLayoutEffect(effect, []);
      return <i />;
    }
    expect(renderToString(<Probe />)).toBe('<i></i>');
    expect(effect).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
