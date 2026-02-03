import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // Listen on all interfaces (required for Docker)
    watch: {
      usePolling: true, // Required for Docker on Windows/Mac
      interval: 1000,   // Poll every 1s (reduces CPU usage)
    },
    hmr: {
      port: 3000, // HMR WebSocket port (same as server)
    },
    proxy: {
      '/api': {
        target: 'http://sovereign-backend:8000',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying
      }
    }
  },
  resolve: {
    alias: {
      'mapbox-gl': 'maplibre-gl'
    }
  }
})
