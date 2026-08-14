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
 * L'échelle UI (`uiScale`/`applyZoom`) a été SUPPRIMÉE (vague 4, phase 4.3) —
 * ce paragraphe n'a plus d'objet, remplacé par le futur zoom matériel
 * (multiples de pixels), qui aura sa propre mécanique de boot le jour où il
 * existera.
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
