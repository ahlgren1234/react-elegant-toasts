import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  tsconfig: 'tsconfig.lib.json',
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  // Rollup's tree-shake pass strips module-level directives such as "use client".
  treeshake: false,
  banner: { js: '"use client";' },
  external: ['react', 'react-dom'],
});
