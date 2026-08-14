<script lang="ts">
  import { Button } from "@/components/primitives";
  import { language, getT } from "@/lib/i18n";
  import { shortcutLabel, basename } from "@/lib";
  import type { TypographySettings } from "@/lib/typography";
  import FileTree from "@/components/files/file-tree.svelte";
  import ThemeButton from "./ThemeButton.svelte";
  import exciteUrl from "@/assets/mascot/az-excite.svg";

  let {
    rootPath,
    activePath,
    saveStatus,
    vimOn,
    onToggleVim,
    typography,
    onTypographyChange,
    onResetTypography,
    onToggleFullscreen,
    onOpenSettings,
    consoleOpen,
    onToggleConsole,
    viewPanelOpen,
    onToggleViewPanel,
    onOpenSvarCalendar,
    onOpenSpreadsheet,
    onOpenDataFilter,
    onOpenNav,
    onOpenAgent,
    onOpenPalette,
    onSelectFile,
  }: {
    rootPath: string | null;
    activePath: string | null;
    saveStatus: "idle" | "dirty" | "saving" | "saved";
    vimOn?: boolean;
    onToggleVim?: () => void;
    typography: TypographySettings;
    onTypographyChange: (patch: Partial<TypographySettings>) => void;
    onResetTypography: () => void;
    onToggleFullscreen?: () => void;
    onOpenSettings?: () => void;
    consoleOpen?: boolean;
    onToggleConsole?: () => void;
    viewPanelOpen?: boolean;
    onToggleViewPanel?: () => void;
    onOpenSvarCalendar?: () => void;
    onOpenSpreadsheet?: () => void;
    onOpenDataFilter?: () => void;
    /** Lance (ou cible, SINGLETON — R2) la fenêtre NAV (chantier fenêtre NAV,
     *  phase 8) : nouvel onglet vide si elle est déjà ouverte. */
    onOpenNav?: () => void;
    /** Ouvre l'onglet « Assistant » dans le side panel (chantier OpenCode). */
    onOpenAgent?: () => void;
    onOpenPalette?: () => void;
    onSelectFile?: (path: string, newTab?: boolean) => void;
  } = $props();

  let t = $derived(getT($language));

  const MAX_SEGMENTS = 4;

  /* ── segment data ── */

  type SegmentInfo = {
    label: string;
    parentDir: string;
    isEllipsis?: boolean;
  };

  let path = $derived(activePath ?? rootPath);

  /** Nom du PROJET (dossier conteneur) — indication PERMANENTE de ce que la
   *  fenêtre a ouvert, en tête de cascade (2026-08-14). Volontairement HORS
   *  de `segmentData` : ce dernier est relatif à la racine et disparaît quand
   *  aucun fichier n'est ouvert, alors que le projet doit rester affiché. Le
   *  garder à part évite aussi que la troncature `…` (MAX_SEGMENTS) puisse
   *  l'avaler, et qu'il hérite du rendu interactif des autres segments. */
  let projectName = $derived(rootPath ? basename(rootPath) : null);

  let segmentData = $derived.by((): SegmentInfo[] => {
    if (!path) return [];
    const root = rootPath || "";
    let rel: string;
    if (root && path.startsWith(root)) {
      rel = path.slice(root.length).replace(/^\//, "");
    } else {
      rel = path;
    }
    const parts = rel.split(/[\\/]/).filter(Boolean);
    if (parts.length === 0) return [];

    const all: SegmentInfo[] = [];
    for (let i = 0; i < parts.length; i++) {
      const parentDir = i === 0
        ? root
        : root + "/" + parts.slice(0, i).join("/");
      all.push({ label: parts[i], parentDir });
    }

    if (all.length <= MAX_SEGMENTS) return all;
    return [{ label: "…", parentDir: "", isEllipsis: true }, ...all.slice(-MAX_SEGMENTS)];
  });

  function statusLabel(status: "idle" | "dirty" | "saving" | "saved"): string {
    switch (status) {
      case "saving": return t("breadcrumb.saving");
      case "dirty":  return t("breadcrumb.unsaved");
      case "saved":  return t("breadcrumb.saved");
      default:       return "";
    }
  }

  let label = $derived(statusLabel(saveStatus));

  /* ── dropdown state ── */

  let openIdx = $state<number | null>(null);
  let ddTop = $state(0);
  let ddLeft = $state(0);
  let ddWidth = $state(280);

  function onSegmentClick(i: number, seg: SegmentInfo, el: HTMLElement) {
    if (seg.isEllipsis || !onSelectFile) return;
    if (openIdx === i) { openIdx = null; return; }

    const rect = el.getBoundingClientRect();
    ddTop = rect.bottom + 4;
    ddLeft = rect.left;
    ddWidth = Math.max(220, rect.width);
    openIdx = i;
  }

  function closeDropdown() { openIdx = null; }

  function handleSelectFile(p: string, newTab?: boolean) {
    openIdx = null;
    onSelectFile?.(p, newTab);
  }

  /* click-outside + Escape */
  $effect(() => {
    if (openIdx === null) return;

    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest?.(".mdv-bc-dropdown")) return;
      if (target.closest?.(".mdv-breadcrumb__seg")) return;
      closeDropdown();
    }
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeDropdown();
    }

    document.addEventListener("mousedown", onDocMouseDown, true);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown, true);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  });
