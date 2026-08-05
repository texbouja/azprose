/**
 * Impression des planches de colles (bouton « Print » du mode colle, round 18).
 *
 * Ce module est PUR (testable sans DOM ni Tauri) : il assemble le document
 * HTML d'impression. La partie DOM/IPC (rendu des fragments markdown + appel
 * du backend) vit dans `pdf-planches-render.ts` — séparée pour que les tests
 * bun n'importent jamais la chaîne Svelte (stores `$state`) ni html-to-image.
 *
 * Pattern : le PATTERN GÉNÉRAL md→PDF (src/lib/pdf-export.ts → mdprinter.rs) —
 * un document HTML auto-suffisant est confié à la commande Rust
 * `export_markdown_pdf`, qui ouvre le navigateur système (Chrome/Firefox)
 * avec le dialogue d'impression NATIF → l'utilisateur choisit « Enregistrer en
 * PDF ». PAS de jspdf/html2canvas (abandonnés au round 17 : raster + coût CPU
 * énorme — l'app se figeait) : le PDF final est VECTORIEL (le navigateur
 * imprime le HTML — texte sélectionnable, maths MathJax en SVG, reflow au
 * format de papier choisi) et le coût côté app est nul.
 *
 * Mise en page : A4 PAYSAGE à choisir dans le dialogue du navigateur (PAS de
 * règle `@page size` — Chromium masquerait la section papiers du dialogue, voir
 * PRINT_PAGE_CSS), DEUX colonnes par page, UNE planche par colonne (feuille
 * d'examen à découper). Chaque planche réutilise le GABARIT du rapport d'email
 * (`.rp` / REPORT_PAGE_CSS — le même rendu que l'archivage image), une seule
 * source de vérité.
 *
 * `includeEval` : sans évaluation (défaut du dialogue) la « troisième carte »
 * (section Évaluation — notes + observations) est omise → feuille à découper
 * et fournir aux élèves le jour de l'examen ; avec → archivage administration.
 * Les élèves reçoivent le compte rendu complet par email (volet existant).
 */
import { buildReportContent, REPORT_PAGE_CSS, type ColleReportData } from "./email";

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
 * CSS d'impression : deux colonnes par page (une planche par colonne —
 * `.pl-pair` regroupe les planches 2 à 2 et `break-inside: avoid` garde la
 * paire sur la MÊME page : 2 planches par page, côte à côte, quand elles
 * tiennent). Les réglages `.rp*` sont des SURCHARGES du gabarit email :
 * la planche remplit sa colonne (width 100 %), hauteur NATURELLE (plus de
 * min-height au ratio 16:10 — l'image d'email a besoin d'un ratio, la page
 * imprimée non), fond blanc sans marge externe (le gris `#f0f2f5` et le
 * padding servaient à la capture).
 *
 * `!important` obligatoire : le bloc `<style>` embarqué du gabarit `.rp` serait
 * rendu DANS LE CORPS, APRÈS ce bloc `<head>` — à spécificité égale c'est le
 * dernier qui gagne, le gabarit écraserait la mise en page d'impression.
 *
 * PAS de `@page { size: ... }` : quand Chromium RECONNAÎT une taille @page
 * (A4 l'est), il verrouille le format/l'orientation ET masque la section
 * papiers du dialogue d'impression (« More options » disparaît — c'est
 * exactement la différence constatée avec le flux md→PDF, qui n'a aucune
 * règle @page). On garde seulement `margin: 10mm` (la marge n'influence pas
 * la reconnaissance) : l'utilisateur choisit A4 + paysage dans le dialogue,
 * comme pour une export md→PDF. Source : MDN compatibility data @page/size.
 *
 * Retouches round 18 : `gap` réduit à 4 mm entre les colonnes (avant : 8 mm —
 * le texte des deux planches était trop écarté) et `.rp-body` surchargé avec
 * un padding resserré (8px 10px au lieu de 12px 20px du gabarit email).
 */
export const PRINT_PAGE_CSS = `
@page { margin: 10mm; }
html, body { margin: 0; padding: 0; }
body { background: #fff; }
.pl-doc { padding: 0; }
.pl-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4mm;
  margin-bottom: 8mm;
  break-inside: avoid;
  page-break-inside: avoid;
}
.pl-doc .rp { width: 100% !important; min-height: 0 !important; background: #fff !important; padding: 0 !important; }
.pl-doc .rp-card { width: 100% !important; margin: 0 !important; }
.pl-doc .rp-body { padding: 8px 10px !important; }
`;

/** Regroupe les éléments par paires (deux colonnes par page d'impression). */
export function chunkPairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

/** Script de cycle de vie : imprime une fois MathJax terminé (pattern pdf-export). */
const LIFECYCLE_SCRIPT = `<script>
(function() {
    function triggerPrint() { window.print(); }
    if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
        window.MathJax.startup.promise.then(function() {
            setTimeout(triggerPrint, 600);
        }).catch(function() { triggerPrint(); });
    } else {
        window.addEventListener('load', function() {
            setTimeout(triggerPrint, 2000);
        });
    }
})();
<\/script>`;

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
 * Assemble le document HTML d'impression — PUR (testable sans DOM) : A4
 * paysage, une paire de planches par page. Chaque planche =
 * `buildReportContent` (le gabarit `.rp` des emails) SANS son bloc `<style>`
 * embarqué (le CSS complet — REPORT_PAGE_CSS + PRINT_PAGE_CSS — est injecté
 * UNE seule fois dans le `<head>` ; MathJax CDN typeset les maths brutes
 * `\(…\)` produites par la pipeline markdown).
 *
 * Retouches round 18 : les planches sont rendues SANS la métadonnée « Salle »
 * et SANS la signature (« Bien cordialement ») — le PDF est une feuille
 * d'examen, pas un courrier (l'email conserve les deux).
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
 * REPORT_PAGE_CSS + PRINT_PAGE_CSS (à spécificité égale, le dernier bloc
 * gagne). Le module reste PUR : le CSS arrive en paramètre chaîne.
 */
export function assemblePrintHtml(
  datas: ColleReportData[],
  includeEval: boolean,
  mathjaxConfig: string = DEFAULT_MATHJAX_CONFIG,
  preamble = "",
  printCss = "",
): string {
  const content = chunkPairs(datas)
    .map(
      (pair) =>
        `<div class="pl-pair">` +
        pair
          .map((d) =>
            buildReportContent(d, includeEval, false, false).replace(
              `<style>${REPORT_PAGE_CSS}</style>`,
              "",
            ),
          )
          .join("\n") +
        `</div>`,
    )
    .join("\n");

  const preambleBlock = preamble.trim()
    ? `<div style="position:absolute;left:-9999px" aria-hidden="true">$$${preamble.trim()}$$</div>`
    : "";

  const printCssBlock = printCss.trim() ? `\n${printCss.trim()}` : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Planches de colles</title>
<style>
${REPORT_PAGE_CSS}
${PRINT_PAGE_CSS}
${printCssBlock}
</style>
<script>
${mathjaxConfig}
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js" async><\/script>
</head>
<body>
<div class="pl-doc">
${preambleBlock}
${content}
</div>
${LIFECYCLE_SCRIPT}
</body>
</html>`;
}
