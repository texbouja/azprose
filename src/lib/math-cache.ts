// Cache de maths MathJax — extrait de MarkdownPreview.svelte pour être
// partagé avec le panneau agent (rendu live pendant le streaming).
//
// Principe : `data-math-source` (émis par math-plugin) identifie une formule
// de façon stable ; une fois composée en `<mjx-container>`, son outerHTML est
// mémorisé et réinjecté aux rendus suivants — la formule n'est JAMAIS
// recomposée et ne disparaît pas visuellement entre deux rendus.
//
// Une Map PAR consommateur (factory) : le chat et la preview ne partagent pas
// leurs formules. L'invalidation au changement de préambule reste à la charge
// du consommateur (`clear()`), comme dans la preview.

export interface MathCache {
  /** Mémorise les formules COMPOSÉES présentes dans le DOM courant. À appeler
   *  AVANT que le DOM ne soit remplacé. */
  extractFrom(el: HTMLElement): void;
  /** Remplace dans `dom` (hors document, avant injection) les spans de
   *  formules connues par leur SVG composé. */
  injectInto(dom: HTMLElement): void;
  clear(): void;
}

export function createMathCache(): MathCache {
  const cache = new Map<string, string>();
  return {
    extractFrom(el) {
      for (const node of el.querySelectorAll<HTMLElement>("[data-math-source]")) {
        const source = node.getAttribute("data-math-source");
        if (source && node.innerHTML.includes("mjx-container")) {
          cache.set(source, node.outerHTML);
        }
      }
    },
    injectInto(dom) {
      for (const node of dom.querySelectorAll<HTMLElement>("[data-math-source]")) {
        const source = node.getAttribute("data-math-source");
        if (!source) continue;
        const cached = cache.get(source);
        if (cached) node.outerHTML = cached;
      }
    },
    clear() {
      cache.clear();
    },
  };
}
