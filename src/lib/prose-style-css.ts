/**
 * Builders CSS des rendus d'impression — module PUR (testable sans DOM ni
 * chaîne Svelte). Consommé par :
 *  - `lib/pdf-export.ts` (md→PDF : scope `.mdv-prose`) ;
 *  - `colles/email-render.ts` (email PNG + archivage PNG : scope du gabarit
 *    `.rp`) ;
 *  - `colles/pdf-planches-render.ts` (impression des planches : scope `.rp`).
 *
 * La SOURCE des réglages est le store `printSettings` (section « Printing »
 * des réglages) — une copie indépendante de la section Preview qui ne
 * s'applique qu'aux rendus d'impression, jamais à l'aperçu à l'écran.
 * Le type `ProseStyleSettings` est la forme structurelle partagée (les types
 * union étroits du store sont assignables).
 */
import { resolveFontFamily, resolveMonoFont } from "./font-resolvers";

/** Forme structurelle d'un style prose/print (champs typographiques). */
export interface ProseStyleSettings {
  fontFamily: string;
  customFontName: string;
  monoFont: string;
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  customCss?: string;
  h1Size: number;
  h1Align: string;
  h1MarginTop: number;
  h1MarginBottom: number;
  h2Size: number;
  h2Align: string;
  h2MarginTop: number;
  h2MarginBottom: number;
  h3Size: number;
  h3Align: string;
  h3MarginTop: number;
  h3MarginBottom: number;
  olLevel1: string;
  olLevel2: string;
  olLevel3: string;
}

/**
 * CSS typographique scoped — mêmes règles que le rendu preview (police
 * principale + mono, taille de police, interligne, `max-width` optionnel,
 * titres H1-H3 avec taille/alignement/marges, listes ordonnées imbriquées).
 *
 * `scope` : sélecteur(s) racine cible (`.mdv-prose` pour md→PDF, les blocs de
 * contenu du gabarit rapport pour emails/planches). Une LISTE (`a, b`) est
 * supportée : les sélecteurs descendants sont expansés pour CHAQUE élément de
 * la liste (voir `descendant`).
 *
 * `includeMaxWidth` : le `max-width` n'a de sens que pour une colonne fluide
 * (md→PDF) ; le gabarit `.rp` a une largeur FIXE (colonnes de la page/planche)
 * — l'imposer ferait rétrécir les boîtes d'énoncé.
 */
export function buildProseStyleCss(
  s: ProseStyleSettings,
  scope = ".mdv-prose",
  includeMaxWidth = true,
): string {
  const fontFamily = resolveFontFamily(s.fontFamily, s.customFontName);
  const monoFont = resolveMonoFont(s.monoFont);
  const heading = (n: 1 | 2 | 3) => {
    const size = s[`h${n}Size`] as number;
    const align = s[`h${n}Align`] as string;
    const mt = s[`h${n}MarginTop`] as number;
    const mb = s[`h${n}MarginBottom`] as number;
    return `${descendant(scope, `h${n}`)}{font-size:${size}em;text-align:${align};margin:${mt}em 0 ${mb}em;}`;
  };
  const base = `${scope}{font-family:${fontFamily};font-size:${s.fontSize}px;line-height:${s.lineHeight};${
    includeMaxWidth ? `max-width:${s.maxWidth}px;` : ""
  }}`;
  return [
    base,
    `${descendant(scope, "code")},${descendant(scope, "pre")}{font-family:${monoFont};}`,
    heading(1), heading(2), heading(3),
    `${descendant(scope, "ol")}{list-style-type:${s.olLevel1};}`,
    `${descendant(scope, "ol ol")}{list-style-type:${s.olLevel2};}`,
    `${descendant(scope, "ol ol ol")}{list-style-type:${s.olLevel3};}`,
  ].join("\n");
}

/**
 * Applique un sélecteur descendant à CHAQUE sélecteur d'un scope en LISTE.
 *
 * Le scope du gabarit rapport est `.rp-enonce-box, .rp-obs-content`. Sans
 * expansion, l'interpolation `${scope} code` produit la liste
 * `.rp-enonce-box, .rp-obs-content code` dont le PREMIER sélecteur (`.rp-enonce-box`
 * NU) matche TOUTE la boîte — c'était le bug des rendus impression : la police
 * mono (`code/pre`) et la taille `h1` (2em) s'appliquaient au corps ENTIER,
 * écrasant les réglages `font-family`/`font-size` de la règle de base.
 */
function descendant(scope: string, sel: string): string {
  return scope
    .split(",")
    .map((s) => `${s.trim()} ${sel}`)
    .join(",");
}

/**
 * CSS des rendus du GABARIT RAPPORT `.rp` (email PNG, archivage PNG,
 * impression des planches) : applique les réglages d'impression aux blocs de
 * contenu markdown (énoncé + observations), PAS au chrome du gabarit
 * (en-tête, métadonnées, signature — design fixe). Sans `max-width` : les
 * colonnes ont une largeur fixe. Le `customCss` utilisateur est ajouté tel
 * quel (c'est son outil de réglage fin des espaces verticaux).
 */
export function buildReportPrintCss(s: ProseStyleSettings): string {
  const css = buildProseStyleCss(s, ".rp-enonce-box, .rp-obs-content", false);
  return s.customCss?.trim() ? css + "\n" + s.customCss.trim() : css;
}
