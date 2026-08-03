/**
 * Import du colloscope : fichier xlsx → tableaux spreadsheet persistés.
 *
 * Pipeline (choix utilisateur — « process une fois, lecture directe ensuite ») :
 *   1. `importFileToMatrix` lit le fichier (xlsx) → liste de feuilles ;
 *   2. `buildColloscope` parse (Eleves + feuilles de classe) et expand l'année
 *      (vacances respectées, rotation continue) → séances datées ;
 *   3. les tableaux spreadsheet sont créés :
 *        - « Élèves » : la liste des élèves importée telle quelle ;
 *        - « Colloscope — {classe} » : UN tableau par classe avec ses séances
 *          (~450 lignes/classe, pas de colonne « Classe » : le tableau est
 *          identifié par son nom et par la clé du mapping) — éditables dans
 *          Spreadsheet, filtrables dans DataFilter (source de vérité, plus de
 *          rotation stockée) ;
 *   4. le mapping est persisté dans `cfg.colles.colloscope`.
 *
 * Décision (round 8) : un tableau PAR CLASSE plutôt qu'un tableau fusionné de
 * ~1800 lignes — le rendu monolithique de jspreadsheet (toutes les lignes dans
 * le DOM d'un coup) rendait la bascule vers le tab spreadsheet trop lente.
 *
 * Ré-import : les tableaux précédents sont supprimés, puis recréés.
 */

import { spreadsheetCreate, spreadsheetDelete } from "@/spreadsheet/store";
import type { ColumnDef } from "@/spreadsheet/types";
import { buildColloscope, type ColloscopeData, type ColloscopeSeance } from "@/colles/colloscope";
import { collesSettings } from "@/stores/colles-settings.svelte";

// ── Colonnes des tableaux créés ────────────────────────────────────────────

/** Tableau « Colloscope — {classe} » : les séances d'UNE classe, sans la
 *  colonne « Classe » (le tableau est identifié par son nom et par la clé du
 *  mapping — pas de donnée redondante sur chaque ligne). */
const COLLOSCOPE_COLUMNS: ColumnDef[] = [
  { title: "Date", width: 110, type: "text" },
  { title: "Groupe", width: 80, type: "text" },
  { title: "Matière", width: 160, type: "text" },
  { title: "Colleur", width: 160, type: "text" },
  { title: "Jour", width: 90, type: "text" },
  { title: "Horaire", width: 90, type: "text" },
  { title: "Salle", width: 90, type: "text" },
];

/** Tableau « Élèves » : liste importée telle quelle. */
const ELEVES_COLUMNS: ColumnDef[] = [
  { title: "Code", width: 200, type: "text" },
  { title: "Nom", width: 140, type: "text" },
  { title: "Prénom", width: 140, type: "text" },
  { title: "Classe", width: 80, type: "text" },
  { title: "Groupe", width: 80, type: "text" },
  { title: "Email", width: 220, type: "text" },
];

/** Nom du tableau spreadsheet d'une classe. */
import { colloscopeTableName } from "@/colles/settings-model";

/** Séance → ligne du tableau de classe (ordre COLLOSCOPE_COLUMNS, sans Classe). */
function seanceToRow(s: ColloscopeSeance): string[] {
  return [s.date, s.groupe, s.matiere, s.colleur, s.jour, s.horaire, s.salle];
}

// ── Import ─────────────────────────────────────────────────────────────────

export interface ColloscopeImportResult {
  /** spreadsheetId du tableau « Élèves ». */
  elevesSpreadsheetId: string;
  /** Tableaux « Colloscope — {classe} » : clé = classe, valeur = spreadsheetId. */
  colloscopeSpreadsheetIds: Record<string, string>;
  /** Nom du fichier importé. */
  source: string;
  /** Nombre de séances expandues. */
  seanceCount: number;
  /** Nombre d'élèves importés. */
  eleveCount: number;
}

/**
 * Importe un fichier colloscope (xlsx) dans data.db.
 *
 * @param path  chemin du fichier xlsx
 * @param opts  surcharges optionnelles (pour les tests / appels programmatiques)
 */
