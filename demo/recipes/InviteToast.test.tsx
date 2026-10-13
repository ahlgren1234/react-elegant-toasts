import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as React from 'react';
import type { ReactElement } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { axe } from 'vitest-axe';
// The library from source, never the built package (P-25 decision 9): CI's `test` job has no
// `dist/`. Only the second group of tests uses it.
import { Toaster, toast as libraryToast } from '../../src/index';

// The custom toast recipe (P-25 S5b). The demo runs `showInvite` from InviteToast.tsx and shows that
// file and invite-toast.css as its code, so these tests read the same files. The module is compiled
// from its source and run with a `toast` of the test's choosing: a recording one, or the library's.

const ROOT = resolve(__dirname, '../..');
const COMPONENT = readFileSync(resolve(__dirname, 'InviteToast.tsx'), 'utf8');
const STYLES = readFileSync(resolve(__dirname, 'invite-toast.css'), 'utf8');

const INVITE_ID = 'workspace-invite';
const TITLE = 'Maya Chen invited you to Design';
const TEXT = `${TITLE} Join to see and comment on its files. Join`;

interface Recipe {
  showInvite: (options?: { closeButton?: boolean }) => string | undefined;
}

/** The recipe module, compiled to CommonJS and run with `api` as the package's `toast`. */
function loadRecipe(api: unknown): Recipe {
  const { outputText } = ts.transpileModule(COMPONENT, {
    fileName: 'InviteToast.tsx',
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const modules: Record<string, unknown> = {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'react-elegant-toasts': { toast: api },
    './invite-toast.css': {},
  };
  const exports = {};
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const load = new Function('require', 'exports', outputText) as (
    require: (id: string) => unknown,
    exports: object
  ) => void;
  load(id => {
    if (!(id in modules)) throw new Error(`The recipe imports ${id}`);
    return modules[id];
  }, exports);
  return exports as Recipe;
}

interface Call {
  method: string;
  args: unknown[];
}

/** A recording `toast` with the three members the recipe uses. */
function createFake() {
  const calls: Call[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      const options = args[1] as { id?: string } | undefined;
      return method === 'dismiss' ? undefined : (options?.id ?? 'generated');
    };
  const api = { custom: record('custom'), success: record('success'), dismiss: record('dismiss') };
  return { api, calls };
}

/** Shows the invitation against a recording `toast` and renders its content in a toast list. */
function renderWithFake(closeButton?: boolean) {
  const { api, calls } = createFake();
  const id = loadRecipe(api).showInvite(closeButton === undefined ? undefined : { closeButton });
  const [content, options] = calls[0]!.args as [ReactElement, Record<string, unknown>];
  calls.length = 0;
  // In a labelled region and a list, as the Toaster renders it.
  render(
    <section aria-label="Notifications">
      <ol>
        <li>{content}</li>
      </ol>
    </section>
  );
  return { id, options, calls, group: screen.getByRole('group', { name: TITLE }) };
}

/** Whitespace collapsed, as the library collapses a toast's text before announcing it (§17.1). */
const collapse = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

describe('the invitation recipe, with a recording toast', () => {
  it('shows one persistent custom toast with a fixed ID and its own dismiss button', () => {
    const { id, options, group } = renderWithFake();
    expect(id).toBe(INVITE_ID);
    expect(options).toEqual({
      id: INVITE_ID,
      duration: Infinity,
      closeButton: false,
      className: 'invite-toast',
    });
    expect(
      within(group)
        .getAllByRole('button')
        .map(button => button.textContent)
    ).toEqual(['Join', 'Not now']);
  });

  it('asks for the library close button instead, and then drops its own', () => {
    const { options, group } = renderWithFake(true);
    expect(options).toEqual({
      id: INVITE_ID,
      duration: Infinity,
      closeButton: true,
      className: 'invite-toast invite-toast--close',
    });
    expect(
      within(group)
        .getAllByRole('button')
        .map(button => button.textContent)
    ).toEqual(['Join']);
  });

  it('Not now dismisses exactly this toast, by its ID', () => {
    const { calls } = renderWithFake();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    // Never `toast.dismiss()` with no ID, which would close every toast.
    expect(calls).toEqual([{ method: 'dismiss', args: [INVITE_ID] }]);
  });

  it.each([false, true])('Join dismisses this toast, then confirms (close button %s)', close => {
    const { calls } = renderWithFake(close);
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(calls).toEqual([
      { method: 'dismiss', args: [INVITE_ID] },
      { method: 'success', args: ['You joined Design'] },
    ]);
  });

  it('names its group by the title, so its buttons have context', () => {
    const { group } = renderWithFake();
    const title = screen.getByText(TITLE);
    expect(group.getAttribute('aria-labelledby')).toBe(title.id);
    expect(title.id).not.toBe('');
  });

  it('uses native buttons in the tab order, with no nested controls', () => {
    const { group } = renderWithFake();
    for (const button of within(group).getAllByRole('button')) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(button.tabIndex).toBe(0);
      expect(button.querySelector('a, button, input, select, textarea, [tabindex]')).toBeNull();
      button.focus();
      expect(document.activeElement).toBe(button);
    }
    // Only the buttons are interactive or focusable.
    expect(group.querySelectorAll('a, input, select, textarea, [tabindex]')).toHaveLength(0);
  });

  it('hides its decorative icon, which has no text to announce', () => {
    const { group } = renderWithFake();
    const hidden = group.querySelectorAll('[aria-hidden="true"]');
    expect(hidden).toHaveLength(1);
    expect(hidden[0]!.textContent).toBe('');
    expect(hidden[0]!.querySelector('svg')?.getAttribute('focusable')).toBe('false');
  });

  it.each([
    [false, `${TEXT} Not now`],
    [true, TEXT],
  ])('keeps its words apart in its text content (close button %s)', (close, text) => {
    const { group } = renderWithFake(close);
    expect(collapse(group.textContent)).toBe(text);
  });

  it.each([false, true])('has no axe violations (close button %s)', async close => {
    renderWithFake(close);
    expect((await axe(document.body)).violations).toEqual([]);
  });
});

describe('the invitation recipe, with the library', () => {
  let error: MockInstance<typeof console.error>;
  let recipe: Recipe;

  beforeEach(() => {
    vi.useFakeTimers();
    error = vi.spyOn(console, 'error');
    recipe = loadRecipe(libraryToast);
    render(<Toaster />);
  });

  afterEach(() => {
    expect(error).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  /** Runs the lifecycle fallbacks due now, so entering and exiting toasts finish. */
  const flush = () =>
    act(() => {
      vi.advanceTimersByTime(0);
    });

  const region = () => screen.getByRole('region');
  const live = (politeness: 'polite' | 'assertive') =>
    [...document.querySelectorAll(`[aria-live="${politeness}"] > *`)].map(node => node.textContent);
  /** The invitation's toast, or null. */
  const invitation = () =>
    document.querySelector<HTMLElement>('.ret-toast.invite-toast:not([data-phase="exiting"])');

  it('renders as a custom toast with its className on the root', () => {
    act(() => {
      recipe.showInvite();
    });
    flush();
    const item = invitation()!;
    expect(item.tagName).toBe('LI');
    expect(item.classList.contains('ret-toast--custom')).toBe(true);
    expect(within(item).queryByRole('group', { name: TITLE })).not.toBeNull();
    expect(item.querySelector('.ret-toast__close')).toBeNull();
  });

  it.each([
    [false, `${TEXT} Not now`],
    [true, TEXT],
  ])('is announced once, politely, with its text (close button %s)', (closeButton, text) => {
    act(() => {
      recipe.showInvite({ closeButton });
    });
    flush();
    // Another toast does not announce the invitation again.
    act(() => {
      libraryToast('Other', { duration: Infinity });
    });
    flush();
    expect(live('polite')).toEqual([text, 'Other']);
    expect(live('assertive')).toEqual([]);
  });

  it('shows the named library close button when asked for, and it closes the invitation', () => {
    act(() => {
      recipe.showInvite({ closeButton: true });
    });
    flush();
    const close = within(invitation()!).getByRole('button', { name: 'Close notification' });
    expect(within(invitation()!).queryByRole('button', { name: 'Not now' })).toBeNull();
    fireEvent.click(close);
    flush();
    expect(invitation()).toBeNull();
  });

  it('Not now closes the invitation and no other toast', () => {
    act(() => {
      libraryToast('Before', { duration: Infinity });
      recipe.showInvite();
      libraryToast('After', { duration: Infinity });
    });
    flush();
    fireEvent.click(within(invitation()!).getByRole('button', { name: 'Not now' }));
    flush();
    expect(invitation()).toBeNull();
    expect(
      [...document.querySelectorAll('.ret-toast')].map(item => collapse(item.textContent))
    ).toEqual(['After', 'Before']);
  });

  it('Join closes the invitation and confirms with a success toast', () => {
    act(() => {
      recipe.showInvite();
    });
    flush();
    fireEvent.click(within(invitation()!).getByRole('button', { name: 'Join' }));
    flush();
    expect(invitation()).toBeNull();
    expect(document.querySelector('.ret-toast--success')?.textContent).toContain(
      'You joined Design'
    );
  });

  it.each(['Not now', 'Join'])('keeps focus in the region when %s closes the toast', name => {
    act(() => {
      libraryToast('Earlier', { duration: Infinity });
      recipe.showInvite();
    });
    flush();
    const button = within(invitation()!).getByRole('button', { name });
    button.focus();
    fireEvent.click(button);
    flush();
    expect(document.activeElement).not.toBe(document.body);
    expect(region().contains(document.activeElement)).toBe(true);
  });

  it('has no axe violations with the invitation shown', async () => {
    act(() => {
      recipe.showInvite();
      recipe.showInvite({ closeButton: true });
    });
    flush();
    vi.useRealTimers();
    expect((await axe(document.body)).violations).toEqual([]);
  });
});

describe('the recipe source', () => {
  it('type-checks against the library’s public types', () => {
    const file = resolve(ROOT, 'demo/__snippets__/InviteToast.tsx');
    const css = resolve(ROOT, 'demo/__snippets__/css.d.ts');
    const files: Record<string, string> = {
      [file]: COMPONENT,
      [css]: "declare module '*.css';",
    };
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      types: [],
      baseUrl: ROOT,
      paths: { 'react-elegant-toasts': ['src/index.ts'] },
    };
    const host = ts.createCompilerHost(options);
    const fileExists = host.fileExists.bind(host);
    const readFile = host.readFile.bind(host);
    const getSourceFile = host.getSourceFile.bind(host);
    host.fileExists = name => name in files || fileExists(name);
    host.readFile = name => files[name] ?? readFile(name);
    host.getSourceFile = (name, version, ...rest) =>
      name in files
        ? ts.createSourceFile(name, files[name]!, version)
        : getSourceFile(name, version, ...rest);
    const program = ts.createProgram(Object.keys(files), options, host);
    const diagnostics = ts
      .getPreEmitDiagnostics(program, program.getSourceFile(file))
      .map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(diagnostics).toEqual([]);
  });

  it('is what the demo runs and shows', () => {
    const section = readFileSync(resolve(ROOT, 'demo/components/CustomToast.tsx'), 'utf8');
    expect(section).toContain("import { showInvite } from '../recipes/InviteToast';");
    expect(section).toContain("from '../recipes/InviteToast.tsx?raw';");
    expect(section).toContain("from '../recipes/invite-toast.css?raw';");
  });
});

describe('the recipe styles', () => {
  const css = STYLES.replace(/\/\*[\s\S]*?\*\//g, '');

  it('style exactly the classes the component and its options use', () => {
    const used = new Set(
      [...COMPONENT.matchAll(/className[=:] ?(?:closeButton \? )?['"]([^'"]+)['"]/g)]
        .concat([...COMPONENT.matchAll(/: '(invite-toast[^']*)'/g)])
        .flatMap(match => match[1]!.split(' '))
    );
    const styled = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(match => match[1]!));
    expect([...styled].sort()).toEqual([...used].sort());
    expect([...styled].every(name => name.startsWith('invite-toast'))).toBe(true);
  });

  it('touch no library class, use no ID or !important, and declare no custom property', () => {
    expect(css).not.toMatch(/\.ret-/);
    expect(css).not.toMatch(/#[A-Za-z_-][\w-]*\s*[{,]/);
    expect(css).not.toContain('!important');
    expect(css).not.toMatch(/(^|[\s{;])--[\w-]+\s*:/);
  });

  it('read only tokens the library declares, so the card follows the Toaster theme', () => {
    const library = readFileSync(resolve(ROOT, 'src/styles.css'), 'utf8');
    const declared = new Set([...library.matchAll(/(--ret-[\w-]+)\s*:/g)].map(match => match[1]));
    const read = [...css.matchAll(/var\((--[\w-]+)\)/g)].map(match => match[1]);
    expect(read.length).toBeGreaterThan(0);
    expect(read.filter(name => !declared.has(name))).toEqual([]);
  });

  it('use logical properties only, so the card mirrors in RTL', () => {
    expect(css).not.toMatch(/(^|[\s;{])(left|right|top|bottom)\s*:/);
    expect(css).not.toMatch(/-(left|right|top|bottom)\s*:/);
    expect(css).not.toMatch(/:\s*(left|right)\s*;/);
  });

  it('transition nothing unless motion is welcome', () => {
    const motion = '@media (prefers-reduced-motion: no-preference) {';
    const start = css.indexOf(motion);
    expect(start).toBeGreaterThan(-1);
    // The media block is the file's last rule, so everything else comes before it.
    expect(css.trimEnd().endsWith('}\n}')).toBe(true);
    expect(css.slice(0, start)).not.toMatch(/\b(transition|animation)/);
  });
});
