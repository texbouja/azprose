/**
 * Parsing des planches de colles dans une note.
 *
 * Logique pure (pas de DOM) — réutilisable par le preview normal, CollePreview,
 * et la future vue DataFilter (table de métadonnées).
 *
 * Fences : ```` ```colle ```` est une SPÉCIALISATION du fence officiel
 * ```` ```meta ```` (= ```` ```meta ```` + `type: colle`). Le nom du fence est
 * AUTORITAIRE : ```` ```colle ```` force `type = "colle"` même si le YAML dit
 * autre chose ou rien.
 *
 * La disponibilité de la vue colles est décidée par le front matter du fichier
 * (`type: colle`), PAS par le parsing : une note `type: colle` sans fence
 * s'affiche vide, et l'extraction des planches s'ancre sur la PREMIÈRE fence
 * ```colle — aucune disposition particulière (double `---`, titre `# Colles`)
 * n'est requise pour marquer le début de la section.
 */
import { parseYamlMap } from "@/lib/doc-meta";
import { parseFrontMatter } from "@/lib/front-matter";
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
 * dict `notes` et toute clé libre sont préservés pour le write-back).
 * Passe par le parser YAML UNIFIÉ `parseYamlMap` (doc-meta) — l'unique source
 * de vérité pour front-matter et fences.
 * BRUT = aucune normalisation : la valeur `type` du YAML est conservée telle
 * quelle ; le forçage `type = "colle"` (nom du fence autoritaire) est le rôle
 * de `parseMetaFence` au rendu. {} si vide, invalide ou non-objet.
 */
export function parseColleYaml(blockSource: string): ColleMeta {
  return parseYamlMap(blockSource) as ColleMeta;
}

function isEmptyLine(line: string): boolean {
  return line.trim() === "";
}

/**
 * Index de la PREMIÈRE fence de métadonnées (```colle/```meta) du document —
 * c'est le début de la section fiches, sans marquage particulier : aucune
 * disposition (double `---`, titre `# Colles`) n'est requise avant. -1 si
 * aucune fence.
 */
export function findFichesSection(lines: string[]): number {
  return lines.findIndex(isFenceOpen);
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
 * `<hr>` dans le rendu HTML : les séparateurs de planches (chaque planche se
 * termine par un `---`, y compris la dernière) et, en repli legacy, l'ancien
 * double `---` d'annonce juste avant la première planche. Les lignes sont
 * REMPLACÉES par une chaîne vide (jamais supprimées) pour préserver
 * l'alignement des lignes et les data-sline de l'éditeur. Les fences de code
 * sont épargnées. No-op si la note ne contient aucun fence ```` ```colle ````.
 */
export function stripColleSeparators(source: string): string {
  const lines = source.split("\n");
  const clean = (l: string) => (l.endsWith("\r") ? l.slice(0, -1) : l);
  const cleanLines = lines.map(clean);
  if (!cleanLines.some(isFenceOpen)) return source;
  const startLine = findFichesSection(cleanLines);
  if (startLine < 0) return source;

  const blank = new Set<number>();
  // Repli legacy : l'ancien double `---` d'annonce, posé juste avant la
  // première planche (parfois séparé par des lignes vides et les titres
  // `# Colles`/`## <élève>`). Remontée depuis la fence tant que la ligne est
  // vide, un titre ou un `---` ; arrêt au front matter ou au premier contenu.
  const fmLines = parseFrontMatter(source).fmLineCount;
  for (let i = startLine - 1; i >= fmLines; i--) {
    const l = cleanLines[i];
    if (isHrLine(l)) blank.add(i);
    else if (isEmptyLine(l)) continue;
    else if (/^#{1,6}\s/.test(l)) continue;
    else break;
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
