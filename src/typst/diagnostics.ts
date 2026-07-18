import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import { logStore } from "@/components/console/log.svelte";
import { basename } from "@/lib";
import { requestDiagnostics } from "./backend";

export function clearDiagnostics(): void {
  diagnosticsStore.clear("typst");
}

export function setDiagnostics(diags: import("@/lib/diagnostics").Diagnostic[]): void {
  diagnosticsStore.set("typst", diags);
}

export async function refreshFromPreview(
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
    const diags = await requestDiagnostics(filePath, source);
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
    return !diags.some((d) => d.severity === "error");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : (typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : `${err}`);
    diagnosticsStore.set("typst", [{ severity: "error", message: msg }]);
    if (shouldLog) logStore.append("typst", `error: ${msg}`);
    opts?.onOpenConsole?.();
    return false;
  }
}

export async function liveDiagnostics(
  filePath: string,
  source: string,
  consoleOpen: boolean,
  hasSidePanel: boolean,
  onError?: (err: unknown) => void,
): Promise<void> {
  if (!consoleOpen || !filePath || hasSidePanel) return;
  try {
    const diags = await requestDiagnostics(filePath, source);
    diagnosticsStore.set("typst", diags);
  } catch (err) {
    diagnosticsStore.set("typst", [{ severity: "error", message: `${err}` }]);
    onError?.(err);
  }
}
