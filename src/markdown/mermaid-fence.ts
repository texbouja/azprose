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

/**
 * Porteur d'un diagramme.
 *
 * `data-mermaid-source` n'est pas décoratif : c'est la CLÉ DE CACHE (le SVG
 * composé est mémorisé par source), et c'est ce qui permet à un diagramme
 * inchangé de traverser un re-rendu sans être recomposé ni clignoter.
 *
 * Les `$$…$$` traversent tels quels : c'est Mermaid qui les compose, avec
 * NOTRE moteur — l'alias `katex` → `katex-mathjax.ts` lui fait rendre du
 * MathJax, préambule du projet compris.
 */
export function renderMermaidPlaceholder(source: string): string {
  const attr = escapeAttr(source);
  return (
    `<figure class="mdv-mermaid" data-mermaid-source="${attr}">` +
    `<pre class="mdv-mermaid__source"><code>${escapeHtml(source)}</code></pre>` +
    `</figure>`
  );
}
