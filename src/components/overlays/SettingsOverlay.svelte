<script lang="ts">
import { slide } from "svelte/transition";
import { ChevronRight, X } from "@/lib/icons";
import { Button, Icon } from "@/components/primitives";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
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
  type CsvBodyFont,
} from "@/stores/markdown-settings.svelte";
import { mathJaxPreamble, mathJaxPackages } from "@/stores/mathjax-preamble.svelte";
import { MATHJAX_PACKAGES } from "@/lib/mathjax-packages";
import { slideSettings, SLIDE_MODES } from "@/stores/slide-settings.svelte";
import { generalSettings } from "@/stores/general-settings.svelte";
import { restartApp } from "@/lib/restart";
import { calloutSettings, CALLOUT_COLORS, type CalloutNumbering } from "@/stores/callout-settings.svelte";
import { latexSettings, type BibtexMode } from "@/stores/latex-settings.svelte";
import { typstSettings } from "@/stores/typst-settings.svelte";
import { editorSettings, type EditorFontFamily } from "@/stores/editor-settings.svelte";
import { getRootPath } from "@/stores/root-path.svelte";
import { notifications } from "@/stores/notifications.svelte";
import { mkdir } from "@tauri-apps/plugin-fs";
import { joinPath } from "@/lib/files";

let t = $derived(getT($language));

let {
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
} = $props();

type ModuleId = "general" | "prose-writing" | "apercu" | "presentation" | "mathjax" | "callouts" | "csv-general" | "latex-general" | "latex-build" | "typst-general" | "typst-build" | "editor";
type SectionId = "markdown" | "csv" | "latex" | "typst" | "editor";

