<script lang="ts">
  import {
    Check,
    ChevronRight,
    Code2,
    Copy,
    FileDown,
    FilePlus2,
    FileText,
    FolderOpen,
    PanelLeftClose,
    PanelLeftOpen,
    PanelTopClose,
    PanelTopOpen,
    Pilcrow,
  } from "lucide-svelte";
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
    onNewFile,
    onOpenFile,
    onOpenFolder,
    onCopyMarkdown,
    onExportPdf,
    copyPulse = false,
    titlebarVisible,
    onToggleTitlebar,
    readingMode,
    onToggleReading,
    vimOn,
    onToggleVim,
    writingDisplay,
    onWritingFontSizeChange,
    onWritingLineHeightChange,
    onResetWritingDisplay,
    prosemarkOn,
    onToggleProsemark,
  }: {
    sidebarOpen: boolean;
    onToggleSidebar: () => void;
    rootPath: string | null;
    activePath: string | null;
    saveStatus: "idle" | "dirty" | "saving" | "saved";
    onNewFile?: () => void;
    onOpenFile?: () => void;
    onOpenFolder?: () => void;
    onCopyMarkdown?: () => void;
    onExportPdf?: () => void;
    copyPulse?: boolean;
    titlebarVisible: boolean;
    onToggleTitlebar: () => void;
    readingMode?: boolean;
    onToggleReading?: () => void;
    vimOn?: boolean;
    onToggleVim?: () => void;
    writingDisplay: WritingDisplay;
    onWritingFontSizeChange: (value: WritingFontSize) => void;
    onWritingLineHeightChange: (value: WritingLineHeight) => void;
    onResetWritingDisplay: () => void;
    prosemarkOn?: boolean;
    onToggleProsemark?: () => void;
  } = $props();

  let t = $derived(getT($language));

  const MAX_SEGMENTS = 4;

  function pathSegments(path: string): string[] {
    const parts = path.split(/[\\/]/).filter(Boolean);
    if (parts.length <= MAX_SEGMENTS) return parts;
    return ["\u2026", ...parts.slice(-MAX_SEGMENTS)];
  }

  function statusLabel(status: "idle" | "dirty" | "saving" | "saved"): string {
    switch (status) {
      case "saving": return t("breadcrumb.saving");
      case "dirty": return t("breadcrumb.unsaved");
      case "saved": return t("breadcrumb.saved");
      default: return "";
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
      <Icon
        icon={sidebarOpen ? PanelLeftClose : PanelLeftOpen}
        size={14}
        strokeWidth={1.5}
      />
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
        <img
          src={exciteUrl}
          alt=""
          aria-hidden
          width={16}
          height={16}
          draggable={false}
          class="mdv-breadcrumb__excite"
        />
      {:else}
        <span class="mdv-breadcrumb__dot" aria-hidden />
      {/if}
      <span class="mdv-breadcrumb__status-label">{label}</span>
    {/if}
  </div>

  <div class="mdv-breadcrumb__actions" data-tauri-drag-region>
    <Button
      data-tooltip={titlebarVisible ? t("title.hideBreadcrumb") : t("title.showBreadcrumb")}
      aria-label={titlebarVisible ? t("title.hideBreadcrumb") : t("title.showBreadcrumb")}
      aria-pressed={!titlebarVisible}
      onclick={onToggleTitlebar}
    >
      {#snippet icon()}
        <Icon
          icon={titlebarVisible ? PanelTopClose : PanelTopOpen}
          size={14}
          strokeWidth={1.5}
        />
      {/snippet}
    </Button>
    <ThemeButton
      {vimOn}
      {onToggleVim}
      {writingDisplay}
      {onWritingFontSizeChange}
      {onWritingLineHeightChange}
      {onResetWritingDisplay}
    />
    {#if onToggleProsemark != null}
      <Button
        data-tooltip={prosemarkOn ? "raw code" : "prose"}
        aria-label={prosemarkOn ? "switch to raw code" : "switch to prose mode"}
        aria-pressed={prosemarkOn}
        onclick={onToggleProsemark}
      >
        {#snippet icon()}
          <Icon
            icon={prosemarkOn ? Code2 : Pilcrow}
            size={14}
            strokeWidth={1.5}
          />
        {/snippet}
      </Button>
    {/if}

    <div class="mdv-breadcrumb__file-actions">
      {#if onCopyMarkdown}
        <button
          type="button"
          class="mdv-copybtn"
          class:is-copied={copyPulse}
          data-tooltip={copyPulse ? t("app.copied") : shortcutLabel(t("app.copyMarkdownShortcut"))}
          aria-label={copyPulse ? t("app.copied") : t("app.copyMarkdown")}
          onclick={onCopyMarkdown}
        >
          <span class="mdv-copybtn__icon mdv-copybtn__icon--copy" aria-hidden>
            <Icon icon={Copy} size={12} strokeWidth={1.5} />
          </span>
          <span class="mdv-copybtn__icon mdv-copybtn__icon--check" aria-hidden>
            <Icon icon={Check} size={13} strokeWidth={2} />
          </span>
        </button>
      {/if}
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
        data-tooltip={shortcutLabel(t("app.newFileShortcut"))}
        aria-label={t("app.newFile")}
        onclick={onNewFile}
      >
        {#snippet icon()}
          <Icon icon={FilePlus2} size={13} strokeWidth={1.5} />
        {/snippet}
      </Button>
      <Button
        data-tooltip={shortcutLabel(t("app.openFileShortcut"))}
        aria-label={t("app.openFile")}
        onclick={onOpenFile}
      >
        {#snippet icon()}
          <Icon icon={FileText} size={13} strokeWidth={1.5} />
        {/snippet}
      </Button>
      <Button
        data-tooltip={shortcutLabel(t("app.openFolderShortcut"))}
        aria-label={t("app.openFolder")}
        onclick={onOpenFolder}
      >
        {#snippet icon()}
          <Icon icon={FolderOpen} size={13} strokeWidth={1.5} />
        {/snippet}
      </Button>
    </div>
  </div>
</div>
