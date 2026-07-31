<script lang="ts">
import { Counter, Combo, Slider, Switch, Checkbox, Segmented, Text, TextArea } from "@svar-ui/svelte-core";
import { slide } from "svelte/transition";
import { Button } from "@/components/primitives";
import { getT, language, setLanguage, LANGUAGE_CHOICES } from "@/lib/i18n";
import {
  proseMarkSettings,
  previewSettings,
  presentationSettings,
  csvSettings,
  type ProseMarkStyle,
  type PreviewStyle,
  type PresentationStyle,
  type TextAlign,
  type HeadingFont,
  type OlType,
} from "@/stores/markdown-settings.svelte";
import { mathJaxPreamble, mathJaxPackages } from "@/stores/mathjax-preamble.svelte";
import { MATHJAX_PACKAGES } from "@/lib/mathjax-packages";
import { slideSettings, SLIDE_MODES } from "@/stores/slide-settings.svelte";
import { generalSettings, UI_SCALE_OPTIONS, UI_FONT_PRESETS, UI_MONO_FONT_PRESETS, UI_SIDEBAR_FONT_PRESETS, PREVIEW_FONT_PRESETS, PREVIEW_MONO_FONT_PRESETS, FONT_HINTING_OPTIONS } from "@/stores/general-settings.svelte";
import { theme } from "@/stores/theme.svelte";
import { THEME_GROUPS, type ThemeMode } from "@/lib";
import { restartApp } from "@/lib/restart";
import { calloutSettings, CALLOUT_COLORS, type CalloutNumbering } from "@/stores/callout-settings.svelte";
import { latexSettings, type BibtexMode } from "@/stores/latex-settings.svelte";
import { editorSettings, type EditorFontFamily } from "@/stores/editor-settings.svelte";
import { getRootPath } from "@/stores/root-path.svelte";
import { notifications } from "@/stores/notifications.svelte";
import { getFontStore, type FontCheck } from "@/stores/fonts.svelte";
import { joinPath } from "@/lib/files";
import { userProfile, type UserRole } from "@/stores/user-profile.svelte";
import { exportCalendar, importCalendar, clearCalendar } from "@/lib/calendar-persistence";

let t = $derived(getT($language));

let {
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
} = $props();

type ModuleId = "general" | "prose-writing" | "apercu" | "presentation" | "mathjax" | "callouts" | "csv-general" | "latex-general" | "latex-build" | "editor" | "calendar" | "profile" | "appearance";
type SectionId = "markdown" | "general" | "latex";

const SECTIONS: { id: SectionId; labelKey: string; modules: { id: ModuleId; labelKey: string }[] }[] = [
  {
    id: "general",
    labelKey: "settings.section.general",
    modules: [
      { id: "editor", labelKey: "settings.module.editor" },
      { id: "appearance", labelKey: "settings.module.appearance" },
      { id: "profile", labelKey: "settings.module.profile" },
      { id: "csv-general", labelKey: "settings.module.csvGeneral" },
      { id: "calendar", labelKey: "settings.module.calendar" },
    ],
  },
  {
    id: "markdown",
    labelKey: "settings.section.markdown",
    modules: [
      { id: "general",        labelKey: "settings.module.general" },
      { id: "prose-writing", labelKey: "settings.module.prose" },
      { id: "apercu",        labelKey: "settings.module.apercu" },
      { id: "presentation",  labelKey: "settings.module.presentation" },
      { id: "mathjax",       labelKey: "settings.module.mathjax" },
      { id: "callouts",      labelKey: "settings.module.callouts" },
    ],
  },
  {
    id: "latex",
    labelKey: "settings.section.latex",
    modules: [
      { id: "latex-general", labelKey: "settings.module.latexGeneral" },
      { id: "latex-build",   labelKey: "settings.module.latexBuild" },
    ],
  },
];

let activeModule = $state<ModuleId>("editor");
let expandedSections = $state(new Set<SectionId>(["general", "markdown", "latex"]));

// Explicit $derived so the template tracks settings reactively.
let s = $derived(proseMarkSettings.current);
let pvs = $derived(previewSettings.current);
let prs = $derived(presentationSettings.current);
let csvStyle = $derived(csvSettings.current);

// Debounced text input: delays store write so typing stays snappy.
const _inputTimers = new Map<string, ReturnType<typeof setTimeout>>();
function debounceInput(key: string, value: string, write: (v: string) => void, ms = 200) {
  clearTimeout(_inputTimers.get(key));
  _inputTimers.set(key, setTimeout(() => { _inputTimers.delete(key); write(value); }, ms));
}

// Font availability check — memoized canvas fallback, used only while the
// system font store is still loading.
const _fontCache = new Map<string, boolean>();
function checkFontAvailable(name: string): boolean {
  const key = name.trim().toLowerCase();
  if (_fontCache.has(key)) return _fontCache.get(key)!;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) { _fontCache.set(key, true); return true; }
    const sample = "mmmmmmmmmllliiii";
    ctx.font = "16px monospace";
    const fallback = ctx.measureText(sample).width;
    ctx.font = `16px '${name.trim()}', monospace`;
    const ok = ctx.measureText(sample).width !== fallback;
    _fontCache.set(key, ok);
    return ok;
  } catch { _fontCache.set(key, true); return true; }
}

const fontStore = getFontStore();

// Word-by-word validation against the runtime font store (see fonts.svelte.ts).
function checkFontName(name: string): FontCheck {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (fontStore.status === "ready") return fontStore.check(trimmed);
  return checkFontAvailable(trimmed) ? "ok" : "error";
}

function fontFieldStyle(state: FontCheck): { inputStyle: string; error: boolean } {
  if (state === "error") return { inputStyle: "color: var(--color-error)", error: true };
  if (state === "partial") return { inputStyle: "color: var(--color-warning, #e6a94c)", error: false };
  return { inputStyle: "", error: false };
}

let customFontState = $derived(s.fontFamily === "custom" ? checkFontName(s.customFontName) : null);
let prsCustomFontState = $derived(prs.fontFamily === "custom" ? checkFontName(prs.customFontName) : null);
let pvsCustomFontState = $derived(pvs.fontFamily === "custom" ? checkFontName(pvs.customFontName) : null);
let editorCustomFontState = $derived(
  editorSettings.current.fontFamily === "custom" ? checkFontName(editorSettings.current.customFontName) : null
);
let previewCustomFontState = $derived(
  generalSettings.previewFontFamily === "custom" ? checkFontName(generalSettings.previewCustomFontName) : null
);

