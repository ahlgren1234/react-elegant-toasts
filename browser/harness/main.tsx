import { useState, version } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Toaster, toast } from '../../src';
import type {
  Box,
  FocusEventDetail,
  FocusFixtureMode,
  FocusState,
  FocusTarget,
  FrameSample,
  HarnessEvent,
  InertEventDetail,
  ProgressState,
  RetHarness,
  SampleOptions,
  ToastEventDetail,
  ToastState,
} from './api';

// P-22 browser harness: the real library and the production stylesheet, with no demo UI. Specs drive
// it only through `window.__retHarness` and the DOM. Each test opens a fresh page, so no scenario
// state carries over. The harness observes the library; it never completes, times or moves a toast.

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

const container = document.getElementById('root');
if (!container) throw new Error('The harness has no #root.');

// Scenarios that need page markup outside the Toaster, selected by `?scenario=`. `long-page`: a
// focusable button at the top, then 4000 px of content, then the Toaster, so focusing the region,
// which sits in the flow below, would scroll the page (P-22 H1).
if (new URLSearchParams(location.search).get('scenario') === 'long-page') {
  const outside = document.createElement('button');
  outside.type = 'button';
  outside.textContent = 'Outside';
  outside.dataset.harness = 'outside';
  const content = document.createElement('div');
  content.style.height = '4000px';
  container.before(outside, content);
}

const root = createRoot(container);
const events: HarnessEvent[] = [];
const log = (type: string, detail?: unknown) => {
  events.push({ type, time: performance.now(), detail });
};

const LABEL_PREFIX = 'h-';
const labelOf = (item: Element): string | undefined =>
  Array.from(item.classList)
    .find(name => name.startsWith(LABEL_PREFIX))
    ?.slice(LABEL_PREFIX.length);
const isToastRoot = (node: Node): node is HTMLElement =>
  node instanceof HTMLElement && node.classList.contains('ret-toast');

// Animation and transition events from inside any toast, captured before the library sees them.
const RECORDED = [
  'animationstart',
  'animationiteration',
  'animationend',
  'animationcancel',
  'transitionrun',
  'transitionstart',
  'transitionend',
  'transitioncancel',
] as const;
for (const type of RECORDED) {
  document.addEventListener(
    type,
    event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const item = target.closest('.ret-toast');
      if (!item) return;
      const detail: ToastEventDetail = {
        label: labelOf(item),
        root: target === item,
        name:
          event instanceof AnimationEvent
            ? event.animationName
            : event instanceof TransitionEvent
              ? event.propertyName
              : '',
        trusted: event.isTrusted,
      };
      log(type, detail);
    },
    { capture: true }
  );
}

// Phase changes, and toast roots entering and leaving the DOM.
new MutationObserver(records => {
  for (const record of records) {
    if (record.type === 'attributes' && isToastRoot(record.target)) {
      const detail: ToastEventDetail = {
        label: labelOf(record.target),
        root: true,
        phase: record.target.getAttribute('data-phase'),
      };
      log('phase', detail);
    }
    // A position's list comes and goes with its toasts, so a root can arrive or leave inside it.
    for (const [type, nodes] of [
      ['added', record.addedNodes],
      ['removed', record.removedNodes],
    ] as const) {
      for (const node of nodes) {
        if (!(node instanceof Element)) continue;
        const roots = isToastRoot(node) ? [node] : node.querySelectorAll('.ret-toast');
        for (const item of roots) log(type, { label: labelOf(item), root: true });
      }
    }
  }
}).observe(document.body, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['data-phase'],
});

