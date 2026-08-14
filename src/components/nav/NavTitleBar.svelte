<script lang="ts">
  // Titlebar de la fenêtre NAV (chantier chrome façon navigateur, phase B2) —
  // héberge les onglets (passés en `children`, cf. browse-app.svelte) et rend
  // les 3 boutons de fenêtre, puisque NAV est créée SANS décorations système
  // (browse-window.ts, phase B1). PROJET n'est PAS concernée : elle reste
  // décorée par le WM, ce composant est propre à NAV.
  //
  // Tauri fournit les COMMANDES de fenêtre en natif (minimize/toggleMaximize/
  // close), mais aucun bouton dès que les décorations sont désactivées — le
  // dessin est à notre charge (doc officielle Tauri). SVG et logique repris
  // tels quels de l'ex-TitleBar.svelte (PROJET, supprimé le 2026-08-14,
  // commit 6117bfc) : `git show 6117bfc^:src/components/chrome/TitleBar.svelte`.
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import type { Snippet } from "svelte";

  // `isMaximized` REÇU en prop (2026-08-14) — plus suivi ici : browse-app.svelte
  // en est la source unique (un seul `onResized`, un seul état), car elle en a
  // aussi besoin pour `.browse` (marge/ombre supprimées en plein écran). Ce
  // composant reste dumb pour cette donnée, ne fait plus qu'émettre la
  // commande de fenêtre au clic.
  let { children, isMaximized = false }: { children: Snippet; isMaximized?: boolean } = $props();

  async function handleMinimize() {
    await getCurrentWindow().minimize();
  }
  async function handleMaximize() {
    await getCurrentWindow().toggleMaximize();
  }
  async function handleClose() {
    await getCurrentWindow().close();
  }
</script>

<!-- `data-tauri-drag-region` sur le FOND seulement (piège P1 du plan) : tout
     enfant interactif doit l'échapper par data-tauri-drag-region="false" —
     sans ça, tout clic sur un onglet deviendrait un déplacement de fenêtre. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<header
  class="nav-titlebar"
  data-tauri-drag-region
  ondblclick={handleMaximize}
>
  {@render children()}
  <div class="nav-titlebar__spacer" data-tauri-drag-region></div>
  <div class="nav-titlebar__win" data-tauri-drag-region="false">
    <button class="nav-titlebar__win-btn" onclick={handleMinimize} title="Minimize" data-tauri-drag-region="false">
      <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="1" rx="0.5" fill="currentColor"/></svg>
    </button>
    <button class="nav-titlebar__win-btn" onclick={handleMaximize} title={isMaximized ? "Restore" : "Maximize"} data-tauri-drag-region="false">
      {#if isMaximized}
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="3.5" y="3.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>
          <rect x="2" y="5" width="6" height="6" rx="1" fill="var(--bg)" stroke="currentColor" stroke-width="1"/>
        </svg>
      {:else}
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="2" y="2" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
      {/if}
    </button>
    <button class="nav-titlebar__win-btn nav-titlebar__win-btn--close" onclick={handleClose} title="Close" data-tauri-drag-region="false">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </button>
  </div>
</header>

<style>
  .nav-titlebar {
    position: relative;
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    -webkit-app-region: drag;
    user-select: none;
  }

  .nav-titlebar__spacer {
    flex: 1;
    min-width: 0;
    -webkit-app-region: drag;
  }

  .nav-titlebar__win {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    padding: 0 4px;
    -webkit-app-region: no-drag;
  }

  /* ── Boutons de fenêtre (aucune décoration système, cf. browse-window.ts) ── */
  .nav-titlebar__win-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--fg);
    border-radius: 4px;
    cursor: pointer;
    -webkit-app-region: no-drag;
    transition: background 0.15s ease;
  }
  .nav-titlebar__win-btn:hover {
    background: var(--hover-bg, rgba(128, 128, 128, 0.15));
  }
  .nav-titlebar__win-btn:active {
    background: var(--hover-bg, rgba(128, 128, 128, 0.25));
  }
  .nav-titlebar__win-btn--close:hover {
    background: #e81123;
    color: #fff;
  }
  .nav-titlebar__win-btn--close:active {
    background: #c42b1c;
    color: #fff;
  }
</style>
