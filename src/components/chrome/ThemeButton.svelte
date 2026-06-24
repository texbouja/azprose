<script lang="ts">
  import {
    Check,
    ChevronRight,
    Circle,
    Cloud,
    Coffee,
    Flower2,
    Leaf,
    Monitor,
    Moon,
    RotateCcw,
    Sparkles,
    Sun,
    Sunset,
    Terminal,
    Waves,
  } from "lucide-svelte";
  import type { Component } from "svelte";
  import { Button, Icon, Popover } from "@/components/primitives";
  import { language, getT, setLanguage, LANGUAGE_CHOICES } from "@/lib/i18n";
  import {
    THEME_GROUPS,
    getSystemTheme,
    previewTheme,
    WRITING_FONT_SIZE_OPTIONS,
    WRITING_LINE_HEIGHT_OPTIONS,
  } from "@/lib";
  import type { Theme, ThemeMode, WritingDisplay, WritingFontSize, WritingLineHeight } from "@/lib";
  import { theme } from "@/stores/theme.svelte";
  import type { Language } from "@/lib/i18n";

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

  const THEME_ICONS: Record<string, Component<any>> = {
    system: Monitor,
    latte: Sun,
    mono: Circle,
    "mono-dark": Circle,
    matcha: Leaf,
    frappe: Cloud,
    macchiato: Coffee,
    mocha: Moon,
    kanagawa: Waves,
    "rose-pine": Flower2,
    ayu: Sunset,
    claude: Sparkles,
    codex: Terminal,
    gemini: Sparkles,
    cursor: Terminal,
  };

  let menuOpen = $state(false);
  let displayControlsOpen = $state(false);
  let openThemeGroups = $state(new Set<string>());
  let anchorEl: HTMLDivElement | null = null;
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;

  let activeThemeGroup = $derived(
    THEME_GROUPS.find((group) =>
      group.choices.some((choice) => choice.value === theme.mode),
    )?.label,
  );

  let ActiveIcon = $derived(
    theme.mode === "system" ? Monitor : THEME_ICONS[theme.resolved] ?? Sun,
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
      <Icon icon={ActiveIcon} size={14} strokeWidth={1.5} />
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
                    <Icon icon={THEME_ICONS[c.value]} size={14} strokeWidth={1.5} />
                  </span>
                  <span class="mdv-menu__item-label">{c.label}</span>
                  {#if active}
                    <span class="mdv-menu__item-check">
                      <Icon icon={Check} size={13} strokeWidth={2} />
                    </span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        </section>
      {/each}
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
      <div class="mdv-menu__divider" aria-hidden />
      <label class="mdv-menu__select-row">
        <span class="mdv-menu__select-label">{t("title.language")}</span>
        <select
          class="mdv-menu__select"
          value={$language}
          onchange={(e) => setLanguage((e.target as HTMLSelectElement).value as Language)}
          aria-label={t("title.language")}
        >
          {#each LANGUAGE_CHOICES as choice}
            <option value={choice.value}>
              {choice.nativeLabel}
            </option>
          {/each}
        </select>
      </label>
    </div>
  </Popover>
</div>
