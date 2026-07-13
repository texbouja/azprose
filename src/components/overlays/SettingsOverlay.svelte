<script lang="ts">
import { slide } from "svelte/transition";
import { ChevronRight, X } from "@/lib/icons";
import { Button, Icon } from "@/components/primitives";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import {
  proseSettings,
  type ProseStyle,
  type TextAlign,
  type HeadingFont,
  type OlType,
} from "@/stores/prose-settings.svelte";
import { mathJaxPreamble, mathJaxPackages } from "@/stores/mathjax-preamble.svelte";
import { MATHJAX_PACKAGES } from "@/lib/mathjax-packages";
import { slideSettings, SLIDE_MODES } from "@/components/markdown/slide-settings.svelte";
import { generalSettings } from "@/stores/general-settings.svelte";
import { restartApp } from "@/lib/restart";

let t = $derived(getT($language));

let {
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
} = $props();

type ModuleId = "general" | "prose-writing" | "apercu" | "presentation" | "mathjax";
type SectionId = "markdown";

const SECTIONS: { id: SectionId; labelKey: string; modules: { id: ModuleId; labelKey: string }[] }[] = [
  {
    id: "markdown",
    labelKey: "settings.section.markdown",
    modules: [
      { id: "general",       labelKey: "settings.module.general" },
      { id: "prose-writing", labelKey: "settings.module.prose" },
      { id: "apercu",        labelKey: "settings.module.apercu" },
      { id: "presentation",  labelKey: "settings.module.presentation" },
      { id: "mathjax",       labelKey: "settings.module.mathjax" },
    ],
  },
];

let activeModule = $state<ModuleId>("general");
let expandedSections = $state(new Set<SectionId>(["markdown"]));

// Explicit $derived so the template tracks proseSettings.current reactively.
let s = $derived(proseSettings.current);

// Font availability check via canvas — fires after 400 ms of no typing.
function checkFontAvailable(name: string): boolean {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    const sample = "mmmmmmmmmllliiii";
    ctx.font = "16px monospace";
    const fallback = ctx.measureText(sample).width;
    ctx.font = `16px '${name.trim()}', monospace`;
    return ctx.measureText(sample).width !== fallback;
  } catch { return true; }
}

// Synchronous canvas check — fast enough to run reactively on each keystroke.
let customFontOk = $derived(
  s.fontFamily === "custom" && s.customFontName.trim() ? checkFontAvailable(s.customFontName) : null
);
let presCustomFontOk = $derived(
  s.presFontFamily === "custom" && s.presCustomFontName.trim() ? checkFontAvailable(s.presCustomFontName) : null
);

function toggleSection(id: SectionId) {
  const next = new Set(expandedSections);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedSections = next;
}

$effect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
});

// ── Drag ────────────────────────────────────────────────────────────────────
let offsetX = $state(0);
let offsetY = $state(0);
let isDragging = $state(false);
const _drag = { startX: 0, startY: 0, origX: 0, origY: 0 };

