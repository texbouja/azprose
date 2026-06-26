import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

export type TextAlign = "left" | "center" | "right";
export type HeadingFont = "inherit" | "fira-sans" | "inter" | "system" | "custom";
export type OlType = "decimal" | "lower-alpha" | "lower-roman" | "upper-alpha" | "upper-roman";

export interface ProseStyle {
  // Fonts — shared between writing and presentation
  fontFamily: "fira-sans" | "inter" | "system" | "custom";
  customFontName: string;
  monoFont: "fira-code" | "jetbrains-mono" | "system";
  // Writing layout
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  customCss: string;
  // Presentation layout
  presFontSize: number;
  presLineHeight: number;
  presMaxWidth: number;
  presCss: string;
  // Headings h1–h3 (shared between writing and presentation)
  h1Size: number;
  h1Align: TextAlign;
  h1FontFamily: HeadingFont;
  h1MarginTop: number;
  h1MarginBottom: number;
  h2Size: number;
  h2Align: TextAlign;
  h2FontFamily: HeadingFont;
  h2MarginTop: number;
  h2MarginBottom: number;
  h3Size: number;
  h3Align: TextAlign;
  h3FontFamily: HeadingFont;
  h3MarginTop: number;
  h3MarginBottom: number;
  // Ordered list nesting style
  olLevel1: OlType;
  olLevel2: OlType;
  olLevel3: OlType;
}

// Exact blocks written by older versions — stripped on first migration.
const LEGACY_LAYOUT_BLOCK =
  "/* ── Layout ──────────────────────────────────────── */\n" +
  ".cm-editor .cm-scroller { padding: 28px 36px 96px; line-height: 1.65; }\n" +
  ".cm-editor .cm-content  { font-size: 15px; max-width: 800px; }\n\n";

export const DEFAULT_CUSTOM_CSS = "";

export const DEFAULT_PROSE_STYLE: ProseStyle = {
  fontFamily: "fira-sans",
  customFontName: "",
  monoFont: "fira-code",
  fontSize: 15,
  lineHeight: 1.65,
  maxWidth: 800,
  customCss: DEFAULT_CUSTOM_CSS,
  presFontSize: 18,
  presLineHeight: 1.6,
  presMaxWidth: 900,
  presCss: "",
  h1Size: 2.1,
  h1Align: "left",
  h1FontFamily: "inherit",
  h1MarginTop: 0,
  h1MarginBottom: 0.5,
  h2Size: 1.55,
  h2Align: "left",
  h2FontFamily: "inherit",
  h2MarginTop: 2.0,
  h2MarginBottom: 0.5,
  h3Size: 1.25,
  h3Align: "left",
  h3FontFamily: "inherit",
  h3MarginTop: 1.6,
  h3MarginBottom: 0.5,
  olLevel1: "decimal",
  olLevel2: "lower-alpha",
  olLevel3: "lower-roman",
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
