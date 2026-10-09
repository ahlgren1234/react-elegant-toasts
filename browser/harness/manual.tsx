import { useEffect, useState, version, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  Toaster,
  toast,
  type DismissReason,
  type ToastOptions,
  type ToastPosition,
  type ToastSnapshot,
  type ToastTheme,
} from '../../src';

// P-22 S6.1 manual QA page (V2_PLAN.md, P-22 S6): the real library and the production stylesheet,
// with on-page controls, a live status and an exportable event log, for the manual checkpoints on
// physical devices. The automated harness (`index.html`, `main.tsx`) is separate and unchanged.
//
// Every listener here is observational: passive, never `preventDefault`, `stopPropagation` or
// pointer capture, and no touch listeners, so the library and the browser behave as without it.
// The page's own styles use the `mq-` prefix and never select `.ret-*`. Nothing leaves the device:
// the log is kept in memory and exported only by the viewer, as a downloaded file.

const POSITIONS: readonly ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];
const THEMES: readonly ToastTheme[] = ['system', 'light', 'dark'];
const KINDS = ['default', 'success', 'error', 'warning', 'info', 'loading', 'custom'] as const;
type Kind = (typeof KINDS)[number];
// `ten-minutes` is the long progress preset's only, for MC-5's and MC-1's background cases.
type DurationMode = 'toaster' | 'timed' | 'persistent' | 'ten-minutes';
const TIMED_MS = 8000;
const TEN_MINUTES_MS = 600_000;
const SCHEDULED_DISMISS_MS = 2000;
const SCHEDULED_ADD_MS = 2000;
const MAX_ENTRIES = 2000;
const SHOWN_ENTRIES = 150;
const MOVE_INTERVAL_MS = 100;
const THROTTLE_MS = 250;
const ID_PREFIX = 'mq-';

const PAGE_CSS = `
.mq-page { box-sizing: border-box; max-width: 760px; margin: 0 auto; font: 15px/1.45 system-ui, sans-serif;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
.mq-page h1 { font-size: 1.15rem; margin: 0 0 4px; }
.mq-page h2 { font-size: 1rem; margin: 0 0 8px; }
.mq-note { margin: 0 0 12px; font-size: 0.9rem; }
.mq-stage { min-height: 35vh; margin: 12px 0; border: 1px dashed; border-radius: 8px;
  display: grid; place-items: center; font-size: 0.85rem; opacity: 0.7; }
.mq-panel section { border: 1px solid; border-radius: 8px; padding: 12px; margin: 12px 0; }
.mq-row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin: 6px 0; }
.mq-page button, .mq-page select, .mq-page input { font: inherit; min-height: 40px; }
.mq-page button { padding: 0 12px; }
.mq-page input[type="number"] { width: 4.5em; }
.mq-page input[type="text"] { width: 100%; box-sizing: border-box; }
.mq-status { font: 12px/1.4 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }
.mq-log { font: 12px/1.35 ui-monospace, monospace; max-height: 50vh; overflow: auto; margin: 0;
  padding-inline-start: 0; list-style: none; overflow-wrap: anywhere; }
.mq-log li { border-top: 1px solid rgba(127, 127, 127, 0.3); padding: 2px 0; }
.mq-json { width: 100%; min-height: 12em; font: 11px/1.3 ui-monospace, monospace; }
.mq-filler { height: 2400px; margin: 12px 0; border-radius: 8px;
  background: repeating-linear-gradient(180deg, rgba(127, 127, 127, 0.12) 0 200px, transparent 200px 400px); }
.mq-filler div { height: 400px; box-sizing: border-box; padding: 8px; font-size: 0.85rem; }
.mq-custom { box-sizing: border-box; width: 280px; max-width: 100%; min-height: 96px; padding: 12px;
  border: 2px solid; border-radius: 10px; background: Canvas; color: CanvasText; }
.mq-custom p { margin: 0 0 8px; }
.mq-safe-probe { position: absolute; top: 0; left: 0; width: 0; height: 0; overflow: hidden;
  visibility: hidden; pointer-events: none;
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
    env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
`;
const SLOW_MOTION_CSS =
  '.ret-toaster { --ret-enter-duration: 1800ms; --ret-exit-duration: 1200ms; }';

