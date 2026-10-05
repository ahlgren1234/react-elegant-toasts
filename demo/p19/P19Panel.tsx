// P-19 D1 — TEMPORARY DEMO-ONLY PROTOTYPE CODE. Not library code, not public API, never shipped.
//
// The D1 comparison panel: one selector for Off (baseline), A and B, shared scenarios, and a small
// readout. Its own state only, so its updates never re-render the Toaster. The technique is chosen
// here, by the demo, never by a library prop.
import { useEffect, useRef, useState } from 'react';
import type { ToastPosition } from '../../src';
import { startHarness, support, type Harness, type Mode } from './harness';
import { resetStats, stats } from './instrument';
import {
  add,
  clearAll,
  count,
  dismiss,
  furthest,
  kindOf,
  middle,
  nearest,
  sequence,
  type Kind,
} from './scenarios';
import './p19-prototype.css';

const POSITIONS: readonly ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];
const MODES: readonly { value: Mode; label: string }[] = [
  { value: 'off', label: 'Baseline / Off' },
  { value: 'a', label: 'A — CSS transition' },
  { value: 'b', label: 'B — WAAPI' },
];
/** The demo Toaster's `maxVisible` (demo/index.tsx). */
const MAX_VISIBLE = 6;

const initialMode = (): Mode => {
  const value = new URLSearchParams(window.location.search).get('p19');
  return value === 'a' || value === 'b' ? value : 'off';
};

interface Readout {
  active: number;
  exiting: number;
  inertExiting: number;
  transformedAtRest: number;
  rendered: number;
}

function readout(host: HTMLElement | null, harness: Harness | null): Readout {
  const items = host ? [...host.querySelectorAll<HTMLElement>('.ret-toaster__list > li')] : [];
  const active = harness?.candidate.active() ?? 0;
  return {
    active,
    rendered: items.length,
    exiting: items.filter(item => item.getAttribute('data-phase') === 'exiting').length,
    inertExiting: items.filter(
      item => item.getAttribute('data-phase') === 'exiting' && item.hasAttribute('inert')
    ).length,
    // Only meaningful while nothing moves: a toast left with a non-`none` transform at rest.
    transformedAtRest:
      active === 0
        ? items.filter(
            item =>
              !item.classList.contains('demo-p19-consumer-transform') &&
              getComputedStyle(item).transform !== 'none'
          ).length
        : 0,
  };
}

