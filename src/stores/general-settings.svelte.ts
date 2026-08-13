import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";
import { resolveFontFamily, resolveMonoFont, type BodyFont, type MonoFont } from "./markdown-settings.svelte";

export type DefaultEditorMode = "prose" | "raw";

export const UI_SCALE_OPTIONS = [0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.5] as const;
export type UiScale = (typeof UI_SCALE_OPTIONS)[number];

/** Immediately sync zoom to the DOM. */
export function applyZoom(scale: number) {
  const appEl =
    typeof document !== "undefined"
      ? (document.querySelector(".mdv-app") as HTMLElement | null)
      : null;
  if (!appEl) return;
  if (scale === 1.0) appEl.style.removeProperty("zoom");
  else appEl.style.setProperty("zoom", String(scale));
}

/** Apply a UI font-family value via --font-ui-temp (cascade from tokens.css).
 *  Preset ids (see UI_FONT_PRESETS) are resolved to their full stacks. */
export function applyUiFont(value: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!value) { root.style.removeProperty("--font-ui-temp"); return; }
  const preset = UI_FONT_PRESETS.find((p) => p.id === value);
  root.style.setProperty("--font-ui-temp", preset ? preset.value : value);
}

/** Apply a UI mono font-family value via --font-mono-temp. */
export function applyUiMonoFont(value: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!value) { root.style.removeProperty("--font-mono-temp"); return; }
  const preset = UI_MONO_FONT_PRESETS.find((p) => p.id === value);
  root.style.setProperty("--font-mono-temp", preset ? preset.value : value);
}

/** Apply a sidebar font-family value via --font-sidebar.
 *  Sidebar font is HMR-only: no boot-time application (the sidebar only
 *  renders after JS), so this sets the var directly instead of a -temp
 *  indirection. The default stack lives in tokens.css. */
export function applyUiSidebarFont(value: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!value) { root.style.removeProperty("--font-sidebar"); return; }
  const preset = UI_SIDEBAR_FONT_PRESETS.find((p) => p.id === value);
  root.style.setProperty("--font-sidebar", preset ? preset.value : value);
}

/** Font family presets for the Preview (HTML rendering) fonts. */
export type PreviewFontPreset = { id: string; label: string; value: string };

/** Default font for all HTML rendering (preview, SVAR, spreadsheet). */
export const PREVIEW_FONT_PRESETS: PreviewFontPreset[] = [
  { id: "fira-sans",  label: "Fira Sans",  value: '"Fira Sans", "Inter", "Ubuntu", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "inter",      label: "Inter",      value: '"Inter", "Ubuntu", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "ubuntu",     label: "Ubuntu",     value: '"Ubuntu", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "ubuntu-condensed", label: "Ubuntu Condensed", value: '"Ubuntu Condensed", "Ubuntu", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "system",     label: "System",     value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
];

/** Default mono font for all HTML rendering. */
export const PREVIEW_MONO_FONT_PRESETS: PreviewFontPreset[] = [
  { id: "fira-code",     label: "Fira Code",     value: '"Fira Code", "Ubuntu Mono", ui-monospace, SFMono-Regular, Menlo, monospace' },
  { id: "jetbrains-mono", label: "JetBrains Mono", value: '"JetBrains Mono", "Ubuntu Mono", ui-monospace, SFMono-Regular, Menlo, monospace' },
  { id: "ubuntu-mono",   label: "Ubuntu Mono",    value: '"Ubuntu Mono", ui-monospace, SFMono-Regular, Menlo, monospace' },
  { id: "system",        label: "System",         value: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
];

/** Apply the preview font-family via --font-preview-temp (cascade from tokens.css). */
export function applyPreviewFont(value: string, customName = "") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!value) { root.style.removeProperty("--font-preview-temp"); return; }
  const preset = PREVIEW_FONT_PRESETS.find((p) => p.id === value);
  const resolved = preset
    ? preset.value
    : resolveFontFamily(value as BodyFont, customName);
  root.style.setProperty("--font-preview-temp", resolved);
}

/** Apply the preview mono font-family via --font-preview-mono-temp. */
export function applyPreviewMonoFont(value: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!value) { root.style.removeProperty("--font-preview-mono-temp"); return; }
  const preset = PREVIEW_MONO_FONT_PRESETS.find((p) => p.id === value);
  const resolved = preset
    ? preset.value
    : resolveMonoFont(value as MonoFont);
  root.style.setProperty("--font-preview-mono-temp", resolved);
}

/** Font hinting presets */
export type FontHinting = "standard" | "none" | "full";

export const FONT_HINTING_OPTIONS: { id: FontHinting; labelKey: string }[] = [
  { id: "none",     labelKey: "settings.fontHintingNone" },
  { id: "standard", labelKey: "settings.fontHintingStandard" },
  { id: "full",     labelKey: "settings.fontHintingFull" },
];

export function applyFontHinting(value: FontHinting) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (value === "standard") root.removeAttribute("data-font-hinting");
  else root.setAttribute("data-font-hinting", value);
}

/** Font family presets for the UI */
export type UiFontPreset = { id: string; label: string; value: string };

