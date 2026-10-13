import { resolve } from 'path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DismissReason, ToastSnapshot } from 'react-elegant-toasts';
import { highlight } from './highlight';
import {
  CALLBACK_RECIPE,
  LOG_LIMIT,
  REASON_TEXT,
  WORK_MS,
  appendEntry,
  callbacksSnippet,
  consoleArgs,
  createRecipes,
  dismissSnippet,
  formatTime,
  promiseSnippet,
  shortId,
  updateSnippet,
  type CallbackEvent,
  type LogEntry,
  type ToastApi,
} from './lifecycle';

// ---------------------------------------------------------------------------------------------
// A recording `toast`. It returns IDs in order (or none, to model a rejected call), records each
// call with its functions marked, and settles `toast.promise` as the library does: the same ID
// becomes a success or an error toast with the message for the outcome.

type Options = Record<string, unknown> | undefined;

interface Call {
  method: string;
  args: unknown[];
}

const FUNCTION = '[function]';

/** A call's arguments with functions replaced by a marker, so two recordings can be compared. */
const plain = (value: unknown): unknown => {
  if (typeof value === 'function') return FUNCTION;
  if (value instanceof Promise) return '[promise]';
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  return value;
};

function createFake({ accept = true } = {}) {
  const calls: Call[] = [];
  const options: Options[] = [];
  let next = 0;
  const create =
    (method: string) =>
    (content: unknown, opts?: Options): string | undefined => {
      calls.push({ method, args: plain(opts === undefined ? [content] : [content, opts]) as [] });
      options.push(opts);
      return accept ? `id-${++next}` : undefined;
    };
  const api = Object.assign(create('toast'), {
    success: create('success'),
    error: create('error'),
    warning: create('warning'),
    info: create('info'),
    loading: create('loading'),
    custom: create('custom'),
    dismiss: (id?: string) => {
      calls.push({ method: 'dismiss', args: id === undefined ? [] : [id] });
    },
    promise: (
      input: Promise<unknown>,
      messages: {
        loading: unknown;
        success: unknown;
        error: unknown;
      },
      opts?: Options
    ) => {
      calls.push({ method: 'promise', args: plain([input, messages, opts]) as [] });
      if (!accept) return undefined;
      const id = `id-${++next}`;
      const settle = (type: 'success' | 'error', message: unknown, value: unknown) =>
        calls.push({
          method: `settled:${type}`,
          args: [
            id,
            typeof message === 'function' ? (message as (v: unknown) => unknown)(value) : message,
          ],
        });
      void input.then(
        data => settle('success', messages.success, data),
        (error: unknown) => settle('error', messages.error, error)
      );
      return id;
    },
  });
  return { api: api as unknown as ToastApi, calls, options };
}

// ---------------------------------------------------------------------------------------------
// Running a snippet: compiled to CommonJS by TypeScript, with the recording `toast` as the package
// and a recording `console`. Nothing from the package is imported.

function runSnippet(source: string, api: ToastApi) {
  const logged: unknown[][] = [];
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports: Record<string, (...args: unknown[]) => void> = {};
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const load = new Function('require', 'exports', 'console', outputText) as (
    require: (id: string) => unknown,
    exports: object,
    console: { log: (...args: unknown[]) => void }
  ) => void;
  load(id => (id === 'react-elegant-toasts' ? { toast: api } : undefined), exports, {
    log: (...args) => logged.push(args),
  });
  return { exports, logged };
}

/** The demo's recipes and the snippet, each with its own recording `toast`. */
function bothWays(source: string, { accept = true } = {}) {
  const demoFake = createFake({ accept });
  const events: CallbackEvent[] = [];
  const recipes = createRecipes(demoFake.api, event => events.push(event));
  const snippetFake = createFake({ accept });
  const snippet = runSnippet(source, snippetFake.api);
  return { demoFake, events, recipes, snippetFake, snippet };
}

