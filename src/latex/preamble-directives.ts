/**
 * Deux réglages d'azkit pilotés depuis la barre d'actions : la PALETTE de
 * couleurs (`\azcolors`) et le MÉDIA de sortie (`\azgeometry`).
 *
 * Les deux se comportent pareil, d'où un seul moteur : on cherche la directive
 * dans le PRÉAMBULE, on remplace sa valeur si elle y est, on l'insère juste
 * après `\documentclass` sinon. Un fichier qui n'a jamais choisi de palette en
 * reçoit donc une, plutôt que de voir le sélecteur ne rien faire.
 *
 * ## Ce qui est délibérément limité
 *
 * L'analyse est TEXTUELLE, pas un parseur TeX. Elle suffit parce que les deux
 * directives ont une forme fixe — un mot entre accolades, éventuellement
 * précédé d'un argument optionnel — et parce qu'elles vivent au premier niveau
 * du préambule. Trois garde-fous tiennent l'essentiel :
 *
 *   · rien n'est cherché après `\begin{document}` ;
 *   · une ligne dont la directive est COMMENTÉE est ignorée ;
 *   · l'argument optionnel de `\azcolors[...]` est PRÉSERVÉ — c'est lui qui
 *     porte `dark`, et le perdre en changeant de palette ferait basculer le
 *     document en mode clair sans que personne ne l'ait demandé.
 *
 * Le cas non traité est le `\%` échappé avant la directive sur la même ligne.
 * Il n'apparaît pas dans un préambule réel et le traiter demanderait un vrai
 * découpage lexical.
 */

/** Les palettes livrées dans `texmf/tex/latex/azkit/az-<nom>-colors.def`. */
export const AZ_PALETTES = [
  "default",
  "nord",
  "gruv",
  "forest",
  "fleet",
  "catppuccin",
] as const;

/**
 * Les médias de sortie proposés. `azlayout` en déclare davantage ; ceux-ci
 * sont ceux qui ont un sens pour un document du kit — trois papiers, trois
 * écrans, un livre.
 */
export const AZ_MEDIA = [
  "print",
  "2print",
  "lsprint",
  "tablet",
  "lstablet",
  "phone",
  "book",
] as const;

export type AzPalette = (typeof AZ_PALETTES)[number];
export type AzMedia = (typeof AZ_MEDIA)[number];

/** Les deux directives pilotables, et leur commande LaTeX. */
export const DIRECTIVES = {
  colors: "azcolors",
  geometry: "azgeometry",
} as const;

export type DirectiveKind = keyof typeof DIRECTIVES;

/**
 * Fin du préambule. Tout ce qui suit `\begin{document}` est hors sujet : une
 * occurrence de `\azcolors` dans le corps serait du texte cité, pas un réglage.
 */
function preambleEnd(source: string): number {
  const m = /\\begin\s*\{document\}/.exec(source);
  return m ? m.index : source.length;
}

/** La directive est-elle commentée sur sa ligne ? */
function isCommented(source: string, at: number): boolean {
  const lineStart = source.lastIndexOf("\n", at - 1) + 1;
  return source.slice(lineStart, at).includes("%");
}

/**
 * Première occurrence ACTIVE de la directive dans le préambule.
 * Rend les bornes du groupe de valeur, pour un remplacement chirurgical.
 */
function findDirective(
  source: string,
  name: string,
): { start: number; end: number; value: string } | null {
  const limit = preambleEnd(source);
  // L'argument optionnel est capturé sans être touché : il porte `dark`.
  const re = new RegExp(`\\\\${name}\\s*(\\[[^\\]]*\\])?\\s*\\{([^{}]*)\\}`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m.index >= limit) break;
    if (isCommented(source, m.index)) continue;
    // Bornes du GROUPE de valeur seulement — l'argument optionnel survit.
    const valueStart = m.index + m[0].length - m[2].length - 1;
    return { start: valueStart, end: valueStart + m[2].length, value: m[2] };
  }
  return null;
}

