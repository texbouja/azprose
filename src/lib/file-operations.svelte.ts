import { persistedState } from "@/stores/persisted.svelte";
import { STORAGE_KEYS, createFile, createFolder, renameEntry, removeEntry, moveEntry, basename, dirname } from "@/lib";
import { notifications } from "@/stores/notifications.svelte";
import { contextMenu } from "@/stores/context-menu.svelte";
import { confirm } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { IS_MAC } from "@/lib/platform";
import { FilePlus2, FolderPlus, Pencil, Copy, Trash2, FileText, FolderOpen, Star } from "@/lib/icons";
import type { IconData } from "@/lib/icons";

type ContextMenuItem =
  | {
      label: string;
      icon?: IconData;
      onSelect: () => void;
      disabled?: boolean;
      hint?: string;
      destructive?: boolean;
    }
  | "divider";
import type { FileEntry } from "@/lib";
import type { PanelManager } from "@/lib/panel-manager";

export interface FileOpsDeps {
  pm: PanelManager;
  getRootPath: () => string | null;
  getActivePath: () => string | null;
  onOpenFile: (path: string, opts?: { preferDraft?: boolean; silent?: boolean; preview?: boolean }) => Promise<void>;
  onTabClose: (id: string) => void;
  onTreeChange: () => void;
  onPanelChange: () => void;
  getT: () => (key: string, vars?: Record<string, string>) => string;
}

export class FileOpsManager {
  editingPath = $state<string | null>(null);
  newEntry = $state<{ parent: string; kind: "file" | "folder" } | null>(null);
  treeVersion = $state(0);
  contextMenuItems = $state<ContextMenuItem[]>([]);
  favorites = persistedState<string[]>(STORAGE_KEYS.favorites, []);

  activeDir = $derived.by(() => {
    const ap = this.deps.getActivePath();
    const rp = this.deps.getRootPath();
    return ap ? dirname(ap) : (rp ?? "");
  });

  constructor(private deps: FileOpsDeps) {}

  openFile = async () => {
    const { pickAnyFile } = await import("@/lib/files");
    const file = await pickAnyFile();
    if (file) await this.deps.onOpenFile(file);
  };

  selectFile = (path: string, permanent?: boolean) => {
    this.deps.onOpenFile(path, { preview: !permanent });
  };

  newFile = (dir?: string) => {
    this.newEntry = { parent: dir ?? this.activeDir, kind: "file" };
  };

  newFolder = (dir?: string) => {
    this.newEntry = { parent: dir ?? this.activeDir, kind: "folder" };
  };

  submitNew = async (parent: string, kind: "file" | "folder", name: string) => {
    this.newEntry = null;
    try {
      if (kind === "folder") {
        await createFolder(parent, name);
      } else {
        const path = await createFile(parent, name);
        await this.deps.onOpenFile(path);
      }
    } catch (err) {
      const t = this.deps.getT();
      notifications.setLoadError({
        title: kind === "folder" ? t("menu.newFolder") : t("menu.newFile"),
        message: err instanceof Error ? err.message : String(err),
      });
    }
    this.deps.onTreeChange();
  };

  cancelNew = () => { this.newEntry = null; };

  submitRename = async (src: string, newName: string) => {
    if (this.deps.getRootPath() && src === this.deps.getRootPath()) return;
    this.editingPath = null;
    const t = this.deps.getT();
    try {
      const newPath = await renameEntry(src, newName);
      const tab = this.deps.pm.main.tabs.find((t: { path: string }) => t.path === src);
      if (tab) {
        this.deps.pm.main.tabs = this.deps.pm.main.tabs.map((t: any) =>
          t.path === src ? { ...t, path: newPath, title: basename(newPath) } : t
        );
        this.deps.onPanelChange();
      }
    } catch (err) {
      notifications.setLoadError({
        title: t("menu.rename"),
        message: err instanceof Error ? err.message : String(err),
      });
    }
    this.deps.onTreeChange();
  };

