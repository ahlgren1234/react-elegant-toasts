import type { ReactNode } from 'react';

// A representative usage example of the public API. It is static: the code generated from the
// playground's settings replaces it in a later slice, with its own tested tokenizer.
const USAGE = `import { Toaster, toast } from 'react-elegant-toasts';
import 'react-elegant-toasts/styles.css';

export function App() {
  return (
    <>
      <Toaster position="bottom-right" />
      <button
        onClick={() =>
          toast.success('Profile saved', {
            description: 'Changes are synced to all of your devices.',
            action: {
              label: 'Undo',
              onClick: () => toast('Change undone'),
            },
          })
        }
      >
        Save
      </button>
    </>
  );
}`;

// Strings, keywords, JSX tags and JSX attribute names, enough for the fixed example above. `=>` is
// matched so that its `>` is not taken for the end of a tag.
const TOKEN =
  /('[^']*'|"[^"]*")|\b(import|from|export|function|return)\b|(=>)|(<\/?[A-Za-z]*|\/?>)|\b(\w+)(?==)/g;

function highlight(source: string) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    const [text, string, keyword, , tag, attribute] = match;
    if (match.index > last) parts.push(source.slice(last, match.index));
    const kind = string
      ? 'string'
      : keyword
        ? 'keyword'
        : tag
          ? 'tag'
          : attribute
            ? 'attribute'
            : undefined;
    parts.push(
      kind ? (
        <span key={match.index} className={`d-code--${kind}`}>
          {text}
        </span>
      ) : (
        text
      )
    );
    last = match.index + text.length;
  }
  parts.push(source.slice(last));
  return parts;
}

export const CodePanel = () => (
  <figure className="d-code-panel">
    <figcaption className="d-code-panel__bar">
      <span className="d-code-panel__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="d-code-panel__file">App.tsx</span>
    </figcaption>
    {/* Focusable so keyboard users can scroll it horizontally. */}
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
    <pre className="d-code-panel__pre" tabIndex={0} aria-label="Usage example, App.tsx">
      <code>{highlight(USAGE)}</code>
    </pre>
  </figure>
);
