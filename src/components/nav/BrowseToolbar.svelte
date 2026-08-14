<script lang="ts">
/**
 * Toolbar PERMANENTE de la fenêtre NAV (chantier chrome façon navigateur,
 * phase B3 — remplace le mode « au survol » de la phase 4). Rangée dédiée,
 * sous la titlebar à onglets (NavTitleBar.svelte) : replier/afficher la
 * sidebar TOUT À GAUCHE, home/précédent/suivant, champ de recherche AU
 * MILIEU (passé en `children` par browse-app.svelte — sa logique de
 * suggestions/navigation reste sa propriété, ce composant ne fait que le
 * positionner), ouvrir dans l'éditeur/Présentation/plein écran à droite.
 *
 * Deux `<Toolbar>` SVAR distinctes (gauche/droite) plutôt qu'une seule avec
 * un item `{ spacer: true }` : le `<Toolbar>` SVAR ne rend pas d'`<input>`
 * en son sein — le champ de recherche est un VRAI élément DOM, posé À CÔTÉ,
 * dans le même conteneur flex (le spacer synthétique de la barre au survol
 * n'a donc plus lieu d'être).
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
   *  navigation) ; ce composant ne fait que le positionner AU MILIEU. */
  children?: Snippet;
} = $props();

let t = $derived(getT($language));

/** Groupe de GAUCHE : replier/afficher la sidebar (toujours en tête, cf.
 *  décision utilisateur — « toggle sidebar tout à gauche ») puis navigation. */
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
]);

/** Groupe de DROITE : actions sur le document affiché. */
let rightItems = $derived.by(() => {
  const list: any[] = [
    { comp: "icon", icon: "wxi-external", text: t("preview.openInEditor"), pinned: true,
      disabled: !canOpenInEditor, handler: () => onOpenInEditor?.() },
  ];
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
  <Toolbar items={leftItems} css="nt-toolbar" />
  <div class="nt-search">
    {@render children?.()}
  </div>
  <Toolbar items={rightItems} css="nt-toolbar" />
</div>

<style>
.nt-wrap {
  flex: none;
  display: flex;
  align-items: center;
  height: 34px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  overflow-y: hidden;
}
.nt-search {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.nt-wrap :global(.wx-toolbar) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  height: 100%;
  min-height: 0;
  flex-wrap: nowrap;
  flex: none;
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
