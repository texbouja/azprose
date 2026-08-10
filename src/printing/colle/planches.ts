/**
 * Impression des planches de colles (bouton « Print » du mode colle, round 18).
 *
 * Ce module est PUR (testable sans DOM ni Tauri) : il assemble le document
 * HTML d'impression. La partie DOM/IPC (rendu des fragments markdown + appel
 * du backend) vit dans `planches-render.ts` — séparée pour que les tests
 * bun n'importent jamais la chaîne Svelte (stores `$state`).
 *
 * Pattern : le PATTERN GÉNÉRAL md→PDF (src/lib/pdf-export.ts → mdprinter.rs) —
 * un document HTML auto-suffisant est confié à la commande Rust
 * `export_markdown_pdf` (headless Chrome `print_to_pdf` — le PDF est écrit
 * DIRECTEMENT sur disque par le backend, plus de dialogue d'impression natif).
 * PAS de jspdf/html2canvas (abandonnés au round 17 : raster + coût CPU énorme
 * — l'app se figeait) : le PDF final est VECTORIEL (texte sélectionnable,
 * maths MathJax en SVG, reflow au format de papier choisi) et le coût côté
 * app est nul.
 *
 * Mise en page : paramétrée depuis le PrintOverlay (mode « planches ») — par
 * défaut A4 PAYSAGE, DEUX planches par page (une par colonne, feuille
 * d'examen à découper), via `buildPlanchesPrintCss(req)` + les options CDP
 * (`buildPrintCdpOptions`). Chaque planche réutilise le GABARIT du rapport
 * d'email (`.rp` / REPORT_PAGE_CSS — le même rendu que l'archivage image),
 * une seule source de vérité.
 *
 * `includeEval` : sans évaluation (défaut du dialogue) la « troisième carte »
 * (section Évaluation — notes + observations) est omise → feuille à découper
 * et fournir aux élèves le jour de l'examen ; avec → archivage administration.
 * Les élèves reçoivent le compte rendu complet par email (volet existant).
 */
import {
  DEFAULT_REPORT_LAYOUT,
  normalizeReportLayout,
  renderReportLayout,
  renderReportLayoutCss,
  type ColleReportData,
  type ReportLayout,
} from "./layout";
import {
  DEFAULT_PLANCHES_PRINT_REQUEST,
  HEADER_FOOTER_RESERVE_MM,
  type PrintRequest,
} from "@/lib/print-request";
import { assemblePrintDocument, PRINT_READY_TITLE } from "@/printing/core/document";

/** Options de rendu des planches pour l'impression. */
export interface CollePrintOptions {
  theme: string;
  filePath: string | null;
  rootPath?: string | null;
  /** Nom du colleur pour la signature (repli meta.colleur). */
  colleur?: string;
  /** true → inclut la section Évaluation (notes + observations). */
  includeEval: boolean;
}

/**
 * CSS de mise en page d'impression des planches (mode « planches » du
 * PrintOverlay). Paramétré par `req` (défaut = DEFAULT_PLANCHES_PRINT_REQUEST :
 * A4 paysage, marges 10 mm, DEUX planches par page côte à côte — feuille
 * d'examen à découper). `.pl-pair` regroupe les planches par rangée de
 * `req.columns` et `break-inside: avoid` garde la rangée sur la MÊME page.
 *
 * Les réglages `.rp*` sont des SURCHARGES du gabarit email : la planche
 * remplit sa colonne (width 100 %), hauteur NATURELLE (plus de min-height au
 * ratio 16:10 — l'image d'email a besoin d'un ratio, la page imprimée non),
 * fond blanc sans marge externe (le gris `#f0f2f5` et le padding servaient à
 * la capture).
 *
 * `!important` obligatoire : le bloc `<style>` embarqué du gabarit `.rp` serait
 * rendu DANS LE CORPS, APRÈS ce bloc `<head>` — à spécificité égale c'est le
 * dernier qui gagne, le gabarit écraserait la mise en page d'impression.
 *
 * PAS de `@page { size: ... }` : l'orientation et le format de papier sont
 * portés par les options CDP (`buildPrintCdpOptions` → print_to_pdf, pattern
 * md→PDF). La marge `@page` reste la source de vérité du contenu ; quand
 * `req.header`/`req.footer` sont demandés, le rendu CDP dessine le texte DANS
 * la zone de marge → on réserve ~10 mm (HEADER_FOOTER_RESERVE_MM) au haut/bas
 * pour que le contenu ne soit pas chevauché.
 */
export function buildPlanchesPrintCss(req: PrintRequest = DEFAULT_PLANCHES_PRINT_REQUEST): string {
  const m = req.margins;
  const top = m.top + (req.header.trim() !== "" ? HEADER_FOOTER_RESERVE_MM : 0);
  const bottom = m.bottom + (req.footer.trim() !== "" ? HEADER_FOOTER_RESERVE_MM : 0);
  const cols = clampColumns(req.columns);
  const gap =
    typeof req.columnGap === "number" && Number.isFinite(req.columnGap) && req.columnGap >= 0
      ? req.columnGap
      : 4;
  return `
@page { margin: ${top}mm ${m.right}mm ${bottom}mm ${m.left}mm; }
html, body { margin: 0; padding: 0; }
body { background: #fff; }
.pl-doc { padding: 0; }
.pl-pair {
  display: grid;
  grid-template-columns: repeat(${cols}, 1fr);
  gap: ${gap}mm;
  margin-bottom: 8mm;
  break-inside: avoid;
  page-break-inside: avoid;
}
.pl-doc .rp { width: 100% !important; min-height: 0 !important; background: #fff !important; padding: 0 !important; }
.pl-doc .rp-card { width: 100% !important; margin: 0 !important; }
.pl-doc .rp-body { padding: 8px 10px !important; }
`;
}

