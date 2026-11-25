// Vite dev/build config for the Harness UI (WI-001 design.md §5.1, §6).
// Dev server: 127.0.0.1:5173, proxies /api to the backend on 127.0.0.1:7420 (same-origin in the browser).
// The session-token injection plugin is added in T5/T8.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:7420", changeOrigin: false },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
