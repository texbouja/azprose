import { basename, dirname } from "@/lib";
import { remove, exists, readDir } from "@tauri-apps/plugin-fs";
import { logStore } from "@/components/console/log.svelte";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import { typstSettings } from "@/stores/typst-settings.svelte";
import { refreshFromPreview } from "./diagnostics";
import { exportPdf } from "./backend";
import type { TypstBuildState } from "./types";

export type { TypstBuildState } from "./types";

export function pdfName(path: string): string {
  return basename(path).replace(/\.typ$/i, ".pdf");
}

/** Resolve output path from the configured template (default "output" = subdirectory). */
export function resolveOutputPath(filePath: string): string {
  const dir = dirname(filePath);
  const name = basename(filePath).replace(/\.typ$/i, "");
  const tpl = typstSettings.current.outputPath || "output";
  if (tpl === "." || tpl === "./") return dir + "/" + name + ".pdf";
  // If the template contains a path separator, treat it as a full template
  if (tpl.includes("/") || tpl.includes("\\")) {
    return tpl.replace(/\$dir/g, dir).replace(/\$name/g, name) + ".pdf";
  }
  // Simple subdirectory name (like LaTeX outputDir)
  return dir + "/" + tpl + "/" + name + ".pdf";
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
    const outPath = resolveOutputPath(filePath);
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

/** Remove the exported PDF for a single .typ file. */
export async function cleanBuild(filePath: string): Promise<void> {
  const pdf = resolveOutputPath(filePath);
  if (await exists(pdf)) {
    await remove(pdf);
    logStore.append("typst", `info: removed ${basename(pdf)}`);
  }
}

/** Remove all PDFs in the typst output directory. */
export async function cleanAll(projectRoot: string): Promise<void> {
  const tpl = typstSettings.current.outputPath || "output";
  const outDir = (tpl === "." || tpl === "./") ? projectRoot : projectRoot + "/" + tpl;
  if (!await exists(outDir)) return;
  const entries = await readDir(outDir);
  let count = 0;
  for (const e of entries) {
    if (e.name?.endsWith(".pdf")) {
      await remove(outDir + "/" + e.name);
      count++;
    }
  }
  logStore.append("typst", `info: cleaned ${count} PDF(s) from ${tpl}/`);
}
