import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Оптимизация CSS
  css: {
    preprocessorOptions: {
      css: {
        charset: false
      }
    },
    // Минификация CSS в production
    devSourcemap: false
  },
  
  // Настройки сервера для разработки
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
      }
    }
  },
  
  // Оптимизация сборки для production
  build: {
    outDir: 'dist',
    // Source maps только в development или для отладки
    sourcemap: process.env.NODE_ENV === 'development',
    
    // Минификация
    minify: 'esbuild', // Быстрее чем terser, но можно использовать 'terser' для лучшей минификации
    
    // Оптимизация размера
    target: 'es2020',
    cssTarget: 'chrome80',
    
    // Увеличиваем лимит предупреждений о размере чанков
    chunkSizeWarningLimit: 1000,
    
    // Оптимизация rollup
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        // Именование чанков для лучшего кеширования
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (!assetInfo.name) {
            return `assets/[name]-[hash][extname]`
          }
          const info = assetInfo.name.split('.')
          const ext = info[info.length - 1]
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`
          }
          if (/woff2?|eot|ttf|otf/i.test(ext)) {
            return `assets/fonts/[name]-[hash][extname]`
          }
          return `assets/[ext]/[name]-[hash][extname]`
        },
        
        // Оптимизация code splitting
        manualChunks: (id: string) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            // React и React DOM отдельно
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react'
            }
            // PrimeReact отдельно (большая библиотека)
            if (id.includes('primereact')) {
              return 'vendor-prime'
            }
            // Chart.js отдельно
            if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
              return 'vendor-charts'
            }
            // Router отдельно
            if (id.includes('react-router')) {
              return 'vendor-router'
            }
            // Остальные vendor библиотеки
            return 'vendor'
          }
        }
      }
    },
    
    // Оптимизация esbuild
    esbuild: {
      exclude: ['node_modules'],
      // Удаление console и debugger в production
      drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : []
    },
    
    // Отчет о размере бандла
    reportCompressedSize: true,
    
    // Оптимизация CSS
    cssCodeSplit: true
  },
  
  // Оптимизация зависимостей
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'primereact',
      'react-router-dom',
      'chart.js',
      'react-chartjs-2',
      'quill',
      'axios',
      'js-cookie'
    ],
    exclude: ['primeicons']
  },
  
  // Разрешение путей
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  
})
