/**
 * Cache des diagrammes Mermaid — jumeau de `math-cache.ts`.
 *
 * `data-mermaid-source` identifie un diagramme de façon stable ; une fois
 * composé, son contenu est mémorisé et réinjecté au rendu suivant. Un
 * diagramme inchangé n'est donc JAMAIS recomposé et ne clignote pas — l'aperçu
 * réécrit `innerHTML` à chaque rendu, ce qui détruirait sinon tous les SVG.
 *
 * Une Map PAR consommateur (factory) : l'aperçu, l'aide et les diapositives ne
 * partagent pas leurs diagrammes. L'invalidation au changement de thème reste à
 * la charge du consommateur (`clear()`) — un diagramme composé en clair n'a
 * rien à faire dans un document passé en sombre.
 *
 * Pourquoi un module distinct de `math-cache.ts` plutôt qu'une abstraction
 * commune : chacun connaît son marqueur de « déjà composé » (`mjx-container`
 * d'un côté, `<svg>` de l'autre) et son attribut source. Deux modules courts et
 * lisibles valent mieux qu'une abstraction à deux clients.
 */

export interface MermaidCache {
  /** Mémorise les diagrammes COMPOSÉS du DOM courant. À appeler AVANT que ce
   *  DOM ne soit remplacé. */
  extractFrom(el: ParentNode): void;
  /** Réinjecte les diagrammes connus dans un DOM neuf, avant insertion. */
  injectInto(dom: ParentNode): void;
  clear(): void;
}

export function createMermaidCache(): MermaidCache {
  const cache = new Map<string, string>();
  return {
    extractFrom(el) {
      for (const node of el.querySelectorAll<HTMLElement>("[data-mermaid-source]")) {
        const source = node.getAttribute("data-mermaid-source");
        // Seuls les diagrammes RÉUSSIS sont mémorisés : un échec doit être
        // rejoué au rendu suivant, la source ayant pu être corrigée entre-temps.
        if (source && node.classList.contains("is-rendered")) {
          cache.set(source, node.innerHTML);
        }
      }
    },
    injectInto(dom) {
      for (const node of dom.querySelectorAll<HTMLElement>("[data-mermaid-source]")) {
        const source = node.getAttribute("data-mermaid-source");
        if (!source) continue;
        const connu = cache.get(source);
        if (connu === undefined) continue;
        node.innerHTML = connu;
        node.classList.add("is-rendered");
      }
    },
    clear() {
      cache.clear();
    },
  };
}
