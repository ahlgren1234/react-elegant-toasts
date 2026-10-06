// P-21 D1 prototype: demo only and disposable. S5 removes it with the rest of `demo/p21/`.
//
// A self-contained stack, not the library: it imports nothing from `src/`, and models just enough
// of three layers that share one toast root to make the composition evidence meaningful:
//
// - P-18-like lifecycle: `data-phase` keyframes on the individual `opacity`, `translate` and
//   `scale`, completing on the root's own filtered `animationend` or a computed fallback.
// - P-19-like repositioning: on a membership change, each moved root is seeded with an inline
//   `transform` and carried back by `transition: transform`. Two seeding modes: `production`
//   copies the shipped P-19 code (vertical component only, inline `translateY`), and `composed`
//   is the D1 candidate (both components, swipe-aware).
// - P-21 swipe (D0): native listeners on the root, gesture state in a closure, per-move CSSOM
//   writes to internal custom properties, the internal `data-swiping` hook, capture at activation.
//
// Nothing here renders through React, and the diagnostics are prototype-only DOM writes.
import './prototype.css';

type Position =
  'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
type Phase = 'entering' | 'visible' | 'exiting';
type Reason = 'timeout' | 'close-button' | 'swipe' | 'programmatic' | 'action';
type Edge = 'top' | 'bottom';
type DistanceMode = 'fixed' | 'fraction' | 'capped';

const POSITIONS: readonly Position[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

/**
 * Candidate gesture constants. NOT production values: D1 evidence and the maintainer's device
 * feedback choose them, and D2 locks them. Each can be overridden by a URL parameter of the same
 * name (for example `?p21&distanceCapPx=120`) or edited live in the panel.
 */
const CANDIDATES = {
  /** Pointer travel, in CSS px from `pointerdown`, before a candidate may activate. */
  activationSlopPx: 10,
  /** Activation needs |dx| >= ratio × |dy| at the slop; otherwise the candidate is dropped. */
  dominanceRatio: 1.5,
  /** How the distance threshold is formed from the toast's width. */
  distanceMode: 'capped' as DistanceMode,
  distanceFixedPx: 80,
  distanceFraction: 0.4,
  /** `capped`: min(distanceFraction × width, distanceCapPx). */
  distanceCapPx: 100,
  /** Release velocity is measured over the pointer samples in this window before release. */
  velocityWindowMs: 100,
  /** Signed physical velocity, in px/ms, that commits in an allowed direction. */
  velocityThreshold: 0.4,
  /** Opacity falls linearly to this minimum ... */
  opacityMin: 0.3,
  /** ... reached at this fraction of the toast's width. */
  opacityFadeSpan: 0.8,
  snapMs: 200,
  /** Fly-out travel beyond the current offset, as a percentage of the toast's own width. */
  flyDistancePct: 60,
  flyMs: 200,
};
type CandidateKey = keyof typeof CANDIDATES;

const SNAP_EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const FLY_EASE = 'cubic-bezier(0.4, 0, 1, 1)';
/** P-18's fallback margin. */
const FALLBACK_MARGIN_MS = 100;

const params = new URLSearchParams(window.location.search);
for (const key of Object.keys(CANDIDATES) as CandidateKey[]) {
  const raw = params.get(key);
  if (raw === null) continue;
  if (key === 'distanceMode') {
    if (raw === 'fixed' || raw === 'fraction' || raw === 'capped') CANDIDATES.distanceMode = raw;
  } else if (Number.isFinite(Number(raw))) {
    (CANDIDATES as Record<CandidateKey, number | DistanceMode>)[key] = Number(raw);
  }
}

interface Settings {
  position: Position;
  rtl: boolean;
  /** Local reduced-motion switch, for devices that cannot emulate the media feature. */
  rm: boolean;
  slow: number;
  seeding: 'composed' | 'production';
  /** Composed seeding only: what a reposition does to a toast under the finger. */
  dragPolicy: 'freeze' | 'follow';
  autoCloseMs: number;
}

const settings: Settings = {
  position: 'top-right',
  rtl: false,
  rm: false,
  slow: 1,
  seeding: 'composed',
  dragPolicy: 'freeze',
  autoCloseMs: 0,
};

interface Sample {
  readonly t: number;
  readonly x: number;
}

interface Gesture {
  readonly pointerId: number;
  readonly pointerType: string;
  phase: 'pending' | 'dragging';
  readonly startX: number;
  readonly startY: number;
  activationX: number;
  /** The visual X at activation, from the computed matrix (non-zero when grabbed mid-settle). */
  baseX: number;
  /** The current visual X, clamped to the allowed direction. */
  x: number;
  samples: Sample[];
  captured: boolean;
}

interface Toast {
  readonly uid: string;
  readonly el: HTMLLIElement;
  readonly custom: boolean;
  phase: Phase;
  exitReason: Reason | undefined;
  reasons: Set<'hover' | 'swipe'>;
  gesture: Gesture | null;
  dismissCallbacks: number;
  remaining: number;
  runningSince: number | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  settleTimer: ReturnType<typeof setTimeout> | undefined;
  stopLifecycle: (() => void) | undefined;
  cleanup: () => void;
}

/** One record per moved root per reposition, kept for the evidence script. */
interface RepositionRecord {
  readonly at: number;
  readonly uid: string;
  readonly state: string;
  readonly mode: string;
  readonly displacement: number;
  readonly before: { x: number; y: number };
  readonly seed: { x: number; y: number } | null;
  readonly frozenY: { from: number; to: number } | null;
}

const toasts = new Map<HTMLElement, Toast>();
/** Each toast's root as created, to show that nothing replaces it (root identity). */
const firstRoots = new Map<string, HTMLElement>();
const removedOnce = new Set<string>();
const log: string[] = [];
const repositions: RepositionRecord[] = [];
let uidCounter = 0;

// ---------------------------------------------------------------------------------------------
// DOM helpers

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  el.append(...children);
  return el;
}

