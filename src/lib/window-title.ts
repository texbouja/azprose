/**
 * Titre de fenêtre — SOURCE UNIQUE pour l'OS (WM) et pour la barre de titre
 * custom de l'app (correction 2026-08-14) : les deux affichaient des chaînes
 * différentes (l'OS gardait "AZprose" figé depuis tauri.conf.json, la barre
 * custom affichait seulement le nom du projet) — divergence inconciliable
 * une fois qu'on veut basculer proprement entre les deux rendus. Désormais
 * les deux affichent EXACTEMENT la même chaîne.
 */

/** Nom de l'application, préfixe invariant du titre. */
export const APP_NAME = "AZprose";

const TITLE_SEP = " — ";

/** "AZprose" seul si `name` est vide/absent, "AZprose — <name>" sinon. */
export function windowTitle(name?: string | null): string {
  return name ? `${APP_NAME}${TITLE_SEP}${name}` : APP_NAME;
}
