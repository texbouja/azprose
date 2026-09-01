// Path comparison utilities, separator- and case-aware so project-conflict logic
// is correct on Windows (back-slashes, case-insensitive) as well as Unix.
import { IS_WINDOWS } from "./platform";

function normForCompare(p: string): string {
  const s = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return IS_WINDOWS ? s.toLowerCase() : s;
}

export type FolderRelation = "same" | "nested" | "disjoint";

/**
 * Relationship between two folder paths:
 * - `same`     — identical folder
 * - `nested`   — one is an ancestor/descendant of the other (FS overlap)
 * - `disjoint` — no overlap
 *
 * Compares whole path segments (not raw string prefixes), so `/foo` does not
 * match `/foobar`.
 */
export function folderRelation(a: string, b: string): FolderRelation {
  const na = normForCompare(a);
  const nb = normForCompare(b);
  if (na === nb) return "same";
  if (na.startsWith(nb + "/") || nb.startsWith(na + "/")) return "nested";
  return "disjoint";
}

/**
 * `chemin` est-il DANS `dossier` (ou le dossier lui-même) ?
 *
 * Orienté, contrairement à `folderRelation` qui rend `nested` dans les deux
 * sens : ici l'ancêtre est forcément `dossier`. C'est la question qu'on pose
 * d'un fichier vis-à-vis d'une racine, et la réponse symétrique y serait fausse
 * (le parent d'un coffre n'est pas dans le coffre).
 *
 * Comparaison par SEGMENTS — `/foo` ne contient pas `/foobar` — et insensible
 * à la casse comme aux séparateurs sous Windows (via `normForCompare`).
 *
 * ⚠️ Un `dossier` vide rend toujours `false`. Sans ce garde-fou, `"" + "/"`
 * serait un préfixe de tout chemin absolu : une entrée vide égarée dans un
 * périmètre y autoriserait l'intégralité du disque. Un coffre à la racine du
 * système (`/`) tombe dans le même cas et se voit donc refusé — état absurde,
 * pour lequel refuser est le bon défaut.
 */
export function estSous(chemin: string, dossier: string): boolean {
  const c = normForCompare(chemin);
  const d = normForCompare(dossier);
  if (!d) return false;
  return c === d || c.startsWith(d + "/");
}

/**
 * `chemin` appartient-il au périmètre du coffre ?
 *
 * Le périmètre est `[racine, ...dossiers invités]` (arbitrage A du
 * 2026-08-31) : les invités sont ouverts À CÔTÉ du projet et sont donc, par
 * décision, du contenu légitime. Un périmètre vide n'autorise rien — c'est
 * l'état « aucun projet ouvert », où l'éditeur n'est de toute façon pas monté.
 */
export function dansPerimetre(chemin: string, perimetre: readonly string[]): boolean {
  return perimetre.some((dossier) => estSous(chemin, dossier));
}
