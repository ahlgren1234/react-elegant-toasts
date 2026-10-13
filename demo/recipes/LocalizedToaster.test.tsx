import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as React from 'react';
import type { ComponentType } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
// The library from source, never the built package (P-25 decision 9).
import { Toaster, toast } from '../../src/index';
import { DEFAULT_LABELS } from '../../src/react/defaults';
import { highlight } from '../utils/highlight';
import { snippetText } from '../utils/snippet';

// The labels recipe (P-25 S6a). The accessibility section shows LocalizedToaster.tsx as its code,
// so these tests compile that same file and render it with the library.

const ROOT = resolve(__dirname, '../..');
const SOURCE = readFileSync(resolve(__dirname, 'LocalizedToaster.tsx'), 'utf8');

/** The recipe module, compiled to CommonJS and run with the library's `Toaster`. */
function loadRecipe(): ComponentType {
  const { outputText } = ts.transpileModule(SOURCE, {
    fileName: 'LocalizedToaster.tsx',
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const modules: Record<string, unknown> = {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'react-elegant-toasts': { Toaster },
  };
  const exports: { LocalizedToaster?: ComponentType } = {};
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const load = new Function('require', 'exports', outputText) as (
    require: (id: string) => unknown,
    exports: object
  ) => void;
  load(id => {
    if (!(id in modules)) throw new Error(`The recipe imports ${id}`);
    return modules[id];
  }, exports);
  return exports.LocalizedToaster!;
}

const live = (politeness: 'polite' | 'assertive') =>
  [...document.querySelectorAll(`[aria-live="${politeness}"] > *`)].map(node => node.textContent);

describe('the labels recipe, with the library', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const LocalizedToaster = loadRecipe();
    render(<LocalizedToaster />);
  });

  const flush = () =>
    act(() => {
      vi.advanceTimersByTime(0);
    });

  it('replaces every default label', () => {
    act(() => {
      toast.warning('Speicher fast voll', { duration: Infinity });
      toast.error('Speichern fehlgeschlagen', { duration: Infinity });
    });
    flush();
    const region = screen.getByRole('region', { name: 'Benachrichtigungen' });
    expect(
      screen.getAllByRole('button', { name: 'Benachrichtigung schließen' }).length
    ).toBeGreaterThan(0);
    expect(live('polite')).toEqual(['Warnung: Speicher fast voll']);
    expect(live('assertive')).toEqual(['Fehler: Speichern fehlgeschlagen']);
    // None of the four defaults is left anywhere.
    const text = `${region.outerHTML}`;
    for (const fallback of Object.values(DEFAULT_LABELS)) expect(text).not.toContain(fallback);
  });

  it('reads the prefixes without showing them', () => {
    act(() => {
      toast.error('Speichern fehlgeschlagen', { duration: Infinity });
    });
    flush();
    expect(document.querySelector('.ret-toast')?.textContent).toBe('Speichern fehlgeschlagen');
  });

  it('has no axe violations', async () => {
    act(() => {
      toast.warning('Speicher fast voll', { duration: Infinity });
    });
    flush();
    vi.useRealTimers();
    expect((await axe(document.body)).violations).toEqual([]);
  });
});

// No type-check here: `typecheck:demo` already compiles this file against the package's public
// types (an unknown label key fails it), so a second TypeScript program would only repeat that work.
describe('the recipe source', () => {
  it('copies exactly as written', () => {
    expect(snippetText(highlight(SOURCE))).toBe(SOURCE);
  });

  it('is what the demo shows', () => {
    const section = readFileSync(resolve(ROOT, 'demo/components/Accessibility.tsx'), 'utf8');
    expect(section).toContain("from '../recipes/LocalizedToaster.tsx?raw';");
  });
});
