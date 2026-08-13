<script lang="ts">
  import { Button, Popover } from "@/components/primitives";
  import { language, getT } from "@/lib/i18n";
  import {
    THEME_GROUPS,
    getSystemTheme,
    previewTheme,
  } from "@/lib";
  import type { Theme, ThemeMode } from "@/lib";
  import {
    FONT_SIZE_OPTIONS,
    LINE_HEIGHT_OPTIONS,
    PROSE_FONT_PRESETS,
    CODE_FONT_PRESETS,
    type TypographySettings,
    type FontSize,
    type LineHeight,
    type TextAlign,
  } from "@/lib/typography";
  import { theme } from "@/stores/theme.svelte";

  let {
    vimOn = false,
    onToggleVim,
    typography,
    onTypographyChange,
    onResetTypography,
  }: {
    vimOn?: boolean;
    onToggleVim?: () => void;
    typography: TypographySettings;
    onTypographyChange: (patch: Partial<TypographySettings>) => void;
    onResetTypography: () => void;
  } = $props();

  let t = $derived(getT($language));

  const THEME_ICONS: Record<string, string> = {
    system: "wxi-monitor",
    latte: "wxi-sun",
    frappe: "wxi-moon",
    macchiato: "wxi-moon",
    mocha: "wxi-moon",
    "skarline-fleet-dark":   "wxi-moon",
    "skarline-fleet-purple": "wxi-moon",
    "skarline-fleet-light":  "wxi-sun",
    "skarline-xcode-dark":   "wxi-moon",
    "skarline-xcode-light":  "wxi-sun",
  };

  let menuOpen = $state(false);
  let displayControlsOpen = $state(false);
  let openThemeGroups = $state(new Set<string>());
  let anchorEl = $state<HTMLDivElement | null>(null);
  let hoverTimer: number | null = null;

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

