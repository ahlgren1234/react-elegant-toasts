import type { ToastPosition } from 'react-elegant-toasts';

const POSITIONS = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom center' },
  { value: 'bottom-right', label: 'Bottom right' },
] as const satisfies readonly { value: ToastPosition; label: string }[];

interface PositionPickerProps {
  value: ToastPosition;
  onChange: (position: ToastPosition) => void;
}

// A map of the screen. Toast positions are physical and do not mirror in RTL (§20), so the map is
// laid out left to right whatever the document's direction.
export const PositionPicker = ({ value, onChange }: PositionPickerProps) => (
  <fieldset className="d-field">
    <legend className="d-field__legend">Position</legend>
    <div className="d-position-map" dir="ltr">
      {POSITIONS.map(position => (
        <label key={position.value} className="d-position">
          <input
            type="radio"
            name="position"
            value={position.value}
            className="d-visually-hidden"
            checked={value === position.value}
            onChange={() => onChange(position.value)}
          />
          <span className="d-position__glyph" aria-hidden="true" />
          <span className="d-position__label">{position.label}</span>
        </label>
      ))}
    </div>
    <p className="d-field__hint">Positions are physical: they stay put when the page is RTL.</p>
  </fieldset>
);
