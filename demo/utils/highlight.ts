import type { Token, TokenKind } from './snippet';

// Highlights the lifecycle recipes' TypeScript, which is generated as text (lifecycle.ts). The
// recipes use no JSX, no regular expressions and no nested template literals, so a tokenizer for
// comments, strings, template literals, keywords and literals is enough. Joining the tokens' text
// gives back the source exactly, so what is copied is what is shown.

const KEYWORDS = new Set([
  'as',
  'const',
  'else',
  'export',
  'from',
  'function',
  'if',
  'import',
  'instanceof',
  'let',
  'new',
  'return',
]);

const LITERALS = new Set(['true', 'false', 'undefined', 'null', 'Infinity']);

// One alternative per token kind, tried at each position; anything else is plain text.
const PATTERN =
  /(\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*')|(`(?:[^`\\]|\\.)*`)|(\b[A-Za-z_$][\w$]*\b)|(\b\d+\b)/g;

export function highlight(source: string): Token[] {
  const tokens: Token[] = [];
  const push = (kind: TokenKind | null, text: string) => {
    const last = tokens[tokens.length - 1];
    // Adjacent plain text is merged, so the token list stays short.
    if (kind === null && last?.kind === null)
      tokens[tokens.length - 1] = { kind, text: last.text + text };
    else tokens.push({ kind, text });
  };
  let index = 0;
  for (const match of source.matchAll(PATTERN)) {
    const [text, comment, string, template, word, number] = match;
    if (match.index > index) push(null, source.slice(index, match.index));
    if (comment !== undefined) push('comment', text);
    else if (string !== undefined || template !== undefined) push('string', text);
    else if (word !== undefined && KEYWORDS.has(word)) push('keyword', text);
    else if (word !== undefined && LITERALS.has(word)) push('literal', text);
    else if (number !== undefined) push('literal', text);
    else push(null, text);
    index = match.index + text.length;
  }
  if (index < source.length) push(null, source.slice(index));
  return tokens;
}
