/**
 * Configuration de PRÉSENTATION — thème et polices — appliquée au document
 * courant, canaux de diffusion compris (matchMedia + `storage`, phases 1.2 et
 * 1.3). Appelé UNE fois par fenêtre, avant tout rendu. Ne connaît NI onglets
 * NI fichiers NI projet — c'est ce qui le rend utilisable par NAV, qui n'a
 * pas de session (vague 2, phase 2.1).
 *
 * Les listeners `storage` de chaque store (`persistedState`, phase 1.3) sont
 * déjà branchés dès l'IMPORT du module qui les déclare — `initPresentation()`
 * n'a donc qu'à IMPORTER `generalSettings` (l'import déclenche
 * `createGeneralSettings()`) et appeler `initTheme()` (qui, lui, branche son
 * propre listener `storage` explicitement, cf. theme.ts).
 *
 * L'échelle UI (`uiScale`/`applyZoom`) n'est PAS incluse ici : elle cible
 * `.mdv-app`, un sélecteur PROPRE à PROJET (NAV utilise `.browse`), et son
 * application initiale dépend du MONTAGE du composant (l'élément n'existe pas
 * encore à l'appel de `initPresentation()`, « avant tout rendu ») — app.svelte
 * garde son propre `$effect` post-montage. Le réglage est de toute façon
 * PLANIFIÉ POUR SUPPRESSION (phase 4.3, remplacé par un zoom matériel) :
 * migrer sa mécanique de boot maintenant serait un travail jeté.
 */
import { initTheme } from "@/lib/theme";
import {
  generalSettings,
  applyUiFont,
  applyUiMonoFont,
  applyUiSidebarFont,
  applyPreviewFont,
  applyPreviewMonoFont,
  applyFontHinting,
} from "@/stores/general-settings.svelte";

export function initPresentation(): void {
  initTheme();
  applyUiFont(generalSettings.uiFontFamily);
  applyUiMonoFont(generalSettings.uiMonoFamily);
  applyUiSidebarFont(generalSettings.uiSidebarFamily);
  applyPreviewFont(generalSettings.previewFontFamily, generalSettings.previewCustomFontName);
  applyPreviewMonoFont(generalSettings.previewMonoFamily);
  applyFontHinting(generalSettings.fontHinting);
}