const NUMBER = /-?\d+(?:\.\d+)?(?:e-?\d+)?/gi;

/** The physical X and Y of a resolved `transform`: `none`, `matrix()` or `matrix3d()`. */
function matrixOf(el: Element): { x: number; y: number } {
  const value = getComputedStyle(el).transform;
  if (!value || value === 'none') return { x: 0, y: 0 };
  const inner = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')'));
  const numbers = (inner.match(NUMBER) ?? []).map(Number);
  if (value.startsWith('matrix3d(') && numbers.length >= 16) {
    return { x: numbers[12] ?? 0, y: numbers[13] ?? 0 };
  }
  if (value.startsWith('matrix(') && numbers.length >= 6) {
    return { x: numbers[4] ?? 0, y: numbers[5] ?? 0 };
  }
  return { x: 0, y: 0 };
}

const px = (value: number) => `${Math.round(value * 100) / 100}px`;
const fmt = (value: number) => (value >= 0 ? '+' : '') + value.toFixed(1);
const varPx = (el: HTMLElement, name: string) =>
  Number.parseFloat(el.style.getPropertyValue(name)) || 0;

function note(line: string): void {
  const stamp = (performance.now() / 1000).toFixed(2);
  log.unshift(`${stamp}s ${line}`);
  log.length = Math.min(log.length, 60);
  if (logView) logView.textContent = log.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Harness elements

const harness = h('div', { class: 'p21-harness' });
const stack = h('ol', { class: 'p21-stack' });
const hud = h('div', { class: 'p21-hud', 'aria-hidden': 'true' });
let logView: HTMLElement | null = null;

const edgeOf = (position: Position): Edge => (position.startsWith('top-') ? 'top' : 'bottom');
/** The physical directions the position allows (D0 decision 2): never logical. */
function allowedSigns(position: Position): readonly number[] {
  if (position.endsWith('-left')) return [-1];
  if (position.endsWith('-right')) return [1];
  return [-1, 1];
}
const allowed = (sign: number) => sign !== 0 && allowedSigns(settings.position).includes(sign);

function distanceThreshold(width: number): number {
  const { distanceMode, distanceFixedPx, distanceFraction, distanceCapPx } = CANDIDATES;
  if (distanceMode === 'fixed') return distanceFixedPx;
  if (distanceMode === 'fraction') return distanceFraction * width;
  return Math.min(distanceFraction * width, distanceCapPx);
}

function opacityFor(x: number, width: number): number {
  const span = Math.max(1, CANDIDATES.opacityFadeSpan * width);
  return 1 - (1 - CANDIDATES.opacityMin) * Math.min(1, Math.abs(x) / span);
}

/** Signed physical velocity in px/ms over the window that ends at `at`; 0 without two samples. */
function velocityOf(samples: readonly Sample[], at: number): number {
  const recent = samples.filter(sample => sample.t >= at - CANDIDATES.velocityWindowMs);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || last.t - first.t <= 0) return 0;
  return (last.x - first.x) / (last.t - first.t);
}

// D0 decision 9: the protected set, matched from the target up to (never including) the root.
const INTERACTIVE = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
].join(',');

function protectedTarget(target: EventTarget | null, root: HTMLElement): Element | null {
  for (let node = target instanceof Element ? target : null; node && node !== root;) {
    if (node.matches(INTERACTIVE)) return node;
    node = node.parentElement;
  }
  return null;
}

/** D0 decision 9: a non-collapsed selection that intersects the toast blocks activation. */
function selectionBlocks(root: HTMLElement): boolean {
  const selection = document.getSelection();
  return !!selection && !selection.isCollapsed && selection.containsNode(root, true);
}

// ---------------------------------------------------------------------------------------------
// Timer and pause model (a sketch of §10: only hover and swipe are modelled)

function syncTimer(t: Toast): void {
  const shouldRun =
    settings.autoCloseMs > 0 && t.phase === 'visible' && t.reasons.size === 0 && !!t.el.isConnected;
  if (shouldRun && t.runningSince === null) {
    t.runningSince = performance.now();
    t.timer = setTimeout(() => {
      t.runningSince = null;
      t.remaining = 0;
      note(`${t.uid} timer expired`);
      dismiss(t, 'timeout');
    }, t.remaining);
  } else if (!shouldRun && t.runningSince !== null) {
    t.remaining -= performance.now() - t.runningSince;
    t.runningSince = null;
    clearTimeout(t.timer);
  }
}

function setReason(t: Toast, reason: 'hover' | 'swipe', on: boolean): void {
  if (t.reasons.has(reason) === on) return;
  if (on) t.reasons.add(reason);
  else t.reasons.delete(reason);
  syncTimer(t);
  if (reason === 'swipe')
    note(
      `${t.uid} pause swipe ${on ? 'set' : 'cleared'} (reasons: ${[...t.reasons].join('+') || 'none'})`
    );
}

// ---------------------------------------------------------------------------------------------
// P-18-like lifecycle

function expectedAnimation(t: Toast): string {
  return `p21-${t.phase === 'entering' ? 'enter' : 'exit'}-${edgeOf(settings.position)}`;
}

