/**
 * Colloscope — parsing + expansion PURS (testables sans Tauri ni runes).
 *
 * Le fichier source (xlsx) est lu par `importFileToMatrix` (src/lib/spreadsheet/import.ts)
 * qui produit une liste de feuilles `{ name, headers, rows }`. Ce module :
 *  1. identifie la feuille `Eleves` et les feuilles de classe (nom = identifiant),
 *  2. extrait les créneaux (matière, colleur, jour, horaire, salle + rotation),
 *  3. expand l'année scolaire en séances datées (semaine 1 = dateDebut), en
 *     respectant les vacances et la rotation des groupes.
 *
 * La rotation suit l'index CALENDAIRE (semaines depuis dateDebut) : les vacances
 * ne réinitialisent pas la rotation — « les colles reprennent là où elles se
 * sont arrêtées ». Une fois un cycle achevé (len(rotation) semaines), on
 * reprend à la première colonne de la rotation.
 */

import type { ImportResult } from "@/lib/spreadsheet/import";

// ── Types ──────────────────────────────────────────────────────────────────

/** Un élève extrait de la feuille `Eleves`. */
export interface ColloscopeEleve {
  code: string;
  nom: string;
  prenom: string;
  classe: string;
  groupe: string;
  email: string;
}

/** Un créneau de colle (une ligne d'une feuille de classe). */
export interface ColloscopeCreneau {
  /** Matière (colonne « Matière »). */
  matiere: string;
  /** Colleur (colonne « Colleur »). */
  colleur: string;
  /** Jour de la semaine (colonne « Jour », ex. "Lundi"). */
  jour: string;
  /** Horaire (colonne « Horaire », ex. "12h-13h"). */
  horaire: string;
  /** Salle (colonne « Salle »). */
  salle: string;
  /** Rotation des groupes, une entrée par semaine (colonne Sem 1 … Sem N). */
  rotation: string[];
}

/** Une séance de colle datée (résultat de l'expansion). */
export interface ColloscopeSeance {
  /** Identifiant de classe (nom de la feuille source). */
  classe: string;
  /** Date réelle de la colle (YYYY-MM-DD, locale). */
  date: string;
  /** Groupe collé ce jour-là (ex. "G2"), issu de la rotation. */
  groupe: string;
  matiere: string;
  colleur: string;
  jour: string;
  horaire: string;
  salle: string;
}

/** Résultat complet du parsing + expansion. */
export interface ColloscopeData {
  /** Élèves (feuille Eleves). */
  eleves: ColloscopeEleve[];
  /** Séances de l'année, triées par (classe, date). */
  seances: ColloscopeSeance[];
  /** Classes détectées (noms de feuilles de classe), ordre d'apparition. */
  classes: string[];
}

// ── Helpers date (ISO locale, sans décalage de fuseau) ─────────────────────

const DAYS_MS = 86_400_000;

/** "YYYY-MM-DD" → timestamp UTC (milieu de journée, insensible au fuseau). */
function isoToTime(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Timestamp UTC → "YYYY-MM-DD" (composantes UTC). */
function timeToIso(t: number): string {
  const dt = new Date(t);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Ajoute N jours à une date ISO. */
function addDays(iso: string, days: number): string {
  return timeToIso(isoToTime(iso) + days * DAYS_MS);
}

/** true si la date ISO est dans [start, end] (bornes incluses). */
function inRange(iso: string, start: string, end: string): boolean {
  return isoToTime(iso) >= isoToTime(start) && isoToTime(iso) <= isoToTime(end);
}

/** true si la date ISO tombe dans une des périodes de vacances. */
export function inVacances(
  iso: string,
  vacances: Array<{ start: string; end: string }>,
): boolean {
  return vacances.some((v) => inRange(iso, v.start, v.end));
}

/** Jours de la semaine (français) → offset depuis le lundi de la semaine. */
const JOUR_OFFSETS: Record<string, number> = {
  lundi: 0,
  mardi: 1,
  mercredi: 2,
  jeudi: 3,
  vendredi: 4,
  samedi: 5,
  dimanche: 6,
};

// ── Normalisation des titres d'en-têtes ────────────────────────────────────

/** Minuscule, sans accents, espaces et ponctuation unifiés (pour matching). */
export function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // enlever les accents
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const HEADER_ALIASES: Record<string, string[]> = {
  matiere: ["matiere", "matieres", "mat", "mat"],
  colleur: ["colleur", "colleurs", "colleur titre", "nom colleur"],
  jour: ["jour", "jours", "jour de la semaine"],
  horaire: ["horaire", "horaires", "horaire(s)"],
  salle: ["salle", "salles"],
  code: ["code", "code inscription", "inscription", "code inscript"],
  nom: ["nom", "noms"],
  prenom: ["prenom", "prénom", "prenoms", "prénoms"],
  classe: ["classe", "classes"],
  groupe: ["groupe", "groupe de colles", "groupes", "grp"],
  email: ["email", "emails", "e mail", "mail"],
};

/** Normalise et résout un alias vers la clé canonique (ex. "Colleur" → "colleur"). */
export function resolveHeader(title: string): string | null {
  const n = normalizeHeader(title);
  if (!n) return null;
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(n)) return key;
  }
  // Forme plurielle implicite (ex. "salles" → "salle") : si le mot de base
  // est un alias d'une clé, on matche aussi.
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) {
      if (n === a || n === a + "s") return key;
    }
  }
  return null;
}

