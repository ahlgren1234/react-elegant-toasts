import {
  BURST_SIZE,
  TOASTER_DEFAULTS,
  type ToastInvocation,
  type ToasterSettings,
} from './playground';

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

const TEMPLATE_ESCAPES: Record<string, string> = {
  '\\': '\\\\',
  '`': '\\`',
  '${': '\\${',
  '\n': '\\n',
  '\r': '\\r',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/** `value` as the literal text of a template literal: no character in it ends or interpolates. */
const templateText = (value: string): string =>
  value.replace(/\\|`|\$\{|[\n\r\u2028\u2029]/g, match => TEMPLATE_ESCAPES[match] ?? match);

/** A number literal, including `Infinity`. */
const numberLiteral = (value: number): string => (value === Infinity ? 'Infinity' : String(value));

export function snippetTokens(invocation: ToastInvocation, toaster: ToasterSettings): Token[] {
  const tokens: Token[] = [];
  const plain = (text: string) => tokens.push({ kind: null, text });
  const token = (kind: TokenKind, text: string) => tokens.push({ kind, text });

  // One toast call at `indent`, with the invocation's options. `message` writes its first argument,
  // so the single toast and the burst share everything else.
  const call = (indent: string, message: () => void) => {
    const inner = `${indent}  `;
    plain(`${indent}${invocation.type === 'default' ? 'toast' : `toast.${invocation.type}`}(`);
    message();

    const options: (() => void)[] = [];
    if (invocation.description !== undefined) {
      const { description } = invocation;
      options.push(() => {
        plain(`${inner}description: `);
        token('string', quote(description));
        plain(',\n');
      });
    }
    if (invocation.action) {
      const { label, result } = invocation.action;
      options.push(() => {
        plain(`${inner}action: {\n${inner}  label: `);
        token('string', quote(label));
        plain(`,\n${inner}  onClick: () => toast(`);
        token('string', quote(result));
        plain(`),\n${inner}},\n`);
      });
    }
    if (invocation.closeButton === false) {
      options.push(() => {
        plain(`${inner}closeButton: `);
        token('literal', 'false');
        plain(',\n');
      });
    }
    if (invocation.duration !== undefined) {
      const { duration } = invocation;
      options.push(() => {
        plain(`${inner}duration: `);
        token('literal', numberLiteral(duration));
        plain(',\n');
      });
    }
    if (invocation.progress) {
      options.push(() => {
        plain(`${inner}progress: `);
        token('literal', 'true');
        plain(',\n');
      });
    }

    if (options.length === 0) {
      plain(');\n');
    } else {
      plain(', {\n');
      options.forEach(write => write());
      plain(`${indent}});\n`);
    }
  };

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
  call('  ', () => token('string', quote(invocation.message)));
  plain('}\n\n');

  // The burst: the same toast, numbered as burstMessage() numbers it.
  token('keyword', 'function');
  plain(' showBurst() {\n  ');
  token('keyword', 'for');
  plain(' (');
  token('keyword', 'let');
  plain(' i = ');
  token('literal', '1');
  plain('; i <= ');
  token('literal', String(BURST_SIZE));
  plain('; i++) {\n');
  call('    ', () =>
    token('string', `\`${templateText(invocation.message)} (\${i} of ${BURST_SIZE})\``)
  );
  plain('  }\n}\n\n');

  token('keyword', 'export');
  plain(' ');
  token('keyword', 'function');
  plain(' App() {\n  ');
  token('keyword', 'return');
  plain(' (\n    ');
  token('tag', '<>');
  plain('\n      ');
  token('tag', '<Toaster');
  // The position and theme are fixed unions, so they need no escaping inside a JSX attribute.
  if (toaster.position !== TOASTER_DEFAULTS.position) {
    plain(' ');
    token('attribute', 'position');
    plain('=');
    token('string', `"${toaster.position}"`);
  }
  if (toaster.maxVisible !== TOASTER_DEFAULTS.maxVisible) {
    plain(' ');
    token('attribute', 'maxVisible');
    plain('={');
    token('literal', String(toaster.maxVisible));
    plain('}');
  }
  if (toaster.theme !== TOASTER_DEFAULTS.theme) {
    plain(' ');
    token('attribute', 'theme');
    plain('=');
    token('string', `"${toaster.theme}"`);
  }
  plain(' ');
  token('tag', '/>');
  const button = (handler: string, label: string) => {
    plain('\n      ');
    token('tag', '<button');
    plain(' ');
    token('attribute', 'onClick');
    plain(`={${handler}}`);
    token('tag', '>');
    plain(label);
    token('tag', '</button>');
  };
  button('showToast', 'Show toast');
  button('showBurst', 'Show a burst');
  plain('\n    ');
  token('tag', '</>');
  plain('\n  );\n}\n');

  return tokens;
}

export const snippetText = (tokens: readonly Token[]): string =>
  tokens.map(({ text }) => text).join('');