/** P-18 D0 decision 2, simplified to one animation: duration + margin, or the 0 ms path. */
function fallbackDelay(el: HTMLElement, expected: string): number {
  const style = getComputedStyle(el);
  if (style.animationName !== expected) return 0;
  const seconds = Number.parseFloat(style.animationDuration);
  const ms = style.animationDuration.endsWith('ms') ? seconds : seconds * 1000;
  return ms > 0 ? ms + FALLBACK_MARGIN_MS : 0;
}

function runLifecycle(t: Toast): void {
  t.stopLifecycle?.();
  if (t.phase === 'visible') return;
  const phase = t.phase;
  const el = t.el;
  const expected = expectedAnimation(t);
  const complete = (how: string) => {
    stop();
    if (t.phase !== phase) return;
    if (phase === 'entering') {
      t.phase = 'visible';
      el.dataset.phase = 'visible';
      syncTimer(t);
    } else {
      finishRemoval(t, how);
    }
  };
  const timeout = setTimeout(() => complete('fallback'), fallbackDelay(el, expected));
  const onEnd = (event: AnimationEvent) => {
    if (event.target !== el || el.dataset.phase !== phase || event.animationName !== expected)
      return;
    complete('animationend');
  };
  // Never `transitionend`: the swipe's transitions are cosmetic and complete nothing (D0-7).
  el.addEventListener('animationend', onEnd);
  function stop() {
    clearTimeout(timeout);
    el.removeEventListener('animationend', onEnd);
    t.stopLifecycle = undefined;
  }
  t.stopLifecycle = stop;
}

function dismiss(t: Toast, reason: Reason): void {
  if (t.phase === 'exiting') {
    note(`${t.uid} dismiss(${reason}) ignored: already exiting (${t.exitReason})`);
    return;
  }
  // D0 decision 11: a lifecycle change from elsewhere ends an active gesture first.
  if (t.gesture && reason !== 'swipe') abortForForeignExit(t, reason);
  t.phase = 'exiting';
  t.exitReason = reason;
  t.el.dataset.phase = 'exiting';
  syncTimer(t);
  t.el.inert = true;
  note(`${t.uid} exiting (${reason})`);
  runLifecycle(t);
}

function finishRemoval(t: Toast, how: string): void {
  if (removedOnce.has(t.uid)) throw new Error(`${t.uid} removed twice`);
  removedOnce.add(t.uid);
  t.dismissCallbacks += 1;
  note(`${t.uid} removed by ${how}; onDismiss(${t.exitReason}) #${t.dismissCallbacks}`);
  t.cleanup();
  t.el.remove();
  toasts.delete(t.el);
  reposition();
}

// ---------------------------------------------------------------------------------------------
// P-19-like repositioning

const geometry = new WeakMap<Element, number>();

function measure(): { el: HTMLElement; distance: number | undefined }[] {
  const edge = edgeOf(settings.position);
  const height = edge === 'bottom' ? stack.clientHeight : 0;
  return [...stack.children]
    .filter((child): child is HTMLElement => child.tagName === 'LI')
    .map(el => ({
      el,
      distance:
        el.offsetParent === stack
          ? edge === 'top'
            ? el.offsetTop
            : height - el.offsetTop - el.offsetHeight
          : undefined,
    }));
}

/**
 * The membership-change reposition. `production` reproduces the shipped `reposition()` (vertical
 * only, inline `translateY`, removed after one forced layout). `composed` is the D1 candidate:
 * - a root under a direct drag is never seeded: `freeze` adds the displacement to its swipe Y,
 *   so it stays under the finger and moves to its place only on release; `follow` leaves it to
 *   the drag rule, so it takes its new layout position at once;
 * - every other moved root (at rest, settling, releasing, mid-reposition) is seeded with both
 *   components of its current matrix, so a running swipe X is carried through the seed.
 */
function reposition(): void {
  const edge = edgeOf(settings.position);
  const measured = measure();
  const seeds: [HTMLElement, number, number][] = [];
  for (const { el, distance } of measured) {
    const from = geometry.get(el);
    if (from === undefined || distance === undefined || from === distance) continue;
    const displacement = edge === 'top' ? from - distance : distance - from;
    const before = matrixOf(el);
    const state = el.dataset.swiping ?? 'none';
    const uid = toasts.get(el)?.uid ?? '?';
    if (settings.seeding === 'production') {
      seeds.push([el, Number.NaN, displacement + before.y]);
      repositions.push({
        at: performance.now(),
        uid,
        state,
        mode: 'production',
        displacement,
        before,
        seed: { x: 0, y: displacement + before.y },
        frozenY: null,
      });
    } else if (state === 'drag') {
      if (settings.dragPolicy === 'freeze') {
        const fromY = varPx(el, '--p21-swipe-y');
        el.style.setProperty('--p21-swipe-y', px(fromY + displacement));
        repositions.push({
          at: performance.now(),
          uid,
          state,
          mode: 'composed/freeze',
          displacement,
          before,
          seed: null,
          frozenY: { from: fromY, to: fromY + displacement },
        });
      } else {
        repositions.push({
          at: performance.now(),
          uid,
          state,
          mode: 'composed/follow',
          displacement,
          before,
          seed: null,
          frozenY: null,
        });
      }
    } else {
      seeds.push([el, before.x, before.y + displacement]);
      repositions.push({
        at: performance.now(),
        uid,
        state,
        mode: 'composed',
        displacement,
        before,
        seed: { x: before.x, y: before.y + displacement },
        frozenY: null,
      });
    }
    note(
      `reposition ${uid} [${state}] d=${fmt(displacement)} from (${fmt(before.x)}, ${fmt(before.y)})`
    );
  }
  for (const [el, x, y] of seeds) {
    el.style.setProperty('transition-property', 'none');
    el.style.setProperty(
      'transform',
      Number.isNaN(x) ? `translateY(${y}px)` : `translate(${x}px, ${y}px)`
    );
  }
  if (seeds.length > 0) void stack.offsetHeight;
  for (const [el] of seeds) {
    el.style.removeProperty('transition-property');
    el.style.removeProperty('transform');
  }
  for (const { el, distance } of measured) {
    if (distance === undefined) geometry.delete(el);
    else geometry.set(el, distance);
  }
}

