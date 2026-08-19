/**
 * Espace vertical autour des formules HORS TEXTE (`display`) — partie PURE.
 *
 * Ce que l'utilisateur règle ici, c'est le blanc qui sépare une formule du
 * texte qui l'entoure. Trois valeurs, pas un curseur : la demande était de
 * choisir une densité, pas d'ajuster au pixel.
 *
 * ⚠️ **La marge de MathJax doit être neutralisée en même temps.** Le porteur
 * `<p class="math-block">` n'a ni bordure ni remplissage : la marge de
 * `mjx-container` (0,7 em, mesurée) FUSIONNE avec la sienne, et c'est la plus
 * grande des deux qui gagne. Sans neutralisation, tout réglage sous 0,7 em
 * serait donc sans effet — le CSS produit ici les remet à zéro, de sorte qu'un
 * seul nombre gouverne l'espace.
 */

export type MathSpacing = "small" | "medium" | "large";

/** Valeur en cours avant que ce réglage existe (1,2 em, mesuré) : c'est elle
 *  qui reste le défaut, pour que rien ne bouge sans demande. */
export const MATH_SPACING_DEFAUT: MathSpacing = "large";

export const MATH_SPACINGS: MathSpacing[] = ["small", "medium", "large"];

/** Espace en `em`, de part et d'autre de la formule. */
const EM: Record<MathSpacing, number> = {
  small: 0.3,
  medium: 0.7,
  large: 1.2,
};

/** Normalise une valeur venue du disque ou de `localStorage`. */
export function espacementValide(v: unknown): MathSpacing {
  return v === "small" || v === "medium" || v === "large" ? v : MATH_SPACING_DEFAUT;
}

/** Espace en `em` — l'unité suit le corps du document, donc l'espace reste
 *  proportionné quand l'utilisateur change la taille du texte. */
export function espacementEm(v: MathSpacing): number {
  return EM[espacementValide(v)];
}

/**
 * Règles CSS pour un document qui ne reçoit PAS la variable d'écran :
 * l'impression et l'export, qui se construisent à partir des réglages et ne
 * reprennent pas `preview.css`.
 */
export function cssEspacementMaths(v: MathSpacing, scope = ".mdv-prose"): string {
  const em = espacementEm(v);
  return (
    `${scope} .math-block{margin:${em}em 0;}` +
    `${scope} .math-block mjx-container[display="true"]{margin:0;}` +
    // Même fusion côté voisin : le blanc AU-DESSUS d'une formule est la marge
    // basse du paragraphe précédent (1em), plus grande que le réglage — sans
    // cette ligne, le réglage n'agirait que sous la formule.
    `${scope} p:has(+ .math-block){margin-bottom:0;}`
  );
}
