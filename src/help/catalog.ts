/**
 * Manifeste ordonné des articles de la documentation intégrée.
 *
 * MODULE PUR — aucun import svelte/tauri, testable sous bun.
 *
 * Les chemins sont RELATIFS au dossier d'installation de l'aide
 * (`<racine du projet>/.azprose/help/`). L'ordre du tableau définit la
 * séquence « article précédent / article suivant » du lecteur DocPreview.
 *
 * Le CONTENU (catalogue + version) est GÉNÉRÉ automatiquement par
 * `scripts/sync-help.mjs` depuis `docs/user/` — voir `catalog-data.ts`.
 * Seules les fonctions pures vivent ici à la main.
 */

import { catalog as HELP_CATALOG } from "./catalog-data";

export type HelpArticle = { path: string; title: string };

/** Racine de la doc : sa TOC est toujours affichée dans la sidebar, quel que
 *  soit l'article consulté (décision utilisateur). */
export const HELP_ROOT = "index.md";

/**
 * Version du bundle embarqué — le stamp `.azprose/help/version.txt` la compare
 * pour déclencher une réinstallation. GÉNÉRÉE par sync-help.mjs : hash du
 * contenu de `docs/user/` (même contenu → même version → aucune réinstallation ;
 * tout edit de doc change la version → réinstallation au prochain démarrage).
 * (Vivant dans catalog-data.ts, module PUR, pour que l'installation soit
 * testable sans évaluer `import.meta.glob`.)
 */
export { HELP_VERSION } from "./catalog-data";

export const catalog: HelpArticle[] = HELP_CATALOG;

function normalize(p: string): string {
  return p.replace(/\\/g, "/").split("/").filter((s) => s && s !== ".").join("/");
}

export function articleIndex(relPath: string): number {
  const n = normalize(relPath);
  return catalog.findIndex((a) => normalize(a.path) === n);
}

/** Articles voisins d'un article (précédent / suivant dans l'ordre du
 *  catalogue). Aucun voisin pour la racine ni les bords. */
export function neighbors(relPath: string): { prev?: HelpArticle; next?: HelpArticle } {
  const i = articleIndex(relPath);
  if (i < 0) return {};
  return {
    prev: i > 0 ? catalog[i - 1] : undefined,
    next: i >= 0 && i < catalog.length - 1 ? catalog[i + 1] : undefined,
  };
}

/** Chemin relatif (normalisé, anti-slash) d'un fichier par rapport au dossier
 *  help, ou `null` si le fichier n'en fait pas partie. */
export function helpRelativePath(filePath: string, helpDir: string): string | null {
  const dir = normalize(helpDir).replace(/\/+$/, "");
  const file = normalize(filePath);
  if (!file.startsWith(dir + "/")) return null;
  return file.slice(dir.length + 1);
}
