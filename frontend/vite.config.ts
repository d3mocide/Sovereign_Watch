import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Split the heavyweight vendors into their own chunks. Each chunk is
        // only fetched when a module that needs it loads (the map views, the
        // stats dashboard, …), and vendor chunks stay byte-identical across
        // app releases so browsers keep them cached.
        //
        // Function form (not the object form) so that ONLY these packages'
        // own modules land in the vendor chunks — the object form hoists
        // shared helper modules into them, which silently makes the entry
        // chunk depend on (and eagerly preload) the multi-MB vendors.
        manualChunks(id: string) {
          // Vite's dynamic-import preload helper is a virtual module shared
          // by every code-split chunk; isolate it so Rollup can't park it
          // inside a vendor chunk and drag that vendor into the entry.
          if (id.includes("vite/preload-helper")) return "preload-helper";
          if (!id.includes("node_modules")) return;
          if (id.includes("echarts") || id.includes("zrender")) {
            return "echarts";
          }
          if (id.includes("maplibre-gl")) return "maplibre";
          if (id.includes("mapbox-gl")) return "mapbox";
          if (
            id.includes("@deck.gl") ||
            id.includes("@luma.gl") ||
            id.includes("@loaders.gl") ||
            id.includes("@math.gl")
          ) {
            return "deck-gl";
          }
          if (
            id.includes("/react-dom/") ||
            id.includes("/react/") ||
            id.includes("/scheduler/")
          ) {
            return "react-vendor";
          }
        },
      },
    },
    // deck.gl and the map engines are inherently large single libraries;
    // raise the warning threshold so CI noise reflects real regressions.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    // Exclude Playwright E2E specs — those run via `pnpm exec playwright test`
    exclude: ["e2e/**", "node_modules/**"],
  },
  server: {
    port: 3700,
    host: true, // Listen on all interfaces (required for Docker)
    watch: {
      usePolling: true, // Required for Docker on Windows/Mac
      interval: 1000, // Poll every 1s (reduces CPU usage)
    },
    hmr: {
      // clientPort: 80, // Removed to allow auto-detection on HTTPS VPS
    },
    allowedHosts: true, // Allow nginx to proxy requests (host header will be 'frontend')
  },
});
