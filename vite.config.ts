import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [
    svelte({
      include: [/\.svelte$/, /node_modules\/lucide-svelte\/.*\.svelte$/],
      dynamicCompileOptions({ filename }: { filename: string }) {
        if (filename.includes("node_modules/lucide-svelte")) {
          return { runes: false };
        }
        return {};
      },
      onwarn(_warning, _defaultHandler) {},
    }),
  ],

  optimizeDeps: {
    exclude: ["lucide-svelte"],
  },

  ssr: {
    noExternal: ["lucide-svelte"],
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // mathjax-full (via @marp-team/marp-core) calls MathJax.loader.preLoad() at
      // module init — incompatible with mathjax/tex-svg.js which has no loader API.
      // Safe stub since marp-core is used with math:false.
      "mathjax-full/js/input/tex/AllPackages.js": path.resolve(
        __dirname, "./src/stubs/mathjax-all-packages.js"
      ),
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
