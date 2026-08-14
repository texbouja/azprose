<script lang="ts">
/**
 * Toolbar PERMANENTE de la fenêtre NAV (chantier chrome façon navigateur,
 * phase B3 — remplace le mode « au survol » de la phase 4).
 *
 * Disposition (réorganisation 2026-08-14, sur constat post-implémentation —
 * « rien au centre ») : TOUS les boutons de navigation à GAUCHE (sidebar,
 * home, précédent, suivant, ouvrir dans l'éditeur) ; à DROITE, dans cet
 * ORDRE PRÉCIS : recherche, Présentation, plein écran. Rien au milieu — un
 * spacer flex:1 entre les deux groupes pousse la droite contre le bord.
 *
 * Deux `<Toolbar>` SVAR (gauche/droite) plutôt qu'une seule avec un item
 * `{ spacer: true }` : le `<Toolbar>` SVAR ne rend pas d'`<input>` en son
 * sein — le champ de recherche est un VRAI élément DOM, posé À CÔTÉ.
 */
import { Toolbar } from "@svar-ui/svelte-toolbar";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import type { Snippet } from "svelte";
// Thème SVAR : PLUS importé ici (vague 4, correction de la phase 2.4) — il est
// redevenu global (src/styles/core.css, chargé par nav-main.ts comme par
// main.ts). Voir TabActions.svelte pour le détail de l'erreur corrigée.

let {
  sidebarVisible = true,
  onToggleSidebar,
  canGoHome = false,
  onHome,
  canGoBack = false,
  onBack,
  canGoForward = false,
  onForward,
  canOpenInEditor = false,
  onOpenInEditor,
  presentationAvailable = false,
  presentationActive = false,
  onTogglePresentation,
  fullscreenActive = false,
  onToggleFullscreen,
  children,
}: {
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
  canGoHome?: boolean;
  onHome?: () => void;
  canGoBack?: boolean;
  onBack?: () => void;
  canGoForward?: boolean;
  onForward?: () => void;
  canOpenInEditor?: boolean;
  onOpenInEditor?: () => void;
  presentationAvailable?: boolean;
  presentationActive?: boolean;
  onTogglePresentation?: () => void;
  fullscreenActive?: boolean;
  onToggleFullscreen?: () => void;
  /** Champ de recherche (barre d'adresse) — markup ET état/logique restent
   *  la propriété de browse-app.svelte (index du vault, suggestions,
   *  navigation) ; ce composant ne fait que le positionner. */
  children?: Snippet;
} = $props();

let t = $derived(getT($language));

/** GAUCHE : sidebar + toute la navigation, y compris « ouvrir dans
 *  l'éditeur » (déplacé depuis le groupe de droite le 2026-08-14 — seuls
 *  recherche/Présentation/plein écran restent à droite). */
let leftItems = $derived.by(() => [
  { comp: "icon", icon: sidebarVisible ? "wxi-panel-left-close" : "wxi-panel-left-open",
    text: t("browse.toggleSidebar"), pinned: true,
    handler: () => onToggleSidebar?.() },
  { comp: "icon", icon: "wxi-home", text: t("browse.home"), pinned: true,
    disabled: !canGoHome, handler: () => onHome?.() },
  { comp: "icon", icon: "wxi-arrow-left", text: t("preview.back"), pinned: true,
    disabled: !canGoBack, handler: () => onBack?.() },
  { comp: "icon", icon: "wxi-arrow-right", text: t("preview.forward"), pinned: true,
    disabled: !canGoForward, handler: () => onForward?.() },
  { comp: "icon", icon: "wxi-external", text: t("preview.openInEditor"), pinned: true,
    disabled: !canOpenInEditor, handler: () => onOpenInEditor?.() },
]);

/** DROITE : Présentation puis plein écran — la recherche (children) se pose
 *  AVANT ce groupe dans le gabarit, jamais comme item de cette Toolbar. */
let rightItems = $derived.by(() => {
  const list: any[] = [];
  if (presentationAvailable) {
    list.push({
      comp: "icon", icon: "wxi-slideshow", text: "Presentation", pinned: true,
      type: presentationActive ? "pressed" : "",
      handler: () => onTogglePresentation?.(),
    });
  }
  list.push({
    comp: "icon", icon: "wxi-fullscreen", text: "Fullscreen", pinned: true,
    type: fullscreenActive ? "pressed" : "",
    handler: () => onToggleFullscreen?.(),
  });
  return list;
});
</script>

<div class="nt-wrap">
  <div class="nt-toolbar-scroll">
    <!-- `overflow="wrap"` (comme TabActions.svelte) : sans ce prop, le
         <Toolbar> SVAR se réserve une largeur bien supérieure à ses items
         réels — c'est LA cause de la barre débordant la fenêtre avec un
         scroll horizontal permanent (signalé en test, 2026-08-14). Garde
         .nt-toolbar-scroll (overflow-x:auto) en repli défensif pour une
         fenêtre extrêmement étroite — jamais nécessaire en pratique avec 5
         icônes, mais coûte rien et suit le précédent établi. -->
    <Toolbar items={leftItems} css="nt-toolbar" overflow="wrap" />
  </div>
  <div class="nt-spacer"></div>
  <div class="nt-search">
    {@render children?.()}
  </div>
  <div class="nt-toolbar-scroll">
    <Toolbar items={rightItems} css="nt-toolbar" overflow="wrap" />
  </div>
</div>

<style>
.nt-wrap {
  flex: none;
  display: flex;
  align-items: center;
  height: 34px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  /* PAS d'overflow ici (contrairement à la version précédente) : ce
     conteneur héberge aussi .nt-search, dont la liste de suggestions
     (position:absolute, déborde SOUS la barre) serait autrement ROGNÉE par
     un overflow-y:hidden posé à ce niveau — c'est très exactement ce qui
     rendait les résultats de recherche invisibles (signalé en test,
     2026-08-14) : ils étaient bien calculés/rendus, juste jamais visibles.
     L'overflow de secours pour les icônes est scopé à .nt-toolbar-scroll,
     qui n'enveloppe PAS .nt-search. */
}
.nt-toolbar-scroll {
  flex: none;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}
.nt-spacer {
  flex: 1;
  min-width: 0;
}
.nt-search {
  flex: none;
}
.nt-wrap :global(.wx-toolbar) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  height: 100%;
  min-height: 0;
  flex-wrap: nowrap;
}
.nt-wrap :global(.wx-toolbar .wx-button) {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  min-width: 28px;
  padding: 0 !important;
  border-radius: 5px;
  background: transparent;
  color: var(--fg);
  font-size: 14px;
}
.nt-wrap :global(.wx-toolbar .wx-button i) {
  position: static;
  vertical-align: middle;
  height: auto;
  line-height: 1;
  margin-right: 0;
  opacity: 1;
}
.nt-wrap :global(.wx-toolbar .wx-button i::before) {
  display: inline-block;
  position: static;
  top: auto;
  transform: none;
}
.nt-wrap :global(.wx-toolbar .wx-button:hover) {
  background: var(--surface-hover);
}
.nt-wrap :global(.wx-toolbar .wx-button.wx-pressed) {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.nt-wrap :global(.wx-toolbar .wx-button[disabled]) {
  opacity: 0.35;
  cursor: default;
  color: var(--fg-muted);
}
.nt-wrap :global(.wx-toolbar .wx-button[disabled]:hover) {
  background: transparent;
}
</style>
