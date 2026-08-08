import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  root,
  base: "./",
  plugins: [svelte()],
  resolve: {
    alias: { "@": path.join(root, "src") },
  },
  build: {
    outDir: "/tmp/opencode/preview-click-e2e/dist",
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(root, "tests-e2e/preview-click/index.html"),
    },
  },
  server: { port: 1421 },
});
