/**
 * Mémoïsation de la TOC sidebar (phases 6/6bis du plan de refonte) — hash
 * STRUCTURAL d'un contenu markdown : seuls les éléments qui apparaissent dans
 * le plan comptent — les headings (niveau, ligne, texte) et les wikilinks
 * block-level conformes (cible, ligne, alias) qui produisent des branches
 * transcluses. Le texte de corps (paragraphes, fences de colles, YAML,
 * images…) n'apparaît jamais dans la TOC : une évaluation de colle ou une
 * correction dans un paragraphe ne change donc PAS le hash → la forêt reste
 * mémoïsée (aucun rebuild, aucune re-lecture des fichiers liés).
 *
 * Module PUR : aucune dépendance Svelte/Tauri — testable sous bun.
 */

import { parseMarkdownToc } from "@/lib/markdown-toc";
import { findBlockWikilinks } from "@/markdown/print-expand";
import type { TocForest } from "@/lib/toc-forest";

/** Hash djb2 (32 bits non signé, hex) — déterministe, pas cryptographique. */
function djb2(parts: string[]): string {
  let h = 5381;
  for (const s of parts) {
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    }
  }
  return h.toString(16);
}

/**
 * Hash STRUCTURAL d'un contenu — voir en-tête de module. Deux contenus
 * produisent le même hash ssi leur plan est identique : mêmes titres aux
 * mêmes niveaux/lignes, mêmes liens block-level aux mêmes lignes (alias
 * inclus). Tout ce qui ne structure pas la TOC (corps, math, front matter,
 * fences) est ignoré.
 */
export function structuralTocHash(source: string): string {
  const parts: string[] = [];
  for (const e of parseMarkdownToc(source)) {
    parts.push(`H:${e.level}:${e.line}:${e.text}`);
  }
  for (const l of findBlockWikilinks(source)) {
    parts.push(`L:${l.target}:${l.line}:${l.alias ?? ""}`);
  }
  return djb2(parts);
}

/**
 * Mémoïsation in-place de `buildTocForest` — UNE instance par panneau TOC
 * (stockée dans le composant, jamais partagée entre onglets : la clé porte
 * le fichier de référence et le rootPath).
 *
 * Le HIT exige les trois conditions réunies :
 *  - même clé `referencePath::rootPath` (changement de fichier → rebuild) ;
 *  - même hash STRUCTURAL du contenu affiché (frappe dans le corps → no-op) ;
 *  - même `displayPath` (la création/suppression d'un index.md lié change le
 *    fichier affiché à clé identique → rebuild).
 *
 * Sur un hit, l'arbre mémoïsé est retourné TEL QUEL : aucune re-lecture des
 * fichiers liés, aucune re-transclusion, aucune ré-allocation de nœuds.
 */
export interface TocMemo {
  key: string;
  hash: string;
  forest: TocForest | null;
}

/** Instance initiale (jamais de hit : clé vide). */
export function makeTocMemo(): TocMemo {
  return { key: "", hash: "", forest: null };
}
