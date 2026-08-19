/**
 * Police mathématique de MathJax — partie PURE (testable sous bun).
 *
 * MathJax 4 livre chaque police dans son propre paquet, avec un fichier
 * combiné qui embarque le moteur ET les données de glyphes. Choisir une police
 * revient donc à charger un fichier plutôt qu'un autre : ce module dit lequel,
 * pour chacune des surfaces de l'application (écran, impression, export).
 *
 * DEUX polices seulement (décision 2026-08-19) : `newcm`, le défaut de MathJax,
 * et `fira`, la seule police mathématique réellement sans sérif du catalogue —
 * compagne de Fira Sans, déjà embarquée dans l'application. Les neuf autres
 * sont toutes des sérifs : elles n'ajouteraient que des actifs à servir et à
 * vérifier.
 *
 * ⚠️ **Les deux polices ne se chargent PAS de la même façon.** Mesuré en sonde :
 * `mathjax/tex-svg.js` embarque newcm EN ENTIER (les onze plages testées se
 * composent sans qu'aucune donnée soit servie), tandis que le fichier combiné
 * de Fira n'embarque que son socle. Six plages y sont chargées à l'exécution —
 * `double-struck` (`\mathbb`), `script` (`\mathcal` ET `\mathscr`), `fraktur`,
 * `sans-serif`, `monospace`, `calligraphic` — et leur échec est DUR : pas de
 * repli, pas de glyphe approximatif, la formule ne s'affiche pas du tout. D'où
 * les données déposées dans `public/mathjax-fonts/` et le `fontPath` ci-dessous,
 * sans lesquels un simple `\mathbb{R}` disparaîtrait.
 */

export type MathJaxFont = "newcm" | "fira";

/** Police retenue quand le réglage est absent ou illisible. C'est aussi le
 *  repli sûr : elle n'a besoin d'aucun actif servi. */
export const MATHJAX_FONT_DEFAUT: MathJaxFont = "newcm";

export interface PoliceMathJax {
  id: MathJaxFont;
  /** Libellé affiché dans les réglages (nom propre, non traduit). */
  label: string;
  /** Spécimen du paquet npm de MathJax, pour l'export et l'impression. */
  paquetCdn: string;
}

export const MATHJAX_FONTS: PoliceMathJax[] = [
  { id: "newcm", label: "New Computer Modern", paquetCdn: "mathjax@4" },
  { id: "fira", label: "Fira Math", paquetCdn: "@mathjax/mathjax-fira-font" },
];

/** Normalise une valeur venue du disque ou de `localStorage`. */
export function policeValide(v: unknown): MathJaxFont {
  return v === "fira" || v === "newcm" ? v : MATHJAX_FONT_DEFAUT;
}

/**
 * Racine des données de glyphes servies par l'application.
 *
 * `%%FONT%%` est le marqueur de MathJax : il y substitue le nom interne de la
 * police (`mathjax-fira`), d'où le suffixe `-font` qui reconstitue le nom du
 * paquet. Le réglage est POSÉ EN TOUTES CIRCONSTANCES, y compris pour newcm qui
 * n'en a pas besoin : une valeur fausse casserait tout rendu, une valeur juste
 * mais inutilisée ne coûte rien.
 */
export const MATHJAX_FONT_PATH = "/mathjax-fonts/%%FONT%%-font";

/** Nom interne de la police, tel que MathJax l'attend dans `output.font`. */
export function nomInterne(police: MathJaxFont): string {
  return police === "fira" ? "mathjax-fira" : "mathjax-newcm";
}

/**
 * Moteur servi par l'application, pour la police demandée.
 *
 * ⚠️ **MathJax n'est JAMAIS empaqueté.** Ces fichiers combinés sont des bundles
 * UMD déjà minifiés : enveloppés par Rolldown en module à fabrique, le
 * démarrage du moteur n'aboutit pas — `MathJax.startup.promise` ne se résout
 * jamais, aucune formule n'est composée, et le document affiche son LaTeX
 * brut. Mesuré en production le 2026-08-19 sur la police Fira ; le même fichier
 * chargé par balise `<script>` fonctionne, extensions et plages comprises.
 *
 * Ils sont donc déposés dans `public/mathjax/` par `bun run mathjax`, au même
 * titre que les extensions TeX et SRE — que l'application chargeait déjà ainsi.
 * Bénéfice second : MathJax retrouve sa propre base d'URL par la balise, au lieu
 * de dépendre entièrement de `loader.paths`.
 */
export function scriptLocal(police: MathJaxFont): string {
  return police === "fira"
    ? "/mathjax/tex-mml-svg-mathjax-fira.js"
    : "/mathjax/tex-svg.js";
}

/**
 * Script MathJax des documents HORS application (impression, export PDF).
 *
 * Variante `-nofont` : le moteur sans aucune police, la police étant nommée
 * dans `output.font` et téléchargée depuis le CDN. C'est ce qui permet au
 * réglage de suivre jusqu'au papier **sans propager un nom de fichier** à
 * travers les assembleurs de documents — la police n'est plus qu'une ligne de
 * configuration, et ces documents transportent déjà leur configuration.
 *
 * ⚠️ Un document qui charge ce script SANS déclarer `output.font` n'a aucune
 * police. C'est pourquoi l'assembleur ne le choisit que s'il voit une police
 * nommée dans la configuration, et retombe sinon sur `SCRIPT_CDN_EMBARQUE`.
 *
 * Vérifié en sonde : les deux polices se composent ainsi depuis le CDN, plages
 * dynamiques comprises (`\mathbb`, `\mathcal`, `\mathfrak`).
 */
export const SCRIPT_CDN_SANS_POLICE =
  "https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg-nofont.js";

/** Moteur AVEC New Computer Modern embarquée — repli pour un document dont la
 *  configuration ne nomme aucune police (documents autonomes, appelants tiers).
 *  Rien à télécharger de plus, rien à régler : il compose toujours. */
export const SCRIPT_CDN_EMBARQUE = "https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js";

/** La configuration nomme-t-elle une police (`output: { font: … }`) ?
 *  C'est ce qui décide du script à charger — voir `SCRIPT_CDN_SANS_POLICE`. */
export function configNommePolice(config: string | undefined): boolean {
  return /output\s*:\s*\{[^}]*\bfont\s*:/.test(config ?? "");
}
