/**
 * Deux choses dans ce module, autour de la même notion de « version » :
 *   1. le bandeau de mise à jour (`getWhatsNewToastMessage`, historique) ;
 *   2. les NOTES DE VERSION affichées par la modale « À propos » (plus bas).
 */

export const CHANGELOG_URL = "https://azprose.app/changelog";

// VIDE volontairement : 0.5.0 est la première release déclarée, aucune
// précédence. L'entrée « 1.5 » qui vivait ici décrivait une version qui n'a
// jamais existé. Ajouter une ligne `"<majeur>.<mineur>": "…"` au prochain
// palier ; sinon le bandeau se rabat sur le libellé générique ci-dessous.
const WHATS_NEW_TOAST_BY_MINOR: Record<string, string> = {};

export function getWhatsNewToastMessage(version: string): string {
  const minor = version.split(".").slice(0, 2).join(".");
  const message = WHATS_NEW_TOAST_BY_MINOR[minor];

  if (message) {
    return `v${version}: ${message}`;
  }

  return `updated to v${version}`;
}

/**
 * Notes de version — contenu de la modale « À propos » (bouton de la barre
 * d'état, à droite de l'aide).
 *
 * Les TEXTES ne vivent pas ici mais dans les deux locales (`release.*`) :
 * ce module ne porte que la STRUCTURE (ordre des rubriques, icône, clés) et
 * les faits non traduisibles (numéro de version, date). Ajouter une version
 * = une entrée en TÊTE de `RELEASE_NOTES` + ses clés dans `en.json`/`fr.json`.
 *
 * La version affichée en tête de modale vient de `getVersion()` (Tauri, donc
 * de `tauri.conf.json`) — `version` ci-dessous sert à REPÉRER l'entrée, pas à
 * afficher un numéro qui pourrait diverger du binaire.
 */

export interface ReleaseHighlight {
  /** Classe d'icône du pack généré (cf. `scripts/build-icons.mjs`). */
  icon: string;
  /** Clé i18n du titre de la rubrique. */
  title: string;
  /** Clé i18n du corps de la rubrique. */
  body: string;
}

export interface ReleaseNote {
  version: string;
  /** ISO `YYYY-MM-DD` — formatée à l'affichage selon la locale active. */
  date: string;
  /** Clé i18n du chapeau. */
  intro: string;
  highlights: ReleaseHighlight[];
  /** Clé i18n de la mise en garde de bas de modale (`null` = pas d'encart). */
  caveat: string | null;
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "0.5.0",
    date: "2026-09-02",
    intro: "release.0_5_0.intro",
    caveat: "release.0_5_0.caveat",
    highlights: [
      {
        icon: "wxi-sparkles",
        title: "release.0_5_0.assistant.title",
        body: "release.0_5_0.assistant.body",
      },
      {
        icon: "wxi-layers-3",
        title: "release.0_5_0.projects.title",
        body: "release.0_5_0.projects.body",
      },
      {
        icon: "wxi-workflow",
        title: "release.0_5_0.azkit.title",
        body: "release.0_5_0.azkit.body",
      },
      {
        icon: "wxi-book-open-check",
        title: "release.0_5_0.colles.title",
        body: "release.0_5_0.colles.body",
      },
      {
        icon: "wxi-palette",
        title: "release.0_5_0.writing.title",
        body: "release.0_5_0.writing.body",
      },
      {
        icon: "wxi-graduation-cap",
        title: "release.0_5_0.programmes.title",
        body: "release.0_5_0.programmes.body",
      },
    ],
  },
];

/** Note affichée par défaut = la plus récente (tête de liste). */
export const CURRENT_RELEASE: ReleaseNote = RELEASE_NOTES[0];