/** La valeur en place, ou `null` si la directive est absente du préambule. */
export function readDirective(source: string, kind: DirectiveKind): string | null {
  return findDirective(source, DIRECTIVES[kind])?.value.trim() ?? null;
}

/**
 * Les classes du kit qui comprennent `\azcolors` et `\azgeometry`. Hors de
 * cette liste, les deux sélecteurs n'ont aucun sens : les poser produirait un
 * document qui ne compile plus.
 *
 * `azdev` et `aznote` ne sont pas encore migrées ; elles figurent ici pour que
 * leur arrivée ne demande rien d'autre que d'écrire la classe.
 */
export const CLASSES_AZKIT = ["azdoc", "azdev", "aznote"] as const;

/**
 * Séparateur TeX entre les morceaux d'une instruction : espaces, sauts de
 * ligne, **et commentaires de fin de ligne**.
 *
 * C'est le second point qui compte. `\documentclass` s'étale volontiers sur
 * plusieurs lignes, et la façon TeX de couper une ligne est justement le `%`
 * final — qui avale le saut de ligne. Un simple `\s*` raterait
 * `\documentclass%\n[a4paper]{azdoc}`, pourtant parfaitement légal.
 */
const SEP = "(?:\\s|%[^\\n]*\\r?\\n)*";

/**
 * Nom de la classe déclarée par le premier `\documentclass` ACTIF du
 * préambule, ou `null` s'il n'y en a pas (fragment inclus, fichier non TeX).
 *
 * L'analyse reste textuelle, comme le reste du module. Elle tolère :
 * l'instruction répartie sur plusieurs lignes, les commentaires de
 * continuation, les espaces autour du nom, et un `\documentclass` commenté —
 * qui est ignoré, comme il se doit.
 */
export function readDocumentClass(source: string): string | null {
  const limit = preambleEnd(source);
  const re = new RegExp(`\\\\documentclass${SEP}(\\[[^\\]]*\\])?${SEP}\\{([^{}]*)\\}`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m.index >= limit) break;
    if (isCommented(source, m.index)) continue;
    const nom = m[2].trim();
    return nom === "" ? null : nom;
  }
  return null;
}

/**
 * Le document accepte-t-il les réglages de palette et de média ?
 *
 * Sert à GRISER les deux sélecteurs de la barre d'actions : proposer une
 * palette à un `article` ou à un fragment inclus n'aurait aucun sens, et la
 * poser casserait la compilation.
 */
export function supportsAzDirectives(source: string): boolean {
  const nom = readDocumentClass(source);
  return nom !== null && (CLASSES_AZKIT as readonly string[]).includes(nom);
}

/**
 * Point d'insertion quand la directive manque : la fin de la ligne portant
 * `\documentclass`. C'est là que les réglages du kit se lisent, et cela
 * garantit qu'ils précèdent tout `\usepackage` que l'utilisateur aurait posé.
 * Sans `\documentclass` — un fragment inclus — on insère en tête.
 */
function insertionPoint(source: string): number {
  const m = /\\documentclass\s*(\[[^\]]*\])?\s*\{[^{}]*\}/.exec(source);
  if (!m) return 0;
  const after = m.index + m[0].length;
  const nl = source.indexOf("\n", after);
  return nl === -1 ? source.length : nl + 1;
}

/**
 * Pose `value` sur la directive. Rend la source INCHANGÉE si la valeur y est
 * déjà — l'appelant s'en sert pour ne pas salir un fichier propre.
 */
export function setDirective(
  source: string,
  kind: DirectiveKind,
  value: string,
): string {
  const name = DIRECTIVES[kind];
  const found = findDirective(source, name);
  if (found) {
    if (found.value.trim() === value) return source;
    return source.slice(0, found.start) + value + source.slice(found.end);
  }
  const at = insertionPoint(source);
  const line = `\\${name}{${value}}\n`;
  // Un fichier sans saut de ligne final ne doit pas voir la directive collée
  // à sa dernière ligne.
  const needsNl = at > 0 && at === source.length && !source.endsWith("\n");
  return source.slice(0, at) + (needsNl ? "\n" : "") + line + source.slice(at);
}