/** CSS d'impression PAR DÉFAUT (A4 paysage, 2 colonnes, gap 4 mm). */
export const PRINT_PAGE_CSS = buildPlanchesPrintCss();

/** Nombre de colonnes valide (1–4) ; défaut 2 = la configuration actuelle. */
function clampColumns(v: number | undefined): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 4 ? v : 2;
}

/** Regroupe les éléments par rangées de `cols` colonnes (2 par défaut). */
export function chunkPairs<T>(items: T[], cols = 2): T[][] {
  const n = clampColumns(cols);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/**
 * Config MathJax par défaut (repli si l'app n'en fournit pas — le module
 * render passe la VRAIE config de pdf-export.ts, qui lit les packs de maths
 * de l'app ; ici c'est un minimum suffisant pour le document autonome).
 */
const DEFAULT_MATHJAX_CONFIG = `
    window.MathJax = {
      loader: { paths: { mathjax: 'https://cdn.jsdelivr.net/npm/mathjax@4' } },
      tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        processEscapes: true,
        tags: 'ams',
      },
      svg: { fontCache: 'global' },
      startup: { typeset: true },
      // V4 active les extensions a11y par défaut — désactivées pour les
      // documents autonomes (même bloc que buildMathJaxConfig de pdf-export.ts
      // et que main.ts) : pas de speech/braille/enrichissement SRE dans les
      // planches chargées en maths.
      options: {
        enableEnrichment: false,
        enableSpeech: false,
        enableBraille: false,
        enableExplorer: false,
        enableComplexity: false,
        menuOptions: {
          settings: {
            enrich: false,
            speech: false,
            braille: false,
            assistiveMml: false,
          },
        },
      },
    };
  `;

/**
 * Assemble le document HTML d'impression — PUR (testable sans DOM) : une
 * rangée de `req.columns` planches par page (2 par défaut). Chaque planche =
 * `renderReportLayout` (le gabarit `.rp` des emails — moteur de layout de
 * layout.ts) SANS son bloc `<style>` embarqué (le CSS complet —
 * `renderReportLayoutCss` + `buildPlanchesPrintCss(req)` — est injecté UNE
 * seule fois dans le `<head>` ; MathJax CDN typeset les maths brutes `\(…\)`
 * produites par la pipeline markdown).
 *
 * Retouches round 18 : les planches sont rendues SANS la métadonnée « Salle »
 * (le PDF est une feuille d'examen, pas un courrier — l'email la conserve).
 * La signature « Bien cordialement » est supprimée du moteur de layout
 * (décision utilisateur) — elle ne figure plus dans AUCUN rendu.
 *
 * `mathjaxConfig` : la config `window.MathJax = {...}` (défaut : constante
 * locale) — le module render transmet celle de pdf-export.ts (packs maths).
 *
 * `preamble` : préambule mathématique utilisateur (macros LaTeX) — injecté
 * comme math display HIDDEN en tête de document (pattern pdf-export.ts) :
 * MathJax le typeset pendant le démarrage et enregistre les macros avant le
 * reste du document.
 *
 * `printCss` : CSS typographique de la section « Printing » des réglages
 * (`lib/prose-style-css.ts` → `buildReportPrintCss`) — injecté APRÈS
 * `renderReportLayoutCss` + la mise en page planches (à spécificité égale, le
 * dernier bloc gagne). Le module reste PUR : le CSS arrive en paramètre chaîne.
 *
 * `layout` : le gabarit configurable du rapport (réglages → Impression →
 * Gabarit du rapport) — défaut : DEFAULT_REPORT_LAYOUT.
 *
 * `req` : mise en page complète (mode « planches » du PrintOverlay) — papier,
 * orientation, marges, nombre de colonnes, écart, entête/pied, échelle…
 * Défaut : DEFAULT_PLANCHES_PRINT_REQUEST (A4 paysage, 2 colonnes, gap 4 mm —
 * la configuration actuelle).
 */
export function assemblePrintHtml(
  datas: ColleReportData[],
  includeEval: boolean,
  mathjaxConfig: string = DEFAULT_MATHJAX_CONFIG,
  preamble = "",
  printCss = "",
  layout: ReportLayout = DEFAULT_REPORT_LAYOUT,
  req: PrintRequest = DEFAULT_PLANCHES_PRINT_REQUEST,
): string {
  const L = normalizeReportLayout(layout);
  const pageCss = buildPlanchesPrintCss(req);
  const content = chunkPairs(datas, req.columns)
    .map(
      (pair) =>
        `<div class="pl-pair">` +
        pair
          .map((d) =>
            renderReportLayout(d, L, { includeEval, includeSalle: false }, { includeCss: false }),
          )
          .join("\n") +
        `</div>`,
    )
    .join("\n");

  const preambleBlock = preamble.trim()
    ? `<div style="position:absolute;left:-9999px" aria-hidden="true">$$${preamble.trim()}$$</div>`
    : "";

  const printCssBlock = printCss.trim() ? `\n${printCss.trim()}` : "";

  return assemblePrintDocument({
    title: "Planches de colles",
    cssBlocks: [renderReportLayoutCss(L), pageCss, printCssBlock],
    mathjaxConfig,
    mathjaxCdn: true,
    // Le préambule vit DANS le <div class="pl-doc"> (structure historique).
    body: `<div class="pl-doc">\n${preambleBlock}\n${content}\n</div>`,
    readyMarker: PRINT_READY_TITLE,
  });
}
