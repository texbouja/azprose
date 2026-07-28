/**
 * Colles import configuration.
 *
 * Handles two data formats:
 *   1. Matrix format — header row with Matière/Colleur/Jour/Horaire/Salle + date columns,
 *      data rows with group assignments (G1–G8) per date. This is the standard colloscope
 *      format exported by the school.
 *   2. Flat table format — Semaine/Jour/Horaire/Matière/Colleur/Salle/Groupe per row.
 *
 * Also handles the élèves (student list) sheet: Nom/Prénom/Classe/Groupe/Email.
 */

import type { ParsedSheetData } from "@svar-ui/excel-import-store";
import type { Colloscope, Creneau, Eleve, Semaine } from "@/types/colles";

// ── Constants ────────────────────────────────────────────

// ── Sheet type detection ─────────────────────────────────

export type SheetRole = "colloscope" | "eleves" | "ignore";

export interface SheetClassification {
  name: string;
  role: SheetRole;
  /** Class name for colloscope sheets (editable, defaults to sheet name). */
  classe: string;
  /** Preview: number of data rows. */
  rowCount: number;
  /** Preview: column headers. */
  headers: string[];
}

/**
 * Auto-detect the role of a parsed sheet.
 *
 * - colloscope: has Matière + Colleur + Jour + date-type columns (matrix format)
 *   OR Matière + Colleur + Jour + Semaine column (flat format)
 * - eleves: has NOM + PRENOM (+ CLASSE or GROUPE)
 * - ignore: everything else
 */
export function detectSheetRole(sheet: ParsedSheetData): SheetRole {
  const headers = sheet.columns.map(c => c.header.toLowerCase().trim());
  const headerSet = new Set(headers);

  const hasMatiere = headers.some(h => h === "matière" || h === "matiere");
  const hasColleur = headers.some(h =>
    h === "colleur" || h === "nom colleur" || h.includes("colleur"),
  );
  const hasJour = headers.some(h => h === "jour");

  if (hasMatiere && hasColleur && hasJour) {
    // Matrix format: 5+ fixed columns + N date columns = many columns total
    if (sheet.columns.length > 5) return "colloscope";
    // Flat format: Semaine/Jour/Horaire/Matière/Colleur/Salle/Groupe
    if (headerSet.has("semaine")) return "colloscope";
  }

  const hasNom = headers.some(h => h === "nom");
  const hasPrenom = headers.some(h => h === "prénom" || h === "prenom");
  if (hasNom && hasPrenom) return "eleves";

  return "ignore";
}

/**
 * Build initial classifications for all sheets in a parsed file.
 */
export function classifySheets(data: { sheets: ParsedSheetData[] }): SheetClassification[] {
  return data.sheets.map(s => ({
    name: s.name,
    role: detectSheetRole(s),
    classe: s.name, // default class name = sheet name
    rowCount: s.totalRows,
    headers: s.columns.map(c => c.header),
  }));
}

// ── Matrix colloscope parser ─────────────────────────────

/**
 * Parse a matrix-format colloscope sheet.
 *
 * Format:
 *   Row 0 (header): Matière | Colleur | Jour | Horaire | Salle | date1 | date2 | ... | dateN
 *   Rows 1+:       Math    | M. X    | Lundi| 12h-13h | MP*1  | G1    | G2    | ... | G8
 *
 * Dates in the header row may come as Date objects, ISO strings, or timestamps.
 */
export function parseMatrixColloscope(
  sheet: ParsedSheetData,
  classe: string,
): Colloscope {
  if (sheet.rows.length === 0) {
    return { semaines: [], creneaux: [], assignations: {}, startDate: null, endDate: null };
  }

  // Headers are in sheet.columns[].header (already converted to strings by SVAR library).
  // sheet.rows does NOT contain the header row (SVAR strips it).
  const headerStrs = sheet.columns.map(c => c.header.toLowerCase().trim());

  // Find where the fixed columns end and date columns begin.
  // The matrix format has 5 fixed columns (Matière, Colleur, Jour, Horaire, Salle),
  // but some files include a "Classe" column at position 5.
  const fixedCount = headerStrs.length > 5 && headerStrs[5] === "classe" ? 6 : 5;

  // Parse date headers (columns after fixed ones)
  // Headers may be: "Mon Sep 15 2025 00:00:00 GMT+..." (Date.toString()),
  // "2025-09-15T00:00:00.000Z" (ISO), "2025-09-15" (date-only), or "45914" (serial)
  const semaines: Semaine[] = [];

  for (let col = fixedCount; col < sheet.columns.length; col++) {
    const rawHeader = sheet.columns[col].header;
    const dateStr = parseDateHeader(rawHeader);
    if (dateStr) {
      semaines.push({ date: dateStr, label: String(semaines.length + 1) });
    }
  }

  // Parse creneaux (data rows — sheet.rows[0] = first data row, not header)
  const creneaux: Creneau[] = [];
  const assignations: Record<string, (string | null)[]> = {};
  const creneauKeys = new Map<string, number>();

  for (let r = 0; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] as unknown[];
    if (row.length < fixedCount) continue;

    const matiere = String(row[0] ?? "").trim();
    const colleur = normalizeColleur(row[1]);
    const jour = normalizeJour(row[2]);
    const horaire = String(row[3] ?? "").trim();
    const salle = String(row[4] ?? "").trim();

    if (!matiere || !jour || !horaire) continue;

    const classeVal = fixedCount === 6
      ? String(row[5] ?? "").trim()
      : classe;

    const key = `${jour}|${horaire}|${matiere}|${colleur}|${salle}|${classeVal || classe}`;
    let cIdx = creneauKeys.get(key);
    if (cIdx === undefined) {
      cIdx = creneaux.length;
      creneauKeys.set(key, cIdx);
      const id = `creneau-${cIdx}`;
      creneaux.push({
        id,
        jour,
        horaire,
        matiere,
        colleur,
        salle,
        classe: classeVal || classe,
      });
      assignations[id] = new Array(semaines.length).fill(null);
    }

    // Parse group assignments from date columns
    for (let col = fixedCount; col < row.length && (col - fixedCount) < semaines.length; col++) {
      const group = String(row[col] ?? "").trim();
      if (!group) continue;
      const weekIdx = col - fixedCount;
      const creneauId = creneaux[cIdx].id;
      if (assignations[creneauId]) {
        assignations[creneauId][weekIdx] = group;
      }
    }
  }

  const startDate = semaines.length > 0 ? semaines[0].date : null;

  return { semaines, creneaux, assignations, startDate, endDate: null };
}

