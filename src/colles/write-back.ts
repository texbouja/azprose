/**
 * Write-back des évaluations (Note, Observations) saisies dans le preview
 * vers le codeblock ```` ```colle ```` de la daily note.
 *
 * Ciblé par clé : seules les clés fournies sont réécrites ; les métadonnées
 * saisies à la main (matiere, eleve, …) sont préservées via round-trip yaml.
 *
 * PROTECTION YAML DES VALEURS LIBRES : le bloc est re-sérialisé par
 * `stringify` (package `yaml`, implémentation de référence YAML 1.2), qui
 * échappe AUTOMATIQUEMENT tout contenu hostile — colonnes (`: `), dièses,
 * guillemets, listes (`- item`), `true`/`123e5` (re-quotés pour rester des
 * chaînes), espaces de bord, et multi-lignes (scalaire bloc `|-`, contenu
 * verbatim). Le contenu de la textarea « observations » (markdown, LaTeX
 * `\frac{…}`, …) n'est JAMAIS injecté en clair : toute valeur qui ne serait
 * pas fidèle au round-trip est quotée. Garanti par les tests
 * `writeBackColleKeys — observations : protection YAML`.
 */
import { stringify } from "yaml";
import { findFichesSection, isFenceClose, isFenceOpen, parseColleYaml } from "./parse";
import { isColleMetaFence, parseMetaFence } from "@/lib/doc-meta";
import type { ColleMeta } from "./types";

interface FenceRange {
  /** Index de la ligne d'ouverture ```` ```colle ````. */
  start: number;
  /** Index de la ligne de fermeture ```` ``` ````. */
  end: number;
}

/** Nom du fence (`colle` ou `meta`) d'une ligne d'ouverture. */
function fenceLang(line: string): "colle" | "meta" {
  return line.trim().startsWith("```colle") ? "colle" : "meta";
}

/**
 * Localise le `index`-ième fence de COLLE à partir de `startLine`. Seuls les
 * fences dont le TYPE est "colle" comptent (```` ```colle ````, ou ```` ```meta ````
 * avec `type: colle`) — un ```` ```meta ```` de cours/exercices présent dans la
 * section ne décale pas le comptage du write-back.
 */
function locateFence(lines: string[], startLine: number, index: number): FenceRange | null {
  const n = lines.length;
  let i = startLine;
  let seen = 0;
  while (i < n) {
    if (isFenceOpen(lines[i])) {
      let j = i + 1;
      while (j < n && !isFenceClose(lines[j])) j++;
      const end = Math.min(j, n - 1);
      const content = lines.slice(i + 1, end).join("\n");
      if (isColleMetaFence(parseMetaFence(fenceLang(lines[i]), content))) {
        if (seen === index) return { start: i, end };
        seen++;
      }
      i = j; // saute le bloc entier (colle ou non)
    } else {
      i++;
    }
  }
  return null;
}

/**
 * Égalité profonde (dict `notes`, tableaux…) : `merged[k] !== v` ne suffit pas
 * pour les valeurs non scalaires — un nouvel objet `notes` est toujours
 * référentiellement différent même si son contenu est identique, ce qui
 * rendrait le write-back non idempotent (réécriture YAML à chaque flush).
 */
function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return (a as unknown[]).every((x, i) => deepEq(x, (b as unknown[])[i]));
    }
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    return (
      ka.length === kb.length &&
      ka.every((k) => deepEq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    );
  }
  return false;
}

/**
 * Réécrit des clés (notes, observations…) dans le `index`-ième bloc ```` ```colle ````
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
    } else if (!deepEq(merged[k], v)) {
      merged[k] = v;
      changed = true;
    }
  }
  if (!changed) return source;

  const yamlOut = stringify(merged).trimEnd();
  return [...lines.slice(0, fence.start + 1), yamlOut, ...lines.slice(fence.end)].join("\n");
}
