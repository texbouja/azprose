import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Diagnostic } from "@/lib/diagnostics";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import { logStore } from "@/components/console/log.svelte";
import { latexSettings } from "@/stores/latex-settings.svelte";
import { exists, readDir, remove } from "@tauri-apps/plugin-fs";
import { basename, dirname } from "@/lib";



export interface LatexState {
  viewerPdfPath: string | null;
  latexBuilding: boolean;
  latexViewerOn: boolean;
  latexSplitOn: boolean;
  buildRev: number;
  dependencies: string[];
  savingForBuild: boolean;
  rootFilePath: string | null;
}

export function createLatexState(): LatexState {
  return {
    viewerPdfPath: null,
    latexBuilding: false,
    latexViewerOn: false,
    latexSplitOn: false,
    buildRev: 0,
    dependencies: [],
    savingForBuild: false,
    rootFilePath: null,
  };
}

export function clearLatexDeps(state: LatexState): void {
  state.dependencies = [];
}

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

export function setupLatexLogListener(): () => void {
  const unlistenLogP = listen<{ line: string }>("latex://log", (e) => {
    logStore.append("latex", e.payload.line);
  });
  const unlistenCompleteP = listen("latex://build-complete", () => {
    logStore.set("latex", logStore.get("latex"));
  });
  let cancelled = false;
  let unlistenLog: (() => void) | undefined;
  let unlistenComplete: (() => void) | undefined;
  Promise.all([unlistenLogP, unlistenCompleteP]).then(([a, b]) => {
    if (cancelled) { a(); b(); return; }
    unlistenLog = a;
    unlistenComplete = b;
  });
  return () => {
    cancelled = true;
    unlistenLog?.();
    unlistenComplete?.();
  };
}

const LATEX_ARTIFACT_EXTS = new Set([".aux", ".log", ".out", ".toc", ".bbl", ".blg", ".fls", ".fdb_latexmk", ".synctex.gz", ".nav", ".snm", ".vrb"]);

/** Resolve the effective aux/out dirs: latexmkrc values override our settings store. */
async function resolveDirs(filePath: string): Promise<{ outDir: string; auxDir: string }> {
  try {
    const rc = await invoke<{ out_dir: string | null; aux_dir: string | null }>("latex_resolve_dirs", { path: filePath });
    return {
      outDir: rc.out_dir ?? latexSettings.current.outputDir,
      auxDir: rc.aux_dir ?? latexSettings.current.auxDir,
    };
  } catch {
    return {
      outDir: latexSettings.current.outputDir,
      auxDir: latexSettings.current.auxDir,
    };
  }
}

/** Remove only auxiliary files (no PDFs) for a single .tex file. */
export async function cleanLatexAux(filePath: string): Promise<void> {
  const name = basename(filePath).replace(/\.tex$/i, "");
  const { auxDir } = await resolveDirs(filePath);
  const dir = dirname(filePath);
  const auxPath = `${dir}/${auxDir}/${name}`;
  let count = 0;
  for (const ext of LATEX_ARTIFACT_EXTS) {
    const f = `${auxPath}${ext}`;
    if (await exists(f)) {
      await remove(f);
      count++;
    }
  }
  logStore.append("latex", `info: cleaned ${count} auxiliary file(s) for ${name}`);
}

/** Remove auxiliary files + PDFs for a single .tex file. */
export async function cleanLatexAuxAndOutput(filePath: string): Promise<void> {
  const name = basename(filePath).replace(/\.tex$/i, "");
  const { outDir, auxDir } = await resolveDirs(filePath);
  const dir = dirname(filePath);
  let count = 0;
  // Remove PDF from output dir
  const pdfPath = `${dir}/${outDir}/${name}.pdf`;
  if (await exists(pdfPath)) {
    await remove(pdfPath);
    count++;
  }
  // Remove auxiliary files from aux dir
  const auxPath = `${dir}/${auxDir}/${name}`;
  for (const ext of LATEX_ARTIFACT_EXTS) {
    const f = `${auxPath}${ext}`;
    if (await exists(f)) {
      await remove(f);
      count++;
    }
  }
  logStore.append("latex", `info: cleaned ${count} file(s) for ${name}`);
}

/** Remove all LaTeX artifacts (PDFs + aux files) from output and aux directories. */
export async function cleanLatexAll(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  const { outDir, auxDir } = await resolveDirs(filePath);
  let count = 0;

  for (const subdir of [outDir, auxDir]) {
    const dirPath = `${dir}/${subdir}`;
    if (!await exists(dirPath)) continue;
    const entries = await readDir(dirPath);
    for (const e of entries) {
      const name = e.name?.toLowerCase() ?? "";
      if (name.endsWith(".pdf") || [...LATEX_ARTIFACT_EXTS].some((ext) => name.endsWith(ext))) {
        await remove(`${dirPath}/${e.name}`);
        count++;
      }
    }
  }

  logStore.append("latex", `info: cleaned ${count} file(s)`);
}

/** Initialize .azprose/texmf/ with TDS structure. */
export async function initTexmf(projectRoot: string): Promise<string> {
  return invoke<string>("latex_init_texmf", { projectRoot });
}

/** Run mktexlsr/texhash on .azprose/texmf/ to rebuild ls-R database. */
export async function rehashTexmf(projectRoot: string): Promise<string> {
  return invoke<string>("latex_rehash_texmf", { projectRoot });
}
