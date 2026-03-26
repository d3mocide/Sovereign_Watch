import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cesium from 'vite-plugin-cesium'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cesium()],
  server: {
    port: 3700,
    host: true, // Listen on all interfaces (required for Docker)
    watch: {
      usePolling: true, // Required for Docker on Windows/Mac
      interval: 1000,   // Poll every 1s (reduces CPU usage)
    },
    hmr: {
      clientPort: 80, // HMR WebSocket connects through nginx on port 80
    },
    allowedHosts: true, // Allow nginx to proxy requests (host header will be 'frontend')
  },
})
