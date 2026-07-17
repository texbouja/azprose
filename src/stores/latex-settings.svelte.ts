import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

export type LatexCompilerEngine = "pdflatex" | "xelatex" | "lualatex";
export type BibtexMode = "auto" | "bibtex" | "biber" | "disabled";

export interface LatexSettings {
  engine: LatexCompilerEngine;
  shellEscape: boolean;
  outputDir: string;
  auxDir: string;
  maxRuns: number;
  bibtex: BibtexMode;
}

const DEFAULTS: LatexSettings = {
  engine: "pdflatex",
  shellEscape: false,
  outputDir: "output",
  auxDir: "auxdir",
  maxRuns: 5,
  bibtex: "auto",
};

function createLatexSettings() {
  const stored = persistedState<LatexSettings>(STORAGE_KEYS.latexSettings, { ...DEFAULTS });

  return {
    get current() { return stored.current; },
    patch(patch: Partial<LatexSettings>) {
      stored.current = { ...stored.current, ...patch };
    },
    reset() { stored.current = { ...DEFAULTS }; },
  };
}

export const latexSettings = createLatexSettings();
