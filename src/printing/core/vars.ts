/**
 * Catalogue de variables d'impression — CONTRAT commun à tous les types
 * (md, colle). Chaque type déclare son catalogue (`MD_VARS`, `REPORT_VARS`…)
 * et l'UI affiche les boutons d'insertion depuis CE catalogue (pattern
 * insertVar généralisé — SettingsOverlay).
 *
 * Règle d'or (décision utilisateur, printing.md §2.2) : une SEULE syntaxe
 * dans l'UI — noms canoniques SANS préfixe technique (`{{eleve}}`, pas
 * `{{meta.eleve}}`). Les alias historiques (`meta.<champ>` / `meta:<champ>`)
 * restent résolus PAR LE MOTEUR (rétro-compat des templates enregistrés),
 * mais ne sont JAMAIS affichés dans le catalogue.
 */

/** Une variable du catalogue : nom `{{…}}`, label UI et nature. */
export interface VarDef {
  /** Nom SANS les accolades (ex. "matiere"). */
  name: string;
  /** Label français pour l'UI. */
  label: string;
  /** true = valeur HTML (blocs composés / fragments markdown) ; false = texte échappé. */
  html: boolean;
  /** Zones (slots) où la variable est pertinente — ordre = ordre d'affichage. */
  zones: string[];
}

/**
 * Variable canonique d'un champ meta (label « Champ ») — helper de
 * construction des catalogues : évite de dupliquer les zones.
 */
export function varDef(
  name: string,
  label: string,
  html: boolean,
  zones: string[],
): VarDef {
  return { name, label, html, zones };
}
