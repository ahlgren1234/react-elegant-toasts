import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// P-22 browser harness (S1). It builds the real library from `src/` in production mode and is served
// by `vite preview` for Playwright (`playwright.config.ts`) and for manual checkpoints.

const PRODUCTION_STYLESHEET = fileURLToPath(new URL('../src/styles.css', import.meta.url));

// The production stylesheet, served byte for byte (D0-10). It is never imported through Vite's CSS
// pipeline, which would rewrite it: the file is read at build time, emitted unchanged as
// `/styles.css`, and linked from the page after Vite has processed the HTML. The smoke test compares
// the served bytes with `src/styles.css`.
function productionStylesheet(): Plugin {
  return {
    name: 'ret-production-stylesheet',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'styles.css',
        source: readFileSync(PRODUCTION_STYLESHEET),
      });
    },
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        { tag: 'link', attrs: { rel: 'stylesheet', href: '/styles.css' }, injectTo: 'head' },
      ],
    },
  };
}

export default defineConfig({
  plugins: [react(), productionStylesheet()],
  root: fileURLToPath(new URL('harness', import.meta.url)),
  base: '/',
  build: {
    outDir: fileURLToPath(new URL('../browser-dist', import.meta.url)),
    emptyOutDir: true,
    // The automated harness, and the manual QA page for S6's device checkpoints (`/manual.html`).
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('harness/index.html', import.meta.url)),
        manual: fileURLToPath(new URL('harness/manual.html', import.meta.url)),
      },
    },
  },
  // Loopback only by default; `npm run browser:serve -- --host` exposes it to a device on the local
  // network for a manual checkpoint.
  preview: { host: '127.0.0.1', port: 4180, strictPort: true },
});