export const UI_FONT_PRESETS: UiFontPreset[] = [
  { id: "inter",        label: "Inter",         value: '"Inter", "Ubuntu", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "ubuntu",       label: "Ubuntu",        value: '"Ubuntu", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "ubuntu-condensed", label: "Ubuntu Condensed", value: '"Ubuntu Condensed", "Ubuntu", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "system",       label: "System",        value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
];

export const UI_MONO_FONT_PRESETS: UiFontPreset[] = [
  { id: "jetbrains-mono", label: "JetBrains Mono", value: '"JetBrains Mono", "Ubuntu Mono", ui-monospace, SFMono-Regular, Menlo, monospace' },
  { id: "ubuntu-mono",    label: "Ubuntu Mono",    value: '"Ubuntu Mono", ui-monospace, SFMono-Regular, Menlo, monospace' },
  { id: "system",         label: "System",         value: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
];

export const UI_SIDEBAR_FONT_PRESETS: UiFontPreset[] = [
  { id: "ubuntu-condensed", label: "Ubuntu Condensed", value: '"Ubuntu Condensed", "Ubuntu", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "inter",            label: "Inter",            value: '"Inter", "Ubuntu", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "ubuntu",           label: "Ubuntu",           value: '"Ubuntu", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "system",           label: "System",           value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
];

function createGeneralSettings() {
  const mode = persistedState<DefaultEditorMode>(STORAGE_KEYS.defaultEditorMode, "prose");
  // nativeDecorations : pas d'onExternal — aucun effet de bord dans le setter
  // (appliqué par un $effect d'app.svelte, PROJET seul, cf. phase 1.3 §1.3.c).
  const nativeDeco = persistedState<boolean>(STORAGE_KEYS.nativeDecorations, true);
  const uiZoom = persistedState<number>(STORAGE_KEYS.uiScale, 1.0, undefined, applyZoom);
  const uiFont = persistedState<string>(STORAGE_KEYS.uiFontFamily, "", undefined, applyUiFont);
  const uiMono = persistedState<string>(STORAGE_KEYS.uiMonoFamily, "", undefined, applyUiMonoFont);
  const uiSidebar = persistedState<string>(STORAGE_KEYS.sidebarFontFamily, "", undefined, applyUiSidebarFont);
  // preview{Font,CustomFont} s'appliquent ensemble (applyPreviewFont prend les deux) :
  // chaque onExternal relit l'AUTRE store courant plutôt que la valeur qu'il vient
  // de recevoir, pour ne jamais appliquer une combinaison figée/périmée.
  const previewFont = persistedState<string>(STORAGE_KEYS.previewFontFamily, "", undefined,
    (v) => applyPreviewFont(v, previewCustomFont.current));
  const previewCustomFont = persistedState<string>(STORAGE_KEYS.previewCustomFontName, "", undefined,
    (v) => applyPreviewFont(previewFont.current, v));
  const previewMono = persistedState<string>(STORAGE_KEYS.previewMonoFamily, "", undefined, applyPreviewMonoFont);
  const hinting = persistedState<FontHinting>(STORAGE_KEYS.fontHinting, "standard", undefined, applyFontHinting);

  // L'application initiale (boot) est faite par initPresentation()
  // (src/shell/presentation.ts, phase 2.1) — explicite, une fois par
  // fenêtre, plutôt qu'un effet de bord implicite au premier import de ce
  // module (même correctif que initTheme() en phase 1.2 : un effet de bord
  // déclenché par n'importe quel import transitif est invisible et donc
  // facile à casser sans le remarquer).

  return {
    get defaultEditorMode() { return mode.current; },
    set defaultEditorMode(v: DefaultEditorMode) { mode.current = v; },

    get nativeDecorations() { return nativeDeco.current; },
    set nativeDecorations(v: boolean) { nativeDeco.current = v; },

    get uiScale() { return uiZoom.current as number; },
    set uiScale(v: number) { uiZoom.current = v; applyZoom(v); },

    get uiFontFamily() { return uiFont.current; },
    set uiFontFamily(v: string) { uiFont.current = v; applyUiFont(v); },

    get uiMonoFamily() { return uiMono.current; },
    set uiMonoFamily(v: string) { uiMono.current = v; applyUiMonoFont(v); },

    get uiSidebarFamily() { return uiSidebar.current; },
    set uiSidebarFamily(v: string) { uiSidebar.current = v; applyUiSidebarFont(v); },

    get previewFontFamily() { return previewFont.current; },
    set previewFontFamily(v: string) { previewFont.current = v; applyPreviewFont(v, previewCustomFont.current); },

    get previewCustomFontName() { return previewCustomFont.current; },
    set previewCustomFontName(v: string) { previewCustomFont.current = v; applyPreviewFont(previewFont.current, v); },

    get previewMonoFamily() { return previewMono.current; },
    set previewMonoFamily(v: string) { previewMono.current = v; applyPreviewMonoFont(v); },

    get fontHinting() { return hinting.current; },
    set fontHinting(v: FontHinting) { hinting.current = v; applyFontHinting(v); },

    reset() {
      mode.current = "prose";
      nativeDeco.current = true;
      uiZoom.current = 1.0;
      applyZoom(1.0);
      uiFont.current = "";
      uiMono.current = "";
      uiSidebar.current = "";
      previewFont.current = "";
      previewCustomFont.current = "";
      previewMono.current = "";
      hinting.current = "standard";
      applyFontHinting("standard");
      applyUiSidebarFont("");
    },
  };
}

export const generalSettings = createGeneralSettings();
