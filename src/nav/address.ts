/**
 * Barre d'adresse de la fenêtre NAV (chantier fenêtre NAV, phase 2). MODULE
 * PUR — aucun import svelte/tauri, testable sous bun.
 *
 * R5 (plan) : la barre d'adresse ne change JAMAIS de racine — elle résout des
 * NOMS dans la racine courante, sémantique wikilink SANS crochets. Préfixe
 * `aide:`/`help:` = documentation intégrée. Le parsing est volontairement
 * séparé de la résolution (qui a besoin de l'index du vault / du catalogue de
 * l'aide, donc du monde réel) — extensible plus tard (`pdf:`, `file:`) sans
 * toucher au reste de la fenêtre.
 */

export type AddressKind = "help" | "vault";

export interface ParsedAddress {
  kind: AddressKind;
  /** Requête débarrassée du préfixe et des espaces de bord. */
  query: string;
}

const HELP_PREFIX = /^\s*(aide|help)\s*:\s*/i;

/** Parse la saisie de la barre d'adresse. Entrée vide/blanche → requête vide,
 *  jamais une erreur (c'est à l'appelant de décider quoi faire d'une requête
 *  vide — repli sur la racine de l'aide, no-op…). */
export function parseAddress(input: string): ParsedAddress {
  const raw = input ?? "";
  const m = raw.match(HELP_PREFIX);
  if (m) {
    return { kind: "help", query: raw.slice(m[0].length).trim() };
  }
  return { kind: "vault", query: raw.trim() };
}

/** Complétion vault (phase 2, point 4) : basenames de l'index du vault
 *  contenant `query` (insensible à la casse), triés alphabétiquement. Requête
 *  vide → aucune suggestion (pas de « tout lister » sur un champ vide). */
export function filterIndexEntries(
  index: Map<string, string>,
  query: string,
  limit = 20,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches = [...index.keys()].filter((base) => base.toLowerCase().includes(q));
  matches.sort((a, b) => a.localeCompare(b));
  return matches.slice(0, limit);
}

/** Complétion aide : mêmes règles, sur les TITRES du catalogue (plus lisibles
 *  qu'un chemin relatif pour un article de doc). */
export function filterHelpArticles<T extends { title: string }>(
  articles: T[],
  query: string,
  limit = 20,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return articles.filter((a) => a.title.toLowerCase().includes(q)).slice(0, limit);
}
