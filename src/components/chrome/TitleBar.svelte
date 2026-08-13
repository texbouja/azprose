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
