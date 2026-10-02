import '@testing-library/jest-dom/vitest';
import 'vitest-axe/extend-expect';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { resetStore } from './store/store';

afterEach(() => {
  cleanup();
  // Before restoring real timers, so a fake warning timer is cleared by the clock that created it.
  resetStore();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
