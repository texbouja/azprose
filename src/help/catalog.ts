/**
 * Manifeste des articles de la documentation intégrée.
 *
 * MODULE PUR — aucun import svelte/tauri, testable sous bun.
 *
 * Les chemins sont RELATIFS au dossier d'installation de l'aide
 * (`<racine du projet>/.azprose/help/`).
 *
 * (chantier fenêtre NAV, phase 7 — R9) Le catalogue ne pilote plus AUCUNE
 * navigation (`articleIndex`/`neighbors` supprimées) : le précédent/suivant
 * du lecteur se dérive désormais de l'ordre du `sommaire:` déclaré dans
 * `index.md` (noyau TOC déclaratif, `@/lib/toc-declared`), comme n'importe
 * quel document du vault. `catalog` reste la liste PLATE {path,titre} qui
 * alimente la complétion `aide:`/`help:` de la barre d'adresse NAV
 * (`@/nav/address` → `filterHelpArticles`) — un index de RECHERCHE, pas un
 * ordre de lecture.
 *
 * Le CONTENU (catalogue + version) est GÉNÉRÉ automatiquement par
 * `scripts/sync-help.mjs` depuis `docs/user/` — voir `catalog-data.ts`.
 */

import { catalog as HELP_CATALOG } from "./catalog-data";

export type HelpArticle = { path: string; title: string };

/** Racine de la doc : point d'entrée du `sommaire:` déclaré. */
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

/** Chemin relatif (normalisé, anti-slash) d'un fichier par rapport au dossier
 *  help, ou `null` si le fichier n'en fait pas partie. */
export function helpRelativePath(filePath: string, helpDir: string): string | null {
  const dir = normalize(helpDir).replace(/\/+$/, "");
  const file = normalize(filePath);
  if (!file.startsWith(dir + "/")) return null;
  return file.slice(dir.length + 1);
}
