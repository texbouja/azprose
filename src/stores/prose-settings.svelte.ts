import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

export type TextAlign = "left" | "center" | "right";
export type HeadingFont = "inherit" | "fira-sans" | "inter" | "system" | "custom";
export type OlType = "decimal" | "lower-alpha" | "lower-roman" | "upper-alpha" | "upper-roman";

export interface ProseStyle {
  // ── Prose (ProseMark) + Aperçu (MarkdownPreview) — shared settings ──────
  fontFamily: "fira-sans" | "inter" | "system" | "custom";
  customFontName: string;
  monoFont: "fira-code" | "jetbrains-mono" | "system";
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  customCss: string;
  // Headings h1–h3 (Prose: size/font/margins only; Aperçu: all incl. align)
  h1Size: number;
  h1Align: TextAlign;
  h1FontFamily: HeadingFont;
  h1CustomFontName: string;
  h1MarginTop: number;
  h1MarginBottom: number;
  h2Size: number;
  h2Align: TextAlign;
  h2FontFamily: HeadingFont;
  h2CustomFontName: string;
  h2MarginTop: number;
  h2MarginBottom: number;
  h3Size: number;
  h3Align: TextAlign;
  h3FontFamily: HeadingFont;
  h3CustomFontName: string;
  h3MarginTop: number;
  h3MarginBottom: number;
  // Ordered list nesting style
  olLevel1: OlType;
  olLevel2: OlType;
  olLevel3: OlType;

  // ── Présentation (SlideDeck) — independent settings ──────────────────────
  presFontFamily: "fira-sans" | "inter" | "system" | "custom";
  presCustomFontName: string;
  presMonoFont: "fira-code" | "jetbrains-mono" | "system";
  presFontSize: number;
  presLineHeight: number;
  presCss: string;
  presH1Size: number;
  presH1Align: TextAlign;
  presH1FontFamily: HeadingFont;
  presH1CustomFontName: string;
  presH1MarginTop: number;
  presH1MarginBottom: number;
  presH2Size: number;
  presH2Align: TextAlign;
  presH2FontFamily: HeadingFont;
  presH2CustomFontName: string;
  presH2MarginTop: number;
  presH2MarginBottom: number;
  presH3Size: number;
  presH3Align: TextAlign;
  presH3FontFamily: HeadingFont;
  presH3CustomFontName: string;
  presH3MarginTop: number;
  presH3MarginBottom: number;
}

// Exact blocks written by older versions — stripped on first migration.
const LEGACY_LAYOUT_BLOCK =
  "/* ── Layout ──────────────────────────────────────── */\n" +
  ".cm-editor .cm-scroller { padding: 28px 36px 96px; line-height: 1.65; }\n" +
  ".cm-editor .cm-content  { font-size: 15px; max-width: 800px; }\n\n";

export const DEFAULT_CUSTOM_CSS = "";

export const DEFAULT_PROSE_STYLE: ProseStyle = {
  // Prose + Aperçu
  fontFamily: "fira-sans",
  customFontName: "",
  monoFont: "fira-code",
  fontSize: 15,
  lineHeight: 1.65,
  maxWidth: 800,
  customCss: DEFAULT_CUSTOM_CSS,
  h1Size: 2.1,
  h1Align: "left",
  h1FontFamily: "inherit",
  h1CustomFontName: "",
  h1MarginTop: 0,
  h1MarginBottom: 0.5,
  h2Size: 1.55,
  h2Align: "left",
  h2FontFamily: "inherit",
  h2CustomFontName: "",
  h2MarginTop: 2.0,
  h2MarginBottom: 0.5,
  h3Size: 1.25,
  h3Align: "left",
  h3FontFamily: "inherit",
  h3CustomFontName: "",
  h3MarginTop: 1.6,
  h3MarginBottom: 0.5,
  olLevel1: "decimal",
  olLevel2: "lower-alpha",
  olLevel3: "lower-roman",
  // Présentation
  presFontFamily: "fira-sans",
  presCustomFontName: "",
  presMonoFont: "fira-code",
  presFontSize: 18,
  presLineHeight: 1.5,
  presCss: "",
  presH1Size: 1.8,
  presH1Align: "left",
  presH1FontFamily: "inherit",
  presH1CustomFontName: "",
  presH1MarginTop: 0,
  presH1MarginBottom: 0.5,
  presH2Size: 1.45,
  presH2Align: "left",
  presH2FontFamily: "inherit",
  presH2CustomFontName: "",
  presH2MarginTop: 0.6,
  presH2MarginBottom: 0.4,
  presH3Size: 1.2,
  presH3Align: "left",
  presH3FontFamily: "inherit",
  presH3CustomFontName: "",
  presH3MarginTop: 0.6,
  presH3MarginBottom: 0.3,
};

export function resolveFontFamily(key: ProseStyle["fontFamily"], customName?: string): string {
  switch (key) {
    case "fira-sans":
      return "'Fira Sans', -apple-system, BlinkMacSystemFont, sans-serif";
    case "inter":
      return "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
    case "custom":
      return customName?.trim()
        ? `'${customName.trim()}', -apple-system, BlinkMacSystemFont, sans-serif`
        : "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    default:
      return "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }
}

export function resolveMonoFont(key: ProseStyle["monoFont"]): string {
  switch (key) {
    case "fira-code":
      return "'Fira Code', ui-monospace, SFMono-Regular, monospace";
    case "jetbrains-mono":
      return "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";
    default:
      return "ui-monospace, SFMono-Regular, Menlo, monospace";
  }
}

export function resolveHeadingFont(key: HeadingFont, customName: string): string {
  if (key === "inherit") return "inherit";
  if (key === "custom") {
    return customName.trim()
      ? `'${customName.trim()}', -apple-system, BlinkMacSystemFont, sans-serif`
      : "inherit";
  }
  return resolveFontFamily(key as ProseStyle["fontFamily"]);
}


function createProseSettings() {
  const stored = persistedState<ProseStyle>(STORAGE_KEYS.proseStyle, DEFAULT_PROSE_STYLE);

  // Ensure every field has a valid value — handles incremental field additions across releases.
  // Uses a null-filter merge so that undefined/null stored fields fall back to the defaults,
  // while valid stored values (including 0 and "") are preserved.
  const cur = stored.current as unknown as Record<string, unknown>;
  const hasGap = (Object.keys(DEFAULT_PROSE_STYLE) as string[]).some((k) => cur[k] == null);
  if (hasGap) {
    const css = typeof cur.customCss === "string" ? cur.customCss : DEFAULT_CUSTOM_CSS;
    const validStored = Object.fromEntries(
      Object.entries(cur).filter(([, v]) => v != null),
    ) as Partial<ProseStyle>;
    stored.current = {
      ...DEFAULT_PROSE_STYLE,
      ...validStored,
      customCss: css.startsWith(LEGACY_LAYOUT_BLOCK) ? css.slice(LEGACY_LAYOUT_BLOCK.length) : css,
    };
  }

  return {
    get current() { return stored.current; },
    patch(partial: Partial<ProseStyle>) { stored.current = { ...stored.current, ...partial }; },
    reset() { stored.current = { ...DEFAULT_PROSE_STYLE }; },
  };
}

export const proseSettings = createProseSettings();
