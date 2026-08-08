/**
 * Modèle PUR du flux d'impression (Phase 3 — PrintOverlay).
 *
 * Aucune dépendance Svelte/Tauri ici : tout est testable sous `bun test`.
 * Le contrat est partagé entre :
 *   - le frontend (PrintOverlay.svelte → print-settings-store → pdf-export)
 *   - le backend Rust (src-tauri/src/mdprinter.rs, struct `PrintOptions`,
 *     serde camelCase) via la commande `export_markdown_pdf`.
 *
 * Unités : les marges/taille de papier sont en MILLIMÈTRES (UI métrique) ;
 * le protocole CDP (headless_chrome) attend des POUCES. La conversion
 * `MM_TO_INCH` est appliquée par `paperToInches`.
 *
 * NOTE d'orientation : CDP reçoit les dimensions en PORTRAIT et la commande
 * `landscape` fait la rotation côté Chromium (prouvé par l'E2E planches :
 * A4 8.27×11.69 + landscape:true → sortie 841,92×594,96 pts). Le frontend
 * n'inverse donc JAMAIS width/height — c'est le backend qui tourne.
 */

export type PrintTemplateId = "simple" | "course" | "dense";
export type PaperFormat = "a4" | "a5" | "a3" | "letter" | "legal" | "custom";
export type PrintOrientation = "portrait" | "landscape";

/** Marges de page en mm. */
export interface PrintMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Papier personnalisé en mm (utilisé quand `paper === "custom"`). */
export interface CustomPaper {
  width: number;
  height: number;
}

export interface PrintRequest {
  template: PrintTemplateId;
  paper: PaperFormat;
  customPaper: CustomPaper | null;
  orientation: PrintOrientation;
  margins: PrintMargins;
  /** 1–3 colonnes de mise en page (CSS multicol). */
  columns: number;
  /** Espace entre colonnes, en mm. */
  columnGap: number;
  /** Texte d'en-tête, `""` = désactivé. Placeholders : {title} {date} {page} {pages}. */
  header: string;
  /** Texte de pied de page, `""` = désactivé. Placeholders : {title} {date} {page} {pages}. */
  footer: string;
  /** Échelle d'impression CDP (0.5–2.0, 1 = 100 %). */
  scale: number;
  /** Imprimer les fonds (couleurs de fond / callouts). */
  printBackground: boolean;
  /**
   * (Phase 4 — chantier 4) Développer les wikilinks block-level en
   * transclusions récursives à l'impression : un `[[lien]]` SEUL SUR SA LIGNE
   * (hors liste, hors fence, encadré de lignes vides) devient `![[lien]]`
   * avant le rendu ; les liens inline restent des références cliquables.
   * Voir `expandWikilinksForPrint` (src/markdown/print-expand.ts).
   */
  expandLinks: boolean;
}

/** Formats de papier en mm (portrait). */
export const PAPER_FORMATS: Record<Exclude<PaperFormat, "custom">, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  a3: { width: 297, height: 420 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
};

export const MM_TO_INCH = 1 / 25.4;

/**
 * Anciennes marges `@page { margin: 32px 48px }` du md→PDF : 32px ≈ 8.47 mm,
 * 48px = 12.7 mm exactement. Ce sont les défauts du gabarit « simple » —
 * le comportement par défaut reste identique à l'avant-Phase 3.
 */
export const LEGACY_MARGINS_MM: PrintMargins = { top: 8.5, bottom: 8.5, left: 12.7, right: 12.7 };

/**
 * Réserve ajoutée à la marge haut/bas quand l'entête/pied CDP est actif :
 * l'en-tête/pied est DESSINÉ DANS la zone de marge (ligne 8px + espace
 * 2px ≈ 10px ≈ 2.6 mm) ; on réserve 10 mm pour que le contenu ne vienne pas
 * s'y coller.
 */
export const HEADER_FOOTER_RESERVE_MM = 10;

export const DEFAULT_PRINT_REQUEST: PrintRequest = {
  template: "simple",
  paper: "a4",
  customPaper: null,
  orientation: "portrait",
  margins: { ...LEGACY_MARGINS_MM },
  columns: 1,
  columnGap: 8,
  header: "",
  footer: "",
  scale: 1,
  printBackground: true,
  expandLinks: false,
};

/**
 * Défauts d'impression des PLANCHES DE COLLES (mode « planches » du
 * PrintOverlay) : la configuration ACTUELLE historiquement encodée en dur
 * dans pdf-planches.ts — A4 paysage, marges 10 mm, deux planches par page
 * côte à côte (une par colonne), écart 4 mm entre colonnes. Le gabarit
 * `.rp` (course/dense/simple) est ignoré par l'assembleur planches ; la
 * persistance est SÉPARÉE de celle du md (`print-planches.json`).
 */
export const DEFAULT_PLANCHES_PRINT_REQUEST: PrintRequest = {
  ...DEFAULT_PRINT_REQUEST,
  orientation: "landscape",
  margins: { top: 10, bottom: 10, left: 10, right: 10 },
  columns: 2,
  columnGap: 4,
};

