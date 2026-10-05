// P-19 D1 — TEMPORARY DEMO-ONLY PROTOTYPE CODE. Not library code, not public API, never shipped.
//
// Lightweight comparison instrumentation for the D2 review. Plain module state, read by the panel
// on its own timer, so recording never renders React.

export interface MoveRecord {
  readonly label: string;
  readonly position: string;
  readonly from: number;
  readonly to: number;
  readonly current: number;
  readonly offset: number;
}

const MAX_EVENTS = 40;

export const stats = {
  /** Membership batches that moved at least one toast. */
  batches: 0,
  moves: 0,
  /** Moves that started while the toast was still visibly offset by an earlier move. */
  interruptions: 0,
  /** Geometry refreshes with no membership change (size or viewport changes). */
  refreshes: 0,
  /** Commits of the Toaster subtree, counted by a demo React Profiler. */
  toasterCommits: 0,
  events: [] as string[],
  consoleLog: false,
};

export function resetStats(): void {
  stats.batches = 0;
  stats.moves = 0;
  stats.interruptions = 0;
  stats.refreshes = 0;
  stats.toasterCommits = 0;
  stats.events = [];
}

export function note(text: string): void {
  stats.events = [text, ...stats.events].slice(0, MAX_EVENTS);
  if (stats.consoleLog) console.debug(`[P-19 D1] ${text}`);
}

export function recordMoves(candidate: string, moves: readonly MoveRecord[]): void {
  if (moves.length === 0) return;
  stats.batches += 1;
  for (const move of moves) {
    stats.moves += 1;
    if (Math.abs(move.current) > 0.5) stats.interruptions += 1;
    note(
      `${candidate} ${move.position} "${move.label}" ${move.from}→${move.to}px` +
        ` cur ${move.current.toFixed(1)} Δ ${move.offset.toFixed(1)}`
    );
  }
}
