import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { isImagePath, isPdfPath, basename } from "@/lib";
import { folderRelation } from "@/lib/paths";
import { setSessionScope, saveDraft, saveGuests, loadGuests } from "@/lib/session";
import type { PanelManager } from "@/lib/panel-manager";
import type { FileOpsManager } from "@/lib/file-operations.svelte";

export interface ProjectManagementDeps {
  pm: PanelManager
  fo: Pick<FileOpsManager, "favorites">
  rootPath: string | null
  setRootPath: (v: string | null) => void
  sideVisible: boolean
  setSideVisible: (v: boolean) => void
  tabs: { path: string; source: string; savedContent: string }[]
  folders: { current: string[]; update: (fn: () => string[]) => void }
  projectRoot: string | null
  openFileInTab: (path: string, opts?: { silent?: boolean; preferDraft?: boolean; preview?: boolean; sourceType?: "latex" | "typst" }) => Promise<void>
  findTabByPath: (path: string) => { id: string; panel: string } | undefined
  skipCloseConfirm: { current: boolean }
  saveSessionNow: () => void
  notify: { setLoadError: (err: { title: string; message: string }) => void; setInfo: (msg: string) => void }
  t: (key: string, params?: Record<string, string>) => string
}

export function spawnProjectWindow(folder: string) {
  const label = `azprose-project-${Date.now()}`;
  return new WebviewWindow(label, {
    url: `index.html?root=${encodeURIComponent(folder)}`,
    title: `AZprose — ${basename(folder)}`,
    width: 1280,
    height: 860,
  });
}

export async function handleAddFolder(ctx: ProjectManagementDeps) {
  const { pickFolder } = await import("@/lib/files");
  const folder = await pickFolder();
  if (folder) {
    const next = [...ctx.folders.current];
    if (!next.includes(folder)) {
      next.push(folder);
      ctx.folders.update(() => next);
      if (!ctx.rootPath) { ctx.setRootPath(folder); setSessionScope(folder); }
      saveGuests(ctx.folders.current.slice(1));
    }
  }
}

export async function handleOpenProjectByPath(ctx: ProjectManagementDeps, folder: string) {
  const existing = await invoke<string | null>("find_project_window", { path: folder });
  if (existing) {
    const win = await WebviewWindow.getByLabel(existing);
    if (win) {
      await win.show();
      await win.unminimize();
      await win.setFocus();
      return;
    }
  }

  if (ctx.rootPath) {
    const rel = folderRelation(folder, ctx.rootPath);
    if (rel === "same") return;
    if (rel === "nested") {
      const ok = await confirm(ctx.t("project.warnCloseFolder"), { title: "", kind: "warning" });
      if (!ok) return;
      spawnProjectWindow(folder);
      if (getCurrentWindow().label.startsWith("azprose-project-")) {
        ctx.skipCloseConfirm.current = true;
        await getCurrentWindow().close();
      }
      return;
    }
    spawnProjectWindow(folder);
  } else {
    ctx.setRootPath(folder);
    setSessionScope(folder);
    ctx.folders.update(() => [folder, ...loadGuests().filter((g) => g !== folder)]);
  }
}

export async function handleInitProject(ctx: ProjectManagementDeps) {
  const { pickFolder } = await import("@/lib/files");
  const folder = await pickFolder();
  if (!folder) return;
  const name = basename(folder);
  await invoke("add_project", { name, path: folder });
  await handleOpenProjectByPath(ctx, folder);
}

export async function handleCloseFolder(ctx: ProjectManagementDeps, path: string) {
  const folderTabs = ctx.pm.main.tabs.filter((t: { path: string }) => t.path.startsWith(path + "/"));
  const dirtyTabs = folderTabs.filter((t: { path: string; source: string; savedContent: string }) => !isPdfPath(t.path) && !isImagePath(t.path) && t.source !== t.savedContent);
  if (dirtyTabs.length > 0) {
    const ok = await confirm(ctx.t("tabs.closeUnsavedFolder"), { title: "", kind: "warning" });
    if (!ok) return;
  }
  for (const tab of folderTabs) {
    if (!isPdfPath(tab.path) && !isImagePath(tab.path) && tab.source !== tab.savedContent) {
      saveDraft(tab.path, tab.source);
    }
  }
  for (const tab of folderTabs) {
    ctx.pm.main.close(tab.id);
  }
  const next = ctx.folders.current.filter((f) => f !== path);
  ctx.folders.update(() => next);
  if (ctx.rootPath === path) ctx.setRootPath(next[0] ?? null);
  saveGuests(ctx.folders.current.slice(1));
  ctx.saveSessionNow();
}

export async function handleExportPdf(ctx: { pm: PanelManager; activePath: string | null; extFromPath: (p: string) => string | null; themeResolved: string }) {
  if (!ctx.activePath || ctx.extFromPath(ctx.activePath) !== "md") return;
  const tab = ctx.pm.main.tabs.find(t => t.id === ctx.pm.main.activeTabId);
  if (!tab || !tab.source) return;
  const { exportMarkdownPdf } = await import("@/lib/pdf-export");
  try {
    await exportMarkdownPdf(tab.source, ctx.themeResolved, tab.path);
  } catch (err) {
    console.error("PDF export failed:", err);
  }
}