// ---------------------------------------------------------------------------------------------
// P-21 gesture

function writeDrag(t: Toast, x: number, y?: number): void {
  const width = t.el.offsetWidth;
  t.el.style.setProperty('--p21-swipe-x', px(x));
  if (y !== undefined) t.el.style.setProperty('--p21-swipe-y', px(y));
  t.el.style.setProperty(
    '--p21-swipe-opacity',
    String(Math.round(opacityFor(x, width) * 1000) / 1000)
  );
}

function clearSwipeStyle(t: Toast): void {
  for (const name of ['--p21-swipe-x', '--p21-swipe-y', '--p21-swipe-opacity', '--p21-fly-dir']) {
    t.el.style.removeProperty(name);
  }
  delete t.el.dataset.swiping;
}

function releaseCapture(t: Toast, g: Gesture): void {
  if (!g.captured) return;
  g.captured = false;
  try {
    if (t.el.hasPointerCapture?.(g.pointerId)) t.el.releasePointerCapture(g.pointerId);
  } catch {
    // Teardown may race the pointer's end; capture is released by the browser either way.
  }
}

function activate(t: Toast, g: Gesture, event: PointerEvent): void {
  // The current visual position, part-way through any reposition or snap-back (D0-8).
  const visual = matrixOf(t.el);
  clearTimeout(t.settleTimer);
  g.phase = 'dragging';
  g.activationX = event.clientX;
  g.baseX = visual.x;
  g.x = visual.x;
  g.samples = [{ t: event.timeStamp, x: event.clientX }];
  try {
    t.el.setPointerCapture?.(g.pointerId);
    g.captured = !!t.el.hasPointerCapture?.(g.pointerId);
  } catch {
    g.captured = false;
  }
  setReason(t, 'swipe', true);
  writeDrag(t, visual.x, visual.y);
  t.el.dataset.swiping = 'drag';
  const after = matrixOf(t.el);
  note(
    `${t.uid} activate (${g.pointerType} #${g.pointerId}) visual (${fmt(visual.x)}, ${fmt(visual.y)}) → drag (${fmt(after.x)}, ${fmt(after.y)}) captured=${g.captured}`
  );
}

function decide(t: Toast, g: Gesture, at: number) {
  const width = t.el.offsetWidth;
  const threshold = distanceThreshold(width);
  const sign = Math.sign(g.x);
  const velocity = velocityOf(g.samples, at);
  const byDistance = allowed(sign) && Math.abs(g.x) >= threshold;
  const byVelocity =
    allowed(Math.sign(velocity)) &&
    Math.sign(velocity) === sign &&
    Math.abs(velocity) >= CANDIDATES.velocityThreshold;
  return { threshold, velocity, byDistance, byVelocity, commit: byDistance || byVelocity };
}

let lastDecision = '—';

function finish(t: Toast, g: Gesture, commit: boolean, why: string): void {
  // Finished before capture is released, so the `lostpointercapture` that follows a normal
  // `pointerup` finds no owner and changes nothing (D0-10).
  t.gesture = null;
  releaseCapture(t, g);
  if (commit) {
    const direction = Math.sign(g.x);
    t.el.style.setProperty('--p21-fly-dir', String(direction));
    // The vertical component completes toward the layout during the fly-out.
    t.el.style.setProperty('--p21-swipe-y', '0px');
    t.el.dataset.swiping = 'release';
    dismiss(t, 'swipe'); // before the pause reason clears (D0-4)
    setReason(t, 'swipe', false);
    lastDecision = `COMMIT ${direction > 0 ? 'right' : 'left'} (${why})`;
  } else {
    setReason(t, 'swipe', false); // at release, not at transitionend (D0-4)
    t.el.dataset.swiping = 'settle';
    const settleMs = CANDIDATES.snapMs * settings.slow + 50;
    t.settleTimer = setTimeout(() => {
      if (t.el.dataset.swiping === 'settle') clearSwipeStyle(t);
    }, settleMs);
    lastDecision = `CANCEL (${why})`;
  }
  note(`${t.uid} ${lastDecision} at x=${fmt(g.x)} v=${fmt(hudState.velocity * 1000)}px/s`);
}

/** D0 decision 11: give up the gesture, keep the offset as the exit's starting state. */
function abortForForeignExit(t: Toast, reason: Reason): void {
  const g = t.gesture;
  if (!g) return;
  t.gesture = null;
  releaseCapture(t, g);
  if (g.phase === 'dragging') {
    t.el.style.setProperty('--p21-fly-dir', '0');
    t.el.style.setProperty('--p21-swipe-y', '0px');
    t.el.dataset.swiping = 'release';
    setReason(t, 'swipe', false);
  }
  lastDecision = `ABORT: foreign ${reason}`;
  note(`${t.uid} gesture aborted by ${reason} at x=${fmt(g.x)}; offset kept`);
}

