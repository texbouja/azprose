/**
 * Parsing des planches de colles dans une daily note.
 *
 * Logique pure (pas de DOM) — réutilisable par le preview normal, CollePreview,
 * et la future vue DataFilter (table de métadonnées).
 *
 * Fences : ```` ```colle ```` est une SPÉCIALISATION du fence officiel
 * ```` ```meta ```` (= ```` ```meta ```` + `type: colle`). Le nom du fence est
 * AUTORITAIRE : ```` ```colle ```` force `type = "colle"` même si le YAML dit
 * autre chose ou rien.
 */
import { parse } from "yaml";
import type { ColleMeta, CollePlanche, CollesSection } from "./types";

/** Ligne d'ouverture d'un bloc de métadonnées : ```meta ou ```colle
 * (éventuellement suivi d'infos ignorées). ```colle est une spécialisation de
 * ```meta (type forcé "colle"). */
export const FENCE_OPEN_RE = /^```(?:colle|meta)(?:[ \t]+.*)?$/;
/** Ligne de fermeture d'un fence. */
export const FENCE_CLOSE_RE = /^```[ \t]*$/;
/** Ligne de séparation de planches : ligne horizontale à tirets (convention
 * SlideDeck), tolérante aux espaces/tabulations — CommonMark : 0-3 espaces
 * d'indentation, 3+ tirets, espacements/tabulations de fin optionnels.
 * `markdown-it` rend `<hr>` pour toutes ces variantes (`---`, `--- `, ` ---`,
 * `----`, …) : le parser doit les reconnaître TOUTES pour retirer au parsing
 * la séparation (sinon le `---` fuit dans le corps d'une planche ou dans le
 * rendu HTML du preview). */
export const HR_RE = /^ {0,3}-{3,}[ \t]*$/;

export function isFenceOpen(line: string): boolean {
  return FENCE_OPEN_RE.test(line);
}

export function isFenceClose(line: string): boolean {
  return FENCE_CLOSE_RE.test(line);
}

export function isHrLine(line: string): boolean {
  return HR_RE.test(line);
}

/**
 * Parse le contenu YAML d'un bloc ```` ```colle ```` en ColleMeta BRUTE (le
 * dict `notes` et toute clé libre sont préservés pour le write-back — ne PAS
 * passer par le parseur plat `parseMetaYaml`, il aplatirait les dicts).
 * BRUT = aucune normalisation : la valeur `type` du YAML est conservée telle
 * quelle ; le forçage `type = "colle"` (nom du fence autoritaire) est le rôle
 * de `parseMetaFence` au rendu. {} si vide, invalide ou non-objet.
 */
export function parseColleYaml(blockSource: string): ColleMeta {
  const trimmed = blockSource.trim();
  if (!trimmed) return {};
  try {
    const doc = parse(trimmed);
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return {};
    return doc as ColleMeta;
  } catch {
    return {};
  }
}

function isEmptyLine(line: string): boolean {
  return line.trim() === "";
}

/**
 * Index de la première ligne APRÈS le double `---` qui annonce la section fiches.
 * Tolérant à UNE ligne vide optionnelle entre les deux `---` (faute de frappe
 * naturelle à la saisie). -1 si la section n'existe pas.
 */
export function findFichesSection(lines: string[]): number {
  for (let i = 0; i < lines.length - 1; i++) {
    if (isHrLine(lines[i])) {
      if (isHrLine(lines[i + 1])) return i + 2;
      if (i + 2 < lines.length && isEmptyLine(lines[i + 1]) && isHrLine(lines[i + 2])) {
        return i + 3;
      }
    }
  }
  return -1;
}

