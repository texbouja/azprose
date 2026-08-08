/**
 * Charge les fichiers markdown de la documentation embarquée.
 *
 * `import.meta.glob` + `query: "?raw"` + `eager: true` → Vite/rolldown inline
 * les contenus dans le bundle JS : la doc vit DANS l'exécutable final, aucun
 * accès disque à la compilation. Les clés retournées sont relatives au
 * dossier help (ex. `03-wikilinks.md`).
 */
const modules = import.meta.glob("./md/**/*.md", { query: "?raw", import: "default", eager: true });

export function getHelpBundle(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, content] of Object.entries(modules)) {
    const rel = key.replace(/^\.\/md\//, "");
    out[rel] = content as string;
  }
  return out;
}
