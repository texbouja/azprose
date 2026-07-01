// Per-component typography (Étape 2). Themes carry colors only; fonts/sizes/spacing
// live here, split into two groups the user controls independently:
//   • Markdown  → rendered prose (ProseMark widgets) + the Preview pane
//   • Code      → the raw text / source editor (CodeMirror), all plain-text formats
// UI fonts stay locked. Persisted per project in .azprose/config.json.

export type FontSize = "small" | "default" | "large" | "x-large";
export type LineHeight = "compact" | "comfortable" | "airy";
export type TextAlign = "left" | "justify";

export const FONT_SIZE_OPTIONS: FontSize[] = ["small", "default", "large", "x-large"];
export const LINE_HEIGHT_OPTIONS: LineHeight[] = ["compact", "comfortable", "airy"];
export const TEXT_ALIGN_OPTIONS: TextAlign[] = ["left", "justify"];

export type TypographySettings = {
  // Markdown group: rendered prose + preview
  markdownFont: string; // "" = default (inherit)
  markdownFontSize: FontSize;
  markdownLineHeight: LineHeight;
  markdownAlign: TextAlign;
  // Code / plain-text group: source editor
  codeFont: string; // "" = default
  codeFontSize: FontSize;
  codeLineHeight: LineHeight;
  codeLineNumbers: boolean;
};

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  markdownFont: "",
  markdownFontSize: "default",
  markdownLineHeight: "comfortable",
  markdownAlign: "left",
  codeFont: "",
  codeFontSize: "default",
  codeLineHeight: "comfortable",
  codeLineNumbers: true,
};

// Curated, dependency-free font presets (system / web-safe stacks, no bundled files).
// value "" means "theme default"; a preset's value is a full CSS font-family stack.
// Advanced users can also type any CSS family via the free-text field.
export type FontPreset = { id: string; label: string; value: string };

export const PROSE_FONT_PRESETS: FontPreset[] = [
  { id: "default", label: "default", value: "" },
  { id: "sans", label: "sans (Inter)", value: '"Inter", system-ui, sans-serif' },
  { id: "serif", label: "serif (Georgia)", value: 'Georgia, Cambria, "Times New Roman", serif' },
  { id: "charter", label: "Charter", value: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif' },
  { id: "system", label: "system", value: "system-ui, sans-serif" },
];

export const CODE_FONT_PRESETS: FontPreset[] = [
  { id: "default", label: "default (JetBrains)", value: "" },
  { id: "fira", label: "Fira Code", value: '"Fira Code", ui-monospace, monospace' },
  { id: "cascadia", label: "Cascadia Code", value: '"Cascadia Code", ui-monospace, monospace' },
  { id: "system", label: "system mono", value: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
];

// Size scales — kept per group (markdown a touch larger than code, as before).
const MARKDOWN_FONT_PX: Record<FontSize, string> = {
  small: "14px",
  default: "15px",
  large: "17px",
  "x-large": "19px",
};
const CODE_FONT_PX: Record<FontSize, string> = {
  small: "13px",
  default: "14px",
  large: "16px",
  "x-large": "18px",
};
const MARKDOWN_LINE_HEIGHT: Record<LineHeight, string> = {
  compact: "1.55",
  comfortable: "1.65",
  airy: "1.8",
};
const CODE_LINE_HEIGHT: Record<LineHeight, string> = {
  compact: "1.45",
  comfortable: "1.55",
  airy: "1.75",
};

function normalizeOption<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && options.includes(value as T) ? (value as T) : fallback;
}

export function normalizeFontSize(value: unknown): FontSize {
  return normalizeOption(value, FONT_SIZE_OPTIONS, "default");
}
export function normalizeLineHeight(value: unknown): LineHeight {
  return normalizeOption(value, LINE_HEIGHT_OPTIONS, "comfortable");
}
export function normalizeTextAlign(value: unknown): TextAlign {
  return normalizeOption(value, TEXT_ALIGN_OPTIONS, "left");
}
export function normalizeFontFamily(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 200) : "";
}

/** CSS custom properties applied on the app root for the given typography settings. */
export function getTypographyVars(t: TypographySettings): Record<string, string> {
  const vars: Record<string, string> = {
    "--prose-font-size": MARKDOWN_FONT_PX[t.markdownFontSize],
    "--prose-line-height": MARKDOWN_LINE_HEIGHT[t.markdownLineHeight],
    "--prose-align": t.markdownAlign,
    "--writing-font-size": CODE_FONT_PX[t.codeFontSize],
    "--writing-line-height": CODE_LINE_HEIGHT[t.codeLineHeight],
  };
  // Only override the family when the user picked one, so themes/defaults win otherwise.
  if (t.markdownFont) vars["--font-prose"] = t.markdownFont;
  if (t.codeFont) vars["--font-mono"] = t.codeFont;
  return vars;
}