function attachGesture(t: Toast): () => void {
  const el = t.el;
  const onDown = (event: PointerEvent) => {
    hudState.pointerType = event.pointerType;
    hudState.pointerId = event.pointerId;
    hudState.toast = t.uid;
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
      hudState.note = `${event.pointerType}: ignored`;
      return paint();
    }
    if (t.gesture) {
      note(
        `${t.uid} pointer #${event.pointerId} ignored: #${t.gesture.pointerId} owns the gesture`
      );
      return;
    }
    if (el.dataset.phase !== 'visible') {
      hudState.note = `not visible (${el.dataset.phase})`;
      return paint();
    }
    const blocked = protectedTarget(event.target, el);
    if (blocked) {
      hudState.note = `protected: <${blocked.tagName.toLowerCase()}>`;
      note(`${t.uid} no candidate: protected ${blocked.tagName.toLowerCase()}`);
      return paint();
    }
    if (selectionBlocks(el)) {
      hudState.note = 'selection blocks';
      note(`${t.uid} no candidate: selection intersects toast`);
      return paint();
    }
    t.gesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      phase: 'pending',
      startX: event.clientX,
      startY: event.clientY,
      activationX: event.clientX,
      baseX: 0,
      x: 0,
      samples: [],
      captured: false,
    };
    hudState.note = 'pending';
    lastDecision = '—';
    paint();
  };

  const onMove = (event: PointerEvent) => {
    const g = t.gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    if (g.phase === 'pending') {
      const dx = event.clientX - g.startX;
      const dy = event.clientY - g.startY;
      if (Math.hypot(dx, dy) < CANDIDATES.activationSlopPx) return;
      if (Math.abs(dx) < CANDIDATES.dominanceRatio * Math.abs(dy)) {
        t.gesture = null;
        hudState.note = `dropped: vertical (${fmt(dx)}, ${fmt(dy)})`;
        note(`${t.uid} candidate dropped: not horizontal (${fmt(dx)}, ${fmt(dy)})`);
        return paint();
      }
      if (el.dataset.phase !== 'visible' || selectionBlocks(el)) {
        t.gesture = null;
        hudState.note = 'dropped at activation';
        return paint();
      }
      activate(t, g, event);
    }
    const raw = g.baseX + (event.clientX - g.activationX);
    g.x = allowed(Math.sign(raw)) ? raw : 0; // forbidden direction clamps to 0 (D0-2)
    g.samples.push({ t: event.timeStamp, x: event.clientX });
    if (g.samples.length > 64) g.samples.splice(0, g.samples.length - 64);
    writeDrag(t, g.x);
    paint(g, event.timeStamp);
  };

  const onUp = (event: PointerEvent) => {
    const g = t.gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    if (g.phase === 'pending') {
      t.gesture = null; // a tap: nothing happens (D-17)
      hudState.note = 'tap';
      return paint();
    }
    const result = decide(t, g, event.timeStamp);
    hudState.velocity = result.velocity;
    finish(
      t,
      g,
      result.commit,
      result.byDistance
        ? result.byVelocity
          ? 'distance+velocity'
          : 'distance'
        : result.byVelocity
          ? 'velocity'
          : 'below'
    );
    paint();
  };

  const onCancel = (event: PointerEvent) => {
    const g = t.gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    if (g.phase === 'pending') {
      t.gesture = null;
      hudState.note = 'pointercancel while pending (browser took it)';
      note(`${t.uid} pointercancel while pending: dropped`);
      return paint();
    }
    finish(t, g, false, 'pointercancel');
    paint();
  };

  const onLost = (event: PointerEvent) => {
    // D1 finding: touch is implicitly captured by the touched descendant. When the root takes
    // explicit capture at activation, that descendant fires `lostpointercapture`, which bubbles
    // here. Only the root's own loss of capture ends the gesture.
    if (event.target !== el) return;
    const g = t.gesture;
    if (!g || event.pointerId !== g.pointerId) {
      note(`${t.uid} lostpointercapture #${event.pointerId} ignored (no unfinished gesture)`);
      return;
    }
    if (g.phase === 'dragging') finish(t, g, false, 'lostpointercapture');
    paint();
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('lostpointercapture', onLost);
  return () => {
    const g = t.gesture;
    if (g) {
      t.gesture = null;
      releaseCapture(t, g);
      setReason(t, 'swipe', false);
    }
    clearTimeout(t.settleTimer);
    clearTimeout(t.timer);
    t.stopLifecycle?.();
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('lostpointercapture', onLost);
  };
}

// ---------------------------------------------------------------------------------------------
// Toasts

const TEXTS = [
  'Saved to your library. This description is selectable text for the selection rule.',
  'Upload finished.',
  'Three files were skipped because their names were too long for the archive format.',
  'Connection restored.',
];

