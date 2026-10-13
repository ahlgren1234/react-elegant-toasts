import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // The demo's tests cover its own code (P-25); coverage stays on the library.
    include: ['src/**/*.test.{ts,tsx}', 'demo/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/setupTests.ts'],
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});
