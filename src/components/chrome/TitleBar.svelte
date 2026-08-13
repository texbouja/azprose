<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { windowTitle } from "@/lib/window-title";

  let {
    rootName,
    nativeDecorations = true,
  }: {
    /** Nom du projet/document — le titre affiché est TOUJOURS "AZprose" seul
     *  ou "AZprose — <rootName>" (même chaîne que le titre OS, posé par
     *  l'appelant via setTitle() — cf. window-title.ts, correction 2026-08-14 :
     *  les deux titrent divergeaient avant, l'OS gardant "AZprose" figé). */
    rootName?: string;
    nativeDecorations?: boolean;
  } = $props();

  let displayTitle = $derived(windowTitle(rootName));

  let isMaximized = $state(false);

  async function refreshMaximized() {
    try { isMaximized = await getCurrentWindow().isMaximized(); } catch {}
  }

  async function handleMinimize() {
    await getCurrentWindow().minimize();
  }
  async function handleMaximize() {
    await getCurrentWindow().toggleMaximize();
    await refreshMaximized();
  }
  async function handleClose() {
    await getCurrentWindow().close();
  }

  // Track maximized state when window is resized
  $effect(() => {
    const win = getCurrentWindow();
    const unlisten = win.onResized(() => { refreshMaximized(); });
    refreshMaximized();
    return () => { unlisten.then((fn) => fn()); };
  });
</script>

<header class="mdv-titlebar" data-tauri-drag-region>
  <div class="mdv-titlebar__lead" data-tauri-drag-region />

  <div class="mdv-titlebar__center" data-tauri-drag-region>
    <span class="mdv-titlebar__filename" data-tauri-drag-region>
      {displayTitle}
    </span>
  </div>

  <div class="mdv-titlebar__actions" data-tauri-drag-region>
    {#if !nativeDecorations}
      <button class="mdv-win-btn" onclick={handleMinimize} title="Minimize" data-tauri-drag-region="false">
        <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="1" rx="0.5" fill="currentColor"/></svg>
      </button>
      <button class="mdv-win-btn" onclick={handleMaximize} title={isMaximized ? "Restore" : "Maximize"} data-tauri-drag-region="false">
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
      <button class="mdv-win-btn mdv-win-btn--close" onclick={handleClose} title="Close" data-tauri-drag-region="false">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </button>
    {/if}
  </div>
</header>

<style>
  /* Contrat CSS propre au composant (vague 3, phase 3.1, R2/R3) — rapatrié
     depuis src/styles/chrome/titlebar.css. Le fichier source portait aussi
     __sep-v/__name/__doc/__sep/__dot/__spacer : classes mortes, résidu de la
     tentative d'unification titlebar/breadcrumb annulée en cours de session
     (aucun template ne les rend plus) — non reportées ici. */
  .mdv-titlebar {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    height: var(--titlebar-h);
    -webkit-app-region: drag;
    user-select: none;
  }
  /* :global() sur l'ancêtre : html n'est jamais dans le fragment rendu par ce
     composant, le scoping Svelte ne peut pas le prouver statiquement — sans
     ça, svelte-check marque le sélecteur "inutilisé" (faux positif). */
  :global(html.is-mac) .mdv-titlebar {
    padding: 0 12px 0 84px;
  }

  .mdv-titlebar__lead {
    flex: 1;
    min-width: 0;
  }

  .mdv-titlebar__center {
    /* absolute-center against the whole window so traffic-light reserved space
       on the left doesn't visually shift the filename right of true center.
       keep pointer-events ON so Tauri's data-tauri-drag-region can capture
       drags from the centered filename — max-width: 60% already prevents
       overlap with the right-side action buttons. */
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    max-width: 60%;
  }

  .mdv-titlebar__filename {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: 100%;
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mdv-titlebar__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    -webkit-app-region: no-drag;
  }

  /* ── Window control buttons (when native decorations are off) ──── */
  .mdv-win-btn {
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
  .mdv-win-btn:hover {
    background: var(--hover-bg, rgba(128, 128, 128, 0.15));
  }
  .mdv-win-btn:active {
    background: var(--hover-bg, rgba(128, 128, 128, 0.25));
  }
  .mdv-win-btn--close:hover {
    background: #e81123;
    color: #fff;
  }
  .mdv-win-btn--close:active {
    background: #c42b1c;
    color: #fff;
  }
</style>