{#snippet choiceSlider(label: string, options: readonly string[], current: string, valueLabel: (v: string) => string, onPick: (v: string) => void)}
  <div class="mdv-menu__choice-slider">
    <span class="mdv-menu__choice-label">{label}</span>
    <span class="mdv-menu__choice-value" aria-hidden="true">{valueLabel(current)}</span>
    <input
      type="range"
      class="mdv-menu__choice-input"
      min={0}
      max={options.length - 1}
      step={1}
      value={options.indexOf(current)}
      oninput={(e) => onPick(options[Number((e.currentTarget as HTMLInputElement).value)] ?? current)}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={options.length - 1}
      aria-valuenow={options.indexOf(current)}
      aria-valuetext={valueLabel(current)}
    />
  </div>
{/snippet}

{#snippet fontField(id: string, label: string, presets: { id: string; label: string; value: string }[], current: string, onPick: (v: string) => void)}
  <label class="mdv-menu__field">
    <span class="mdv-menu__choice-label">{label}</span>
    <input
      class="mdv-menu__text"
      list={"fonts-" + id}
      value={current}
      placeholder={presets[0]?.label ?? "default"}
      oninput={(e) => onPick((e.currentTarget as HTMLInputElement).value)}
    />
    <datalist id={"fonts-" + id}>
      {#each presets as p}
        {#if p.value}<option value={p.value} label={p.label}></option>{/if}
      {/each}
    </datalist>
  </label>
{/snippet}

<div class="mdv-titlebar__theme" bind:this={anchorEl}>
  <Button
    data-tooltip={t("title.themeTooltip")}
    aria-label={t("title.theme")}
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    onclick={() => menuOpen = !menuOpen}
  >
    {#snippet icon()}
      <i class="wxi-palette" style="font-size:14px"></i>
    {/snippet}
  </Button>
  <Popover
    open={menuOpen}
    onClose={closeMenu}
    anchorRef={{ current: anchorEl }}
  >
    <div class="mdv-menu mdv-menu--theme" role="menu" tabindex="-1" onmouseleave={cancelPreview}>
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
            <i class="wxi-chevron-right" style="font-size:13px"></i>
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
                    <i class={THEME_ICONS[c.value] || 'wxi-palette'} style="font-size:14px"></i>
                  </span>
                  <span class="mdv-menu__item-label">{c.label}</span>
                  {#if active}
                    <span class="mdv-menu__item-check">
                      <i class="wxi-check" style="font-size:13px"></i>
                    </span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        </section>
      {/each}
      <div class="mdv-menu__divider" aria-hidden="true"></div>
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
              {t(`writing.font.${typography.markdownFontSize}`)}
            </span>
            <i class="wxi-chevron-right" style="font-size:13px"></i>
          </button>
        </div>
        <div class="mdv-menu__group-body">
          <div class="mdv-menu__group-inner">
            <div
              class="mdv-menu__slider"
              class:is-active={theme.transparent}
            >
              <span class="mdv-menu__slider-icon" aria-hidden="true">
                <i class="wxi-sparkles" style="font-size:14px"></i>
              </span>
              <span class="mdv-menu__slider-label">{t("title.transparency")}</span>
              <span class="mdv-menu__slider-value" aria-hidden="true">
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

            <!-- Markdown group: rendered prose (ProseMark) + Preview -->
            <div class="mdv-menu__subhead">{t("typo.markdown")}</div>
            {@render fontField("prose", t("typo.font"), PROSE_FONT_PRESETS, typography.markdownFont, (v) => onTypographyChange({ markdownFont: v }))}
            {@render choiceSlider(t("typo.size"), FONT_SIZE_OPTIONS, typography.markdownFontSize, (v) => t(`writing.font.${v}`), (v) => onTypographyChange({ markdownFontSize: v as FontSize }))}
            {@render choiceSlider(t("typo.lineHeight"), LINE_HEIGHT_OPTIONS, typography.markdownLineHeight, (v) => t(`writing.spacing.${v}`), (v) => onTypographyChange({ markdownLineHeight: v as LineHeight }))}
            <div class="mdv-menu__seg">
              <span class="mdv-menu__choice-label">{t("typo.align")}</span>
              <div class="mdv-menu__seg-buttons">
                {#each [["left", t("typo.alignLeft")], ["justify", t("typo.alignJustify")]] as [val, lbl]}
                  <button
                    type="button"
                    class="mdv-menu__seg-btn"
                    class:is-on={typography.markdownAlign === val}
                    onclick={() => onTypographyChange({ markdownAlign: val as TextAlign })}
                  >{lbl}</button>
                {/each}
              </div>
            </div>

            <!-- Code / plain-text group: source editor (all raw text formats) -->
            <div class="mdv-menu__subhead">{t("typo.code")}</div>
            {@render fontField("code", t("typo.font"), CODE_FONT_PRESETS, typography.codeFont, (v) => onTypographyChange({ codeFont: v }))}
            {@render choiceSlider(t("typo.size"), FONT_SIZE_OPTIONS, typography.codeFontSize, (v) => t(`writing.font.${v}`), (v) => onTypographyChange({ codeFontSize: v as FontSize }))}
            {@render choiceSlider(t("typo.lineHeight"), LINE_HEIGHT_OPTIONS, typography.codeLineHeight, (v) => t(`writing.spacing.${v}`), (v) => onTypographyChange({ codeLineHeight: v as LineHeight }))}
            <button
              type="button"
              class="mdv-menu__item mdv-menu__toggle-row"
              class:is-active={typography.codeLineNumbers}
              role="menuitemcheckbox"
              aria-checked={typography.codeLineNumbers}
              onclick={() => onTypographyChange({ codeLineNumbers: !typography.codeLineNumbers })}
            >
              <span class="mdv-menu__item-label">{t("typo.lineNumbers")}</span>
              <span class="mdv-menu__switch" class:is-on={typography.codeLineNumbers} aria-hidden="true"></span>
            </button>

            <button
              type="button"
              class="mdv-menu__reset-row"
              onclick={onResetTypography}
            >
              <i class="wxi-rotate-ccw" style="font-size:13px"></i>
              <span>{t("typo.reset")}</span>
            </button>
          </div>
        </div>
      </section>
      {#if onToggleVim}
        <div class="mdv-menu__divider" aria-hidden="true"></div>
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
            <i class="wxi-terminal" style="font-size:14px"></i>
          </span>
          <span class="mdv-menu__item-label">{t("title.vimMode")}</span>
          <span class="mdv-menu__switch" class:is-on={vimOn} aria-hidden="true"></span>
        </button>
      {/if}
    </div>
  </Popover>
</div>

