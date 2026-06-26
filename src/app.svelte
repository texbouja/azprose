<script lang="ts">
import { onMount } from "svelte";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getVersion } from "@tauri-apps/api/app";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { confirm } from "@tauri-apps/plugin-dialog";
import { FilePlus2, FolderPlus, Pencil, Copy, Trash2, FileText, FolderOpen } from "@/lib/icons";
import { checkForUpdate, applyUpdate } from "@/lib/updater";
import { language, getT } from "@/lib/i18n";
import { overlays } from "@/stores/overlays.svelte";
import { notifications } from "@/stores/notifications.svelte";
import { contextMenu } from "@/stores/context-menu.svelte";
import { persistedState } from "@/stores/persisted.svelte";
import type { ContextMenuItem } from "@/components/files/context-menu.svelte";
import {
  STORAGE_KEYS,
  DEFAULT_WRITING_DISPLAY,
  getWritingDisplayVars,
  normalizeWritingFontSize,
  normalizeWritingLineHeight,
  CHANGELOG_URL,
  getWhatsNewToastMessage,
  isSupportedTextPath,
  isImagePath,
  isPdfPath,
  basename,
  dirname,
  createFile,
  createFolder,
  renameEntry,
  removeEntry,
  buildCommands,
} from "@/lib";
import type { FileEntry, WritingDisplay, WritingFontSize, WritingLineHeight } from "@/lib";
import Toast, { type ToastAction } from "@/components/overlays/Toast.svelte";
import DropOverlay from "@/components/overlays/DropOverlay.svelte";
import CommandPalette from "@/components/overlays/CommandPalette.svelte";
import HelpOverlay from "@/components/overlays/HelpOverlay.svelte";
import AboutOverlay from "@/components/overlays/AboutOverlay.svelte";
import SettingsOverlay from "@/components/overlays/SettingsOverlay.svelte";
import WelcomeOverlay from "@/components/overlays/WelcomeOverlay.svelte";
import TitleBar from "@/components/chrome/TitleBar.svelte";
import Breadcrumb from "@/components/chrome/Breadcrumb.svelte";
import StatusBar from "@/components/chrome/StatusBar.svelte";
import Sidebar from "@/components/files/sidebar.svelte";
import ContextMenu from "@/components/files/context-menu.svelte";
import { TooltipRoot } from "@/components/primitives";
import Editor from "@/components/editor/Editor.svelte";
import TabsBar, { type Tab } from "@/components/editor/TabsBar.svelte";
import LazyProseMark from "@/components/editor/LazyProseMark.svelte";
import SlideDeck from "@/components/editor/SlideDeck.svelte";
import LazyPdfViewer from "@/components/pdf/LazyPdfViewer.svelte";
import ImageViewer from "@/components/image/ImageViewer.svelte";
import LazyMarkdownPreview from "@/components/preview/LazyMarkdownPreview.svelte";
import { readMarkdown, writeMarkdown } from "@/lib/files";
import { extFromPath } from "@/lib/editor-languages";
import { saveSession, loadSession, saveDraft, loadDraft, clearDraft } from "@/lib/session";
import "./app.css";

let t = $derived(getT($language));

let sidebarOpen = persistedState<boolean>(STORAGE_KEYS.sidebarOpen, false);
let sidebarWidth = persistedState<number>(STORAGE_KEYS.sidebarWidth, 240);
let titlebarVisible = persistedState<boolean>(STORAGE_KEYS.titlebarVisible, true);
let folders = persistedState<string[]>(STORAGE_KEYS.folders, []);
let writingFontSize = persistedState<WritingFontSize>(
  STORAGE_KEYS.writingFontSize,
  DEFAULT_WRITING_DISPLAY.fontSize,
);
let writingLineHeight = persistedState<WritingLineHeight>(
  STORAGE_KEYS.writingLineHeight,
  DEFAULT_WRITING_DISPLAY.lineHeight,
);

let dragActive = $state(false);
let whatsNewVersion = $state<string | null>(null);
let updateAvail = $state<{ version: string } | null>(null);
let updateInstalling = $state(false);
let updateUpToDate = $state(false);

let tabs = $state<Tab[]>([]);
let activeTabId = $state<string | null>(null);

let words = $state(0);
let minutes = $state(1);

let source = $state("");
let savedContent = $state("");
let activePath = $state<string | null>(null);
let rootPath = $state<string | null>(folders.current[0] ?? null);

