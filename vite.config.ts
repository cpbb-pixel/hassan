import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'سُفرة POS — نظام نقاط البيع والمطاعم',
          short_name: 'سُفرة POS',
          description: 'تطبيق سطح مكتب متكامل لنقاط البيع وإدارة المطاعم والمحاسبة والمخزون.',
          theme_color: '#0B1D36',
          background_color: '#071324',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone'],
          orientation: 'any',
          lang: 'ar',
          dir: 'rtl',
          scope: '/',
          start_url: '/?mode=pos',
          categories: ['business', 'finance', 'productivity'],
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
          shortcuts: [
            {
              name: 'نقطة البيع (الكاشير)',
              short_name: 'الكاشير',
              description: 'فتح شاشة البيع وإصدار الفواتير مباشرة',
              url: '/?mode=pos',
              icons: [{src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png'}],
            },
            {
              name: 'الطلبات والطاولات',
              short_name: 'الطاولات',
              description: 'متابعة حالة الطاولات والمطبخ',
              url: '/?mode=orders',
              icons: [{src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png'}],
            },
            {
              name: 'لوحة التحكم والتقارير',
              short_name: 'التقارير',
              description: 'عرض المبيعات والأرباح والتقارير',
              url: '/?mode=dashboard',
              icons: [{src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png'}],
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,jpg}'],
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: {maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365},
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365},
                cacheableResponse: {statuses: [0, 200]},
              },
            },
            {
              urlPattern: /\/api\/(menu|tables|settings)$/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'sufra-pos-core-data',
                networkTimeoutSeconds: 4,
                expiration: {maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7},
                cacheableResponse: {statuses: [0, 200]},
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
