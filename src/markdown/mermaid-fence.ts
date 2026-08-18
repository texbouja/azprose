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
  "la formule est affichée telle qu'écrite, sans les macros du préambule.";

/** Une source contient-elle des délimiteurs mathématiques de Mermaid ? */
export function contientMaths(source: string): boolean {
  return /\$\$[\s\S]*?\$\$/.test(source);
}

/**
 * Retire les délimiteurs `$$…$$` d'une source de diagramme, en gardant leur
 * contenu tel quel.
 *
 * Mermaid appelle KaTeX **dès qu'il voit `$$`** : aucune option ne le
 * désactive. Se contenter d'afficher une mention laissait donc KaTeX composer
 * pour de bon — sans la feuille de style attendue, et surtout sans le préambule
 * MathJax du projet, si bien qu'une macro maison (`\R`, `\abs`…) échouait en
 * silence au milieu d'un rendu à moitié réussi. C'est précisément ce que la
 * décision du 2026-08-18 voulait éviter.
 *
 * En retirant les délimiteurs, la formule redevient du TEXTE : elle s'affiche
 * telle que l'auteur l'a écrite, ce qui est honnête et lisible, et le chunk
 * KaTeX (253 Ko) n'est jamais chargé. Le pont MathJax (vague 2) remplacera
 * cette neutralisation par un vrai rendu, avec le préambule.
 */
export function neutraliserMaths(source: string): string {
  return source.replace(/\$\$([\s\S]*?)\$\$/g, (_, contenu: string) => contenu);
}

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
  const avis = contientMaths(source)
    ? `<p class="mdv-mermaid__notice">${escapeHtml(MERMAID_MATH_NOTICE)}</p>`
    : "";
  return (
    `<figure class="mdv-mermaid" data-mermaid-source="${attr}">` +
    `<pre class="mdv-mermaid__source"><code>${escapeHtml(source)}</code></pre>` +
    avis +
    `</figure>`
  );
}
