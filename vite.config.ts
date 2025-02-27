import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: 'demo',
  base: '/react-elegant-toasts/',
  build: {
    outDir: '../demo-dist',
    sourcemap: true,
    emptyOutDir: true,
  },
}) 