export function P19Panel({ hostId }: { hostId: string }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [position, setPosition] = useState<ToastPosition>('top-right');
  const [allSix, setAllSix] = useState(false);
  const [animateSize, setAnimateSize] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [consoleLog, setConsoleLog] = useState(false);
  const [, setTick] = useState(0);
  const harness = useRef<Harness | null>(null);
  const animateSizeRef = useRef(animateSize);

  useEffect(() => {
    animateSizeRef.current = animateSize;
  }, [animateSize]);

  useEffect(() => {
    stats.consoleLog = consoleLog;
  }, [consoleLog]);

  useEffect(() => {
    document.documentElement.classList.toggle('demo-p19-narrow', narrow);
    return () => document.documentElement.classList.remove('demo-p19-narrow');
  }, [narrow]);

  // One harness per mode. Switching modes disposes the previous one completely first.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (mode === 'off') url.searchParams.delete('p19');
    else url.searchParams.set('p19', mode);
    window.history.replaceState(null, '', url);
    const host = document.getElementById(hostId);
    if (!host) return undefined;
    if (mode !== 'off') document.documentElement.dataset.p19 = mode;
    harness.current = startHarness(host, mode, {
      animateSizeChanges: () => animateSizeRef.current,
    });
    return () => {
      harness.current?.dispose();
      harness.current = null;
      delete document.documentElement.dataset.p19;
    };
  }, [mode, hostId]);

  useEffect(() => {
    const timer = setInterval(() => setTick(tick => tick + 1), 250);
    return () => clearInterval(timer);
  }, []);

  const targets = allSix ? POSITIONS : [position];
  const each = (run: (at: ToastPosition) => void) => () => targets.forEach(run);
  const host = document.getElementById(hostId);
  const now = readout(host, harness.current);

  const button = (label: string, onClick: () => void) => (
    <button key={label} type="button" className="demo-button" onClick={onClick}>
      {label}
    </button>
  );
  const addKind = (label: string, kind: Kind) =>
    button(
      label,
      each(at => add(at, kind))
    );

  return (
    <section className="demo-prototype demo-p19" aria-labelledby="p19-heading">
      <h2 id="p19-heading">P-19 D1 repositioning prototypes</h2>
      <p className="demo-note">
        <strong>Prototype only, not public API.</strong> Demo-only comparison code for the D2
        decision; nothing here ships in the package. Review with{' '}
        <a href={mode === 'off' ? '?production-css' : `?production-css&p19=${mode}`}>
          ?production-css
        </a>{' '}
        so only the production stylesheet applies. Mode:{' '}
        <span className="demo-p19-mode">{MODES.find(m => m.value === mode)?.label}</span>
      </p>

      <fieldset>
        <legend>Technique</legend>
        {MODES.map(({ value, label }) => (
          <label key={value}>
            <input
              type="radio"
              name="p19-mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="demo-controls">
        <label>
          Position
          <select value={position} onChange={e => setPosition(e.target.value as ToastPosition)}>
            {POSITIONS.map(value => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={allSix} onChange={e => setAllSix(e.target.checked)} />
          Run on all six positions
        </label>
        <label>
          <input type="checkbox" checked={narrow} onChange={e => setNarrow(e.target.checked)} />
          Narrow stacks (rewraps text)
        </label>
        <label>
          <input
            type="checkbox"
            checked={animateSize}
            onChange={e => setAnimateSize(e.target.checked)}
          />
          Animate size changes (open D2 question)
        </label>
        <label>
          <input
            type="checkbox"
            checked={consoleLog}
            onChange={e => setConsoleLog(e.target.checked)}
          />
          Console log
        </label>
      </div>

      <h3>Add</h3>
      <div className="demo-actions">
        {addKind('Add short', 'short')}
        {addKind('Add tall', 'tall')}
        {addKind('Add wrapping', 'wrapping')}
        {addKind('Add custom (tall)', 'custom')}
        {addKind('Add custom with root transform', 'consumer-transform')}
        {button(
          'Mixed heights: short, tall, short',
          each(at =>
            sequence([
              [0, () => add(at, 'short')],
              [350, () => add(at, 'tall')],
              [700, () => add(at, 'short')],
            ])
          )
        )}
        {button(
          'Burst add (4 × 80 ms)',
          each(at => sequence([0, 80, 160, 240].map(t => [t, () => add(at, 'short')])))
        )}
        {button(
          'Auto-dismiss (2.5 s)',
          each(at => add(at, 'short', undefined, 2500))
        )}
      </div>

      <h3>Dismiss</h3>
      <div className="demo-actions">
        {button(
          'Dismiss nearest edge',
          each(at => dismiss(nearest(at)))
        )}
        {button(
          'Dismiss middle',
          each(at => dismiss(middle(at)))
        )}
        {button(
          'Dismiss furthest',
          each(at => dismiss(furthest(at)))
        )}
        {button(
          'Dismiss several (3 × 80 ms)',
          each(at => sequence([0, 80, 160].map(t => [t, () => dismiss(nearest(at))])))
        )}
        {button('Clear (dismiss all)', clearAll)}
      </div>

      <h3>Membership combinations</h3>
      <div className="demo-actions">
        {button(
          'Queue + promotion',
          each(at => {
            // Fill the stack to maxVisible plus one queued toast, then free a slot: the removal
            // and the promotion land in the same snapshot.
            const missing = Math.max(0, MAX_VISIBLE + 1 - count(at));
            for (let i = 0; i < missing; i += 1) add(at, i % 2 ? 'tall' : 'short');
            sequence([[900, () => dismiss(middle(at))]]);
          })
        )}
        {button(
          'Add while exiting',
          each(at =>
            sequence([
              [0, () => dismiss(middle(at))],
              [60, () => add(at, 'tall')],
            ])
          )
        )}
        {button(
          'Dismiss while entering',
          each(at => {
            const id = add(at, 'tall');
            sequence([[60, () => dismiss(id)]]);
          })
        )}
        {button(
          'Revival (same ID mid-exit)',
          each(at => {
            const id = middle(at);
            if (!id) return;
            dismiss(id);
            sequence([[60, () => add(at, kindOf(id), id)]]);
          })
        )}
        {button(
          'Rapid interruption',
          each(at =>
            sequence([
              [0, () => add(at, 'short')],
              [70, () => add(at, 'tall')],
              [140, () => dismiss(furthest(at))],
              [210, () => add(at, 'short')],
              [280, () => dismiss(middle(at))],
              [350, () => add(at, 'custom')],
              [420, () => dismiss(nearest(at))],
            ])
          )
        )}
      </div>

      <div className="demo-p19-readout" aria-live="off">
        <div>
          ResizeObserver: {support.resizeObserver ? 'yes' : 'no'} · WAAPI:{' '}
          {support.waapi ? 'yes' : 'no'}
        </div>
        <div>
          Rendered {now.rendered} · exiting {now.exiting} (inert {now.inertExiting}) · reposition
          animations running {now.active} · non-none transform at rest {now.transformedAtRest}
        </div>
        <div>
          Batches {stats.batches} · moves {stats.moves} · interrupted {stats.interruptions} ·
          geometry refreshes {stats.refreshes} · Toaster commits {stats.toasterCommits}{' '}
          <button type="button" onClick={resetStats}>
            Reset counters
          </button>
        </div>
        <ol>
          {stats.events.map((event, index) => (
            <li key={`${index}-${event}`}>{event}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}
