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
    X,
  } from "@/lib/icons";
  import type { IconData } from "@/lib/icons";
  import { Button, Icon, Popover } from "@/components/primitives";
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
  import {
    listCustomThemes,
    installCustomTheme,
    injectThemeCSS,
    deleteCustomTheme,
    removeThemeCSS,
    type CustomThemeEntry,
  } from "@/lib/custom-themes";
  import { tokensToCSS, type CatalogTheme } from "@/lib/theme-css";
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

  const THEME_ICONS: Record<string, IconData> = {
    system: Monitor,
    latte: Sun,
    mono: Sun,
    "mono-dark": Moon,
    frappe: Moon,
    macchiato: Moon,
    mocha: Moon,
    "skarline-fleet-dark":   Moon,
    "skarline-fleet-purple": Moon,
    "skarline-fleet-light":  Sun,
    "skarline-xcode-dark":   Moon,
    "skarline-xcode-light":  Sun,
  };

  let menuOpen = $state(false);
  let displayControlsOpen = $state(false);
  let openThemeGroups = $state(new Set<string>());
  let anchorEl = $state<HTMLDivElement | null>(null);
  let hoverTimer: number | null = null;
  let customThemes = $state<CustomThemeEntry[]>([]);
  let addThemeOpen = $state(false);
  let availableThemes = $state<CatalogTheme[]>([]);
  let themeSearch = $state("");

  // Crafted themes live in the current project's .azprose/themes/. Re-list whenever the
  // project root changes (e.g. main window opens its first folder).
  $effect(() => {
    const root = theme.projectRoot;
    listCustomThemes(root).then((t) => { customThemes = t; });
  });

  let filteredThemes = $derived(
    themeSearch
      ? availableThemes.filter((t) =>
          t.displayName.toLowerCase().includes(themeSearch.toLowerCase()) ||
          t.id.toLowerCase().includes(themeSearch.toLowerCase())
        )
      : availableThemes,
  );

  // Crafted = only user-added themes. None are persistent; all are removable.
  let allCraftedThemes = $derived(customThemes.map((ct) => ({ name: ct.name, label: ct.name })));

  function themeIcon(value: string): IconData {
    if (value === "system") return Monitor;
    const icon = THEME_ICONS[value];
    if (icon) return icon;
    const info = availableThemes.find((t) => t.id === value);
    if (info) return info.type === "light" ? Sun : Moon;
    return Moon;
  }

  async function openAddTheme() {
    // Lazy-load the static curated catalog (no Shiki at runtime).
    if (availableThemes.length === 0) {
      const mod = await import("@/lib/crafted-catalog.json");
      availableThemes = (mod.default ?? mod) as unknown as CatalogTheme[];
    }
    themeSearch = "";
    addThemeOpen = true;
  }

  async function handleAddTheme(item: CatalogTheme) {
    const root = theme.projectRoot;
    if (!root) return; // crafted themes require an open project (vault model)
    try {
      const css = tokensToCSS(item.id, item.type, item.tokens);
      await installCustomTheme(root, item.id, css);
      injectThemeCSS(item.id, css);
      customThemes = await listCustomThemes(root);
      theme.setMode(item.id);
    } catch (err) {
      console.error("azprose: failed to install theme", err);
    }
    addThemeOpen = false;
  }

  async function handleRemoveTheme(name: string) {
    const root = theme.projectRoot;
    removeThemeCSS(name);
    if (root) await deleteCustomTheme(root, name);
    customThemes = await listCustomThemes(root);
    if (theme.mode === name) {
      theme.setMode("latte");
    }
  }

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
    addThemeOpen = false;
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
      <Icon icon={Palette} size={14} strokeWidth={1.5} />
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
                  <!-- A crafted row holds an inner trash <button>, so the row itself is a
                       div (a button can't contain a button) with keyboard activation. -->
                  <div
                    class="mdv-menu__item"
                    class:is-active={active}
                    role="menuitemradio"
                    aria-checked={active}
                    tabindex="0"
                    onmouseenter={() => previewOnHover(item.name)}
                    onmouseleave={cancelHoverTimer}
                    onfocus={() => previewOnHover(item.name)}
                    onblur={cancelHoverTimer}
                    onclick={() => {
                      cancelPreview();
                      theme.setMode(item.name);
                      menuOpen = false;
                    }}
                    onkeydown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        cancelPreview();
                        theme.setMode(item.name);
                        menuOpen = false;
                      }
                    }}
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
                    <button
                      type="button"
                      class="mdv-menu__item-action"
                      onclick={(e) => { e.stopPropagation(); handleRemoveTheme(item.name); }}
                      aria-label={t("theme.removeTheme")}
                    >
                      <Icon icon={Trash2} size={12} strokeWidth={1.5} />
                    </button>
                  </div>
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
            <button
              type="button"
              class="mdv-theme-picker__back"
              aria-label={t("app.close")}
              onclick={() => (addThemeOpen = false)}
            >
              <Icon icon={X} size={14} strokeWidth={1.8} />
            </button>
            <!-- svelte-ignore a11y_autofocus -->
            <input
              type="text"
              class="mdv-theme-picker__search"
              placeholder={t("theme.searchShiki")}
              bind:value={themeSearch}
              spellcheck={false}
              autofocus
              onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); addThemeOpen = false; } }}
            />
          </div>
          <div class="mdv-theme-picker__grid">
            {#each filteredThemes as t (t.id)}
              <button
                type="button"
                class="mdv-theme-card"
                onclick={() => handleAddTheme(t)}
                title={t.displayName}
                style="--c-bg:{t.tokens.bg}; --c-fg:{t.tokens.fg}; --c-surface:{t.tokens.surface}; --c-border:{t.tokens.border}; --c-accent:{t.tokens.accent}; --c-muted:{t.tokens.muted};"
              >
                <span class="mdv-theme-card__preview">
                  <span class="mdv-theme-card__bar"></span>
                  <span class="mdv-theme-card__line"></span>
                  <span class="mdv-theme-card__line mdv-theme-card__line--short"></span>
                  <span class="mdv-theme-card__chips">
                    <span style="background:{t.tokens.syntax['--syntax-keyword'] ?? t.tokens.accent}"></span>
                    <span style="background:{t.tokens.syntax['--syntax-string'] ?? t.tokens.fg}"></span>
                    <span style="background:{t.tokens.syntax['--syntax-function'] ?? t.tokens.accent}"></span>
                    <span class="mdv-theme-card__accent"></span>
                  </span>
                </span>
                <span class="mdv-theme-card__name">{t.displayName}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
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
            <Icon icon={ChevronRight} size={13} strokeWidth={1.7} />
          </button>
        </div>
        <div class="mdv-menu__group-body">
          <div class="mdv-menu__group-inner">
            <div
              class="mdv-menu__slider"
              class:is-active={theme.transparent}
            >
              <span class="mdv-menu__slider-icon" aria-hidden="true">
                <Icon icon={Sparkles} size={14} strokeWidth={1.5} />
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
              <Icon icon={RotateCcw} size={13} strokeWidth={1.6} />
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
            <Icon icon={Terminal} size={14} strokeWidth={1.5} />
          </span>
          <span class="mdv-menu__item-label">{t("title.vimMode")}</span>
          <span class="mdv-menu__switch" class:is-on={vimOn} aria-hidden="true"></span>
        </button>
      {/if}
    </div>
  </Popover>
</div>

<style>
.mdv-theme-picker {
  position: absolute;
  inset: 0;
  background: var(--bg, var(--bg));
  display: flex;
  flex-direction: column;
  z-index: 10;
}
.mdv-theme-picker__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--border, var(--border));
}
.mdv-theme-picker__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.mdv-theme-picker__back:hover {
  background: var(--surface-hover);
  color: var(--fg);
}
.mdv-theme-picker__search {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  font-size: 12px;
  background: var(--bg-hover, var(--surface-hover));
  border: 1px solid var(--border, var(--border));
  border-radius: 4px;
  color: var(--fg, var(--fg));
  outline: none;
}
.mdv-theme-picker__search:focus {
  border-color: var(--accent, var(--accent));
}
.mdv-theme-picker__grid {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
  align-content: start;
}
.mdv-theme-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}
/* HTML render preview built from the theme's own derived tokens */
.mdv-theme-card__preview {
  display: block;
  height: 54px;
  padding: 6px;
  border-radius: 6px;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  overflow: hidden;
  transition: transform var(--dur-fast, 0.1s), box-shadow var(--dur-fast, 0.1s);
}
.mdv-theme-card:hover .mdv-theme-card__preview {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.mdv-theme-card__bar {
  display: block;
  height: 8px;
  margin: -6px -6px 6px;
  background: var(--c-surface);
  border-bottom: 1px solid var(--c-border);
}
.mdv-theme-card__line {
  display: block;
  height: 4px;
  border-radius: 2px;
  background: var(--c-fg);
  opacity: 0.85;
  margin-bottom: 4px;
}
.mdv-theme-card__line--short {
  width: 60%;
  background: var(--c-muted);
  opacity: 0.75;
}
.mdv-theme-card__chips {
  display: flex;
  gap: 3px;
  margin-top: 6px;
}
.mdv-theme-card__chips > span {
  width: 9px;
  height: 9px;
  border-radius: 2px;
}
.mdv-theme-card__chips > .mdv-theme-card__accent {
  background: var(--c-accent);
  border-radius: 50%;
  margin-left: auto;
}
.mdv-theme-card__name {
  font-size: 10px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 2px;
}
.mdv-theme-card:hover .mdv-theme-card__name {
  color: var(--fg);
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
