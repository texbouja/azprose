import { basename, dirname } from "@/lib";
import { remove, exists, readDir } from "@tauri-apps/plugin-fs";
import { logStore } from "@/components/console/log.svelte";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import { refreshFromPreview } from "./diagnostics";
import { exportPdf } from "./backend";
import type { TypstBuildState } from "./types";

export type { TypstBuildState } from "./types";

export function pdfName(path: string): string {
  return basename(path).replace(/\.typ$/i, ".pdf");
}

/** Resolve output path — PDF lives next to the .typ source file. */
export function resolveOutputPath(filePath: string): string {
  const dir = dirname(filePath);
  const name = basename(filePath).replace(/\.typ$/i, "");
  return dir + "/" + name + ".pdf";
}

export async function build(
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
    const ok = await refreshFromPreview(filePath, source, {
      log: true,
      onOpenConsole,
      onSwitchToLogTab,
    });
    if (!ok) { logStore.append("typst", "error: build aborted — fatal error"); return; }
    await exportPdf(filePath, source);
    logStore.append("typst", `info: exported ${pdfName(filePath)}`);
    onSwitchToLogTab?.();
    notifySaved?.(pdfName(filePath));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : (typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : `${err}`);
    diagnosticsStore.set("typst", [{ severity: "error", message: msg }]);
    logStore.append("typst", `error: ${msg}`);
    onSwitchToLogTab?.();
    onOpenConsole?.();
  } finally {
    state.exporting = false;
  }
}

export async function openViewer(
  state: TypstBuildState,
  filePath: string,
  source: string,
  handleSave?: () => Promise<void>,
  onOpenConsole?: () => void,
  onOpenPdfInSide?: (pdfPath: string) => void,
): Promise<void> {
  if (state.compiling) return;
  await handleSave?.();
  const pdfPath = resolveOutputPath(filePath);
  const { getMtime } = await import("@/lib");
  const [srcMtime, pdfMtime] = await Promise.all([getMtime(filePath), getMtime(pdfPath)]);
  const needsCompile = pdfMtime === null || (srcMtime !== null && srcMtime > pdfMtime);
  if (needsCompile) {
    state.compiling = true;
    const ok = await refreshFromPreview(filePath, source, {
      log: true,
      onOpenConsole,
      onSwitchToLogTab: () => {},
    });
    if (!ok) { logStore.append("typst", "error: viewer aborted — fatal error"); state.compiling = false; return; }
    try {
      await exportPdf(filePath, source);
      logStore.append("typst", `info: exported ${basename(pdfPath)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : `${err}`);
      diagnosticsStore.set("typst", [{ severity: "error", message: msg }]);
      logStore.append("typst", `error: ${msg}`);
      state.compiling = false;
      return;
    }
    state.compiling = false;
  }
  state.viewerPdfPath = pdfPath;
  onOpenPdfInSide?.(pdfPath);
}

export function closeViewer(state: TypstBuildState): void {
  state.viewerPdfPath = null;
}

/** Remove the exported PDF for a single .typ file. */
export async function cleanBuild(filePath: string): Promise<void> {
  const pdf = resolveOutputPath(filePath);
  if (await exists(pdf)) {
    await remove(pdf);
    logStore.append("typst", `info: removed ${basename(pdf)}`);
  }
}

/** Remove all Typst PDFs in the source file's directory. */
export async function cleanAll(projectRoot: string): Promise<void> {
  if (!await exists(projectRoot)) return;
  const entries = await readDir(projectRoot);
  let count = 0;
  for (const e of entries) {
    if (e.name?.endsWith(".pdf")) {
      await remove(projectRoot + "/" + e.name);
      count++;
    }
  }
  logStore.append("typst", `info: cleaned ${count} PDF(s)`);
}
