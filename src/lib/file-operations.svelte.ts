import { persistedScopedState } from "@/stores/persisted.svelte";
import { STORAGE_KEYS, createFile, createFolder, renameEntry, removeEntry, moveEntry, basename, dirname, joinPath } from "@/lib";
import { notifications } from "@/stores/notifications.svelte";
import { contextMenu, type ContextMenuItem } from "@/stores/context-menu.svelte";
import { confirm } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { IS_MAC } from "@/lib/platform";
import type { FileEntry } from "@/lib";
import type { PanelManager } from "@/lib/panel-manager";

export interface FileOpsDeps {
  pm: PanelManager;
  getRootPath: () => string | null;
  getActivePath: () => string | null;
  onOpenFile: (path: string, opts?: { preferDraft?: boolean; silent?: boolean; preview?: boolean }) => Promise<void>;
  onTabClose: (id: string) => void;
  onTreeChange: (paths: string[]) => void;
  onPanelChange: () => void;
  getT: () => (key: string, vars?: Record<string, string | number>) => string;
}

export class FileOpsManager {
  editingPath = $state<string | null>(null);
  newEntry = $state<{ parent: string; kind: "file" | "folder" } | null>(null);
  treeVersion = $state(0);
  /** Paths changed by the last file op / watcher event. Read together with
      `treeVersion` so the tree can invalidate only the affected folders
      instead of re-listing everything (which flashes all rows). */
  treeDirtyPaths = $state<string[]>([]);
  favorites = persistedScopedState<string[]>(STORAGE_KEYS.favorites, []);

  /** Tree focus, reported by the file tree (see fs-view/sidebar). Creation
      follows the FOCUS, never the editor's active file (VS Code semantics):
      focused folder → create inside it, focused file → create next to it,
      nothing focused (or after Escape) → project root. */
  focusedPath = $state<string | null>(null);
  focusedIsDir = $state(false);

  /** Path of the item just created by submitNew — the tree must focus it once
      the re-listed parent makes it visible (VS Code semantics: after a
      validated create, the created element gets the focus). Cleared by the
      tree via acknowledgePendingFocus once the focus landed. */
  pendingFocusPath = $state<string | null>(null);

  acknowledgePendingFocus = () => {
    this.pendingFocusPath = null;
  };

  setTreeFocus = (path: string | null, isFolder: boolean) => {
    this.focusedPath = path;
    this.focusedIsDir = isFolder;
  };

  /** Resolved creation target for the toolbar buttons and the ⌘N command. */
  createDir = $derived.by(() => {
    const fp = this.focusedPath;
    if (fp) return this.focusedIsDir ? fp : dirname(fp);
    return this.deps.getRootPath() ?? "";
  });

  constructor(private deps: FileOpsDeps) {}

  openFile = async () => {
    const { pickAnyFile } = await import("@/lib/files");
    const file = await pickAnyFile();
    if (file) await this.deps.onOpenFile(file);
  };

  selectFile = (path: string) => {
    // Simplified rule: a click on a text file in the FileTree always opens it
    // in an editor tab (dedup handled by PanelState.open — already-open tabs
    // are activated). No more preview/reuse semantics for tree clicks.
    this.deps.onOpenFile(path);
  };

  newFile = (dir?: string) => {
    this.pendingFocusPath = null; // a fresh create supersedes any stale pending focus
    this.newEntry = { parent: dir ?? this.createDir, kind: "file" };
  };

  newFolder = (dir?: string) => {
    this.pendingFocusPath = null;
    this.newEntry = { parent: dir ?? this.createDir, kind: "folder" };
  };

  submitNew = async (parent: string, kind: "file" | "folder", name: string) => {
    this.newEntry = null;
    let createdPath: string | null = null;
    try {
      if (kind === "folder") {
        await createFolder(parent, name);
        createdPath = joinPath(parent, name);
      } else {
        const path = await createFile(parent, name);
        createdPath = path;
        await this.deps.onOpenFile(path);
      }
    } catch (err) {
      const t = this.deps.getT();
      notifications.setLoadError({
        title: kind === "folder" ? t("menu.newFolder") : t("menu.newFile"),
        message: err instanceof Error ? err.message : String(err),
      });
    }
    this.deps.onTreeChange(createdPath ? [createdPath] : []);
    this.pendingFocusPath = createdPath;
  };

  cancelNew = () => { this.newEntry = null; };

  submitRename = async (src: string, newName: string) => {
    if (this.deps.getRootPath() && src === this.deps.getRootPath()) return;
    this.editingPath = null;
    const t = this.deps.getT();
    let newPath: string | null = null;
    try {
      const renamed = await renameEntry(src, newName);
      newPath = renamed;
      const tab = this.deps.pm.main.tabs.find((t: { path: string }) => t.path === src);
      if (tab) {
        this.deps.pm.main.tabs = this.deps.pm.main.tabs.map((t: any) =>
          t.path === src ? { ...t, path: renamed, title: basename(renamed) } : t
        );
        this.deps.onPanelChange();
      }
    } catch (err) {
      notifications.setLoadError({
        title: t("menu.rename"),
        message: err instanceof Error ? err.message : String(err),
      });
    }
    this.deps.onTreeChange([src, newPath ?? src]);
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
    this.deps.onTreeChange([entry.path]);
  };

