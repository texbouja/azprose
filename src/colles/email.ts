/**
 * Gabarits email des rapports de colles — logique pure (testable, pas de DOM).
 *
 * Depuis le round 10, le CORPS de l'email est une IMAGE PNG (l'option SVG a
 * été retirée au round 16 : html-to-image ne produit que des
 * `<foreignObject>` illisibles hors navigateur) ; depuis le round 19, la
 * capture est faite par headless Chrome (commande Rust `render_report_png`,
 * plus de html-to-image ni de DOM monté dans l'app). Deux gabarits :
 *
 *  - `buildReportContent(data)` : la PAGE du rapport — gabarit réutilisable
 *    dont le CSS est EMBARQUÉ (bloc `<style>`, couleurs fixes indépendantes
 *    du thème) et le contenu changé pour chaque planche. C'est le bloc rendu
 *    dans les documents autonomes (images PNG, planches PDF).
 *  - `assembleReportImageHtml(data, opts)` : le DOCUMENT autonome capturé par
 *    headless Chrome — `<head>` MathJax CDN + CSS complet + lifecycle script
 *    (marqueur `azprose-report-ready` pollé par le backend), `<body>` la page
 *    du rapport. C'est ce HTML que `render_report_png` convertit en PNG.
 *  - `buildReportEmailHtml(data)` : le wrapper EMAIL minimal qui référence
 *    l'image en pièce jointe inline (`<img src="cid:rapport@azprose">`),
 *    construit par mailer.rs en multipart/related. Gmail-safe : ne produit
 *    jamais de `<style>`/`<script>`/`<svg>`.
 *
 * Depuis la refonte du gabarit (module `report-layout.ts`), la PAGE est
 * produite par le MOTEUR de layout configurable (5 zones, templates à
 * variables `{{…}}`, CSS du gabarit + fichiers CSS) — `buildReportContent`
 * est un simple wrapper du moteur avec le layout PAR DÉFAUT. La signature
 * « Bien cordialement » a été supprimée du moteur (décision utilisateur).
 *
 * Les helpers, le CSS et les builders de blocs vivent dans `report-layout.ts`
 * et sont ré-exportés ici pour la rétro-compat des importeurs.
 */
import {
  renderReportLayout,
  renderReportLayoutCss,
  DEFAULT_REPORT_LAYOUT,
  normalizeReportLayout,
  escHtml,
  type ReportLayout,
  type ColleReportData,
} from "./report-layout";
import { assemblePrintDocument, REPORT_READY_TITLE } from "@/printing/core/document";

export {
  REPORT_PAGE_CSS,
  escHtml,
  formatNoteValue,
  formatReportDate,
  buildReportHead,
  buildReportMetaRows,
  buildReportProgramme,
  buildReportEnonce,
  buildReportEval,
  buildReportRubrics,
  buildReportObs,
  type ColleReportData,
  type ColleReportRubric,
} from "./report-layout";

/** Content-ID de l'image inline dans le multipart/related (mailer.rs). */
export const REPORT_CID = "rapport@azprose";

/** Objet du rapport : « Colle de maths — Ahmed El Moujahid ». */
export function buildReportSubject(data: ColleReportData): string {
  const matiere = data.meta.matiere?.trim();
  const eleve = data.meta.eleve?.trim();
  return matiere ? `Colle de ${matiere} — ${eleve}` : `Colle — ${eleve}`;
}

/**
 * La PAGE du rapport composée d'un bloc (équivalent gabarit + fill, sans DOM) :
 * c'est le HTML du gabarit avec le contenu de la planche. Largeur fixe 640px,
 * hauteur minimale au ratio 16:10 (1280×2048 en sortie image), styles 100 %
 * embarqués — couleurs fixes indépendantes du thème.
 *
 * Les fragments markdown (`bodyHtml`/`observationsHtml`) sont insérés tels
 * quels (produits par la pipeline : callouts, images, maths en SVG MathJax).
 *
 * `includeEval` (défaut true — l'email ne le passe pas) : l'impression des
 * planches (round 18) peut OMETTRE la « troisième carte » (section Évaluation
 * : notes + observations) — feuille d'examen pour les élèves (sans) vs
 * archivage administration (avec).
 *
 * `includeSalle` (défaut true) : OMISE dans les rendus PNG/PDF (retouche
 * round 18) — la vue HTML de l'app la garde.
 *
 * `layout` (défaut DEFAULT_REPORT_LAYOUT) : le gabarit configurable du rapport
 * (réglages → Impression → Gabarit du rapport).
 */