/** Names an element for the focus records ({@link FocusTarget}). */
function describe(target: EventTarget | null): FocusTarget | null {
  if (target === null) return null;
  if (target === window) return 'window';
  if (!(target instanceof Element)) return 'other:node';
  if (target === document.body) return 'body';
  if (target.classList.contains('ret-toaster')) return 'region';
  if (target instanceof HTMLElement && target.dataset.harness === 'outside') return 'outside';
  const item = target.closest('.ret-toast');
  if (item) {
    const label = labelOf(item) ?? '?';
    if (target === item) return `toast:${label}`;
    if (target.parentElement === item && target.classList.contains('ret-toast__close'))
      return `close:${label}`;
    if (target.parentElement === item && target.classList.contains('ret-toast__action'))
      return `action:${label}`;
    return `content:${label}`;
  }
  return `other:${target.tagName.toLowerCase()}`;
}

// Focus movement, captured on the document and window before the library sees it. The detail has
// no `label`, so these entries never join a toast's animation and phase entries.
for (const type of ['focusin', 'focusout'] as const) {
  document.addEventListener(
    type,
    event => {
      const detail: FocusEventDetail = {
        target: describe(event.target),
        related: describe(event.relatedTarget),
        trusted: event.isTrusted,
        targetInert: event.target instanceof Element && event.target.closest('[inert]') !== null,
      };
      log(type, detail);
    },
    { capture: true }
  );
}
for (const type of ['focus', 'blur'] as const) {
  window.addEventListener(
    type,
    event => {
      if (event.target !== window) return;
      const detail: FocusEventDetail = {
        target: 'window',
        related: null,
        trusted: event.isTrusted,
        targetInert: false,
      };
      log(`${type}:window`, detail);
    },
    { capture: true }
  );
}

// `inert` on toast roots, apart from the phase recorder above so its entries keep their meaning.
// The active element is read when the observer runs: after the commit's layout effects, before any
// later task can move focus.
new MutationObserver(records => {
  for (const record of records) {
    if (!isToastRoot(record.target)) continue;
    const detail: InertEventDetail = {
      toast: labelOf(record.target),
      inert: record.target.hasAttribute('inert'),
      active: describe(document.activeElement),
    };
    log('inert', detail);
  }
}).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['inert'] });

function focusState(): FocusState {
  const active = document.activeElement;
  return {
    active: describe(active),
    focusVisible: active?.matches(':focus-visible') ?? false,
    scrollY: window.scrollY,
    hasFocus: document.hasFocus(),
    visibilityState: document.visibilityState,
  };
}

/**
 * Custom toast content whose button, `.h-target`, changes the content's own React state when
 * activated: `remove` unmounts the button, `rekey` replaces it with a new element under a new key.
 * Either way the focused node leaves the DOM with no `focusout` the library can rely on (P-15).
 */
function FocusFixture({ mode }: { readonly mode: FocusFixtureMode }) {
  const [round, setRound] = useState(0);
  if (mode === 'remove' && round > 0) return <p>Removed</p>;
  return (
    <p>
      Fixture{' '}
      <button
        key={round}
        type="button"
        className="h-target"
        data-round={round}
        onClick={() => setRound(value => value + 1)}
      >
        {mode === 'remove' ? 'Remove' : `Renew ${round}`}
      </button>
    </p>
  );
}

let scenarioStyle: HTMLStyleElement | null = null;

const toastRoot = (label: string) =>
  document.querySelector<HTMLElement>(`.ret-toast.${CSS.escape(LABEL_PREFIX + label)}`);

/** The vertical part of a computed `translate`: `none`, `x`, `x y` or `x y z`. */
const translateYOf = (value: string): number =>
  value === 'none' ? 0 : Number.parseFloat(value.split(' ')[1] ?? '0');
/** The vertical factor of a computed `scale`: `none`, `s` or `x y` (and `z`). */
const scaleYOf = (value: string): number => {
  if (value === 'none') return 1;
  const parts = value.split(' ');
  return Number.parseFloat(parts[1] ?? parts[0] ?? '1');
};

