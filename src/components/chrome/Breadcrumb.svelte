<script lang="ts">
  import {
    Check,
    ChevronRight,
    Columns2,

    Globe,
    Maximize2,
    PanelBottom,
    PanelLeftClose,
    PanelLeftOpen,
    PanelTopClose,
    PanelTopOpen,
    Settings,
    Terminal,
  } from "@/lib/icons";
  import { Button, Icon, Popover } from "@/components/primitives";
  import { language, getT, setLanguage, LANGUAGE_CHOICES } from "@/lib/i18n";
  import { shortcutLabel } from "@/lib";
  import type { TypographySettings } from "@/lib/typography";
  import ThemeButton from "./ThemeButton.svelte";
  import exciteUrl from "@/assets/mascot/az-excite.svg";

  let {
    sidebarOpen,
    onToggleSidebar,
    opencodeOpen,
    onToggleOpencode,
    rootPath,
    activePath,
    saveStatus,
    titlebarVisible,
    onToggleTitlebar,
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
  }: {
    sidebarOpen: boolean;
    onToggleSidebar: () => void;
    opencodeOpen?: boolean;
    onToggleOpencode?: () => void;
    rootPath: string | null;
    activePath: string | null;
    saveStatus: "idle" | "dirty" | "saving" | "saved";
    titlebarVisible: boolean;
    onToggleTitlebar: () => void;
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
  } = $props();

  let t = $derived(getT($language));

  let langMenuOpen = $state(false);
  let langAnchorEl: HTMLDivElement | null = null;

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
      {#if onToggleViewPanel}
        <Button
          data-tooltip={t("breadcrumb.toggleViewPanel")}
          aria-label={t("breadcrumb.toggleViewPanel")}
          aria-pressed={viewPanelOpen}
          onclick={onToggleViewPanel}
        >
          {#snippet icon()}
            <Icon icon={Columns2} size={14} strokeWidth={1.5} />
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
        {typography}
        {onTypographyChange}
        {onResetTypography}
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