function toggleSection(id: SectionId) {
  const next = new Set(expandedSections);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedSections = next;
}

let newCalloutName = $state("");
const _labelTimers = new Map<string, ReturnType<typeof setTimeout>>();
const _labelDrafts = new Map<string, string>();

function getLabelDraft(name: string, fallback: string): string {
  return _labelDrafts.has(name) ? _labelDrafts.get(name)! : fallback;
}

function onLabelInput(name: string, value: string, builtin: boolean) {
  _labelDrafts.set(name, value);
  clearTimeout(_labelTimers.get(name));
  _labelTimers.set(name, setTimeout(() => {
    _labelTimers.delete(name);
    _labelDrafts.delete(name);
    if (builtin) calloutSettings.updateBuiltin(name, { label: value });
    else calloutSettings.updateUser(name, { label: value });
  }, 400));
}

function addNewCallout() {
  const name = newCalloutName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!name) return;
  calloutSettings.addUser({
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1),
    numbering: "none",
    color: "info",
  });
  newCalloutName = "";
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
    <Counter value={size} min={0.5} max={5} step={0.05} onchange={(ev) => onSize(ev.value)} />
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
    <Counter value={mt} min={0} max={5} step={0.1} onchange={(ev) => onMt(ev.value)} />
    <Counter value={mb} min={0} max={3} step={0.05} onchange={(ev) => onMb(ev.value)} />
  </div>
{/snippet}

