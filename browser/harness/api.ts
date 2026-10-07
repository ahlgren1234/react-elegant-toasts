import type { ToasterProps, toast } from '../../src';

// The harness's control surface, read by the Playwright specs through `page.evaluate`. It is test
// infrastructure only: nothing here is exported by the package.

export interface HarnessEvent {
  readonly type: string;
  /** `performance.now()` in the page when the event was logged. */
  readonly time: number;
  readonly detail?: unknown;
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
  /** Events logged by scenarios, in order. */
  readonly events: HarnessEvent[];
  log(type: string, detail?: unknown): void;
}

declare global {
  interface Window {
    /** Set once the stylesheet has loaded and the default Toaster is mounted. */
    __retHarness?: RetHarness;
  }
}
