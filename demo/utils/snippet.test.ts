import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ToastPosition, ToastTheme } from 'react-elegant-toasts';
import {
  BURST_SIZE,
  DEFAULT_CONFIG,
  DURATIONS,
  MAX_VISIBLE_CHOICES,
  TOAST_TYPES,
  burstMessage,
  persists,
  progressBlocker,
  toToastOptions,
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
  progress: false,
};

const snippet = (overrides: Partial<PlaygroundConfig> = {}, theme: ToastTheme = 'system') => {
  const config = { ...MINIMAL, ...overrides };
  return snippetText(snippetTokens(toInvocation(config), toToasterSettings(config, theme)));
};

/** The body of `showToast()`, without the surrounding function. */
const call = (overrides: Partial<PlaygroundConfig> = {}) => {
  const text = snippet(overrides);
  return text.slice(
    text.indexOf('function showToast() {\n') + 23,
    text.indexOf('}\n\nfunction showBurst')
  );
};

/** The body of `showBurst()`'s loop, without the loop. */
const burstCall = (overrides: Partial<PlaygroundConfig> = {}) => {
  const text = snippet(overrides);
  const start = text.indexOf('; i++) {\n') + 9;
  return text.slice(start, text.indexOf('  }\n}\n\nexport'));
};

interface RecordedCall {
  method: string;
  message: unknown;
  options: Record<string, unknown> | undefined;
}

/**
 * Runs the snippet's `showToast()` or `showBurst()` against a recording `toast`, so a test sees the
 * calls the code shown would make. The snippet is compiled with TypeScript; nothing from the
 * package is imported.
 */
/** Each snippet's CommonJS output, by its source. */
const compiled = new Map<string, string>();

/**
 * Compiles every source not compiled yet in one program emit, rather than one `transpileModule`
 * (a program each) per source. Emitting needs no types, so there is no lib and no resolution.
 */
function compileAll(sources: readonly string[]): void {
  const files = new Map(
    [...new Set(sources)]
      .filter(source => !compiled.has(source))
      .map((source, index) => [`/run-${compiled.size + index}.tsx`, source])
  );
  if (files.size === 0) return;
  const options: ts.CompilerOptions = {
    noLib: true,
    noResolve: true,
    isolatedModules: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  };
  const host = ts.createCompilerHost(options);
  host.fileExists = name => files.has(name);
  host.readFile = name => files.get(name);
  host.getSourceFile = (name, version) => {
    const source = files.get(name);
    return source === undefined
      ? undefined
      : ts.createSourceFile(name, source, version, false, ts.ScriptKind.TSX);
  };
  const program = ts.createProgram([...files.keys()], options, host);
  program.emit(undefined, (name, text) => {
    const source = files.get(name.replace(/\.js$/, '.tsx'));
    if (source !== undefined) compiled.set(source, text);
  });
}

function runSnippet(source: string, entry: 'showToast' | 'showBurst'): RecordedCall[] {
  const calls: RecordedCall[] = [];
  const record =
    (method: string) =>
    (message: unknown, options?: Record<string, unknown>): void => {
      calls.push({ method, message, options });
    };
  const fakeToast = Object.assign(record('default'), {
    success: record('success'),
    error: record('error'),
    warning: record('warning'),
    info: record('info'),
    loading: record('loading'),
  });
  compileAll([source]);
  const outputText = compiled.get(source) ?? '';
  const modules: Record<string, unknown> = {
    'react-elegant-toasts': { toast: fakeToast, Toaster: () => null },
    'react-elegant-toasts/styles.css': {},
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: null },
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const load = new Function(
    'require',
    'exports',
    `${outputText}\nreturn { showToast, showBurst };`
  ) as (
    require: (id: string) => unknown,
    exports: object
  ) => Record<'showToast' | 'showBurst', () => void>;
  load(id => modules[id], {})[entry]();
  return calls;
}

interface NormalCall {
  method: string;
  message: unknown;
  options: Record<string, unknown>;
  /** The action's label and the toasts its click shows, as [method, message] pairs. */
  click?: { label: unknown; shows: unknown[][] };
}

/** The snippet's calls, with each action's click run against the same recording `toast`. */
function normaliseSnippetCalls(calls: RecordedCall[]): NormalCall[] {
  return [...calls].map(({ method, message, options }) => {
    const { action, ...rest } = options ?? {};
    if (!action) return { method, message, options: rest };
    const { label, onClick } = action as { label: unknown; onClick: () => void };
    const before = calls.length;
    onClick();
    const shows = calls.splice(before).map(call => [call.method, call.message]);
    return { method, message, options: rest, click: { label, shows } };
  });
}

