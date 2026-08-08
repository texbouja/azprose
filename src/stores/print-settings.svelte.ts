/**
 * Persistance de la requête d'impression (Phase 3).
 *
 * Fichier : `<vault>/.azprose/print.json` (décision utilisateur — persistance
 * par projet, même pattern que config.json). Le merge est DÉFENSIF : tout
 * champ manquant ou invalide retombe sur `DEFAULT_PRINT_REQUEST`, jamais de
 * crash au load d'un fichier ancien/édité à la main.
 */

import { joinPath, readText, writeText } from "@/lib/files";
import { DEFAULT_PRINT_REQUEST, type PrintRequest } from "@/lib/print-request";
import { getRootPath } from "@/stores/root-path.svelte";

export const PRINT_CONFIG_FILE = ".azprose/print.json";

function printConfigPath(root: string): string {
  return joinPath(root, PRINT_CONFIG_FILE);
}

function mergeRequest(saved: Partial<PrintRequest> | null): PrintRequest {
  if (!saved || typeof saved !== "object") return { ...DEFAULT_PRINT_REQUEST };
  return {
    ...DEFAULT_PRINT_REQUEST,
    ...saved,
    margins: {
      ...DEFAULT_PRINT_REQUEST.margins,
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
  const root = getRootPath();
  if (!root) return { ...DEFAULT_PRINT_REQUEST };
  try {
    const raw = await readText(printConfigPath(root));
    const parsed = JSON.parse(raw);
    return mergeRequest(parsed);
  } catch {
    return { ...DEFAULT_PRINT_REQUEST };
  }
}

/** Persiste la requête d'impression du projet (créé le dossier si besoin). */
export async function savePrintRequest(req: PrintRequest): Promise<void> {
  const root = getRootPath();
  if (!root) return;
  try {
    await writeText(printConfigPath(root), JSON.stringify(req, null, 2));
  } catch {
    // Meilleur effort : l'impression reste possible, la préférence ne se
    // persiste pas (fichier non créé → prochain lancement = défauts).
  }
}

export { mergeRequest };
