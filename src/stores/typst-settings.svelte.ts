import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

export type FormatterMode = "disable" | "typstyle" | "typstfmt";
export type ExportPdfMode = "never" | "onSave" | "onType";
export type LintWhen = "onSave" | "onType";

export interface TypstSettings {
  // Formatter
  formatterMode: FormatterMode;
  formatterPrintWidth: number;
  formatterIndentSize: number;
  // Export
  exportPdf: ExportPdfMode;
  outputPath: string;
  // Lint
  lintEnabled: boolean;
  lintWhen: LintWhen;
  // Fonts
  systemFonts: boolean;
  // Advanced
  semanticTokens: boolean;
  typstExtraArgs: string;
}

const DEFAULTS: TypstSettings = {
  formatterMode: "typstyle",
  formatterPrintWidth: 120,
  formatterIndentSize: 2,
  exportPdf: "never",
  outputPath: "output",
  lintEnabled: false,
  lintWhen: "onSave",
  systemFonts: true,
  semanticTokens: true,
  typstExtraArgs: "",
};

function createTypstSettings() {
  const stored = persistedState<TypstSettings>(STORAGE_KEYS.typstSettings, { ...DEFAULTS });

  return {
    get current() { return stored.current; },
    patch(patch: Partial<TypstSettings>) {
      stored.current = { ...stored.current, ...patch };
    },
    reset() { stored.current = { ...DEFAULTS }; },
  };
}

export const typstSettings = createTypstSettings();
