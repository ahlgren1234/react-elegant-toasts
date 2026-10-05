// P-19 — TEMPORARY DEMO-ONLY CHECKPOINT CODE. Not library code, not public API, never shipped.
// Removed with the rest of demo/p19 in P-19 S5.
//
// The manual-checkpoint harness for production stack repositioning (D2 decision 11): repeatable
// scenarios through the public `toast` API and a readout from DOM reads and transition events on
// the demo's own host element. It moves nothing itself. Its own state only, so its updates never
// re-render the Toaster.
import { useEffect, useState } from 'react';
import type { ToastPosition } from '../../src';
import { note, resetStats, stats } from './instrument';
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
/** The demo Toaster's `maxVisible` (demo/index.tsx). */
const MAX_VISIBLE = 6;

const support = {
  resizeObserver: typeof ResizeObserver === 'function',
};

interface Readout {
  rendered: number;
  exiting: number;
  inertExiting: number;
  running: number;
  transformedAtRest: number;
  wrongOffsetParent: number;
}

const isToastTransform = (event: Event) =>
  (event as TransitionEvent).propertyName === 'transform' &&
  event.target instanceof HTMLElement &&
  event.target.classList.contains('ret-toast');

const labelOf = (item: Element): string =>
  (item.textContent ?? '').trim().slice(0, 24) || '(empty)';

function readout(host: HTMLElement | null, running: ReadonlySet<EventTarget>): Readout {
  const items = host ? [...host.querySelectorAll<HTMLElement>('.ret-toaster__list > li')] : [];
  for (const target of running) {
    if (!(target as Node).isConnected) (running as Set<EventTarget>).delete(target);
  }
  return {
    rendered: items.length,
    exiting: items.filter(item => item.getAttribute('data-phase') === 'exiting').length,
    inertExiting: items.filter(
      item => item.getAttribute('data-phase') === 'exiting' && item.hasAttribute('inert')
    ).length,
    running: running.size,
    // Only meaningful while nothing moves: a toast left with a non-`none` transform at rest.
    transformedAtRest:
      running.size === 0
        ? items.filter(
            item =>
              !item.classList.contains('demo-p19-consumer-transform') &&
              getComputedStyle(item).transform !== 'none'
          ).length
        : 0,
    // The production geometry measures each toast root against its own list (S1, S2).
    wrongOffsetParent: items.filter(item => item.offsetParent !== item.parentElement).length,
  };
}

export function P19Panel({ hostId }: { hostId: string }) {
  const [position, setPosition] = useState<ToastPosition>('top-right');
  const [allSix, setAllSix] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [consoleLog, setConsoleLog] = useState(false);
  const [running] = useState(() => new Set<EventTarget>());
  const [, setTick] = useState(0);

  useEffect(() => {
    stats.consoleLog = consoleLog;
  }, [consoleLog]);

  useEffect(() => {
    document.documentElement.classList.toggle('demo-p19-narrow', narrow);
    return () => document.documentElement.classList.remove('demo-p19-narrow');
  }, [narrow]);

  // Observation only: transition events bubble to the demo's host element.
  useEffect(() => {
    const host = document.getElementById(hostId);
    if (!host) return undefined;
    const onRun = (event: Event) => {
      if (!isToastTransform(event) || !event.target) return;
      running.add(event.target);
      stats.moves += 1;
      const item = event.target as HTMLElement;
      note(`move ${item.getAttribute('data-position') ?? '?'} "${labelOf(item)}"`);
    };
    const onDone = (event: Event) => {
      if (isToastTransform(event) && event.target) running.delete(event.target);
    };
    host.addEventListener('transitionrun', onRun);
    host.addEventListener('transitionend', onDone);
    host.addEventListener('transitioncancel', onDone);
    return () => {
      host.removeEventListener('transitionrun', onRun);
      host.removeEventListener('transitionend', onDone);
      host.removeEventListener('transitioncancel', onDone);
      running.clear();
    };
  }, [hostId, running]);

  useEffect(() => {
    const timer = setInterval(() => setTick(tick => tick + 1), 250);
    return () => clearInterval(timer);
  }, []);

  const targets = allSix ? POSITIONS : [position];
  const each = (run: (at: ToastPosition) => void) => () => targets.forEach(run);
  const now = readout(document.getElementById(hostId), running);

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
      <h2 id="p19-heading">P-19 stack repositioning checkpoint</h2>
      <p className="demo-note">
        <strong>Checkpoint harness only, not public API.</strong> Repositioning is the
        library&apos;s own; these controls only drive the public API and read the DOM. Review with{' '}
        <a href="?production-css">?production-css</a> so only the production stylesheet applies.
      </p>

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
        <div>ResizeObserver: {support.resizeObserver ? 'yes' : 'no'}</div>
        <div>
          Rendered {now.rendered} · exiting {now.exiting} (inert {now.inertExiting}) · moves running{' '}
          {now.running} · non-none transform at rest {now.transformedAtRest} · offsetParent not its
          list {now.wrongOffsetParent}
        </div>
        <div>
          Moves started {stats.moves} · Toaster commits {stats.toasterCommits}{' '}
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
