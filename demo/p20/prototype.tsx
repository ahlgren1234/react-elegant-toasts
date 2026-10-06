// P-20 D1: demo-only visual prototype of the progress indicator (decision 6). Static cards in the
// production toast markup, styled by the production stylesheet, with three candidate progress
// treatments drawn by `prototype.css`. It runs no timer: each bar is a paused CSS animation placed
// by a negative delay, as production will place it from `remaining`. Not the P-25 demo; removed
// by S5 at the latest. Open the demo with `?p20`.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { CLOSE_ICON, typeIcon } from '../../src/react/icons';
import type { ToastType } from '../../src';
import './prototype.css';

type Candidate = 'a' | 'b' | 'c' | 'b-single';
type Theme = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';

const CANDIDATES: readonly { id: Candidate; title: string; hint: string }[] = [
  {
    id: 'a',
    title: 'Candidate A — inset',
    hint: 'One bar inside the bottom padding, inset 12px from both sides, clear of the corners. The bar itself scales.',
  },
  {
    id: 'b',
    title: 'Candidate B — full-width safe corners',
    hint: "A static full-width strip on the card's bottom edge, clipped to the card's inner corner curve; only the fill inside it scales. No track.",
  },
  {
    id: 'c',
    title: 'Candidate C — track + fill',
    hint: 'The same clipped strip as B, showing a neutral track (--ret-border) behind the fill.',
  },
];

const REJECTED: { id: Candidate; title: string; hint: string } = {
  id: 'b-single',
  title: 'B′ — single element (rejected, for explanation)',
  hint: 'One full-width element clipped to the corner curve. The clip scales with the bar, so near empty its start corner narrows and paints over the card corner. Not viable.',
};

const STATES = [1, 0.65, 0.3, 0.05] as const;
const DURATION = 10000;

function Progress({ candidate, fraction }: { candidate: Candidate; fraction: number }) {
  // A paused animation at `-(duration − remaining)`, as production positions a held bar.
  const timing = { animationDelay: `${-(1 - fraction) * DURATION}ms` };
  if (candidate === 'a' || candidate === 'b-single') {
    return (
      <div
        className={`p20-progress p20-moving p20-${candidate}`}
        style={timing}
        aria-hidden="true"
      />
    );
  }
  return (
    <div className={`p20-progress p20-strip p20-${candidate}`} aria-hidden="true">
      <span className="p20-fill p20-moving" style={timing} />
    </div>
  );
}

interface CardProps {
  readonly candidate: Candidate;
  readonly fraction: number;
  readonly type: ToastType;
  readonly title: string;
  readonly description?: string;
  readonly action?: string;
  readonly close?: boolean;
}

