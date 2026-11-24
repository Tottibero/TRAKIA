import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'TRAKIA',
        short_name: 'TRAKIA',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0B0C0C',
        theme_color: '#0B0C0C',
        icons: [
          { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/pwa/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{css,html,ico,js,png,svg,webmanifest}'],
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3033',
        changeOrigin: true,
      },
    },
  },
})
