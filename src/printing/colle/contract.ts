/**
 * Module d'impression de type "colle" (planches PDF, printing.md §2.1) —
 * implémentation du contrat type pour les planches de colles.
 *
 * Le contrat est STATIQUE : il branche le noyau overlay sur la persistance
 * par type (`core/settings.ts`), le compteur de planches (`parsePlanches`,
 * synchrone), et les builders de pdf-planches-render. La checkbox
 * « avec/sans évaluation » est un réglage du DERNIER RENDU (comme les autres
 * champs du PrintRequest) : le snippet colle la pousse via `setIncludeEval`
 * et les builders la relisent à l'instant de l'export/aperçu.
 */
import { exportPlanchesPdf, previewPlanchesPdf, type CollePrintRequest } from "@/colles/pdf-planches-render";
import { parsePlanches } from "@/colles";
import { DEFAULT_PLANCHES_PRINT_REQUEST } from "@/lib/print-request";
import { getRootPath } from "@/stores/root-path.svelte";
import { userProfile } from "@/stores/user-profile.svelte";
import { collesSettings } from "@/stores/colles-settings.svelte";
import { loadTypeRequest, saveTypeRequest } from "@/printing/core/settings";
import { COLLE_PRINT_STORAGE } from "@/printing/core/settings-model";
import type { PrintTypeContract, PrintExportResult, PrintTypeContext } from "@/printing/core/contract";

/** État UI partagé du module colle : checkbox « avec/sans évaluation ». */
let includeEval = false;

/** Requête planches complète à partir du contexte du noyau. */
function buildColleReq(ctx: PrintTypeContext, req: Parameters<PrintTypeContract["export"]>[1]): CollePrintRequest {
  const theme = document.documentElement.getAttribute("data-theme") ?? "latte";
  return {
    source: ctx.source,
    rubriques: collesSettings.current.rubriques,
    theme,
    filePath: ctx.filePath,
    rootPath: getRootPath() ?? null,
    colleur: userProfile.current.colleurName,
    includeEval,
    print: req,
  };
}

/** Extension propre au type colle : état de la checkbox « avec/sans évaluation ». */
export interface CollePrintContract extends PrintTypeContract {
  setIncludeEval: (value: boolean) => void;
}

export const collePrintContract: CollePrintContract = {
  id: "colle",
  titleKey: "colle.printTitle",
  features: { template: false, expandLinks: false },
  defaultRequest: DEFAULT_PLANCHES_PRINT_REQUEST,
  loadRequest: () => loadTypeRequest(COLLE_PRINT_STORAGE),
  saveRequest: (req) => saveTypeRequest(COLLE_PRINT_STORAGE, req),
  countFor: (source) => parsePlanches(source).planches.length,
  canExport: (count) => count > 0,
  emptyKey: "colle.printEmpty",
  doneKey: "colle.printDone",
  /** Pousse l'état de la checkbox « avec/sans évaluation » (snippet colle). */
  setIncludeEval(value: boolean) {
    includeEval = value;
  },
  preview: async (ctx, req) => previewPlanchesPdf(buildColleReq(ctx, req)),
  export: async (ctx, req): Promise<PrintExportResult> => {
    const out = await exportPlanchesPdf(buildColleReq(ctx, req));
    if (out === false) return { status: "empty" };
    if (out === null) return { status: "cancelled" };
    return { status: "exported", path: out };
  },
};