const snapshot = (id: string, content = CALLBACK_RECIPE.message): ToastSnapshot => ({
  id,
  type: 'default',
  content,
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('promise recipe', () => {
  it.each([
    [true, 'settled:success', 'Saved Website redesign'],
    [false, 'settled:error', 'The server did not respond'],
  ] as const)('save(%s): loading, then %s after the work', async (succeed, settled, message) => {
    const { demoFake, recipes, snippetFake, snippet } = bothWays(promiseSnippet());
    recipes.save(succeed);
    snippet.exports.save?.(succeed);

    const loading = {
      method: 'promise',
      args: [
        '[promise]',
        { loading: 'Saving project…', success: FUNCTION, error: FUNCTION },
        undefined,
      ],
    };
    // Nothing settles before the work is done.
    await vi.advanceTimersByTimeAsync(WORK_MS - 1);
    expect(demoFake.calls).toEqual([loading]);
    await vi.advanceTimersByTimeAsync(1);
    // The same ID the loading toast got.
    expect(demoFake.calls).toEqual([loading, { method: settled, args: ['id-1', message] }]);
    expect(snippetFake.calls).toEqual(demoFake.calls);
  });
});

describe('update-by-ID recipe', () => {
  it('creates one loading toast, then replaces it through the same ID', async () => {
    const { demoFake, recipes, snippetFake, snippet } = bothWays(updateSnippet());
    recipes.uploadReport();
    snippet.exports.uploadReport?.();
    await vi.advanceTimersByTimeAsync(WORK_MS);

    expect(demoFake.calls).toEqual([
      { method: 'loading', args: ['Uploading report…'] },
      {
        method: 'success',
        args: ['Report uploaded', { id: 'id-1', description: 'Same toast, same ID: id-1' }],
      },
    ]);
    expect(snippetFake.calls).toEqual(demoFake.calls);
  });

  it('updates nothing when the loading toast was not created', async () => {
    const { demoFake, recipes, snippetFake, snippet } = bothWays(updateSnippet(), {
      accept: false,
    });
    recipes.uploadReport();
    snippet.exports.uploadReport?.();
    await vi.advanceTimersByTimeAsync(WORK_MS);
    expect(demoFake.calls).toEqual([{ method: 'loading', args: ['Uploading report…'] }]);
    expect(snippetFake.calls).toEqual(demoFake.calls);
  });
});

describe('dismiss-by-ID recipe', () => {
  const run = (
    target: { showReminder: () => void; dismissReminder: () => void },
    fake: ReturnType<typeof createFake>
  ) => {
    target.showReminder();
    target.showReminder(); // ignored: one reminder at a time
    target.dismissReminder();
    // The library calls onDismiss once the toast has gone; the stored ID is then cleared.
    (fake.options[0]?.onDismiss as () => void)();
    target.dismissReminder(); // nothing to dismiss
    target.showReminder();
  };

  it('dismisses exactly the reminder it created, by its ID', () => {
    const { demoFake, recipes, snippetFake, snippet } = bothWays(dismissSnippet());
    run(recipes, demoFake);
    run(
      {
        showReminder: snippet.exports.showReminder!,
        dismissReminder: snippet.exports.dismissReminder!,
      },
      snippetFake
    );
    const reminder = {
      method: 'info',
      args: ['Stand-up in 10 minutes', { duration: Infinity, onDismiss: FUNCTION }],
    };
    expect(demoFake.calls).toEqual([reminder, { method: 'dismiss', args: ['id-1'] }, reminder]);
    expect(snippetFake.calls).toEqual(demoFake.calls);
  });

  it('never calls toast.dismiss() without an ID, which would close every toast', () => {
    const { demoFake, recipes, snippetFake, snippet } = bothWays(dismissSnippet(), {
      accept: false,
    });
    recipes.showReminder();
    recipes.dismissReminder();
    snippet.exports.showReminder?.();
    snippet.exports.dismissReminder?.();
    for (const { calls } of [demoFake, snippetFake]) {
      expect(calls.filter(call => call.method === 'dismiss')).toEqual([]);
    }
  });
});

describe('callbacks recipe', () => {
  const REASONS: DismissReason[] = ['timeout', 'close-button', 'swipe', 'programmatic', 'action'];

  it('creates the tracked toast with both callbacks and an action', () => {
    const { demoFake, recipes, snippetFake, snippet } = bothWays(callbacksSnippet());
    recipes.saveDraft();
    snippet.exports.saveDraft?.();
    expect(demoFake.calls).toEqual([
      {
        method: 'toast',
        args: [
          'Draft saved',
          {
            duration: 6000,
            action: { label: 'Undo', onClick: FUNCTION },
            onAutoClose: FUNCTION,
            onDismiss: FUNCTION,
          },
        ],
      },
    ]);
    expect(snippetFake.calls).toEqual(demoFake.calls);

    // The action shows its result toast, the same way in both.
    for (const fake of [demoFake, snippetFake]) {
      (fake.options[0]?.action as { onClick: () => void }).onClick();
    }
    expect(demoFake.calls[demoFake.calls.length - 1]).toEqual({
      method: 'toast',
      args: ['Draft restored'],
    });
    expect(snippetFake.calls).toEqual(demoFake.calls);
  });

  it.each(REASONS)('logs onDismiss with the reason %s, as the snippet logs it', reason => {
    const { demoFake, events, recipes, snippetFake, snippet } = bothWays(callbacksSnippet());
    recipes.saveDraft();
    snippet.exports.saveDraft?.();
    for (const fake of [demoFake, snippetFake]) {
      (fake.options[0]?.onDismiss as (s: ToastSnapshot, r: DismissReason) => void)(
        snapshot('id-1'),
        reason
      );
    }
    expect(events).toEqual([{ callback: 'onDismiss', id: 'id-1', title: 'Draft saved', reason }]);
    expect(snippet.logged).toEqual(events.map(consoleArgs));
  });

  it('logs onAutoClose, then onDismiss with timeout, in that order', () => {
    const { demoFake, events, recipes, snippetFake, snippet } = bothWays(callbacksSnippet());
    recipes.saveDraft();
    snippet.exports.saveDraft?.();
    for (const fake of [demoFake, snippetFake]) {
      const opts = fake.options[0];
      (opts?.onAutoClose as (s: ToastSnapshot) => void)(snapshot('id-1'));
      (opts?.onDismiss as (s: ToastSnapshot, r: DismissReason) => void)(
        snapshot('id-1'),
        'timeout'
      );
    }
    expect(events).toEqual([
      { callback: 'onAutoClose', id: 'id-1', title: 'Draft saved' },
      { callback: 'onDismiss', id: 'id-1', title: 'Draft saved', reason: 'timeout' },
    ]);
    expect(snippet.logged).toEqual([
      ['onAutoClose', 'id-1'],
      ['onDismiss', 'id-1', 'timeout'],
    ]);
  });

  it('dismisses the tracked toast from code by its ID, and nothing before it exists', () => {
    const { demoFake, recipes, snippetFake, snippet } = bothWays(callbacksSnippet());
    recipes.dismissDraft();
    snippet.exports.dismissDraft?.();
    recipes.saveDraft();
    snippet.exports.saveDraft?.();
    recipes.dismissDraft();
    snippet.exports.dismissDraft?.();
    expect(demoFake.calls.map(call => call.method)).toEqual(['toast', 'dismiss']);
    expect(demoFake.calls[1]).toEqual({ method: 'dismiss', args: ['id-1'] });
    expect(snippetFake.calls).toEqual(demoFake.calls);
  });

  it('logs an empty title for content that is not a string', () => {
    const events: CallbackEvent[] = [];
    const fake = createFake();
    createRecipes(fake.api, event => events.push(event)).saveDraft();
    (fake.options[0]?.onAutoClose as (s: ToastSnapshot) => void)({
      id: 'id-1',
      type: 'default',
      content: null,
    });
    expect(events).toEqual([{ callback: 'onAutoClose', id: 'id-1', title: '' }]);
  });

  it('describes every dismissal reason the library has', () => {
    expect(Object.keys(REASON_TEXT).sort()).toEqual([...REASONS].sort());
  });
});

describe('callback log', () => {
  const event = (n: number): CallbackEvent => ({
    callback: 'onDismiss',
    id: `id-${n}`,
    title: 'Draft saved',
    reason: 'close-button',
  });
  const at = new Date(2026, 9, 13, 9, 5, 7);

  it('puts the newest entry first, numbered in order', () => {
    let log: LogEntry[] = [];
    log = appendEntry(log, event(1), at);
    log = appendEntry(log, { callback: 'onAutoClose', id: 'id-2', title: 'Draft saved' }, at);
    expect(log.map(entry => [entry.seq, entry.callback, entry.id])).toEqual([
      [2, 'onAutoClose', 'id-2'],
      [1, 'onDismiss', 'id-1'],
    ]);
    expect(log[0]?.time).toBe('09:05:07');
  });

  it(`keeps at most ${LOG_LIMIT} entries, dropping the oldest`, () => {
    let log: LogEntry[] = [];
    for (let n = 1; n <= LOG_LIMIT + 2; n++) log = appendEntry(log, event(n), at);
    expect(log).toHaveLength(LOG_LIMIT);
    expect(log.map(entry => entry.seq)).toEqual([8, 7, 6, 5, 4, 3]);
  });

  it('starts again from 1 once cleared', () => {
    expect(appendEntry([], event(1), at)[0]?.seq).toBe(1);
  });

  it('formats the time and shortens IDs', () => {
    expect(formatTime(new Date(2026, 0, 1, 0, 0, 0))).toBe('00:00:00');
    expect(formatTime(new Date(2026, 0, 1, 23, 59, 9))).toBe('23:59:09');
    expect(shortId('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')).toBe('1b9d6bcd…');
    expect(shortId('ret-12')).toBe('ret-12');
  });
});

describe('snippets', () => {
  const SNIPPETS = {
    'save.ts': promiseSnippet(),
    'upload.ts': updateSnippet(),
    'reminder.ts': dismissSnippet(),
    'draft.ts': callbacksSnippet(),
  };

  it.each(Object.entries(SNIPPETS))('%s is valid TypeScript', (fileName, source) => {
    const { diagnostics } = ts.transpileModule(source, { fileName, reportDiagnostics: true });
    expect(diagnostics ?? []).toEqual([]);
  });

  it('type-check against the library’s public types', () => {
    // The package's public types from source: a compile-time check only, nothing is run.
    const root = resolve(__dirname, '../..');
    const files = Object.fromEntries(
      Object.entries(SNIPPETS).map(([name, source]) => [
        resolve(root, 'demo/__snippets__', name),
        source,
      ])
    );
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
      baseUrl: root,
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
    const diagnostics = Object.keys(files).flatMap(name =>
      ts
        .getPreEmitDiagnostics(program, program.getSourceFile(name))
        .map(d => `${name}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`)
    );
    expect(diagnostics).toEqual([]);
  });

  it('is highlighted without changing a character', () => {
    for (const source of Object.values(SNIPPETS)) {
      expect(
        highlight(source)
          .map(token => token.text)
          .join('')
      ).toBe(source);
    }
  });

  it('marks comments, strings, template literals, keywords and literals', () => {
    const tokens = highlight(
      "// note\nconst a = 'it\\'s' + `t ${b}`;\nif (x) return Infinity;\nlet n = 2000;"
    );
    const of = (kind: string) => tokens.filter(t => t.kind === kind).map(t => t.text);
    expect(of('comment')).toEqual(['// note']);
    expect(of('string')).toEqual(["'it\\'s'", '`t ${b}`']);
    expect(of('keyword')).toEqual(['const', 'if', 'return', 'let']);
    expect(of('literal')).toEqual(['Infinity', '2000']);
    // Plain text between tokens is merged into one token.
    expect(tokens.some((t, i) => t.kind === null && tokens[i + 1]?.kind === null)).toBe(false);
  });

  it('guards toast.dismiss with the stored ID', () => {
    expect(dismissSnippet()).toContain('  if (reminder) toast.dismiss(reminder);\n');
    expect(callbacksSnippet()).toContain('  if (draft) toast.dismiss(draft);\n');
  });
});
