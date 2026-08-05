import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";
// Les résolveurs de polices vivent dans un module PUR (lib/font-resolvers) —
// testable sans la chaîne Svelte. Ré-exportés ici pour compatibilité (les
// consommateurs continuent d'importer depuis ce store).
export { resolveFontFamily, resolveMonoFont, resolveHeadingFont } from "@/lib/font-resolvers";

export type TextAlign = "left" | "center" | "right";
export type HeadingFont = "inherit" | "fira-sans" | "inter" | "ubuntu" | "system" | "custom";
export type OlType = "decimal" | "lower-alpha" | "lower-roman" | "upper-alpha" | "upper-roman";
export type BodyFont = "fira-sans" | "inter" | "ubuntu" | "ubuntu-condensed" | "system" | "custom";
export type MonoFont = "fira-code" | "jetbrains-mono" | "ubuntu-mono" | "system";
export type CsvBodyFont = "fira-sans" | "inter" | "ubuntu" | "ubuntu-condensed" | "system" | "custom";

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

// ── Printing (independent copy — same shape as Preview) ───────────────────
// Section « Printing » des réglages : une copie indépendante de Preview qui
// ne s'applique QU'AUX rendus d'impression (md→PDF, planches de colles PDF,
// emails de colles et images archivées en PNG) — jamais à l'aperçu à l'écran
// ni au mode prose. Même forme que PreviewStyle (décision : copie fidèle).
// Le CSS est généré par `lib/prose-style-css.ts` (pur, testable).

export type PrintStyle = PreviewStyle;

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

export const DEFAULT_PRINT_STYLE: PrintStyle = { ...DEFAULT_PREVIEW_STYLE };

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

function createPrintSettings() {
  const stored = persistedState<PrintStyle>(STORAGE_KEYS.printStyle, { ...DEFAULT_PRINT_STYLE });
  stored.current = gapFill(stored.current, DEFAULT_PRINT_STYLE);
  return {
    get current() { return stored.current; },
    patch(partial: Partial<PrintStyle>) { stored.current = { ...stored.current, ...partial }; },
    reset() { stored.current = { ...DEFAULT_PRINT_STYLE }; },
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
export const printSettings = createPrintSettings();
export const presentationSettings = createPresentationSettings();
export const csvSettings = createCsvSettings();
