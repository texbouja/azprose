/**
 * Métadonnées de document — catalogue officiel, parsing YAML UNIFIÉ et
 * comportements par type. Module PUR (testable sans DOM ni Tauri).
 *
 * Décisions utilisateur :
 *  - `parseYamlMap` est LE parser YAML unique (package `yaml`, YAML 1.2) :
 *    front-matter `---…---` ET fences ```meta / ```colle partagent la même
 *    source de vérité — vue structurée `values` (moteur de templating) et
 *    vue plate `meta` (carte d'en-tête). Repli tolérant ligne à ligne si le
 *    YAML est invalide (comportement historique du front-matter).
 *  - ```meta est LE fence officiel ; ```colle est une SPÉCIALISATION (type
 *    forcé "colle" — le nom du fence est AUTORITAIRE).
 *  - `type` est un COMMUTATEUR LOGIQUE restreint à `DOC_TYPES` (9 valeurs :
 *    cours, exercices, banque, devoir, note, colle, concours, rapport, misc)
 *    — jamais une variable d'affichage : il ne se résout dans aucun gabarit.
 *    AUCUN type n'a de privilège : `docTypeSwitches(t)` expose un commutateur
 *    `is<Type>` PAR TYPE (tous à false, celui chargé dans le YAML à true) —
 *    chaque consommateur lit le commutateur qui le concerne (la vue colles lit
 *    `.isColle`, une future vue banque lira `.isBanque`). Les libellés de badge
 *    (`DOC_TYPE_LABELS`) et les conseils d'en-tête (`DOC_TYPE_HINTS`) sont des
 *    registres d'AFFICHAGE séparés — mécanisme uniforme, jamais un privilège.
 *  - `DOC_META_FIELDS` documente les champs de base pour l'UI. Le PARSER
 *    accepte n'importe quelle clé — le catalogue est une aide, pas une
 *    restriction.
 *  - `DOC_FIELD_LABELS` = registre UNIQUE des libellés d'en-tête (distinction
 *    meta/colle SUPPRIMÉE : un seul ordre, champs absents filtrés).
 *  - Règle d'affichage UNIQUE d'une valeur YAML (`displayYamlValue`) :
 *    scalaire → String (sauts de ligne → espaces, préserve les data-sline) ;
 *    tableau → joint « · » ; objet → null (invisible) ; true → "true" ;
 *    false → null ; absent/null → null.
 */
import { parse } from "yaml";

// ── Type de document (commutateur logique) ──────────────────────────────────

/** Les 9 types de documents reconnus par le système. `exercices` = préparation
 *  de feuilles (handout) ; `banque` = collection d'exercices maintenue pour
 *  être réutilisée, notamment par les transclusions — sémantiques DISTINCTES. */
export const DOC_TYPES = [
  "cours",
  "exercices",
  "banque",
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

/** Commutateurs par type : `isCours`, `isExercices`, `isBanque`, … — autant de
 *  commutateurs que de types, TOUS à false, celui chargé dans le YAML à true.
 *  Aucun type n'a de privilège : chaque consommateur lit le commutateur qui le
 *  concerne (la vue colles lit `.isColle`, une future vue banque lira
 *  `.isBanque`) — jamais d'égalité de type dispersée dans le code. */
export type DocTypeSwitch = `is${Capitalize<DocType>}`;
export type DocTypeSwitches = Record<DocTypeSwitch, boolean>;

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const DOC_TYPE_SWITCH_KEYS = DOC_TYPES.map((t) => `is${cap(t)}`) as DocTypeSwitch[];

export function docTypeSwitches(t: DocType): DocTypeSwitches {
  const out = {} as DocTypeSwitches;
  for (const k of DOC_TYPE_SWITCH_KEYS) out[k] = false;
  out[`is${cap(t)}` as DocTypeSwitch] = true;
  return out;
}

/** Libellé du badge d'en-tête par type (AFFICHAGE — "Document" pour misc). */
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  cours: "Cours",
  exercices: "Exercices",
  banque: "Banque",
  devoir: "Devoir",
  note: "Note",
  colle: "Colle",
  concours: "Concours",
  rapport: "Rapport",
  misc: "Document",
};

/** Conseils d'en-tête par type ("" → aucun) — mécanisme UNIFORME : le contenu
 *  reflète l'usage réel de l'app (un type reçoit un conseil quand une vue le
 *  concerne), jamais un privilège de type. */
export const DOC_TYPE_HINTS: Record<DocType, string> = {
  cours: "",
  exercices: "",
  banque: "",
  devoir: "",
  note: "",
  colle: "Activer la vue « Colles » pour le formulaire d'évaluation",
  concours: "",
  rapport: "",
  misc: "",
};

/** Libellé lisible d'un type (badge d'en-tête). */
export function humanizeDocType(t: DocType): string {
  return DOC_TYPE_LABELS[t];
}