// ── Flat colloscope parser ───────────────────────────────

/**
 * Parse a flat-format colloscope sheet.
 *
 * Format:
 *   Semaine | Jour | Horaire | Matière | Colleur | Salle | Groupe
 *   1       | Lundi| 12h-13h | Math    | M. X    | MP*1  | G1
 */
export function parseFlatColloscope(
  sheet: ParsedSheetData,
  classe: string,
): Colloscope {
  if (sheet.rows.length === 0) {
    return { semaines: [], creneaux: [], assignations: {}, startDate: null, endDate: null };
  }

  // Map column indices by header name
  const colMap = new Map<string, number>();
  for (const col of sheet.columns) {
    colMap.set(col.header.toLowerCase().trim(), col.index);
  }

  const getCol = (name: string): number => {
    for (const [k, v] of colMap) {
      if (k.includes(name)) return v;
    }
    return -1;
  };

  const iSemaine = getCol("semaine");
  const iJour = getCol("jour");
  const iHoraire = getCol("horaire");
  const iMatiere = getCol("matière") !== -1 ? getCol("matière") : getCol("matiere");
  const iColleur = getCol("colleur");
  const iSalle = getCol("salle");
  const iGroupe = getCol("groupe");

  if (iSemaine === -1 || iJour === -1 || iMatiere === -1 || iGroupe === -1) {
    return { semaines: [], creneaux: [], assignations: {}, startDate: null, endDate: null };
  }

  const semainesMap = new Map<number, Semaine>();
  const creneauxMap = new Map<string, Creneau>();
  const assignations: Record<string, (string | null)[]> = {};

  for (let r = 0; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] as unknown[];
    const semanaNum = Number(row[iSemaine]);
    if (isNaN(semanaNum) || semanaNum < 1) continue;

    const jour = normalizeJour(row[iJour]);
    const horaire = String(row[iHoraire] ?? "").trim();
    const matiere = String(row[iMatiere] ?? "").trim();
    const colleur = normalizeColleur(iColleur !== -1 ? row[iColleur] : "");
    const salle = iSalle !== -1 ? String(row[iSalle] ?? "").trim() : "";
    const groupe = String(row[iGroupe] ?? "").trim();

    if (!jour || !horaire || !matiere || !groupe) continue;

    if (!semainesMap.has(semanaNum)) {
      semainesMap.set(semanaNum, { date: "", label: String(semanaNum) });
    }

    const cKey = `${jour}|${horaire}|${matiere}|${colleur}|${salle}|${classe}`;
    if (!creneauxMap.has(cKey)) {
      const id = `creneau-${creneauxMap.size}`;
      creneauxMap.set(cKey, { id, jour, horaire, matiere, colleur, salle, classe });
      assignations[id] = new Array(semainesMap.size).fill(null);
    }

    const creneau = creneauxMap.get(cKey)!;
    const weekIdx = semanaNum - 1;
    if (!assignations[creneau.id]) {
      assignations[creneau.id] = new Array(semainesMap.size).fill(null);
    }
    while (assignations[creneau.id].length <= weekIdx) {
      assignations[creneau.id].push(null);
    }
    assignations[creneau.id][weekIdx] = groupe;
  }

  const semaines = [...semainesMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, s]) => s);

  const sortedCreneaux = [...creneauxMap.values()];
  const rebuiltAssignments: Record<string, (string | null)[]> = {};
  for (const c of sortedCreneaux) {
    const old = assignations[c.id] ?? [];
    rebuiltAssignments[c.id] = semaines.map((_, i) => old[i] ?? null);
  }

  return {
    semaines,
    creneaux: sortedCreneaux,
    assignations: rebuiltAssignments,
    startDate: semaines.length > 0 ? semaines[0].date : null,
    endDate: null,
  };
}

