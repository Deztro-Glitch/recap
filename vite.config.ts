import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// BASE_PATH sätts av GitHub Actions till "/<repo-namn>/" vid publicering på GitHub Pages.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'push-sw.js'],
      // Påminnelserna (Web Push) tas emot av push-sw.js, som läses in i den genererade service workern.
      workbox: { importScripts: ['push-sw.js'] },
      manifest: {
        name: 'Recap',
        short_name: 'Recap',
        description: 'Hemmet och ekonomin: kvitton, budget, projekt och underhåll',
        theme_color: '#050505',
        background_color: '#050505',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
