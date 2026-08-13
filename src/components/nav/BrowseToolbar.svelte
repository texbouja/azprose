<script lang="ts">
/**
 * Toolbar au survol de la fenêtre NAV (chantier fenêtre NAV, phase 4).
 * Châssis repris de `@/components/panels/TabActions.svelte` (zone de survol
 * révélant une barre SVAR au-dessus du contenu) — un composant DÉDIÉ plutôt
 * qu'une réutilisation directe : TabActions porte des concepts du panneau
 * projet (colles, brouillons, sphère épinglée) sans objet ici.
 *
 * Gauche : replier/afficher la sidebar · home (racine de l'arbre déclaré) ·
 * précédent · suivant. Droite : ouvrir dans l'éditeur (R10) · Présentation ·
 * plein écran.
 */
import { Toolbar } from "@svar-ui/svelte-toolbar";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";

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
} = $props();

let t = $derived(getT($language));

let visible = $state(false);
let toolbarEl = $state<HTMLElement | null>(null);
let hoverZoneEl = $state<HTMLElement | null>(null);

function show() { visible = true; }
function hide() { visible = false; }

function clickOutside(e: MouseEvent) {
  if (!toolbarEl && !hoverZoneEl) return;
  const target = e.target as Node;
  if (toolbarEl && !toolbarEl.contains(target) && hoverZoneEl && !hoverZoneEl.contains(target)) hide();
}

$effect(() => {
  if (!visible) return;
  const handler = (e: MouseEvent) => clickOutside(e);
  requestAnimationFrame(() => document.addEventListener("click", handler));
  return () => document.removeEventListener("click", handler);
});

let items = $derived.by(() => {
  const list: any[] = [
    { comp: "icon", icon: sidebarVisible ? "wxi-panel-left-close" : "wxi-panel-left-open",
      text: t("browse.toggleSidebar"), pinned: true,
      handler: () => onToggleSidebar?.() },
    { comp: "icon", icon: "wxi-home", text: t("browse.home"), pinned: true,
      disabled: !canGoHome, handler: () => onHome?.() },
    { comp: "icon", icon: "wxi-arrow-left", text: t("preview.back"), pinned: true,
      disabled: !canGoBack, handler: () => onBack?.() },
    { comp: "icon", icon: "wxi-arrow-right", text: t("preview.forward"), pinned: true,
      disabled: !canGoForward, handler: () => onForward?.() },
    { spacer: true },
  ];
  list.push({
    comp: "icon", icon: "wxi-external", text: t("preview.openInEditor"), pinned: true,
    disabled: !canOpenInEditor, handler: () => onOpenInEditor?.(),
  });
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="nt-hover-zone" bind:this={hoverZoneEl} onmouseenter={show}></div>

{#if visible}
  <div class="nt-wrap" bind:this={toolbarEl}>
    <Toolbar {items} css="nt-toolbar" />
  </div>
{/if}

<style>
.nt-hover-zone {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 34px;
  z-index: 19;
  pointer-events: auto;
}
.nt-wrap {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  height: 34px;
  display: flex;
  pointer-events: auto;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  overflow-y: hidden;
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
.nt-wrap :global(.wx-toolbar .wx-spacer) {
  flex: 1;
}
</style>
