/**
 * Noyau document d'impression — module PUR (testable sans DOM ni Tauri).
 *
 * Assemble le squelette HTML AUTO-SUFFISANT partagé par TOUTES les cibles
 * d'impression (export md→PDF, planches de colles PDF, rapport colle en image
 * email/archivage). Centralise :
 *  - la structure `<head>` (charset, titre, `<base href>`, CSS, MathJax CDN) ;
 *  - l'injection du préambule mathématique (macros LaTeX en display math
 *    caché — typées au démarrage par MathJax avant le reste du document) ;
 *  - le script de cycle de vie : pose le MARQUEUR de fin de rendu
 *    (`document.title`) que le backend headless (mdprinter.rs) poll avant la
 *    capture (PNG) ou l'impression (PDF).
 *
 * Avant ce module, les 3 cibles réécrivaient chacune ce squelette
 * (pdf-export.ts `assembleHtml`, planches.ts `assemblePrintHtml`,
 * email.ts `assembleReportImageHtml`) — le refactor les fait toutes passer
 * par ici SANS changer le rendu.
 */

/** Marqueur de fin de rendu des documents IMPRIMÉS (md→PDF, planches PDF). */
export const PRINT_READY_TITLE = "azprose-print-ready";

/** Marqueur de fin de rendu des rapports en IMAGE (email, archivage). */
export const REPORT_READY_TITLE = "azprose-report-ready";

/** Pièces du squelette document — chaque cible remplit ce qui la concerne. */
export interface PrintDocumentParts {
  /** Titre `<title>` (absent → aucun). */
  title?: string;
  /** Langue du document (défaut "fr"). */
  lang?: string;
  /** `<base href>` — documents md (résolution des ressources relatives). */
  baseHref?: string;
  /** Blocs CSS du `<style>` (dans l'ordre — vides/undefined ignorés). */
  cssBlocks: (string | undefined)[];
  /** Script `window.MathJax = {...}` (injecté si non vide). */
  mathjaxConfig?: string;
  /** Charger le CDN MathJax (les documents md/planches le chargent TOUJOURS ;
   *  le rapport image seulement si une config est fournie). */
  mathjaxCdn?: boolean;
  /** Attributs du `<body>` (rapport image : fond fixe). */
  bodyAttrs?: string;
  /** Préambule mathématique (macros LaTeX) — injecté caché, jamais visible. */
  preamble?: string;
  /** Corps du document (déjà rendu — gabarit, layout ou contenu brut). */
  body: string;
  /** Marqueur de fin de rendu posé par le script de cycle de vie. */
  readyMarker: string;
}

/** Script de cycle de vie : signale au backend headless que le typeset
 *  MathJax est terminé (document.title = marqueur, pollé par mdprinter.rs). */
export function buildLifecycleScript(marker: string): string {
  return `<script>
(function() {
    function markReady() { document.title = "${marker}"; }
    if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
        window.MathJax.startup.promise.then(function() {
            setTimeout(markReady, 600);
        }).catch(function() { markReady(); });
    } else {
        window.addEventListener('load', function() {
            setTimeout(markReady, 2000);
        });
    }
})();
<\/script>`;
}

/** Assemble le document HTML autonome à partir de ses pièces. */
export function assemblePrintDocument(parts: PrintDocumentParts): string {
  const base = parts.baseHref ? `<base href="${parts.baseHref}">\n` : "";
  const title = parts.title ? `<title>${parts.title}</title>\n` : "";
  const cssBlocks = parts.cssBlocks.filter((b): b is string => typeof b === "string" && b.trim().length > 0);
  const style = `<style>\n${cssBlocks.join("\n")}\n</style>`;
  const hasConfig = Boolean(parts.mathjaxConfig?.trim());
  const mathjaxConfig = hasConfig
    ? `<script>\n${parts.mathjaxConfig}\n</script>\n`
    : "";
  const cdn = parts.mathjaxCdn || hasConfig
    ? `<script src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js" async><\/script>\n`
    : "";
  const preamble = parts.preamble?.trim()
    ? `<div style="position:absolute;left:-9999px" aria-hidden="true">$$${parts.preamble.trim()}$$</div>\n`
    : "";
  return `<!DOCTYPE html>
<html lang="${parts.lang ?? "fr"}">
<head>
<meta charset="utf-8">
${base}${title}${style}
${mathjaxConfig}${cdn}</head>
<body${parts.bodyAttrs ? ` ${parts.bodyAttrs}` : ""}>
${preamble}${parts.body}
${buildLifecycleScript(parts.readyMarker)}
</body>
</html>`;
}
