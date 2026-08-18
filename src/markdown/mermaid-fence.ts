/**
 * Fence ```mermaid → porteur de diagramme. MODULE PUR (même motif que
 * `highlight.ts` et `math-plugin.ts` : extrait de `render.ts` pour être
 * testable sous bun, où les modules à runes ne s'exécutent pas).
 *
 * Le rendu SVG est ASYNCHRONE — la bibliothèque se charge à la demande. On
 * émet donc ici un porteur inerte que la passe DOM (`mermaid-render.ts`)
 * composera. Tant qu'elle n'a pas tourné, le bloc affiche sa source : jamais
 * un vide.
 */

import { escapeAttr, escapeHtml } from "./highlight";

/** Mention affichée quand une source de diagramme contient `$$`. */
export const MERMAID_MATH_NOTICE =
  "Les mathématiques ne sont pas prises en charge dans les diagrammes : " +
  "les macros du préambule n'y sont pas disponibles.";

/**
 * Porteur d'un diagramme.
 *
 * `data-mermaid-source` n'est pas décoratif : c'est la CLÉ DE CACHE (le SVG
 * composé est mémorisé par source), et c'est ce qui permet à un diagramme
 * inchangé de traverser un re-rendu sans être recomposé ni clignoter.
 *
 * Les mathématiques ne sont PAS prises en charge (décision 2026-08-18) :
 * Mermaid les rendrait avec KaTeX, qui ignore le préambule MathJax du projet et
 * ne connaît pas les macros à arguments optionnels — celles-là mêmes qui ont
 * fait conserver MathJax. Un `$$` est donc signalé, jamais rendu à moitié.
 */
export function renderMermaidPlaceholder(source: string): string {
  const attr = escapeAttr(source);
  const avis = source.includes("$$")
    ? `<p class="mdv-mermaid__notice">${escapeHtml(MERMAID_MATH_NOTICE)}</p>`
    : "";
  return (
    `<figure class="mdv-mermaid" data-mermaid-source="${attr}">` +
    `<pre class="mdv-mermaid__source"><code>${escapeHtml(source)}</code></pre>` +
    avis +
    `</figure>`
  );
}
