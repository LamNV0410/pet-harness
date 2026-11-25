// Vite dev/build config for the Harness UI (WI-001 design.md §5.1, §6).
// Dev server: 127.0.0.1:5173, proxies /api to the backend on 127.0.0.1:7420 (same origin in the browser).
// In dev, a small plugin injects the session token meta tag from HARNESS_HOME/session.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const harnessHome = process.env.HARNESS_HOME ?? resolve(__dirname, "..", "..", ".harness");

function devSessionToken(): Plugin {
  return {
    name: "harness-dev-session-token",
    apply: "serve",
    transformIndexHtml(html) {
      const file = resolve(harnessHome, "session");
      const token = existsSync(file) ? readFileSync(file, "utf8").trim() : "";
      return html.replace(
        "</head>",
        `  <meta name="harness-session-token" content="${token}" />\n  </head>`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), devSessionToken()],
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