/** The calls the demo makes for `config`, built as invoke.ts builds them. */
function demoCalls(config: PlaygroundConfig, burst: boolean): NormalCall[] {
  const invocation = toInvocation(config);
  const messages = burst
    ? Array.from({ length: BURST_SIZE }, (_, i) => burstMessage(invocation.message, i + 1))
    : [invocation.message];
  return messages.map(message => {
    const shows: unknown[][] = [];
    const { action, ...rest } = toToastOptions(invocation, shown => shows.push(['default', shown]));
    const options = rest as Record<string, unknown>;
    if (!action) return { method: invocation.type, message, options };
    action.onClick(undefined as never);
    return { method: invocation.type, message, options, click: { label: action.label, shows } };
  });
}

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

function showBurst() {
  for (let i = 1; i <= 8; i++) {
    toast.success(\`Profile saved (\${i} of 8)\`, {
      description: 'Changes are synced to all of your devices.',
    });
  }
}

export function App() {
  return (
    <>
      <Toaster />
      <button onClick={showToast}>Show toast</button>
      <button onClick={showBurst}>Show a burst</button>
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
      call({ description: true, action: true, closeButton: false, duration: '10s', progress: true })
    ).toBe(
      `  toast.success('Profile saved', {
    description: 'Changes are synced to all of your devices.',
    action: {
      label: 'Undo',
      onClick: () => toast('Change undone'),
    },
    closeButton: false,
    duration: 10000,
    progress: true,
  });
`
    );
  });

  it('writes progress only when it is turned on', () => {
    expect(call({ progress: false })).not.toContain('progress');
    expect(call({ progress: true })).toBe(
      "  toast.success('Profile saved', {\n    progress: true,\n  });\n"
    );
    expect(call({ progress: true, duration: '10s' })).toBe(
      "  toast.success('Profile saved', {\n    duration: 10000,\n    progress: true,\n  });\n"
    );
  });

  it('leaves out progress where the toast has no countdown to show', () => {
    expect(call({ progress: true, duration: 'persistent' })).toBe(
      "  toast.success('Profile saved', {\n    duration: Infinity,\n  });\n"
    );
    for (const { value } of DURATIONS) {
      expect(call({ type: 'loading', duration: value, progress: true })).toBe(
        "  toast.loading('Uploading report…');\n"
      );
    }
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
    const text = snippetText(
      snippetTokens(invocation, { position: 'top-right', theme: 'system', maxVisible: 4 })
    );
    expect(text).toContain("toast.info('Don\\'t panic', {");
    expect(text).toContain("description: 'C:\\\\temp',");
    expect(text).toContain("label: 'It\\'s fine',");
    expect(text).toContain("onClick: () => toast('Line one\\nline two'),");
  });

  it('escapes the burst message as template-literal text', () => {
    const message = 'Tick ` ${x} \\ $ { } \n\r\u2028\u2029 end';
    const invocation: ToastInvocation = { type: 'default', message };
    const text = snippetText(
      snippetTokens(invocation, { position: 'top-right', theme: 'system', maxVisible: 4 })
    );
    expect(text).toContain(
      'toast(`Tick \\` \\${x} \\\\ $ { } \\n\\r\\u2028\\u2029 end (${i} of 8)`);'
    );
    // Run, the snippet shows exactly the demo's messages.
    expect(runSnippet(text, 'showBurst').map(call => call.message)).toEqual(
      Array.from({ length: BURST_SIZE }, (_, i) => burstMessage(message, i + 1))
    );
  });

  it('marks strings, keywords and tags for highlighting', () => {
    const tokens = snippetTokens(toInvocation({ ...MINIMAL, action: true }), {
      position: 'bottom-left',
      theme: 'dark',
      maxVisible: 2,
    });
    const of = (kind: string) => tokens.filter(t => t.kind === kind).map(t => t.text);
    expect(of('string')).toEqual([
      "'react-elegant-toasts'",
      "'react-elegant-toasts/styles.css'",
      "'Profile saved'",
      "'Undo'",
      "'Change undone'",
      '`Profile saved (${i} of 8)`',
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
      'function',
      'for',
      'let',
      'export',
      'function',
      'return',
    ]);
    expect(of('literal')).toEqual(['1', '8', '2']);
    expect(of('attribute')).toEqual(['position', 'maxVisible', 'theme', 'onClick', 'onClick']);
    expect(of('tag')).toEqual([
      '<>',
      '<Toaster',
      '/>',
      '<button',
      '>',
      '</button>',
      '<button',
      '>',
      '</button>',
      '</>',
    ]);
  });

  // The toast options and the Toaster props are written independently (`does not change the toast
  // calls`, below), so each is swept in full with the other fixed, rather than as one product.
  // Syntax errors of many sources at once: one program that only parses, with no lib and no
  // module resolution. It reports what `transpileModule` reports (syntax only), without compiling
  // each source separately.
  const syntaxErrors = (sources: readonly string[]): string[] => {
    const files = new Map(sources.map((source, index) => [`/snippet-${index}.tsx`, source]));
    const options: ts.CompilerOptions = { noLib: true, noResolve: true, jsx: ts.JsxEmit.ReactJSX };
    const host = ts.createCompilerHost(options);
    host.fileExists = name => files.has(name);
    host.readFile = name => files.get(name);
    host.getSourceFile = (name, version) => {
      const source = files.get(name);
      return source === undefined
        ? undefined
        : ts.createSourceFile(name, source, version, false, ts.ScriptKind.TSX);
    };
    const program = ts.createProgram([...files.keys()], options, host);
    return [...files.keys()].flatMap(name =>
      program
        .getSyntacticDiagnostics(program.getSourceFile(name))
        .map(d => `${files.get(name)}\n→ ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`)
    );
  };

  it('reports a syntax error when there is one', () => {
    expect(syntaxErrors(['const a = (;'])).toHaveLength(1);
  });

  it('produces valid TSX for every combination of toast options', () => {
    const flags = [false, true];
    const sources: string[] = [];
    for (const { value: type } of TOAST_TYPES) {
      for (const { value: duration } of DURATIONS) {
        for (const description of flags) {
          for (const action of flags) {
            for (const closeButton of flags) {
              for (const progress of flags) {
                sources.push(
                  snippet(
                    {
                      type,
                      duration,
                      description,
                      action,
                      closeButton,
                      progress,
                      maxVisible: 6,
                      position: 'bottom-center',
                    },
                    'dark'
                  )
                );
              }
            }
          }
        }
      }
    }
    expect(sources).toHaveLength(288);
    expect(syntaxErrors(sources)).toEqual([]);
  });

  it('produces valid TSX for every combination of Toaster props', () => {
    const positions: ToastPosition[] = [
      'top-left',
      'top-center',
      'top-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ];
    const themes: ToastTheme[] = ['system', 'light', 'dark'];
    const sources: string[] = [];
    for (const maxVisible of MAX_VISIBLE_CHOICES) {
      for (const position of positions) {
        for (const theme of themes) {
          sources.push(snippet({ maxVisible, position, action: true }, theme));
        }
      }
    }
    expect(sources).toHaveLength(90);
    expect(syntaxErrors(sources)).toEqual([]);
  });
});

