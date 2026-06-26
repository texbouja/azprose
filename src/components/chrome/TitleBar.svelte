<script lang="ts">
  import { Check, Copy, FileDown, Minimize2 } from "@/lib/icons";
  import { Button, Icon } from "@/components/primitives";
  import { language, getT } from "@/lib/i18n";
  import { shortcutLabel } from "@/lib";
  import type { WritingDisplay, WritingFontSize, WritingLineHeight } from "@/lib";
  import ThemeButton from "./ThemeButton.svelte";

  let {
    fileName,
    filePath,
    dirty = false,
    readingMode = false,
    onToggleReading,
    onCopyMarkdown,
    copyPulse = false,
    onExportPdf,
    vimOn,
    onToggleVim,
    writingDisplay,
    onWritingFontSizeChange,
    onWritingLineHeightChange,
    onResetWritingDisplay,
  }: {
    fileName?: string;
    filePath?: string | null;
    dirty?: boolean;
    readingMode?: boolean;
    onToggleReading?: () => void;
    onCopyMarkdown?: () => void;
    copyPulse?: boolean;
    onExportPdf?: () => void;
    vimOn?: boolean;
    onToggleVim?: () => void;
    writingDisplay: WritingDisplay;
    onWritingFontSizeChange: (value: WritingFontSize) => void;
    onWritingLineHeightChange: (value: WritingLineHeight) => void;
    onResetWritingDisplay: () => void;
  } = $props();

  let t = $derived(getT($language));
</script>

<header class="mdv-titlebar" data-tauri-drag-region>
  <div class="mdv-titlebar__lead" data-tauri-drag-region />

  <div class="mdv-titlebar__center" data-tauri-drag-region>
    {#if fileName}
      <span
        class="mdv-titlebar__filename"
        data-tauri-drag-region
        title={filePath ?? fileName}
      >
        {fileName}
        {#if dirty}
          <span
            class="mdv-titlebar__dot"
            aria-label={t("title.unsavedChanges")}
            data-tauri-drag-region
          />
        {/if}
      </span>
    {/if}
  </div>

  <div class="mdv-titlebar__actions" data-tauri-drag-region>
    {#if readingMode}
      <ThemeButton
        {vimOn}
        {onToggleVim}
        {writingDisplay}
        {onWritingFontSizeChange}
        {onWritingLineHeightChange}
        {onResetWritingDisplay}
      />
    {/if}
    {#if readingMode && onCopyMarkdown}
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
    {#if readingMode && onExportPdf}
      <Button
        data-tooltip={shortcutLabel(t("app.exportPdfShortcut"))}
        aria-label={t("app.exportPdf")}
        onclick={onExportPdf}
      >
        {#snippet icon()}
          <Icon icon={FileDown} size={13} strokeWidth={1.5} />
        {/snippet}
      </Button>
    {/if}
    {#if onToggleReading && readingMode}
      <Button
        data-tooltip={t("title.exitReadingTooltip")}
        aria-label={t("title.exitReading")}
        onclick={onToggleReading}
      >
        {#snippet icon()}
          <Icon icon={Minimize2} size={14} strokeWidth={1.5} />
        {/snippet}
      </Button>
    {/if}
  </div>
</header>
