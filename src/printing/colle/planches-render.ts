/**
 * Rendu DOM + IPC de l'impression des planches de colles (round 18).
 *
 * Ce module est le pendant IMPUR de `planches.ts` (qui est pur et
 * testable) : il rend les fragments markdown de TOUTES les planches (pipeline
 * complète — callouts, images, maths), assemble le document via
 * `assemblePrintHtml` (mise en page `req.print`, défaut A4 paysage 2 colonnes)
 * et le confie au backend `export_markdown_pdf` (headless Chrome print_to_pdf
 * — le PDF est écrit directement sur disque, plus de dialogue d'impression
 * natif).
 *
 * Séparé du module pur pour que les tests bun n'importent jamais la chaîne
 * Svelte (`$state`).
 */
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog"; // statique : déjà eager (app.svelte)
import { parsePlanches } from "@/colles/parse";
import { buildReportData } from "./email-render";
import { assemblePrintHtml, type CollePrintOptions } from "./planches";
import { DEFAULT_REPORT_LAYOUT } from "./layout";
import type { RubriquesParMatiere } from "@/colles/types";
import { buildMathJaxConfig } from "@/lib/pdf-export";
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";
import { collesSettings } from "@/stores/colles-settings.svelte";
import { printSettings } from "@/stores/markdown-settings.svelte";
import { buildReportPrintCss } from "@/lib/prose-style-css";
import { getRootPath } from "@/stores/root-path.svelte";
import {
  buildPrintCdpOptions,
  DEFAULT_PLANCHES_PRINT_REQUEST,
  type PrintRequest,
} from "@/lib/print-request";

/** Requête complète d'impression (source + options de rendu + mise en page). */
export interface CollePrintRequest extends CollePrintOptions {
  source: string;
  rubriques: RubriquesParMatiere;
  /** Mise en page (mode « planches » du PrintOverlay) — défaut A4 paysage 2 colonnes. */
  print?: PrintRequest;
}

/**
 * Prépare l'impression des planches : parse la note, rend les fragments
 * markdown de TOUTES les planches (pipeline complète), assemble le document
 * (mise en page `req.print`), demande la destination via un dialogue natif et
 * le confie au backend headless (print_to_pdf direct sur disque).
 *
 * Retourne :
 * - `false` si aucune planche n'est trouvée dans la source ;
 * - `null` si l'utilisateur a annulé le dialogue de destination ;
 * - le chemin du PDF écrit sinon.
 */
export async function exportPlanchesPdf(
  req: CollePrintRequest,
): Promise<false | string | null> {
  const section = parsePlanches(req.source);
  if (!section.planches.length) return false;
  const print = req.print ?? DEFAULT_PLANCHES_PRINT_REQUEST;
  const datas = await Promise.all(
    section.planches.map((p) => buildReportData(p, req.rubriques, req)),
  );
  // Préambule mathématique de l'app (macros LaTeX de l'utilisateur) — injecté
  // en tête du document comme math display caché (pattern pdf-export.ts).
  // CSS typographique de la section « Printing » — s'applique aux blocs de
  // contenu markdown des planches (énoncé + observations).
  // Gabarit du rapport configurable (réglages → Impression) — le layout
  // courant est transmis au document autonome.
  const html = assemblePrintHtml(
    datas,
    req.includeEval,
    buildMathJaxConfig(),
    mathJaxPreamble.current,
    buildReportPrintCss(printSettings.current),
    collesSettings.current.layout ?? DEFAULT_REPORT_LAYOUT,
    print,
  );

  // La destination est choisie AVANT le rendu headless (à côté de la note
  // source, suffixe `-planches`).
  const defaultPath = req.filePath
    ? req.filePath.replace(/\.md$/i, "-planches.pdf")
    : "planches.pdf";
  const outputPath = await save({
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    defaultPath,
  });
  if (!outputPath) return null;

  await invoke("export_markdown_pdf", {
    html,
    outputPath,
    rootPath: getRootPath() ?? null,
    options: buildPrintCdpOptions(print),
  });
  return outputPath;
}

/**
 * Aperçu avant impression des planches (pattern `previewMarkdownPdf` du
 * md→PDF) : assemble le MÊME document HTML que l'export (mêmes réglages
 * `req.print`) et l'affiche dans une fenêtre Chromium VISIBLE via la commande
 * Rust `preview_print` (browser non-headless dédié).
 *
 * Le backend écrit le HTML dans `.azprose/tmp/print-preview-<ts>.html` (cache
 * du vault, non supprimé). Retourne le chemin du fichier d'aperçu.
 */
export async function previewPlanchesPdf(req: CollePrintRequest): Promise<string> {
  const section = parsePlanches(req.source);
  if (!section.planches.length) return "";
  const print = req.print ?? DEFAULT_PLANCHES_PRINT_REQUEST;
  const datas = await Promise.all(
    section.planches.map((p) => buildReportData(p, req.rubriques, req)),
  );
  const html = assemblePrintHtml(
    datas,
    req.includeEval,
    buildMathJaxConfig(),
    mathJaxPreamble.current,
    buildReportPrintCss(printSettings.current),
    collesSettings.current.layout ?? DEFAULT_REPORT_LAYOUT,
    print,
  );
  return await invoke<string>("preview_print", {
    html,
    rootPath: getRootPath() ?? null,
  });
}