const DISCONNECTED: ToastState = {
  connected: false,
  phase: null,
  top: Number.NaN,
  bottom: Number.NaN,
  left: Number.NaN,
  right: Number.NaN,
  offsetTop: Number.NaN,
  offsetHeight: Number.NaN,
  transform: 'none',
  transformY: 0,
  translate: 'none',
  translateY: 0,
  scale: 'none',
  scaleY: 1,
  opacity: Number.NaN,
  animationName: 'none',
  offsetParentIsList: false,
};

function toastState(label: string): ToastState {
  const item = toastRoot(label);
  if (!item) return DISCONNECTED;
  const style = getComputedStyle(item);
  const rect = item.getBoundingClientRect();
  const transform = style.transform;
  return {
    connected: true,
    phase: item.getAttribute('data-phase'),
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    offsetTop: item.offsetTop,
    offsetHeight: item.offsetHeight,
    transform,
    transformY: transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42,
    translate: style.translate,
    translateY: translateYOf(style.translate),
    scale: style.scale,
    scaleY: scaleYOf(style.scale),
    opacity: Number.parseFloat(style.opacity),
    animationName: style.animationName,
    offsetParentIsList: item.offsetParent?.classList.contains('ret-toaster__list') ?? false,
  };
}

const boxOf = (element: Element | null | undefined): Box | null => {
  if (!element) return null;
  const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
  return { left, right, top, bottom, width, height };
};

function progressState(label: string): ProgressState {
  const strip = toastRoot(label)?.querySelector('.ret-toast__progress');
  const fill = strip?.querySelector('.ret-toast__progress-fill');
  if (!strip || !fill)
    return { present: false, scale: Number.NaN, playState: '', strip: null, fill: null };
  const style = getComputedStyle(fill);
  return {
    present: true,
    scale: style.transform === 'none' ? 1 : new DOMMatrixReadOnly(style.transform).a,
    playState: style.animationPlayState,
    strip: boxOf(strip),
    fill: boxOf(fill),
  };
}

function sampleFrames<T>(read: () => T, options: SampleOptions<T>): Promise<FrameSample<T>[]> {
  const samples: FrameSample<T>[] = [{ frame: 0, time: performance.now(), value: read() }];
  let frame = 0;
  const observer = options.atToastMutations
    ? new MutationObserver(records => {
        const toasts = records.some(record =>
          [...record.addedNodes, ...record.removedNodes].some(
            node =>
              node instanceof Element && (isToastRoot(node) || node.querySelector('.ret-toast'))
          )
        );
        if (toasts) samples.push({ frame, time: performance.now(), value: read(), mutation: true });
      })
    : null;
  observer?.observe(document.body, { subtree: true, childList: true });
  return new Promise((resolve, reject) => {
    const finish = (result: () => void) => {
      observer?.disconnect();
      result();
    };
    const step = (time: number) => {
      try {
        frame += 1;
        const value = read();
        samples.push({ frame, time, value });
        options.onFrame?.(frame);
        if (frame >= options.maxFrames || options.until?.(value, frame)) {
          finish(() => resolve(samples));
        } else requestAnimationFrame(step);
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    };
    requestAnimationFrame(step);
  });
}

const harness: RetHarness = {
  reactVersion: version,
  toast,
  mount(props = {}) {
    flushSync(() => root.render(<Toaster {...props} />));
  },
  unmount() {
    flushSync(() => root.render(null));
  },
  events,
  log,
  setStyle(css) {
    if (css === '') {
      scenarioStyle?.remove();
      scenarioStyle = null;
      return;
    }
    if (!scenarioStyle) {
      scenarioStyle = document.createElement('style');
      scenarioStyle.dataset.harness = 'scenario';
      document.head.append(scenarioStyle);
    }
    scenarioStyle.textContent = css;
  },
  toastRoot,
  toastState,
  progressState,
  focusState,
  focusFixture: mode => <FocusFixture mode={mode} />,
  sampleFrames,
};

void stylesheetLoaded().then(() => {
  harness.mount();
  window.__retHarness = harness;
});
