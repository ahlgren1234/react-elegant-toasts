import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'fs';
import { resolve } from 'path';

// The demo consumes the built package through its public exports (§31): the two specifiers a
// consumer imports resolve to `dist/`, as the package's `exports` map does. The demo scripts build
// the package first.
const PACKAGE_ENTRY = resolve(__dirname, 'dist/index.js');
const PACKAGE_STYLES = resolve(__dirname, 'dist/styles.css');
const missing = [PACKAGE_ENTRY, PACKAGE_STYLES].filter(path => !existsSync(path));
if (missing.length > 0) {
  throw new Error(
    `The demo uses the built package, but ${missing.join(' and ')} ${missing.length > 1 ? 'do' : 'does'} not exist. Run \`npm run build\` first.`
  );
}

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'demo'),
  base: '/react-elegant-toasts/',
  resolve: {
    alias: [
      { find: /^react-elegant-toasts$/, replacement: PACKAGE_ENTRY },
      { find: /^react-elegant-toasts\/styles\.css$/, replacement: PACKAGE_STYLES },
    ],
  },
  build: {
    outDir: resolve(__dirname, 'demo-dist'),
    emptyOutDir: true,
    sourcemap: true,
    // Vite's default CSS target with Chrome and Edge raised to 120, the first with `:dir()`. Below
    // that, Lightning CSS rewrites the stylesheet's `:dir(rtl)` as `:lang()`, which breaks RTL.
    cssTarget: ['chrome120', 'edge120', 'firefox114', 'safari16.4', 'ios16.4'],
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'demo/index.html'),
      },
    },
  },
});