// ── Parsing des feuilles ───────────────────────────────────────────────────

function isElevesSheet(sheet: ImportResult): boolean {
  const headers = sheet.headers.map(normalizeHeader).join(" ");
  return (
    sheet.name.toLowerCase() === "eleves" ||
    (headers.includes("nom") && headers.includes("prenom") && headers.includes("classe") && headers.includes("groupe"))
  );
}

/** Extrait la liste des élèves d'une feuille `Eleves`. */
export function parseEleves(sheet: ImportResult): ColloscopeEleve[] {
  const colIdx: Record<string, number> = {};
  sheet.headers.forEach((title, i) => {
    const key = resolveHeader(title);
    if (key) colIdx[key] = i;
  });
  const get = (row: string[], key: string): string => {
    const i = colIdx[key];
    return i !== undefined ? (row[i] ?? "").trim() : "";
  };
  return sheet.rows
    .filter((row) => row.some((c) => c.trim() !== ""))
    .map((row) => ({
      code: get(row, "code"),
      nom: get(row, "nom"),
      prenom: get(row, "prenom"),
      classe: get(row, "classe"),
      groupe: get(row, "groupe"),
      email: get(row, "email"),
    }));
}

/** Extrait les créneaux d'une feuille de classe (5 colonnes + rotation). */
export function parseCreneaux(sheet: ImportResult): ColloscopeCreneau[] {
  const colIdx: Record<string, number> = {};
  sheet.headers.forEach((title, i) => {
    const key = resolveHeader(title);
    if (key && !(key in colIdx)) colIdx[key] = i;
  });

  // La rotation = toutes les colonnes APRÈS « salle » (leurs titres importent peu).
  const salleIdx = colIdx["salle"];
  const rotationStart = salleIdx !== undefined ? salleIdx + 1 : sheet.headers.length;

  const get = (row: string[], key: string): string => {
    const i = colIdx[key];
    return i !== undefined ? (row[i] ?? "").trim() : "";
  };

  const out: ColloscopeCreneau[] = [];
  for (const row of sheet.rows) {
    if (!row.some((c) => c.trim() !== "")) continue;
    const matiere = get(row, "matiere");
    const jour = get(row, "jour");
    // Une ligne sans matière ni jour n'est pas un créneau exploitable.
    if (!matiere && !jour) continue;
    const rotation = row
      .slice(rotationStart)
      .map((c) => (c ?? "").trim())
      .filter((c) => c !== "");
    out.push({
      matiere,
      colleur: get(row, "colleur"),
      jour,
      horaire: get(row, "horaire"),
      salle: get(row, "salle"),
      rotation,
    });
  }
  return out;
}

/** Feuille de classe exploitable : en-têtes contenant matière et jour. */
function isClassSheet(sheet: ImportResult): boolean {
  const keys = sheet.headers.map(resolveHeader).filter(Boolean);
  return keys.includes("matiere") && keys.includes("jour");
}

/**
 * Parse un fichier (liste de feuilles issues de `importFileToMatrix`).
 * La feuille `Eleves` fournit les élèves ; les feuilles de classe sont
 * identifiées par leur nom (utilisé comme identifiant de classe) et doivent
 * avoir les colonnes matière/colleur/jour/horaire/salle + rotation.
 */
export function parseColloscope(sheets: ImportResult[]): ColloscopeData {
  // Privilégier la feuille nommée « Eleves » (la détection par en-têtes peut
  // matcher une feuille parasite comme « Feuil1 » qui porte les mêmes titres).
  const elevesSheet =
    sheets.find((s) => s.name.toLowerCase() === "eleves") ??
    sheets.find(isElevesSheet);
  const eleves = elevesSheet ? parseEleves(elevesSheet) : [];

  // Les noms de feuilles de classe servent d'identifiants de classe : on ne
  // garde que les feuilles dont le nom correspond à une classe de la colonne
  // CLASSE de la feuille Eleves. Les feuilles parasites (AFF MP, All, MPETOILE…)
  // portent les mêmes en-têtes mais ne correspondent à aucune classe.
  const classesEleves = new Set(eleves.map((e) => e.classe.trim()).filter(Boolean));

  const classes: string[] = [];
  for (const sheet of sheets) {
    if (sheet.name.toLowerCase() === "eleves") continue;
    if (!isClassSheet(sheet)) continue;
    const name = sheet.name.trim();
    if (!name || classes.includes(name)) continue;
    // Feuille de classe valide si elle correspond à une classe d'élèves —
    // ou, à défaut de feuille Eleves, si elle a la forme d'un colloscope
    // (ce qui laisse importer un colloscope sans liste d'élèves).
    if (classesEleves.size > 0 && !classesEleves.has(name)) continue;
    classes.push(name);
  }
  classes.sort((a, b) => a.localeCompare(b, "fr"));

  return { eleves, seances: [], classes };
}