describe('maxVisible', () => {
  it('offers 1, 2, 3, 4 and 6, with 4 as the default', () => {
    expect(MAX_VISIBLE_CHOICES).toEqual([1, 2, 3, 4, 6]);
    expect(DEFAULT_CONFIG.maxVisible).toBe(4);
  });

  it.each([
    [1, '<Toaster maxVisible={1} />'],
    [2, '<Toaster maxVisible={2} />'],
    [3, '<Toaster maxVisible={3} />'],
    [4, '<Toaster />'],
    [6, '<Toaster maxVisible={6} />'],
  ] as const)('writes maxVisible %i on the Toaster', (maxVisible, expected) => {
    expect(snippet({ maxVisible })).toContain(`      ${expected}\n`);
  });

  it('passes the same value to the Toaster', () => {
    for (const maxVisible of MAX_VISIBLE_CHOICES) {
      expect(toToasterSettings({ ...MINIMAL, maxVisible }, 'system').maxVisible).toBe(maxVisible);
    }
  });

  it('writes the Toaster props in a fixed order', () => {
    expect(snippet({ position: 'bottom-left', maxVisible: 6 }, 'light')).toContain(
      '<Toaster position="bottom-left" maxVisible={6} theme="light" />'
    );
  });

  it('does not change the toast calls', () => {
    expect(call({ maxVisible: 1 })).toBe(call({ maxVisible: 4 }));
    expect(burstCall({ maxVisible: 1 })).toBe(burstCall({ maxVisible: 4 }));
  });
});