let copyPulse = $state(false);
let vimOn = $state(false);
let readingMode = $state(false);
let prosemarkOn = $state(true);
let presentationOn = $state(false);
let previewOn = $state(false);
let presentationFs = $state(false);
let proseWarmupDone = false;

let saveStatus = $state<"idle" | "dirty" | "saving" | "saved">("idle");

onMount(() => {
  requestAnimationFrame(() => {
    const boot = document.getElementById("boot");
    if (boot) {
      boot.style.opacity = "0";
      boot.addEventListener("transitionend", () => boot.remove(), { once: true });
    }
  });

  const myLabel = getCurrentWindow().label;
  if (myLabel.startsWith("azprose-project-")) {
    void (async () => {
      const unlisten = await listen<string>(`azprose:open-folder:${myLabel}`, (e) => {
        folders.update(() => [e.payload]);
        rootPath = e.payload;
        unlisten();
      });
      await emit("azprose:project-window-ready", myLabel);
    })();
  }

  // Sauvegarde des brouillons sur perte de focus (stratégie VSCode hot-exit).
  // localStorage est synchrone : pas de risque de perte sur crash.
  const onBlur = () => saveAllDirtyDrafts();
  const onVisibility = () => { if (document.visibilityState === "hidden") saveAllDirtyDrafts(); };
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibility);

  // Sauvegarde avant fermeture de la fenêtre Tauri.
  void getCurrentWindow().onCloseRequested(() => { saveAllDirtyDrafts(); });

  return () => {
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
  };
});

function findTabByPath(path: string): Tab | undefined {
  return tabs.find(t => t.path === path);
}

function saveSessionNow() {
  const activePath = tabs.find(t => t.id === activeTabId)?.path ?? null;
  saveSession({ tabs: tabs.map(t => ({ path: t.path, title: t.title })), activePath });
}

function saveAllDirtyDrafts() {
  for (const tab of tabs) {
    if (!isPdfPath(tab.path) && !isImagePath(tab.path) && tab.source !== tab.savedContent) {
      saveDraft(tab.path, tab.source);
    }
  }
}

async function openFileInTab(path: string, opts?: { preferDraft?: boolean; silent?: boolean }) {
  const existing = findTabByPath(path);
  if (existing) {
    activeTabId = existing.id;
    saveSessionNow();
    return;
  }
  const id = crypto.randomUUID();
  const title = basename(path);
  tabs = [...tabs, { id, title, path, source: "", savedContent: "" }];
  activeTabId = id;
  if (!isPdfPath(path) && !isImagePath(path)) {
    try {
      const fileSource = await readMarkdown(path);
      const draft = opts?.preferDraft ? loadDraft(path) : null;
      const source = (draft !== null && draft !== fileSource) ? draft : fileSource;
      tabs = tabs.map(t => t.id === id ? { ...t, source, savedContent: fileSource } : t);
    } catch (err) {
      tabs = tabs.filter(t => t.id !== id);
      if (activeTabId === id) activeTabId = tabs[tabs.length - 1]?.id ?? null;
      if (!opts?.silent) throw err;
      return;
    }
  }
  saveSessionNow();
  if (!proseWarmupDone && extFromPath(path) === "md") {
    proseWarmupDone = true;
    void import("@/components/editor/ProseMarkEditor.svelte");
  }
}

function closeTab(id: string) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];
  // Persist draft avant de fermer — récupérable si l'utilisateur rouvre le fichier
  if (!isPdfPath(tab.path) && !isImagePath(tab.path) && tab.source !== tab.savedContent) {
    saveDraft(tab.path, tab.source);
  }
  tabs = tabs.filter(t => t.id !== id);
  if (activeTabId === id) {
    const next = tabs[Math.min(idx, tabs.length - 1)];
    activeTabId = next?.id ?? null;
  }
  saveSessionNow();
}

function handleTabSelect(id: string) {
  activeTabId = id;
  saveSessionNow();
}

function handleTabReorder(from: number, to: number) {
  const next = [...tabs];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  tabs = next;
  saveSessionNow();
}

$effect(() => {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) {
    activePath = tab.path;
    source = tab.source;
    savedContent = tab.savedContent;
  } else {
    activePath = null;
    source = "";
    savedContent = "";
  }
});

$effect(() => {
  if (source !== savedContent) {
    saveStatus = "dirty";
  } else if (activePath) {
    saveStatus = "idle";
  }
});