function createToast(custom: boolean): Toast {
  uidCounter += 1;
  const uid = `t${uidCounter}`;
  const el = h('li', {
    class: custom ? 'p21-toast p21-toast--custom' : 'p21-toast',
    'data-phase': 'entering',
    'data-position': settings.position,
    'data-uid': uid,
    tabindex: '-1',
  });
  if (custom) {
    el.append(
      h(
        'div',
        { class: 'p21-custom' },
        h('strong', {}, `Custom ${uid}`),
        h('span', {}, 'Selectable custom text. ', h('a', { href: '#p21-link' }, 'a link')),
        h(
          'span',
          {},
          h('input', { 'aria-label': 'Custom input', placeholder: 'input', size: '8' }),
          ' ',
          h('label', {}, h('input', { type: 'checkbox' }), ' label')
        ),
        h(
          'span',
          {},
          h('span', { class: 'p21-chip', role: 'button', tabindex: '0' }, 'role=button'),
          ' ',
          h('span', { class: 'p21-chip', tabindex: '-1' }, 'tabindex=-1 child')
        )
      )
    );
  } else {
    const action = h('button', { type: 'button', class: 'p21-action' }, 'Undo');
    const close = h('button', { type: 'button', class: 'p21-close', 'aria-label': 'Close' }, '×');
    el.append(
      h('span', { class: 'p21-icon', 'aria-hidden': 'true' }, '●'),
      h(
        'div',
        { class: 'p21-content' },
        h('div', { class: 'p21-title' }, `Toast ${uid}`),
        h('div', { class: 'p21-desc' }, TEXTS[uidCounter % TEXTS.length] ?? '')
      ),
      action,
      close
    );
    action.addEventListener('click', () => {
      note(`${uid} action clicked`);
      const t = toasts.get(el);
      if (t) dismiss(t, 'action');
    });
    close.addEventListener('click', () => {
      const t = toasts.get(el);
      if (t) dismiss(t, 'close-button');
    });
  }
  el.addEventListener('click', event => {
    if (event.target === el || (event.target as Element).closest('.p21-content, .p21-custom')) {
      note(`${uid} body click: no dismissal`);
    }
  });
  const t: Toast = {
    uid,
    el,
    custom,
    phase: 'entering',
    exitReason: undefined,
    reasons: new Set(),
    gesture: null,
    dismissCallbacks: 0,
    remaining: settings.autoCloseMs,
    runningSince: null,
    timer: undefined,
    settleTimer: undefined,
    stopLifecycle: undefined,
    cleanup: () => {},
  };
  t.cleanup = attachGesture(t);
  firstRoots.set(uid, el);
  if (stack.matches(':hover')) t.reasons.add('hover');
  return t;
}

function addToast(custom = false): Toast {
  const t = createToast(custom);
  toasts.set(t.el, t);
  if (edgeOf(settings.position) === 'top') stack.prepend(t.el);
  else stack.append(t.el);
  reposition();
  runLifecycle(t);
  return t;
}

const liveToasts = () =>
  [...stack.children].map(el => toasts.get(el as HTMLElement)).filter((t): t is Toast => !!t);

/** The oldest non-exiting toast that is not under a gesture: the "neighbour" to remove. */
function neighbour(): Toast | undefined {
  const all = liveToasts().filter(t => t.phase !== 'exiting');
  const free = all.filter(t => !t.gesture);
  const ordered = edgeOf(settings.position) === 'top' ? [...free].reverse() : free;
  return ordered[0];
}

/** Unmount without an exit, like a relocation or detach removing the `<li>`. */
function unmount(t: Toast): void {
  note(`${t.uid} unmounted (cleanup only)`);
  t.cleanup();
  t.el.remove();
  toasts.delete(t.el);
  reposition();
}

function resetStack(): void {
  for (const t of liveToasts()) {
    t.cleanup();
    t.el.remove();
    toasts.delete(t.el);
  }
  stack.dataset.position = settings.position;
  hud.dataset.edge = edgeOf(settings.position) === 'top' ? 'bottom' : 'top';
}

// ---------------------------------------------------------------------------------------------
// Diagnostics

const hudState = {
  pointerType: '—',
  pointerId: 0,
  toast: '—',
  note: 'idle',
  velocity: 0,
};

