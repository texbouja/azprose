/**
 * Titre de fenêtre — SEULE chose qu'AZprose communique désormais à l'OS
 * (les décorations de l'app ont été supprimées le 2026-08-14 : la barre est
 * dessinée par le WM, l'app n'y touche pas).
 *
 * **Règle COMMUNE aux deux fenêtres** (PROJET et NAV) : le titre porte le nom
 * du PROJET, jamais celui du fichier actif. Motif — une fenêtre NAV n'a aucun
 * autre moyen de dire à quel projet elle appartient (pas de breadcrumb), et
 * `setTitle()` est le seul mécanisme d'identification vraiment universel :
 * c'est la seule API de fenêtre Tauri utilisée ici, et la doc officielle ne
 * lui attache AUCUNE note « Platform-specific ». Porter le nom du projet dans
 * le titre n'ajoute donc aucune interaction nouvelle avec l'OS — seule la
 * chaîne transmise change.
 *
 * > Reliquat assumé : une fenêtre PROJET et sa fenêtre NAV du même projet
 * > portent le MÊME titre. C'est la contrepartie du comportement commun
 * > demandé — l'identification du *projet* est restaurée, celle du *rôle* de
 * > fenêtre ne l'est pas.
 */

/** Nom de l'application, préfixe invariant du titre. */
export const APP_NAME = "AZprose";

const TITLE_SEP = " — ";

/** "AZprose" seul si `projectName` est vide/absent (aucun projet ouvert),
 *  "AZprose — <projet>" sinon. */
export function windowTitle(projectName?: string | null): string {
  return projectName ? `${APP_NAME}${TITLE_SEP}${projectName}` : APP_NAME;
}
