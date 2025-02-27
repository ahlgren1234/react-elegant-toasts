import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: 'demo',
  base: '/react-elegant-toasts/',
  build: {
    outDir: resolve(__dirname, 'demo-dist'),
    emptyOutDir: true,
    sourcemap: true,
  },
}) 