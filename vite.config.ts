import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig({
  base: '/pokemon-champions-damage-calc/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'ポケモンチャンピオンズ ダメージ計算ツール',
        short_name: 'チャンピオンズ計算機',
        description: 'Pokemon Champions シングルバトル専用ダメージ計算ツール',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pokemon-data',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@/domain': resolve(__dirname, 'src/domain'),
      '@/data': resolve(__dirname, 'src/data'),
      '@/application': resolve(__dirname, 'src/application'),
      '@/presentation': resolve(__dirname, 'src/presentation'),
      '@/infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@/utils': resolve(__dirname, 'src/utils'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pokemon-data': [
            './src/data/json/pokemon.json',
            './src/data/json/pokemon-mega.json',
          ],
          'move-data': ['./src/data/json/moves.json'],
          vendor: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
})
