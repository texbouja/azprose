import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { isImagePath, isPdfPath } from "@/lib";
import { flushAllCsvCaches } from "@/csv/flush";

export interface CloseHandlerDeps {
  tabs: { path: string; source: string; savedContent: string }[]
  skipCloseConfirm: boolean
  isProjectWindow: boolean
  myLabel: string
  saveAllDirtyDrafts: () => void
  flushSessionMirror: () => void
  t: (key: string, params?: Record<string, string>) => string
}

export function setupCloseHandler(ctx: CloseHandlerDeps) {
  const win_ = getCurrentWindow();
  let closing = false;
  void win_.onCloseRequested(async (event) => {
    if (closing) return;
    event.preventDefault();
    try {
      if (!ctx.skipCloseConfirm) {
        const dirty = ctx.tabs.some(
          (tb) => !isPdfPath(tb.path) && !isImagePath(tb.path) && tb.source !== tb.savedContent,
        );
        if (dirty) {
          const ok = await confirm(ctx.t("project.warnCloseUnsaved"), { title: "", kind: "warning" });
          if (!ok) return;
        }
      }
      ctx.saveAllDirtyDrafts();
      ctx.flushSessionMirror();
      if (ctx.isProjectWindow) {
        await invoke("unregister_project_window", { label: ctx.myLabel });
      }
    } catch {
      // Never trap the window on an unexpected error during the close decision.
    }
    closing = true;
    await flushAllCsvCaches();
    await win_.destroy();
  });
}