function onDragStart(e: PointerEvent) {
  if ((e.target as HTMLElement).closest("button")) return;
  isDragging = true;
  _drag.startX = e.clientX;
  _drag.startY = e.clientY;
  _drag.origX = offsetX;
  _drag.origY = offsetY;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onDragMove(e: PointerEvent) {
  if (!isDragging) return;
  offsetX = _drag.origX + (e.clientX - _drag.startX);
  offsetY = _drag.origY + (e.clientY - _drag.startY);
}

function onDragEnd() {
  isDragging = false;
}

const OL_OPTIONS: { value: OlType; labelKey: string }[] = [
  { value: "decimal",     labelKey: "settings.ol.decimal" },
  { value: "lower-alpha", labelKey: "settings.ol.lowerAlpha" },
  { value: "lower-roman", labelKey: "settings.ol.lowerRoman" },
  { value: "upper-alpha", labelKey: "settings.ol.upperAlpha" },
  { value: "upper-roman", labelKey: "settings.ol.upperRoman" },
];

const HEADING_FONT_OPTIONS: { value: HeadingFont; labelKey: string }[] = [
  { value: "inherit",    labelKey: "settings.headingFont.inherit" },
  { value: "fira-sans",  labelKey: "settings.headingFont.firaSans" },
  { value: "inter",      labelKey: "settings.headingFont.inter" },
  { value: "system",     labelKey: "settings.headingFont.system" },
  { value: "custom",     labelKey: "settings.headingFont.custom" },
];
</script>

{#snippet headingRow(
  tag: string,
  size: number, onSize: (v: number) => void,
  align: TextAlign | null, onAlign: ((v: TextAlign) => void) | null,
  mt: number, onMt: (v: number) => void,
  mb: number, onMb: (v: number) => void,
)}
  <div class="mdv-settings__heading-row" class:no-align={!onAlign}>
    <span class="mdv-settings__heading-tag">{tag}</span>
    <input type="number" class="mdv-settings__number-input"
      min="0.5" max="5" step="0.05"
      value={size}
      oninput={(e) => onSize(Number(e.currentTarget.value))} />
    {#if onAlign && align !== null}
      <div class="mdv-settings__align-group">
        {#each (["left", "center", "right"] as const) as a}
          <button type="button" class="mdv-settings__align-btn"
            class:is-active={align === a}
            onclick={() => onAlign(a)}
            aria-label={t("settings.align" + a)}
          >{a === "left" ? t("settings.alignLeft") : a === "center" ? t("settings.alignCenter") : t("settings.alignRight")}</button>
        {/each}
      </div>
    {/if}
    <input type="number" class="mdv-settings__number-input"
      min="0" max="5" step="0.1"
      value={mt}
      oninput={(e) => onMt(Number(e.currentTarget.value))} />
    <input type="number" class="mdv-settings__number-input"
      min="0" max="3" step="0.05"
      value={mb}
      oninput={(e) => onMb(Number(e.currentTarget.value))} />
  </div>
{/snippet}

{#snippet policesSection()}
  <p class="mdv-settings__section-title">{t("settings.fonts")}</p>
  <div class="mdv-settings__fonts">
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMain")}</span>
      <select class="mdv-settings__select" class:mdv-settings__select--inline={s.fontFamily === "custom"}
        onchange={(e) => proseSettings.patch({ fontFamily: e.currentTarget.value as ProseStyle["fontFamily"] })}>
        <option value="fira-sans" selected={s.fontFamily === "fira-sans"}>Fira Sans</option>
        <option value="inter"     selected={s.fontFamily === "inter"}>Inter</option>
        <option value="system"    selected={s.fontFamily === "system"}>{t("settings.fontSystem")}</option>
        <option value="custom"    selected={s.fontFamily === "custom"}>{t("settings.fontCustom")}</option>
      </select>
      {#if s.fontFamily === "custom"}
        <input type="text" class="mdv-settings__font-custom-input"
          style={customFontOk === false ? "color: var(--color-error)" : ""}
          placeholder={t("settings.fontPlaceholder")}
          value={s.customFontName}
          oninput={(e) => proseSettings.patch({ customFontName: e.currentTarget.value })}
          spellcheck={false} />
      {/if}
    </div>
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMono")}</span>
      <select class="mdv-settings__select"
        onchange={(e) => proseSettings.patch({ monoFont: e.currentTarget.value as ProseStyle["monoFont"] })}>
        <option value="fira-code"      selected={s.monoFont === "fira-code"}>Fira Code</option>
        <option value="jetbrains-mono" selected={s.monoFont === "jetbrains-mono"}>JetBrains Mono</option>
        <option value="system"         selected={s.monoFont === "system"}>{t("settings.fontSystem")}</option>
      </select>
    </div>
  </div>
{/snippet}

{#snippet policesSectionPres()}
  <p class="mdv-settings__section-title">{t("settings.fonts")}</p>
  <div class="mdv-settings__fonts">
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMain")}</span>
      <select class="mdv-settings__select" class:mdv-settings__select--inline={s.presFontFamily === "custom"}
        onchange={(e) => proseSettings.patch({ presFontFamily: e.currentTarget.value as ProseStyle["presFontFamily"] })}>
        <option value="fira-sans" selected={s.presFontFamily === "fira-sans"}>Fira Sans</option>
        <option value="inter"     selected={s.presFontFamily === "inter"}>Inter</option>
        <option value="system"    selected={s.presFontFamily === "system"}>{t("settings.fontSystem")}</option>
        <option value="custom"    selected={s.presFontFamily === "custom"}>{t("settings.fontCustom")}</option>
      </select>
      {#if s.presFontFamily === "custom"}
        <input type="text" class="mdv-settings__font-custom-input"
          style={presCustomFontOk === false ? "color: var(--color-error)" : ""}
          placeholder={t("settings.fontPlaceholder")}
          value={s.presCustomFontName}
          oninput={(e) => proseSettings.patch({ presCustomFontName: e.currentTarget.value })}
          spellcheck={false} />
      {/if}
    </div>
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMono")}</span>
      <select class="mdv-settings__select"
        onchange={(e) => proseSettings.patch({ presMonoFont: e.currentTarget.value as ProseStyle["presMonoFont"] })}>
        <option value="fira-code"      selected={s.presMonoFont === "fira-code"}>Fira Code</option>
        <option value="jetbrains-mono" selected={s.presMonoFont === "jetbrains-mono"}>JetBrains Mono</option>
        <option value="system"         selected={s.presMonoFont === "system"}>{t("settings.fontSystem")}</option>
      </select>
    </div>
  </div>
{/snippet}

{#snippet titresSection(showAlign: boolean, fontsFirst: boolean)}
  <p class="mdv-settings__section-title">{t("settings.headings")}</p>
  <!-- wrapper flex so CSS order can swap fonts ↔ table when fontsFirst -->
  <div class="mdv-settings__titres-layout">
    <div class="mdv-settings__heading-fonts" style={fontsFirst ? "order:-1" : ""}>
      {#each ([
        { tag: "H1", key: "h1FontFamily", nameKey: "h1CustomFontName" },
        { tag: "H2", key: "h2FontFamily", nameKey: "h2CustomFontName" },
        { tag: "H3", key: "h3FontFamily", nameKey: "h3CustomFontName" },
      ] as const) as row}
        {@const isCustom = s[row.key] === "custom"}
        {@const fontName = s[row.nameKey]}
        {@const fontValid = isCustom && fontName.trim() ? checkFontAvailable(fontName) : null}
        <div class="mdv-settings__font-row">
          <span class="mdv-settings__font-label mdv-settings__heading-tag">{row.tag}</span>
          <select class="mdv-settings__select" class:mdv-settings__select--inline={isCustom}
            onchange={(e) => {
              const val = e.currentTarget.value as HeadingFont;
              if (val === "custom" && !fontName.trim()) {
                const fallback = s.h1CustomFontName || s.h2CustomFontName || s.h3CustomFontName;
                if (fallback) { proseSettings.patch({ [row.key]: val, [row.nameKey]: fallback }); return; }
              }
              proseSettings.patch({ [row.key]: val });
            }}>
            {#each HEADING_FONT_OPTIONS as opt}
              <option value={opt.value} selected={s[row.key] === opt.value}>{t(opt.labelKey)}</option>
            {/each}
          </select>
          {#if isCustom}
            <input type="text" class="mdv-settings__font-custom-input"
              style={fontValid === false ? "color: var(--color-error)" : ""}
              placeholder={t("settings.fontPlaceholder")}
              value={fontName}
              oninput={(e) => proseSettings.patch({ [row.nameKey]: e.currentTarget.value })}
              spellcheck={false} />
          {/if}
        </div>
      {/each}
    </div>

    <div class="mdv-settings__headings">
      <div class="mdv-settings__heading-header" class:no-align={!showAlign}>
        <span></span>
        <span>{t("settings.headingSize")}</span>
        {#if showAlign}<span>{t("settings.headingAlign")}</span>{/if}
        <span>{t("settings.headingMarginTop")}</span>
        <span>{t("settings.headingMarginBottom")}</span>
      </div>
      {@render headingRow("H1",
        s.h1Size,    (v) => proseSettings.patch({ h1Size: v }),
        showAlign ? s.h1Align : null, showAlign ? (v) => proseSettings.patch({ h1Align: v }) : null,
        s.h1MarginTop,  (v) => proseSettings.patch({ h1MarginTop: v }),
        s.h1MarginBottom, (v) => proseSettings.patch({ h1MarginBottom: v }),
      )}
      {@render headingRow("H2",
        s.h2Size,    (v) => proseSettings.patch({ h2Size: v }),
        showAlign ? s.h2Align : null, showAlign ? (v) => proseSettings.patch({ h2Align: v }) : null,
        s.h2MarginTop,  (v) => proseSettings.patch({ h2MarginTop: v }),
        s.h2MarginBottom, (v) => proseSettings.patch({ h2MarginBottom: v }),
      )}
      {@render headingRow("H3",
        s.h3Size,    (v) => proseSettings.patch({ h3Size: v }),
        showAlign ? s.h3Align : null, showAlign ? (v) => proseSettings.patch({ h3Align: v }) : null,
        s.h3MarginTop,  (v) => proseSettings.patch({ h3MarginTop: v }),
        s.h3MarginBottom, (v) => proseSettings.patch({ h3MarginBottom: v }),
      )}
    </div>
  </div>
{/snippet}

{#snippet titresSectionPres()}
  <p class="mdv-settings__section-title">{t("settings.headings")}</p>
  <div class="mdv-settings__titres-layout">
    <div class="mdv-settings__heading-fonts">
      {#each ([
        { tag: "H1", key: "presH1FontFamily", nameKey: "presH1CustomFontName" },
        { tag: "H2", key: "presH2FontFamily", nameKey: "presH2CustomFontName" },
        { tag: "H3", key: "presH3FontFamily", nameKey: "presH3CustomFontName" },
      ] as const) as row}
        {@const isCustom = s[row.key] === "custom"}
        {@const fontName = s[row.nameKey]}
        {@const fontValid = isCustom && fontName.trim() ? checkFontAvailable(fontName) : null}
        <div class="mdv-settings__font-row">
          <span class="mdv-settings__font-label mdv-settings__heading-tag">{row.tag}</span>
          <select class="mdv-settings__select" class:mdv-settings__select--inline={isCustom}
            onchange={(e) => {
              const val = e.currentTarget.value as HeadingFont;
              if (val === "custom" && !fontName.trim()) {
                const fallback = s.presH1CustomFontName || s.presH2CustomFontName || s.presH3CustomFontName;
                if (fallback) { proseSettings.patch({ [row.key]: val, [row.nameKey]: fallback }); return; }
              }
              proseSettings.patch({ [row.key]: val });
            }}>
            {#each HEADING_FONT_OPTIONS as opt}
              <option value={opt.value} selected={s[row.key] === opt.value}>{t(opt.labelKey)}</option>
            {/each}
          </select>
          {#if isCustom}
            <input type="text" class="mdv-settings__font-custom-input"
              style={fontValid === false ? "color: var(--color-error)" : ""}
              placeholder={t("settings.fontPlaceholder")}
              value={fontName}
              oninput={(e) => proseSettings.patch({ [row.nameKey]: e.currentTarget.value })}
              spellcheck={false} />
          {/if}
        </div>
      {/each}
    </div>

    <div class="mdv-settings__headings">
      <div class="mdv-settings__heading-header">
        <span></span>
        <span>{t("settings.headingSize")}</span>
        <span>{t("settings.headingAlign")}</span>
        <span>{t("settings.headingMarginTop")}</span>
        <span>{t("settings.headingMarginBottom")}</span>
      </div>
      {@render headingRow("H1",
        s.presH1Size,    (v) => proseSettings.patch({ presH1Size: v }),
        s.presH1Align,   (v) => proseSettings.patch({ presH1Align: v }),
        s.presH1MarginTop,  (v) => proseSettings.patch({ presH1MarginTop: v }),
        s.presH1MarginBottom, (v) => proseSettings.patch({ presH1MarginBottom: v }),
      )}
      {@render headingRow("H2",
        s.presH2Size,    (v) => proseSettings.patch({ presH2Size: v }),
        s.presH2Align,   (v) => proseSettings.patch({ presH2Align: v }),
        s.presH2MarginTop,  (v) => proseSettings.patch({ presH2MarginTop: v }),
        s.presH2MarginBottom, (v) => proseSettings.patch({ presH2MarginBottom: v }),
      )}
      {@render headingRow("H3",
        s.presH3Size,    (v) => proseSettings.patch({ presH3Size: v }),
        s.presH3Align,   (v) => proseSettings.patch({ presH3Align: v }),
        s.presH3MarginTop,  (v) => proseSettings.patch({ presH3MarginTop: v }),
        s.presH3MarginBottom, (v) => proseSettings.patch({ presH3MarginBottom: v }),
      )}
    </div>
  </div>
{/snippet}

{#snippet listesSection()}
  <p class="mdv-settings__section-title">{t("settings.lists")}</p>
  <div class="mdv-settings__lists">
    <div class="mdv-settings__list-row">
      <span class="mdv-settings__list-label">{t("settings.listLevel1")}</span>
      <select class="mdv-settings__select"
        onchange={(e) => proseSettings.patch({ olLevel1: e.currentTarget.value as OlType })}>
        {#each OL_OPTIONS as opt}<option value={opt.value} selected={s.olLevel1 === opt.value}>{t(opt.labelKey)}</option>{/each}
      </select>
    </div>
    <div class="mdv-settings__list-row">
      <span class="mdv-settings__list-label">{t("settings.listLevel2")}</span>
      <select class="mdv-settings__select"
        onchange={(e) => proseSettings.patch({ olLevel2: e.currentTarget.value as OlType })}>
        {#each OL_OPTIONS as opt}<option value={opt.value} selected={s.olLevel2 === opt.value}>{t(opt.labelKey)}</option>{/each}
      </select>
    </div>
    <div class="mdv-settings__list-row">
      <span class="mdv-settings__list-label">{t("settings.listLevel3")}</span>
      <select class="mdv-settings__select"
        onchange={(e) => proseSettings.patch({ olLevel3: e.currentTarget.value as OlType })}>
        {#each OL_OPTIONS as opt}<option value={opt.value} selected={s.olLevel3 === opt.value}>{t(opt.labelKey)}</option>{/each}
      </select>
    </div>
  </div>
{/snippet}

{#if open}
  <div
    class="mdv-overlay mdv-overlay--settings"
    style="transform: translateX(calc(-50% + {offsetX}px)) translateY({offsetY}px)"
    role="dialog"
    aria-label={t("settings.ariaLabel")}
    aria-modal="false"
  >
    <div class="mdv-settings">
      <header class="mdv-settings__header"
        class:is-dragging={isDragging}
        onpointerdown={onDragStart}
        onpointermove={onDragMove}
        onpointerup={onDragEnd}
        onpointercancel={onDragEnd}
        role="none"
      >
        <span class="mdv-settings__title">{t("settings.title")}</span>
        <Button onclick={onClose}>
          {#snippet icon()}<Icon icon={X} size={14} strokeWidth={1.5} />{/snippet}
        </Button>
      </header>

      <div class="mdv-settings__body">
        <nav class="mdv-settings__nav" aria-label={t("settings.navAria")}>
          {#each SECTIONS as section (section.id)}
            <div
              class="mdv-settings__nav-section"
              class:is-open={expandedSections.has(section.id)}
            >
              <button
                type="button"
                class="mdv-settings__nav-section-header"
                onclick={() => toggleSection(section.id)}
                aria-expanded={expandedSections.has(section.id)}
              >
                <span class="mdv-settings__nav-chevron">
                  <Icon icon={ChevronRight} size={10} strokeWidth={2} />
                </span>
                {t(section.labelKey)}
              </button>
              {#if expandedSections.has(section.id)}
                <div transition:slide={{ duration: 120 }}>
                  {#each section.modules as mod (mod.id)}
                    <button
                      type="button"
                      class="mdv-settings__nav-item"
                      class:is-active={activeModule === mod.id}
                      onclick={() => (activeModule = mod.id)}
                    >
                      {t(mod.labelKey)}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </nav>

        <div class="mdv-settings__panel" role="region" aria-label={t("settings.module." + activeModule)}>

          {#if activeModule === "general"}
            <p class="mdv-settings__section-title">{t("settings.defaultEditorMode")}</p>
            <div class="mdv-settings__radio-group">
              <label class="mdv-settings__radio">
                <input type="radio" name="default-editor-mode" value="prose"
                  checked={generalSettings.defaultEditorMode === "prose"}
                  onchange={() => (generalSettings.defaultEditorMode = "prose")} />
                {t("settings.editorProse")}
              </label>
              <label class="mdv-settings__radio">
                <input type="radio" name="default-editor-mode" value="raw"
                  checked={generalSettings.defaultEditorMode === "raw"}
                  onchange={() => (generalSettings.defaultEditorMode = "raw")} />
                {t("settings.editorRaw")}
              </label>
            </div>
            <p class="mdv-settings__hint">{t("settings.editorHint")}</p>

            {@render listesSection()}
            <p class="mdv-settings__hint">{t("settings.listsHint")}</p>
          {/if}

          {#if activeModule === "prose-writing"}
            {@render policesSection()}

            <p class="mdv-settings__section-title">{t("settings.typography")}</p>
            <div class="mdv-settings__sliders">
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.fontSize")}</span>
                <input type="range" class="mdv-settings__range" min="12" max="24" step="1"
                  value={s.fontSize}
                  oninput={(e) => proseSettings.patch({ fontSize: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.fontSize} px</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.lineHeight")}</span>
                <input type="range" class="mdv-settings__range" min="1.3" max="2.2" step="0.05"
                  value={s.lineHeight}
                  oninput={(e) => proseSettings.patch({ lineHeight: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.lineHeight.toFixed(2)}</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.columnWidth")}</span>
                <input type="range" class="mdv-settings__range" min="500" max="1200" step="10"
                  value={s.maxWidth}
                  oninput={(e) => proseSettings.patch({ maxWidth: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.maxWidth} px</span>
              </div>
            </div>

            {@render titresSection(false, false)}

            <p class="mdv-settings__section-title">{t("settings.customCss")}</p>
            <p class="mdv-settings__hint">{t("settings.customCssHint")}</p>
            <textarea
              class="mdv-settings__css-editor"
              value={s.customCss}
              oninput={(e) => proseSettings.patch({ customCss: e.currentTarget.value })}
              spellcheck={false} autocomplete="off" autocapitalize="off"
              aria-label={t("settings.customCssAria")}
            ></textarea>
          {/if}

          {#if activeModule === "apercu"}
            {@render policesSection()}

            <p class="mdv-settings__section-title">{t("settings.typography")}</p>
            <div class="mdv-settings__sliders">
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.fontSize")}</span>
                <input type="range" class="mdv-settings__range" min="12" max="24" step="1"
                  value={s.fontSize}
                  oninput={(e) => proseSettings.patch({ fontSize: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.fontSize} px</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.lineHeight")}</span>
                <input type="range" class="mdv-settings__range" min="1.3" max="2.2" step="0.05"
                  value={s.lineHeight}
                  oninput={(e) => proseSettings.patch({ lineHeight: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.lineHeight.toFixed(2)}</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.columnWidth")}</span>
                <input type="range" class="mdv-settings__range" min="500" max="1200" step="10"
                  value={s.maxWidth}
                  oninput={(e) => proseSettings.patch({ maxWidth: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.maxWidth} px</span>
              </div>
            </div>

            {@render titresSection(true, true)}
          {/if}

          {#if activeModule === "presentation"}
            <p class="mdv-settings__section-title">{t("settings.defaultMode")}</p>
            <div class="mdv-settings__radio-group">
              {#each SLIDE_MODES as m (m.id)}
                <label class="mdv-settings__radio">
                  <input type="radio" name="slide-mode"
                    value={m.id}
                    checked={slideSettings.mode === m.id}
                    onchange={() => { slideSettings.mode = m.id; }} />
                  {m.label}
                </label>
              {/each}
            </div>

            <p class="mdv-settings__hint">{t("settings.presHint")}</p>

            {@render policesSectionPres()}

            <p class="mdv-settings__section-title">{t("settings.typography")}</p>
            <div class="mdv-settings__sliders">
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.fontSize")}</span>
                <input type="range" class="mdv-settings__range" min="12" max="32" step="1"
                  value={s.presFontSize}
                  oninput={(e) => proseSettings.patch({ presFontSize: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.presFontSize} px</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.lineHeight")}</span>
                <input type="range" class="mdv-settings__range" min="1.0" max="2.2" step="0.05"
                  value={s.presLineHeight}
                  oninput={(e) => proseSettings.patch({ presLineHeight: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.presLineHeight.toFixed(2)}</span>
              </div>
            </div>

            {@render titresSectionPres()}

            <p class="mdv-settings__section-title">{t("settings.customCss")}</p>
            <p class="mdv-settings__hint">{t("settings.customCssPresHint")}</p>
            <textarea
              class="mdv-settings__css-editor"
              value={s.presCss}
              oninput={(e) => proseSettings.patch({ presCss: e.currentTarget.value })}
              spellcheck={false} autocomplete="off" autocapitalize="off"
              aria-label={t("settings.customCssPresAria")}
            ></textarea>
          {/if}

          {#if activeModule === "mathjax"}
            <p class="mdv-settings__section-title">{t("settings.packages")}</p>
            <div class="mdv-settings__pkg-grid">
              {#each MATHJAX_PACKAGES as pkg (pkg.id)}
                <label class="mdv-settings__pkg-item">
                  <input type="checkbox"
                    checked={mathJaxPackages.current.includes(pkg.id)}
                    onchange={() => mathJaxPackages.toggle(pkg.id)} />
                  {pkg.label}
                </label>
              {/each}
            </div>

            <p class="mdv-settings__section-title">{t("settings.globalMacros")}</p>
            <textarea
              class="mdv-settings__css-editor"
              value={mathJaxPreamble.current}
              oninput={(e) => (mathJaxPreamble.current = e.currentTarget.value)}
              spellcheck={false} autocomplete="off" autocapitalize="off"
              placeholder={t("settings.mathjaxPlaceholder")}
              aria-label={t("settings.mathjaxAria")}
            ></textarea>
          {/if}

        </div>
      </div>

      <footer
        class="mdv-settings__footer"
        class:mdv-settings__footer--end={activeModule !== "mathjax"}
      >
        {#if activeModule === "general"}
          <button type="button" class="mdv-settings__reset" onclick={() => generalSettings.reset()}>
            {t("settings.reset")}
          </button>
        {:else if activeModule === "prose-writing" || activeModule === "apercu" || activeModule === "presentation"}
          <button type="button" class="mdv-settings__reset" onclick={() => proseSettings.reset()}>
            {t("settings.reset")}
          </button>
        {:else if activeModule === "mathjax"}
          <button type="button" class="mdv-settings__reset" onclick={() => (mathJaxPreamble.current = "")}>
            {t("settings.reset")}
          </button>
          <button type="button" class="mdv-settings__restart" onclick={restartApp}>
            {t("settings.restart")}
          </button>
        {/if}
      </footer>
    </div>
  </div>
{/if}
