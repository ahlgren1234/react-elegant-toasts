import { useEffect, useRef, useState } from 'react';
import { snippetText, type Token } from '../utils/snippet';
import { CheckIcon, CopyIcon } from './icons';

type CopyState = 'idle' | 'copied' | 'failed';

const ANNOUNCEMENTS: Record<CopyState, string> = {
  idle: '',
  copied: 'Code copied to the clipboard.',
  failed: 'Could not copy. The code is selected: press Ctrl+C, or Command+C on a Mac, to copy it.',
};

// How long each outcome stays shown. The failure stays longer, as it asks for an action.
const FEEDBACK_MS = { copied: 2000, failed: 6000 } as const;

interface CodePanelProps {
  tokens: readonly Token[];
  fileName: string;
}

export function CodePanel({ tokens, fileName }: CodePanelProps) {
  const codeRef = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    clearTimeout(timer.current);
    let next: 'copied' | 'failed';
    try {
      // `navigator.clipboard` is missing outside a secure context, so this can throw before the
      // write as well as reject.
      await navigator.clipboard.writeText(snippetText(tokens));
      next = 'copied';
    } catch {
      // Leave the code selected, so it can be copied by hand.
      if (codeRef.current) window.getSelection()?.selectAllChildren(codeRef.current);
      next = 'failed';
    }
    setState(next);
    timer.current = setTimeout(() => setState('idle'), FEEDBACK_MS[next]);
  };

  return (
    <figure className="d-code-panel">
      <figcaption className="d-code-panel__bar">
        <span className="d-code-panel__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="d-code-panel__file">{fileName}</span>
        <button type="button" className="d-copy-button" onClick={() => void copy()}>
          {state === 'copied' ? <CheckIcon /> : <CopyIcon />}
          <span>{state === 'copied' ? 'Copied' : 'Copy code'}</span>
        </button>
      </figcaption>
      {/* Always rendered, so a change of its text is announced. The failure is shown as well. */}
      <p
        className={state === 'failed' ? 'd-code-panel__status' : 'd-visually-hidden'}
        role="status"
      >
        {ANNOUNCEMENTS[state]}
      </p>
      {/* Focusable so keyboard users can scroll it horizontally. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <pre className="d-code-panel__pre" tabIndex={0} aria-label={`Code example, ${fileName}`}>
        <code ref={codeRef}>
          {tokens.map((token, index) =>
            token.kind ? (
              <span key={index} className={`d-code--${token.kind}`}>
                {token.text}
              </span>
            ) : (
              token.text
            )
          )}
        </code>
      </pre>
    </figure>
  );
}