// --- Event log ---------------------------------------------------------------------------------

interface Entry {
  readonly seq: number;
  /** `performance.now()`, in ms since the page loaded. */
  readonly t: number;
  /** Wall-clock time, ISO 8601. */
  readonly at: string;
  readonly type: string;
  readonly detail?: Record<string, unknown>;
}

const entries: Entry[] = [];
let seq = 0;
function log(type: string, detail?: Record<string, unknown>): void {
  seq += 1;
  const entry: Entry = {
    seq,
    t: Math.round(performance.now() * 10) / 10,
    at: new Date().toISOString(),
    type,
    ...(detail === undefined ? {} : { detail }),
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

const idOf = (item: Element): string | undefined =>
  Array.from(item.classList)
    .find(name => name.startsWith(ID_PREFIX))
    ?.slice(ID_PREFIX.length);

/** Names an event target without recording any text the viewer typed. */
function describe(target: EventTarget | null): string | null {
  if (target === null) return null;
  if (target === window) return 'window';
  if (target === document) return 'document';
  if (!(target instanceof Element)) return 'node';
  if (target === document.body) return 'body';
  if (target === document.documentElement) return 'html';
  if (target.classList.contains('ret-toaster')) return 'region';
  const item = target.closest('.ret-toast');
  if (item) {
    const id = idOf(item) ?? '?';
    if (target === item) return `toast:${id}`;
    if (target.closest('.ret-toast__close')) return `close:${id}`;
    if (target.closest('.ret-toast__action')) return `action:${id}`;
    if (target.closest('button')) return `custom-button:${id}`;
    return `content:${id}`;
  }
  const qa = target.closest<HTMLElement>('[data-qa]');
  if (qa) return `qa:${qa.dataset.qa ?? ''}`;
  return target.tagName.toLowerCase();
}

const OPTIONS = { capture: true, passive: true } as const;

// Pointer events. Moves are logged when `buttons` changes or at most every 100 ms per pointer,
// with the number of moves left out since the last one logged.
const lastMove = new Map<number, { time: number; buttons: number; skipped: number }>();
const pointerDetail = (event: PointerEvent) => ({
  pointerType: event.pointerType,
  pointerId: event.pointerId,
  isPrimary: event.isPrimary,
  button: event.button,
  buttons: event.buttons,
  x: Math.round(event.clientX),
  y: Math.round(event.clientY),
  pressure: Math.round(event.pressure * 100) / 100,
  trusted: event.isTrusted,
  target: describe(event.target),
});
for (const type of [
  'pointerdown',
  'pointerup',
  'pointercancel',
  'gotpointercapture',
  'lostpointercapture',
] as const) {
  window.addEventListener(
    type,
    event => {
      if (type === 'pointerdown' || type === 'pointerup') lastMove.delete(event.pointerId);
      log(type, pointerDetail(event));
    },
    OPTIONS
  );
}
window.addEventListener(
  'pointermove',
  event => {
    const now = performance.now();
    const last = lastMove.get(event.pointerId);
    if (last && last.buttons === event.buttons && now - last.time < MOVE_INTERVAL_MS) {
      last.skipped += 1;
      return;
    }
    log('pointermove', { ...pointerDetail(event), skipped: last?.skipped ?? 0 });
    lastMove.set(event.pointerId, { time: now, buttons: event.buttons, skipped: 0 });
  },
  OPTIONS
);
window.addEventListener(
  'click',
  event => {
    log('click', {
      target: describe(event.target),
      active: describe(document.activeElement),
      trusted: event.isTrusted,
    });
  },
  OPTIONS
);

// Keys: only navigation and the hotkey, never text typed in the page's fields.
window.addEventListener(
  'keydown',
  event => {
    const keys = ['Tab', 'Enter', 'Escape', 'Space', 'KeyT'];
    if (!keys.includes(event.code)) return;
    if (event.code === 'KeyT' && !event.altKey) return;
    log('keydown', {
      code: event.code,
      alt: event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      meta: event.metaKey,
      target: describe(event.target),
      trusted: event.isTrusted,
    });
  },
  OPTIONS
);

// Focus, window focus and blur, visibility and the page lifecycle.
for (const type of ['focusin', 'focusout'] as const) {
  document.addEventListener(
    type,
    event => {
      log(type, {
        target: describe(event.target),
        related: describe(event.relatedTarget),
        focusVisible: event.target instanceof Element && event.target.matches(':focus-visible'),
        trusted: event.isTrusted,
      });
    },
    OPTIONS
  );
}
for (const type of ['focus', 'blur'] as const) {
  window.addEventListener(
    type,
    event => {
      if (event.target === window) log(`window-${type}`, { trusted: event.isTrusted });
    },
    OPTIONS
  );
}
document.addEventListener(
  'visibilitychange',
  event => log('visibilitychange', { state: document.visibilityState, trusted: event.isTrusted }),
  OPTIONS
);
for (const type of ['pagehide', 'pageshow'] as const) {
  window.addEventListener(
    type,
    event => log(type, { persisted: event.persisted, trusted: event.isTrusted }),
    OPTIONS
  );
}

/** Calls `read` at most every 250 ms after an event, so the latest value is always logged. */
function throttled(read: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    timer ??= setTimeout(() => {
      timer = undefined;
      read();
    }, THROTTLE_MS);
  };
}
window.addEventListener(
  'scroll',
  throttled(() => log('scroll', { scrollX: Math.round(scrollX), scrollY: Math.round(scrollY) })),
  OPTIONS
);
window.addEventListener(
  'resize',
  throttled(() => log('resize', { width: innerWidth, height: innerHeight })),
  OPTIONS
);
const viewportChange = throttled(() => {
  const viewport = window.visualViewport;
  if (!viewport) return;
  log('visual-viewport', {
    scale: Math.round(viewport.scale * 1000) / 1000,
    width: Math.round(viewport.width),
    height: Math.round(viewport.height),
    offsetLeft: Math.round(viewport.offsetLeft),
    offsetTop: Math.round(viewport.offsetTop),
  });
});
window.visualViewport?.addEventListener('resize', viewportChange, { passive: true });
window.visualViewport?.addEventListener('scroll', viewportChange, { passive: true });

// Toast roots entering and leaving, and their lifecycle attributes.
const isToastRoot = (node: Node): node is HTMLElement =>
  node instanceof HTMLElement && node.classList.contains('ret-toast');
new MutationObserver(records => {
  for (const record of records) {
    if (record.type === 'attributes' && isToastRoot(record.target) && record.attributeName) {
      log('toast-attribute', {
        id: idOf(record.target),
        name: record.attributeName,
        value: record.target.getAttribute(record.attributeName),
      });
    }
    for (const [type, nodes] of [
      ['toast-added', record.addedNodes],
      ['toast-removed', record.removedNodes],
    ] as const) {
      for (const node of nodes) {
        if (!(node instanceof Element)) continue;
        const roots = isToastRoot(node) ? [node] : node.querySelectorAll('.ret-toast');
        for (const item of roots) log(type, { id: idOf(item) });
      }
    }
  }
}).observe(document.body, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['data-phase', 'data-paused', 'data-swiping', 'inert'],
});