export async function importColloscope(
  path: string,
  opts?: {
    dateDebut?: string;
    dateFin?: string;
    vacances?: Array<{ start: string; end: string }>;
    /** Nom d'affichage (défaut : basename du fichier). */
    sourceName?: string;
  },
): Promise<ColloscopeImportResult> {
  const cs = collesSettings.current;
  const dateDebut = opts?.dateDebut ?? cs.dateDebut;
  const dateFin = opts?.dateFin ?? cs.dateFin;
  const vacances = opts?.vacances ?? cs.vacances;
  if (!dateDebut || !dateFin) {
    throw new Error("Renseignez la date de début et de fin dans Réglages › Colles › Dates.");
  }

  // Import dynamique : le parsing xlsx (excel-import-store) ne doit être
  // chargé qu'au moment de l'import, pas au démarrage de l'app.
  const { importFileToMatrix } = await import("@/lib/spreadsheet/import");
  const sheets = await importFileToMatrix({ path });
  const data = buildColloscope(sheets, dateDebut, dateFin, vacances);
  if (data.classes.length === 0) {
    throw new Error("Aucune feuille de classe reconnue. Vérifiez que le fichier contient une feuille « Eleves » et des feuilles par classe.");
  }

  const sourceName = opts?.sourceName ?? path.split("/").pop()?.replace(/\.(xlsx|csv|tsv)$/i, "") ?? path;

  // Ré-import : nettoyer les tableaux précédents du mapping (s'ils existent).
  await deletePreviousColloscope(cs.colloscope);

  // Tableau « Élèves » : la liste importée telle quelle (toujours créé, même si vide).
  const elevesRows = data.eleves.map((e) => [e.code, e.nom, e.prenom, e.classe, e.groupe, e.email]);
  const elevesId = crypto.randomUUID();
  await spreadsheetCreate(elevesId, "Élèves", ELEVES_COLUMNS, elevesRows, path);

  // Un tableau « Colloscope — {classe} » par classe, séances de la classe
  // triées par date. ~450 lignes/classe : bascule Spreadsheet rapide par
  // construction (le tableau fusionné de ~1800 lignes était trop lent).
  const classes = [...data.classes].sort((a, b) => a.localeCompare(b, "fr"));
  const colloscopeSpreadsheetIds: Record<string, string> = {};
  for (const classe of classes) {
    const seances = data.seances
      .filter((s) => s.classe === classe)
      .sort((a, b) => a.date.localeCompare(b.date));
    const id = crypto.randomUUID();
    await spreadsheetCreate(id, colloscopeTableName(classe), COLLOSCOPE_COLUMNS, seances.map(seanceToRow), path);
    colloscopeSpreadsheetIds[classe] = id;
  }

  const result: ColloscopeImportResult = {
    elevesSpreadsheetId: elevesId,
    colloscopeSpreadsheetIds,
    source: sourceName,
    seanceCount: data.seances.length,
    eleveCount: data.eleves.length,
  };

  // Persister le mapping dans cfg.colles (setter → localStorage + config.json).
  collesSettings.update((p) => ({
    ...p,
    colloscope: {
      source: result.source,
      importedAt: new Date().toISOString(),
      elevesSpreadsheetId: result.elevesSpreadsheetId,
      colloscopeSpreadsheetIds: result.colloscopeSpreadsheetIds,
    },
  }));

  return result;
}

/** Supprime les tableaux d'un précédent import (no-op si null). */
async function deletePreviousColloscope(prev: { elevesSpreadsheetId: string; colloscopeSpreadsheetIds: Record<string, string> } | null): Promise<void> {
  if (!prev) return;
  const ids = new Set<string>([prev.elevesSpreadsheetId, ...Object.values(prev.colloscopeSpreadsheetIds ?? {})]);
  for (const id of ids) {
    if (!id) continue;
    try {
      await spreadsheetDelete(id);
    } catch (err) {
      console.warn("[colloscope] suppression du tableau précédent échouée", id, err);
    }
  }
}

/** Données complètes du colloscope courant (lecture directe depuis la db). */
export async function readColloscope(): Promise<ColloscopeData | null> {
  const cs = collesSettings.current;
  if (!cs.colloscope) return null;
  const { spreadsheetGet } = await import("@/spreadsheet/store");
  try {
    const elevesTab = await spreadsheetGet(cs.colloscope.elevesSpreadsheetId);
    const eleves = elevesTab.data.map((r) => ({
      code: r[0] ?? "",
      nom: r[1] ?? "",
      prenom: r[2] ?? "",
      classe: r[3] ?? "",
      groupe: r[4] ?? "",
      email: r[5] ?? "",
    }));
    // Un tableau par classe : la classe est déduite de la CLÉ du mapping (pas
    // d'une colonne — les tableaux n'ont pas de colonne « Classe »). Colonnes :
    // Date/Groupe/Matière/Colleur/Jour/Horaire/Salle (ordre COLLOSCOPE_COLUMNS).
    const classes = Object.keys(cs.colloscope.colloscopeSpreadsheetIds).sort((a, b) => a.localeCompare(b, "fr"));
    const seances: ColloscopeSeance[] = [];
    for (const classe of classes) {
      const tab = await spreadsheetGet(cs.colloscope.colloscopeSpreadsheetIds[classe]);
      for (const r of tab.data) {
        if (!r.some((c) => c !== "")) continue;
        seances.push({
          classe,
          date: r[0] ?? "",
          groupe: r[1] ?? "",
          matiere: r[2] ?? "",
          colleur: r[3] ?? "",
          jour: r[4] ?? "",
          horaire: r[5] ?? "",
          salle: r[6] ?? "",
        });
      }
    }
    seances.sort((a, b) => a.date.localeCompare(b.date) || a.classe.localeCompare(b.classe, "fr"));
    return { eleves, seances, classes };
  } catch (err) {
    console.warn("[colloscope] lecture du colloscope échouée", err);
    return null;
  }
}
