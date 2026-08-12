import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { isImagePath, isPdfPath } from "@/lib";
import { getCalendarStore } from "@/stores/calendar-store.svelte";
import { closeBrowseChildren } from "@/lib/browse-window";

export interface CloseHandlerDeps {
  tabs: { path: string; source: string; savedContent: string }[]
  skipCloseConfirm: boolean
  isProjectWindow: boolean
  myLabel: string
  saveAllDirtyDrafts: () => void
  /** Écrit la session (couplages linkedTo compris) dans localStorage — le
   *  seul écrivain de localStorage ; appelé AVANT flushSessionMirror pour que
   *  le quit persiste TOUT l'état, pas seulement le miroir portable. */
  saveSessionNow: () => void
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
      ctx.saveSessionNow();
      ctx.flushSessionMirror();
      await getCalendarStore().flush();
      if (ctx.isProjectWindow) {
        await invoke("unregister_project_window", { label: ctx.myLabel });
      }
      // Phase F (R5) : les fenêtres filles de navigation ne survivent JAMAIS à
      // leur fenêtre de projet — cascade explicite (le `parent` Tauri ne gère
      // que l'empilement sur toutes les plateformes).
      await closeBrowseChildren(ctx.myLabel);
    } catch {
      // Never trap the window on an unexpected error during the close decision.
    }
    closing = true;
    await win_.destroy();
  });
}
