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
  /** Créneau unique (ex. "09:00-10:00") — remplace l'ancien tableau `creneaux`. */
  creneau?: string;
  salle?: string;
  /**
   * Note attribuée par le colleur (héritage). DEPRECATED : remplacée par le
   * dict `notes` (rubriques) — conservée en lecture seule pour les notes
   * existantes saisies avant le passage aux rubriques.
   */
  note?: number | string | null;
  /**
   * Notes par rubrique (write-back depuis le preview) : clés `rub1…rubN`
   * définies par la config des rubriques de la matière (colles-settings).
   * La note GLOBALE est la somme des rubriques, TOUJOURS calculée au rendu
   * (jamais stockée). `null` = suppression de la clé au write-back.
   */
  notes?: Record<string, number | string> | null;
  /** Observations du colleur (write-back depuis le preview). */
  observations?: string | null;
  /**
   * Email de l'élève (colonne « Email » de la feuille Élèves du colloscope,
   * vide si absente). Jamais affiché dans CollePreview — sert de destination
   * pour l'envoi des rapports par email (bouton Send).
   */
  email_eleve?: string;
  /**
   * Programme de la semaine de colle. Vide à la génération ; renseigné après
   * par le colleur (champ dédié de la première carte, write-back `programme`).
   * Mis en valeur dans la première carte de CollePreview et inclus dans les
   * rapports envoyés par email. `null` = suppression de la clé au write-back.
   */
  programme?: string | null;
  /** Clés YAML libres supplémentaires (extensibilité). */
  [key: string]: unknown;
}

/** Une rubrique d'évaluation (config par matière, voir colles-settings). */
export interface ColleRubrique {
  /** Clé YAML dans le dict `notes` (rub1, rub2, …). */
  id: string;
  /** Libellé affiché (ex. « Maîtrise du cours »). */
  label: string;
  /** Score maximal attribuable à cette rubrique. */
  maxScore: number;
}

/** Config des rubriques par matière (clé matière → liste de rubriques). */
export type RubriquesParMatiere = Record<string, ColleRubrique[]>;

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
