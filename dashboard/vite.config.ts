import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

/**
 * Vite config con:
 *  - Code-splitting manual por dominio (vendor, ui, query)
 *  - Bundle visualizer activable con `npm run analyze` (env ANALYZE=true)
 *  - Sourcemaps en build para perfiling de prod
 *  - cssCodeSplit + assetsInlineLimit conservador para HTTP/2 multiplex
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    process.env.ANALYZE === 'true' &&
      visualizer({
        filename: 'dist/bundle-stats.html',
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
        open: false,
      }),
  ].filter(Boolean) as never,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: mode !== 'production' ? 'inline' : true,
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        // Manual chunks separa vendor pesado del bundle de la app
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'query-vendor': ['@tanstack/react-query', '@tanstack/react-query-persist-client'],
          'state-vendor': ['zustand'],
          'http-vendor': ['axios'],
        },
      },
    },
    // Falla el build si pasa los thresholds de tamaño objetivo
    chunkSizeWarningLimit: 500, // KB
  },
}))
