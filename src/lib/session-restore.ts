import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { loadSession, saveSession, saveLastFile, loadLastFile } from "@/lib/session";
import { loadProjectSession } from "@/lib/project-session";
import type { PanelManager } from "@/lib/panel-manager";

export interface SessionRestoreDeps {
  pm: PanelManager
  projectRoot: string | null
  openFileInTab: (path: string, opts?: { preferDraft?: boolean; silent?: boolean; preview?: boolean; sourceType?: "latex" | "typst" }) => Promise<void>
  findTabByPath: (path: string) => { id: string; panel: string } | undefined
  setSideVisible: (v: boolean) => void
  setRootPath: (v: string | null) => void
  setSessionScope: (v: string | null) => void
  folders: { current: string[]; update: (fn: () => string[]) => void }
  setProjectRoot: (v: string | null) => void
  loadGuests: () => string[]
  handleOpenProjectByPath: (folder: string) => Promise<void>
}

export function setupSessionRestore(
  ctx: SessionRestoreDeps,
  urlRoot: string | null,
): () => void {
  let cancelled = false;
  let unlisteners: (() => void)[] = [];

  listen<string>("azprose:open-file", (event) => {
    const path = event.payload;
    if (cancelled) return;
    if (typeof path === "string" && path.length > 0) {
      void ctx.openFileInTab(path).catch(() => {});
    }
  }).then((un) => {
    if (cancelled) { un(); return; }
    unlisteners.push(un);
    void invoke<string[]>("take_pending_open_files")
      .then(async (paths) => {
        if (cancelled) return;
        const latest = paths[paths.length - 1];
        if (latest) {
          void ctx.openFileInTab(latest).catch(() => {});
        } else {
          let session = loadSession();
          if (session.main.tabs.length === 0 && ctx.projectRoot) {
            const portable = await loadProjectSession(ctx.projectRoot);
            if (portable && portable.main.tabs.length > 0) {
              session = { main: portable.main, side: portable.side };
              saveSession(session);
              if (portable.lastFile) saveLastFile(portable.lastFile);
            }
          }
          if (session.main.tabs.length > 0) {
            for (const tab of session.main.tabs) {
              if (cancelled) break;
              await ctx.openFileInTab(tab.path, { preferDraft: true, silent: true, sourceType: tab.sourceType });
            }
            if (!cancelled && session.main.activePath) {
              const active = ctx.findTabByPath(session.main.activePath);
              if (active) ctx.pm.main.select(active.id);
            }
            if (session.side.visible && session.side.tabs.length > 0) {
              for (const tab of session.side.tabs) {
                if (cancelled) break;
                await ctx.pm.openInSide(tab.path, { silent: true, sourceType: tab.sourceType });
              }
              if (!cancelled && session.side.activePath) {
                const sideTab = ctx.findTabByPath(session.side.activePath);
                if (sideTab) ctx.pm.side.select(sideTab.id);
                ctx.setSideVisible(true);
              }
            }
          } else {
            const lastFile = loadLastFile();
            if (lastFile) {
              void ctx.openFileInTab(lastFile, { preferDraft: true }).catch(() => {
                saveLastFile(null);
              });
            }
          }
        }
      })
      .catch((err) => console.warn("azprose: pending open-file check failed", err));
  });

  void invoke<string | null>("take_project_folder", { label: "main" }).then((dir) => {
    if (cancelled) return;
    if (dir && !urlRoot) {
      ctx.setRootPath(dir);
      ctx.setSessionScope(dir);
      ctx.folders.update(() => [dir, ...ctx.loadGuests().filter((g) => g !== dir)]);
      ctx.setProjectRoot(dir);
    }
  });

  listen<string>("azprose:open-project", (event) => {
    const dir = event.payload;
    if (cancelled) return;
    if (typeof dir === "string" && dir.length > 0) {
      void ctx.handleOpenProjectByPath(dir);
    }
  }).then((un) => {
    if (cancelled) return;
    unlisteners.push(un);
  });

  return () => {
    cancelled = true;
    unlisteners.forEach((u) => u());
  };
}
