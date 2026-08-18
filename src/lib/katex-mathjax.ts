/**
 * Faux paquet `katex` — même surface d'API, moteur MathJax.
 *
 * Mermaid compose les mathématiques de ses libellés en important le paquet
 * `katex` et en appelant `katex.renderToString(tex, options)`, PUIS il mesure
 * le résultat pour dimensionner la boîte du libellé (`calculateMathMLDimensions`
 * dans son code). C'est ce point d'ancrage que ce module détourne : un alias de
 * build (`vite.config.ts`) fait pointer `katex` ici, et Mermaid compose donc
 * avec MathJax — donc avec le préambule du projet et ses macros — sans rien
 * perdre de sa maîtrise des mesures.
 *
 * Deux contraintes ont dicté la forme de ce module, l'une et l'autre mesurées
 * en sonde headless :
 *
 * 1. **`renderToString` est SYNCHRONE.** L'API synchrone de MathJax
 *    (`tex2svg`) échoue dès qu'un composant doit être chargé — elle lève
 *    « MathJax retry ». On ne l'appelle donc jamais ici : les formules sont
 *    composées À L'AVANCE, en asynchrone, et déposées dans ce cache.
 * 2. **Mermaid assainit la sortie** (DOMPurify), ce qui retire les attributs
 *    `xlink:href`. Un SVG MathJax ordinaire référence ses glyphes par
 *    `<use xlink:href="#…">` : après assainissement, les barres de fraction
 *    survivent et les lettres disparaissent. D'où la composition en
 *    `fontCache: "none"`, qui écrit les tracés en clair (cf.
 *    `composerFormule`).
 */

/**
 * Le cache vit sur `globalThis`, PAS dans une variable de module.
 *
 * En développement, Vite pré-empaquette Mermaid et embarque une COPIE de ce
 * fichier dans le paquet optimisé (mesuré : `node_modules/.vite/deps/
 * katex-mathjax-*.js`). Il existe alors deux instances du module — celle où
 * l'application dépose, celle où Mermaid lit — et toutes les formules
 * paraissent « non préparées ». Un point d'ancrage global les réunit, quelle
 * que soit la façon dont le module a été dupliqué.
 */
const CLE = Symbol.for("azprose.formules-diagrammes");
const global = globalThis as unknown as Record<symbol, Map<string, string>>;
const formules: Map<string, string> = (global[CLE] ??= new Map<string, string>());

/** Dépose une formule composée. La clé est le LaTeX, tel que Mermaid le
 *  redonnera — d'où le `trim()` des deux côtés. */
export function deposerFormule(tex: string, svg: string): void {
  formules.set(tex.trim(), svg);
}

/** Vide le cache — au changement de préambule ou de thème, les SVG déposés ne
 *  valent plus. */
export function viderFormules(): void {
  formules.clear();
}

/**
 * Surface appelée par Mermaid. La signature est celle de KaTeX ; seule la
 * source compte, les options de KaTeX n'ont pas d'équivalent ici.
 *
 * Lève si la formule n'a pas été préparée : c'est un défaut de programmation
 * de notre côté, pas une erreur de l'utilisateur, et Mermaid le remontera
 * comme une erreur de diagramme plutôt que d'afficher un libellé vide.
 */
function renderToString(tex: string): string {
  const svg = formules.get(String(tex).trim());
  if (!svg) throw new Error(`formule de diagramme non préparée : ${tex}`);
  return svg;
}

export default { renderToString };