// ── Catalogue des champs de base ────────────────────────────────────────────

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
 * Catalogue des métadonnées de base (ordre de l'utilisateur, complété des
 * champs colle `eleve`/`salle`/`groupe` — la distinction meta/colle est
 * supprimée). `type` est le commutateur logique ; les autres champs sont des
 * textes libres (la date est au format AAAA-MM-JJ conventionnellement, la
 * valeur reste une chaîne).
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
  { key: "eleve", kind: "text", labelFr: "Élève", labelEn: "Student" },
  { key: "salle", kind: "text", labelFr: "Salle", labelEn: "Room" },
  { key: "groupe", kind: "text", labelFr: "Groupe", labelEn: "Group" },
];

/**
 * Registre UNIQUE des libellés de la carte d'en-tête (ordre d'affichage) —
 * ex DOC_FIELD_LABELS/COLLE_FIELD_LABELS fusionnés. Les champs colle passent
 * en tête (matiere, colleur, eleve, …) pour garder la parité visuelle du
 * rendu colle ; les champs absents du document sont filtrés au rendu.
 */
export const DOC_FIELD_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["matiere", "Matière"],
  ["colleur", "Colleur"],
  ["eleve", "Élève"],
  ["classe", "Classe"],
  ["groupe", "Groupe"],
  ["date", "Date"],
  ["creneau", "Créneau"],
  ["salle", "Salle"],
  ["centre", "Centre"],
  ["ville", "Ville"],
  ["filiere", "Filière"],
  ["session", "Session"],
  ["duree", "Durée"],
  ["document", "Document"],
  ["theme", "Thème"],
  ["origine", "Origine"],
  ["auteur", "Auteur"],
  ["email", "Email"],
  ["website", "Site web"],
];

// ── Parser YAML unifié ──────────────────────────────────────────────────────

/**
 * Repli tolérant : si le YAML est invalide, on garde les paires `clé: valeur`
 * simples (une par ligne, quotes simples/doubles retirées) — comportement
 * historique du parseur de front-matter. null si aucune paire exploitable.
 */
function legacyYamlLines(src: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const line of src.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    if (!key) continue;
    const raw = line.slice(colon + 1).trim();
    out[key] = raw.replace(/^["']|["']$/g, "");
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Parse un bloc YAML (front-matter ou fence) → dictionnaire STRUCTURÉ
 * (scalaires, booléens, tableaux, objets, dates ISO → chaîne). {} si vide,
 * non-objet ou invalide (avec repli tolérant ligne à ligne).
 */
export function parseYamlMap(src: string): Record<string, unknown> {
  const trimmed = src.trim();
  if (!trimmed) return {};
  let doc: unknown;
  try {
    doc = parse(trimmed);
  } catch {
    return legacyYamlLines(trimmed) ?? {};
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return {};
  return { ...(doc as Record<string, unknown>) };
}

/**
 * Règle d'affichage UNIQUE d'une valeur YAML → chaîne prête à insérer
 * (échappée par le moteur de templating, jamais brute). null → invisible.
 */
export function displayYamlValue(v: unknown): { value: string; raw: boolean } | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? { value: "true", raw: false } : null;
  if (typeof v === "object") {
    if (Array.isArray(v)) {
      const parts = v
        .map((x) => (x === null || x === undefined ? "" : String(x)))
        .filter((s) => s !== "");
      return { value: parts.join(" · "), raw: false };
    }
    return null; // objet → non affichable tel quel
  }
  return { value: String(v).replace(/\r?\n/g, " "), raw: false };
}

/** Vue PLATE (chaînes) d'un dictionnaire structuré — carte d'en-tête, badges. */
export function flattenYamlMap(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    const r = displayYamlValue(v);
    if (r) out[k] = r.value;
  }
  return out;
}

/**
 * Parse le contenu YAML d'un fence → dictionnaire PLAT (compat : identique à
 * `flattenYamlMap(parseYamlMap(src))`).
 */
export function parseMetaYaml(src: string): Record<string, string> {
  return flattenYamlMap(parseYamlMap(src));
}

/** Résultat de l'analyse d'un fence de métadonnées. */
export interface ParsedMetaFence {
  /** Métadonnées PLATES (chaînes) — toutes les clés du YAML, préservées. */
  meta: Record<string, string>;
  /** Métadonnées STRUCTURÉES — scope du moteur de templating. */
  values: Record<string, unknown>;
  /** Type normalisé (colle forcé par le fence ```colle). */
  type: DocType;
  /** Contenu YAML brut du bloc. */
  content: string;
}

/**
 * Analyse le contenu d'un fence ```meta ou ```colle.
 * ```colle = SPÉCIALISATION : le type est FORCÉ à "colle" (le nom du fence
 * est autoritaire — il prime sur un éventuel `type:` du YAML).
 */
export function parseMetaFence(lang: string, content: string): ParsedMetaFence {
  const values = parseYamlMap(content);
  if (lang === "colle") values.type = "colle";
  return {
    meta: flattenYamlMap(values),
    values,
    type: normalizeDocType(values.type),
    content,
  };
}
