import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [
    svelte({
      onwarn(_warning, _defaultHandler) {},
      include: [/\.svelte$/],
      exclude: [/node_modules\/(?!phosphor-svelte).*/],
    }),
  ],



  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/mathjax/")) return "mathjax";
        },
      },
    },
  },

  optimizeDeps: {
    exclude: ["phosphor-svelte"],
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
