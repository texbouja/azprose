import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [
    svelte({
      onwarn(_warning, _defaultHandler) {},
      include: [/\.svelte$/],
    }),
  ],



  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    rollupOptions: {
      // Deux points d'entrée (vague 2, phase 2.2, ★A) : PROJET (index.html)
      // et NAV (nav.html) — chacun son propre socle, plus de branchement
      // runtime sur ?browse= dans un seul bundle partagé.
      input: {
        main: path.resolve(__dirname, "index.html"),
        nav: path.resolve(__dirname, "nav.html"),
      },
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/mathjax/")) return "mathjax";
        },
      },
    },
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