// ── Expansion de l'année ───────────────────────────────────────────────────

/**
 * Génère les lundis de début de semaine d'enseignement de dateDebut à dateFin
 * (pas de 7 jours), en EXCLUANT les semaines dont le lundi tombe dans une
 * période de vacances. L'index renvoyé est l'index CALENDAIRE (nombre de
 * semaines depuis dateDebut) : il continue à travers les vacances, ce qui
 * réalise « les colles reprennent là où elles se sont arrêtées ».
 */
export function teachingMondays(
  dateDebut: string,
  dateFin: string,
  vacances: Array<{ start: string; end: string }>,
): Array<{ date: string; index: number }> {
  const out: Array<{ date: string; index: number }> = [];
  if (!dateDebut || !dateFin) return out;
  let d = dateDebut;
  let index = 0;
  const fin = isoToTime(dateFin);
  while (isoToTime(d) <= fin) {
    if (!inVacances(d, vacances)) out.push({ date: d, index });
    index++;
    d = addDays(d, 7);
  }
  return out;
}

/**
 * Expand les créneaux de toutes les classes en séances datées.
 *
 * Pour chaque lundi d'enseignement (hors vacances) :
 *   - la date réelle de la colle = lundi + offset du jour du créneau,
 *   - le groupe = rotation[index % rotation.length] (cycle complet → reprise
 *     depuis la première colonne ; index calendaire → pas de reset aux vacances).
 * Les lignes dont le jour n'est pas reconnu ou dont le groupe est vide sont
 * ignorées (créneau sans colle cette semaine-là).
 */
export function expandColloscope(
  creneauxParClasse: Record<string, ColloscopeCreneau[]>,
  dateDebut: string,
  dateFin: string,
  vacances: Array<{ start: string; end: string }>,
): ColloscopeSeance[] {
  const mondays = teachingMondays(dateDebut, dateFin, vacances);
  const seances: ColloscopeSeance[] = [];

  for (const [classe, creneaux] of Object.entries(creneauxParClasse)) {
    for (const cr of creneaux) {
      const dayOffset = JOUR_OFFSETS[cr.jour.trim().toLowerCase()];
      if (dayOffset === undefined) continue; // jour non reconnu
      if (cr.rotation.length === 0) continue; // pas de rotation → rien à étaler
      for (const { date, index } of mondays) {
        const groupe = cr.rotation[index % cr.rotation.length];
        if (!groupe) continue; // cellule vide = pas de colle cette semaine
        seances.push({
          classe,
          date: addDays(date, dayOffset),
          groupe,
          matiere: cr.matiere,
          colleur: cr.colleur,
          jour: cr.jour.trim(),
          horaire: cr.horaire,
          salle: cr.salle,
        });
      }
    }
  }

  seances.sort((a, b) =>
    a.classe === b.classe ? a.date.localeCompare(b.date) : a.classe.localeCompare(b.classe),
  );
  return seances;
}

/** Pipeline complet : feuilles → élèves + séances de l'année. */
export function buildColloscope(
  sheets: ImportResult[],
  dateDebut: string,
  dateFin: string,
  vacances: Array<{ start: string; end: string }>,
): ColloscopeData {
  const { eleves, classes } = parseColloscope(sheets);
  const creneauxParClasse: Record<string, ColloscopeCreneau[]> = {};
  for (const sheet of sheets) {
    if (!classes.includes(sheet.name)) continue;
    creneauxParClasse[sheet.name] = parseCreneaux(sheet);
  }
  return {
    eleves,
    seances: expandColloscope(creneauxParClasse, dateDebut, dateFin, vacances),
    classes,
  };
}

// ── Croisement avec le profil (créneaux « à moi ») ─────────────────────────

/** Normalise un nom de colleur pour comparaison ("M, KANTARA" ≡ "M. KANTARA"). */
export function normalizeColleur(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Séances dont le colleur correspond au nom de colleur du profil. */
export function seancesDuColleur(
  seances: ColloscopeSeance[],
  colleurName: string,
): ColloscopeSeance[] {
  if (!colleurName.trim()) return [];
  const needle = normalizeColleur(colleurName);
  return seances.filter((s) => normalizeColleur(s.colleur) === needle);
}
