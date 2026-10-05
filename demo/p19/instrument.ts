// P-19 — TEMPORARY DEMO-ONLY CHECKPOINT CODE. Not library code, not public API, never shipped.
// Removed with the rest of demo/p19 in P-19 S5.
//
// Light instrumentation for the manual checkpoints. Plain module state, read by the panel on its
// own timer, so recording never renders React.

const MAX_EVENTS = 40;

export const stats = {
  /** Reposition transitions started on toast roots (`transitionrun` for `transform`). */
  moves: 0,
  /** Commits of the Toaster subtree, counted by a demo React Profiler. */
  toasterCommits: 0,
  events: [] as string[],
  consoleLog: false,
};

export function resetStats(): void {
  stats.moves = 0;
  stats.toasterCommits = 0;
  stats.events = [];
}

export function note(text: string): void {
  stats.events = [text, ...stats.events].slice(0, MAX_EVENTS);
  if (stats.consoleLog) console.debug(`[P-19] ${text}`);
}