// --- Status ------------------------------------------------------------------------------------

const safeProbe = document.createElement('div');
safeProbe.className = 'mq-safe-probe';
document.body.append(safeProbe);

function progressOf(item: Element): number | null {
  const fill = item.querySelector('.ret-toast__progress-fill');
  if (!fill) return null;
  const transform = getComputedStyle(fill).transform;
  const scale = transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
  return Math.round(scale * 1000) / 1000;
}

function readStatus() {
  const probe = getComputedStyle(safeProbe);
  const viewport = window.visualViewport;
  const active = document.activeElement;
  return {
    toasts: Array.from(document.querySelectorAll('.ret-toast'), item => ({
      id: idOf(item) ?? '?',
      type:
        Array.from(item.classList)
          .find(name => name.startsWith('ret-toast--'))
          ?.slice('ret-toast--'.length) ?? 'default',
      position: item.getAttribute('data-position'),
      phase: item.getAttribute('data-phase'),
      paused: item.getAttribute('data-paused'),
      swiping: item.getAttribute('data-swiping'),
      inert: item.hasAttribute('inert'),
      progress: progressOf(item),
    })),
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus(),
    activeElement: describe(active),
    focusVisible: active?.matches(':focus-visible') ?? false,
    scrollY: Math.round(scrollY),
    visualViewportScale: viewport ? Math.round(viewport.scale * 1000) / 1000 : null,
    safeAreaInsets: {
      top: probe.paddingTop,
      right: probe.paddingRight,
      bottom: probe.paddingBottom,
      left: probe.paddingLeft,
    },
    viewport: `${innerWidth} × ${innerHeight}`,
    dir: document.documentElement.dir || 'ltr',
  };
}