function Card({ candidate, fraction, type, title, description, action, close }: CardProps) {
  const icon = typeIcon(type);
  return (
    <li
      className={`ret-toast ret-toast--${type} p20-card`}
      data-phase="visible"
      data-position="top-right"
    >
      {icon && (
        <span className="ret-toast__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="ret-toast__content">
        <div className="ret-toast__title">{title}</div>
        {description && <div className="ret-toast__description">{description}</div>}
      </div>
      {action && (
        <button type="button" className="ret-toast__action">
          {action}
        </button>
      )}
      {close && (
        <button type="button" className="ret-toast__close" aria-label="Close notification">
          {CLOSE_ICON}
        </button>
      )}
      <Progress candidate={candidate} fraction={fraction} />
    </li>
  );
}

const WRAPPED =
  'Your export of 1,284 records finished, but 3 rows were skipped because their dates could not be parsed.';

function Column({ id: candidate, title, hint }: (typeof CANDIDATES)[number]) {
  const Label = ({ children }: { children: string }) => <li className="p20-label">{children}</li>;
  return (
    <div className="p20-column">
      <h3>{title}</h3>
      <p className="p20-hint">{hint}</p>
      <ol className="p20-stack">
        <Label>States: 100 / 65 / 30 / 5%</Label>
        {STATES.map(fraction => (
          <Card
            key={fraction}
            candidate={candidate}
            fraction={fraction}
            type="success"
            title={`Profile saved (${Math.round(fraction * 100)}%)`}
            close
          />
        ))}
        <Label>Content at 30%</Label>
        <Card
          candidate={candidate}
          fraction={0.3}
          type="warning"
          title="Export finished with warnings"
          description={WRAPPED}
          close
        />
        <Card
          candidate={candidate}
          fraction={0.3}
          type="default"
          title="Event has been created"
          action="Undo"
        />
        <Card
          candidate={candidate}
          fraction={0.3}
          type="info"
          title="New version available"
          description="Reload to update."
          close
        />
        <Card
          candidate={candidate}
          fraction={0.3}
          type="error"
          title="Payment failed"
          description="Your card was declined."
          action="Retry"
          close
        />
        <Label>
          Visual stress case only: loading icon geometry (loading toasts get no progress)
        </Label>
        <Card
          candidate={candidate}
          fraction={0.3}
          type="loading"
          title="Uploading report…"
          description="Spinner and icon composition check."
          close
        />
        <Label>Near empty at 5%, with action and close</Label>
        <Card
          candidate={candidate}
          fraction={0.05}
          type="error"
          title="Payment failed"
          description="Your card was declined."
          action="Retry"
          close
        />
      </ol>
      <div dir="rtl">
        <ol className="p20-stack">
          <Label>RTL at 65% and 5%</Label>
          <Card
            candidate={candidate}
            fraction={0.65}
            type="success"
            title="تم حفظ الملف الشخصي"
            description="Changes are synced to all of your devices."
            action="Undo"
            close
          />
          <Card candidate={candidate} fraction={0.05} type="info" title="إصدار جديد متاح" close />
        </ol>
      </div>
    </div>
  );
}

/** WCAG contrast of two computed `rgb()` colours. */
function contrast(a: string, b: string): number | null {
  const lum = (value: string) => {
    const channels = value
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    if (!channels || channels.length < 3) return null;
    const [r, g, b] = channels.map(c => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [x, y] = [lum(a), lum(b)];
  if (x === null || y === null) return null;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function Board({
  theme,
  height,
  colour,
  direction,
  rejected,
}: {
  theme: Theme;
  height: string;
  colour: string;
  direction: Direction;
  rejected: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [ratios, setRatios] = useState('');
  useEffect(() => {
    const section = ref.current;
    const card = section?.querySelector('.ret-toast');
    const fill = section?.querySelector('.p20-fill');
    const track = section?.querySelector('.p20-c');
    if (!card || !fill || !track) return;
    const surface = getComputedStyle(card).backgroundColor;
    const bar = getComputedStyle(fill).backgroundColor;
    const behind = getComputedStyle(track).backgroundColor;
    const format = (value: number | null) => (value === null ? '?' : `${value.toFixed(2)}:1`);
    setRatios(
      `fill ${bar} vs surface ${surface}: ${format(contrast(bar, surface))}; fill vs track ${behind}: ${format(contrast(bar, behind))}`
    );
  }, [theme, colour]);
  return (
    <section
      ref={ref}
      className="ret-toaster p20-tokens p20-board-surface"
      data-theme={theme}
      data-surface={theme}
      data-height={height}
      data-colour={colour}
      dir={direction}
      aria-label={`${theme} theme`}
    >
      <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>
        {theme === 'light' ? 'Light' : 'Dark'} theme
      </h2>
      <p className="p20-contrast">{ratios}</p>
      <div className="p20-board">
        {[...CANDIDATES, ...(rejected ? [REJECTED] : [])].map(candidate => (
          <Column key={candidate.id} {...candidate} />
        ))}
      </div>
    </section>
  );
}

function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}): ReactElement {
  return (
    <fieldset>
      <legend>{legend}</legend>
      {options.map(([option, label]) => (
        <label key={option}>
          <input
            type="radio"
            name={legend}
            checked={value === option}
            onChange={() => onChange(option)}
          />{' '}
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function P20Prototype() {
  const [themes, setThemes] = useState<'both' | Theme>('both');
  const [height, setHeight] = useState('3');
  const [colour, setColour] = useState('muted');
  const [direction, setDirection] = useState<Direction>('ltr');
  const [roundEnds, setRoundEnds] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [run, setRun] = useState(0);

  return (
    <section className="p20-page" aria-labelledby="p20-heading">
      <h2 id="p20-heading">P-20 D1 progress prototype</h2>
      <p className="demo-note">
        Demo-only visual comparison (P-20 decision 6) on the production stylesheet. Static held
        states; no timer runs. Pick a placement and corner treatment, a height and a neutral colour.
        No candidate is pre-selected. <a href="?">Back to the demo</a>
      </p>
      <div className="p20-controls">
        <Choice
          legend="Themes"
          value={themes}
          options={[
            ['both', 'Light and dark'],
            ['light', 'Light'],
            ['dark', 'Dark'],
          ]}
          onChange={setThemes}
        />
        <Choice
          legend="Height (--ret-progress-height)"
          value={height}
          options={[
            ['2', '2px'],
            ['3', '3px'],
            ['4', '4px'],
          ]}
          onChange={setHeight}
        />
        <Choice
          legend="Colour (--ret-progress, neutral)"
          value={colour}
          options={[
            ['muted', 'Muted text (#52525b / #a1a1aa)'],
            ['soft', 'Soft (#71717a / #8e8e98)'],
            ['text', 'Text (#18181b / #fafafa)'],
          ]}
          onChange={setColour}
        />
        <Choice
          legend="Direction"
          value={direction}
          options={[
            ['ltr', 'LTR'],
            ['rtl', 'RTL (whole board)'],
          ]}
          onChange={setDirection}
        />
        <fieldset>
          <legend>Options</legend>
          <label>
            <input
              type="checkbox"
              checked={roundEnds}
              onChange={e => setRoundEnds(e.target.checked)}
            />{' '}
            A: rounded ends
          </label>
          <label>
            <input
              type="checkbox"
              checked={rejected}
              onChange={e => setRejected(e.target.checked)}
            />{' '}
            Show rejected B′
          </label>
          <label>
            <input type="checkbox" checked={animate} onChange={e => setAnimate(e.target.checked)} />{' '}
            Animate (CSS-only preview, not production timing)
          </label>
          <button type="button" onClick={() => setRun(value => value + 1)}>
            Replay
          </button>
        </fieldset>
      </div>
      <div
        key={run}
        className={[animate && 'p20-animate', roundEnds && 'p20-round-ends']
          .filter(Boolean)
          .join(' ')}
      >
        {(themes === 'both' ? (['light', 'dark'] as const) : [themes]).map(theme => (
          <Board
            key={theme}
            theme={theme}
            height={height}
            colour={colour}
            direction={direction}
            rejected={rejected}
          />
        ))}
      </div>
    </section>
  );
}
