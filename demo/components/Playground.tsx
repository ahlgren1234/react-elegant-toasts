import { useMemo } from 'react';
import { toast, type ToastTheme } from 'react-elegant-toasts';
import { showToast } from '../utils/invoke';
import {
  DURATIONS,
  TOAST_TYPES,
  durationApplies,
  progressBlocker,
  toInvocation,
  toToasterSettings,
  type PlaygroundConfig,
} from '../utils/playground';
import { snippetTokens } from '../utils/snippet';
import { CodePanel } from './CodePanel';
import { PositionPicker } from './PositionPicker';

interface PlaygroundProps {
  config: PlaygroundConfig;
  onChange: (config: PlaygroundConfig) => void;
  theme: ToastTheme;
}

interface OptionSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** The ID of the text that explains why the switch is disabled. */
  describedBy?: string | undefined;
}

const OptionSwitch = ({
  label,
  checked,
  onChange,
  disabled = false,
  describedBy,
}: OptionSwitchProps) => (
  <label className={`d-switch d-switch--row${disabled ? ' d-switch--disabled' : ''}`}>
    <span className="d-switch__label">{label}</span>
    <input
      type="checkbox"
      role="switch"
      className="d-visually-hidden"
      checked={checked}
      disabled={disabled}
      aria-describedby={describedBy}
      onChange={e => onChange(e.target.checked)}
    />
    <span className="d-switch__track" aria-hidden="true">
      <span className="d-switch__thumb" />
    </span>
  </label>
);

export function Playground({ config, onChange, theme }: PlaygroundProps) {
  const set = <K extends keyof PlaygroundConfig>(key: K, value: PlaygroundConfig[K]) =>
    onChange({ ...config, [key]: value });

  // The toast that "Show toast" creates and the code shown are both derived from `config`.
  const invocation = useMemo(() => toInvocation(config), [config]);
  const tokens = useMemo(
    () => snippetTokens(invocation, toToasterSettings(config, theme)),
    [invocation, config, theme]
  );
  const hasDuration = durationApplies(config.type);
  const progressBlocked = progressBlocker(config);

  return (
    <section id="playground" className="d-section" aria-labelledby="playground-heading">
      <div className="d-container">
        <header className="d-section__header">
          <p className="d-eyebrow">Playground</p>
          <h2 id="playground-heading" className="d-section__title">
            Configure a toast
          </h2>
          <p className="d-section__lede">
            Every change updates the code beside it. Press <kbd>Alt</kbd>+<kbd>T</kbd> to move focus
            to the first toast, <kbd>Tab</kbd> to reach its action and close button, and{' '}
            <kbd>Escape</kbd> to return.
          </p>
        </header>

        <div className="d-playground">
          <div className="d-card d-playground__controls">
            <fieldset className="d-field">
              <legend className="d-field__legend">Type</legend>
              <div className="d-choice-grid">
                {TOAST_TYPES.map(({ value, label }) => (
                  <label key={value} className="d-choice">
                    <input
                      type="radio"
                      name="toast-type"
                      value={value}
                      className="d-visually-hidden"
                      checked={config.type === value}
                      onChange={() => set('type', value)}
                    />
                    <span className="d-choice__face">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <PositionPicker value={config.position} onChange={value => set('position', value)} />

            <fieldset className="d-field">
              <legend className="d-field__legend">Content</legend>
              <div className="d-switch-list">
                <OptionSwitch
                  label="Description"
                  checked={config.description}
                  onChange={value => set('description', value)}
                />
                <OptionSwitch
                  label="Action"
                  checked={config.action}
                  onChange={value => set('action', value)}
                />
                <OptionSwitch
                  label="Close button"
                  checked={config.closeButton}
                  onChange={value => set('closeButton', value)}
                />
              </div>
            </fieldset>

            <fieldset
              className="d-field"
              disabled={!hasDuration}
              aria-describedby={hasDuration ? undefined : 'duration-hint'}
            >
              <legend className="d-field__legend">Duration</legend>
              <div className="d-segmented d-segmented--fill">
                {DURATIONS.map(({ value, label }) => (
                  <label key={value} className="d-segmented__option">
                    <input
                      type="radio"
                      name="duration"
                      value={value}
                      className="d-visually-hidden"
                      checked={config.duration === value}
                      onChange={() => set('duration', value)}
                    />
                    <span className="d-segmented__face">{label}</span>
                  </label>
                ))}
              </div>
              {/* Shown as off while it cannot apply, as the toast and the code have no progress then;
                  the choice itself is kept for when it can. */}
              <div className="d-field__row">
                <OptionSwitch
                  label="Progress bar"
                  checked={config.progress && progressBlocked === null}
                  onChange={value => set('progress', value)}
                  disabled={progressBlocked !== null}
                  describedBy={
                    progressBlocked === 'loading'
                      ? 'duration-hint'
                      : progressBlocked === 'persistent'
                        ? 'progress-hint'
                        : undefined
                  }
                />
              </div>
              {!hasDuration && (
                <p id="duration-hint" className="d-field__hint">
                  Loading toasts stay until they are updated or dismissed, so they have no duration
                  or progress bar.
                </p>
              )}
              {progressBlocked === 'persistent' && (
                <p id="progress-hint" className="d-field__hint">
                  Persistent toasts have no countdown, so they show no progress bar.
                </p>
              )}
            </fieldset>

            <div className="d-playground__actions">
              <button
                type="button"
                className="d-button d-button--primary"
                onClick={() => showToast(invocation)}
              >
                Show toast
              </button>
              <button
                type="button"
                className="d-button d-button--secondary"
                onClick={() => toast.dismiss()}
              >
                Dismiss all
              </button>
            </div>
          </div>

          <div className="d-playground__code">
            <CodePanel tokens={tokens} fileName="App.tsx" />
          </div>
        </div>
      </div>
    </section>
  );
}
