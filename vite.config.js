import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: path.join(rootDir, 'web'),
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.join(rootDir, 'web', 'src'),
    },
  },
  server: {
    port: 4001,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4000',
    },
  },
  build: {
    outDir: path.join(rootDir, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
})
