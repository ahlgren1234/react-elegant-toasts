import { TOASTER_DEFAULTS, type ToastInvocation, type ToasterSettings } from './playground';

// The code panel's snippet, generated from the same invocation the playground shows. It is built
// as a list of tokens, so it is highlighted without a parser or a dependency; the copied text is
// the tokens' text joined.

export type TokenKind = 'keyword' | 'string' | 'tag' | 'attribute' | 'literal';

export interface Token {
  readonly kind: TokenKind | null;
  readonly text: string;
}

const ESCAPES: Record<string, string> = {
  '\\': '\\\\',
  "'": "\\'",
  '\n': '\\n',
  '\r': '\\r',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/** A single-quoted JavaScript string literal for `value`. */
export const quote = (value: string): string =>
  `'${value.replace(/[\\'\n\r\u2028\u2029]/g, char => ESCAPES[char] ?? char)}'`;

/** A number literal, including `Infinity`. */
const numberLiteral = (value: number): string => (value === Infinity ? 'Infinity' : String(value));

export function snippetTokens(invocation: ToastInvocation, toaster: ToasterSettings): Token[] {
  const tokens: Token[] = [];
  const plain = (text: string) => tokens.push({ kind: null, text });
  const token = (kind: TokenKind, text: string) => tokens.push({ kind, text });

  token('keyword', 'import');
  plain(' { Toaster, toast } ');
  token('keyword', 'from');
  plain(' ');
  token('string', quote('react-elegant-toasts'));
  plain(';\n');
  token('keyword', 'import');
  plain(' ');
  token('string', quote('react-elegant-toasts/styles.css'));
  plain(';\n\n');

  token('keyword', 'function');
  plain(' showToast() {\n');
  plain(`  ${invocation.type === 'default' ? 'toast' : `toast.${invocation.type}`}(`);
  token('string', quote(invocation.message));

  const options: (() => void)[] = [];
  if (invocation.description !== undefined) {
    const { description } = invocation;
    options.push(() => {
      plain('    description: ');
      token('string', quote(description));
      plain(',\n');
    });
  }
  if (invocation.action) {
    const { label, result } = invocation.action;
    options.push(() => {
      plain('    action: {\n      label: ');
      token('string', quote(label));
      plain(',\n      onClick: () => toast(');
      token('string', quote(result));
      plain('),\n    },\n');
    });
  }
  if (invocation.closeButton === false) {
    options.push(() => {
      plain('    closeButton: ');
      token('literal', 'false');
      plain(',\n');
    });
  }
  if (invocation.duration !== undefined) {
    const { duration } = invocation;
    options.push(() => {
      plain('    duration: ');
      token('literal', numberLiteral(duration));
      plain(',\n');
    });
  }
  if (invocation.progress) {
    options.push(() => {
      plain('    progress: ');
      token('literal', 'true');
      plain(',\n');
    });
  }

  if (options.length === 0) {
    plain(');\n');
  } else {
    plain(', {\n');
    options.forEach(write => write());
    plain('  });\n');
  }
  plain('}\n\n');

  token('keyword', 'export');
  plain(' ');
  token('keyword', 'function');
  plain(' App() {\n  ');
  token('keyword', 'return');
  plain(' (\n    ');
  token('tag', '<>');
  plain('\n      ');
  token('tag', '<Toaster');
  // Both values are fixed unions, so they need no escaping inside a JSX attribute.
  if (toaster.position !== TOASTER_DEFAULTS.position) {
    plain(' ');
    token('attribute', 'position');
    plain('=');
    token('string', `"${toaster.position}"`);
  }
  if (toaster.theme !== TOASTER_DEFAULTS.theme) {
    plain(' ');
    token('attribute', 'theme');
    plain('=');
    token('string', `"${toaster.theme}"`);
  }
  plain(' ');
  token('tag', '/>');
  plain('\n      ');
  token('tag', '<button');
  plain(' ');
  token('attribute', 'onClick');
  plain('={showToast}');
  token('tag', '>');
  plain('Show toast');
  token('tag', '</button>');
  plain('\n    ');
  token('tag', '</>');
  plain('\n  );\n}\n');

  return tokens;
}

export const snippetText = (tokens: readonly Token[]): string =>
  tokens.map(({ text }) => text).join('');