/**
 * Detect whether a sheet uses matrix or flat colloscope format,
 * then parse accordingly.
 */
export function parseColloscopeSheet(
  sheet: ParsedSheetData,
  classe: string,
): Colloscope {
  // Detect format from sheet.columns headers (NOT sheet.rows — header row is stripped)
  if (sheet.columns.length > 5) {
    // Matrix format: columns 5+ are date headers (strings from Date.toString() or ISO)
    const col5Header = sheet.columns[5]?.header ?? "";
    // Date headers from xlsx: "Mon Sep 15 2025 00:00:00 GMT+..." or "2025-09-15T00:00:00.000Z"
    // Known non-date headers for flat format: "classe", "salle", "groupe", etc.
    const lower5 = col5Header.toLowerCase().trim();
    const isKnownFixed = ["classe", "salle", "groupe", "groupe de colles", "email", "emails"].includes(lower5);
    if (!isKnownFixed) {
      return parseMatrixColloscope(sheet, classe);
    }
  }
  return parseFlatColloscope(sheet, classe);
}

// ── Eleves parser ────────────────────────────────────────

/**
 * Parse an élèves (student list) sheet.
 *
 * Expected columns: NOM, PRENOM, CLASSE, GROUPE (or GROUPE DE COLLES), EMAIL (optional)
 */
export function parseElevesSheet(sheet: ParsedSheetData): Eleve[] {
  const colMap = new Map<string, number>();
  for (const col of sheet.columns) {
    colMap.set(col.header.toLowerCase().trim(), col.index);
  }

  const getCol = (names: string[]): number => {
    for (const name of names) {
      for (const [k, v] of colMap) {
        if (k === name || k.includes(name)) return v;
      }
    }
    return -1;
  };

  const iNom = getCol(["nom"]);
  const iPrenom = getCol(["prénom", "prenom"]);
  const iClasse = getCol(["classe"]);
  const iGroupe = getCol(["groupe de colles", "groupe"]);
  const iEmail = getCol(["email", "emails"]);

  if (iNom === -1 || iPrenom === -1) return [];

  const result: Eleve[] = [];
  for (let r = 0; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] as unknown[];
    const nom = String(row[iNom] ?? "").trim();
    const prenom = String(row[iPrenom] ?? "").trim();
    if (!nom && !prenom) continue;

    result.push({
      id: `eleve-${Date.now()}-${r}`,
      nom,
      prenom,
      classe: iClasse !== -1 ? String(row[iClasse] ?? "").trim() : "",
      groupe: iGroupe !== -1 ? String(row[iGroupe] ?? "").trim() : "",
      email: iEmail !== -1 ? String(row[iEmail] ?? "").trim() : "",
    });
  }

  return result;
}

// ── Utilities ────────────────────────────────────────────

/**
 * Parse a date value from a matrix header cell into an ISO date string (YYYY-MM-DD).
 * The SVAR library converts headers to strings with String(header).trim(), so:
 *   - Date objects become "Mon Sep 15 2025 00:00:00 GMT+0200 ..."
 *   - ISO strings stay as "2025-09-15T00:00:00.000Z"
 *   - Numbers are Excel serial dates
 */
function parseDateHeader(raw: unknown): string | null {
  if (raw instanceof Date) {
    return formatDateISO(raw);
  }
  if (typeof raw === "string") {
    // Try ISO format first: 2025-09-15 or 2025-09-15T00:00:00
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    // Try Date.toString() format: "Mon Sep 15 2025 00:00:00 GMT+..."
    // Use new Date(str) which can parse these
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
      return formatDateISO(parsed);
    }
    return null;
  }
  if (typeof raw === "number") {
    // Excel serial date
    const d = excelSerialToDate(raw);
    if (d) return formatDateISO(d);
  }
  return null;
}

function excelSerialToDate(serial: number): Date | null {
  if (serial < 1 || serial > 100000) return null;
  // Excel epoch: 1899-12-30 (accounting for the 1900 leap year bug)
  const ms = (serial - 25569) * 86400000;
  return new Date(ms);
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Normalize a day name: trim, title-case, handle abbreviations.
 * "lundi" → "Lundi", "LUN" → "Lundi", "lun." → "Lundi".
 */
function normalizeJour(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const lower = s.toLowerCase().replace(/[.\s]+$/, "");
  const map: Record<string, string> = {
    lundi: "Lundi", lun: "Lundi",
    mardi: "Mardi", mar: "Mardi",
    mercredi: "Mercredi", mer: "Mercredi",
    jeudi: "Jeudi", jeu: "Jeudi",
    vendredi: "Vendredi", ven: "Vendredi",
    samedi: "Samedi", sam: "Samedi",
  };
  return map[lower] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Normalize a collector name: strip "M. ", "MME. ", "M, " etc.
 * Returns original if no prefix found.
 */
function normalizeColleur(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  // Keep the full name as-is — the user expects it
  return s;
}
