import { basename, dirname } from "@/lib";
import { logStore } from "@/components/console/log.svelte";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import { refreshFromPreview } from "./diagnostics";
import { exportPdf } from "./backend";
import type { TypstBuildState } from "./types";

export type { TypstBuildState } from "./types";

export function pdfName(path: string): string {
  return basename(path).replace(/\.typ$/i, ".pdf");
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
    const outPath = dirname(filePath) + "/" + pdfName(filePath);
    await exportPdf(filePath, source, outPath);
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
  const pdfPath = dirname(filePath) + "/" + pdfName(filePath);
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
      await exportPdf(filePath, source, pdfPath);
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

export function closeViewer(state: TypstBuildState): void {
  state.viewerPdfPath = null;
}
