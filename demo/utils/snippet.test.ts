import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { ToastPosition, ToastTheme } from 'react-elegant-toasts';
import {
  DEFAULT_CONFIG,
  DURATIONS,
  TOAST_TYPES,
  toInvocation,
  toToasterSettings,
  type PlaygroundConfig,
  type ToastInvocation,
} from './playground';
import { quote, snippetText, snippetTokens } from './snippet';

const MINIMAL: PlaygroundConfig = {
  ...DEFAULT_CONFIG,
  description: false,
  action: false,
  closeButton: true,
  duration: '5s',
};

const snippet = (overrides: Partial<PlaygroundConfig> = {}, theme: ToastTheme = 'system') => {
  const config = { ...MINIMAL, ...overrides };
  return snippetText(snippetTokens(toInvocation(config), toToasterSettings(config, theme)));
};

/** The body of `showToast()`, without the surrounding function. */
const call = (overrides: Partial<PlaygroundConfig> = {}) => {
  const text = snippet(overrides);
  return text.slice(text.indexOf('function showToast() {\n') + 23, text.indexOf('}\n\nexport'));
};

describe('snippet generation', () => {
  it('writes the whole example for the default configuration', () => {
    expect(snippet({ description: true })).toBe(
      `import { Toaster, toast } from 'react-elegant-toasts';
import 'react-elegant-toasts/styles.css';

function showToast() {
  toast.success('Profile saved', {
    description: 'Changes are synced to all of your devices.',
  });
}

export function App() {
  return (
    <>
      <Toaster />
      <button onClick={showToast}>Show toast</button>
    </>
  );
}
`
    );
  });

  it('leaves out every default option', () => {
    expect(call()).toBe("  toast.success('Profile saved');\n");
    expect(snippet()).toContain('      <Toaster />\n');
  });

  it.each([
    ['default', "  toast('Event has been created');\n"],
    ['success', "  toast.success('Profile saved');\n"],
    ['error', "  toast.error('Payment failed');\n"],
    ['warning', "  toast.warning('Storage almost full');\n"],
    ['info', "  toast.info('New version available');\n"],
    ['loading', "  toast.loading('Uploading report…');\n"],
  ] as const)('calls the %s method', (type, expected) => {
    expect(call({ type })).toBe(expected);
  });

  it('covers every type the playground offers', () => {
    expect(TOAST_TYPES.map(({ value }) => value)).toEqual([
      'default',
      'success',
      'error',
      'warning',
      'info',
      'loading',
    ]);
  });

  it.each([
    ['5s', undefined],
    ['10s', '    duration: 10000,\n'],
    ['persistent', '    duration: Infinity,\n'],
  ] as const)('writes the %s duration', (duration, expected) => {
    const body = call({ duration });
    if (expected === undefined) expect(body).not.toContain('duration');
    else expect(body).toBe(`  toast.success('Profile saved', {\n${expected}  });\n`);
  });

  it('leaves out the duration of a loading toast, which is always persistent', () => {
    for (const { value } of DURATIONS) {
      expect(call({ type: 'loading', duration: value })).toBe(
        "  toast.loading('Uploading report…');\n"
      );
    }
  });

  it('writes the description', () => {
    expect(call({ type: 'error', description: true })).toBe(
      `  toast.error('Payment failed', {
    description: 'Your card was declined. Try another payment method.',
  });
`
    );
  });

  it('writes the action with the toast its click shows', () => {
    expect(call({ action: true })).toBe(
      `  toast.success('Profile saved', {
    action: {
      label: 'Undo',
      onClick: () => toast('Change undone'),
    },
  });
`
    );
  });

  it('writes closeButton only when it is turned off', () => {
    expect(call({ closeButton: true })).not.toContain('closeButton');
    expect(call({ closeButton: false })).toBe(
      "  toast.success('Profile saved', {\n    closeButton: false,\n  });\n"
    );
  });

  it('writes the options in a fixed order', () => {
    expect(
      call({ description: true, action: true, closeButton: false, duration: 'persistent' })
    ).toBe(
      `  toast.success('Profile saved', {
    description: 'Changes are synced to all of your devices.',
    action: {
      label: 'Undo',
      onClick: () => toast('Change undone'),
    },
    closeButton: false,
    duration: Infinity,
  });
`
    );
  });

  it.each([
    ['top-left', '<Toaster position="top-left" />'],
    ['top-center', '<Toaster position="top-center" />'],
    ['top-right', '<Toaster />'],
    ['bottom-left', '<Toaster position="bottom-left" />'],
    ['bottom-center', '<Toaster position="bottom-center" />'],
    ['bottom-right', '<Toaster position="bottom-right" />'],
  ] as const)('sets the %s position on the Toaster', (position: ToastPosition, expected) => {
    expect(snippet({ position })).toContain(`      ${expected}\n`);
  });

  it('sets a theme other than system on the Toaster', () => {
    expect(snippet({}, 'system')).toContain('<Toaster />');
    expect(snippet({}, 'light')).toContain('<Toaster theme="light" />');
    expect(snippet({ position: 'bottom-left' }, 'dark')).toContain(
      '<Toaster position="bottom-left" theme="dark" />'
    );
  });

  it('escapes string content', () => {
    expect(quote('plain')).toBe("'plain'");
    expect(quote(`It's "done" \\ now\nnext\r\u2028\u2029`)).toBe(
      `'It\\'s "done" \\\\ now\\nnext\\r\\u2028\\u2029'`
    );

    const invocation: ToastInvocation = {
      type: 'info',
      message: "Don't panic",
      description: 'C:\\temp',
      action: { label: "It's fine", result: 'Line one\nline two' },
    };
    const text = snippetText(snippetTokens(invocation, { position: 'top-right', theme: 'system' }));
    expect(text).toContain("toast.info('Don\\'t panic', {");
    expect(text).toContain("description: 'C:\\\\temp',");
    expect(text).toContain("label: 'It\\'s fine',");
    expect(text).toContain("onClick: () => toast('Line one\\nline two'),");
  });

  it('marks strings, keywords and tags for highlighting', () => {
    const tokens = snippetTokens(toInvocation({ ...MINIMAL, action: true }), {
      position: 'bottom-left',
      theme: 'dark',
    });
    const of = (kind: string) => tokens.filter(t => t.kind === kind).map(t => t.text);
    expect(of('string')).toEqual([
      "'react-elegant-toasts'",
      "'react-elegant-toasts/styles.css'",
      "'Profile saved'",
      "'Undo'",
      "'Change undone'",
      '"bottom-left"',
      '"dark"',
    ]);
    expect(of('keyword')).toEqual([
      'import',
      'from',
      'import',
      'function',
      'export',
      'function',
      'return',
    ]);
    expect(of('attribute')).toEqual(['position', 'theme', 'onClick']);
    expect(of('tag')).toEqual(['<>', '<Toaster', '/>', '<button', '>', '</button>', '</>']);
  });

  it('produces valid TSX for every combination of options', () => {
    const flags = [false, true];
    for (const { value: type } of TOAST_TYPES) {
      for (const { value: duration } of DURATIONS) {
        for (const description of flags) {
          for (const action of flags) {
            for (const closeButton of flags) {
              const source = snippet(
                { type, duration, description, action, closeButton, position: 'bottom-center' },
                'dark'
              );
              const { diagnostics } = ts.transpileModule(source, {
                fileName: 'App.tsx',
                reportDiagnostics: true,
                compilerOptions: { jsx: ts.JsxEmit.ReactJSX },
              });
              expect(diagnostics ?? [], source).toEqual([]);
            }
          }
        }
      }
    }
  });
});

describe('toInvocation', () => {
  it('maps the durations to milliseconds', () => {
    expect(toInvocation({ ...MINIMAL, duration: '5s' }).duration).toBeUndefined();
    expect(toInvocation({ ...MINIMAL, duration: '10s' }).duration).toBe(10000);
    expect(toInvocation({ ...MINIMAL, duration: 'persistent' }).duration).toBe(Infinity);
  });

  it('includes only the options that differ from the defaults', () => {
    expect(toInvocation(MINIMAL)).toEqual({ type: 'success', message: 'Profile saved' });
  });
});