export function buildReportContent(
  data: ColleReportData,
  includeEval = true,
  includeSalle = true,
  layout: ReportLayout = DEFAULT_REPORT_LAYOUT,
): string {
  return renderReportLayout(data, layout, { includeEval, includeSalle });
}

/**
 * Marqueur de fin de rendu posé par le lifecycle script — pollé par le backend
 * headless (mdprinter.rs `REPORT_READY_TITLE`) avant la capture PNG. Distinct
 * du marqueur d'impression `azprose-print-ready` (pdf-export.ts / pdf-planches).
 * Défini dans le noyau printing (src/printing/core/document.ts), ré-exporté ici
 * pour préserver l'API historique de ce module.
 */
export { REPORT_READY_TITLE };

/** Options d'assemblage du document image (toutes optionnelles — défauts stables). */
export interface ReportImageOptions {
  /** Config `window.MathJax = {...}` (défaut : rien — MathJax n'est pas chargé). */
  mathjaxConfig?: string;
  /** Préambule mathématique utilisateur (macros LaTeX), injecté en math caché. */
  preamble?: string;
  /** CSS typographique de la section « Printing » (buildReportPrintCss). */
  printCss?: string;
  /** Gabarit configurable du rapport (réglages → Impression → Gabarit). */
  layout?: ReportLayout;
}

/**
 * Le DOCUMENT HTML auto-suffisant capturé par headless Chrome (round 19) :
 * remplace le DOM monté dans l'app + html-to-image. Structure identique aux
 * documents d'impression (pdf-planches.ts `assemblePrintHtml`) — `<head>`
 * MathJax CDN + CSS complet, `<body>` la page du rapport SANS son bloc
 * `<style>` embarqué (tout le CSS — gabarit + printCss — est injecté dans le
 * `<head>`, dans cet ordre : à spécificité égale le dernier bloc gagne).
 *
 * Le rapport est typé par MathJax au chargement (les maths `\(…\)` brutes
 * produites par la pipeline markdown deviennent des SVG) ; le lifecycle
 * script pose le marqueur `azprose-report-ready` une fois terminé.
 *
 * Contexte de rendu FIXE (mêmes contraintes que l'ancien `fillReportPage(page,
 * data, false)`) : section Évaluation incluse (`includeEval`), Salle OMISE
 * (`includeSalle: false` — retouche round 18 : les images et les planches PDF
 * retirent la salle, la vue HTML de l'app la garde).
 */
export function assembleReportImageHtml(
  data: ColleReportData,
  opts: ReportImageOptions = {},
): string {
  const L = normalizeReportLayout(opts.layout);
  const mathjax = opts.mathjaxConfig?.trim();
  const preamble = opts.preamble?.trim();
  const printCss = opts.printCss?.trim();

  return assemblePrintDocument({
    title: "Rapport de colle",
    cssBlocks: [renderReportLayoutCss(L), printCss],
    mathjaxConfig: mathjax,
    mathjaxCdn: Boolean(mathjax),
    bodyAttrs: "style=\"margin:0;padding:0;background:#f0f2f5;\"",
    body: `${preambleBlock(preamble)}
${renderReportLayout(data, L, { includeEval: true, includeSalle: false }, { includeCss: false })}`,
    readyMarker: REPORT_READY_TITLE,
  });
}

/** Le préambule mathématique caché (macros LaTeX) — partagé avec les planches. */
function preambleBlock(preamble?: string): string {
  return preamble
    ? `<div style="position:absolute;left:-9999px" aria-hidden="true">$$${preamble}$$</div>`
    : "";
}

/**
 * Le wrapper EMAIL : un simple `<img>` référençant l'image en pièce jointe
 * inline (multipart/related — mailer.rs l'assemble avec le Content-ID
 * `REPORT_CID`). Styles 100 % inline, jamais de `<style>`/`<script>`/`<svg>`.
 */
export function buildReportEmailHtml(data: ColleReportData): string {
  const m = data.meta;
  const alt = `${m.matiere?.trim() || "Colle"} — ${m.eleve?.trim() || "rapport de colle"}`;
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>` +
    `<body style="margin:0;padding:0;background:#f0f2f5;">` +
    `<img src="cid:${REPORT_CID}" alt="${escHtml(alt)}" ` +
    `style="display:block;width:100%;max-width:640px;height:auto;margin:0 auto;">` +
    `</body></html>`
  );
}
