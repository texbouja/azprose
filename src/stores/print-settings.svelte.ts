/**
 * Persistance de la requête d'impression (Phase 3).
 *
 * Fichier : `<vault>/.azprose/print.json` (décision utilisateur — persistance
 * par projet, même pattern que config.json). Le merge est DÉFENSIF : tout
 * champ manquant ou invalide retombe sur `DEFAULT_PRINT_REQUEST`, jamais de
 * crash au load d'un fichier ancien/édité à la main.
 *
 * Depuis l'intégration des planches de colles dans le PrintOverlay (mode
 * « planches »), la persistance est SÉPARÉE par mode :
 * - `print.json` (défaut) — export md→PDF ;
 * - `print-planches.json` — impression des planches de colles (défauts
 *   A4 paysage 2 colonnes : `DEFAULT_PLANCHES_PRINT_REQUEST`).
 * `mergeRequest(saved, base)` accepte le base en argument pour partager la
 * même logique défensive entre les deux modes.
 */

import { joinPath, readText, writeText } from "@/lib/files";
import {
  DEFAULT_PLANCHES_PRINT_REQUEST,
  DEFAULT_PRINT_REQUEST,
  type PrintRequest,
} from "@/lib/print-request";
import { getRootPath } from "@/stores/root-path.svelte";

export const PRINT_CONFIG_FILE = ".azprose/print.json";
export const PLANCHES_PRINT_CONFIG_FILE = ".azprose/print-planches.json";

function printConfigPath(root: string, file: string): string {
  return joinPath(root, file);
}

export function mergeRequest(
  saved: Partial<PrintRequest> | null,
  base: PrintRequest = DEFAULT_PRINT_REQUEST,
): PrintRequest {
  if (!saved || typeof saved !== "object") return { ...base };
  return {
    ...base,
    ...saved,
    margins: {
      ...base.margins,
      ...(saved.margins && typeof saved.margins === "object" ? saved.margins : {}),
    },
    customPaper:
      saved.customPaper && typeof saved.customPaper === "object"
        ? { ...saved.customPaper }
        : null,
  };
}

/** Charge la dernière requête d'impression du projet (défauts si absente). */
export async function loadPrintRequest(): Promise<PrintRequest> {
  return loadPrintRequestFrom(PRINT_CONFIG_FILE, DEFAULT_PRINT_REQUEST);
}

/** Persiste la requête d'impression du projet (créé le dossier si besoin). */
export async function savePrintRequest(req: PrintRequest): Promise<void> {
  return savePrintRequestTo(PRINT_CONFIG_FILE, req);
}

/** Charge la requête d'impression du mode « planches » (défauts si absente). */
export async function loadPlanchesPrintRequest(): Promise<PrintRequest> {
  return loadPrintRequestFrom(PLANCHES_PRINT_CONFIG_FILE, DEFAULT_PLANCHES_PRINT_REQUEST);
}

/** Persiste la requête d'impression du mode « planches ». */
export async function savePlanchesPrintRequest(req: PrintRequest): Promise<void> {
  return savePrintRequestTo(PLANCHES_PRINT_CONFIG_FILE, req);
}

async function loadPrintRequestFrom(
  file: string,
  base: PrintRequest,
): Promise<PrintRequest> {
  const root = getRootPath();
  if (!root) return { ...base };
  try {
    const raw = await readText(printConfigPath(root, file));
    const parsed = JSON.parse(raw);
    return mergeRequest(parsed, base);
  } catch {
    return { ...base };
  }
}

async function savePrintRequestTo(file: string, req: PrintRequest): Promise<void> {
  const root = getRootPath();
  if (!root) return;
  try {
    await writeText(printConfigPath(root, file), JSON.stringify(req, null, 2));
  } catch {
    // Meilleur effort : l'impression reste possible, la préférence ne se
    // persiste pas (fichier non créé → prochain lancement = défauts).
  }
}
