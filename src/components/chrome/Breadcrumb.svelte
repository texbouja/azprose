<script lang="ts">
  import {
    ChevronRight,
    Code2,
    Eye,
    FileDown,
    FolderOpen,
    Maximize2,
    Monitor,
    PanelLeftClose,
    PanelLeftOpen,
    PanelTopClose,
    PanelTopOpen,
    Pilcrow,
    Settings,
  } from "@/lib/icons";
  import { Button, Icon } from "@/components/primitives";
  import { language, getT } from "@/lib/i18n";
  import { shortcutLabel } from "@/lib";
  import type { WritingDisplay, WritingFontSize, WritingLineHeight } from "@/lib";
  import ThemeButton from "./ThemeButton.svelte";
  import exciteUrl from "@/assets/mascot/excite.png";

  let {
    sidebarOpen,
    onToggleSidebar,
    rootPath,
    activePath,
    saveStatus,
    onExportPdf,
    onOpenProject,
    titlebarVisible,
    onToggleTitlebar,
    vimOn,
    onToggleVim,
    writingDisplay,
    onWritingFontSizeChange,
    onWritingLineHeightChange,
    onResetWritingDisplay,
    editorMode,
    onSetEditorMode,
    onToggleFullscreen,
    onOpenSettings,
    isMarp = false,
  }: {
    sidebarOpen: boolean;
    onToggleSidebar: () => void;
    rootPath: string | null;
    activePath: string | null;
    saveStatus: "idle" | "dirty" | "saving" | "saved";
    onExportPdf?: () => void;
    onOpenProject?: () => void;
    titlebarVisible: boolean;
    onToggleTitlebar: () => void;
    vimOn?: boolean;
    onToggleVim?: () => void;
    writingDisplay: WritingDisplay;
    onWritingFontSizeChange: (value: WritingFontSize) => void;
    onWritingLineHeightChange: (value: WritingLineHeight) => void;
    onResetWritingDisplay: () => void;
    isMarp?: boolean;
    editorMode?: "raw" | "prose" | "preview" | "presentation";
    onSetEditorMode?: (mode: "raw" | "prose" | "preview" | "presentation") => void;
    onToggleFullscreen?: () => void;
    onOpenSettings?: () => void;
  } = $props();

  let t = $derived(getT($language));

  const MAX_SEGMENTS = 4;

  function pathSegments(path: string): string[] {
    const parts = path.split(/[\\/]/).filter(Boolean);
    if (parts.length <= MAX_SEGMENTS) return parts;
    return ["…", ...parts.slice(-MAX_SEGMENTS)];
  }

  function statusLabel(status: "idle" | "dirty" | "saving" | "saved"): string {
    switch (status) {
      case "saving": return t("breadcrumb.saving");
      case "dirty":  return t("breadcrumb.unsaved");
      case "saved":  return t("breadcrumb.saved");
      default:       return "";
    }
  }

  let path = $derived(activePath ?? rootPath);
  let segments = $derived(path ? pathSegments(path) : []);
  let label = $derived(statusLabel(saveStatus));
</script>