const SECTIONS: { id: SectionId; labelKey: string; modules: { id: ModuleId; labelKey: string }[] }[] = [
  {
    id: "editor",
    labelKey: "settings.section.editor",
    modules: [
      { id: "editor", labelKey: "settings.module.editor" },
    ],
  },
  {
    id: "markdown",
    labelKey: "settings.section.markdown",
    modules: [
      { id: "general",       labelKey: "settings.module.general" },
      { id: "prose-writing", labelKey: "settings.module.prose" },
      { id: "apercu",        labelKey: "settings.module.apercu" },
      { id: "presentation",  labelKey: "settings.module.presentation" },
      { id: "mathjax",       labelKey: "settings.module.mathjax" },
      { id: "callouts",      labelKey: "settings.module.callouts" },
    ],
  },
  {
    id: "csv",
    labelKey: "settings.section.csv",
    modules: [
      { id: "csv-general", labelKey: "settings.module.csvGeneral" },
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
  {
    id: "typst",
    labelKey: "settings.section.typst",
    modules: [
      { id: "typst-general", labelKey: "settings.module.typstGeneral" },
      { id: "typst-build",   labelKey: "settings.module.typstBuild" },
    ],
  },
];

let activeModule = $state<ModuleId>("editor");
let expandedSections = $state(new Set<SectionId>(["markdown", "csv", "latex", "typst", "editor"]));

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

// Font availability check — memoized, only recalculates when name changes.
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

let customFontOk = $derived(
  s.fontFamily === "custom" && s.customFontName.trim() ? checkFontAvailable(s.customFontName) : null
);
let prsCustomFontOk = $derived(
  prs.fontFamily === "custom" && prs.customFontName.trim() ? checkFontAvailable(prs.customFontName) : null
);
let csvCustomFontOk = $derived(
  csvStyle.fontFamily === "custom" && csvStyle.customFontName.trim() ? checkFontAvailable(csvStyle.customFontName) : null
);
let editorCustomFontOk = $derived(
  editorSettings.current.fontFamily === "custom" && editorSettings.current.customFontName.trim()
    ? checkFontAvailable(editorSettings.current.customFontName) : null
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
        onchange={(e) => proseMarkSettings.patch({ fontFamily: e.currentTarget.value as ProseMarkStyle["fontFamily"] })}>
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
          oninput={(e) => debounceInput("font-main", e.currentTarget.value, (v) => proseMarkSettings.patch({ customFontName: v }))}
          spellcheck={false} />
      {/if}
    </div>
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMono")}</span>
      <select class="mdv-settings__select"
        onchange={(e) => proseMarkSettings.patch({ monoFont: e.currentTarget.value as ProseMarkStyle["monoFont"] })}>
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
      <select class="mdv-settings__select" class:mdv-settings__select--inline={prs.fontFamily === "custom"}
        onchange={(e) => presentationSettings.patch({ fontFamily: e.currentTarget.value as PresentationStyle["fontFamily"] })}>
        <option value="fira-sans" selected={prs.fontFamily === "fira-sans"}>Fira Sans</option>
        <option value="inter"     selected={prs.fontFamily === "inter"}>Inter</option>
        <option value="system"    selected={prs.fontFamily === "system"}>{t("settings.fontSystem")}</option>
        <option value="custom"    selected={prs.fontFamily === "custom"}>{t("settings.fontCustom")}</option>
      </select>
      {#if prs.fontFamily === "custom"}
        <input type="text" class="mdv-settings__font-custom-input"
          style={prsCustomFontOk === false ? "color: var(--color-error)" : ""}
          placeholder={t("settings.fontPlaceholder")}
          value={prs.customFontName}
          oninput={(e) => debounceInput("font-pres", e.currentTarget.value, (v) => presentationSettings.patch({ customFontName: v }))}
          spellcheck={false} />
      {/if}
    </div>
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMono")}</span>
      <select class="mdv-settings__select"
        onchange={(e) => presentationSettings.patch({ monoFont: e.currentTarget.value as PresentationStyle["monoFont"] })}>
        <option value="fira-code"      selected={prs.monoFont === "fira-code"}>Fira Code</option>
        <option value="jetbrains-mono" selected={prs.monoFont === "jetbrains-mono"}>JetBrains Mono</option>
        <option value="system"         selected={prs.monoFont === "system"}>{t("settings.fontSystem")}</option>
      </select>
    </div>
  </div>
{/snippet}

{#snippet policesSectionPreview()}
  <p class="mdv-settings__section-title">{t("settings.fonts")}</p>
  <div class="mdv-settings__fonts">
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMain")}</span>
      <select class="mdv-settings__select" class:mdv-settings__select--inline={pvs.fontFamily === "custom"}
        onchange={(e) => previewSettings.patch({ fontFamily: e.currentTarget.value as PreviewStyle["fontFamily"] })}>
        <option value="fira-sans" selected={pvs.fontFamily === "fira-sans"}>Fira Sans</option>
        <option value="inter"     selected={pvs.fontFamily === "inter"}>Inter</option>
        <option value="system"    selected={pvs.fontFamily === "system"}>{t("settings.fontSystem")}</option>
        <option value="custom"    selected={pvs.fontFamily === "custom"}>{t("settings.fontCustom")}</option>
      </select>
      {#if pvs.fontFamily === "custom"}
        <input type="text" class="mdv-settings__font-custom-input"
          placeholder={t("settings.fontPlaceholder")}
          value={pvs.customFontName}
          oninput={(e) => debounceInput("font-prev", e.currentTarget.value, (v) => previewSettings.patch({ customFontName: v }))}
          spellcheck={false} />
      {/if}
    </div>
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMono")}</span>
      <select class="mdv-settings__select"
        onchange={(e) => previewSettings.patch({ monoFont: e.currentTarget.value as PreviewStyle["monoFont"] })}>
        <option value="fira-code"      selected={pvs.monoFont === "fira-code"}>Fira Code</option>
        <option value="jetbrains-mono" selected={pvs.monoFont === "jetbrains-mono"}>JetBrains Mono</option>
        <option value="system"         selected={pvs.monoFont === "system"}>{t("settings.fontSystem")}</option>
      </select>
    </div>
  </div>
{/snippet}

{#snippet csvFontSection()}
  <p class="mdv-settings__section-title">{t("settings.fonts")}</p>
  <div class="mdv-settings__fonts">
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">{t("settings.fontMain")}</span>
      <select class="mdv-settings__select" class:mdv-settings__select--inline={csvStyle.fontFamily === "custom"}
        onchange={(e) => csvSettings.patch({ fontFamily: e.currentTarget.value as CsvBodyFont })}>
        <option value="fira-sans" selected={csvStyle.fontFamily === "fira-sans"}>Fira Sans</option>
        <option value="inter"     selected={csvStyle.fontFamily === "inter"}>Inter</option>
        <option value="system"    selected={csvStyle.fontFamily === "system"}>{t("settings.fontSystem")}</option>
        <option value="custom"    selected={csvStyle.fontFamily === "custom"}>{t("settings.fontCustom")}</option>
      </select>
      {#if csvStyle.fontFamily === "custom"}
        <input type="text" class="mdv-settings__font-custom-input"
          style={csvCustomFontOk === false ? "color: var(--color-error)" : ""}
          placeholder={t("settings.fontPlaceholder")}
          value={csvStyle.customFontName}
          oninput={(e) => debounceInput("font-csv", e.currentTarget.value, (v) => csvSettings.patch({ customFontName: v }))}
          spellcheck={false} />
      {/if}
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
                if (fallback) { proseMarkSettings.patch({ [row.key]: val, [row.nameKey]: fallback }); return; }
              }
              proseMarkSettings.patch({ [row.key]: val });
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
              oninput={(e) => debounceInput("heading-" + row.tag, e.currentTarget.value, (v) => proseMarkSettings.patch({ [row.nameKey]: v }))}
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
        {@const fontValid = isCustom && fontName.trim() ? checkFontAvailable(fontName) : null}
        <div class="mdv-settings__font-row">
          <span class="mdv-settings__font-label mdv-settings__heading-tag">{row.tag}</span>
          <select class="mdv-settings__select" class:mdv-settings__select--inline={isCustom}
            onchange={(e) => {
              const val = e.currentTarget.value as HeadingFont;
              if (val === "custom" && !fontName.trim()) {
                const fallback = prs.h1CustomFontName || prs.h2CustomFontName || prs.h3CustomFontName;
                if (fallback) { presentationSettings.patch({ [row.key]: val, [row.nameKey]: fallback }); return; }
              }
              presentationSettings.patch({ [row.key]: val });
            }}>
            {#each HEADING_FONT_OPTIONS as opt}
              <option value={opt.value} selected={prs[row.key] === opt.value}>{t(opt.labelKey)}</option>
            {/each}
          </select>
          {#if isCustom}
            <input type="text" class="mdv-settings__font-custom-input"
              style={fontValid === false ? "color: var(--color-error)" : ""}
              placeholder={t("settings.fontPlaceholder")}
              value={fontName}
              oninput={(e) => debounceInput("heading-" + row.tag, e.currentTarget.value, (v) => presentationSettings.patch({ [row.nameKey]: v }))}
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
        <div class="mdv-settings__font-row">
          <span class="mdv-settings__font-label mdv-settings__heading-tag">{row.tag}</span>
          <select class="mdv-settings__select" class:mdv-settings__select--inline={isCustom}
            onchange={(e) => {
              const val = e.currentTarget.value as HeadingFont;
              if (val === "custom" && !fontName.trim()) {
                const fallback = pvs.h1CustomFontName || pvs.h2CustomFontName || pvs.h3CustomFontName;
                if (fallback) { previewSettings.patch({ [row.key]: val, [row.nameKey]: fallback }); return; }
              }
              previewSettings.patch({ [row.key]: val });
            }}>
            {#each HEADING_FONT_OPTIONS as opt}
              <option value={opt.value} selected={pvs[row.key] === opt.value}>{t(opt.labelKey)}</option>
            {/each}
          </select>
          {#if isCustom}
            <input type="text" class="mdv-settings__font-custom-input"
              placeholder={t("settings.fontPlaceholder")}
              value={fontName}
              oninput={(e) => debounceInput("heading-prev-" + row.tag, e.currentTarget.value, (v) => previewSettings.patch({ [row.nameKey]: v }))}
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
      <select class="mdv-settings__select"
        onchange={(e) => proseMarkSettings.patch({ olLevel1: e.currentTarget.value as OlType })}>
        {#each OL_OPTIONS as opt}<option value={opt.value} selected={s.olLevel1 === opt.value}>{t(opt.labelKey)}</option>{/each}
      </select>
    </div>
    <div class="mdv-settings__list-row">
      <span class="mdv-settings__list-label">{t("settings.listLevel2")}</span>
      <select class="mdv-settings__select"
        onchange={(e) => proseMarkSettings.patch({ olLevel2: e.currentTarget.value as OlType })}>
        {#each OL_OPTIONS as opt}<option value={opt.value} selected={s.olLevel2 === opt.value}>{t(opt.labelKey)}</option>{/each}
      </select>
    </div>
    <div class="mdv-settings__list-row">
      <span class="mdv-settings__list-label">{t("settings.listLevel3")}</span>
      <select class="mdv-settings__select"
        onchange={(e) => proseMarkSettings.patch({ olLevel3: e.currentTarget.value as OlType })}>
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
            {/if}
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
                  oninput={(e) => proseMarkSettings.patch({ fontSize: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.fontSize} px</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.lineHeight")}</span>
                <input type="range" class="mdv-settings__range" min="1.3" max="2.2" step="0.05"
                  value={s.lineHeight}
                  oninput={(e) => proseMarkSettings.patch({ lineHeight: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.lineHeight.toFixed(2)}</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.columnWidth")}</span>
                <input type="range" class="mdv-settings__range" min="500" max="1200" step="10"
                  value={s.maxWidth}
                  oninput={(e) => proseMarkSettings.patch({ maxWidth: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.maxWidth} px</span>
              </div>
            </div>

            {@render titresSection(false, false)}

            <p class="mdv-settings__section-title">{t("settings.customCss")}</p>
            <p class="mdv-settings__hint">{t("settings.customCssHint")}</p>
            <textarea
              class="mdv-settings__css-editor"
              value={s.customCss}
              oninput={(e) => debounceInput("css-prose", e.currentTarget.value, (v) => proseMarkSettings.patch({ customCss: v }))}
              spellcheck={false} autocomplete="off" autocapitalize="off"
              aria-label={t("settings.customCssAria")}
            ></textarea>
          {/if}

          {#if activeModule === "apercu"}
            {@render policesSectionPreview()}

            <p class="mdv-settings__section-title">{t("settings.typography")}</p>
            <div class="mdv-settings__sliders">
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.fontSize")}</span>
                <input type="range" class="mdv-settings__range" min="12" max="24" step="1"
                  value={pvs.fontSize}
                  oninput={(e) => previewSettings.patch({ fontSize: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{pvs.fontSize} px</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.lineHeight")}</span>
                <input type="range" class="mdv-settings__range" min="1.3" max="2.2" step="0.05"
                  value={pvs.lineHeight}
                  oninput={(e) => previewSettings.patch({ lineHeight: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{pvs.lineHeight.toFixed(2)}</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.columnWidth")}</span>
                <input type="range" class="mdv-settings__range" min="500" max="1200" step="10"
                  value={pvs.maxWidth}
                  oninput={(e) => previewSettings.patch({ maxWidth: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{pvs.maxWidth} px</span>
              </div>
            </div>

            {@render titresSectionPreview()}

            <p class="mdv-settings__section-title">{t("settings.customCss")}</p>
            <p class="mdv-settings__hint">{t("settings.customCssHint")}</p>
            <textarea
              class="mdv-settings__css-editor"
              value={pvs.customCss}
              oninput={(e) => debounceInput("css-preview", e.currentTarget.value, (v) => previewSettings.patch({ customCss: v }))}
              spellcheck={false} autocomplete="off" autocapitalize="off"
              aria-label={t("settings.customCssAria")}
            ></textarea>
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
                  value={prs.fontSize}
                  oninput={(e) => presentationSettings.patch({ fontSize: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{prs.fontSize} px</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.lineHeight")}</span>
                <input type="range" class="mdv-settings__range" min="1.0" max="2.2" step="0.05"
                  value={prs.lineHeight}
                  oninput={(e) => presentationSettings.patch({ lineHeight: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{prs.lineHeight.toFixed(2)}</span>
              </div>
            </div>

            {@render titresSectionPres()}

            <p class="mdv-settings__section-title">{t("settings.customCss")}</p>
            <p class="mdv-settings__hint">{t("settings.customCssPresHint")}</p>
            <textarea
              class="mdv-settings__css-editor"
              value={prs.customCss}
              oninput={(e) => debounceInput("css-pres", e.currentTarget.value, (v) => presentationSettings.patch({ customCss: v }))}
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
              oninput={(e) => debounceInput("mathjax", e.currentTarget.value, (v) => (mathJaxPreamble.current = v))}
              spellcheck={false} autocomplete="off" autocapitalize="off"
              placeholder={t("settings.mathjaxPlaceholder")}
              aria-label={t("settings.mathjaxAria")}
            ></textarea>
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
                    <input type="text" class="mdv-settings__callout-input"
                      value={getLabelDraft(def.name, def.label)}
                      oninput={(e) => onLabelInput(def.name, e.currentTarget.value, def.builtin)} />
                  </label>

                  <label class="mdv-settings__callout-field">
                    <span>{t("settings.calloutNumbering")}</span>
                    <select class="mdv-settings__select"
                      onchange={(e) => {
                        const v = e.currentTarget.value as CalloutNumbering;
                        if (def.builtin) calloutSettings.updateBuiltin(def.name, { numbering: v });
                        else calloutSettings.updateUser(def.name, { numbering: v });
                      }}>
                      <option value="theorems" selected={def.numbering === "theorems"}>{t("settings.calloutNumTheorems")}</option>
                      <option value="exercises" selected={def.numbering === "exercises"}>{t("settings.calloutNumExercises")}</option>
                      <option value="none"      selected={def.numbering === "none"}>{t("settings.calloutNumNone")}</option>
                    </select>
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
              <input type="text" class="mdv-settings__callout-input"
                placeholder={t("settings.calloutAddPlaceholder")}
                bind:value={newCalloutName}
                onkeydown={(e) => { if (e.key === "Enter") addNewCallout(); }} />
              <button type="button" class="mdv-settings__callout-add-btn"
                onclick={addNewCallout}
                disabled={!newCalloutName.trim()}>
                {t("settings.calloutAdd")}
              </button>
            </div>

            <p class="mdv-settings__hint">{t("settings.calloutsHint")}</p>
          {/if}

          {#if activeModule === "csv-general"}
            {@render csvFontSection()}

            <p class="mdv-settings__section-title">{t("settings.typography")}</p>
            <div class="mdv-settings__sliders">
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.fontSize")}</span>
                <input type="range" class="mdv-settings__range" min="10" max="20" step="1"
                  value={csvStyle.fontSize}
                  oninput={(e) => csvSettings.patch({ fontSize: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{csvStyle.fontSize} px</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">{t("settings.lineHeight")}</span>
                <input type="range" class="mdv-settings__range" min="1.0" max="2.0" step="0.05"
                  value={csvStyle.lineHeight}
                  oninput={(e) => csvSettings.patch({ lineHeight: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{csvStyle.lineHeight.toFixed(2)}</span>
              </div>
            </div>
          {/if}

          {#if activeModule === "latex-general"}
            <p class="mdv-settings__section-title">{t("settings.latexEngine")}</p>
            <div class="mdv-settings__radio-group">
              <label class="mdv-settings__radio">
                <input type="radio" name="latex-engine" value="pdflatex"
                  checked={latexSettings.current.engine === "pdflatex"}
                  onchange={() => latexSettings.patch({ engine: "pdflatex" })} />
                {t("settings.latexEnginePdflatex")}
              </label>
              <label class="mdv-settings__radio">
                <input type="radio" name="latex-engine" value="xelatex"
                  checked={latexSettings.current.engine === "xelatex"}
                  onchange={() => latexSettings.patch({ engine: "xelatex" })} />
                {t("settings.latexEngineXelatex")}
              </label>
              <label class="mdv-settings__radio">
                <input type="radio" name="latex-engine" value="lualatex"
                  checked={latexSettings.current.engine === "lualatex"}
                  onchange={() => latexSettings.patch({ engine: "lualatex" })} />
                {t("settings.latexEngineLualatex")}
              </label>
            </div>

            <p class="mdv-settings__section-title">{t("settings.latexShellEscape")}</p>
            <label class="mdv-settings__radio">
              <input type="checkbox"
                checked={latexSettings.current.shellEscape}
                onchange={(e) => latexSettings.patch({ shellEscape: (e.currentTarget as HTMLInputElement).checked })} />
              {t("settings.latexShellEscapeHint")}
            </label>
          {/if}

          {#if activeModule === "latex-build"}
            <p class="mdv-settings__section-title">{t("settings.latexOutputDir")}</p>
            <input type="text" class="mdv-settings__input"
              value={latexSettings.current.outputDir}
              oninput={(e) => debounceInput("latex-output-dir", e.currentTarget.value, (v) => latexSettings.patch({ outputDir: v }))}
              spellcheck={false} />
            <p class="mdv-settings__hint">{t("settings.latexOutputDirHint")}</p>

            <p class="mdv-settings__section-title">{t("settings.latexAuxDir")}</p>
            <input type="text" class="mdv-settings__input"
              value={latexSettings.current.auxDir}
              oninput={(e) => debounceInput("latex-aux-dir", e.currentTarget.value, (v) => latexSettings.patch({ auxDir: v }))}
              spellcheck={false} />
            <p class="mdv-settings__hint">{t("settings.latexAuxDirHint")}</p>

            <p class="mdv-settings__section-title">{t("settings.latexMaxRuns")}</p>
            <input type="number" class="mdv-settings__input"
              value={latexSettings.current.maxRuns}
              min={1} max={20}
              oninput={(e) => {
                const v = parseInt(e.currentTarget.value, 10);
                if (v >= 1 && v <= 20) latexSettings.patch({ maxRuns: v });
              }} />

            <p class="mdv-settings__section-title">{t("settings.latexBibtex")}</p>
            <select class="mdv-settings__select mdv-settings__select--auto"
              onchange={(e) => latexSettings.patch({ bibtex: e.currentTarget.value as BibtexMode })}>
              <option value="auto"     selected={latexSettings.current.bibtex === "auto"}>{t("settings.latexBibtexAuto")}</option>
              <option value="bibtex"   selected={latexSettings.current.bibtex === "bibtex"}>{t("settings.latexBibtexBibtex")}</option>
              <option value="biber"    selected={latexSettings.current.bibtex === "biber"}>{t("settings.latexBibtexBiber")}</option>
              <option value="disabled" selected={latexSettings.current.bibtex === "disabled"}>{t("settings.latexBibtexDisabled")}</option>
            </select>
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

          {#if activeModule === "typst-general"}
            <p class="mdv-settings__section-title">{t("settings.typstFormatter")}</p>
            <div class="mdv-settings__radio-group">
              <label class="mdv-settings__radio">
                <input type="radio" name="typst-formatter" value="typstyle"
                  checked={typstSettings.current.formatterMode === "typstyle"}
                  onchange={() => typstSettings.patch({ formatterMode: "typstyle" })} />
                {t("settings.typstFormatterTypstyle")}
              </label>
              <label class="mdv-settings__radio">
                <input type="radio" name="typst-formatter" value="typstfmt"
                  checked={typstSettings.current.formatterMode === "typstfmt"}
                  onchange={() => typstSettings.patch({ formatterMode: "typstfmt" })} />
                {t("settings.typstFormatterTypstfmt")}
              </label>
              <label class="mdv-settings__radio">
                <input type="radio" name="typst-formatter" value="disable"
                  checked={typstSettings.current.formatterMode === "disable"}
                  onchange={() => typstSettings.patch({ formatterMode: "disable" })} />
                {t("settings.typstFormatterDisable")}
              </label>
            </div>

            <p class="mdv-settings__section-title">{t("settings.typstPrintWidth")}</p>
            <input type="number" class="mdv-settings__input"
              value={typstSettings.current.formatterPrintWidth}
              min={60} max={200}
              oninput={(e) => {
                const v = parseInt(e.currentTarget.value, 10);
                if (v >= 60 && v <= 200) typstSettings.patch({ formatterPrintWidth: v });
              }} />

            <p class="mdv-settings__section-title">{t("settings.typstIndentSize")}</p>
            <input type="number" class="mdv-settings__input"
              value={typstSettings.current.formatterIndentSize}
              min={1} max={8}
              oninput={(e) => {
                const v = parseInt(e.currentTarget.value, 10);
                if (v >= 1 && v <= 8) typstSettings.patch({ formatterIndentSize: v });
              }} />

            <p class="mdv-settings__section-title">{t("settings.typstSemanticTokens")}</p>
            <label class="mdv-settings__radio">
              <input type="checkbox"
                checked={typstSettings.current.semanticTokens}
                onchange={(e) => typstSettings.patch({ semanticTokens: (e.currentTarget as HTMLInputElement).checked })} />
              {t("settings.typstSemanticTokensHint")}
            </label>

            <p class="mdv-settings__section-title">{t("settings.typstSystemFonts")}</p>
            <label class="mdv-settings__radio">
              <input type="checkbox"
                checked={typstSettings.current.systemFonts}
                onchange={(e) => typstSettings.patch({ systemFonts: (e.currentTarget as HTMLInputElement).checked })} />
              {t("settings.typstSystemFontsHint")}
            </label>
          {/if}

          {#if activeModule === "typst-build"}
            <p class="mdv-settings__section-title">{t("settings.typstExportPdf")}</p>
            <div class="mdv-settings__radio-group">
              <label class="mdv-settings__radio">
                <input type="radio" name="typst-export" value="never"
                  checked={typstSettings.current.exportPdf === "never"}
                  onchange={() => typstSettings.patch({ exportPdf: "never" })} />
                {t("settings.typstExportPdfNever")}
              </label>
              <label class="mdv-settings__radio">
                <input type="radio" name="typst-export" value="onSave"
                  checked={typstSettings.current.exportPdf === "onSave"}
                  onchange={() => typstSettings.patch({ exportPdf: "onSave" })} />
                {t("settings.typstExportPdfOnSave")}
              </label>
              <label class="mdv-settings__radio">
                <input type="radio" name="typst-export" value="onType"
                  checked={typstSettings.current.exportPdf === "onType"}
                  onchange={() => typstSettings.patch({ exportPdf: "onType" })} />
                {t("settings.typstExportPdfOnType")}
              </label>
            </div>

            <p class="mdv-settings__section-title">{t("settings.typstLint")}</p>
            <label class="mdv-settings__radio">
              <input type="checkbox"
                checked={typstSettings.current.lintEnabled}
                onchange={(e) => typstSettings.patch({ lintEnabled: (e.currentTarget as HTMLInputElement).checked })} />
              {t("settings.typstLintHint")}
            </label>

            {#if typstSettings.current.lintEnabled}
              <p class="mdv-settings__section-title">{t("settings.typstLintWhen")}</p>
              <div class="mdv-settings__radio-group">
                <label class="mdv-settings__radio">
                  <input type="radio" name="typst-lint-when" value="onSave"
                    checked={typstSettings.current.lintWhen === "onSave"}
                    onchange={() => typstSettings.patch({ lintWhen: "onSave" })} />
                  {t("settings.typstLintOnSave")}
                </label>
                <label class="mdv-settings__radio">
                  <input type="radio" name="typst-lint-when" value="onType"
                    checked={typstSettings.current.lintWhen === "onType"}
                    onchange={() => typstSettings.patch({ lintWhen: "onType" })} />
                  {t("settings.typstLintOnType")}
                </label>
              </div>
            {/if}

            <p class="mdv-settings__section-title">{t("settings.typstPackages")}</p>
            <p class="mdv-settings__hint">{t("settings.typstPackagesHint")}</p>
            <button type="button" class="mdv-settings__restart"
              onclick={async () => {
                const rp = getRootPath();
                if (rp) {
                  const dir = joinPath(joinPath(rp, ".azprose"), "typst");
                  await mkdir(dir, { recursive: true });
                  const { invoke } = await import("@tauri-apps/api/core");
                  invoke("open_folder", { path: dir });
                }
              }}>
              {t("settings.typstPackagesOpen")}
            </button>

            <p class="mdv-settings__section-title">{t("settings.typstExtraArgs")}</p>
            <input type="text" class="mdv-settings__input"
              value={typstSettings.current.typstExtraArgs}
              oninput={(e) => debounceInput("typst-extra", e.currentTarget.value, (v) => typstSettings.patch({ typstExtraArgs: v }))}
              placeholder="--input key=value"
              spellcheck={false} />
            <p class="mdv-settings__hint">{t("settings.typstExtraArgsHint")}</p>
          {/if}

          {#if activeModule === "editor"}
            {@const es = editorSettings.current}

            <p class="mdv-settings__section-title">{t("settings.editorFont")}</p>
            <div class="mdv-settings__fonts">
              <div class="mdv-settings__font-row">
                <span class="mdv-settings__font-label">{t("settings.editorFontFamily")}</span>
                <select class="mdv-settings__select" class:mdv-settings__select--inline={es.fontFamily === "custom"}
                  onchange={(e) => editorSettings.patch({ fontFamily: e.currentTarget.value as EditorFontFamily })}>
                  <option value="fira-code"      selected={es.fontFamily === "fira-code"}>Fira Code</option>
                  <option value="jetbrains-mono" selected={es.fontFamily === "jetbrains-mono"}>JetBrains Mono</option>
                  <option value="source-code-pro" selected={es.fontFamily === "source-code-pro"}>Source Code Pro</option>
                  <option value="ibm-plex-mono"  selected={es.fontFamily === "ibm-plex-mono"}>IBM Plex Mono</option>
                  <option value="system"         selected={es.fontFamily === "system"}>{t("settings.fontSystem")}</option>
                  <option value="custom"         selected={es.fontFamily === "custom"}>{t("settings.fontCustom")}</option>
                </select>
                {#if es.fontFamily === "custom"}
                  <input type="text" class="mdv-settings__font-custom-input"
                    style={editorCustomFontOk === false ? "color: var(--color-error)" : ""}
                    placeholder={t("settings.fontPlaceholder")}
                    value={es.customFontName}
                    oninput={(e) => debounceInput("font-editor", e.currentTarget.value, (v) => editorSettings.patch({ customFontName: v }))}
                    spellcheck={false} />
                {/if}
              </div>
            </div>

            <p class="mdv-settings__section-title">{t("settings.editorFontSize")}</p>
            <div class="mdv-settings__row">
              <input type="range" min="10" max="24" step="1" value={es.fontSize}
                oninput={(e) => editorSettings.patch({ fontSize: Number(e.currentTarget.value) })} />
              <span class="mdv-settings__range-value">{es.fontSize}px</span>
            </div>

            <p class="mdv-settings__section-title">{t("settings.editorTabSize")}</p>
            <div class="mdv-settings__row">
              <input type="range" min="2" max="8" step="1" value={es.tabSize}
                oninput={(e) => editorSettings.patch({ tabSize: Number(e.currentTarget.value) })} />
              <span class="mdv-settings__range-value">{es.tabSize}</span>
            </div>

            <p class="mdv-settings__section-title">{t("settings.editorLineNumbers")}</p>
            <label class="mdv-settings__toggle">
              <input type="checkbox" checked={es.lineNumbers}
                onchange={(e) => editorSettings.patch({ lineNumbers: e.currentTarget.checked })} />
              <span class="mdv-settings__toggle-slider"></span>
              <span>{t("settings.editorLineNumbersShow")}</span>
            </label>

            <p class="mdv-settings__section-title">{t("settings.editorLineWrapping")}</p>
            <label class="mdv-settings__toggle">
              <input type="checkbox" checked={es.lineWrapping}
                onchange={(e) => editorSettings.patch({ lineWrapping: e.currentTarget.checked })} />
              <span class="mdv-settings__toggle-slider"></span>
              <span>{t("settings.editorLineWrappingShow")}</span>
            </label>
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
        {:else if activeModule === "typst-general" || activeModule === "typst-build"}
          <button type="button" class="mdv-settings__reset" onclick={() => typstSettings.reset()}>
            {t("settings.reset")}
          </button>
        {:else if activeModule === "editor"}
          <button type="button" class="mdv-settings__reset" onclick={() => editorSettings.reset()}>
            {t("settings.reset")}
          </button>
        {/if}
      </footer>
    </div>
  </div>
{/if}
