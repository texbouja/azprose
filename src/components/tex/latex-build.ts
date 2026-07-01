import { invoke } from "@tauri-apps/api/core";
import type { Diagnostic } from "@/lib/diagnostics";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";

export interface LatexState {
  viewerPdfPath: string | null;
  latexBuilding: boolean;
  latexViewerOn: boolean;
  latexSplitOn: boolean;
  latexEngine: string;
  buildRev: number;
  buildLog: string[];
}

export function createLatexState(): LatexState {
  return {
    viewerPdfPath: null,
    latexBuilding: false,
    latexViewerOn: false,
    latexSplitOn: false,
    latexEngine: "pdflatex",
    buildRev: 0,
    buildLog: [],
  };
}

export function clearLatexLog(state: LatexState): void {
  state.buildLog = [];
}

export async function handleLatexBuild(
  state: LatexState,
  activePath: string | null,
  handleSave?: () => Promise<void>,
  onOpenConsole?: () => void,
  onSwitchToLogTab?: () => void,
): Promise<void> {
  if (!activePath || state.latexBuilding) return;
  if (handleSave) await handleSave();

  state.buildLog = [];
  diagnosticsStore.set("latex", [{
    severity: "info",
    message: "Compilation started…",
    source: "latex",
  } as Diagnostic]);
  onSwitchToLogTab?.();

  state.latexBuilding = true;
  try {
    const res = await invoke<{
      pdf_path: string | null;
      diagnostics: Diagnostic[];
    }>("latex_build", { path: activePath, engine: state.latexEngine });
    const diags = (res.diagnostics ?? []).map((d) => ({
      ...d,
      severity: d.severity === "error" ? ("error" as const) : ("warning" as const),
    }));
    if (diags.length > 0) diagnosticsStore.set("latex", diags);
    if (diags.some((d) => d.severity === "error")) onOpenConsole?.();
    if (res.pdf_path) {
      state.viewerPdfPath = res.pdf_path;
      state.buildRev++;
    }
  } catch (err) {
    diagnosticsStore.set("latex", [{ severity: "error", message: `${err}`, source: "latex" }]);
    onOpenConsole?.();
  } finally {
    state.latexBuilding = false;
  }
}

export async function handleLatexViewer(
  state: LatexState,
  activePath: string | null,
  handleSave?: () => Promise<void>,
  onOpenConsole?: () => void,
): Promise<void> {
  if (state.latexViewerOn) {
    state.latexViewerOn = false;
    state.viewerPdfPath = null;
    return;
  }
  if (!activePath || state.latexBuilding) return;
  await handleLatexBuild(state, activePath, handleSave, onOpenConsole);
  if (state.viewerPdfPath) {
    state.latexSplitOn = false;
    state.latexViewerOn = true;
  }
}

export async function handleLatexSplit(
  state: LatexState,
  activePath: string | null,
  handleSave?: () => Promise<void>,
  onOpenConsole?: () => void,
): Promise<void> {
  if (state.latexSplitOn) {
    state.latexSplitOn = false;
    return;
  }
  if (!activePath || state.latexBuilding) return;
  await handleLatexBuild(state, activePath, handleSave, onOpenConsole);
  if (state.viewerPdfPath) {
    state.latexViewerOn = false;
    state.latexSplitOn = true;
  }
}

export function handleLatexCodeView(state: LatexState): void {
  state.latexViewerOn = false;
  state.latexSplitOn = false;
  state.viewerPdfPath = null;
}