$effect(() => {
  const text = source;
  words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  minutes = Math.max(1, Math.ceil(words / 200));
});

$effect(() => {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab && (tab.source !== source || tab.savedContent !== savedContent)) {
    tabs = tabs.map(t => t.id === activeTabId ? { ...t, source, savedContent } : t);
  }
});

const handleSave = async () => {
  if (!activePath || saveStatus !== "dirty") return;
  saveStatus = "saving";
  try {
    await writeMarkdown(activePath, source);
    savedContent = source;
    saveStatus = "saved";
    tabs = tabs.map(t => t.id === activeTabId ? { ...t, savedContent: source } : t);
    clearDraft(activePath);
  } catch (err) {
    console.error("azprose: save failed", err);
    saveStatus = "dirty";
  }
};

let editingPath = $state<string | null>(null);
let newEntry = $state<{ parent: string; kind: "file" | "folder" } | null>(null);
let treeVersion = $state(0);
let favorites = $state<string[]>([]);

let contextMenuItems = $state<ContextMenuItem[]>([]);

// Directory to use when creating new files from toolbar/keyboard shortcut.
// Follows the active file, falls back to rootPath.
let activeDir = $derived(
  activePath ? dirname(activePath) : (rootPath ?? "")
);

let writingDisplay = $derived<WritingDisplay>({
  fontSize: normalizeWritingFontSize(writingFontSize.current),
  lineHeight: normalizeWritingLineHeight(writingLineHeight.current),
});
let writingDisplayStyle = $derived(getWritingDisplayVars(writingDisplay));

$effect(() => {
  document.title = activePath ? basename(activePath) : "untitled";
});

$effect(() => {
  if (activePath) window.localStorage.setItem(STORAGE_KEYS.lastFile, activePath);
});

$effect(() => {
  if (!activePath || extFromPath(activePath) !== "md") {
    presentationOn = false;
    previewOn = false;
  }
});

$effect(() => {
  let cancelled = false;
  void getVersion()
    .then((version) => {
      if (cancelled) return;
      const lastSeen = window.localStorage.getItem(STORAGE_KEYS.lastSeenVersion);
      if (lastSeen && lastSeen !== version) {
        whatsNewVersion = version;
      }
      window.localStorage.setItem(STORAGE_KEYS.lastSeenVersion, version);
    })
    .catch((err) => console.warn("azprose: version check failed", err));
  return () => { cancelled = true; };
});

$effect(() => {
  const timer = window.setTimeout(async () => {
    const result = await checkForUpdate();
    if (result.status === "available") {
      updateAvail = { version: result.version };
    }
  }, 1500);
  return () => window.clearTimeout(timer);
});

const handleApplyUpdate = async () => {
  if (updateInstalling) return;
  updateInstalling = true;
  try {
    await applyUpdate();
  } catch (err) {
    console.error("azprose: update install failed", err);
    notifications.setLoadError({
      title: "Update error",
      message: `couldn't install update — ${err instanceof Error ? err.message : err}`,
    });
    updateInstalling = false;
  }
};

const handleManualUpdateCheck = async () => {
  const result = await checkForUpdate();
  if (result.status === "available") {
    updateAvail = { version: result.version };
  } else if (result.status === "none") {
    updateUpToDate = true;
  } else {
    notifications.setLoadError({
      title: "Update check failed",
      message: `update check failed — ${result.message}`,
    });
  }
};

const handleToggleSidebar = () => sidebarOpen.update((v: boolean) => !v);

const toggleFullscreen = async () => {
  const win = getCurrentWindow();
  try {
    if (editorMode === "presentation") {
      presentationFs = !presentationFs;
      await win.setFullscreen(presentationFs);
    } else {
      const isFs = await win.isFullscreen();
      await win.setFullscreen(!isFs);
    }
  } catch (err) {
    console.error("azprose: fullscreen toggle failed", err);
  }
};

