/**
 * Types du module colles — planches de colles dans les daily notes.
 *
 * Convention (agents/colles.md) : une daily note contient une section « fiches de
 * colles » annoncée par deux lignes `---` successives ; chaque planche est un
 * codeblock ```` ```colle ```` (métadonnées YAML uniquement) suivi du corps de la
 * fiche en markdown, séparé de la planche suivante par une ligne `---`.
 */

/** Métadonnées d'une planche de colle (contenu YAML du bloc ```` ```colle ````). */
export interface ColleMeta {
  matiere?: string;
  colleur?: string;
  eleve?: string;
  date?: string;
  creneaux?: string[];
  salle?: string;
  /** Note attribuée par le colleur (write-back depuis le preview). */
  note?: number | string | null;
  /** Observations du colleur (write-back depuis le preview). */
  observations?: string | null;
  /** Clés YAML libres supplémentaires (extensibilité). */
  [key: string]: unknown;
}

/** Une planche extraite d'une daily note (vue source, pas de rendu). */
export interface CollePlanche {
  /** Index 0-based dans l'ordre d'apparition (identité du write-back). */
  index: number;
  /** Métadonnées YAML parsées. */
  meta: ColleMeta;
  /** Contenu brut du fence (entre les lignes de délimitation). */
  blockSource: string;
  /** Corps de la fiche : markdown brut entre la fermeture du fence et le `---` suivant. */
  bodySource: string;
  /** Index 0-based de la ligne d'ouverture ```` ```colle ````. */
  blockStart: number;
  /** Index 0-based de la ligne de fermeture ```` ``` ````. */
  blockEnd: number;
  /** Index 0-based de la première ligne du corps. */
  bodyStart: number;
  /** Index 0-based de la ligne `---` qui clôt la planche (== n si EOF). */
  bodyEnd: number;
}

/** Résultat du découpage d'une daily note. */
export interface CollesSection {
  /** Index de la première ligne après le double `---` (début de section), -1 si absente. */
  startLine: number;
  planches: CollePlanche[];
}