  /** Batch delete for a multi-selection. Confirms once, then removes every
      entry, closing tabs for deleted files. */
  deleteMany = async (entries: FileEntry[]) => {
    const t = this.deps.getT();
    const ok = await confirm(t("menu.confirmDeleteMany", { count: entries.length }), {
      title: t("menu.delete"),
      kind: "warning",
    });
    if (!ok) return;
    try {
      for (const entry of entries) {
        await removeEntry(entry.path, entry.isDir);
        if (!entry.isDir) {
          const tab = this.deps.pm.main.tabs.find((t: { path: string }) => t.path === entry.path);
          if (tab) this.deps.onTabClose(tab.id);
        }
      }
    } catch (err) {
      notifications.setLoadError({
        title: t("menu.delete"),
        message: err instanceof Error ? err.message : String(err),
      });
    }
    this.deps.onTreeChange(entries.map((e) => e.path));
  };

  move = async (src: string, dstParent: string) => {
    try {
      const newPath = await moveEntry(src, dstParent);
      this.deps.onTreeChange([src, newPath]);
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

  buildContextMenu = (e: MouseEvent, entry: FileEntry, selection: FileEntry[] = [entry]) => {
    const t = this.deps.getT();
    const parentDir = entry.isDir ? entry.path : dirname(entry.path);
    const isRoot = this.deps.getRootPath() != null && entry.path === this.deps.getRootPath() && entry.isDir;
    const sel = selection.length > 0 ? selection : [entry];
    const isBatch = sel.length > 1;
    const rootPath = this.deps.getRootPath();
    const selHasRoot = rootPath != null && sel.some((s) => s.path === rootPath);

    // Multi-selection: new entries in the right-clicked parent + batch delete
    // and copy (the root is never deletable, even as part of a selection).
    if (isBatch) {
      contextMenu.open(e, entry, [
        {
          label: t("menu.newFile"),
          icon: "wxi-file-plus2",
          onSelect: () => { this.newEntry = { parent: parentDir, kind: "file" }; },
        },
        {
          label: t("menu.newFolder"),
          icon: "wxi-folder-plus",
          onSelect: () => { this.newEntry = { parent: parentDir, kind: "folder" }; },
        },
        "divider",
        ...(!selHasRoot ? [{
          label: t("menu.deleteMany", { count: sel.length }),
          icon: "wxi-trash2",
          destructive: true,
          onSelect: () => void this.deleteMany(sel),
        }] as ContextMenuItem[] : []),
        "divider",
        {
          label: t("menu.copyPaths", { count: sel.length }),
          icon: "wxi-copy",
          onSelect: () => void navigator.clipboard.writeText(sel.map((s) => s.path).join("\n")),
        },
      ]);
      return;
    }

    contextMenu.open(e, entry, [
      {
        label: t("menu.newFile"),
        icon: "wxi-file-plus2",
        onSelect: () => { this.newEntry = { parent: parentDir, kind: "file" }; },
      },
      {
        label: t("menu.newFolder"),
        icon: "wxi-folder-plus",
        onSelect: () => { this.newEntry = { parent: parentDir, kind: "folder" }; },
      },
      "divider",
      ...(entry.isDir ? [{
        label: IS_MAC ? t("menu.revealFinder") : t("menu.revealExplorer"),
        icon: "wxi-folder-open",
        onSelect: () => { openPath(entry.path); },
      }] as ContextMenuItem[] : []),
      ...(!entry.isDir ? [{
        label: t("menu.openDefault"),
        icon: "wxi-file-text",
        onSelect: () => this.deps.onOpenFile(entry.path),
      },
      {
        label: this.favorites.current.includes(entry.path) ? t("sidebar.unfavorite") : t("sidebar.favorite"),
        icon: "wxi-star",
        onSelect: () => this.toggleFavorite(entry.path),
      }] as ContextMenuItem[] : []),
      ...(!isRoot ? [{
        label: t("menu.rename"),
        icon: "wxi-pencil",
        onSelect: () => { this.editingPath = entry.path; },
      },
      "divider",
      {
        label: entry.isDir ? t("menu.deleteFolder") : t("menu.delete"),
        icon: "wxi-trash2",
        destructive: true,
        onSelect: () => void this.delete(entry),
      }] as ContextMenuItem[] : []),
      ...(isRoot ? ["divider" as const] : []),
      {
        label: t("menu.copyPath"),
        icon: "wxi-copy",
        onSelect: () => void navigator.clipboard.writeText(entry.path),
      },
    ]);
  };
}