$effect(() => {
  let cancelled = false;
  let unlisten: (() => void) | undefined;

  listen<string>("azprose:open-file", (event) => {
    const path = event.payload;
    if (cancelled) return;
    if (typeof path === "string" && path.length > 0) {
      void openFileInTab(path).catch(() => {});
    }
  }).then((un) => {
    if (cancelled) { un(); return; }
    unlisten = un;
    void invoke<string[]>("take_pending_open_files")
      .then(async (paths) => {
        if (cancelled) return;
        const latest = paths[paths.length - 1];
        if (latest) {
          // Fichier ouvert via CLI / drag-drop — prioritaire sur la session
          void openFileInTab(latest).catch(() => {});
        } else {
          // Restauration de session : rouvrir tous les onglets avec leurs brouillons
          const session = loadSession();
          if (session.tabs.length > 0) {
            for (const { path } of session.tabs) {
              if (cancelled) break;
              await openFileInTab(path, { preferDraft: true, silent: true });
            }
            if (!cancelled && session.activePath) {
              const active = findTabByPath(session.activePath);
              if (active) activeTabId = active.id;
            }
          } else {
            // Pas de session — fallback sur le dernier fichier ouvert
            const lastFile = window.localStorage.getItem(STORAGE_KEYS.lastFile);
            if (lastFile) {
              void openFileInTab(lastFile, { preferDraft: true }).catch(() => {
                window.localStorage.removeItem(STORAGE_KEYS.lastFile);
              });
            }
          }
        }
      })
      .catch((err) => console.warn("azprose: pending open-file check failed", err));
  });

  return () => {
    cancelled = true;
    unlisten?.();
  };
});

// When a project window finishes initializing it sends "azprose:project-window-ready".
// We respond with the folder path it should open.
$effect(() => {
  let cancelled = false;
  let unlisten: (() => void) | undefined;

  listen<string>("azprose:project-window-ready", async (event) => {
    if (cancelled) return;
    const childLabel = event.payload;
    const folder = pendingProjectFolders.get(childLabel);
    if (!folder) return;
    pendingProjectFolders.delete(childLabel);
    await emit(`azprose:open-folder:${childLabel}`, folder);
  }).then((un) => {
    if (cancelled) { un(); return; }
    unlisten = un;
  });

  return () => {
    cancelled = true;
    unlisten?.();
  };
});

$effect(() => {
  type DragPayload = { paths: string[] };
  let cancelled = false;
  let unlistenEnter: (() => void) | undefined;
  let unlistenDrop: (() => void) | undefined;
  let unlistenLeave: (() => void) | undefined;

  const isDroppable = (p: string) => isSupportedTextPath(p) || isImagePath(p) || isPdfPath(p);

  listen<DragPayload>("tauri://drag-enter", (event) => {
    if (cancelled) return;
    dragActive = event.payload.paths?.some(isDroppable) ?? false;
  }).then((ul) => { if (!cancelled) unlistenEnter = ul; });

  listen<DragPayload>("tauri://drag-drop", (event) => {
    if (cancelled) return;
    dragActive = false;
    const paths = event.payload.paths ?? [];
    const first = paths.find(isDroppable);
    if (first) {
      openFileInTab(first);
    } else if (paths.length > 0) {
      notifications.setLoadError({
        title: "Drop error",
        message: t("app.dropMarkdownOnly"),
      });
    }
  }).then((ul) => { if (!cancelled) unlistenDrop = ul; });

  listen("tauri://drag-leave", () => {
    if (cancelled) return;
    dragActive = false;
  }).then((ul) => { if (!cancelled) unlistenLeave = ul; });

  return () => {
    cancelled = true;
    unlistenEnter?.();
    unlistenDrop?.();
    unlistenLeave?.();
  };
});

const handleAddFolder = async () => {
  const { pickFolder } = await import("@/lib/files");
  const folder = await pickFolder();
  if (folder) {
    const next = [...folders.current];
    if (!next.includes(folder)) {
      next.push(folder);
      folders.update(() => next);
      if (!rootPath) rootPath = folder;
    }
  }
};

// Folder handoff for project windows: label → folder path, consumed on "azprose:project-window-ready"
const pendingProjectFolders = new Map<string, string>();

const handleOpenProject = async () => {
  const { pickFolder } = await import("@/lib/files");
  const folder = await pickFolder();
  if (!folder) return;
  const label = `azprose-project-${Date.now()}`;
  pendingProjectFolders.set(label, folder);
  const win = new WebviewWindow(label, {
    title: `AZprose — ${basename(folder)}`,
    width: 1280,
    height: 860,
  });
  win.once("tauri://error", (e) => {
    console.error("[azprose] failed to create project window:", e);
    pendingProjectFolders.delete(label);
  });
};

const handleCloseFolder = (path: string) => {
  const next = folders.current.filter((f) => f !== path);
  folders.update(() => next);
  if (rootPath === path) rootPath = next[0] ?? null;
};