{#snippet policesSection()}
  <p class="mdv-settings__section-title">{t("settings.fonts")}</p>
  <div class="mdv-settings__fonts">
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMain")}</span>
      <Combo
        value={s.fontFamily}
        options={[
          {id: "fira-sans", label: "Fira Sans"},
          {id: "inter", label: "Inter"},
          {id: "ubuntu", label: "Ubuntu"},
          {id: "ubuntu-condensed", label: "Ubuntu Condensed"},
          {id: "system", label: t("settings.fontSystem")},
          {id: "custom", label: t("settings.fontCustom")},
        ]}
        onchange={(ev) => proseMarkSettings.patch({ fontFamily: ev.value as ProseMarkStyle["fontFamily"] })}
      />
      {#if s.fontFamily === "custom"}
        {@const fs = fontFieldStyle(customFontState)}
        <Text
          value={s.customFontName}
          placeholder={t("settings.fontPlaceholder")}
          inputStyle={fs.inputStyle}
          error={fs.error}
          onchange={(ev) => debounceInput("font-main", String(ev.value), (v) => proseMarkSettings.patch({ customFontName: v }))}
        />
      {/if}
    </div>
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMono")}</span>
      <Combo
        value={s.monoFont}
        options={[
          {id: "fira-code", label: "Fira Code"},
          {id: "jetbrains-mono", label: "JetBrains Mono"},
          {id: "ubuntu-mono", label: "Ubuntu Mono"},
          {id: "system", label: t("settings.fontSystem")},
        ]}
        onchange={(ev) => proseMarkSettings.patch({ monoFont: ev.value as ProseMarkStyle["monoFont"] })}
      />
    </div>
  </div>
{/snippet}

{#snippet policesSectionPres()}
  <p class="mdv-settings__section-title">{t("settings.fonts")}</p>
  <div class="mdv-settings__fonts">
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMain")}</span>
      <Combo
        value={prs.fontFamily}
        options={[
          {id: "fira-sans", label: "Fira Sans"},
          {id: "inter", label: "Inter"},
          {id: "ubuntu", label: "Ubuntu"},
          {id: "ubuntu-condensed", label: "Ubuntu Condensed"},
          {id: "system", label: t("settings.fontSystem")},
          {id: "custom", label: t("settings.fontCustom")},
        ]}
        onchange={(ev) => presentationSettings.patch({ fontFamily: ev.value as PresentationStyle["fontFamily"] })}
      />
      {#if prs.fontFamily === "custom"}
        {@const fs = fontFieldStyle(prsCustomFontState)}
        <Text
          value={prs.customFontName}
          placeholder={t("settings.fontPlaceholder")}
          inputStyle={fs.inputStyle}
          error={fs.error}
          onchange={(ev) => debounceInput("font-pres", String(ev.value), (v) => presentationSettings.patch({ customFontName: v }))}
        />
      {/if}
    </div>
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMono")}</span>
      <Combo
        value={prs.monoFont}
        options={[
          {id: "fira-code", label: "Fira Code"},
          {id: "jetbrains-mono", label: "JetBrains Mono"},
          {id: "ubuntu-mono", label: "Ubuntu Mono"},
          {id: "system", label: t("settings.fontSystem")},
        ]}
        onchange={(ev) => presentationSettings.patch({ monoFont: ev.value as PresentationStyle["monoFont"] })}
      />
    </div>
  </div>
{/snippet}

{#snippet policesSectionPreview()}
  <p class="mdv-settings__section-title">{t("settings.fonts")}</p>
  <div class="mdv-settings__fonts">
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMain")}</span>
      <Combo
        value={pvs.fontFamily}
        options={[
          {id: "fira-sans", label: "Fira Sans"},
          {id: "inter", label: "Inter"},
          {id: "ubuntu", label: "Ubuntu"},
          {id: "ubuntu-condensed", label: "Ubuntu Condensed"},
          {id: "system", label: t("settings.fontSystem")},
          {id: "custom", label: t("settings.fontCustom")},
        ]}
        onchange={(ev) => previewSettings.patch({ fontFamily: ev.value as PreviewStyle["fontFamily"] })}
      />
      {#if pvs.fontFamily === "custom"}
        {@const fs = fontFieldStyle(pvsCustomFontState)}
        <Text
          value={pvs.customFontName}
          placeholder={t("settings.fontPlaceholder")}
          inputStyle={fs.inputStyle}
          error={fs.error}
          onchange={(ev) => debounceInput("font-prev", String(ev.value), (v) => previewSettings.patch({ customFontName: v }))}
        />
      {/if}
    </div>
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMono")}</span>
      <Combo
        value={pvs.monoFont}
        options={[
          {id: "fira-code", label: "Fira Code"},
          {id: "jetbrains-mono", label: "JetBrains Mono"},
          {id: "ubuntu-mono", label: "Ubuntu Mono"},
          {id: "system", label: t("settings.fontSystem")},
        ]}
        onchange={(ev) => previewSettings.patch({ monoFont: ev.value as PreviewStyle["monoFont"] })}
      />
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
        {@const fontState = isCustom && fontName.trim() ? checkFontName(fontName) : null}
        {@const fs = fontFieldStyle(fontState)}
        <div class="mdv-settings__font-row">
          <span class="mdv-settings__font-label mdv-settings__heading-tag">{row.tag}</span>
          <Combo
            value={s[row.key]}
            options={HEADING_FONT_OPTIONS.map(o => ({id: o.value, label: t(o.labelKey)}))}
            onchange={(ev) => {
              const val = ev.value as HeadingFont;
              if (val === "custom" && !fontName.trim()) {
                const fallback = s.h1CustomFontName || s.h2CustomFontName || s.h3CustomFontName;
                if (fallback) { proseMarkSettings.patch({ [row.key]: val, [row.nameKey]: fallback }); return; }
              }
              proseMarkSettings.patch({ [row.key]: val });
            }}
          />
          {#if isCustom}
            <Text
              value={fontName}
              placeholder={t("settings.fontPlaceholder")}
              inputStyle={fs.inputStyle}
              error={fs.error}
              onchange={(ev) => debounceInput("heading-" + row.tag, String(ev.value), (v) => proseMarkSettings.patch({ [row.nameKey]: v }))}
            />
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
        s.h1Size,    (v) => proseMarkSettings.patch({ h1Size: v }),
        showAlign ? s.h1Align : null, showAlign ? (v) => proseMarkSettings.patch({ h1Align: v }) : null,
        s.h1MarginTop,  (v) => proseMarkSettings.patch({ h1MarginTop: v }),
        s.h1MarginBottom, (v) => proseMarkSettings.patch({ h1MarginBottom: v }),
      )}
      {@render headingRow("H2",
        s.h2Size,    (v) => proseMarkSettings.patch({ h2Size: v }),
        showAlign ? s.h2Align : null, showAlign ? (v) => proseMarkSettings.patch({ h2Align: v }) : null,
        s.h2MarginTop,  (v) => proseMarkSettings.patch({ h2MarginTop: v }),
        s.h2MarginBottom, (v) => proseMarkSettings.patch({ h2MarginBottom: v }),
      )}
      {@render headingRow("H3",
        s.h3Size,    (v) => proseMarkSettings.patch({ h3Size: v }),
        showAlign ? s.h3Align : null, showAlign ? (v) => proseMarkSettings.patch({ h3Align: v }) : null,
        s.h3MarginTop,  (v) => proseMarkSettings.patch({ h3MarginTop: v }),
        s.h3MarginBottom, (v) => proseMarkSettings.patch({ h3MarginBottom: v }),
      )}
    </div>
  </div>
{/snippet}

{#snippet titresSectionPres()}
  <p class="mdv-settings__section-title">{t("settings.headings")}</p>
  <div class="mdv-settings__titres-layout">
    <div class="mdv-settings__heading-fonts">
      {#each ([
        { tag: "H1", key: "h1FontFamily", nameKey: "h1CustomFontName" },
        { tag: "H2", key: "h2FontFamily", nameKey: "h2CustomFontName" },
        { tag: "H3", key: "h3FontFamily", nameKey: "h3CustomFontName" },
      ] as const) as row}
        {@const isCustom = prs[row.key] === "custom"}
        {@const fontName = prs[row.nameKey]}
        {@const fontState = isCustom && fontName.trim() ? checkFontName(fontName) : null}
        {@const fs = fontFieldStyle(fontState)}
        <div class="mdv-settings__font-row">
          <span class="mdv-settings__font-label mdv-settings__heading-tag">{row.tag}</span>
          <Combo
            value={prs[row.key]}
            options={HEADING_FONT_OPTIONS.map(o => ({id: o.value, label: t(o.labelKey)}))}
            onchange={(ev) => {
              const val = ev.value as HeadingFont;
              if (val === "custom" && !fontName.trim()) {
                const fallback = prs.h1CustomFontName || prs.h2CustomFontName || prs.h3CustomFontName;
                if (fallback) { presentationSettings.patch({ [row.key]: val, [row.nameKey]: fallback }); return; }
              }
              presentationSettings.patch({ [row.key]: val });
            }}
          />
          {#if isCustom}
            <Text
              value={fontName}
              placeholder={t("settings.fontPlaceholder")}
              inputStyle={fs.inputStyle}
              error={fs.error}
              onchange={(ev) => debounceInput("heading-" + row.tag, String(ev.value), (v) => presentationSettings.patch({ [row.nameKey]: v }))}
            />
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
        prs.h1Size,    (v) => presentationSettings.patch({ h1Size: v }),
        prs.h1Align,   (v) => presentationSettings.patch({ h1Align: v }),
        prs.h1MarginTop,  (v) => presentationSettings.patch({ h1MarginTop: v }),
        prs.h1MarginBottom, (v) => presentationSettings.patch({ h1MarginBottom: v }),
      )}
      {@render headingRow("H2",
        prs.h2Size,    (v) => presentationSettings.patch({ h2Size: v }),
        prs.h2Align,   (v) => presentationSettings.patch({ h2Align: v }),
        prs.h2MarginTop,  (v) => presentationSettings.patch({ h2MarginTop: v }),
        prs.h2MarginBottom, (v) => presentationSettings.patch({ h2MarginBottom: v }),
      )}
      {@render headingRow("H3",
        prs.h3Size,    (v) => presentationSettings.patch({ h3Size: v }),
        prs.h3Align,   (v) => presentationSettings.patch({ h3Align: v }),
        prs.h3MarginTop,  (v) => presentationSettings.patch({ h3MarginTop: v }),
        prs.h3MarginBottom, (v) => presentationSettings.patch({ h3MarginBottom: v }),
      )}
    </div>
  </div>
{/snippet}

{#snippet titresSectionPreview()}
  <p class="mdv-settings__section-title">{t("settings.headings")}</p>
  <div class="mdv-settings__titres-layout">
    <div class="mdv-settings__heading-fonts">
      {#each ([
        { tag: "H1", key: "h1FontFamily", nameKey: "h1CustomFontName" },
        { tag: "H2", key: "h2FontFamily", nameKey: "h2CustomFontName" },
        { tag: "H3", key: "h3FontFamily", nameKey: "h3CustomFontName" },
      ] as const) as row}
        {@const isCustom = pvs[row.key] === "custom"}
        {@const fontName = pvs[row.nameKey]}
        {@const fontState = isCustom && fontName.trim() ? checkFontName(fontName) : null}
        {@const fs = fontFieldStyle(fontState)}
        <div class="mdv-settings__font-row">
          <span class="mdv-settings__font-label mdv-settings__heading-tag">{row.tag}</span>
          <Combo
            value={pvs[row.key]}
            options={HEADING_FONT_OPTIONS.map(o => ({id: o.value, label: t(o.labelKey)}))}
            onchange={(ev) => {
              const val = ev.value as HeadingFont;
              if (val === "custom" && !fontName.trim()) {
                const fallback = pvs.h1CustomFontName || pvs.h2CustomFontName || pvs.h3CustomFontName;
                if (fallback) { previewSettings.patch({ [row.key]: val, [row.nameKey]: fallback }); return; }
              }
              previewSettings.patch({ [row.key]: val });
            }}
          />
          {#if isCustom}
            <Text
              value={fontName}
              placeholder={t("settings.fontPlaceholder")}
              inputStyle={fs.inputStyle}
              error={fs.error}
              onchange={(ev) => debounceInput("heading-prev-" + row.tag, String(ev.value), (v) => previewSettings.patch({ [row.nameKey]: v }))}
            />
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
        pvs.h1Size,    (v) => previewSettings.patch({ h1Size: v }),
        pvs.h1Align,   (v) => previewSettings.patch({ h1Align: v }),
        pvs.h1MarginTop,  (v) => previewSettings.patch({ h1MarginTop: v }),
        pvs.h1MarginBottom, (v) => previewSettings.patch({ h1MarginBottom: v }),
      )}
      {@render headingRow("H2",
        pvs.h2Size,    (v) => previewSettings.patch({ h2Size: v }),
        pvs.h2Align,   (v) => previewSettings.patch({ h2Align: v }),
        pvs.h2MarginTop,  (v) => previewSettings.patch({ h2MarginTop: v }),
        pvs.h2MarginBottom, (v) => previewSettings.patch({ h2MarginBottom: v }),
      )}
      {@render headingRow("H3",
        pvs.h3Size,    (v) => previewSettings.patch({ h3Size: v }),
        pvs.h3Align,   (v) => previewSettings.patch({ h3Align: v }),
        pvs.h3MarginTop,  (v) => previewSettings.patch({ h3MarginTop: v }),
        pvs.h3MarginBottom, (v) => previewSettings.patch({ h3MarginBottom: v }),
      )}
    </div>
  </div>
{/snippet}

{#snippet listesSection()}
  <p class="mdv-settings__section-title">{t("settings.lists")}</p>
  <div class="mdv-settings__lists">
    <div class="mdv-settings__list-row">
      <span class="mdv-settings__list-label">{t("settings.listLevel1")}</span>
      <Combo
        value={s.olLevel1}
        options={OL_OPTIONS.map(o => ({id: o.value, label: t(o.labelKey)}))}
        onchange={(ev) => proseMarkSettings.patch({ olLevel1: ev.value as OlType })}
      />
    </div>
    <div class="mdv-settings__list-row">
      <span class="mdv-settings__list-label">{t("settings.listLevel2")}</span>
      <Combo
        value={s.olLevel2}
        options={OL_OPTIONS.map(o => ({id: o.value, label: t(o.labelKey)}))}
        onchange={(ev) => proseMarkSettings.patch({ olLevel2: ev.value as OlType })}
      />
    </div>
    <div class="mdv-settings__list-row">
      <span class="mdv-settings__list-label">{t("settings.listLevel3")}</span>
      <Combo
        value={s.olLevel3}
        options={OL_OPTIONS.map(o => ({id: o.value, label: t(o.labelKey)}))}
        onchange={(ev) => proseMarkSettings.patch({ olLevel3: ev.value as OlType })}
      />
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
          {#snippet icon()}<i class="wxi-x" style="font-size:14px"></i>{/snippet}
        </Button>
      </header>

      <div class="mdv-settings__body">
        <nav class="mdv-settings__nav" aria-label={t("settings.navAria")}>
          {#each SECTIONS as section (section.id)}
            {#if section.modules.length === 1}
              <button
                type="button"
                class="mdv-settings__nav-item mdv-settings__nav-item--flat"
                class:is-active={activeModule === section.modules[0].id}
                onclick={() => (activeModule = section.modules[0].id)}
              >
                {t(section.labelKey)}
              </button>
            {:else}
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
                    <i class="wxi-chevron-right" style="font-size:10px"></i>
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
            {/if}
          {/each}
        </nav>

        <div class="mdv-settings__panel" role="region" aria-label={t("settings.module." + activeModule)}>

          {#if activeModule === "general"}
            <p class="mdv-settings__section-title">{t("settings.defaultEditorMode")}</p>
            <Segmented
              value={generalSettings.defaultEditorMode}
              options={[
                {id: "prose", label: t("settings.editorProse")},
                {id: "raw", label: t("settings.editorRaw")},
              ]}
              onchange={(ev) => (generalSettings.defaultEditorMode = ev.value as any)}
            />
            <p class="mdv-settings__hint">{t("settings.editorHint")}</p>

            <p class="mdv-settings__section-title">{t("settings.language")}</p>
            <Segmented
              value={$language}
              options={LANGUAGE_CHOICES.map((c) => ({ id: c.value, label: c.nativeLabel }))}
              onchange={(ev) => setLanguage(ev.value as any)}
            />
            <p class="mdv-settings__hint">{t("settings.languageHint")}</p>

            {@render listesSection()}
            <p class="mdv-settings__hint">{t("settings.listsHint")}</p>
          {/if}

          {#if activeModule === "prose-writing"}
            {@render policesSection()}

            <p class="mdv-settings__section-title">{t("settings.typography")}</p>
            <div class="mdv-settings__sliders">
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.fontSize")}</span>
                <Slider min={12} max={24} step={1} value={s.fontSize} onchange={(ev) => proseMarkSettings.patch({ fontSize: ev.value })} />
                <span class="mdv-settings__slider-value">{s.fontSize} px</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.lineHeight")}</span>
                <Slider min={1.3} max={2.2} step={0.05} value={s.lineHeight} onchange={(ev) => proseMarkSettings.patch({ lineHeight: ev.value })} />
                <span class="mdv-settings__slider-value">{s.lineHeight.toFixed(2)}</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.columnWidth")}</span>
                <Slider min={500} max={1200} step={10} value={s.maxWidth} onchange={(ev) => proseMarkSettings.patch({ maxWidth: ev.value })} />
                <span class="mdv-settings__slider-value">{s.maxWidth} px</span>
              </div>
            </div>

            {@render titresSection(false, false)}

            <p class="mdv-settings__section-title">{t("settings.customCss")}</p>
            <p class="mdv-settings__hint">{t("settings.customCssHint")}</p>
            <div style="font-family: var(--font-ui); font-size: 12px;">
              <TextArea value={s.customCss} onchange={(ev) => debounceInput("css-prose", ev.value, (v) => proseMarkSettings.patch({ customCss: v }))} />
            </div>
          {/if}

          {#if activeModule === "apercu"}
            {@render policesSectionPreview()}

            <p class="mdv-settings__section-title">{t("settings.typography")}</p>
            <div class="mdv-settings__sliders">
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.fontSize")}</span>
                <Slider min={12} max={24} step={1} value={pvs.fontSize} onchange={(ev) => previewSettings.patch({ fontSize: ev.value })} />
                <span class="mdv-settings__slider-value">{pvs.fontSize} px</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.lineHeight")}</span>
                <Slider min={1.3} max={2.2} step={0.05} value={pvs.lineHeight} onchange={(ev) => previewSettings.patch({ lineHeight: ev.value })} />
                <span class="mdv-settings__slider-value">{pvs.lineHeight.toFixed(2)}</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.columnWidth")}</span>
                <Slider min={500} max={1200} step={10} value={pvs.maxWidth} onchange={(ev) => previewSettings.patch({ maxWidth: ev.value })} />
                <span class="mdv-settings__slider-value">{pvs.maxWidth} px</span>
              </div>
            </div>

            {@render titresSectionPreview()}

            <p class="mdv-settings__section-title">{t("settings.customCss")}</p>
            <p class="mdv-settings__hint">{t("settings.customCssHint")}</p>
            <div style="font-family: var(--font-ui); font-size: 12px;">
              <TextArea value={pvs.customCss} onchange={(ev) => debounceInput("css-preview", ev.value, (v) => previewSettings.patch({ customCss: v }))} />
            </div>
          {/if}

          {#if activeModule === "presentation"}
            <p class="mdv-settings__section-title">{t("settings.defaultMode")}</p>
            <Segmented
              value={slideSettings.mode}
              options={SLIDE_MODES.map(m => ({id: m.id, label: m.label}))}
              onchange={(ev) => { slideSettings.mode = ev.value as any; }}
            />

            <p class="mdv-settings__hint">{t("settings.presHint")}</p>

            {@render policesSectionPres()}

            <p class="mdv-settings__section-title">{t("settings.typography")}</p>
            <div class="mdv-settings__sliders">
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.fontSize")}</span>
                <Slider min={12} max={32} step={1} value={prs.fontSize} onchange={(ev) => presentationSettings.patch({ fontSize: ev.value })} />
                <span class="mdv-settings__slider-value">{prs.fontSize} px</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.lineHeight")}</span>
                <Slider min={1.0} max={2.2} step={0.05} value={prs.lineHeight} onchange={(ev) => presentationSettings.patch({ lineHeight: ev.value })} />
                <span class="mdv-settings__slider-value">{prs.lineHeight.toFixed(2)}</span>
              </div>
            </div>

            {@render titresSectionPres()}

            <p class="mdv-settings__section-title">{t("settings.customCss")}</p>
            <p class="mdv-settings__hint">{t("settings.customCssPresHint")}</p>
            <div style="font-family: var(--font-ui); font-size: 12px;">
              <TextArea value={prs.customCss} onchange={(ev) => debounceInput("css-pres", ev.value, (v) => presentationSettings.patch({ customCss: v }))} />
            </div>
          {/if}

          {#if activeModule === "mathjax"}
            <p class="mdv-settings__section-title">{t("settings.packages")}</p>
            <div class="mdv-settings__pkg-grid">
              {#each MATHJAX_PACKAGES as pkg (pkg.id)}
                <Checkbox
                  value={mathJaxPackages.current.includes(pkg.id)}
                  label={pkg.label}
                  onchange={() => mathJaxPackages.toggle(pkg.id)}
                />
              {/each}
            </div>

            <p class="mdv-settings__section-title">{t("settings.globalMacros")}</p>
            <div style="font-family: var(--font-ui); font-size: 12px;">
              <TextArea value={mathJaxPreamble.current} placeholder={t("settings.mathjaxPlaceholder")} onchange={(ev) => debounceInput("mathjax", ev.value, (v) => (mathJaxPreamble.current = v))} />
            </div>
          {/if}

          {#if activeModule === "callouts"}
            <p class="mdv-settings__section-title">{t("settings.calloutsTitle")}</p>

            {#each calloutSettings.current as def (def.name)}
              <div class="mdv-settings__callout-row">
                <div class="mdv-settings__callout-header">
                  <span class="mdv-settings__callout-badge" style="background:{CALLOUT_COLORS.find(c => c.id === def.color)?.hex ?? '#888'}; opacity:0.7"></span>
                  <span class="mdv-settings__callout-name">{def.name}</span>
                  {#if !def.builtin}
                    <button type="button" class="mdv-settings__callout-remove"
                      onclick={() => calloutSettings.removeUser(def.name)}
                      aria-label={t("settings.calloutRemove")}>✕</button>
                  {/if}
                </div>

                <div class="mdv-settings__callout-fields">
                  <label class="mdv-settings__callout-field">
                    <span>{t("settings.calloutLabel")}</span>
                    <Text
                      value={getLabelDraft(def.name, def.label)}
                      onchange={(ev) => onLabelInput(def.name, String(ev.value), def.builtin)}
                    />
                  </label>

                  <label class="mdv-settings__callout-field">
                    <span>{t("settings.calloutNumbering")}</span>
                    <Combo
                      value={def.numbering}
                      options={[
                        {id: "theorems", label: t("settings.calloutNumTheorems")},
                        {id: "exercises", label: t("settings.calloutNumExercises")},
                        {id: "none", label: t("settings.calloutNumNone")},
                      ]}
                      onchange={(ev) => {
                        const v = ev.value as CalloutNumbering;
                        if (def.builtin) calloutSettings.updateBuiltin(def.name, { numbering: v });
                        else calloutSettings.updateUser(def.name, { numbering: v });
                      }}
                    />
                  </label>

                  <label class="mdv-settings__callout-field">
                    <span>{t("settings.calloutColor")}</span>
                    <div class="mdv-settings__callout-colors">
                      {#each CALLOUT_COLORS as c (c.id)}
                        <button type="button"
                          class="mdv-settings__callout-swatch"
                          class:is-active={def.color === c.id}
                          style="background:{c.hex}"
                          onclick={() => {
                            if (def.builtin) calloutSettings.updateBuiltin(def.name, { color: c.id });
                            else calloutSettings.updateUser(def.name, { color: c.id });
                          }}
                          aria-label={c.id}
                        ></button>
                      {/each}
                    </div>
                  </label>
                </div>
              </div>
            {/each}

            <div class="mdv-settings__callout-add">
              <Text
                value={newCalloutName}
                placeholder={t("settings.calloutAddPlaceholder")}
                onchange={(ev) => { newCalloutName = String(ev.value); if (ev.value && !ev.input) addNewCallout(); }}
              />
              <button type="button" class="mdv-settings__callout-add-btn"
                onclick={addNewCallout}
                disabled={!newCalloutName.trim()}>
                {t("settings.calloutAdd")}
              </button>
            </div>

            <p class="mdv-settings__hint">{t("settings.calloutsHint")}</p>
          {/if}

          {#if activeModule === "csv-general"}
            <p class="mdv-settings__section-title">{t("settings.typography")}</p>
            <div class="mdv-settings__sliders">
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.fontSize")}</span>
                <Slider min={10} max={20} step={1} value={csvStyle.fontSize} onchange={(ev) => csvSettings.patch({ fontSize: ev.value })} />
                <span class="mdv-settings__slider-value">{csvStyle.fontSize} px</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.lineHeight")}</span>
                <Slider min={1.0} max={2.0} step={0.05} value={csvStyle.lineHeight} onchange={(ev) => csvSettings.patch({ lineHeight: ev.value })} />
                <span class="mdv-settings__slider-value">{csvStyle.lineHeight.toFixed(2)}</span>
              </div>
            </div>
            <p class="mdv-settings__hint">{t("settings.spreadsheetFontHint")}</p>
          {/if}

          {#if activeModule === "latex-general"}
            <p class="mdv-settings__section-title">{t("settings.latexEngine")}</p>
            <Segmented
              value={latexSettings.current.engine}
              options={[
                {id: "pdflatex", label: t("settings.latexEnginePdflatex")},
                {id: "xelatex", label: t("settings.latexEngineXelatex")},
                {id: "lualatex", label: t("settings.latexEngineLualatex")},
              ]}
              onchange={(ev) => latexSettings.patch({ engine: ev.value as any })}
            />

            <p class="mdv-settings__section-title">{t("settings.latexShellEscape")}</p>
            <div class="mdv-settings__toggle-row">
              <Switch value={latexSettings.current.shellEscape} onchange={(ev) => latexSettings.patch({ shellEscape: ev.value })} />
              <span>{t("settings.latexShellEscapeHint")}</span>
            </div>
          {/if}

          {#if activeModule === "latex-build"}
            <p class="mdv-settings__section-title">{t("settings.latexOutputDir")}</p>
            <Text
              value={latexSettings.current.outputDir}
              onchange={(ev) => debounceInput("latex-output-dir", String(ev.value), (v) => latexSettings.patch({ outputDir: v }))}
            />
            <p class="mdv-settings__hint">{t("settings.latexOutputDirHint")}</p>

            <p class="mdv-settings__section-title">{t("settings.latexAuxDir")}</p>
            <Text
              value={latexSettings.current.auxDir}
              onchange={(ev) => debounceInput("latex-aux-dir", String(ev.value), (v) => latexSettings.patch({ auxDir: v }))}
            />
            <p class="mdv-settings__hint">{t("settings.latexAuxDirHint")}</p>

            <p class="mdv-settings__section-title">{t("settings.latexMaxRuns")}</p>
            <Counter value={latexSettings.current.maxRuns} min={1} max={20} onchange={(ev) => latexSettings.patch({ maxRuns: ev.value })} />

            <p class="mdv-settings__section-title">{t("settings.latexBibtex")}</p>
            <Combo
              value={latexSettings.current.bibtex}
              options={[
                {id: "auto", label: t("settings.latexBibtexAuto")},
                {id: "bibtex", label: t("settings.latexBibtexBibtex")},
                {id: "biber", label: t("settings.latexBibtexBiber")},
                {id: "disabled", label: t("settings.latexBibtexDisabled")},
              ]}
              onchange={(ev) => latexSettings.patch({ bibtex: ev.value as BibtexMode })}
            />
            <p class="mdv-settings__hint">{t("settings.latexBibtexHint")}</p>

            <p class="mdv-settings__section-title">{t("settings.latexTexmf")}</p>
            <p class="mdv-settings__hint">{t("settings.latexTexmfHint")}</p>
            <div style="display:flex;gap:8px">
              <button type="button" class="mdv-settings__restart"
                onclick={async () => {
                  const rp = getRootPath();
                  if (rp) {
                    const dir = joinPath(joinPath(rp, ".azprose"), "texmf");
                    const { initTexmf } = await import("@/latex");
                    await initTexmf(rp);
                    const { invoke } = await import("@tauri-apps/api/core");
                    invoke("open_folder", { path: dir });
                  }
                }}>
                {t("settings.latexTexmfOpen")}
              </button>
              <button type="button" class="mdv-settings__restart"
                onclick={async () => {
                  const rp = getRootPath();
                  if (rp) {
                    const { rehashTexmf } = await import("@/latex");
                    const msg = await rehashTexmf(rp);
                    notifications.setInfo(msg);
                  }
                }}>
                {t("settings.latexTexmfRehash")}
              </button>
            </div>
          {/if}

          {#if activeModule === "profile"}
            <p class="mdv-settings__section-title">{t("settings.profileTitle")}</p>

            <div class="mdv-settings__fonts">
              <div class="mdv-settings__font-row">
                <span class="mdv-settings__font-label">{t("settings.profileName")}</span>
                <Text
                  value={userProfile.current.name}
                  placeholder={t("settings.profileNamePlaceholder")}
                  onchange={(ev) => userProfile.patch({ name: String(ev.value) })}
                />
              </div>
              <div class="mdv-settings__font-row">
                <span class="mdv-settings__font-label">{t("settings.profileEmail")}</span>
                <Text
                  value={userProfile.current.email}
                  placeholder={t("settings.profileEmailPlaceholder")}
                  onchange={(ev) => userProfile.patch({ email: String(ev.value) })}
                />
              </div>
            </div>

            <p class="mdv-settings__section-title">{t("settings.profileRole")}</p>
            <Segmented
              value={userProfile.current.role}
              options={[
                {id: "professeur", label: t("settings.profileRoleProfesseur")},
                {id: "eleve", label: t("settings.profileRoleEleve")},
              ]}
              onchange={(ev) => userProfile.patch({ role: ev.value as UserRole })}
            />
            <p class="mdv-settings__hint">{t("settings.profileRoleHint")}</p>
          {/if}

          {#if activeModule === "editor"}
            {@const es = editorSettings.current}

            <p class="mdv-settings__section-title">{t("settings.editorFont")}</p>
            <div class="mdv-settings__fonts">
              <div class="mdv-settings__font-row">
                <span class="mdv-settings__font-label">{t("settings.editorFontFamily")}</span>
                <Combo
                  value={es.fontFamily}
                  options={[
                    {id: "fira-code", label: "Fira Code"},
                    {id: "jetbrains-mono", label: "JetBrains Mono"},
                    {id: "ubuntu-mono", label: "Ubuntu Mono"},
                    {id: "source-code-pro", label: "Source Code Pro"},
                    {id: "ibm-plex-mono", label: "IBM Plex Mono"},
                    {id: "system", label: t("settings.fontSystem")},
                    {id: "custom", label: t("settings.fontCustom")},
                  ]}
                  onchange={(ev) => editorSettings.patch({ fontFamily: ev.value as EditorFontFamily })}
                />
                {#if es.fontFamily === "custom"}
                  {@const fs = fontFieldStyle(editorCustomFontState)}
                  <Text
                    value={es.customFontName}
                    placeholder={t("settings.fontPlaceholder")}
                    inputStyle={fs.inputStyle}
                    error={fs.error}
                    onchange={(ev) => debounceInput("font-editor", String(ev.value), (v) => editorSettings.patch({ customFontName: v }))}
                  />
                {/if}
              </div>
            </div>

            <p class="mdv-settings__section-title">{t("settings.editorFontSize")}</p>
            <div class="mdv-settings__row">
              <Slider min={10} max={24} step={1} value={es.fontSize} onchange={(ev) => editorSettings.patch({ fontSize: ev.value })} />
              <span class="mdv-settings__range-value">{es.fontSize}px</span>
            </div>

            <p class="mdv-settings__section-title">{t("settings.editorTabSize")}</p>
            <div class="mdv-settings__row">
              <Slider min={2} max={8} step={1} value={es.tabSize} onchange={(ev) => editorSettings.patch({ tabSize: ev.value })} />
              <span class="mdv-settings__range-value">{es.tabSize}</span>
            </div>

            <p class="mdv-settings__section-title">{t("settings.editorLineNumbers")}</p>
            <div class="mdv-settings__toggle-row">
              <Switch value={es.lineNumbers} onchange={(ev) => editorSettings.patch({ lineNumbers: ev.value })} />
              <span>{t("settings.editorLineNumbersShow")}</span>
            </div>

            <p class="mdv-settings__section-title">{t("settings.editorLineWrapping")}</p>
            <div class="mdv-settings__toggle-row">
              <Switch value={es.lineWrapping} onchange={(ev) => editorSettings.patch({ lineWrapping: ev.value })} />
              <span>{t("settings.editorLineWrappingShow")}</span>
            </div>
          {/if}

          {#if activeModule === "appearance"}
            <!-- Theme — simple dropdown with builtin themes -->
            <p class="mdv-settings__section-title">{t("settings.appearanceTheme")}</p>
            <div class="mdv-settings__row">
              <Combo
                value={theme.mode}
                options={THEME_GROUPS
                  .filter(g => g.label !== "crafted")
                  .flatMap(g => g.choices)
                  .map(c => ({ id: c.value, label: c.label }))}
                onchange={(ev) => { theme.setMode(ev.value as ThemeMode); }}
              />
            </div>

            <!-- UI Scale -->
            <p class="mdv-settings__section-title">{t("settings.appearanceZoom")}</p>
            <div class="mdv-settings__row">
              <Slider
                min={0}
                max={UI_SCALE_OPTIONS.length - 1}
                step={1}
                value={UI_SCALE_OPTIONS.indexOf(generalSettings.uiScale as (typeof UI_SCALE_OPTIONS)[number])}
                onchange={(ev) => { generalSettings.uiScale = UI_SCALE_OPTIONS[ev.value as number]; }}
              />
              <span class="mdv-settings__range-value">{Math.round(generalSettings.uiScale * 100)}%</span>
            </div>

            <!-- UI Fonts -->
            <p class="mdv-settings__section-title">{t("settings.appearanceUiFont")}</p>
            <div class="mdv-settings__fonts">
              <div class="mdv-settings__font-row">
                <span class="mdv-settings__font-label">{t("settings.appearanceUiSans")}</span>
                <Combo
                  value={generalSettings.uiFontFamily}
                  options={UI_FONT_PRESETS.map(p => ({ id: p.id, label: p.label }))}
                  onchange={(ev) => { generalSettings.uiFontFamily = ev.value as string; }}
                />
              </div>
              <div class="mdv-settings__font-row">
                <span class="mdv-settings__font-label">{t("settings.appearanceUiMono")}</span>
                <Combo
                  value={generalSettings.uiMonoFamily}
                  options={UI_MONO_FONT_PRESETS.map(p => ({ id: p.id, label: p.label }))}
                  onchange={(ev) => { generalSettings.uiMonoFamily = ev.value as string; }}
                />
              </div>
              <div class="mdv-settings__font-row">
                <span class="mdv-settings__font-label">{t("settings.appearanceSidebar")}</span>
                <Combo
                  value={generalSettings.uiSidebarFamily}
                  options={UI_SIDEBAR_FONT_PRESETS.map(p => ({ id: p.id, label: p.label }))}
                  onchange={(ev) => { generalSettings.uiSidebarFamily = ev.value as string; }}
                />
              </div>
            </div>

            <!-- Preview Fonts (Polices de l'affichage) — default fonts for all HTML rendering -->
            <p class="mdv-settings__section-title">{t("settings.appearancePreviewFont")}</p>
            <div class="mdv-settings__fonts">
              <div class="mdv-settings__font-row">
                <span class="mdv-settings__font-label">{t("settings.appearancePreviewSans")}</span>
                <Combo
                  value={generalSettings.previewFontFamily}
                  options={[
                    ...PREVIEW_FONT_PRESETS.map(p => ({ id: p.id, label: p.label })),
                    { id: "custom", label: t("settings.fontCustom") },
                  ]}
                  onchange={(ev) => { generalSettings.previewFontFamily = ev.value as string; }}
                />
                {#if generalSettings.previewFontFamily === "custom"}
                  {@const fs = fontFieldStyle(previewCustomFontState)}
                  <Text
                    value={generalSettings.previewCustomFontName}
                    placeholder={t("settings.fontPlaceholder")}
                    inputStyle={fs.inputStyle}
                    error={fs.error}
                    onchange={(ev) => debounceInput("font-preview-custom", String(ev.value), (v) => generalSettings.previewCustomFontName = v)}
                  />
                {/if}
              </div>
              <div class="mdv-settings__font-row">
                <span class="mdv-settings__font-label">{t("settings.appearancePreviewMono")}</span>
                <Combo
                  value={generalSettings.previewMonoFamily}
                  options={PREVIEW_MONO_FONT_PRESETS.map(p => ({ id: p.id, label: p.label }))}
                  onchange={(ev) => { generalSettings.previewMonoFamily = ev.value as string; }}
                />
              </div>
            </div>

            <!-- Native decorations -->
            <p class="mdv-settings__section-title">{t("settings.nativeDecorations")}</p>
            <div class="mdv-settings__toggle-row">
              <Switch value={generalSettings.nativeDecorations} onchange={(ev) => { generalSettings.nativeDecorations = ev.value; }} />
              <span>{t("settings.nativeDecorationsHint")}</span>
            </div>

            <!-- Font Hinting -->
            <p class="mdv-settings__section-title">{t("settings.fontHinting")}</p>
            <div class="mdv-settings__row">
              <Combo
                value={generalSettings.fontHinting}
                options={FONT_HINTING_OPTIONS.map(o => ({ id: o.id, label: t(o.labelKey) }))}
                onchange={(ev) => { generalSettings.fontHinting = ev.value as "standard" | "none" | "full"; }}
              />
            </div>
          {/if}

          {#if activeModule === "calendar"}
            <p class="mdv-settings__section-title">{t("settings.module.calendar")}</p>
            <div class="mdv-settings__row" style="gap:8px;flex-wrap:wrap">
              <button type="button" class="mdv-settings__restart" onclick={exportCalendar}>
                {t("settings.calendarExport")}
              </button>
              <button type="button" class="mdv-settings__restart" onclick={importCalendar}>
                {t("settings.calendarImport")}
              </button>
              <button type="button" class="mdv-settings__reset" onclick={clearCalendar}>
                {t("settings.calendarClear")}
              </button>
            </div>
            <p class="mdv-settings__hint">Le calendrier vit dans le stockage local du navigateur. Utilisez ces commandes pour sauvegarder ou restaurer vos événements manuellement.</p>
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
        {:else if activeModule === "prose-writing"}
          <button type="button" class="mdv-settings__reset" onclick={() => proseMarkSettings.reset()}>
            {t("settings.reset")}
          </button>
        {:else if activeModule === "apercu"}
          <button type="button" class="mdv-settings__reset" onclick={() => previewSettings.reset()}>
            {t("settings.reset")}
          </button>
        {:else if activeModule === "presentation"}
          <button type="button" class="mdv-settings__reset" onclick={() => presentationSettings.reset()}>
            {t("settings.reset")}
          </button>
        {:else if activeModule === "mathjax"}
          <button type="button" class="mdv-settings__reset" onclick={() => (mathJaxPreamble.current = "")}>
            {t("settings.reset")}
          </button>
          <button type="button" class="mdv-settings__restart" onclick={restartApp}>
            {t("settings.restart")}
          </button>
        {:else if activeModule === "callouts"}
          <button type="button" class="mdv-settings__reset" onclick={() => calloutSettings.reset()}>
            {t("settings.reset")}
          </button>
        {:else if activeModule === "csv-general"}
          <button type="button" class="mdv-settings__reset" onclick={() => csvSettings.reset()}>
            {t("settings.reset")}
          </button>
        {:else if activeModule === "latex-general" || activeModule === "latex-build"}
          <button type="button" class="mdv-settings__reset" onclick={() => latexSettings.reset()}>
            {t("settings.reset")}
          </button>
        {:else if activeModule === "editor"}
          <button type="button" class="mdv-settings__reset" onclick={() => editorSettings.reset()}>
            {t("settings.reset")}
          </button>
        {:else if activeModule === "appearance"}
          <button type="button" class="mdv-settings__reset" onclick={() => generalSettings.reset()}>
            {t("settings.reset")}
          </button>
        {/if}
      </footer>
    </div>
  </div>
{/if}
