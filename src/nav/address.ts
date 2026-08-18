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

export type AddressKind = "help" | "programme" | "vault";

export interface ParsedAddress {
  kind: AddressKind;
  /** Requête débarrassée du préfixe et des espaces de bord. */
  query: string;
}

const HELP_PREFIX = /^\s*(aide|help)\s*:\s*/i;
/** Programmes officiels — fr et en, plus l'abrégé courant. */
const PROGRAMME_PREFIX = /^\s*(programmes?|programs?|prog)\s*:\s*/i;

/** Parse la saisie de la barre d'adresse. Entrée vide/blanche → requête vide,
 *  jamais une erreur (c'est à l'appelant de décider quoi faire d'une requête
 *  vide — repli sur la racine de l'aide, liste complète des programmes…). */
export function parseAddress(input: string): ParsedAddress {
  const raw = input ?? "";
  const aide = raw.match(HELP_PREFIX);
  if (aide) {
    return { kind: "help", query: raw.slice(aide[0].length).trim() };
  }
  const prog = raw.match(PROGRAMME_PREFIX);
  if (prog) {
    return { kind: "programme", query: raw.slice(prog[0].length).trim() };
  }
  return { kind: "vault", query: raw.trim() };
}

/**
 * Déplacement de la sélection clavier dans une liste de suggestions, avec
 * bouclage. `-1` = aucune sélection (le texte saisi fait foi) : une première
 * flèche ↓ prend donc la première ligne, une première ↑ la dernière.
 *
 * Extrait du composant pour être testable : c'est la mécanique que l'on casse
 * sans s'en apercevoir en touchant au gabarit.
 */
export function deplacerSelection(index: number, taille: number, sens: 1 | -1): number {
  if (taille <= 0) return -1;
  // « Aucune sélection » n'est pas la position -1 d'un anneau : c'est un état à
  // part, d'où l'on entre par le HAUT de la liste avec ↓ et par le BAS avec ↑.
  // Le calcul modulaire seul donnait l'avant-dernière ligne pour un ↑ initial
  // (-1 - 1 + n) % n = n - 2 — défaut hérité de la complétion du vault, resté
  // invisible tant que personne n'a remonté la liste sans l'avoir descendue.
  if (index < 0) return sens === 1 ? 0 : taille - 1;
  return (index + sens + taille) % taille;
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
