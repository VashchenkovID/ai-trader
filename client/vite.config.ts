import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      css: {
        charset: false
      }
    }
  },
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
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          prime: ['primereact'],
          router: ['react-router-dom']
        }
      }
    }
  },
  esbuild: {
    exclude: ['node_modules']
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'primereact', 'react-router-dom', 'chart.js', 'quill'],
    exclude: ['primeicons']
  }
})
