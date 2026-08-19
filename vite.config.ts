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
      // Mermaid compose les maths de ses libellés en important `katex` et en
      // appelant `katex.renderToString`, puis il MESURE le résultat pour
      // dimensionner la boîte. Cet alias détourne ce point d'ancrage vers
      // MathJax : les formules d'un diagramme sont donc composées avec le
      // préambule du projet et ses macros, et Mermaid garde la main sur les
      // mesures. Voir `src/lib/katex-mathjax.ts`.
      katex: path.resolve(__dirname, "./src/lib/katex-mathjax.ts"),
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
          // Les polices mathématiques vivent dans leurs propres paquets
          // (`@mathjax/mathjax-<nom>-font`) : sans cette règle, celle de Fira
          // atterrirait dans un chunk quelconque au lieu du sien.
          if (id.includes("/node_modules/@mathjax/")) return "mathjax-font";
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
