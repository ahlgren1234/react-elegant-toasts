// P-19 D1 — TEMPORARY DEMO-ONLY PROTOTYPE CODE. Not library code, not public API, never shipped.

/** One surviving toast whose anchored layout position changed in a membership batch. */
export interface Move {
  readonly item: HTMLElement;
  /** Its stack's position, for instrumentation. */
  readonly position: string;
  readonly label: string;
  /** Anchored-edge distances before and after, in layout space. */
  readonly from: number;
  readonly to: number;
  /** Its P-19 visual offset at the moment of the batch: non-zero when a move is interrupted. */
  readonly current: number;
  /** The translateY that puts it back exactly where it appeared: correction plus `current`. */
  readonly offset: number;
}

/** A repositioning technique. The shared harness measures; a candidate only moves. */
export interface Candidate {
  readonly name: string;
  /** Every read has already happened in the harness; a candidate writes (and B reads timing). */
  move(moves: readonly Move[]): void;
  /** Reposition animations currently running. */
  active(): number;
  /** Removes every trace of the candidate from the DOM. */
  dispose(): void;
}
