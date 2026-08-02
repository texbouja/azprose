/**
 * Write-back des évaluations (Note, Observations) saisies dans le preview
 * vers le codeblock ```` ```colle ```` de la daily note.
 *
 * Ciblé par clé : seules les clés fournies sont réécrites ; les métadonnées
 * saisies à la main (matiere, eleve, …) sont préservées via round-trip yaml.
 */
import { stringify } from "yaml";
import { findFichesSection, isFenceClose, isFenceOpen, parseColleYaml } from "./parse";
import type { ColleMeta } from "./types";

interface FenceRange {
  /** Index de la ligne d'ouverture ```` ```colle ````. */
  start: number;
  /** Index de la ligne de fermeture ```` ``` ````. */
  end: number;
}

/** Localise le `index`-ième fence `colle` à partir de `startLine`. */
function locateFence(lines: string[], startLine: number, index: number): FenceRange | null {
  const n = lines.length;
  let i = startLine;
  let seen = 0;
  while (i < n) {
    if (isFenceOpen(lines[i])) {
      if (seen === index) {
        let j = i + 1;
        while (j < n && !isFenceClose(lines[j])) j++;
        return { start: i, end: Math.min(j, n - 1) };
      }
      seen++;
    }
    i++;
  }
  return null;
}

/**
 * Réécrit des clés (note, observations…) dans le `index`-ième bloc ```` ```colle ````
 * du source. Retourne le source modifié — identique si aucune valeur ne change ou
 * si le bloc est introuvable.
 *
 * Sémantique de suppression : une valeur `null`, `undefined` ou chaîne vide
 * RETIRE la clé du bloc (round-trip yaml) — utile quand l'utilisateur efface
 * une note déjà saisie.
 */
export function writeBackColleKeys(
  source: string,
  index: number,
  keys: Partial<ColleMeta>,
): string {
  const lines = source.split(/\r?\n/);
  const sectionStart = findFichesSection(lines);
  const start = sectionStart < 0 ? 0 : sectionStart;
  const fence = locateFence(lines, start, index);
  if (!fence) return source;

  const blockSource = lines.slice(fence.start + 1, fence.end).join("\n");
  const merged: Record<string, unknown> = { ...parseColleYaml(blockSource) };

  let changed = false;
  for (const [k, v] of Object.entries(keys)) {
    const empty = v === null || v === undefined || v === "";
    if (empty) {
      if (k in merged && merged[k] !== undefined) {
        delete merged[k];
        changed = true;
      }
    } else if (merged[k] !== v) {
      merged[k] = v;
      changed = true;
    }
  }
  if (!changed) return source;

  const yamlOut = stringify(merged).trimEnd();
  return [...lines.slice(0, fence.start + 1), yamlOut, ...lines.slice(fence.end)].join("\n");
}