function paint(g?: Gesture, at?: number): void {
  const t = liveToasts().find(candidate => candidate.uid === hudState.toast);
  const phase = g
    ? g.phase === 'pending'
      ? 'pending'
      : 'dragging'
    : t?.el.dataset.swiping === 'settle'
      ? 'settling'
      : 'idle';
  const matrix = t ? matrixOf(t.el) : { x: 0, y: 0 };
  const y = t ? varPx(t.el, '--p21-swipe-y') : 0;
  const width = t?.el.offsetWidth ?? 0;
  let line3 = '';
  if (g && t && g.phase === 'dragging' && at !== undefined) {
    const result = decide(t, g, at);
    hudState.velocity = result.velocity;
    line3 = `dist ${Math.abs(g.x).toFixed(0)}/${result.threshold.toFixed(0)} ${result.byDistance ? 'COMMIT' : 'no'} | vel ${fmt(result.velocity * 1000)}px/s ${result.byVelocity ? 'COMMIT' : 'no'}`;
  } else {
    line3 = `release v ${fmt(hudState.velocity * 1000)}px/s → ${lastDecision}`;
  }
  const rmMedia = window.matchMedia('(prefers-reduced-motion: reduce)').matches; // display only
  hud.textContent = [
    `${hudState.pointerType} #${hudState.pointerId} ${hudState.toast} ${t?.phase ?? ''} | ${phase} | ${hudState.note}`,
    `x ${fmt(g?.x ?? 0)} y(swipe) ${fmt(y)} matrix (${fmt(matrix.x)}, ${fmt(matrix.y)}) w ${width}`,
    line3,
    `allowed ${allowedSigns(settings.position)
      .map(s => (s > 0 ? 'right' : 'left'))
      .join(
        '+'
      )} | paused ${t ? [...t.reasons].join('+') || 'none' : '—'} | rm ${rmMedia ? 'media' : settings.rm ? 'local' : 'off'} | ${settings.rtl ? 'rtl' : 'ltr'} | ${settings.seeding}/${settings.dragPolicy}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Page and controls

function toggleRow(
  label: string,
  options: readonly [string, () => boolean, () => void][]
): HTMLElement {
  const row = h('div', { class: 'p21-row' }, h('span', {}, label));
  const buttons = options.map(([text, pressed, act]) => {
    const button = h('button', { type: 'button' }, text);
    button.addEventListener('click', () => {
      act();
      for (const [index, b] of buttons.entries())
        b.setAttribute('aria-pressed', String(options[index]?.[1]()));
      paint();
    });
    button.setAttribute('aria-pressed', String(pressed()));
    return button;
  });
  row.append(...buttons);
  return row;
}

function actionRow(label: string, actions: readonly [string, () => void][]): HTMLElement {
  const row = h('div', { class: 'p21-row' }, h('span', {}, label));
  for (const [text, act] of actions) {
    const button = h('button', { type: 'button' }, text);
    button.addEventListener('click', act);
    row.append(button);
  }
  return row;
}

function applyCssConstants(): void {
  harness.style.setProperty('--p21-slow', String(settings.slow));
  harness.style.setProperty('--p21-snap-ms', `calc(${CANDIDATES.snapMs}ms * var(--p21-slow))`);
  harness.style.setProperty('--p21-snap-ease', SNAP_EASE);
  harness.style.setProperty('--p21-fly-ms', `calc(${CANDIDATES.flyMs}ms * var(--p21-slow))`);
  harness.style.setProperty('--p21-fly-ease', FLY_EASE);
  harness.style.setProperty('--p21-fly-distance', `${CANDIDATES.flyDistancePct}%`);
}

function constantsForm(): HTMLElement {
  const form = h('div', { class: 'p21-constants' });
  for (const key of Object.keys(CANDIDATES) as CandidateKey[]) {
    const label = h('label', {}, key);
    if (key === 'distanceMode') {
      const select = h(
        'select',
        {},
        ...(['fixed', 'fraction', 'capped'] as const).map(mode =>
          h('option', { value: mode }, mode)
        )
      );
      select.value = CANDIDATES.distanceMode;
      select.addEventListener('change', () => {
        CANDIDATES.distanceMode = select.value as DistanceMode;
        syncUrl();
      });
      label.append(select);
    } else {
      const input = h('input', { type: 'number', step: 'any', value: String(CANDIDATES[key]) });
      input.addEventListener('change', () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        (CANDIDATES as Record<CandidateKey, number | DistanceMode>)[key] = value;
        applyCssConstants();
        syncUrl();
      });
      label.append(input);
    }
    form.append(label);
  }
  return form;
}

/** Keeps the candidate values in the URL, so a device reload or a shared link keeps them. */
function syncUrl(): void {
  const next = new URLSearchParams(window.location.search);
  for (const key of Object.keys(CANDIDATES) as CandidateKey[])
    next.set(key, String(CANDIDATES[key]));
  history.replaceState(null, '', `${window.location.pathname}?${next.toString()}`);
}

const later = (ms: number, act: () => void) => () => {
  note(`scheduled in ${ms} ms`);
  setTimeout(act, ms);
};

function gestureToast(): Toast | undefined {
  return (
    liveToasts().find(t => t.gesture?.phase === 'dragging') ??
    liveToasts().find(t => t.el.dataset.swiping)
  );
}

function selectFirstDescription(): void {
  const target = stack.querySelector('.p21-desc, .p21-custom span');
  if (!target) return;
  const range = document.createRange();
  range.selectNodeContents(target);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
  note('selected text inside a toast');
}

function filler(): HTMLElement {
  const section = h('div', { class: 'p21-filler' });
  for (let i = 1; i <= 24; i += 1) {
    section.append(
      h(
        'p',
        {},
        `Filler paragraph ${i}. The page must scroll vertically, so a vertical swipe that starts on a toast can be checked against the locked touch-action: pan-y. Scroll from a toast body, from custom content and next to its buttons.`
      )
    );
  }
  return section;
}

function build(): void {
  const page = h('div', { class: 'p21-page' });
  logView = h('div', { class: 'p21-log' });
  page.append(
    h('h1', {}, 'P-21 D1 swipe prototype (demo only)'),
    h(
      'p',
      {},
      'Touch or pen swipes a toast toward its edge; centre stacks either way. A mouse does nothing. The dark panel shows the gesture; the log below records decisions and repositions. Candidate values are NOT final.'
    ),
    h(
      'div',
      { class: 'p21-controls' },
      toggleRow(
        'Position',
        POSITIONS.map(position => [
          position,
          () => settings.position === position,
          () => {
            settings.position = position;
            resetStack();
            addToast();
            addToast(true);
            addToast();
          },
        ])
      ),
      toggleRow('Direction', [
        [
          'LTR',
          () => !settings.rtl,
          () => {
            settings.rtl = false;
            harness.dir = 'ltr';
          },
        ],
        [
          'RTL',
          () => settings.rtl,
          () => {
            settings.rtl = true;
            harness.dir = 'rtl';
          },
        ],
      ]),
      toggleRow('Motion', [
        [
          'Normal',
          () => !settings.rm,
          () => {
            settings.rm = false;
            delete harness.dataset.rm;
          },
        ],
        [
          'Reduced (local)',
          () => settings.rm,
          () => {
            settings.rm = true;
            harness.dataset.rm = '';
          },
        ],
        [
          '×1',
          () => settings.slow === 1,
          () => {
            settings.slow = 1;
            applyCssConstants();
          },
        ],
        [
          '×5 slow',
          () => settings.slow === 5,
          () => {
            settings.slow = 5;
            applyCssConstants();
          },
        ],
      ]),
      toggleRow('Seeding', [
        [
          'Composed (candidate)',
          () => settings.seeding === 'composed',
          () => {
            settings.seeding = 'composed';
          },
        ],
        [
          'Production P-19 (Y only)',
          () => settings.seeding === 'production',
          () => {
            settings.seeding = 'production';
          },
        ],
      ]),
      toggleRow('Under drag', [
        [
          'Freeze Y',
          () => settings.dragPolicy === 'freeze',
          () => {
            settings.dragPolicy = 'freeze';
          },
        ],
        [
          'Follow layout',
          () => settings.dragPolicy === 'follow',
          () => {
            settings.dragPolicy = 'follow';
          },
        ],
      ]),
      toggleRow('Auto-close', [
        [
          'Off',
          () => settings.autoCloseMs === 0,
          () => {
            settings.autoCloseMs = 0;
          },
        ],
        [
          '6 s',
          () => settings.autoCloseMs === 6000,
          () => {
            settings.autoCloseMs = 6000;
          },
        ],
      ]),
      actionRow('Add', [
        ['Toast', () => addToast()],
        ['Custom', () => addToast(true)],
        [
          'Reset (3)',
          () => {
            resetStack();
            addToast();
            addToast(true);
            addToast();
          },
        ],
      ]),
      actionRow('In 1.5 s', [
        ['Insert', later(1500, () => addToast())],
        [
          'Remove neighbour',
          later(1500, () => {
            const t = neighbour();
            if (t) dismiss(t, 'programmatic');
          }),
        ],
        [
          'Dismiss swiped',
          later(1500, () => {
            const t = gestureToast();
            if (t) dismiss(t, 'programmatic');
          }),
        ],
        [
          'Unmount swiped',
          later(1500, () => {
            const t = gestureToast();
            if (t) unmount(t);
          }),
        ],
      ]),
      actionRow('Burst', [
        [
          'Insert every 400 ms ×8',
          later(800, () => {
            for (let i = 0; i < 8; i += 1) setTimeout(() => addToast(), i * 400);
          }),
        ],
        [
          'Remove every 400 ms ×4',
          later(800, () => {
            for (let i = 0; i < 4; i += 1)
              setTimeout(() => {
                const t = neighbour();
                if (t) dismiss(t, 'programmatic');
              }, i * 400);
          }),
        ],
      ]),
      actionRow('Selection', [
        ['Select toast text', selectFirstDescription],
        ['Clear selection', () => document.getSelection()?.removeAllRanges()],
      ]),
      h(
        'details',
        {},
        h('summary', {}, 'Candidate constants (live, kept in the URL)'),
        constantsForm()
      )
    ),
    logView,
    filler()
  );
  harness.append(page, stack, hud);
}

/** Evidence hooks for the D1 CDP script. Prototype only. */
function exposeEvidenceApi(): void {
  Object.assign(window, {
    __p21: {
      CANDIDATES,
      settings,
      log,
      repositions,
      add: (custom = false) => addToast(custom).uid,
      reset: (position: Position) => {
        settings.position = position;
        resetStack();
      },
      set: (patch: Partial<Settings>) => {
        Object.assign(settings, patch);
        harness.dir = settings.rtl ? 'rtl' : 'ltr';
        if (settings.rm) harness.dataset.rm = '';
        else delete harness.dataset.rm;
        applyCssConstants();
      },
      neighbour: () => neighbour()?.uid,
      dismiss: (uid: string, reason: Reason = 'programmatic') => {
        const t = liveToasts().find(candidate => candidate.uid === uid);
        if (t) dismiss(t, reason);
      },
      unmount: (uid: string) => {
        const t = liveToasts().find(candidate => candidate.uid === uid);
        if (t) unmount(t);
      },
      selectText: selectFirstDescription,
      state: () =>
        liveToasts().map(t => ({
          uid: t.uid,
          phase: t.phase,
          exitReason: t.exitReason,
          swiping: t.el.dataset.swiping ?? null,
          gesture: t.gesture?.phase ?? null,
          reasons: [...t.reasons],
          matrix: matrixOf(t.el),
          vars: {
            x: t.el.style.getPropertyValue('--p21-swipe-x'),
            y: t.el.style.getPropertyValue('--p21-swipe-y'),
            opacity: t.el.style.getPropertyValue('--p21-swipe-opacity'),
          },
          opacity: getComputedStyle(t.el).opacity,
          inlineTransform: t.el.style.transform,
          rect: t.el.getBoundingClientRect().toJSON() as DOMRectReadOnly,
          offsetTop: t.el.offsetTop,
          dismissCallbacks: t.dismissCallbacks,
          sameRoot: stack.querySelector(`[data-uid="${t.uid}"]`) === firstRoots.get(t.uid),
        })),
      removed: () => [...removedOnce],
    },
  });
}

/** Mounts the prototype in place of the demo. */
export function mountP21Prototype(container: HTMLElement): void {
  document.title = 'P-21 D1 swipe prototype';
  applyCssConstants();
  build();
  container.replaceChildren(harness);
  stack.addEventListener('pointerenter', () =>
    liveToasts().forEach(t => setReason(t, 'hover', true))
  );
  stack.addEventListener('pointerleave', () =>
    liveToasts().forEach(t => setReason(t, 'hover', false))
  );
  resetStack();
  addToast();
  addToast(true);
  addToast();
  exposeEvidenceApi();
  paint();
}