const handleSelectFile = (path: string) => {
  openFileInTab(path);
};

const handleContextMenu = (e: MouseEvent, entry: FileEntry) => {
  const parentDir = entry.isDir ? entry.path : dirname(entry.path);

  contextMenuItems = [
    {
      label: t("menu.newFile"),
      icon: FilePlus2,
      onSelect: () => { newEntry = { parent: parentDir, kind: "file" }; },
    },
    {
      label: t("menu.newFolder"),
      icon: FolderPlus,
      onSelect: () => { newEntry = { parent: parentDir, kind: "folder" }; },
    },
    "divider",
    ...(!entry.isDir ? [{
      label: t("menu.openDefault"),
      icon: FileText,
      onSelect: () => openFileInTab(entry.path),
    }] as ContextMenuItem[] : []),
    {
      label: t("menu.rename"),
      icon: Pencil,
      onSelect: () => { editingPath = entry.path; },
    },
    "divider",
    {
      label: t("menu.copyPath"),
      icon: Copy,
      onSelect: () => void navigator.clipboard.writeText(entry.path),
    },
    "divider",
    {
      label: entry.isDir ? t("menu.deleteFolder") : t("menu.delete"),
      icon: Trash2,
      destructive: true,
      onSelect: () => void handleDelete(entry),
    },
  ];
  contextMenu.open(e, entry);
};

const handleOpenFile = async () => {
  const { pickAnyFile } = await import("@/lib/files");
  const file = await pickAnyFile();
  if (file) openFileInTab(file);
};

const handleNewFile = (dir?: string) => {
  const parent = dir ?? activeDir;
  if (!parent) return;
  newEntry = { parent, kind: "file" };
};

const handleNewFolder = (dir?: string) => {
  const parent = dir ?? activeDir;
  if (!parent) return;
  newEntry = { parent, kind: "folder" };
};

const handleSubmitNew = async (parent: string, kind: "file" | "folder", name: string) => {
  newEntry = null;
  try {
    if (kind === "folder") {
      await createFolder(parent, name);
    } else {
      const path = await createFile(parent, name);
      await openFileInTab(path);
    }
  } catch (err) {
    notifications.setLoadError({
      title: kind === "folder" ? t("menu.newFolder") : t("menu.newFile"),
      message: err instanceof Error ? err.message : String(err),
    });
  }
  treeVersion++;
};

const handleCancelNew = () => {
  newEntry = null;
};

const handleSubmitRename = async (src: string, newName: string) => {
  editingPath = null;
  try {
    const newPath = await renameEntry(src, newName);
    const tab = tabs.find(t => t.path === src);
    if (tab) {
      tabs = tabs.map(t => t.path === src ? { ...t, path: newPath, title: basename(newPath) } : t);
    }
  } catch (err) {
    notifications.setLoadError({
      title: t("menu.rename"),
      message: err instanceof Error ? err.message : String(err),
    });
  }
  treeVersion++;
};

const handleCancelEdit = () => {
  editingPath = null;
};