describe('burst', () => {
  it('numbers eight toasts in order', () => {
    expect(BURST_SIZE).toBe(8);
    expect(Array.from({ length: BURST_SIZE }, (_, i) => burstMessage('Saved', i + 1))).toEqual([
      'Saved (1 of 8)',
      'Saved (2 of 8)',
      'Saved (3 of 8)',
      'Saved (4 of 8)',
      'Saved (5 of 8)',
      'Saved (6 of 8)',
      'Saved (7 of 8)',
      'Saved (8 of 8)',
    ]);
  });

  it('writes the same call as the single toast, with the numbered message', () => {
    const config = { description: true, action: true, duration: '10s', progress: true } as const;
    const single = call(config);
    const burst = burstCall(config);
    expect(burst).toBe(
      single
        .split('\n')
        .map(line => (line ? `  ${line}` : line))
        .join('\n')
        .replace("'Profile saved'", '`Profile saved (${i} of 8)`')
    );
  });

  it('uses the current position through the Toaster, not per toast', () => {
    const text = snippet({ position: 'bottom-center' });
    expect(text).toContain('<Toaster position="bottom-center" />');
    expect(burstCall({ position: 'bottom-center' })).not.toContain('position');
  });

  it('keeps loading toasts persistent, with no duration or progress', () => {
    expect(burstCall({ type: 'loading', duration: '10s', progress: true })).toBe(
      '    toast.loading(`Uploading report… (${i} of 8)`);\n'
    );
  });

  it('writes the persistent duration on every toast of a persistent burst', () => {
    expect(burstCall({ duration: 'persistent', progress: true })).toBe(
      '    toast.success(`Profile saved (${i} of 8)`, {\n      duration: Infinity,\n    });\n'
    );
  });

  it('knows which bursts keep their slots until closed', () => {
    expect(persists({ ...MINIMAL, duration: '5s' })).toBe(false);
    expect(persists({ ...MINIMAL, duration: '10s' })).toBe(false);
    expect(persists({ ...MINIMAL, duration: 'persistent' })).toBe(true);
    for (const { value: duration } of DURATIONS) {
      expect(persists({ ...MINIMAL, type: 'loading', duration })).toBe(true);
    }
  });
});

describe("the snippet, run, makes the demo's calls", () => {
  const flags = [false, true];
  const configs: PlaygroundConfig[] = [];
  for (const { value: type } of TOAST_TYPES) {
    for (const { value: duration } of DURATIONS) {
      for (const description of flags) {
        for (const action of flags) {
          for (const closeButton of flags) {
            for (const progress of flags) {
              configs.push({
                ...MINIMAL,
                type,
                duration,
                description,
                action,
                closeButton,
                progress,
              });
            }
          }
        }
      }
    }
  }

  beforeAll(() => {
    compileAll(configs.map(config => snippet(config)));
  });

  it.each(['showToast', 'showBurst'] as const)(
    '%s, for every combination of toast options',
    entry => {
      expect(configs).toHaveLength(288);
      for (const config of configs) {
        const source = snippet(config);
        expect(normaliseSnippetCalls(runSnippet(source, entry)), JSON.stringify(config)).toEqual(
          demoCalls(config, entry === 'showBurst')
        );
      }
    }
  );
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

  it('agrees with the configuration and the snippet on progress, for every type and duration', () => {
    for (const { value: type } of TOAST_TYPES) {
      for (const { value: duration } of DURATIONS) {
        for (const progress of [false, true]) {
          const config = { ...MINIMAL, type, duration, progress };
          const shows = progress && type !== 'loading' && duration !== 'persistent';
          expect(toInvocation(config).progress, JSON.stringify(config)).toBe(
            shows ? true : undefined
          );
          expect(call(config).includes('    progress: true,\n'), JSON.stringify(config)).toBe(
            shows
          );
        }
      }
    }
  });
});

describe('progressBlocker', () => {
  it('allows progress on every finite duration of a normal type', () => {
    for (const { value: type } of TOAST_TYPES.filter(({ value }) => value !== 'loading')) {
      expect(progressBlocker({ ...MINIMAL, type, duration: '5s' })).toBeNull();
      expect(progressBlocker({ ...MINIMAL, type, duration: '10s' })).toBeNull();
    }
  });

  it('blocks progress on a persistent toast', () => {
    expect(progressBlocker({ ...MINIMAL, duration: 'persistent' })).toBe('persistent');
  });

  it('blocks progress on a loading toast, whatever the duration', () => {
    for (const { value: duration } of DURATIONS) {
      expect(progressBlocker({ ...MINIMAL, type: 'loading', duration })).toBe('loading');
    }
  });

  it('does not depend on whether progress is turned on', () => {
    expect(progressBlocker({ ...MINIMAL, progress: true })).toBeNull();
    expect(progressBlocker({ ...MINIMAL, progress: true, duration: 'persistent' })).toBe(
      'persistent'
    );
  });
});