/** Découpe la section fiches (à partir de `startLine`) en planches. */
export function splitPlanches(lines: string[], startLine: number): CollePlanche[] {
  const planches: CollePlanche[] = [];
  const n = lines.length;
  let i = startLine;
  let index = 0;

  while (i < n) {
    if (isFenceOpen(lines[i])) {
      // Fermeture du fence (i peut atteindre n si mal fermé → corps vide).
      let j = i + 1;
      while (j < n && !isFenceClose(lines[j])) j++;
      const blockEnd = j;

      const blockSource = lines.slice(i + 1, j).join("\n");
      const meta = parseColleYaml(blockSource);

      // Corps : markdown entre la fermeture du fence et la ligne `---` suivante (ou EOF).
      const bodyStart = Math.min(j + 1, n);
      let k = bodyStart;
      while (k < n && !isHrLine(lines[k])) k++;
      const bodyEnd = k;
      const bodySource = lines.slice(bodyStart, bodyEnd).join("\n");

      planches.push({
        index,
        meta,
        blockSource,
        bodySource,
        blockStart: i,
        blockEnd,
        bodyStart,
        bodyEnd,
      });
      index++;

      // La planche suivante commence après le `---` (ou EOF).
      i = bodyEnd < n ? bodyEnd + 1 : bodyEnd;
    } else {
      // Ligne hors planche (journal résiduel dans la section, planche sans fence) — ignorée.
      i++;
    }
  }

  return planches;
}

/**
 * Clé d'un « créneau » de colle : `date :: creneau` (le legacy `creneaux` est
 * replié sur la chaîne unique). Retourne null si la date OU le créneau
 * manquent — sans eux on ne peut pas regrouper les planches de façon fiable.
 */
export function creneauKey(meta: ColleMeta): string | null {
  const date = meta.date?.trim();
  const creneau =
    meta.creneau?.trim() || (meta.creneaux as string[] | undefined)?.join(", ")?.trim();
  if (!date || !creneau) return null;
  return `${date} :: ${creneau}`;
}

/**
 * Deux planches appartiennent au même créneau (même date ET même créneau,
 * tous deux renseignés). Sert à la PROPAGATION volontaire du programme :
 * les planches d'un même créneau partagent en général le même programme.
 */
export function sameCreneau(a: ColleMeta, b: ColleMeta): boolean {
  const ka = creneauKey(a);
  return ka !== null && ka === creneauKey(b);
}

/** Découpe une daily note complète en planches de colles. */
export function parsePlanches(source: string): CollesSection {
  const lines = source.split(/\r?\n/);
  const startLine = findFichesSection(lines);
  if (startLine < 0) return { startLine: -1, planches: [] };
  return { startLine, planches: splitPlanches(lines, startLine) };
}

/**
 * Vide les lignes `---` STRUCTURELLES pour qu'elles ne deviennent pas des
 * `<hr>` dans le rendu HTML : le double `---` d'annonce de la section fiches
 * et les `---` simples séparant les planches. Les lignes sont REMPLACÉES par
 * une chaîne vide (jamais supprimées) pour préserver l'alignement des lignes
 * et les data-sline de l'éditeur. Les fences de code sont épargnées. No-op si
 * la note ne contient aucun fence ```` ```colle ````.
 */
export function stripColleSeparators(source: string): string {
  const lines = source.split("\n");
  const clean = (l: string) => (l.endsWith("\r") ? l.slice(0, -1) : l);
  const cleanLines = lines.map(clean);
  if (!cleanLines.some(isFenceOpen)) return source;
  const startLine = findFichesSection(cleanLines);
  if (startLine < 0) return source;

  const blank = new Set<number>();
  // Double `---` d'annonce : les lignes `---` juste avant startLine
  // (startLine-2 et startLine-1, ou startLine-3/-1 avec ligne vide tolérée).
  for (let i = Math.max(0, startLine - 3); i < startLine; i++) {
    if (isHrLine(cleanLines[i])) blank.add(i);
  }
  // Séparateurs de planches : toutes les lignes `---` de la section à EOF,
  // hors fences de code.
  let inFence = false;
  for (let i = startLine; i < lines.length; i++) {
    const l = cleanLines[i];
    if (l.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && isHrLine(l)) blank.add(i);
  }
  if (blank.size === 0) return source;
  return lines.map((l, i) => (blank.has(i) ? "" : l)).join("\n");
}
