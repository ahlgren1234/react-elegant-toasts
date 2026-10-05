// Automated structural accessibility checks (§17.6, AC-A11Y-5, P-16): axe over the Toaster's own
// markup in jsdom, with vitest-axe's default rules. It checks names, roles, landmark and list
// structure and valid ARIA, and nothing a browser or a person must check: no announcement, focus,
// keyboard or `inert` behaviour, no contrast (vitest-axe turns the colour rules off, and jsdom has
// no CSS), and no content inside an inert toast, which axe skips. Those are P-17, P-22 and P-29.
// Custom content is the consumer's (§17.3): the custom sample here is accessible because it was
// written to be, and the last scan shows axe does report what custom content gets wrong.
//
// axe waits on real timers, so each state is built under fake timers, which hold toasts in their
// phase, and then scanned under real ones; the fake timers left pending never run.
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { axe } from 'vitest-axe';
import { Toaster, toast } from '../index';
import { dismiss } from '../store/store';
import type { ToasterProps, ToastTheme } from '../types';

let error: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.useFakeTimers();
  error = vi.spyOn(console, 'error');
});

afterEach(() => {
  expect(error).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

/** Runs the lifecycle fallbacks due now, so entering toasts become visible. */
const flush = () =>
  act(() => {
    vi.advanceTimersByTime(0);
  });

/** Scans the whole document under real timers. */
function scan() {
  vi.useRealTimers();
  return axe(document.body);
}

/**
 * Every normal type, a description, an action, close buttons, and an accessible custom toast with
 * the library close button, at two positions and within `maxVisible`, so every toast is rendered.
 * Persistent, so nothing closes during a scan.
 */
function showRepresentative(): void {
  act(() => {
    toast('Saved', {
      id: 'default',
      duration: Infinity,
      description: 'All changes are stored.',
      action: { label: 'Undo', onClick: () => undefined },
    });
    toast.success('Uploaded', { id: 'success', duration: Infinity });
    toast.info('New version available', { id: 'info', duration: Infinity });
    toast.warning('Storage almost full', { id: 'warning', duration: Infinity });
    toast.loading('Syncing', { id: 'loading', position: 'bottom-left' });
    toast.error('Could not connect', {
      id: 'error',
      duration: Infinity,
      position: 'bottom-left',
    });
    toast.custom(
      <div>
        <p>Your report is ready.</p>
        <button type="button">Open report</button>
      </div>,
      { id: 'custom', duration: Infinity, position: 'bottom-left', closeButton: true }
    );
  });
  flush();
}

function mount(props: ToasterProps = {}, wrap = (toaster: ReactNode) => toaster) {
  return render(wrap(<Toaster {...props} />));
}

describe('axe (§17.6, AC-A11Y-5)', () => {
  it('finds nothing in the empty region and its live regions', async () => {
    mount();
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(2);
    expect(await scan()).toHaveNoViolations();
  });

  it.each<ToastTheme>(['light', 'dark', 'system'])(
    'finds nothing in a representative stack with the %s theme',
    async theme => {
      mount({ theme });
      showRepresentative();
      expect(screen.getByRole('region')).toHaveAttribute('data-theme', theme);
      expect(document.querySelectorAll('section > ol > li')).toHaveLength(7);
      expect(await scan()).toHaveNoViolations();
    }
  );

  it('finds nothing in a representative stack in a right-to-left document', async () => {
    mount({}, toaster => <div dir="rtl">{toaster}</div>);
    showRepresentative();
    expect(document.querySelectorAll('section > ol > li')).toHaveLength(7);
    expect(await scan()).toHaveNoViolations();
  });

  it('finds nothing around an exiting toast once focus has moved to the region', async () => {
    mount();
    act(() => {
      toast('Saved', { id: 'a', duration: Infinity });
    });
    flush();
    act(() => screen.getByRole('button', { name: 'Close notification' }).focus());
    act(() => dismiss('a'));
    const item = document.querySelector('section > ol > li');
    expect(item).toHaveAttribute('inert');
    expect(document.activeElement).toBe(screen.getByRole('region'));
    // Only the structure around the toast: axe does not look inside an inert subtree.
    expect(await scan()).toHaveNoViolations();
  });

  it('reports what inaccessible custom content gets wrong, so the scans above see the toasts', async () => {
    mount();
    showRepresentative();
    act(() => {
      toast.custom(<button type="button" />, {
        id: 'unnamed',
        duration: Infinity,
        position: 'top-center',
      });
    });
    flush();
    expect(document.querySelectorAll('section > ol > li')).toHaveLength(8);
    const results = await scan();
    expect(results.violations.map(violation => violation.id)).toEqual(['button-name']);
    const [violation] = results.violations;
    expect(violation?.nodes).toHaveLength(1);
    const unnamed = document.querySelector('section > ol > li > button:not([class])');
    expect(violation?.nodes[0]?.html).toBe(unnamed?.outerHTML);
  });
});
