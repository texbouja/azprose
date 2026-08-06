/**
 * Métadonnées de document — catalogue officiel + parsing des fences
 * ```` ```meta ```` (et de leur spécialisation ```` ```colle ````).
 * Module PUR (testable sans DOM ni Tauri).
 *
 * Décisions utilisateur :
 *  - ```` ```meta ```` est LE fence officiel des métadonnées ; ```` ```colle ````
 *    devient une SPÉCIALISATION : l'équivalent exact de ```` ```meta ```` avec
 *    `type: colle` dans le bloc. Le nom du fence est AUTORITAIRE : un fence
 *    ```` ```colle ```` force `type = "colle"` même si le YAML dit autre chose
 *    ou rien.
 *  - `type` est un COMMUTATEUR LOGIQUE restreint à `DOC_TYPES` (cours,
 *    exercices, devoir, note, colle, concours, rapport, misc) — toute valeur
 *    hors liste est repliée sur "misc".
 *  - `DOC_META_FIELDS` documente les 18 champs de base pour l'UI (mécanisme
 *    d'ajout de métadonnées dans l'UI : NON PRIORITAIRE). Le PARSER accepte
 *    n'importe quelle clé : une clé inconnue est simplement préservée —
 *    le catalogue est une aide, pas une restriction.
 */
import { parse } from "yaml";

// ── Type de document (commutateur logique) ──────────────────────────────────

/** Les 8 types de documents reconnus par le système. */
export const DOC_TYPES = [
  "cours",
  "exercices",
  "devoir",
  "note",
  "colle",
  "concours",
  "rapport",
  "misc",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export function isDocType(t: unknown): t is DocType {
  return typeof t === "string" && (DOC_TYPES as readonly string[]).includes(t);
}

/** Normalise une valeur `type` (YAML) vers un DocType — repli "misc". */
export function normalizeDocType(t: unknown): DocType {
  return isDocType(t) ? t : "misc";
}

/** Libellé lisible d'un type (badge d'en-tête) — "Document" pour misc. */
const DOC_TYPE_LABELS: Record<DocType, string> = {
  cours: "Cours",
  exercices: "Exercices",
  devoir: "Devoir",
  note: "Note",
  colle: "Colle",
  concours: "Concours",
  rapport: "Rapport",
  misc: "Document",
};

export function humanizeDocType(t: DocType): string {
  return DOC_TYPE_LABELS[t];
}

// ── Catalogue des 18 champs de base ─────────────────────────────────────────

type DocMetaKind = "enum" | "text" | "date";

interface DocMetaField {
  /** Clé YAML du champ (ex. "centre"). */
  key: string;
  kind: DocMetaKind;
  /** Valeurs autorisées (uniquement pour kind "enum"). */
  values?: readonly string[];
  labelFr: string;
  labelEn: string;
}

/**
 * Catalogue des métadonnées de base (ordre de l'utilisateur). `type` est le
 * commutateur logique ; les autres champs sont des textes libres (la date est
 * au format AAAA-MM-JJ conventionnellement, la valeur reste une chaîne).
 */
export const DOC_META_FIELDS: DocMetaField[] = [
  { key: "type", kind: "enum", values: DOC_TYPES, labelFr: "Type", labelEn: "Type" },
  { key: "centre", kind: "text", labelFr: "Centre", labelEn: "Center" },
  { key: "ville", kind: "text", labelFr: "Ville", labelEn: "City" },
  { key: "filiere", kind: "text", labelFr: "Filière", labelEn: "Program" },
  { key: "classe", kind: "text", labelFr: "Classe", labelEn: "Class" },
  { key: "date", kind: "date", labelFr: "Date", labelEn: "Date" },
  { key: "creneau", kind: "text", labelFr: "Créneau", labelEn: "Time slot" },
  { key: "session", kind: "text", labelFr: "Session", labelEn: "Session" },
  { key: "duree", kind: "text", labelFr: "Durée", labelEn: "Duration" },
  { key: "matiere", kind: "text", labelFr: "Matière", labelEn: "Subject" },
  { key: "document", kind: "text", labelFr: "Document", labelEn: "Document" },
  { key: "theme", kind: "text", labelFr: "Thème", labelEn: "Theme" },
  { key: "origine", kind: "text", labelFr: "Origine", labelEn: "Source" },
  { key: "auteur", kind: "text", labelFr: "Auteur", labelEn: "Author" },
  { key: "colleur", kind: "text", labelFr: "Colleur", labelEn: "Examiner" },
  { key: "email", kind: "text", labelFr: "Email", labelEn: "Email" },
  { key: "website", kind: "text", labelFr: "Site web", labelEn: "Website" },
  { key: "preauteur", kind: "text", labelFr: "Préfixe auteur", labelEn: "Author prefix" },
];

// ── Parsing des fences de métadonnées ───────────────────────────────────────

/**
 * Parse le contenu YAML d'un fence de métadonnées → dictionnaire PLAT de
 * chaînes. Scalaires (string/number/boolean) → String ; tableaux → joints par
 * « · » ; objets → ignorés. {} si vide, invalide ou non-objet. N'importe
 * quelle clé est préservée (le catalogue n'est pas une restriction).
 */
export function parseMetaYaml(src: string): Record<string, string> {
  const trimmed = src.trim();
  if (!trimmed) return {};
  let doc: unknown;
  try {
    doc = parse(trimmed);
  } catch {
    return {};
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(doc as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = String(v);
    } else if (Array.isArray(v)) {
      const parts = v
        .map((x) => (x === null || x === undefined ? "" : String(x)))
        .filter((s) => s !== "");
      if (parts.length) out[k] = parts.join(" · ");
    }
  }
  return out;
}

/** Résultat de l'analyse d'un fence de métadonnées. */
export interface ParsedMetaFence {
  /** Nom du fence tel qu'écrit : "meta" ou "colle". */
  lang: "meta" | "colle";
  /** Métadonnées PLATES (chaînes) — toutes les clés du YAML, préservées. */
  meta: Record<string, string>;
  /** Type normalisé (colle forcé par le fence ```` ```colle ````). */
  type: DocType;
  /** Contenu YAML brut du bloc. */
  content: string;
}

/**
 * Analyse le contenu d'un fence ```` ```meta ```` ou ```` ```colle ````.
 * ```` ```colle ```` = SPÉCIALISATION : le type est FORCÉ à "colle" (le nom
 * du fence est autoritaire — il prime sur un éventuel `type:` du YAML).
 */
export function parseMetaFence(lang: string, content: string): ParsedMetaFence {
  const meta = parseMetaYaml(content);
  if (lang === "colle") meta.type = "colle";
  return {
    lang: lang === "colle" ? "colle" : "meta",
    meta,
    type: normalizeDocType(meta.type),
    content,
  };
}

/** Vrai si le fence analysé est une planche de COLLE (`type === "colle"`). */
export function isColleMetaFence(fence: ParsedMetaFence): boolean {
  return fence.type === "colle";
}
