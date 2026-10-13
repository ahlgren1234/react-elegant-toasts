import { REASON_TEXT, shortId, type LogEntry } from '../utils/lifecycle';

// The callbacks recipe's log. Not a live region: the toasts are already announced, and the log is
// there to be read. It uses no runtime code from the package, so it is tested as a component.

// The spaces between the parts are real text, so the entry reads as words, not one run, when the
// grid's columns are not seen. The ID is isolated in <bdi>: it is left-to-right text, and in a
// right-to-left page its "…" would otherwise move to the wrong end.
const LogItem = ({ entry }: { entry: LogEntry }) => (
  <li className="d-log__entry">
    <span className="d-log__time">{entry.time}</span>{' '}
    <span className="d-log__event">
      <code className="d-log__callback">{entry.callback}</code>
      {entry.callback === 'onDismiss' && (
        <>
          {' '}
          <code className="d-log__reason">{entry.reason}</code>
        </>
      )}
    </span>{' '}
    <span className="d-log__detail">
      {entry.callback === 'onDismiss'
        ? `Removed after ${REASON_TEXT[entry.reason]}.`
        : 'The duration ran out; the toast starts to leave.'}{' '}
      {/* A no-break space and nowrap keep the label with its value when the line wraps. */}
      <span className="d-log__ref">
        ID{'\u00a0'}
        <bdi title={entry.id}>{shortId(entry.id)}</bdi>
      </span>
    </span>
  </li>
);

interface CallbackLogProps {
  entries: readonly LogEntry[];
  onClear: () => void;
}

export const CallbackLog = ({ entries, onClear }: CallbackLogProps) => (
  <div className="d-log">
    <div className="d-log__bar">
      <h4 id="callback-log-heading" className="d-log__title">
        Callback log
      </h4>
      <button
        type="button"
        className="d-button d-button--ghost d-button--small"
        onClick={onClear}
        disabled={entries.length === 0}
      >
        Clear
      </button>
    </div>
    {entries.length === 0 ? (
      <p className="d-log__empty">No callbacks yet.</p>
    ) : (
      <ol className="d-log__list" aria-labelledby="callback-log-heading">
        {entries.map(entry => (
          <LogItem key={entry.seq} entry={entry} />
        ))}
      </ol>
    )}
  </div>
);