  cancelEdit = () => { this.editingPath = null; };

  delete = async (entry: FileEntry) => {
    if (this.deps.getRootPath() && entry.path === this.deps.getRootPath()) return;
    const t = this.deps.getT();
    const msg = entry.isDir
      ? t("menu.confirmDeleteFolder", { name: entry.name })
      : t("menu.confirmDelete", { name: entry.name });
    const ok = await confirm(msg, {
      title: entry.isDir ? t("menu.deleteFolder") : t("menu.delete"),
      kind: "warning",
    });
    if (!ok) return;
    try {
      await removeEntry(entry.path, entry.isDir);
      if (!entry.isDir) {
        const tab = this.deps.pm.main.tabs.find((t: { path: string }) => t.path === entry.path);
        if (tab) this.deps.onTabClose(tab.id);
      }
    } catch (err) {
      notifications.setLoadError({
        title: entry.isDir ? t("menu.deleteFolder") : t("menu.delete"),
        message: err instanceof Error ? err.message : String(err),
      });
    }
    this.deps.onTreeChange();
  };

  move = async (src: string, dstParent: string) => {
    try {
      const newPath = await moveEntry(src, dstParent);
      this.deps.onTreeChange();
      if (this.deps.getActivePath() === src) {
        const tab = this.deps.pm.main.activeTab;
        if (tab) {
          this.deps.pm.main.tabs = this.deps.pm.main.tabs.map((t: any) =>
            t.id === tab.id ? { ...t, path: newPath, title: basename(newPath) } : t
          );
          this.deps.onPanelChange();
        }
      }
    } catch (err) {
      console.error("azprose: move failed", err);
    }
  };

  toggleFavorite = (path: string) => {
    const prev = this.favorites.current;
    this.favorites.update(() =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };

  reorderFavorites = (from: number, to: number) => {
    const prev = this.favorites.current;
    if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return;
    const next = [...prev];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.favorites.update(() => next);
  };

  buildContextMenu = (e: MouseEvent, entry: FileEntry) => {
    const t = this.deps.getT();
    const parentDir = entry.isDir ? entry.path : dirname(entry.path);
    const isRoot = this.deps.getRootPath() != null && entry.path === this.deps.getRootPath() && entry.isDir;

    this.contextMenuItems = [
      {
        label: t("menu.newFile"),
        icon: FilePlus2,
        onSelect: () => { this.newEntry = { parent: parentDir, kind: "file" }; },
      },
      {
        label: t("menu.newFolder"),
        icon: FolderPlus,
        onSelect: () => { this.newEntry = { parent: parentDir, kind: "folder" }; },
      },
      "divider",
      ...(entry.isDir ? [{
        label: IS_MAC ? t("menu.revealFinder") : t("menu.revealExplorer"),
        icon: FolderOpen,
        onSelect: () => { openPath(entry.path); },
      }] as ContextMenuItem[] : []),
      ...(!entry.isDir ? [{
        label: t("menu.openDefault"),
        icon: FileText,
        onSelect: () => this.deps.onOpenFile(entry.path),
      },
      {
        label: this.favorites.current.includes(entry.path) ? t("sidebar.unfavorite") : t("sidebar.favorite"),
        icon: Star,
        onSelect: () => this.toggleFavorite(entry.path),
      }] as ContextMenuItem[] : []),
      ...(!isRoot ? [{
        label: t("menu.rename"),
        icon: Pencil,
        onSelect: () => { this.editingPath = entry.path; },
      },
      "divider",
      {
        label: entry.isDir ? t("menu.deleteFolder") : t("menu.delete"),
        icon: Trash2,
        destructive: true,
        onSelect: () => void this.delete(entry),
      }] as ContextMenuItem[] : []),
      ...(isRoot ? ["divider" as const] : []),
      {
        label: t("menu.copyPath"),
        icon: Copy,
        onSelect: () => void navigator.clipboard.writeText(entry.path),
      },
    ];
    contextMenu.open(e, entry);
  };
}
