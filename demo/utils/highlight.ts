import type { Token, TokenKind } from './snippet';

// Highlights the demo's code panels without a parser or a dependency: the lifecycle recipes'
// TypeScript, generated as text (lifecycle.ts), and the custom toast's TSX and CSS, shown from
// their source files. A tokenizer for comments, strings, template literals, keywords, literals and
// JSX tags is enough for that code, which uses no regular expressions, no nested template literals
// and no apostrophes in JSX text. Joining the tokens' text gives back the source exactly, so what is
// copied is what is shown.

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
  'interface',
  'let',
  'new',
  'return',
]);

const LITERALS = new Set(['true', 'false', 'undefined', 'null', 'Infinity']);

// One alternative per token kind, tried at each position; anything else is plain text. A tag opens
// only where no identifier comes right before it, so a type argument such as `Promise<T>` is not
// one; `>` closes a tag only inside one, outside its braces.
const PATTERN = new RegExp(
  [
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/.source,
    /('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/.source,
    /(`(?:[^`\\]|\\.)*`)/.source,
    /((?<![\w$.])<\/?(?:[A-Za-z][\w.]*(?=[\s/>])|(?=>)))/.source,
    /((?<!=)\/?>)/.source,
    /([{}])/.source,
    /(\b[A-Za-z_$][\w$-]*\b)/.source,
    /(\b\d+\b)/.source,
  ].join('|'),
  'g'
);

/** A token list that merges adjacent plain text, so it stays short. */
function tokenList() {
  const tokens: Token[] = [];
  const push = (kind: TokenKind | null, text: string) => {
    const last = tokens[tokens.length - 1];
    if (kind === null && last?.kind === null)
      tokens[tokens.length - 1] = { kind, text: last.text + text };
    else tokens.push({ kind, text });
  };
  return { tokens, push };
}

export function highlight(source: string): Token[] {
  const { tokens, push } = tokenList();
  // Inside a JSX tag, and how deep in braces within it: attributes are words at depth 0.
  let inTag = false;
  let depth = 0;
  let index = 0;
  for (const match of source.matchAll(PATTERN)) {
    const [text, comment, string, template, tagOpen, tagClose, brace, word, number] = match;
    if (match.index > index) push(null, source.slice(index, match.index));
    if (comment !== undefined) push('comment', text);
    else if (string !== undefined || template !== undefined) push('string', text);
    else if (tagOpen !== undefined && depth === 0) {
      push('tag', text);
      inTag = true;
    } else if (tagClose !== undefined && inTag && depth === 0) {
      push('tag', text);
      inTag = false;
    } else if (brace !== undefined) {
      if (inTag) depth += brace === '{' ? 1 : -1;
      push(null, text);
    } else if (word !== undefined && inTag && depth === 0) push('attribute', text);
    else if (word !== undefined && KEYWORDS.has(word)) push('keyword', text);
    else if (word !== undefined && LITERALS.has(word)) push('literal', text);
    else if (number !== undefined) push('literal', text);
    else push(null, text);
    index = match.index + text.length;
  }
  if (index < source.length) push(null, source.slice(index));
  return tokens;
}

// CSS: comments, at-rules, class selectors, property names (after `{` or `;`), custom properties,
// and numbers and hex colours.
const CSS_PATTERN = new RegExp(
  [
    /(\/\*[\s\S]*?\*\/)/.source,
    /(@[\w-]+)/.source,
    /(\.[A-Za-z_][\w-]*)/.source,
    /((?<=[{;]\s*)[A-Za-z-]+(?=\s*:)|--[\w-]+)/.source,
    /(#[0-9a-fA-F]{3,8}\b|(?<![\w-])\d+(?:\.\d+)?(?:px|ms|s|fr|%)?)/.source,
  ].join('|'),
  'g'
);

export function highlightCss(source: string): Token[] {
  const { tokens, push } = tokenList();
  let index = 0;
  for (const match of source.matchAll(CSS_PATTERN)) {
    const [text, comment, atRule, selector, property] = match;
    if (match.index > index) push(null, source.slice(index, match.index));
    if (comment !== undefined) push('comment', text);
    else if (atRule !== undefined) push('keyword', text);
    else if (selector !== undefined) push('tag', text);
    else if (property !== undefined) push('attribute', text);
    else push('literal', text);
    index = match.index + text.length;
  }
  if (index < source.length) push(null, source.slice(index));
  return tokens;
}
