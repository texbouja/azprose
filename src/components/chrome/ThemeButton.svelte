<script lang="ts">
  import {
    Check,
    ChevronRight,
    Monitor,
    Moon,
    Palette,
    RotateCcw,
    Sparkles,
    Sun,
    Terminal,
    Trash2,
  } from "@/lib/icons";
  import type { IconData } from "@/lib/icons";
  import { Button, Icon, Popover } from "@/components/primitives";
  import { language, getT } from "@/lib/i18n";
  import {
    THEME_GROUPS,
    PREINSTALLED_ADDONS,
    getSystemTheme,
    previewTheme,
    WRITING_FONT_SIZE_OPTIONS,
    WRITING_LINE_HEIGHT_OPTIONS,
  } from "@/lib";
  import type { Theme, ThemeMode, WritingDisplay, WritingFontSize, WritingLineHeight } from "@/lib";
  import {
    listCustomThemes,
    installCustomTheme,
    injectThemeCSS,
    deleteCustomTheme,
    removeThemeCSS,
    type CustomThemeEntry,
  } from "@/lib/custom-themes";
  import { getAvailableThemes, generateThemeCSS, type ShikiThemeInfo } from "@/lib/theme-generator";
  import { onMount } from "svelte";
  import { theme } from "@/stores/theme.svelte";

  let {
    vimOn = false,
    onToggleVim,
    writingDisplay,
    onWritingFontSizeChange,
    onWritingLineHeightChange,
    onResetWritingDisplay,
  }: {
    vimOn?: boolean;
    onToggleVim?: () => void;
    writingDisplay: WritingDisplay;
    onWritingFontSizeChange: (value: WritingFontSize) => void;
    onWritingLineHeightChange: (value: WritingLineHeight) => void;
    onResetWritingDisplay: () => void;
  } = $props();

  let t = $derived(getT($language));

  const THEME_ICONS: Record<string, IconData> = {
    system: Monitor,
    latte: Sun,
    mono: Sun,
    "mono-dark": Moon,
    frappe: Moon,
    macchiato: Moon,
    mocha: Moon,
    "gruvbox-dark-hard":   Moon,
    "gruvbox-dark-medium": Moon,
    "gruvbox-dark-soft":   Moon,
    "gruvbox-light-hard":  Sun,
    "gruvbox-light-medium":Sun,
    "gruvbox-light-soft":  Sun,
  };

  let menuOpen = $state(false);
  let displayControlsOpen = $state(false);
  let openThemeGroups = $state(new Set<string>());
  let anchorEl: HTMLDivElement | null = null;
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let customThemes = $state<CustomThemeEntry[]>([]);
  let addThemeOpen = $state(false);
  let availableThemes = $state<ShikiThemeInfo[]>([]);
  let themeSearch = $state("");

  onMount(() => {
    listCustomThemes().then((t) => { customThemes = t; });
  });

  let filteredThemes = $derived(
    themeSearch
      ? availableThemes.filter((t) =>
          t.displayName.toLowerCase().includes(themeSearch.toLowerCase()) ||
          t.id.toLowerCase().includes(themeSearch.toLowerCase())
        )
      : availableThemes,
  );

  let allCraftedThemes = $derived.by(() => {
    const names = new Set<string>();
    const items: { name: string; label: string; isPreinstalled: boolean }[] = [];
    for (const a of PREINSTALLED_ADDONS) {
      names.add(a.name);
      items.push({ name: a.name, label: a.label, isPreinstalled: true });
    }
    for (const ct of customThemes) {
      if (!names.has(ct.name)) {
        items.push({ name: ct.name, label: ct.name, isPreinstalled: false });
      }
    }
    return items;
  });

  function themeIcon(value: string): IconData {
    if (value === "system") return Monitor;
    const icon = THEME_ICONS[value];
    if (icon) return icon;
    if (PREINSTALLED_ADDONS.some((a) => a.name === value)) {
      const info = PREINSTALLED_ADDONS.find((a) => a.name === value)!;
      return info.type === "light" ? Sun : Moon;
    }
    const info = availableThemes.find((t) => t.id === value);
    if (info) return info.type === "light" ? Sun : Moon;
    return Moon;
  }

  function openAddTheme() {
    availableThemes = getAvailableThemes();
    themeSearch = "";
    addThemeOpen = true;
  }

  async function handleAddTheme(id: string) {
    try {
      const css = await generateThemeCSS(id);
      await installCustomTheme(id, css);
      injectThemeCSS(id, css);
      customThemes = await listCustomThemes();
      theme.setMode(id);
    } catch (err) {
      console.error("azprose: failed to install theme", err);
    }
    addThemeOpen = false;
  }

  async function handleRemoveTheme(name: string) {
    removeThemeCSS(name);
    await deleteCustomTheme(name);
    customThemes = await listCustomThemes();
    if (theme.mode === name) {
      theme.setMode("latte");
    }
  }

  let activeThemeGroup = $derived(
    THEME_GROUPS.find((group) =>
      group.choices.some((choice) => choice.value === theme.mode),
    )?.label,
  );

  function resolveThemeForPreview(value: ThemeMode): Theme {
    return value === "system" ? getSystemTheme() : value;
  }

  function previewOnHover(value: ThemeMode) {
    if (hoverTimer !== null) window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => {
      previewTheme(resolveThemeForPreview(value));
      hoverTimer = null;
    }, 60);
  }

  function cancelHoverTimer() {
    if (hoverTimer !== null) {
      window.clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  function cancelPreview() {
    cancelHoverTimer();
    previewTheme(null);
  }

  function closeMenu() {
    cancelPreview();
    menuOpen = false;
  }

  function toggleThemeGroup(label: string) {
    const next = new Set(openThemeGroups);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    openThemeGroups = next;
  }
</script>

<div class="mdv-titlebar__theme" bind:this={anchorEl}>
  <Button
    data-tooltip={t("title.themeTooltip")}
    aria-label={t("title.theme")}
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    onclick={() => menuOpen = !menuOpen}
  >
    {#snippet icon()}
      <Icon icon={Palette} size={14} strokeWidth={1.5} />
    {/snippet}
  </Button>
  <Popover
    open={menuOpen}
    onClose={closeMenu}
    anchorRef={{ current: anchorEl }}
  >
    <div class="mdv-menu mdv-menu--theme" onmouseleave={cancelPreview}>
      {#each THEME_GROUPS as group}
        {@const expanded = openThemeGroups.has(group.label)}
        <section
          class="mdv-menu__group"
          class:is-open={expanded}
        >
          <button
            type="button"
            class="mdv-menu__group-trigger"
            onclick={() => toggleThemeGroup(group.label)}
            aria-expanded={expanded}
          >
            <span>{t(`theme.group.${group.label}`)}</span>
            <Icon icon={ChevronRight} size={13} strokeWidth={1.7} />
          </button>
          <div class="mdv-menu__group-body">
            <div class="mdv-menu__group-inner">
              {#each group.choices as c}
                {@const active = theme.mode === c.value}
                <button
                  type="button"
                  class="mdv-menu__item"
                  class:is-active={active}
                  onmouseenter={() => previewOnHover(c.value)}
                  onmouseleave={cancelHoverTimer}
                  onfocus={() => previewOnHover(c.value)}
                  onblur={cancelHoverTimer}
                  onclick={() => {
                    cancelPreview();
                    theme.setMode(c.value);
                    menuOpen = false;
                  }}
                  role="menuitemradio"
                  aria-checked={active}
                >
                  <span class="mdv-menu__item-icon">
                    <Icon icon={THEME_ICONS[c.value] || Palette} size={14} strokeWidth={1.5} />
                  </span>
                  <span class="mdv-menu__item-label">{c.label}</span>
                  {#if active}
                    <span class="mdv-menu__item-check">
                      <Icon icon={Check} size={13} strokeWidth={2} />
                    </span>
                  {/if}
                </button>
              {/each}
              {#if group.label === "crafted"}
                {#each allCraftedThemes as item}
                  {@const active = theme.mode === item.name}
                  <button
                    type="button"
                    class="mdv-menu__item"
                    class:is-active={active}
                    onmouseenter={() => previewOnHover(item.name)}
                    onmouseleave={cancelHoverTimer}
                    onfocus={() => previewOnHover(item.name)}
                    onblur={cancelHoverTimer}
                    onclick={() => {
                      cancelPreview();
                      theme.setMode(item.name);
                      menuOpen = false;
                    }}
                    role="menuitemradio"
                    aria-checked={active}
                  >
                    <span class="mdv-menu__item-icon">
                      <Icon icon={themeIcon(item.name)} size={14} strokeWidth={1.5} />
                    </span>
                    <span class="mdv-menu__item-label">{item.label}</span>
                    {#if active}
                      <span class="mdv-menu__item-check">
                        <Icon icon={Check} size={13} strokeWidth={2} />
                      </span>
                    {/if}
                    {#if !item.isPreinstalled}
                      <button
                        type="button"
                        class="mdv-menu__item-action"
                        onclick={(e) => { e.stopPropagation(); handleRemoveTheme(item.name); }}
                        aria-label={t("theme.removeTheme")}
                      >
                        <Icon icon={Trash2} size={12} strokeWidth={1.5} />
                      </button>
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
          </div>
        </section>
      {/each}
      <section class="mdv-menu__group">
        <button
          type="button"
          class="mdv-menu__group-trigger"
          onclick={openAddTheme}
        >
          <span>{t("theme.addTheme")}</span>
          <Icon icon={ChevronRight} size={13} strokeWidth={1.7} />
        </button>
      </section>
      {#if addThemeOpen}
        <div class="mdv-theme-picker">
          <div class="mdv-theme-picker__header">
            <input
              type="text"
              class="mdv-theme-picker__search"
              placeholder={t("theme.searchShiki")}
              bind:value={themeSearch}
              spellcheck={false}
              autofocus
            />
          </div>
          <div class="mdv-theme-picker__list">
            {#each filteredThemes as t}
              <button
                type="button"
                class="mdv-theme-picker__item"
                onclick={() => handleAddTheme(t.id)}
              >
                <span class="mdv-theme-picker__name">{t.displayName}</span>
                <span class="mdv-theme-picker__type">{t.type}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
      <div class="mdv-menu__divider" aria-hidden />
      <section
        class="mdv-menu__group"
        class:is-open={displayControlsOpen}
      >
        <div class="mdv-menu__settings-trigger">
          <button
            type="button"
            class="mdv-menu__settings-toggle"
            onclick={() => displayControlsOpen = !displayControlsOpen}
            aria-expanded={displayControlsOpen}
          >
            <span>{t("title.display")}</span>
            <span class="mdv-menu__settings-summary">
              {theme.opacity >= 100 ? t("title.off") : `${100 - theme.opacity}%`} /{" "}
              {t(`writing.font.${writingDisplay.fontSize}`)} /{" "}
              {t(`writing.spacing.${writingDisplay.lineHeight}`)}
            </span>
            <Icon icon={ChevronRight} size={13} strokeWidth={1.7} />
          </button>
        </div>
        <div class="mdv-menu__group-body">
          <div class="mdv-menu__group-inner">
            <div
              class="mdv-menu__slider"
              class:is-active={theme.transparent}
            >
              <span class="mdv-menu__slider-icon" aria-hidden>
                <Icon icon={Sparkles} size={14} strokeWidth={1.5} />
              </span>
              <span class="mdv-menu__slider-label">{t("title.transparency")}</span>
              <span class="mdv-menu__slider-value" aria-hidden>
                {theme.opacity >= 100 ? t("title.off") : `${100 - theme.opacity}%`}
              </span>
              <input
                type="range"
                class="mdv-menu__slider-input"
                min={0}
                max={100}
                step={1}
                value={100 - theme.opacity}
                oninput={(e) => theme.setTransparency(100 - Number((e.target as HTMLInputElement).value))}
                aria-label={t("title.transparency")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={100 - theme.opacity}
                aria-valuetext={t("title.percentTransparent", { percent: 100 - theme.opacity })}
              />
            </div>

            <div class="mdv-menu__choice-slider">
              <span class="mdv-menu__choice-label">{t("title.writingFont")}</span>
              <span class="mdv-menu__choice-value" aria-hidden>
                {t(`writing.font.${writingDisplay.fontSize}`)}
              </span>
              <input
                type="range"
                class="mdv-menu__choice-input"
                min={0}
                max={WRITING_FONT_SIZE_OPTIONS.length - 1}
                step={1}
                value={WRITING_FONT_SIZE_OPTIONS.indexOf(writingDisplay.fontSize)}
                oninput={(e) => onWritingFontSizeChange(WRITING_FONT_SIZE_OPTIONS[Number((e.target as HTMLInputElement).value)] ?? writingDisplay.fontSize)}
                aria-label={t("title.writingFont")}
                aria-valuemin={0}
                aria-valuemax={WRITING_FONT_SIZE_OPTIONS.length - 1}
                aria-valuenow={WRITING_FONT_SIZE_OPTIONS.indexOf(writingDisplay.fontSize)}
                aria-valuetext={t(`writing.font.${writingDisplay.fontSize}`)}
              />
            </div>

            <div class="mdv-menu__choice-slider">
              <span class="mdv-menu__choice-label">{t("title.writingSpacing")}</span>
              <span class="mdv-menu__choice-value" aria-hidden>
                {t(`writing.spacing.${writingDisplay.lineHeight}`)}
              </span>
              <input
                type="range"
                class="mdv-menu__choice-input"
                min={0}
                max={WRITING_LINE_HEIGHT_OPTIONS.length - 1}
                step={1}
                value={WRITING_LINE_HEIGHT_OPTIONS.indexOf(writingDisplay.lineHeight)}
                oninput={(e) => onWritingLineHeightChange(WRITING_LINE_HEIGHT_OPTIONS[Number((e.target as HTMLInputElement).value)] ?? writingDisplay.lineHeight)}
                aria-label={t("title.writingSpacing")}
                aria-valuemin={0}
                aria-valuemax={WRITING_LINE_HEIGHT_OPTIONS.length - 1}
                aria-valuenow={WRITING_LINE_HEIGHT_OPTIONS.indexOf(writingDisplay.lineHeight)}
                aria-valuetext={t(`writing.spacing.${writingDisplay.lineHeight}`)}
              />
            </div>

            <button
              type="button"
              class="mdv-menu__reset-row"
              onclick={onResetWritingDisplay}
            >
              <Icon icon={RotateCcw} size={13} strokeWidth={1.6} />
              <span>{t("title.resetWriting")}</span>
            </button>
          </div>
        </div>
      </section>
      {#if onToggleVim}
        <div class="mdv-menu__divider" aria-hidden />
        <div class="mdv-menu__label">{t("title.editor")}</div>
        <button
          type="button"
          class="mdv-menu__item"
          class:is-active={vimOn}
          onclick={onToggleVim}
          role="menuitemcheckbox"
          aria-checked={vimOn}
        >
          <span class="mdv-menu__item-icon">
            <Icon icon={Terminal} size={14} strokeWidth={1.5} />
          </span>
          <span class="mdv-menu__item-label">{t("title.vimMode")}</span>
          <span class="mdv-menu__switch" class:is-on={vimOn} aria-hidden />
        </button>
      {/if}
    </div>
  </Popover>
</div>

<style>
.mdv-theme-picker {
  position: absolute;
  inset: 0;
  background: var(--mdv-bg, var(--bg));
  display: flex;
  flex-direction: column;
  z-index: 10;
}
.mdv-theme-picker__header {
  padding: 8px;
  border-bottom: 1px solid var(--mdv-border, var(--border));
}
.mdv-theme-picker__search {
  width: 100%;
  padding: 6px 8px;
  font-size: 12px;
  background: var(--mdv-bg-hover, var(--surface-hover));
  border: 1px solid var(--mdv-border, var(--border));
  border-radius: 4px;
  color: var(--mdv-fg, var(--fg));
  outline: none;
}
.mdv-theme-picker__search:focus {
  border-color: var(--mdv-accent, var(--accent));
}
.mdv-theme-picker__list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}
.mdv-theme-picker__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 8px;
  font-size: 12px;
  background: none;
  border: none;
  color: var(--mdv-fg, var(--fg));
  cursor: pointer;
  border-radius: 4px;
  text-align: left;
}
.mdv-theme-picker__item:hover {
  background: var(--mdv-bg-hover, var(--surface-hover));
}
.mdv-theme-picker__type {
  font-size: 10px;
  opacity: 0.6;
  text-transform: uppercase;
}
.mdv-menu__item-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  margin-left: auto;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
}
.mdv-menu__item-action:hover {
  background: var(--surface-hover);
  color: var(--color-error);
}
</style>
