/**
 * `user.def` — le préambule LaTeX personnel de l'utilisateur.
 *
 * MODULE PUR. Il ne fait que dire OÙ le fichier va et CE QU'IL CONTIENT ; son
 * écriture est l'affaire de l'appelant.
 *
 * ## Pourquoi un fichier plutôt qu'un préambule dans le document
 *
 * azkit interdit les définitions de macros dans le préambule d'un document :
 * un fragment doit pouvoir voyager entre documents sans emporter les commandes
 * dont il dépend. Les commandes personnelles se rassemblent donc dans un seul
 * fichier, déposé dans l'arbre texmf du projet, que `azbase.sty` charge à la
 * fin de chaque préambule.
 *
 * L'utilisateur, lui, n'écrit jamais un chemin : il saisit ses macros dans un
 * réglage, exactement comme pour le préambule MathJax de l'aperçu Markdown.
 * C'est la même intention, portée à l'autre moteur.
 */

/** Chemin, relatif à la racine du projet, où `user.def` est déposé. */
export const CHEMIN_USER_DEF = [".azprose", "texmf", "tex", "latex", "azlocal", "user.def"];

/** Le dossier qui le contient, relatif à la racine du projet. */
export const DOSSIER_USER_DEF = CHEMIN_USER_DEF.slice(0, -1);

/**
 * Contenu du fichier à déposer, ou `null` si le réglage est vide.
 *
 * `null` veut dire « retirer le fichier » et non « écrire un fichier vide » :
 * `azbase` teste l'EXISTENCE de `user.def`, et un fichier vide laissé derrière
 * ferait croire à un préambule alors que l'utilisateur l'a effacé.
 */
export function contenuUserDef(preambule: string): string | null {
  const corps = preambule.trim();
  if (corps === "") return null;
  return `${ENTETE}\n${corps}\n`;
}

/**
 * En-tête apposée au fichier. Elle existe pour le jour où l'utilisateur ouvre
 * `user.def` dans l'éditeur et se demande d'où il sort : le fichier est
 * RÉÉCRIT à chaque compilation, une modification faite là serait perdue.
 */
const ENTETE = [
  "%% user.def — commandes personnelles",
  "%%",
  "%% FICHIER GÉNÉRÉ par AZprose depuis le réglage « préambule LaTeX ».",
  "%% Toute modification faite ici sera écrasée à la prochaine compilation :",
  "%% éditer le réglage, pas ce fichier.",
  "%%",
  "%% azbase.sty le charge à la fin du préambule de chaque document — après",
  "%% azmath, donc, ce qui laisse ces définitions s'appuyer dessus.",
].join("\n");
