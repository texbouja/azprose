/**
 * Extraction des formules d'une source de diagramme — partie PURE (testable
 * sous bun).
 *
 * Mermaid compose les mathématiques de ses libellés en important le paquet
 * `katex` et en appelant `katex.renderToString`, PUIS il mesure le résultat
 * pour dimensionner la boîte. Un alias de build détourne ce point d'ancrage
 * vers MathJax (`src/lib/katex-mathjax.ts`), mais son `renderToString` est
 * synchrone : les formules doivent être composées AVANT le rendu. D'où ce
 * module, qui dit lesquelles préparer.
 */

/**
 * La détection est celle de Mermaid, **à l'identique** (`katexRegex` dans son
 * module `common`). En particulier : pas de drapeau `s`, donc une formule ne
 * franchit jamais une fin de ligne. Élargir la nôtre ferait préparer des
 * formules que Mermaid ne demandera pas — et rater celles qu'il demande.
 */
const FORMULE = /\$\$(.*?)\$\$/g;

/**
 * Les formules qu'un rendu de cette source peut réclamer.
 *
 * Deux formes sont préparées pour chaque occurrence, parce que Mermaid n'appelle
 * pas KaTeX avec le même texte selon le chemin : les libellés HTML passent par
 * `inputForKatex`, qui **dédouble les antislashs** (`\\` → `\`), là où les
 * autres chemins transmettent le texte tel quel. Préparer les deux coûte une
 * composition de plus dans le seul cas où elles diffèrent, et évite un libellé
 * manquant selon le type de diagramme.
 */
export function listerFormules(source: string): string[] {
  const vues = new Set<string>();
  for (const m of source.matchAll(FORMULE)) {
    const tex = m[1].trim();
    if (!tex) continue;
    vues.add(tex);
    const reduite = tex.replace(/\\\\/g, "\\").trim();
    if (reduite) vues.add(reduite);
  }
  return [...vues];
}
