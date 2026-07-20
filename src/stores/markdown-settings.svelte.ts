import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

export type TextAlign = "left" | "center" | "right";
export type HeadingFont = "inherit" | "fira-sans" | "inter" | "system" | "custom";
export type OlType = "decimal" | "lower-alpha" | "lower-roman" | "upper-alpha" | "upper-roman";
export type BodyFont = "fira-sans" | "inter" | "system" | "custom";
export type MonoFont = "fira-code" | "jetbrains-mono" | "system";
export type CsvBodyFont = "fira-sans" | "inter" | "system" | "custom";

// ── ProseMark editing mode ─────────────────────────────────────────────────

export interface ProseMarkStyle {
  fontFamily: BodyFont;
  customFontName: string;
  monoFont: MonoFont;
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  customCss: string;
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
  olLevel1: OlType;
  olLevel2: OlType;
  olLevel3: OlType;
}

// ── Preview panel (independent copy — same shape as ProseMark) ──────────────

export type PreviewStyle = ProseMarkStyle;

// ── Presentation / SlideDeck ────────────────────────────────────────────────

export interface PresentationStyle {
  fontFamily: BodyFont;
  customFontName: string;
  monoFont: MonoFont;
  fontSize: number;
  lineHeight: number;
  customCss: string;
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
}

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_PROSE_MARK_STYLE: ProseMarkStyle = {
  fontFamily: "fira-sans",
  customFontName: "",
  monoFont: "fira-code",
  fontSize: 15,
  lineHeight: 1.65,
  maxWidth: 800,
  customCss: "",
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
};

export const DEFAULT_PREVIEW_STYLE: PreviewStyle = { ...DEFAULT_PROSE_MARK_STYLE };

export const DEFAULT_PRESENTATION_STYLE: PresentationStyle = {
  fontFamily: "fira-sans",
  customFontName: "",
  monoFont: "fira-code",
  fontSize: 18,
  lineHeight: 1.5,
  customCss: "",
  h1Size: 1.8,
  h1Align: "left",
  h1FontFamily: "inherit",
  h1CustomFontName: "",
  h1MarginTop: 0,
  h1MarginBottom: 0.5,
  h2Size: 1.45,
  h2Align: "left",
  h2FontFamily: "inherit",
  h2CustomFontName: "",
  h2MarginTop: 0.6,
  h2MarginBottom: 0.4,
  h3Size: 1.2,
  h3Align: "left",
  h3FontFamily: "inherit",
  h3CustomFontName: "",
  h3MarginTop: 0.6,
  h3MarginBottom: 0.3,
};

// ── CsvStyle ──────────────────────────────────────────────────────────────

export type CsvStyle = {
  fontFamily: CsvBodyFont;
  customFontName: string;
  fontSize: number;
  lineHeight: number;
};

const DEFAULT_CSV_STYLE: CsvStyle = {
  fontFamily: "system",
  customFontName: "",
  fontSize: 13,
  lineHeight: 1.4,
};

// ── Font resolution helpers ─────────────────────────────────────────────────

export function resolveFontFamily(key: BodyFont, customName?: string): string {
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

export function resolveMonoFont(key: MonoFont): string {
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
  return resolveFontFamily(key as BodyFont);
}

// ── Store factory ───────────────────────────────────────────────────────────

function gapFill<T extends object>(stored: T, defaults: T): T {
  const cur = stored as Record<string, unknown>;
  const def = defaults as Record<string, unknown>;
  const hasGap = Object.keys(def).some((k) => cur[k] == null);
  if (!hasGap) return stored;
  const valid = Object.fromEntries(
    Object.entries(cur).filter(([, v]) => v != null),
  );
  return { ...def, ...valid } as T;
}

function createProseMarkSettings() {
  const stored = persistedState<ProseMarkStyle>(STORAGE_KEYS.proseMarkStyle, { ...DEFAULT_PROSE_MARK_STYLE });
  stored.current = gapFill(stored.current, DEFAULT_PROSE_MARK_STYLE);
  return {
    get current() { return stored.current; },
    patch(partial: Partial<ProseMarkStyle>) { stored.current = { ...stored.current, ...partial }; },
    reset() { stored.current = { ...DEFAULT_PROSE_MARK_STYLE }; },
  };
}

function createPreviewSettings() {
  const stored = persistedState<PreviewStyle>(STORAGE_KEYS.previewStyle, { ...DEFAULT_PREVIEW_STYLE });
  stored.current = gapFill(stored.current, DEFAULT_PREVIEW_STYLE);
  return {
    get current() { return stored.current; },
    patch(partial: Partial<PreviewStyle>) { stored.current = { ...stored.current, ...partial }; },
    reset() { stored.current = { ...DEFAULT_PREVIEW_STYLE }; },
  };
}

function createPresentationSettings() {
  const stored = persistedState<PresentationStyle>(STORAGE_KEYS.presentationStyle, { ...DEFAULT_PRESENTATION_STYLE });
  stored.current = gapFill(stored.current, DEFAULT_PRESENTATION_STYLE);
  return {
    get current() { return stored.current; },
    patch(partial: Partial<PresentationStyle>) { stored.current = { ...stored.current, ...partial }; },
    reset() { stored.current = { ...DEFAULT_PRESENTATION_STYLE }; },
  };
}

function createCsvSettings() {
  const stored = persistedState<CsvStyle>(STORAGE_KEYS.csvStyle, { ...DEFAULT_CSV_STYLE });
  stored.current = gapFill(stored.current, DEFAULT_CSV_STYLE);
  return {
    get current() { return stored.current; },
    patch(partial: Partial<CsvStyle>) { stored.current = { ...stored.current, ...partial }; },
    reset() { stored.current = { ...DEFAULT_CSV_STYLE }; },
  };
}

// ── Exports ─────────────────────────────────────────────────────────────────

export const proseMarkSettings = createProseMarkSettings();
export const previewSettings = createPreviewSettings();
export const presentationSettings = createPresentationSettings();
export const csvSettings = createCsvSettings();