/** Dimensions CDP en pouces (toujours en portrait — rotation par `landscape`). */
export function paperToInches(req: PrintRequest): { width: number; height: number } {
  const fmt =
    req.paper === "custom"
      ? (req.customPaper ?? { width: 210, height: 297 })
      : PAPER_FORMATS[req.paper];
  return { width: fmt.width * MM_TO_INCH, height: fmt.height * MM_TO_INCH };
}

/** L'entête ou le pied de page est-il demandé (texte non vide) ? */
export function hasHeaderFooter(req: PrintRequest): boolean {
  return req.header.trim() !== "" || req.footer.trim() !== "";
}

/**
 * CSS de page partagé par tous les gabarits (Phase 3).
 * - `@page` : marges mm + réserve entête/pied ;
 * - contenu : h1 start-page (sauf premier), orphelines/veuves, callouts
 *   dépliés (les callouts repliés imprimeraient vides — voir `details.callout`) ;
 * - saut de page EXPLICITE : `<div class="page-break"></div>` (div vide,
 *   invisible à l'écran) → `break-after: page` dans les exports PDF ;
 * - annulation du saut implicite d'UN h1 : `<h1 class="no-page-break">…</h1>`
 *   (HTML brut — markdown-it `html: true`) → `break-before: auto` (l'élément
 *   ne force plus de nouvelle page) ;
 * - colonnes : multicol CSS quand `columns > 1`.
 *
 * Le CSS des gabarits (print-templates) s'ajoute APRÈS ce bloc (dernier bloc
 * gagne à spécificité égale).
 */
export function buildPrintBaseCss(req: PrintRequest): string {
  const top = req.margins.top + (req.header.trim() !== "" ? HEADER_FOOTER_RESERVE_MM : 0);
  const bottom = req.margins.bottom + (req.footer.trim() !== "" ? HEADER_FOOTER_RESERVE_MM : 0);
  const columns =
    req.columns > 1
      ? `
    .mdv-prose { column-count: ${req.columns}; column-gap: ${req.columnGap}mm; column-fill: balance; column-rule: 1px solid #e5e7eb; }
    .mdv-prose pre, .mdv-prose table, .mdv-prose figure, .mdv-prose img, .mdv-prose .callout { break-inside: avoid; }
`
      : "";
  return `
@page { margin: ${top}mm ${req.margins.right}mm ${bottom}mm ${req.margins.left}mm; }
body { background: #fff; color: #000; margin: 0; padding: 0; }
.mdv-prose { max-width: 100%; }
.mdv-prose h1 { break-before: page; }
.mdv-prose h1:first-child { break-before: avoid; }
.mdv-prose h1.no-page-break { break-before: auto; }
.mdv-prose h2, .mdv-prose h3 { break-after: avoid; }
.mdv-prose p, .mdv-prose li { orphans: 3; widows: 3; }
.mdv-prose a { color: #0a4d8c; }
.mdv-prose .page-break { break-after: page; }
.mdv-prose pre, .mdv-prose table, .mdv-prose figure, .mdv-prose img { break-inside: avoid; }
.mdv-prose details.callout { display: block !important; }
.mdv-prose details.callout > summary { list-style: none; cursor: default; }
.mdv-prose details.callout > summary::-webkit-details-marker { display: none; }
.mdv-prose details.callout .callout-chevron { display: none !important; }
.mdv-prose details.callout[open] { display: block; }
${columns}`;
}

/**
 * Template CDP d'en-tête/pied (HTML réservé Chromium).
 * Chromium impose un ÉLÉMENT RACINE UNIQUE ; les classes réservées sont
 * .title/.date/.url/.pageNumber/.totalPages. On mappe les placeholders
 * utilisateur sur ces classes — le texte est échappé pour rester sûr
 * (les templates sont insérés tels quels dans le header du PDF).
 */
export function buildCdpHeaderFooterTemplate(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{title\}/g, '<span class="title"></span>')
    .replace(/\{date\}/g, '<span class="date"></span>')
    .replace(/\{page\}/g, '<span class="pageNumber"></span>')
    .replace(/\{pages\}/g, '<span class="totalPages"></span>');
  return `<div style="font-size:10px; width:100%; text-align:center; font-family: system-ui, sans-serif;">${esc}</div>`;
}

/** Options CDP (pouces, camelCase → serde `PrintOptions` du backend). */
export interface PrintCdpOptions {
  landscape: boolean;
  paperWidth: number;
  paperHeight: number;
  scale: number;
  printBackground: boolean;
  displayHeaderFooter: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
}

/** Construit le payload CDP complet à partir d'une requête d'impression. */
export function buildPrintCdpOptions(req: PrintRequest): PrintCdpOptions {
  const { width, height } = paperToInches(req);
  const hf = hasHeaderFooter(req);
  return {
    landscape: req.orientation === "landscape",
    paperWidth: width,
    paperHeight: height,
    scale: req.scale,
    printBackground: req.printBackground,
    displayHeaderFooter: hf,
    headerTemplate: req.header.trim() !== "" ? buildCdpHeaderFooterTemplate(req.header) : undefined,
    footerTemplate: req.footer.trim() !== "" ? buildCdpHeaderFooterTemplate(req.footer) : undefined,
  };
}
