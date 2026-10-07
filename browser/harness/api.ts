import type { ToasterProps, toast } from '../../src';

// The harness's control surface, read by the Playwright specs through `page.evaluate`. It is test
// infrastructure only: nothing here is exported by the package.

export interface HarnessEvent {
  readonly type: string;
  /** `performance.now()` in the page when the event was logged. */
  readonly time: number;
  readonly detail?: unknown;
}

/**
 * What the recorder logs for a DOM event or mutation on a toast. Specs label a toast by giving it the
 * class `h-<label>` (`className: "h-a"`); `label` is that label, or undefined for an unlabelled one.
 */
export interface ToastEventDetail {
  readonly label: string | undefined;
  /** Whether the event's target is the toast root itself, not a descendant. */
  readonly root: boolean;
  /** `animationName` or `propertyName`, for animation and transition events. */
  readonly name?: string;
  readonly trusted?: boolean;
  /** The new `data-phase`, for `phase` entries. */
  readonly phase?: string | null;
}

/** A toast's visual state in one frame. Lengths are CSS pixels. */
export interface ToastState {
  readonly connected: boolean;
  readonly phase: string | null;
  /** `getBoundingClientRect()`, so it includes every transform. */
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  /** Layout box, before transforms: `offsetTop` and `offsetHeight`. */
  readonly offsetTop: number;
  readonly offsetHeight: number;
  /** Computed `transform`, and its vertical translation (0 for `none`). */
  readonly transform: string;
  readonly transformY: number;
  /** Computed individual `translate` and `scale`, and their vertical parts (0 and 1 for `none`). */
  readonly translate: string;
  readonly translateY: number;
  readonly scale: string;
  readonly scaleY: number;
  readonly opacity: number;
  readonly animationName: string;
  readonly offsetParentIsList: boolean;
}

/** A rectangle from `getBoundingClientRect()`. */
export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/** A toast's progress indicator in one frame, read from the DOM and computed styles. */
export interface ProgressState {
  /** Whether the toast renders a `.ret-toast__progress` strip. */
  readonly present: boolean;
  /** The fill's horizontal scale from its computed `transform`: 1 is full, 0 is empty. */
  readonly scale: number;
  readonly playState: string;
  readonly strip: Box | null;
  readonly fill: Box | null;
}

export interface FrameSample<T> {
  /**
   * 0 is the synchronous read when sampling starts; n is the n-th `requestAnimationFrame`. A
   * mutation sample carries the number of the last frame before it.
   */
  readonly frame: number;
  readonly time: number;
  readonly value: T;
  /** Read when toast roots were added or removed (`atToastMutations`), not in a frame. */
  readonly mutation?: true;
}

export interface SampleOptions<T> {
  /** The most `requestAnimationFrame` callbacks to sample. */
  readonly maxFrames: number;
  /** Stops after the frame whose value satisfies it. */
  readonly until?: (value: T, frame: number) => boolean;
  /** Runs in the frame's callback, after that frame's read: a trigger placed here acts in that task. */
  readonly onFrame?: (frame: number) => void;
  /**
   * Also reads whenever toast roots are added or removed, in a MutationObserver callback: after the
   * renderer's commit and layout effects, before the next frame. That read is the first state the
   * commit produced, at its own time, which a frame read may come well after.
   */
  readonly atToastMutations?: boolean;
}

export interface RetHarness {
  /** The React version the page runs. */
  readonly reactVersion: string;
  /** The library's public facade, unchanged. */
  readonly toast: typeof toast;
  /** Renders `<Toaster {...props} />`, replacing the current props, and commits synchronously. */
  mount(props?: ToasterProps): void;
  /** Removes the Toaster and commits synchronously. */
  unmount(): void;
  /**
   * Events in order: those logged by scenarios, and those the harness records from page load on.
   * Recorded: `animationstart`, `animationiteration`, `animationend`, `animationcancel`,
   * `transitionrun`, `transitionstart`, `transitionend` and `transitioncancel` inside a toast, a
   * toast root's `phase` change, and a toast root `added` to or `removed` from the DOM, each with a
   * {@link ToastEventDetail}. Mutation entries are timed when their observer runs.
   */
  readonly events: HarnessEvent[];
  log(type: string, detail?: unknown): void;
  /**
   * Consumer-style CSS for the scenario, in one harness `<style>` after the production stylesheet;
   * replaces the previous one, and `""` removes it. Diagnostic only: token slowing and test markup.
   */
  setStyle(css: string): void;
  /** The root of the toast labelled `label`, if rendered. */
  toastRoot(label: string): HTMLElement | null;
  /** The visual state of the toast labelled `label` (`connected: false` once it is gone). */
  toastState(label: string): ToastState;
  /** The progress indicator of the toast labelled `label`. */
  progressState(label: string): ProgressState;
  /**
   * Samples `read` now (frame 0) and then in each `requestAnimationFrame` callback, never mocking
   * it. To observe a change from its first frame (D2-12), call this and make the change in the same
   * task, in one `page.evaluate`: frame 0 is then the state before the change, and frame 1 the first
   * frame after it.
   */
  sampleFrames<T>(read: () => T, options: SampleOptions<T>): Promise<FrameSample<T>[]>;
}

declare global {
  interface Window {
    /** Set once the stylesheet has loaded and the default Toaster is mounted. */
    __retHarness?: RetHarness;
  }
}
