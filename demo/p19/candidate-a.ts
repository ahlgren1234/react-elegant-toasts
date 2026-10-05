// P-19 D1 — TEMPORARY DEMO-ONLY PROTOTYPE CODE. Not library code, not public API, never shipped.
//
// Candidate A: measured offsets with a CSS transition, flow-delta architecture (P-19 D0,
// decision 2). The P-17 flex column stays authoritative and toasts stay in normal flow. For each
// moved toast:
//
//   1. seed: an internal class turns the transition off, and an inline `transform` puts the toast
//      back where it appeared (the harness's correction plus any offset still in flight);
//   2. one style flush commits that seed as the transition's start value;
//   3. release: the class and the inline transform go, so the computed `transform` returns to
//      `none` and `transition: transform` carries the toast to its real layout position.
//
// Interruption needs no special path: seeding turns the transition off, which cancels any running
// one, at the offset the harness sampled from the computed style. At rest the toast computes to
// `transform: none`. JavaScript holds no timing: duration and easing are CSS (p19-prototype.css),
// and reduced motion sets the duration to 0ms there, so the release is instant.
import type { Candidate, Move } from './candidate';

/** Internal class: transition off while the start offset is seeded. */
const SEED = 'demo-p19-seed';

export function createCandidateA(host: HTMLElement): Candidate {
  // Instrumentation only: running transitions, from events on the host element (not global).
  const running = new Set<EventTarget>();
  const isToastTransform = (event: Event) =>
    (event as TransitionEvent).propertyName === 'transform' &&
    event.target instanceof HTMLElement &&
    event.target.classList.contains('ret-toast');
  const onRun = (event: Event) => {
    if (isToastTransform(event) && event.target) running.add(event.target);
  };
  const onDone = (event: Event) => {
    if (isToastTransform(event) && event.target) running.delete(event.target);
  };
  host.addEventListener('transitionrun', onRun);
  host.addEventListener('transitionend', onDone);
  host.addEventListener('transitioncancel', onDone);

  const touched = new Set<HTMLElement>();

  return {
    name: 'A',
    move(moves: readonly Move[]) {
      for (const item of touched) if (!item.isConnected) touched.delete(item);
      const first = moves[0];
      if (!first) return;
      for (const { item, offset } of moves) {
        item.classList.add(SEED);
        item.style.transform = `translateY(${offset}px)`;
        touched.add(item);
      }
      // One flush for the whole batch: the seeded offsets become the transitions' start values.
      void first.item.offsetHeight;
      for (const { item } of moves) {
        item.classList.remove(SEED);
        item.style.removeProperty('transform');
        if (item.getAttribute('style') === '') item.removeAttribute('style');
      }
    },
    active() {
      for (const target of running) {
        if (!(target as Node).isConnected) running.delete(target);
      }
      return running.size;
    },
    dispose() {
      host.removeEventListener('transitionrun', onRun);
      host.removeEventListener('transitionend', onDone);
      host.removeEventListener('transitioncancel', onDone);
      // Cancel running transitions at once: the seed rule turns the transition off, which cancels
      // it, while the mode's rules still apply. Merely removing those rules would not: the
      // initial `transition-property` is `all`, so a running transition would play out.
      const items = [...touched].filter(item => item.isConnected);
      for (const item of items) {
        item.classList.add(SEED);
        item.style.removeProperty('transform');
        if (item.getAttribute('style') === '') item.removeAttribute('style');
      }
      if (items[0]) void items[0].offsetHeight;
      for (const item of items) item.classList.remove(SEED);
      touched.clear();
      running.clear();
    },
  };
}
