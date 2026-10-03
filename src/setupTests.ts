import '@testing-library/jest-dom/vitest';
import 'vitest-axe/extend-expect';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi, type MockInstance } from 'vitest';
import { resetStore } from './store/store';

// jsdom reports an unfocused document until something is focused, which would start every
// Toaster with its window-blur pause on (§10). Tests see a focused window unless they override it
// with `vi.spyOn(document, 'hasFocus').mockReturnValue(false)`. Node-environment suites have no
// document.
let hasFocus: MockInstance<() => boolean> | undefined;
beforeEach(() => {
  if (typeof document === 'undefined') return;
  hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  // Before restoring real timers, so a fake warning timer is cleared by the clock that created it.
  resetStore();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  hasFocus?.mockRestore();
  hasFocus = undefined;
});
