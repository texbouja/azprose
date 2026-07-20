import { diagnosticsStore } from "@/stores/diagnostics.svelte";

export interface CrashHandlerDeps {
  saveAllDirtyDrafts: () => void
  flushSessionMirror: () => void
  setConsoleTab: (tab: "diagnostics" | "terminal" | "log") => void
  setConsoleOpen: (v: boolean) => void
}

export function reportCrash(deps: CrashHandlerDeps, message: string, err?: unknown) {
  deps.saveAllDirtyDrafts();
  deps.flushSessionMirror();
  diagnosticsStore.push({ severity: "error", message, source: "app" });
  deps.setConsoleTab("diagnostics");
  deps.setConsoleOpen(true);
  if (err !== undefined) console.error("azprose: crash", err);
}

export function handleViewCrash(deps: CrashHandlerDeps, error: unknown) {
  reportCrash(deps, error instanceof Error ? error.message : String(error), error);
}

export function setupCrashListener(deps: CrashHandlerDeps): () => void {
  const onCrash = (e: Event) => {
    const d = (e as CustomEvent<{ kind?: string; message?: string }>).detail;
    reportCrash(deps, `${d?.kind ?? "Crash"} — ${d?.message ?? ""}`.trim());
  };
  window.addEventListener("azprose:crash", onCrash);
  return () => window.removeEventListener("azprose:crash", onCrash);
}
