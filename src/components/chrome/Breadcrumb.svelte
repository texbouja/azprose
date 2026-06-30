<script lang="ts">
  import {
    Check,
    ChevronDown,
    ChevronRight,
    Code2,
    Eye,
    FileDown,
    FileText,
    Globe,
    Maximize2,
    Monitor,
    PanelBottom,
    PanelLeftClose,
    PanelLeftOpen,
    PanelTopClose,
    PanelTopOpen,
    Pilcrow,
    Settings,
    Terminal,
  } from "@/lib/icons";
  import { Button, Icon, Popover } from "@/components/primitives";
  import { language, getT, setLanguage, LANGUAGE_CHOICES } from "@/lib/i18n";
  import { shortcutLabel } from "@/lib";
  import type { WritingDisplay, WritingFontSize, WritingLineHeight } from "@/lib";
  import ThemeButton from "./ThemeButton.svelte";
  import { SLIDE_THEMES, SLIDE_MODES } from "@/stores/slide-settings.svelte";
  import { slideSession } from "@/stores/slide-session.svelte";
  import exciteUrl from "@/assets/mascot/excite.png";

  let {
    sidebarOpen,
    onToggleSidebar,
    opencodeOpen,
    onToggleOpencode,
    rootPath,
    activePath,
    saveStatus,
    onExportPdf,
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
    typstViewerOn,
    onTypstCodeView,
    onToggleTypstViewer,
    compilingTypst,
    onTypstBuild,
    exportingTypst,
    consoleOpen,
    onToggleConsole,
  }: {
    sidebarOpen: boolean;
    onToggleSidebar: () => void;
    opencodeOpen?: boolean;
    onToggleOpencode?: () => void;
    rootPath: string | null;
    activePath: string | null;
    saveStatus: "idle" | "dirty" | "saving" | "saved";
    onExportPdf?: () => void;
    titlebarVisible: boolean;
    onToggleTitlebar: () => void;
    vimOn?: boolean;
    onToggleVim?: () => void;
    writingDisplay: WritingDisplay;
    onWritingFontSizeChange: (value: WritingFontSize) => void;
    onWritingLineHeightChange: (value: WritingLineHeight) => void;
    onResetWritingDisplay: () => void;
    editorMode?: "raw" | "prose" | "preview" | "presentation";
    onSetEditorMode?: (mode: "raw" | "prose" | "preview" | "presentation") => void;
    onToggleFullscreen?: () => void;
    onOpenSettings?: () => void;
    typstViewerOn?: boolean;
    onTypstCodeView?: () => void;
    onToggleTypstViewer?: () => void;
    compilingTypst?: boolean;
    onTypstBuild?: () => void;
    exportingTypst?: boolean;
    consoleOpen?: boolean;
    onToggleConsole?: () => void;
  } = $props();

  let t = $derived(getT($language));

  let presBtnEl: HTMLDivElement | null = null;
  let slideMenuOpen = $state(false);
  let langMenuOpen = $state(false);
  let langAnchorEl: HTMLDivElement | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressActive = false;

  function onPresDown(e: PointerEvent) {
    if (e.button !== 0) return;
    longPressActive = false;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      longPressActive = true;
      slideMenuOpen = true;
    }, 500);
  }

  function onPresRelease() {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function onPresClick() {
    if (longPressActive) { longPressActive = false; return; }
    onSetEditorMode?.("presentation");
  }

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
            <Icon icon={ChevronRight} size={11} strokeWidth={1.5} title={t("breadcrumb.separator")} />
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
        <div class="mdv-pres-btn-wrap" bind:this={presBtnEl}>
          <Button
            data-tooltip={t("breadcrumb.presentation")}
            aria-label={t("breadcrumb.presentation")}
            aria-pressed={editorMode === "presentation"}
            onpointerdown={onPresDown}
            onpointerup={onPresRelease}
            onpointerleave={onPresRelease}
            onpointercancel={onPresRelease}
            onclick={onPresClick}
          >
            {#snippet icon()}
              <Icon icon={Monitor} size={14} strokeWidth={1.5} />
            {/snippet}
            {#snippet iconRight()}
              <Icon icon={ChevronDown} size={10} strokeWidth={2} />
            {/snippet}
          </Button>
          <Popover open={slideMenuOpen} onClose={() => (slideMenuOpen = false)} anchorRef={{ current: presBtnEl }}>
            <div class="mdv-menu mdv-pres-menu">
              <p class="mdv-pres-menu__label">{t("breadcrumb.slideTheme")}</p>
              {#each SLIDE_THEMES as th (th.id)}
                <label class="mdv-menu__item mdv-pres-menu__radio">
                  <input type="radio" name="pres-theme" value={th.id}
                    checked={slideSession.theme === th.id}
                    onchange={() => { slideSession.theme = th.id; }} />
                  {th.label}
                </label>
              {/each}
              <div class="mdv-pres-menu__sep"></div>
              <p class="mdv-pres-menu__label">{t("breadcrumb.slideMode")}</p>
              {#each SLIDE_MODES as m (m.id)}
                <label class="mdv-menu__item mdv-pres-menu__radio">
                  <input type="radio" name="pres-mode" value={m.id}
                    checked={slideSession.mode === m.id}
                    onchange={() => { slideSession.mode = m.id; }} />
                  {m.label}
                </label>
              {/each}
              <div class="mdv-pres-menu__sep"></div>
              <button type="button" class="mdv-menu__item"
                onclick={() => { slideMenuOpen = false; onSetEditorMode?.("presentation"); onToggleFullscreen?.(); }}
              >
                {t("breadcrumb.fullscreen")}
              </button>
            </div>
          </Popover>
        </div>
        <Button
          data-tooltip={t("breadcrumb.preview")}
          aria-label={t("breadcrumb.preview")}
          aria-pressed={editorMode === "preview"}
          onclick={() => onSetEditorMode?.("preview")}
        >
          {#snippet icon()}
            <Icon icon={Eye} size={14} strokeWidth={1.5} />
          {/snippet}
        </Button>
        <div class="mdv-breadcrumb__mode-sep" aria-hidden="true"></div>
        <Button
          data-tooltip={t("breadcrumb.prose")}
          aria-label={t("breadcrumb.prose")}
          aria-pressed={editorMode === "prose"}
          onclick={() => onSetEditorMode?.("prose")}
        >
          {#snippet icon()}
            <Icon icon={Pilcrow} size={14} strokeWidth={1.5} />
          {/snippet}
        </Button>
        <Button
          data-tooltip={t("breadcrumb.raw")}
          aria-label={t("breadcrumb.raw")}
          aria-pressed={editorMode === "raw"}
          onclick={() => onSetEditorMode?.("raw")}
        >
          {#snippet icon()}
            <Icon icon={Code2} size={14} strokeWidth={1.5} />
          {/snippet}
        </Button>
        {#if onExportPdf}
          <div class="mdv-breadcrumb__mode-sep" aria-hidden="true"></div>
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
      </div>
    {/if}

    <!-- Tools : Typst CodeView / PDFView / Build -->
    {#if activePath?.endsWith(".typ")}
      <div class="mdv-breadcrumb__tools">
        <Button
          data-tooltip={t("breadcrumb.typstCodeView")}
          aria-label={t("breadcrumb.typstCodeView")}
          aria-pressed={!typstViewerOn}
          onclick={onTypstCodeView}
        >
          {#snippet icon()}
            <Icon icon={Code2} size={14} strokeWidth={1.5} />
          {/snippet}
        </Button>
        <Button
          data-tooltip={t("breadcrumb.typstViewer")}
          aria-label={t("breadcrumb.typstViewer")}
          aria-pressed={typstViewerOn}
          disabled={compilingTypst}
          onclick={onToggleTypstViewer}
        >
          {#snippet icon()}
            <Icon icon={FileText} size={14} strokeWidth={1.5} />
          {/snippet}
        </Button>
        <Button
          data-tooltip={t("breadcrumb.typstBuild")}
          aria-label={t("breadcrumb.typstBuild")}
          disabled={exportingTypst}
          onclick={onTypstBuild}
        >
          {#snippet icon()}
            <Icon icon={FileDown} size={13} strokeWidth={1.5} />
          {/snippet}
        </Button>
      </div>
    {/if}

    <!-- AFFICHAGE : barre d'outils, console, opencode, plein écran -->
    <div class="mdv-breadcrumb__display">
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
      {#if onToggleConsole}
        <Button
          data-tooltip={t("breadcrumb.typstConsole")}
          aria-label={t("breadcrumb.typstConsole")}
          aria-pressed={consoleOpen}
          onclick={onToggleConsole}
        >
          {#snippet icon()}
            <Icon icon={PanelBottom} size={14} strokeWidth={1.5} />
          {/snippet}
        </Button>
      {/if}
      {#if onToggleOpencode}
        <Button
          data-tooltip={t("breadcrumb.opencode")}
          aria-label={t("breadcrumb.opencode")}
          aria-pressed={opencodeOpen}
          onclick={onToggleOpencode}
        >
          {#snippet icon()}
            <Icon icon={Terminal} size={14} strokeWidth={1.5} />
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
            <Icon icon={Maximize2} size={14} strokeWidth={1.5} />
          {/snippet}
        </Button>
      {/if}
    </div>

    <!-- SETTINGS : thème, langue, réglages -->
    <div class="mdv-breadcrumb__settings">
      <ThemeButton
        {vimOn}
        {onToggleVim}
        {writingDisplay}
        {onWritingFontSizeChange}
        {onWritingLineHeightChange}
        {onResetWritingDisplay}
      />
      <div class="mdv-lang-wrap" bind:this={langAnchorEl}>
        <button
          type="button"
          class="mdv-lang-trigger"
          data-tooltip={t("title.language")}
          aria-label={t("title.language")}
          aria-haspopup="menu"
          aria-expanded={langMenuOpen}
          onclick={() => langMenuOpen = !langMenuOpen}
        >
          <Icon icon={Globe} size={14} strokeWidth={1.5} />
          <span class="mdv-lang-trigger__code">{$language.toUpperCase()}</span>
        </button>
        <Popover
          open={langMenuOpen}
          onClose={() => langMenuOpen = false}
          anchorRef={{ current: langAnchorEl }}
        >
          <div class="mdv-menu">
            {#each LANGUAGE_CHOICES as choice}
              {@const active = $language === choice.value}
              <button
                type="button"
                class="mdv-menu__item"
                class:is-active={active}
                onclick={() => {
                  setLanguage(choice.value);
                  langMenuOpen = false;
                }}
                role="menuitemradio"
                aria-checked={active}
              >
                <span class="mdv-menu__item-label">{choice.nativeLabel}</span>
                {#if active}
                  <span class="mdv-menu__item-check">
                    <Icon icon={Check} size={13} strokeWidth={2} />
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        </Popover>
      </div>
      {#if onOpenSettings}
        <Button
          data-tooltip={t("breadcrumb.settings")}
          aria-label={t("breadcrumb.settings")}
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

<style>
  .mdv-pres-menu {
    min-width: 130px;
  }

  .mdv-pres-menu__label {
    margin: 0;
    padding: 3px 10px 1px;
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .mdv-pres-menu__sep {
    height: 1px;
    background: var(--border);
    margin: 3px 0;
  }

  .mdv-pres-menu__radio {
    cursor: pointer;
  }

  .mdv-pres-menu__radio input[type="radio"] {
    accent-color: var(--accent);
    cursor: pointer;
    width: 13px;
    height: 13px;
    flex-shrink: 0;
  }

  .mdv-lang-wrap {
    position: relative;
  }

  .mdv-lang-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 5px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    transition:
      background var(--dur-fast) var(--easing),
      color var(--dur-fast) var(--easing);
  }

  .mdv-lang-trigger:hover {
    background: var(--surface-hover);
    color: var(--fg);
  }

  .mdv-lang-trigger:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }

  .mdv-lang-trigger__code {
    line-height: 1;
  }
</style>
