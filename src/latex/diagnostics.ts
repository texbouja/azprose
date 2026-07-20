import { listen } from "@tauri-apps/api/event";
import { logStore } from "@/components/console/log.svelte";

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