const handleDelete = async (entry: FileEntry) => {
  const msg = entry.isDir
    ? t("menu.confirmDeleteFolder", { name: entry.name })
    : t("menu.confirmDelete", { name: entry.name });
  const ok = await confirm(msg, { title: entry.isDir ? t("menu.deleteFolder") : t("menu.delete"), kind: "warning" });
  if (!ok) return;
  try {
    await removeEntry(entry.path, entry.isDir);
    if (!entry.isDir) {
      const tab = tabs.find(t => t.path === entry.path);
      if (tab) closeTab(tab.id);
    }
    treeVersion++;
  } catch (err) {
    notifications.setLoadError({
      title: entry.isDir ? t("menu.deleteFolder") : t("menu.delete"),
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

const handleExportPdf = async () => {
  // Placeholder — Phase 2-3
};

const handleCopyMarkdown = async () => {
  // Placeholder — Phase 2-3
};

const handleToggleReading = () => {
  readingMode = !readingMode;
};

$effect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
});

const handleToggleVim = () => {
  vimOn = !vimOn;
};

const handleToggleTitlebar = () => {
  titlebarVisible.update((v: boolean) => !v);
};

type EditorMode = "raw" | "prose" | "preview" | "presentation";

let editorMode = $derived<EditorMode>(
  previewOn ? "preview"
  : prosemarkOn && presentationOn ? "presentation"
  : prosemarkOn ? "prose"
  : "raw"
);

const handleSetEditorMode = (mode: EditorMode) => {
  if (presentationFs && mode !== "presentation") {
    presentationFs = false;
    void getCurrentWindow().setFullscreen(false);
  }
  switch (mode) {
    case "raw":          prosemarkOn = false; previewOn = false; presentationOn = false; break;
    case "prose":        prosemarkOn = true;  previewOn = false; presentationOn = false; break;
    case "preview":      previewOn = true;    presentationOn = false; break;
    case "presentation": prosemarkOn = true;  presentationOn = true; previewOn = false; break;
  }
};

const handleWritingFontSizeChange = (value: WritingFontSize) => {
  writingFontSize.current = value;
};

const handleWritingLineHeightChange = (value: WritingLineHeight) => {
  writingLineHeight.current = value;
};

const handleResetWritingDisplay = () => {
  writingFontSize.current = DEFAULT_WRITING_DISPLAY.fontSize;
  writingLineHeight.current = DEFAULT_WRITING_DISPLAY.lineHeight;
};

let cmds = $derived(
  buildCommands({
    newFile: handleNewFile,
    openFile: handleOpenFile,
    openFolder: handleAddFolder,
    save: handleSave,
    toggleSidebar: handleToggleSidebar,
    showHelp: overlays.showHelp,
    showWelcome: overlays.showWelcome,
    showAbout: overlays.showAbout,
    loadDemo: async () => {
      const { demoFile } = await import("@/lib/demo");
      const path = await demoFile();
      if (path) openFileInTab(path);
    },
    undoFileOp: async () => {},
    checkForUpdates: handleManualUpdateCheck,
    copyMarkdown: handleCopyMarkdown,
    toggleFullscreen,
    openRecent: (path: string) => { openFileInTab(path); },
    recentFiles: [],
    hasActivePath: activePath != null,
    sidebarOpen: sidebarOpen.current,
  }, t),
);
</script>

<div
  class="mdv-app{sidebarOpen.current ? " has-sidebar" : ""}{!titlebarVisible.current ? " has-hidden-titlebar" : ""}"
  style={writingDisplayStyle}
>
  <TitleBar
    fileName={activePath ? basename(activePath) : undefined}
    filePath={activePath}
    {readingMode}
    onToggleReading={handleToggleReading}
    onCopyMarkdown={handleCopyMarkdown}
    {copyPulse}
    onExportPdf={handleExportPdf}
    {vimOn}
    onToggleVim={handleToggleVim}
    {writingDisplay}
    onWritingFontSizeChange={handleWritingFontSizeChange}
    onWritingLineHeightChange={handleWritingLineHeightChange}
    onResetWritingDisplay={handleResetWritingDisplay}
  />

  <Breadcrumb
    sidebarOpen={sidebarOpen.current}
    onToggleSidebar={handleToggleSidebar}
    {rootPath}
    {activePath}
    {saveStatus}
    onExportPdf={handleExportPdf}
    onOpenProject={handleOpenProject}
    titlebarVisible={titlebarVisible.current}
    onToggleTitlebar={handleToggleTitlebar}
    {vimOn}
    onToggleVim={handleToggleVim}
    {writingDisplay}
    onWritingFontSizeChange={handleWritingFontSizeChange}
    onWritingLineHeightChange={handleWritingLineHeightChange}
    onResetWritingDisplay={handleResetWritingDisplay}
    {editorMode}
    onSetEditorMode={activePath && extFromPath(activePath) === "md" ? handleSetEditorMode : undefined}
    onToggleFullscreen={toggleFullscreen}
    onOpenSettings={overlays.showSettings}
  />

  <main class="mdv-shell">
    <Sidebar
      open={sidebarOpen.current}
      {rootPath}
      folders={folders.current}
      {activePath}
      width={sidebarWidth.current}
      onWidthChange={(next) => sidebarWidth.current = next}
      onAddFolder={handleAddFolder}
      onNewFile={handleNewFile}
      onNewFolder={handleNewFolder}
      onCloseFolder={handleCloseFolder}
      onSelectFile={handleSelectFile}
      onContextMenu={handleContextMenu}
      {editingPath}
      onSubmitRename={handleSubmitRename}
      onCancelEdit={handleCancelEdit}
      {newEntry}
      onSubmitNew={handleSubmitNew}
      onCancelNew={handleCancelNew}
      {treeVersion}
      favorites={favorites}
    />

    <div class="mdv-workspace">
      {#if tabs.length > 0}
        <TabsBar {tabs} {activeTabId} onSelect={handleTabSelect} onClose={closeTab} onReorder={handleTabReorder} />
      {/if}
      <div class="mdv-shell__editor-solo">
        {#if activePath}
          {#if isPdfPath(activePath)}
            <LazyPdfViewer path={activePath} />
          {:else if isImagePath(activePath)}
            <ImageViewer path={activePath} />
          {:else if previewOn && extFromPath(activePath) === "md"}
            <LazyMarkdownPreview value={source} filePath={activePath} />
          {:else if prosemarkOn && presentationOn && extFromPath(activePath) === "md"}
            <SlideDeck value={source} fullscreen={presentationFs} onExitFullscreen={toggleFullscreen} />
          {:else if prosemarkOn && extFromPath(activePath) === "md"}
            <LazyProseMark
              value={source}
              onChange={(next: string) => { source = next; }}
            />
          {:else}
            <Editor
              value={source}
              language={extFromPath(activePath)}
              onChange={(next) => { source = next; }}
            />
          {/if}
        {:else}
          <div class="mdv-empty-state">
            <p>{t("sidebar.browseNotes")}</p>
            <button type="button" class="mdv-btn" onclick={handleAddFolder}>
              {t("sidebar.addFolder")}
            </button>
          </div>
        {/if}
      </div>
    </div>
  </main>

  <StatusBar
    fileName={activePath ? basename(activePath) : undefined}
    {words}
    {minutes}
    onShowHelp={overlays.showHelp}
  />

  <ContextMenu
    open={contextMenu.target !== null}
    x={contextMenu.target?.x ?? 0}
    y={contextMenu.target?.y ?? 0}
    items={contextMenuItems}
    onClose={contextMenu.close}
  />

  <Toast
    open={notifications.loadError != null}
    message={notifications.loadError?.message ?? ""}
    variant="error"
    onDismiss={notifications.dismissLoadError}
  />

  <Toast
    open={notifications.copyToast != null && notifications.loadError == null}
    message={notifications.copyToast ?? ""}
    variant="info"
    onDismiss={notifications.dismissCopyToast}
  />

  <Toast
    open={notifications.saveAsToast != null && notifications.loadError == null}
    message={notifications.saveAsToast ?? ""}
    variant="info"
    onDismiss={notifications.dismissSaveAsToast}
  />

  <Toast
    open={updateAvail != null && notifications.loadError == null}
    message={updateInstalling
      ? t("app.installingVersion", { version: updateAvail?.version ?? "" })
      : t("app.updateAvailable", { version: updateAvail?.version ?? "" })}
    variant="info"
    durationMs={null}
    onDismiss={() => updateAvail = null}
    action={updateInstalling ? undefined : { label: t("app.install"), onClick: () => void handleApplyUpdate() }}
  />

  <Toast
    open={updateUpToDate && notifications.loadError == null && updateAvail == null}
    message={t("app.latestVersion")}
    variant="info"
    onDismiss={() => updateUpToDate = false}
  />

  <Toast
    open={whatsNewVersion != null && notifications.loadError == null && updateAvail == null}
    message={whatsNewVersion ? getWhatsNewToastMessage(whatsNewVersion) : ""}
    variant="info"
    durationMs={null}
    onDismiss={() => whatsNewVersion = null}
    action={{ label: t("app.releaseNotes"), onClick: () => void openUrl(CHANGELOG_URL) }}
  />

  <CommandPalette
    open={overlays.paletteOpen}
    onClose={() => overlays.setPaletteOpen(false)}
    commands={cmds}
  />

  <HelpOverlay
    open={overlays.helpOpen}
    onClose={() => overlays.setHelpOpen(false)}
    onReplayTutorial={overlays.showWelcome}
    onCheckForUpdates={handleManualUpdateCheck}
  />

  <AboutOverlay
    open={overlays.aboutOpen}
    onClose={() => overlays.setAboutOpen(false)}
    onCheckForUpdates={handleManualUpdateCheck}
  />

  <SettingsOverlay
    open={overlays.settingsOpen}
    onClose={() => overlays.setSettingsOpen(false)}
  />

  <WelcomeOverlay
    open={overlays.welcomeOpen}
    onClose={overlays.dismissWelcome}
    onOpenFolder={handleAddFolder}
  />

  <DropOverlay active={dragActive} />
  <TooltipRoot />
</div>
