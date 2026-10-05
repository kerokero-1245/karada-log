import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages（https://<user>.github.io/karada-log/）に置く前提
export default defineConfig({
  base: '/karada-log/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'karada-log 減量・トレーニング管理',
        short_name: 'karada-log',
        description: '食事・トレーニング・体組成を記録する個人用アプリ。記録は端末のブラウザ内（IndexedDB）に保存し、写真の読み取りを使うときだけ画像を Claude API に送る',
        lang: 'ja',
        start_url: '/karada-log/',
        scope: '/karada-log/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        // PNG は public/icon.svg を描画したもの（図案は同じ）。SVG を読めない環境向けに PNG を先に並べる
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
});
