/**
 * Front matter YAML — parsing PUR des métadonnées d'en-tête (`---…---`).
 * Module sans dépendance Svelte/Tauri : testable sous `bun test`.
 *
 * Depuis la refonte YAML, le front matter passe par le parser UNIFIÉ
 * `parseYamlMap` (src/lib/doc-meta.ts) : vue structurée `values` (scope du
 * moteur de templating — scalaires, booléens, tableaux, objets) et vue plate
 * `meta` (affichage : titre, auteur, date, logo…). Repli tolérant ligne à
 * ligne si le YAML est invalide (paires `clé: valeur` simples conservées).
 * N'importe quelle clé est préservée — le catalogue doc-meta est une aide
 * pour l'UI, pas une restriction ici.
 */
import { parseYamlMap, flattenYamlMap } from "./doc-meta";

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export interface FrontMatter {
  /** Vue PLATE (chaînes) — affichage (carte d'en-tête, logos…). */
  meta: Record<string, string>;
  /** Vue STRUCTURÉE — scope du moteur de templating. */
  values: Record<string, unknown>;
  body: string;
  /** Number of lines the front matter occupies in the original source (0 if none). */
  fmLineCount: number;
}

export function parseFrontMatter(src: string): FrontMatter {
  const m = FM_RE.exec(src);
  if (!m) return { meta: {}, values: {}, body: src, fmLineCount: 0 };

  const values = parseYamlMap(m[1]);
  const meta = flattenYamlMap(values);
  // Count lines consumed by the front matter block so that data-sline
  // values (relative to the body) can be shifted back to absolute
  // positions in the original source.
  const fmLineCount = (m[0].match(/\r?\n/g) || []).length;
  return { meta, values, body: src.slice(m[0].length), fmLineCount };
}
