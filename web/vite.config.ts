/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: { outDir: 'dist' },
  test: {
    setupFiles: ['./src/testSetup.ts'],
    environment: 'jsdom',
    globals: true,
  },
})