<div class="mdv-breadcrumb" data-tauri-drag-region>
  <Button
    data-tooltip={shortcutLabel(sidebarOpen ? t("breadcrumb.hideSidebarShortcut") : t("breadcrumb.showSidebarShortcut"))}
    aria-label={sidebarOpen ? t("breadcrumb.hideSidebar") : t("breadcrumb.showSidebar")}
    onclick={onToggleSidebar}
  >
    {#snippet icon()}
      <Icon icon={sidebarOpen ? PanelLeftClose : PanelLeftOpen} size={14} strokeWidth={1.5} />
    {/snippet}
  </Button>

  <nav class="mdv-breadcrumb__path" aria-label={t("breadcrumb.path")} data-tauri-drag-region>
    {#if segments.length === 0}
      <span class="mdv-breadcrumb__placeholder">{t("breadcrumb.noFile")}</span>
    {:else}
      {#each segments as seg, i}
        <span class="mdv-breadcrumb__seg-row">
          {#if i > 0}
            <Icon icon={ChevronRight} size={11} strokeWidth={1.5} title="separator" />
          {/if}
          <span class="mdv-breadcrumb__seg" class:is-leaf={i === segments.length - 1}>{seg}</span>
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

    <!-- Tools : boutons de mode (uniquement pour les fichiers .md) -->
    {#if onSetEditorMode}
      <div class="mdv-breadcrumb__mode-group">
        <Button
          data-tooltip="Présentation"
          aria-label="Mode présentation"
          aria-pressed={editorMode === "presentation"}
          onclick={() => onSetEditorMode?.("presentation")}
        >
          {#snippet icon()}
            <Icon icon={Monitor} size={14} strokeWidth={1.5} />
          {/snippet}
        </Button>
        <Button
          data-tooltip="Preview"
          aria-label="Mode preview"
          aria-pressed={editorMode === "preview"}
          onclick={() => onSetEditorMode?.("preview")}
        >
          {#snippet icon()}
            <Icon icon={Eye} size={14} strokeWidth={1.5} />
          {/snippet}
        </Button>
        {#if !isMarp}
        <div class="mdv-breadcrumb__mode-sep" aria-hidden="true"></div>
        <Button
          data-tooltip="Prose"
          aria-label="Mode prose"
          aria-pressed={editorMode === "prose"}
          onclick={() => onSetEditorMode?.("prose")}
        >
          {#snippet icon()}
            <Icon icon={Pilcrow} size={14} strokeWidth={1.5} />
          {/snippet}
        </Button>
        {/if}
        <Button
          data-tooltip="Raw"
          aria-label="Mode raw"
          aria-pressed={editorMode === "raw"}
          onclick={() => onSetEditorMode?.("raw")}
        >
          {#snippet icon()}
            <Icon icon={Code2} size={14} strokeWidth={1.5} />
          {/snippet}
        </Button>
      </div>
    {/if}

    <!-- Files : export PDF + ouvrir un projet -->
    <div class="mdv-breadcrumb__file-actions">
      <Button
        data-tooltip={shortcutLabel(t("app.exportPdfShortcut"))}
        aria-label={t("app.exportPdf")}
        onclick={onExportPdf}
      >
        {#snippet icon()}
          <Icon icon={FileDown} size={13} strokeWidth={1.5} />
        {/snippet}
      </Button>
      <Button
        data-tooltip={t("app.openProjectShortcut")}
        aria-label={t("app.openProject")}
        onclick={onOpenProject}
      >
        {#snippet icon()}
          <Icon icon={FolderOpen} size={13} strokeWidth={1.5} />
        {/snippet}
      </Button>
    </div>

    <!-- Config : toujours visibles -->
    <div class="mdv-breadcrumb__config">
      <Button
        data-tooltip={titlebarVisible ? t("title.hideBreadcrumb") : t("title.showBreadcrumb")}
        aria-label={titlebarVisible ? t("title.hideBreadcrumb") : t("title.showBreadcrumb")}
        aria-pressed={!titlebarVisible}
        onclick={onToggleTitlebar}
      >
        {#snippet icon()}
          <Icon icon={titlebarVisible ? PanelTopClose : PanelTopOpen} size={14} strokeWidth={1.5} />
        {/snippet}
      </Button>
      {#if onToggleFullscreen}
        <Button
          data-tooltip="Plein écran"
          aria-label="Basculer le plein écran"
          onclick={onToggleFullscreen}
        >
          {#snippet icon()}
            <Icon icon={Maximize2} size={14} strokeWidth={1.5} />
          {/snippet}
        </Button>
      {/if}
      <ThemeButton
        {vimOn}
        {onToggleVim}
        {writingDisplay}
        {onWritingFontSizeChange}
        {onWritingLineHeightChange}
        {onResetWritingDisplay}
      />
      {#if onOpenSettings}
        <Button
          data-tooltip="Paramètres"
          aria-label="Paramètres du rendu Markdown"
          onclick={onOpenSettings}
        >
          {#snippet icon()}
            <Icon icon={Settings} size={14} strokeWidth={1.5} />
          {/snippet}
        </Button>
      {/if}
    </div>

  </div>
</div>
