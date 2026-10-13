import { useId, useState } from 'react';
import { toast, type ToastOptions, type ToastPosition } from 'react-elegant-toasts';
import { CodePanel } from './CodePanel';
import { POSITIONS, PositionPicker } from './PositionPicker';

interface PlaygroundProps {
  position: ToastPosition;
  onPositionChange: (position: ToastPosition) => void;
}

interface OptionSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const OptionSwitch = ({ label, checked, onChange }: OptionSwitchProps) => (
  <label className="d-switch d-switch--row">
    <span className="d-switch__label">{label}</span>
    <input
      type="checkbox"
      role="switch"
      className="d-visually-hidden"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
    />
    <span className="d-switch__track" aria-hidden="true">
      <span className="d-switch__thumb" />
    </span>
  </label>
);

// The playground shell: it drives the toast API with a few options. The full configuration model
// and the code generated from it arrive in a later slice.
export function Playground({ position, onPositionChange }: PlaygroundProps) {
  const [description, setDescription] = useState(true);
  const [action, setAction] = useState(false);
  const [closeButton, setCloseButton] = useState(true);
  const [persistent, setPersistent] = useState(false);
  const typesId = useId();
  const moreId = useId();

  const options = (at: ToastPosition = position): ToastOptions => ({
    position: at,
    closeButton,
    ...(persistent ? { duration: Infinity } : {}),
    ...(description ? { description: 'Changes are synced to all of your devices.' } : {}),
    ...(action ? { action: { label: 'Undo', onClick: () => undefined } } : {}),
  });

  const custom = (withClose: boolean) => {
    const id = `custom-${Date.now()}`;
    toast.custom(
      <div className="demo-custom-toast">
        <span className="demo-custom-avatar" aria-hidden="true">
          AL
        </span>
        <div>
          <strong>Ada Lovelace invited you</strong>
          <p>Join the Analytics workspace to view shared reports.</p>
          <button type="button" onClick={() => toast.dismiss(id)}>
            View invitation
          </button>
        </div>
      </div>,
      {
        id,
        position,
        closeButton: withClose,
        // The consumer's foreground on the toast root, which the library close button inherits.
        className: 'demo-custom-root',
        ...(persistent ? { duration: Infinity } : {}),
      }
    );
  };

  return (
    <section id="playground" className="d-section" aria-labelledby="playground-heading">
      <div className="d-container">
        <header className="d-section__header">
          <p className="d-eyebrow">Playground</p>
          <h2 id="playground-heading" className="d-section__title">
            Try every toast
          </h2>
          <p className="d-section__lede">
            Pick a position and a few options, then fire a toast. Press <kbd>Alt</kbd>+<kbd>T</kbd>{' '}
            to move focus to the first toast, <kbd>Tab</kbd> to reach its action and close button,
            and <kbd>Escape</kbd> to return.
          </p>
        </header>

        <div className="d-playground">
          <div className="d-card d-playground__controls">
            <PositionPicker value={position} onChange={onPositionChange} />

            <fieldset className="d-field">
              <legend className="d-field__legend">Options</legend>
              <div className="d-switch-list">
                <OptionSwitch label="Description" checked={description} onChange={setDescription} />
                <OptionSwitch label="Action" checked={action} onChange={setAction} />
                <OptionSwitch
                  label="Close button"
                  checked={closeButton}
                  onChange={setCloseButton}
                />
                <OptionSwitch label="Persistent" checked={persistent} onChange={setPersistent} />
              </div>
            </fieldset>

            <div className="d-field" role="group" aria-labelledby={typesId}>
              <p id={typesId} className="d-field__legend">
                Types
              </p>
              <div className="d-button-grid">
                <button
                  type="button"
                  className="d-button d-button--secondary"
                  onClick={() => toast('Event has been created', options())}
                >
                  Default
                </button>
                <button
                  type="button"
                  className="d-button d-button--secondary"
                  onClick={() => toast.success('Profile saved', options())}
                >
                  Success
                </button>
                <button
                  type="button"
                  className="d-button d-button--secondary"
                  onClick={() => toast.error('Payment failed', options())}
                >
                  Error
                </button>
                <button
                  type="button"
                  className="d-button d-button--secondary"
                  onClick={() => toast.warning('Storage almost full', options())}
                >
                  Warning
                </button>
                <button
                  type="button"
                  className="d-button d-button--secondary"
                  onClick={() => toast.info('New version available', options())}
                >
                  Info
                </button>
                <button
                  type="button"
                  className="d-button d-button--secondary"
                  onClick={() => toast.loading('Uploading report…', options())}
                >
                  Loading
                </button>
                <button
                  type="button"
                  className="d-button d-button--secondary"
                  onClick={() =>
                    toast.promise(
                      () => new Promise<void>(resolve => setTimeout(resolve, 2000)),
                      { loading: 'Publishing…', success: 'Published', error: 'Could not publish' },
                      options()
                    )
                  }
                >
                  Promise
                </button>
              </div>
            </div>

            <div className="d-field" role="group" aria-labelledby={moreId}>
              <p id={moreId} className="d-field__legend">
                More examples
              </p>
              <div className="d-button-grid">
                <button
                  type="button"
                  className="d-button d-button--secondary"
                  onClick={() => custom(false)}
                >
                  Custom
                </button>
                <button
                  type="button"
                  className="d-button d-button--secondary"
                  onClick={() => custom(true)}
                >
                  Custom + close
                </button>
                <button
                  type="button"
                  className="d-button d-button--secondary"
                  onClick={() => {
                    toast.info('First (oldest)', options());
                    toast.success('Second', options());
                    toast.error('Third (newest)', options());
                  }}
                >
                  Stack of three
                </button>
                <button
                  type="button"
                  className="d-button d-button--secondary"
                  onClick={() => {
                    toast('Default: event created', options());
                    toast.success('Success: profile saved', options());
                    toast.error('Error: payment failed', options());
                    toast.warning('Warning: storage almost full', options());
                    toast.info('Info: new version available', options());
                    toast.loading('Loading: uploading report', options());
                  }}
                >
                  All types
                </button>
                <button
                  type="button"
                  className="d-button d-button--secondary"
                  onClick={() =>
                    POSITIONS.forEach(({ value }) => toast.success(value, options(value)))
                  }
                >
                  All six positions
                </button>
              </div>
            </div>

            <button
              type="button"
              className="d-button d-button--ghost d-playground__dismiss"
              onClick={() => toast.dismiss()}
            >
              Dismiss all toasts
            </button>
          </div>

          <div className="d-playground__code">
            <CodePanel />
          </div>
        </div>
      </div>
    </section>
  );
}