function environment() {
  const media = (query: string) => matchMedia(query).matches;
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    devicePixelRatio,
    screen: `${screen.width} × ${screen.height}`,
    orientation: screen.orientation?.type ?? null,
    reactVersion: version,
    prefersReducedMotion: media('(prefers-reduced-motion: reduce)'),
    prefersDark: media('(prefers-color-scheme: dark)'),
    forcedColors: media('(forced-colors: active)'),
    page: location.pathname + location.search,
  };
}

// --- Toasts ------------------------------------------------------------------------------------

interface Settings {
  position: ToastPosition;
  dir: 'ltr' | 'rtl';
  theme: ToastTheme;
  maxVisible: number;
  slowMotion: boolean;
  kind: Kind;
  description: boolean;
  action: boolean;
  duration: DurationMode;
  progress: boolean;
  /** `closeButton: true` on custom toasts (CF-12's custom close); off keeps them chrome-less. */
  customClose: boolean;
}

const INITIAL: Settings = {
  position: 'top-right',
  dir: 'ltr',
  theme: 'system',
  maxVisible: 4,
  slowMotion: false,
  kind: 'default',
  description: false,
  action: false,
  duration: 'persistent',
  progress: false,
  customClose: false,
};

let created = 0;
const live: string[] = [];
const onDismiss = (snapshot: ToastSnapshot, reason: DismissReason) => {
  const index = live.indexOf(snapshot.id);
  if (index !== -1) live.splice(index, 1);
  log('dismiss', { id: snapshot.id, reason });
};

function CustomContent({ id }: { readonly id: string }) {
  return (
    <div className="mq-custom">
      <p>Custom {id}: 280 px wide, at least 96 px high.</p>
      <button type="button" onClick={() => log('custom-button', { id })}>
        Custom button
      </button>
    </div>
  );
}

/** A toast's text: `label` when given, else its type; then its ID. */
type Overrides = Partial<Settings> & { readonly label?: string };

function create(settings: Settings, overrides: Overrides = {}): string {
  const s = { ...settings, ...overrides };
  created += 1;
  const id = `t${created}`;
  const duration =
    s.duration === 'persistent'
      ? Infinity
      : s.duration === 'timed'
        ? TIMED_MS
        : s.duration === 'ten-minutes'
          ? TEN_MINUTES_MS
          : undefined;
  const common = {
    id,
    className: `${ID_PREFIX}${id}`,
    position: s.position,
    duration,
    onDismiss,
    onAutoClose: (snapshot: ToastSnapshot) => log('auto-close', { id: snapshot.id }),
  };
  live.push(id);
  const customClose = s.kind === 'custom' && s.customClose;
  log('create', {
    id,
    kind: s.kind,
    duration: s.duration,
    position: s.position,
    ...(customClose ? { closeButton: true } : {}),
  });
  if (s.kind === 'custom') {
    toast.custom(
      <CustomContent id={id} />,
      customClose ? { ...common, closeButton: true } : common
    );
    return id;
  }
  const options: ToastOptions = {
    ...common,
    progress: s.progress,
    ...(s.description
      ? { description: `Description for ${id}, long enough to wrap on a narrow phone screen.` }
      : {}),
    ...(s.action ? { action: { label: 'Undo', onClick: () => log('action-click', { id }) } } : {}),
  };
  const content: ReactNode = `${s.label ?? `${s.kind[0]!.toUpperCase()}${s.kind.slice(1)}`} ${id}`;
  if (s.kind === 'default') toast(content, options);
  else toast[s.kind](content, options);
  return id;
}

