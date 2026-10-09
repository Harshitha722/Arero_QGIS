import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/\/(react|react-dom|scheduler)\//.test(id)) return "react-vendor";
          if (/\/(leaflet|react-leaflet)\//.test(id)) return "map-vendor";
          if (/\/recharts\//.test(id)) return "charts-vendor";
          if (/\/d3-[^/]+\//.test(id)) return "d3-vendor";
          if (/\/(proj4|mgrs|wkt-parser)\//.test(id)) return "projection-vendor";
          return undefined;
        },
      },
    },
  },
});
