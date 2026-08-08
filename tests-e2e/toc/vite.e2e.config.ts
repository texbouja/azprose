import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [svelte({ include: [/\.svelte$/] })],
  resolve: {
    alias: { "@": path.resolve(__dirname, "../../src") },
  },
  build: {
    outDir: "/tmp/opencode/toc-e2e/dist",
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, "index.html") },
  },
  logLevel: "error",
});