</script>

<div class="mdv-breadcrumb" data-tauri-drag-region>
  <nav class="mdv-breadcrumb__path" aria-label={t("breadcrumb.path")} data-tauri-drag-region>
    {#if projectName}
      <!-- Racine de la cascade : le PROJET ouvert dans cette fenêtre. Rendu
           en <span> et non en <button> — purement indicatif, contrairement
           aux segments suivants qui ouvrent la liste de leur dossier. -->
      <span class="mdv-breadcrumb__project" title={rootPath}>{projectName}</span>
    {:else if segmentData.length === 0}
      <span class="mdv-breadcrumb__placeholder">{t("breadcrumb.noFile")}</span>
    {/if}
    {#if segmentData.length > 0}
      {#each segmentData as seg, i (seg.label + i)}
        <span class="mdv-breadcrumb__seg-row">
          {#if i > 0 || projectName}
            <i class="wxi-chevron-right" style="font-size:11px" title={t("breadcrumb.separator")}></i>
          {/if}
          <button
            type="button"
            class="mdv-breadcrumb__seg{!seg.isEllipsis && onSelectFile ? ' is-interactive' : ''}{i === segmentData.length - 1 ? ' is-leaf' : ''}"
            disabled={!!seg.isEllipsis}
            onclick={(e) => onSegmentClick(i, seg, e.currentTarget as HTMLElement)}
          >{seg.label}</button>
        </span>
      {/each}
    {/if}
  </nav>

  <div class="mdv-breadcrumb__status" data-status={saveStatus}>
    {#if saveStatus !== "idle"}
      {#if saveStatus === "saved"}
        <img src={exciteUrl} alt="" aria-hidden width={16} height={16} draggable={false} class="mdv-breadcrumb__excite" />
      {:else}
        <span class="mdv-breadcrumb__dot" aria-hidden />
      {/if}
      <span class="mdv-breadcrumb__status-label">{label}</span>
    {/if}
  </div>

  <div class="mdv-breadcrumb__actions" data-tauri-drag-region>
    <div class="mdv-breadcrumb__display">
      {#if onToggleConsole}
        <Button
          data-tooltip={t("command.toggleConsole")}
          aria-label={t("command.toggleConsole")}
          aria-pressed={consoleOpen}
          onclick={onToggleConsole}
        >
          {#snippet icon()}
            <i class="wxi-panel-bottom" style="font-size:14px"></i>
          {/snippet}
        </Button>
      {/if}
      {#if onToggleViewPanel}
        <Button
          data-tooltip={t("breadcrumb.toggleViewPanel")}
          aria-label={t("breadcrumb.toggleViewPanel")}
          aria-pressed={viewPanelOpen}
          onclick={onToggleViewPanel}
        >
          {#snippet icon()}
            <i class="wxi-columns-2" style="font-size:14px"></i>
          {/snippet}
        </Button>
      {/if}
      {#if onToggleFullscreen}
        <Button
          data-tooltip={t("breadcrumb.fullscreen")}
          aria-label={t("breadcrumb.fullscreen")}
          onclick={onToggleFullscreen}
        >
          {#snippet icon()}
            <i class="wxi-fullscreen" style="font-size:14px"></i>
          {/snippet}
        </Button>
      {/if}
    </div>

    {#if onOpenSvarCalendar || onOpenSpreadsheet || onOpenDataFilter || onOpenNav || onOpenAgent}
      <div class="mdv-breadcrumb__tools">
        {#if onOpenAgent}
          <Button
            data-tooltip={t("agent.title")}
            aria-label={t("agent.title")}
            onclick={onOpenAgent}
          >
            {#snippet icon()}
              <i class="wxi-sparkles" style="font-size:14px"></i>
            {/snippet}
          </Button>
        {/if}
        {#if onOpenNav}
          <Button
            data-tooltip={t("breadcrumb.nav")}
            aria-label={t("breadcrumb.nav")}
            onclick={onOpenNav}
          >
            {#snippet icon()}
              <i class="wxi-compass" style="font-size:14px"></i>
            {/snippet}
          </Button>
        {/if}
        {#if onOpenSpreadsheet}
          <Button
            data-tooltip={t("breadcrumb.spreadsheet")}
            aria-label={t("breadcrumb.spreadsheet")}
            onclick={onOpenSpreadsheet}
          >
            {#snippet icon()}
              <i class="wxi-table" style="font-size:14px"></i>
            {/snippet}
          </Button>
        {/if}
        {#if onOpenDataFilter}
          <Button
            data-tooltip={t("breadcrumb.dataFilter")}
            aria-label={t("breadcrumb.dataFilter")}
            onclick={onOpenDataFilter}
          >
            {#snippet icon()}
              <i class="wxi-database-search" style="font-size:14px"></i>
            {/snippet}
          </Button>
        {/if}
        {#if onOpenSvarCalendar}
          <Button
            data-tooltip={t("breadcrumb.svarCalendar")}
            aria-label={t("breadcrumb.svarCalendar")}
            onclick={onOpenSvarCalendar}
          >
            {#snippet icon()}
              <i class="wxi-calendar-clock" style="font-size:14px"></i>
            {/snippet}
          </Button>
        {/if}
      </div>
    {/if}

    <div class="mdv-breadcrumb__settings">
      {#if onOpenPalette}
        <Button
          data-tooltip={shortcutLabel(t("breadcrumb.commandPalette"))}
          aria-label={t("breadcrumb.commandPalette")}
          onclick={onOpenPalette}
        >
          {#snippet icon()}
            <i class="wxi-terminal" style="font-size:14px"></i>
          {/snippet}
        </Button>
      {/if}
      <ThemeButton
        {vimOn}
        {onToggleVim}
        {typography}
        {onTypographyChange}
        {onResetTypography}
      />
      {#if onOpenSettings}
        <Button
          data-tooltip={t("breadcrumb.settings")}
          aria-label={t("breadcrumb.settings")}
          onclick={onOpenSettings}
        >
          {#snippet icon()}
            <i class="wxi-settings" style="font-size:14px"></i>
          {/snippet}
        </Button>
      {/if}
    </div>
  </div>
</div>

<!-- fixed dropdown with FileTree — escapes overflow:hidden breadcrumb -->
{#if openIdx !== null}
  {@const seg = segmentData[openIdx]}
  <div
    class="mdv-bc-dropdown"
    style="top:{ddTop}px; left:{ddLeft}px; width:{ddWidth}px"
    role="menu"
  >
    <FileTree
      rootPath={seg.parentDir}
      {activePath}
      onSelect={handleSelectFile}
    />
  </div>
{/if}

<style>
  /* ── interactive segments ── */

  .mdv-breadcrumb__seg-row {
    position: relative;
  }

  .mdv-breadcrumb__seg {
    appearance: none;
    border: none;
    background: none;
    padding: 0;
    margin: 0;
    font: inherit;
    border-radius: 4px;
    transition:
      color var(--dur-base) var(--easing),
      background var(--dur-fast) var(--easing);
  }

  .mdv-breadcrumb__seg.is-interactive {
    cursor: pointer;
  }

  .mdv-breadcrumb__seg.is-interactive:hover {
    color: var(--fg);
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  .mdv-breadcrumb__seg.is-leaf {
    color: var(--fg);
    font-weight: 500;
  }

  .mdv-breadcrumb__seg:disabled {
    cursor: default;
    opacity: 1;
  }

  .mdv-breadcrumb__seg:disabled:hover {
    background: none;
  }

  /* ── fixed dropdown ── */

  /* FileTree mounts here in the topbar, outside .mdv-sidebar — rebind
     --font-ui (and inherit font-family) so the tree uses the sidebar font
     (Ubuntu Condensed) instead of the main UI font. */
  .mdv-bc-dropdown {
    position: fixed;
    z-index: 200;
    max-height: 360px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--muted) 30%, transparent) transparent;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow:
      0 1px 0 color-mix(in srgb, white 4%, transparent) inset,
      0 10px 28px rgba(var(--shadow-color), 0.22),
      0 2px 8px rgba(var(--shadow-color), 0.08);
    animation: mdv-pop-in 140ms var(--easing);
    --font-ui: var(--font-sidebar);
    font-family: var(--font-sidebar);
  }

  .mdv-bc-dropdown::-webkit-scrollbar {
    width: 6px;
  }

  .mdv-bc-dropdown::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--muted) 28%, transparent);
    border-radius: 999px;
  }

  /* tighten tree rows inside dropdown */
  .mdv-bc-dropdown :global(.mdv-tree__row) {
    padding: 3px 10px 3px 6px;
    font-size: 12px;
  }

  .mdv-bc-dropdown :global(.mdv-tree__row--file) {
    padding: 3px 10px 3px 6px;
  }

  .mdv-bc-dropdown :global(.mdv-tree__loading),
  .mdv-bc-dropdown :global(.mdv-tree__empty) {
    padding: 6px 10px;
    font-size: 11px;
    color: var(--muted);
  }

  .mdv-bc-dropdown :global(.mdv-tree__error) {
    padding: 6px 10px;
    font-size: 11px;
    color: var(--muted);
  }

  .mdv-bc-dropdown :global(.mdv-tree__error-art) {
    display: none;
  }

  @keyframes mdv-pop-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
