// The Toaster's labels (§6.5, §17.2): the region's name and the close button's name, with their
// defaults, overrides and fallbacks. The warning and error prefixes are resolved here too; they
// are read only by the announcer.
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LABELS, resolveLabels } from '../react/defaults';
import { Toaster, toast } from '../index';
import type { ToasterProps } from '../types';

type Labels = ToasterProps['labels'];

const region = () => screen.getByRole('region');
const closeNames = () =>
  [...document.querySelectorAll('.ret-toast__close')].map(button =>
    button.getAttribute('aria-label')
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('resolveLabels (§6.5)', () => {
  it('uses the documented defaults', () => {
    expect(DEFAULT_LABELS).toEqual({
      region: 'Notifications',
      close: 'Close notification',
      warningPrefix: 'Warning:',
      errorPrefix: 'Error:',
    });
    expect(resolveLabels(undefined)).toEqual(DEFAULT_LABELS);
  });

  it('takes every field given', () => {
    const labels = {
      region: 'Benachrichtigungen',
      close: 'Schließen',
      warningPrefix: 'Warnung:',
      errorPrefix: 'Fehler:',
    };
    expect(resolveLabels(labels)).toEqual(labels);
  });

  it('keeps the default of each field left out', () => {
    expect(resolveLabels({ close: 'Fermer' })).toEqual({ ...DEFAULT_LABELS, close: 'Fermer' });
    expect(resolveLabels({ errorPrefix: 'Erreur :' })).toEqual({
      ...DEFAULT_LABELS,
      errorPrefix: 'Erreur :',
    });
  });

  it.each<[string, unknown]>([
    ['undefined', undefined],
    ['an empty string', ''],
    ['whitespace only', ' \n\t'],
    ['a number', 42],
    ['null', null],
    ['an object', { toString: () => 'Close' }],
  ])('keeps the default for a field that is %s', (_name, value) => {
    expect(
      resolveLabels({ region: value, close: value, warningPrefix: value, errorPrefix: value })
    ).toEqual(DEFAULT_LABELS);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['a string', 'Notifications'],
    ['a number', 1],
    // Only a non-null object carries labels, as with toast options: not a function that has them.
    [
      'a function with label properties',
      Object.assign(() => undefined, { region: 'x', close: 'y' }),
    ],
  ])('uses every default when labels is %s', (_name, labels) => {
    expect(resolveLabels(labels)).toEqual(DEFAULT_LABELS);
  });

  it('keeps text with surrounding whitespace as given', () => {
    expect(resolveLabels({ warningPrefix: ' Attention : ' }).warningPrefix).toBe(' Attention : ');
  });

  it('reads each field once, so an accessor cannot pass with one value and be used with another', () => {
    const reads = { region: 0, close: 0, warningPrefix: 0, errorPrefix: 0 };
    const values = ['Valid', ''];
    const labels = Object.fromEntries(
      (Object.keys(reads) as (keyof typeof reads)[]).map(key => [
        key,
        {
          enumerable: true,
          get: () => values[reads[key]++] ?? '',
        },
      ])
    );
    const resolved = resolveLabels(Object.defineProperties({}, labels));
    expect(reads).toEqual({ region: 1, close: 1, warningPrefix: 1, errorPrefix: 1 });
    expect(resolved).toEqual({
      region: 'Valid',
      close: 'Valid',
      warningPrefix: 'Valid',
      errorPrefix: 'Valid',
    });
  });
});

describe('the region label (§17.2)', () => {
  it('names the region "Notifications" by default', () => {
    render(<Toaster />);
    expect(region()).toHaveAccessibleName('Notifications');
  });

  it('names the region from labels.region', () => {
    render(<Toaster labels={{ region: 'Benachrichtigungen' }} />);
    expect(screen.getByRole('region', { name: 'Benachrichtigungen' }).tagName).toBe('SECTION');
  });

  it('keeps the default region name when only other labels are given', () => {
    render(<Toaster labels={{ close: 'Fermer' }} />);
    expect(region()).toHaveAccessibleName('Notifications');
  });

  it('keeps the default region name for an empty or invalid value', () => {
    const { rerender } = render(<Toaster labels={{ region: '' }} />);
    expect(region()).toHaveAccessibleName('Notifications');
    rerender(<Toaster labels={{ region: 7 as never }} />);
    expect(region()).toHaveAccessibleName('Notifications');
    rerender(<Toaster labels={null as never} />);
    expect(region()).toHaveAccessibleName('Notifications');
  });

  it('follows a runtime change, and returns to the default when the label is removed', () => {
    const { rerender } = render(<Toaster labels={{ region: 'Alerts' }} />);
    const section = region();
    expect(section).toHaveAccessibleName('Alerts');
    rerender(<Toaster labels={{ region: 'Updates' }} />);
    expect(section).toHaveAccessibleName('Updates');
    rerender(<Toaster />);
    expect(section).toHaveAccessibleName('Notifications');
  });
});

describe('the close button label (§17.2)', () => {
  function showToasts(): void {
    act(() => {
      toast('normal', { id: 'normal' });
      toast.custom(<p>custom</p>, { id: 'custom', closeButton: true });
    });
  }

  it('names every library close button "Close notification" by default', () => {
    render(<Toaster />);
    showToasts();
    expect(closeNames()).toEqual(['Close notification', 'Close notification']);
  });

  it('names the close buttons of normal and custom toasts from labels.close', () => {
    render(<Toaster labels={{ close: 'Fermer' }} />);
    showToasts();
    expect(closeNames()).toEqual(['Fermer', 'Fermer']);
    expect(screen.getAllByRole('button', { name: 'Fermer' })).toHaveLength(2);
  });

  it('keeps the default close name when only other labels are given', () => {
    render(<Toaster labels={{ region: 'Alerts', errorPrefix: 'Oops:' }} />);
    showToasts();
    expect(closeNames()).toEqual(['Close notification', 'Close notification']);
  });

  it.each<[string, Labels]>([
    ['an empty string', { close: '' }],
    ['whitespace only', { close: '   ' }],
    ['not a string', { close: false as never }],
  ])('keeps the default close name for %s', (_name, labels) => {
    render(<Toaster labels={labels} />);
    showToasts();
    expect(closeNames()).toEqual(['Close notification', 'Close notification']);
  });

  it('renames shown close buttons on a runtime change, including toasts that arrive later', () => {
    const { rerender } = render(<Toaster labels={{ close: 'Fermer' }} />);
    showToasts();
    rerender(<Toaster labels={{ close: 'Schließen' }} />);
    expect(closeNames()).toEqual(['Schließen', 'Schließen']);
    act(() => {
      toast('later', { id: 'later' });
    });
    expect(closeNames()).toEqual(['Schließen', 'Schließen', 'Schließen']);
    rerender(<Toaster labels={{}} />);
    expect(closeNames()).toEqual([
      'Close notification',
      'Close notification',
      'Close notification',
    ]);
  });

  it('names a close button that a Toaster closeButton change brings back', () => {
    const { rerender } = render(<Toaster closeButton={false} labels={{ close: 'Fermer' }} />);
    act(() => {
      toast('normal', { id: 'normal' });
    });
    expect(closeNames()).toEqual([]);
    rerender(<Toaster labels={{ close: 'Fermer' }} />);
    expect(closeNames()).toEqual(['Fermer']);
  });
});
