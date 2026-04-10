import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
// При работе без VITE_API_BASE_URL: проксируем /api на бэкенд (REST + WebSocket system-status).
// Если задан VITE_API_BASE_URL, клиент ходит на него напрямую — proxy не используется.
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern',
      },
      sass: {
        api: 'modern',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@store': path.resolve(__dirname, './src/store'),
      '@services': path.resolve(__dirname, './src/services'),
      '@api': path.resolve(__dirname, './src/api'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
    },
  },
  build: {
    // Не дробить React / MUI / Emotion / router по разным vendor-чанкам: в проде даёт
    // «Cannot access 'X' before initialization» (TDZ) из-за порядка загрузки чанков.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // Тяжёлая изолированная либа — ок в отдельном чанке
          if (id.includes('lightweight-charts')) return 'vendor-charts'
          return undefined
        },
      },
    },
    chunkSizeWarningLimit: 650,
  },
})
