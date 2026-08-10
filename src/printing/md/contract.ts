/**
 * Module d'impression de type "md" (export md→PDF, printing.md §2.1) —
 * implémentation du contrat type pour les documents markdown.
 *
 * Le contrat est STATIQUE : il branche le noyau overlay sur la persistance
 * par type (`core/settings.ts`), le compteur de feuilles (toujours 1 pour un
 * document), et les builders de pdf-export (assembleur HTML + dialogue de
 * destination + backend CDP). Le déplacement des assembleurs vers
 * `md/document.ts` est prévu à l'étape 6 (nettoyage) — ici, pdf-export reste
 * la source de vérité de l'assemblage.
 */
import { exportMarkdownPdf, previewMarkdownPdf } from "@/lib/pdf-export";
import { DEFAULT_PRINT_REQUEST } from "@/lib/print-request";
import type { Theme } from "@/lib/theme";
import { loadTypeRequest, saveTypeRequest } from "@/printing/core/settings";
import { MD_PRINT_STORAGE } from "@/printing/core/settings-model";
import type { PrintTypeContract, PrintExportResult, PrintTypeContext } from "@/printing/core/contract";

/** Thème courant de l'app (attribut `data-theme` du document racine). */
function currentTheme(): Theme {
  return (document.documentElement.getAttribute("data-theme") as Theme | null) ?? "latte";
}

export const mdPrintContract: PrintTypeContract = {
  id: "md",
  titleKey: "print.title",
  features: { template: true, expandLinks: true },
  defaultRequest: DEFAULT_PRINT_REQUEST,
  loadRequest: () => loadTypeRequest(MD_PRINT_STORAGE),
  saveRequest: (req) => saveTypeRequest(MD_PRINT_STORAGE, req),
  countFor: () => 1,
  canExport: (count) => count > 0,
  doneKey: "pdf.exported",
  preview: (ctx: PrintTypeContext, req) =>
    previewMarkdownPdf(ctx.source, currentTheme(), ctx.filePath ?? "", req),
  export: async (ctx: PrintTypeContext, req): Promise<PrintExportResult> => {
    if (!ctx.filePath) return { status: "empty" }; // garde du noyau (ne doit pas arriver)
    const path = await exportMarkdownPdf(ctx.source, currentTheme(), ctx.filePath, req);
    if (path === null) return { status: "cancelled" };
    return { status: "exported", path };
  },
};
