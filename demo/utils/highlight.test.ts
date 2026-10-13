import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { highlight, highlightCss } from './highlight';
import { callbacksSnippet, dismissSnippet, promiseSnippet, updateSnippet } from './lifecycle';
import type { Token } from './snippet';

const COMPONENT = readFileSync(resolve(__dirname, '../recipes/InviteToast.tsx'), 'utf8');
const STYLES = readFileSync(resolve(__dirname, '../recipes/invite-toast.css'), 'utf8');

const text = (tokens: readonly Token[]) => tokens.map(token => token.text).join('');
const of = (tokens: readonly Token[], kind: string) =>
  tokens.filter(token => token.kind === kind).map(token => token.text);

describe('highlight, for TSX', () => {
  it('gives back the custom toast source exactly', () => {
    expect(text(highlight(COMPONENT))).toBe(COMPONENT);
  });

  // The arrow inside the attribute's braces does not end the tag.
  it('marks tags, attributes, comments and both kinds of string', () => {
    const tokens = highlight(
      '/** doc */\nconst a = (\n  <div className="x" onClick={() => go(b)}>\n    Hi{\' \'}\n    <Icon size={2} />\n  </div>\n);'
    );
    expect(of(tokens, 'comment')).toEqual(['/** doc */']);
    expect(of(tokens, 'tag')).toEqual(['<div', '>', '<Icon', '/>', '</div', '>']);
    expect(of(tokens, 'attribute')).toEqual(['className', 'onClick', 'size']);
    expect(of(tokens, 'string')).toEqual(['"x"', "' '"]);
  });

  it('marks no tag in TypeScript, so the lifecycle snippets are highlighted as before', () => {
    for (const source of [
      promiseSnippet(),
      updateSnippet(),
      dismissSnippet(),
      callbacksSnippet(),
    ]) {
      const tokens = highlight(source);
      expect(of(tokens, 'tag')).toEqual([]);
      expect(of(tokens, 'attribute')).toEqual([]);
    }
    expect(of(highlight('let p: Promise<{ a: T }> = f<T>(x => x > 1 && a < b);'), 'tag')).toEqual(
      []
    );
  });
});

describe('highlightCss', () => {
  it('gives back the custom toast styles exactly', () => {
    expect(text(highlightCss(STYLES))).toBe(STYLES);
  });

  it('marks comments, at-rules, classes, properties and values', () => {
    const tokens = highlightCss(
      '/* note */\n.card:hover {\n  padding: 14px;\n  color: var(--ret-text);\n  background: #6d28d9;\n}\n@media (x: y) {\n  .card {\n    gap: 2fr;\n  }\n}\n'
    );
    expect(of(tokens, 'comment')).toEqual(['/* note */']);
    expect(of(tokens, 'keyword')).toEqual(['@media']);
    expect(of(tokens, 'tag')).toEqual(['.card', '.card']);
    expect(of(tokens, 'attribute')).toEqual([
      'padding',
      'color',
      '--ret-text',
      'background',
      'gap',
    ]);
    expect(of(tokens, 'literal')).toEqual(['14px', '#6d28d9', '2fr']);
  });
});
