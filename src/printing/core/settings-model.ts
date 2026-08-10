/**
 * Modèle PUR de persistance d'impression par type (printing.md §2.4) —
 * AUCUNE dépendance Svelte/Tauri : testable sous `bun test`.
 *
 * Un fichier par type : `.azprose/print/<type>.json` (md → `print/md.json`,
 * colle → `print/colle.json`). MIGRATION EN LECTURE SEULE : l'ancien fichier
 * à plat (`print.json` / `print-planches.json`) est lu en repli quand le
 * fichier courant n'existe pas encore ; l'écriture se fait TOUJOURS vers le
 * fichier courant (le prochain lancement lit le nouveau chemin).
 *
 * Le merge est DÉFENSIF (pattern `mergeRequest` historique) : tout champ
 * manquant ou invalide retombe sur les défauts du type, jamais de crash au
 * load d'un fichier ancien/édité à la main.
 */
import {
  DEFAULT_PLANCHES_PRINT_REQUEST,
  DEFAULT_PRINT_REQUEST,
  type PrintRequest,
} from "@/lib/print-request";

/** Emplacement de persistance d'un type + ses défauts + son repli legacy. */
export interface PrintTypeStorage {
  /** Fichier courant : `.azprose/print/<type>.json`. */
  file: string;
  /** Ancien fichier à plat (pré-refonte), lu en repli s'il existe. */
  legacyFile: string | null;
  /** Défauts du type (base du merge défensif). */
  defaults: PrintRequest;
}

/**
 * Merge DÉFENSIF : tout champ manquant/invalide retombe sur `base`. Les
 * sous-objets (marges, papier custom) sont fusionnés niveau par niveau —
 * jamais de crash sur un fichier ancien ou édité à la main.
 */
export function mergeRequest(
  saved: Partial<PrintRequest> | null,
  base: PrintRequest,
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

/**
 * Emplacements des types connus. `md` et `colle` remplacent respectivement
 * `print.json` et `print-planches.json` (migration en lecture seule).
 */
export const MD_PRINT_STORAGE: PrintTypeStorage = {
  file: ".azprose/print/md.json",
  legacyFile: ".azprose/print.json",
  defaults: DEFAULT_PRINT_REQUEST,
};

export const COLLE_PRINT_STORAGE: PrintTypeStorage = {
  file: ".azprose/print/colle.json",
  legacyFile: ".azprose/print-planches.json",
  defaults: DEFAULT_PLANCHES_PRINT_REQUEST,
};
