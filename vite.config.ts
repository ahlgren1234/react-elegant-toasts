import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'demo'),
  base: '/react-elegant-toasts/',
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