// --- Panel -------------------------------------------------------------------------------------

const toasterRoot = createRoot(document.getElementById('mq-toaster')!);
let slowStyle: HTMLStyleElement | null = null;

function applySettings(settings: Settings): void {
  document.documentElement.dir = settings.dir;
  if (settings.slowMotion && !slowStyle) {
    slowStyle = document.createElement('style');
    slowStyle.dataset.mq = 'slow-motion';
    slowStyle.textContent = SLOW_MOTION_CSS;
    document.head.append(slowStyle);
  } else if (!settings.slowMotion && slowStyle) {
    slowStyle.remove();
    slowStyle = null;
  }
  toasterRoot.render(
    <Toaster position={settings.position} theme={settings.theme} maxVisible={settings.maxVisible} />
  );
}

function download(label: string): void {
  const now = new Date();
  const json = exportJson(label, now);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  const slug = label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'session';
  link.href = url;
  link.download = `p22-manual-${slug}-${now.toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  log('exported', { entries: entries.length });
}

function exportJson(label: string, now = new Date()): string {
  return JSON.stringify(
    {
      format: 'react-elegant-toasts/p22-manual-qa/1',
      sessionLabel: label,
      exportedAt: now.toISOString(),
      environment: environment(),
      status: readStatus(),
      events: entries,
    },
    null,
    2
  );
}

function Panel() {
  const [settings, setSettings] = useState(INITIAL);
  const [, setTick] = useState(0);
  const [label, setLabel] = useState('');
  const [json, setJson] = useState<string | null>(null);
  const [addPending, setAddPending] = useState(false);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings(current => ({ ...current, [key]: value }));

  useEffect(() => applySettings(settings), [settings]);
  useEffect(() => {
    const timer = setInterval(() => setTick(tick => tick + 1), 250);
    return () => clearInterval(timer);
  }, []);

  const status = readStatus();
  const shown = entries.slice(-SHOWN_ENTRIES).reverse();
  const preset = (overrides: Overrides) => () => create(settings, overrides);

  return (
    <div className="mq-panel">
      <section aria-labelledby="mq-status-title">
        <h2 id="mq-status-title">Status</h2>
        <pre className="mq-status" data-qa="status">
          {status.toasts.length === 0
            ? 'No toasts.\n'
            : status.toasts
                .map(
                  t =>
                    `${t.id} ${t.type} ${t.position} phase=${t.phase} paused=${t.paused} ` +
                    `swiping=${t.swiping} inert=${t.inert} progress=${t.progress ?? '-'}\n`
                )
                .join('')}
          {`visibility=${status.visibilityState} hasFocus=${status.hasFocus}\n`}
          {`active=${status.activeElement} focusVisible=${status.focusVisible}\n`}
          {`scrollY=${status.scrollY} zoom=${status.visualViewportScale} viewport=${status.viewport} dir=${status.dir}\n`}
          {`safe-area top=${status.safeAreaInsets.top} right=${status.safeAreaInsets.right} bottom=${status.safeAreaInsets.bottom} left=${status.safeAreaInsets.left}\n`}
          {navigator.userAgent}
        </pre>
      </section>

      <section aria-labelledby="mq-toaster-title">
        <h2 id="mq-toaster-title">Toaster</h2>
        <div className="mq-row">
          <label>
            Position{' '}
            <select
              data-qa="position"
              value={settings.position}
              onChange={event => set('position', event.target.value as ToastPosition)}
            >
              {POSITIONS.map(position => (
                <option key={position}>{position}</option>
              ))}
            </select>
          </label>
          <label>
            Direction{' '}
            <select
              data-qa="dir"
              value={settings.dir}
              onChange={event => set('dir', event.target.value as Settings['dir'])}
            >
              <option value="ltr">LTR</option>
              <option value="rtl">RTL</option>
            </select>
          </label>
          <label>
            Theme{' '}
            <select
              data-qa="theme"
              value={settings.theme}
              onChange={event => set('theme', event.target.value as ToastTheme)}
            >
              {THEMES.map(theme => (
                <option key={theme}>{theme}</option>
              ))}
            </select>
          </label>
          <label>
            maxVisible{' '}
            <input
              type="number"
              data-qa="max-visible"
              min={1}
              max={10}
              value={settings.maxVisible}
              onChange={event =>
                set('maxVisible', Math.min(10, Math.max(1, Number(event.target.value) || 1)))
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              data-qa="slow-motion"
              checked={settings.slowMotion}
              onChange={event => set('slowMotion', event.target.checked)}
            />{' '}
            Slow motion (enter 1800 ms, exit 1200 ms)
          </label>
        </div>
      </section>

      <section aria-labelledby="mq-toast-title">
        <h2 id="mq-toast-title">Next toast</h2>
        <div className="mq-row">
          <label>
            Type{' '}
            <select
              data-qa="kind"
              value={settings.kind}
              onChange={event => set('kind', event.target.value as Kind)}
            >
              {KINDS.map(kind => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label>
            Duration{' '}
            <select
              data-qa="duration"
              value={settings.duration}
              onChange={event => set('duration', event.target.value as DurationMode)}
            >
              <option value="persistent">persistent</option>
              <option value="timed">timed, 8 s</option>
              <option value="toaster">Toaster default, 5 s</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              data-qa="description"
              checked={settings.description}
              onChange={event => set('description', event.target.checked)}
            />{' '}
            Description
          </label>
          <label>
            <input
              type="checkbox"
              data-qa="action"
              checked={settings.action}
              onChange={event => set('action', event.target.checked)}
            />{' '}
            Action
          </label>
          <label>
            <input
              type="checkbox"
              data-qa="progress"
              checked={settings.progress}
              onChange={event => set('progress', event.target.checked)}
            />{' '}
            Progress
          </label>
          <label>
            <input
              type="checkbox"
              data-qa="custom-close"
              checked={settings.customClose}
              onChange={event => set('customClose', event.target.checked)}
            />{' '}
            Close button on custom toasts
          </label>
        </div>
        <div className="mq-row">
          <button type="button" data-qa="add-one" onClick={() => create(settings)}>
            Add one
          </button>
          <button
            type="button"
            data-qa="add-three"
            onClick={() => {
              for (let index = 0; index < 3; index += 1) create(settings);
            }}
          >
            Add three
          </button>
          <button
            type="button"
            data-qa="add-one-later"
            disabled={addPending}
            onClick={() => {
              // One pending insertion at a time, with the settings of the click (CF-35: an
              // insertion during a swipe fly-out).
              const at = settings;
              setAddPending(true);
              log('add-scheduled', { inMs: SCHEDULED_ADD_MS });
              setTimeout(() => {
                setAddPending(false);
                log('add-scheduled-fired', { id: create(at) });
              }, SCHEDULED_ADD_MS);
            }}
          >
            {addPending ? 'Add one in 2 s (pending)' : 'Add one in 2 s'}
          </button>
          <button
            type="button"
            data-qa="dismiss-all"
            onClick={() => {
              log('dismiss-all');
              toast.dismiss();
            }}
          >
            Dismiss all
          </button>
          <button
            type="button"
            data-qa="dismiss-newest-later"
            onClick={() => {
              const id = live[live.length - 1];
              log('dismiss-scheduled', { id: id ?? null, inMs: SCHEDULED_DISMISS_MS });
              if (id === undefined) return;
              setTimeout(() => {
                log('dismiss-scheduled-fired', { id });
                toast.dismiss(id);
              }, SCHEDULED_DISMISS_MS);
            }}
          >
            Dismiss newest in 2 s
          </button>
        </div>
      </section>

      <section aria-labelledby="mq-preset-title">
        <h2 id="mq-preset-title">Presets (ignore the type, duration and options above)</h2>
        <div className="mq-row">
          <button
            type="button"
            data-qa="preset-ten-minutes"
            onClick={preset({
              kind: 'info',
              duration: 'ten-minutes',
              description: false,
              action: false,
              progress: true,
              label: '10-minute progress',
            })}
          >
            10-minute progress — background/visibility test
          </button>
          <button
            type="button"
            data-qa="preset-swipe"
            onClick={preset({
              kind: 'default',
              duration: 'persistent',
              description: true,
              action: false,
              progress: false,
            })}
          >
            Persistent swipe target
          </button>
          <button
            type="button"
            data-qa="preset-progress"
            onClick={preset({
              kind: 'success',
              duration: 'timed',
              description: false,
              action: false,
              progress: true,
            })}
          >
            Timed 8 s with progress
          </button>
          <button
            type="button"
            data-qa="preset-action"
            onClick={preset({
              kind: 'info',
              duration: 'persistent',
              description: true,
              action: true,
              progress: false,
            })}
          >
            Persistent with action
          </button>
          <button
            type="button"
            data-qa="preset-custom"
            onClick={preset({ kind: 'custom', duration: 'persistent' })}
          >
            Custom 280 × 96
          </button>
        </div>
        <p className="mq-note">
          10-minute progress (MC-5, MC-1): an info toast that runs for 600 000 ms with its progress
          bar, long enough to switch windows or apps, hide the tab or minimise for more than five
          minutes, and come back to the same toast. Watch its phase, paused and progress values in
          Status, and export the log after each case.
        </p>
        <p className="mq-note">
          Swipe a toast horizontally (past half its width, or a short flick), release early to
          spring back, drag vertically from a toast to scroll, try diagonals, and pinch-zoom on a
          toast and on the page. Drags that start on a button never swipe.
        </p>
      </section>

      <section aria-labelledby="mq-log-title">
        <h2 id="mq-log-title">Event log</h2>
        <div className="mq-row">
          <label style={{ flex: '1 1 100%' }}>
            Session label (device, OS, browser){' '}
            <input
              type="text"
              data-qa="session-label"
              autoComplete="off"
              value={label}
              onChange={event => setLabel(event.target.value)}
            />
          </label>
          <button type="button" data-qa="download" onClick={() => download(label)}>
            Download JSON
          </button>
          <button
            type="button"
            data-qa="show-json"
            onClick={() => setJson(current => (current === null ? exportJson(label) : null))}
          >
            {json === null ? 'Show JSON' : 'Hide JSON'}
          </button>
          <button
            type="button"
            data-qa="clear-log"
            onClick={() => {
              entries.length = 0;
              log('log-cleared');
            }}
          >
            Clear log
          </button>
        </div>
        {json !== null && (
          <textarea className="mq-json" data-qa="json" readOnly value={json} aria-label="JSON" />
        )}
        <p className="mq-note">
          {entries.length} entries kept (at most {MAX_ENTRIES}); the newest {SHOWN_ENTRIES} below.
        </p>
        <ol className="mq-log" data-qa="log">
          {shown.map(entry => (
            <li key={entry.seq}>
              {`${entry.t.toFixed(1)} ${entry.type}`}
              {entry.detail ? ` ${JSON.stringify(entry.detail)}` : ''}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

// --- Start -------------------------------------------------------------------------------------

async function stylesheetLoaded(): Promise<void> {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel="stylesheet"][href="/styles.css"]'
  );
  if (!link) throw new Error('The production stylesheet is not linked.');
  if (link.sheet) return;
  await new Promise<void>((resolve, reject) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => reject(new Error('The production stylesheet failed.')), {
      once: true,
    });
  });
}

const pageStyle = document.createElement('style');
pageStyle.dataset.mq = 'page';
pageStyle.textContent = PAGE_CSS;
document.head.append(pageStyle);

const filler = document.querySelector('.mq-filler');
for (let offset = 0; offset < 2400; offset += 400) {
  const marker = document.createElement('div');
  marker.textContent = `Scroll marker ${offset} px`;
  filler?.append(marker);
}

void stylesheetLoaded().then(() => {
  // Both roots commit before the page reports itself ready.
  flushSync(() => {
    applySettings(INITIAL);
    createRoot(document.getElementById('mq-panel')!).render(<Panel />);
  });
  log('ready', environment());
  document.documentElement.dataset.mqReady = 'true';
});
