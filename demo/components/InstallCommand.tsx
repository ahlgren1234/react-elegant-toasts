import { Fragment, useRef } from 'react';
import { INSTALL_COMMAND } from '../utils/site';
import { useCopy, type CopyState } from '../utils/useCopy';
import { CheckIcon, CopyIcon } from './icons';

const ANNOUNCEMENTS: Record<CopyState, string> = {
  idle: '',
  copied: 'Install command copied to the clipboard.',
  failed:
    'Could not copy. The command is selected: press Ctrl+C, or Command+C on a Mac, to copy it.',
};

// The install command with its copy button (P-25 S7), using the code panels' copy logic. Its one
// status is empty at rest, so only a copy is announced; a failure is also shown.
export function InstallCommand() {
  const codeRef = useRef<HTMLElement>(null);
  const { state, copy } = useCopy(INSTALL_COMMAND, codeRef);

  return (
    <div className="d-install">
      <p className="d-install__command">
        <span className="d-install__prompt" aria-hidden="true">
          $
        </span>
        {/* Each word stays whole, so a narrow screen breaks the command only at its spaces, never
            inside the package name's hyphens. The text is still exactly the command. */}
        <code ref={codeRef}>
          {INSTALL_COMMAND.split(' ').map((word, index) => (
            <Fragment key={word}>
              {index > 0 && ' '}
              <span className="d-install__word">{word}</span>
            </Fragment>
          ))}
        </code>
      </p>
      <button type="button" className="d-copy-button" onClick={() => void copy()}>
        {state === 'copied' ? <CheckIcon /> : <CopyIcon />}
        <span>
          {state === 'copied' ? 'Copied' : 'Copy'}{' '}
          <span className="d-visually-hidden">the install command</span>
        </span>
      </button>
      <p className={state === 'failed' ? 'd-install__status' : 'd-visually-hidden'} role="status">
        {ANNOUNCEMENTS[state]}
      </p>
    </div>
  );
}
