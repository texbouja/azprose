import { invoke } from "@tauri-apps/api/core";
import type { Diagnostic } from "@/lib/diagnostics";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import { logStore } from "@/components/console/log.svelte";
import { basename, dirname } from "@/lib";

export interface TypstBuildState {
  compiling: boolean;
  exporting: boolean;
  viewerPdfPath: string | null;
}

export function createTypstBuildState(): TypstBuildState {
  return {
    compiling: false,
    exporting: false,
    viewerPdfPath: null,
  };
}

export function pdfName(path: string): string {
  return basename(path).replace(/\.typ$/i, ".pdf");
}

/** Compile the current .typ for diagnostics only (no file output) and surface
 *  them in the console. Returns true if there is no fatal error (safe to export).
 *  When { log: true } the build is also recorded in the Log tab. */
export async function refreshDiagnostics(
  _state: TypstBuildState,
  filePath: string,
  source: string,
  opts?: { log?: boolean; onOpenConsole?: () => void; onSwitchToLogTab?: () => void },
): Promise<boolean> {
  if (!filePath) return false;
  const shouldLog = opts?.log ?? false;
  if (shouldLog) {
    logStore.clear("typst");
    logStore.append("typst", `info: typst compilation started`);
    logStore.append("typst", `info: compiling ${basename(filePath)}`);
  }
  try {
    const res = await invoke<{ svg: string | null; diagnostics: Diagnostic[]; pages: number }>(
      "typst_preview",
      { filePath, source },
    );
    const diags = res.diagnostics ?? [];
    diagnosticsStore.set("typst", diags);
    if (shouldLog) {
      for (const d of diags) {
        const loc = d.line ? `line ${d.line}${d.col ? `, col ${d.col}` : ""}` : "";
        logStore.append("typst", `  ${d.severity}${loc ? ` (${loc})` : ""}: ${d.message}`);
        for (const h of d.hints ?? []) logStore.append("typst", `    hint: ${h}`);
      }
      const errs = diags.filter((d) => d.severity === "error").length;
      const warns = diags.filter((d) => d.severity === "warning").length;
      logStore.append("typst", `info: finished — ${errs} error${errs !== 1 ? "s" : ""}, ${warns} warning${warns !== 1 ? "s" : ""}`);
      opts?.onSwitchToLogTab?.();
    }
    if (diags.some((d) => d.severity === "error")) opts?.onOpenConsole?.();
    return res.svg !== null;
  } catch (err) {
    diagnosticsStore.set("typst", [{ severity: "error", message: `${err}` }]);
    if (shouldLog) logStore.append("typst", `error: ${err}`);
    opts?.onOpenConsole?.();
    return false;
  }
}

export async function handleBuild(
  state: TypstBuildState,
  filePath: string,
  source: string,
  handleSave?: () => Promise<void>,
  onOpenConsole?: () => void,
  onSwitchToLogTab?: () => void,
  notifySaved?: (name: string) => void,
): Promise<void> {
  if (!filePath || state.exporting) return;
  state.exporting = true;
  if (handleSave) await handleSave();
  try {
    const ok = await refreshDiagnostics(state, filePath, source, {
      log: true,
      onOpenConsole,
      onSwitchToLogTab,
    });
    if (!ok) { logStore.append("typst", "error: build aborted — fatal error"); return; }
    const outPath = dirname(filePath) + "/" + pdfName(filePath);
    await invoke("typst_export_pdf", { filePath, source, path: outPath });
    logStore.append("typst", `info: exported ${pdfName(filePath)}`);
    onSwitchToLogTab?.();
    notifySaved?.(pdfName(filePath));
  } catch (err) {
    diagnosticsStore.set("typst", [{ severity: "error", message: `${err}` }]);
    logStore.append("typst", `error: ${err}`);
    onSwitchToLogTab?.();
    onOpenConsole?.();
  } finally {
    state.exporting = false;
  }
}

export async function handleToggleViewer(
  state: TypstBuildState,
  filePath: string,
  source: string,
  handleSave?: () => Promise<void>,
  onOpenConsole?: () => void,
  onOpenPdfInSide?: (pdfPath: string) => void,
): Promise<void> {
  if (state.compiling) return;
  await handleSave?.();
  const pdfPath = dirname(filePath) + "/" + pdfName(filePath);
  const { getMtime } = await import("@/lib");
  const [srcMtime, pdfMtime] = await Promise.all([getMtime(filePath), getMtime(pdfPath)]);
  const needsCompile = pdfMtime === null || (srcMtime !== null && srcMtime > pdfMtime);
  if (needsCompile) {
    state.compiling = true;
    const ok = await refreshDiagnostics(state, filePath, source, {
      log: true,
      onOpenConsole,
      onSwitchToLogTab: () => {},
    });
    if (!ok) { logStore.append("typst", "error: viewer aborted — fatal error"); state.compiling = false; return; }
    try {
      await invoke("typst_export_pdf", { filePath, source, path: pdfPath });
      logStore.append("typst", `info: exported ${basename(pdfPath)}`);
    } catch (err) {
      diagnosticsStore.set("typst", [{ severity: "error", message: `${err}` }]);
      logStore.append("typst", `error: ${err}`);
      state.compiling = false;
      return;
    }
    state.compiling = false;
  }
  state.viewerPdfPath = pdfPath;
  onOpenPdfInSide?.(pdfPath);
}

export function handleCodeView(state: TypstBuildState): void {
  state.viewerPdfPath = null;
}
