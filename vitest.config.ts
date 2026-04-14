import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@/domain': resolve(__dirname, 'src/domain'),
      '@/data': resolve(__dirname, 'src/data'),
      '@/application': resolve(__dirname, 'src/application'),
      '@/presentation': resolve(__dirname, 'src/presentation'),
      '@/infrastructure': resolve(__dirname, 'src/infrastructure'),
    },
  },
})
