import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // The demo's tests cover its own code (P-25); coverage stays on the library.
    include: ['src/**/*.test.{ts,tsx}', 'demo/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/setupTests.ts'],
    // Vitest 4+ returns the existing spy when a method is spied again, so restore every spy after
    // each test (P-25 S8).
    restoreMocks: true,
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});
