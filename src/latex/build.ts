import { invoke } from "@tauri-apps/api/core";
import type { Diagnostic } from "@/lib/diagnostics";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import { logStore } from "@/components/console/log.svelte";
import { latexSettings } from "@/stores/latex-settings.svelte";
import type { LatexState } from "./types";

/** Check if `savedPath` is a known dependency of the current LaTeX project
 *  and, if so, auto-trigger a build on the root file. Returns true if a build was launched. */
export function autoBuildIfDepChanged(
  state: LatexState,
  savedPath: string,
  handleBuild: () => void,
): boolean {
  if (state.latexBuilding) return false;
  if (state.savingForBuild) return false;
  if (!state.rootFilePath || state.dependencies.length === 0) return false;
  const norm = (p: string) => p.replace(/\\/g, "/");
  const saved = norm(savedPath);
  if (state.dependencies.some((d) => norm(d) === saved)) {
    handleBuild();
    return true;
  }
  return false;
}

export async function handleLatexBuild(
  state: LatexState,
  activePath: string | null,
  handleSave?: () => Promise<void>,
  handleSaveAll?: (deps: string[]) => Promise<void>,
  onOpenConsole?: () => void,
  onSwitchToLogTab?: () => void,
): Promise<void> {
  if (!activePath || state.latexBuilding) return;

  // Always build the root/master file if known, even if triggered from an \input
  const buildPath = state.rootFilePath ?? activePath;

  state.savingForBuild = true;
  if (handleSave) await handleSave();
  if (handleSaveAll && state.rootFilePath) {
    await handleSaveAll(state.dependencies);
  }
  state.savingForBuild = false;

  logStore.clear("latex");
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
      dependencies: string[];
    }>("latex_build", {
      path: buildPath,
      engine: latexSettings.current.engine,
      shellEscape: latexSettings.current.shellEscape,
      maxRuns: latexSettings.current.maxRuns,
      outDir: latexSettings.current.outputDir,
      auxDir: latexSettings.current.auxDir,
    });
    const diags = (res.diagnostics ?? []).map((d) => ({
      ...d,
      severity: d.severity === "error" ? ("error" as const) : ("warning" as const),
    }));
    if (diags.length > 0) diagnosticsStore.set("latex", diags);
    if (diags.some((d) => d.severity === "error")) onOpenConsole?.();
    if (res.pdf_path) {
      state.viewerPdfPath = res.pdf_path;
      state.buildRev++;
      state.dependencies = res.dependencies ?? [];
      state.rootFilePath = buildPath;
    } else {
      if (res.dependencies?.length) state.dependencies = res.dependencies;
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
  handleSaveAll?: (deps: string[]) => Promise<void>,
  onOpenConsole?: () => void,
): Promise<void> {
  if (state.latexViewerOn) {
    state.latexViewerOn = false;
    state.viewerPdfPath = null;
    return;
  }
  if (!activePath || state.latexBuilding) return;
  await handleLatexBuild(state, activePath, handleSave, handleSaveAll, onOpenConsole);
  if (state.viewerPdfPath) {
    state.latexSplitOn = false;
    state.latexViewerOn = true;
  }
}
