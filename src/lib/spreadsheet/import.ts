/**
 * Pipeline d'acquisition unifié : xlsx / csv / tsv → matrice 2D + en-têtes.
 *
 * Délègue le parsing à @svar-ui/excel-import-store (parseExcelFile),
 * qui détecte automatiquement le format par l'extension du fichier.
 *
 * Utilisable depuis un file picker (File) ou depuis un chemin Tauri.
 */

import { parseExcelFile } from "@svar-ui/excel-import-store";
import { readFile } from "@/lib/files";

// ── Types ──────────────────────────────────────────────────

export interface ImportResult {
  /** Nom du fichier ou de la feuille (pour l'onglet). */
  name: string;
  /** En-têtes de colonnes. */
  headers: string[];
  /** Données brutes (matrice 2D). */
  rows: string[][];
}

// ── Import ─────────────────────────────────────────────────

/**
 * Importer un fichier (xlsx, csv, tsv) → matrice(s) 2D + en-têtes.
 *
 * @param source - File (depuis un picker HTML) ou { path } (chemin Tauri)
 * @returns Une promesse de liste de résultats (une feuille = un résultat)
 */
export async function importFileToMatrix(
  source: File | { path: string },
): Promise<ImportResult[]> {
  const file = source instanceof File ? source : await pathToFile(source.path);
  const parsed = await parseExcelFile(file);

  // parsed.sheets: ParsedSheetData[] — chaque feuille est un objet avec columns et rows
  return (parsed.sheets as ParsedSheetData[]).map((sheet) => ({
    name: sheet.name ?? file.name.replace(/\.(xlsx|csv|tsv)$/i, ""),
    headers: sheet.columns.map((c) => c.header),
    rows: sheet.rows.map((row: unknown[]) =>
      row.map((cell) => String(cell ?? "").trim()),
    ),
  }));
}

/**
 * Convertir un chemin Tauri en objet File (via lecture binaire).
 */
async function pathToFile(path: string): Promise<File> {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const bytes = await readFile(path);
  const mime = ext === "csv"
    ? "text/csv"
    : ext === "tsv"
      ? "text/tab-separated-values"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const blob = new Blob([bytes], { type: mime });
  const name = path.split("/").pop() ?? "fichier";
  return new File([blob], name, { type: mime });
}

// ── Shape attendu de @svar-ui/excel-import-store (non typé) ──

interface ParsedSheetData {
  name: string;
  columns: Array<{ header: string }>;
  rows: unknown[][];
}
