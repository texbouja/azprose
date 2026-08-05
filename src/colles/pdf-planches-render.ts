/**
 * Rendu DOM + IPC de l'impression des planches de colles (round 18).
 *
 * Ce module est le pendant IMPUR de `pdf-planches.ts` (qui est pur et
 * testable) : il rend les fragments markdown de TOUTES les planches (pipeline
 * complète — callouts, images, maths), assemble le document A4 paysage 2
 * colonnes via `assemblePrintHtml` et le confie au backend `export_markdown_pdf`
 * (navigateur système + dialogue d'impression natif).
 *
 * Séparé du module pur pour que les tests bun n'importent jamais la chaîne
 * Svelte (`$state`) ni html-to-image.
 */
import { invoke } from "@tauri-apps/api/core";
import { parsePlanches } from "./parse";
import { buildReportData } from "./email-render";
import { assemblePrintHtml, type CollePrintOptions } from "./pdf-planches";
import type { RubriquesParMatiere } from "./types";
import { buildMathJaxConfig } from "@/lib/pdf-export";
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";
import { printSettings } from "@/stores/markdown-settings.svelte";
import { buildReportPrintCss } from "@/lib/prose-style-css";

/** Requête complète d'impression (source + options de rendu). */
export interface CollePrintRequest extends CollePrintOptions {
  source: string;
  rubriques: RubriquesParMatiere;
}

/**
 * Prépare l'impression des planches : parse la note, rend les fragments
 * markdown de TOUTES les planches (pipeline complète), assemble le document
 * A4 paysage 2 colonnes et le confie au backend (navigateur système + dialogue
 * d'impression natif). Retourne `false` si aucune planche n'est trouvée dans
 * la source.
 */
export async function exportPlanchesPdf(req: CollePrintRequest): Promise<boolean> {
  const section = parsePlanches(req.source);
  if (!section.planches.length) return false;
  const datas = await Promise.all(
    section.planches.map((p) => buildReportData(p, req.rubriques, req)),
  );
  // Préambule mathématique de l'app (macros LaTeX de l'utilisateur) — injecté
  // en tête du document comme math display caché (pattern pdf-export.ts).
  // CSS typographique de la section « Printing » — s'applique aux blocs de
  // contenu markdown des planches (énoncé + observations).
  const html = assemblePrintHtml(
    datas,
    req.includeEval,
    buildMathJaxConfig(),
    mathJaxPreamble.current,
    buildReportPrintCss(printSettings.current),
  );
  await invoke("export_markdown_pdf", { html });
  return true;
}
