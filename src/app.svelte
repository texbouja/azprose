<script lang="ts">
import { onMount, tick } from "svelte";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { confirm } from "@tauri-apps/plugin-dialog";
import { FilePlus2, FolderPlus, Pencil, Copy, Trash2, FileText, FolderOpen, Star } from "@/lib/icons";
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
  isOpenablePath,
  basename,
  dirname,
  createFile,
  createFolder,
  renameEntry,
  removeEntry,
  moveEntry,
  buildCommands,
  getMtime,
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
import LazySlideDeck from "@/components/editor/LazySlideDeck.svelte";
import LazyPdfViewer from "@/components/pdf/LazyPdfViewer.svelte";
import ImageViewer from "@/components/image/ImageViewer.svelte";
import LazyMarkdownPreview from "@/components/preview/LazyMarkdownPreview.svelte";
import TypstPreview from "@/components/typst/TypstPreview.svelte";
import ConsolePanel from "@/components/typst/ConsolePanel.svelte";
import type { Diagnostic } from "@/lib/diagnostics";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import OpencodeSidebar from "@/components/opencode/OpencodeSidebar.svelte";
import { readMarkdown, writeMarkdown } from "@/lib/files";
import { extFromPath } from "@/lib/editor-languages";
import { folderRelation } from "@/lib/paths";
import { saveSession, loadSession, saveDraft, loadDraft, clearDraft, setSessionScope, saveLastFile, loadLastFile, saveGuests, loadGuests } from "@/lib/session";
import { generalSettings } from "@/stores/general-settings.svelte";
import { proseSettings, DEFAULT_PROSE_STYLE } from "@/stores/prose-settings.svelte";
import { slideSettings } from "@/stores/slide-settings.svelte";
import { mathJaxPreamble, mathJaxPackages } from "@/stores/mathjax-preamble.svelte";
import { loadProjectConfig, saveProjectConfig } from "@/lib/project-config";
import { theme } from "@/stores/theme.svelte";
import { ensureCustomThemesLoaded } from "@/lib/custom-themes";
import type { ProjectConfig } from "@/lib/project-config";
import "./app.css";

let t = $derived(getT($language));

// A project window receives its folder synchronously through its URL (?root=<path>,
// set by the opener) — no shared-localStorage read, no async handshake. This is the
// fix for "the new window's sidebar shows the previous project": folders/rootPath are
// already correct before the first render.
const urlRoot = (() => {
  try {
    const r = new URLSearchParams(location.search).get("root");
    return r ? decodeURIComponent(r) : null;
  } catch {
    return null;
  }
})();

let sidebarOpen = persistedState<boolean>(STORAGE_KEYS.sidebarOpen, false);
let sidebarWidth = persistedState<number>(STORAGE_KEYS.sidebarWidth, 240);
let opencodeOpen = $state(false);
let titlebarVisible = persistedState<boolean>(STORAGE_KEYS.titlebarVisible, true);
let folders = persistedState<string[]>(STORAGE_KEYS.folders, []);
// Project root = ?root= (project windows) or the last project (main window). Scope the
// session storage to it, then rebuild folders as [projectRoot, ...scoped guests] so the
// project comes from the URL and guests persist per project (no telescoping).
const projectRoot = urlRoot ?? folders.current[0] ?? null;
setSessionScope(projectRoot);
if (projectRoot) folders.update(() => [projectRoot, ...loadGuests().filter((g) => g !== projectRoot)]);
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
let rootPath = $state<string | null>(projectRoot);

let vimOn = $state(false);
let prosemarkOn = $state(generalSettings.defaultEditorMode === "prose");
let presentationOn = $state(false);
let previewOn = $state(false);
let splitOn = $state(false);
let splitRatio = $state(0.5);
let leftPaneEl = $state<HTMLDivElement | null>(null);
let rightPaneEl = $state<HTMLDivElement | null>(null);
let jumpToLine = $state<number | null>(null);
let jumpToCol = $state<number | null>(null);
let presentationFs = $state(false);
let typstPreviewOn = $state(false);
let typstViewerOn = $state(false);
let viewerPdfPath = $state<string | null>(null);
// Non-reactive: keyed by filePath, stores last SVG + compiled source for instant re-display.
const typstSvgCache: Record<string, { svg: string; compiledSource: string; diagnostics: Diagnostic[] }> = {};
let consoleOpen = $state(false);
let consoleHeight = $state(160);
const consoleDiags = $derived(diagnosticsStore.all);
let consoleTab = $state<"diagnostics" | "terminal">("diagnostics");
// Once the console has been opened, keep ConsolePanel mounted (hidden when closed)
// so the Terminal/shell session survives a close — VS Code behavior.
let consoleMounted = $state(false);
$effect(() => { if (consoleOpen) consoleMounted = true; });
let proseWarmupDone = false;

let saveStatus = $state<"idle" | "dirty" | "saving" | "saved">("idle");

let projectConfig = $state<ProjectConfig>({});
let configRoot = $state<string | null>(null);
let configLoaded = $state(false);
let configWriteTimer: ReturnType<typeof setTimeout> | null = null;
let _skipCloseConfirm = false;

function scheduleConfigSync() {
  if (!configRoot || !configLoaded) return;
  if (configWriteTimer) clearTimeout(configWriteTimer);
  configWriteTimer = setTimeout(async () => {
    await doConfigSync();
  }, 400);
}

function flushConfigSync() {
  if (!configWriteTimer) return;
  clearTimeout(configWriteTimer);
  configWriteTimer = null;
  void doConfigSync();
}

async function doConfigSync() {
  if (!configRoot) return;
  const ps = proseSettings.current;
  const cfg: ProjectConfig = {};
  if (ps !== DEFAULT_PROSE_STYLE) cfg.proseStyle = ps;
  if (slideSettings.theme !== "default") cfg.slideTheme = slideSettings.theme;
  if (slideSettings.mode !== "16:9") cfg.slideMode = slideSettings.mode;
  if (generalSettings.defaultEditorMode !== "prose") cfg.defaultEditorMode = generalSettings.defaultEditorMode;
  if (writingFontSize.current !== DEFAULT_WRITING_DISPLAY.fontSize) cfg.writingFontSize = writingFontSize.current;
  if (writingLineHeight.current !== DEFAULT_WRITING_DISPLAY.lineHeight) cfg.writingLineHeight = writingLineHeight.current;
  if (mathJaxPreamble.current) cfg.mathJaxPreamble = mathJaxPreamble.current;
  if (mathJaxPackages.current.length) cfg.mathJaxPackages = mathJaxPackages.current;
  if (vimOn) cfg.vim = true;
  if (theme.mode !== "latte") cfg.themeMode = theme.mode;
  projectConfig = cfg;
  await saveProjectConfig(configRoot, cfg);
}

async function loadConfig(root: string) {
  configRoot = root;
  const { config: cfg, warnings } = await loadProjectConfig(root);
  projectConfig = cfg;
  if (cfg.proseStyle) proseSettings.patch(cfg.proseStyle);
  if (cfg.slideTheme) slideSettings.theme = cfg.slideTheme;
  if (cfg.slideMode) slideSettings.mode = cfg.slideMode;
  if (cfg.defaultEditorMode != null) generalSettings.defaultEditorMode = cfg.defaultEditorMode;
  if (cfg.writingFontSize != null) writingFontSize.current = cfg.writingFontSize;
  if (cfg.writingLineHeight != null) writingLineHeight.current = cfg.writingLineHeight;
  if (cfg.mathJaxPreamble != null) mathJaxPreamble.current = cfg.mathJaxPreamble;
  if (cfg.mathJaxPackages != null) mathJaxPackages.current = cfg.mathJaxPackages;
  if (cfg.vim != null) vimOn = cfg.vim;
  if (cfg.themeMode != null) theme.setMode(cfg.themeMode);
  configLoaded = true;
  if (warnings.length) {
    notifications.setInfo(t("config.warnings"));
  }
}

$effect(() => {
  const root = rootPath;
  if (root) void loadConfig(root);
});

$effect(() => {
  if (!configRoot) return;
  proseSettings.current;
  slideSettings.theme;
  slideSettings.mode;
  generalSettings.defaultEditorMode;
  writingFontSize.current;
  writingLineHeight.current;
  mathJaxPreamble.current;
  mathJaxPackages.current;
  vimOn;
  theme.mode;
  scheduleConfigSync();
});

// mtime tracking for external change detection
let mtimeMap = $state(new Map<string, number>());
let fileConflict = $state<string | null>(null);
let externalChangeAlerts = $state(true);

// Agent mode: suppress external change alerts so an AI can modify files silently.
// On réagit à l'événement Tauri "azprose:set-alerts" (payload: "on" | "off")
// et aussi via la commande Rust set_external_change_alerts.
$effect(() => {
  let cancelled = false;
  let unlisten: (() => void) | undefined;
  listen<string>("azprose:set-alerts", (e) => {
    if (cancelled) return;
    externalChangeAlerts = e.payload === "on";
  }).then((un) => { if (cancelled) un(); else unlisten = un; });
  return () => { cancelled = true; unlisten?.(); };
});

async function trackMtime(path: string) {
  const mtime = await getMtime(path);
  if (mtime != null) mtimeMap.set(path, mtime);
}

async function reloadFile(path: string) {
  const fresh = await readMarkdown(path);
  tabs = tabs.map(t => t.path === path ? { ...t, source: fresh, savedContent: fresh } : t);
  if (activePath === path) {
    source = fresh;
    savedContent = fresh;
  }
  await trackMtime(path);
}

async function checkExternalChanges() {
  for (const tab of tabs) {
    if (isPdfPath(tab.path) || isImagePath(tab.path)) continue;
    const oldMtime = mtimeMap.get(tab.path);
    if (oldMtime == null) { await trackMtime(tab.path); continue; }
    const current = await getMtime(tab.path);
    if (current == null) continue;
    if (current > oldMtime) {
      if (tab.source === tab.savedContent || !externalChangeAlerts) {
        await reloadFile(tab.path);
        if (externalChangeAlerts) {
          notifications.setInfo({ title: "", message: t("app.fileReloaded") });
        }
      } else {
        fileConflict = tab.path;
      }
    }
  }
}

onMount(() => {
  void ensureCustomThemesLoaded();

  requestAnimationFrame(() => {
    const boot = document.getElementById("boot");
    if (boot) {
      boot.style.opacity = "0";
      boot.addEventListener("transitionend", () => boot.remove(), { once: true });
    }
  });

  const myLabel = getCurrentWindow().label;
  const isProjectWindow = myLabel.startsWith("azprose-project-");
  // Folder already known from ?root= (see urlRoot) — just register this window so
  // find_project_window can detect it. No event handshake.
  if (isProjectWindow && urlRoot) {
    void invoke("register_project_window", { label: myLabel, path: urlRoot });
  }

  // Close handling for EVERY window. We always take over the close decision
  // (preventDefault + explicit destroy) so it is deterministic — this is what makes
  // windows reliably closable. `destroy()` does not re-fire close-requested.
  {
    const win_ = getCurrentWindow();
    let closing = false;
    void win_.onCloseRequested(async (event) => {
      if (closing) return;
      event.preventDefault();
      try {
        if (!_skipCloseConfirm) {
          const dirty = tabs.some(
            (tb) => !isPdfPath(tb.path) && !isImagePath(tb.path) && tb.source !== tb.savedContent,
          );
          if (dirty) {
            const ok = await confirm(t("project.warnCloseUnsaved"), { title: "", kind: "warning" });
            if (!ok) return; // explicit cancel — keep the window open
          }
        }
        saveAllDirtyDrafts();
        if (isProjectWindow) {
          await invoke("unregister_project_window", { label: myLabel });
        }
      } catch {
        // Never trap the window on an unexpected error during the close decision.
      }
      closing = true;
      await win_.destroy();
    });
  }

  // Sauvegarde des brouillons sur perte de focus (stratégie VSCode hot-exit).
  // localStorage est synchrone : pas de risque de perte sur crash.
  const onBlur = () => saveAllDirtyDrafts();
  const onVisibility = () => { if (document.visibilityState === "hidden") saveAllDirtyDrafts(); };
  const onBeforeUnload = () => { saveAllDirtyDrafts(); };
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("beforeunload", onBeforeUnload);

  const onFocus = () => { void checkExternalChanges(); };
  const onVisibilityVisible = () => { if (document.visibilityState === "visible") void checkExternalChanges(); };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibilityVisible);

  const onConfigFlush = () => flushConfigSync();
  const onConfigVisibility = () => { if (document.visibilityState === "hidden") flushConfigSync(); };
  window.addEventListener("beforeunload", onConfigFlush);
  document.addEventListener("visibilitychange", onConfigVisibility);

  return () => {
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("beforeunload", onBeforeUnload);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibilityVisible);
    window.removeEventListener("beforeunload", onConfigFlush);
    document.removeEventListener("visibilitychange", onConfigVisibility);
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

// Crash plumbing. A render/effect error caught by the per-view <svelte:boundary>
// (or an async error relayed from main.ts via azprose:crash) flushes drafts and
// surfaces the error in the Diagnostics console instead of killing the UI.
function reportCrash(message: string, err?: unknown) {
  saveAllDirtyDrafts();
  diagnosticsStore.push({ severity: "error", message, source: "app" });
  consoleTab = "diagnostics";
  consoleOpen = true;
  if (err !== undefined) console.error("azprose: crash", err);
}

function handleViewCrash(error: unknown) {
  reportCrash(error instanceof Error ? error.message : String(error), error);
}

$effect(() => {
  const onCrash = (e: Event) => {
    const d = (e as CustomEvent<{ kind?: string; message?: string }>).detail;
    reportCrash(`${d?.kind ?? "Crash"} — ${d?.message ?? ""}`.trim());
  };
  window.addEventListener("azprose:crash", onCrash);
  return () => window.removeEventListener("azprose:crash", onCrash);
});

async function openFileInTab(path: string, opts?: { preferDraft?: boolean; silent?: boolean; preview?: boolean }) {
  // Refuse anything that isn't a supported text/image/pdf (no-extension → text).
  if (!isOpenablePath(path)) {
    if (!opts?.silent) {
      notifications.setLoadError({ title: "Format", message: t("app.unsupportedFormat", { name: basename(path) }) });
    }
    return;
  }
  const wantPreview = opts?.preview === true;

  const existing = findTabByPath(path);
  if (existing) {
    activeTabId = existing.id;
    // A permanent open (double-click) of an already-open preview tab pins it.
    if (!wantPreview && existing.preview) {
      tabs = tabs.map(t => t.id === existing.id ? { ...t, preview: false } : t);
    }
    saveSessionNow();
    return;
  }

  // For a preview open, reuse the existing preview slot (replace its content)
  // instead of piling up tabs — VS Code behavior.
  const reuse = wantPreview ? tabs.find(t => t.preview) : undefined;
  const title = basename(path);
  const id = reuse?.id ?? crypto.randomUUID();
  if (reuse) {
    tabs = tabs.map(t => t.id === id ? { ...t, path, title, source: "", savedContent: "", preview: true } : t);
  } else {
    tabs = [...tabs, { id, title, path, source: "", savedContent: "", preview: wantPreview }];
  }
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
  void trackMtime(path);
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
    // Editing a preview tab promotes it to a permanent tab (VS Code behavior).
    const promote = tab.preview === true && source !== savedContent;
    tabs = tabs.map(t => t.id === activeTabId
      ? { ...t, source, savedContent, ...(promote ? { preview: false } : null) }
      : t);
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
    void trackMtime(activePath);
  } catch (err) {
    console.error("azprose: save failed", err);
    saveStatus = "dirty";
  }
};

let editingPath = $state<string | null>(null);
let newEntry = $state<{ parent: string; kind: "file" | "folder" } | null>(null);
let treeVersion = $state(0);
let favorites = persistedState<string[]>(STORAGE_KEYS.favorites, []);

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
  if (activePath) saveLastFile(activePath);
});

$effect(() => {
  if (!activePath || extFromPath(activePath) !== "md") {
    presentationOn = false;
    previewOn = false;
  }
  if (!activePath || extFromPath(activePath) !== "typ") {
    typstPreviewOn = false;
    typstViewerOn = false;
    viewerPdfPath = null;
    // Drop stale Typst diagnostics when leaving a .typ. The console itself is a
    // workspace-level panel (Terminal + Diagnostics) — never auto-closed here, so
    // switching tabs/files or clicking Diagnostics doesn't dismiss it.
    diagnosticsStore.clear("typst");
  } else {
    diagnosticsStore.set("typst", typstSvgCache[activePath]?.diagnostics ?? []);
  }
});

// Live diagnostics for the open console outside live-preview mode (code view /
// viewer). In live-preview mode TypstPreview already feeds consoleDiags via
// onCompileResult, so we skip to avoid a double compile.
$effect(() => {
  const path = activePath;
  const text = source;
  if (!consoleOpen || !path || extFromPath(path) !== "typ" || typstPreviewOn) return;
  const timer = setTimeout(async () => {
    try {
      const res = await invoke<{ svg: string | null; diagnostics: Diagnostic[]; pages: number }>(
        "typst_preview",
        { filePath: path, source: text },
      );
      diagnosticsStore.set("typst", res.diagnostics ?? []);
    } catch (err) {
      diagnosticsStore.set("typst", [{ severity: "error", message: `${err}` }]);
    }
  }, 300);
  return () => clearTimeout(timer);
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
            const lastFile = loadLastFile();
            if (lastFile) {
              void openFileInTab(lastFile, { preferDraft: true }).catch(() => {
                saveLastFile(null);
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
      if (!rootPath) { rootPath = folder; setSessionScope(folder); }
      saveGuests(folders.current.slice(1)); // everything past [0] is a guest
    }
  }
};

// Open a project in a NEW window. The folder is passed via the URL (?root=) so the
// child window knows its project synchronously at boot — no Rust handoff, no handshake.
function spawnProjectWindow(folder: string) {
  const label = `azprose-project-${Date.now()}`;
  return new WebviewWindow(label, {
    url: `index.html?root=${encodeURIComponent(folder)}`,
    title: `AZprose — ${basename(folder)}`,
    width: 1280,
    height: 860,
  });
}

const handleOpenProjectByPath = async (folder: string) => {
  const existing = await invoke<string | null>("find_project_window", { path: folder });
  if (existing) {
    const win = WebviewWindow.getByLabel(existing);
    if (win) {
      await win.show();
      await win.unminimize();
      await win.setFocus();
      return;
    }
  }

  if (rootPath) {
    const rel = folderRelation(folder, rootPath);
    if (rel === "same") return; // already this project — nothing to do
    if (rel === "nested") {
      // Parent/child overlap → close this project and open the requested one in
      // its place, to avoid two windows fighting over overlapping FS/index.
      const ok = await confirm(t("project.warnCloseFolder"), { title: "", kind: "warning" });
      if (!ok) return;
      spawnProjectWindow(folder);
      if (getCurrentWindow().label.startsWith("azprose-project-")) {
        _skipCloseConfirm = true;
        await getCurrentWindow().close();
      }
      return;
    }
  }

  // Disjoint → open alongside in a new window.
  spawnProjectWindow(folder);
};

const handleInitProject = async () => {
  const { pickFolder } = await import("@/lib/files");
  const folder = await pickFolder();
  if (!folder) return;
  const name = basename(folder);
  await invoke("add_project", { name, path: folder });
  await handleOpenProjectByPath(folder);
};

const handleCloseFolder = async (path: string) => {
  const folderTabs = tabs.filter(t => t.path.startsWith(path + "/"));
  const dirtyTabs = folderTabs.filter(t => !isPdfPath(t.path) && !isImagePath(t.path) && t.source !== t.savedContent);
  if (dirtyTabs.length > 0) {
    const ok = await confirm(t("tabs.closeUnsavedFolder"), { title: "", kind: "warning" });
    if (!ok) return;
  }
  for (const tab of folderTabs) {
    if (!isPdfPath(tab.path) && !isImagePath(tab.path) && tab.source !== tab.savedContent) {
      saveDraft(tab.path, tab.source);
    }
  }
  const folderIds = new Set(folderTabs.map(t => t.id));
  tabs = tabs.filter(t => !folderIds.has(t.id));
  if (activeTabId && folderIds.has(activeTabId)) {
    activeTabId = tabs[tabs.length - 1]?.id ?? null;
  }
  const next = folders.current.filter((f) => f !== path);
  folders.update(() => next);
  if (rootPath === path) rootPath = next[0] ?? null;
  saveGuests(folders.current.slice(1)); // persist remaining guests for this project
  saveSessionNow();
};

const handleSelectFile = (path: string, permanent?: boolean) => {
  // Single-click → preview (ephemeral) tab ; double-click → permanent tab.
  openFileInTab(path, { preview: !permanent });
};

const handleToggleFavorite = (path: string) => {
  const prev = favorites.current;
  favorites.update(() =>
    prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
  );
};

const handleReorderFavorites = (from: number, to: number) => {
  const prev = favorites.current;
  if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return;
  const next = [...prev];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  favorites.update(() => next);
};

const handleMove = async (src: string, dstParent: string) => {
  try {
    const newPath = await moveEntry(src, dstParent);
    treeVersion++;
    if (activePath === src) {
      activePath = newPath;
      const content = await readMarkdown(newPath).catch(() => null);
      if (content !== null) source = content;
    }
  } catch (err) {
    console.error("azprose: move failed", err);
  }
};

const handleContextMenu = (e: MouseEvent, entry: FileEntry) => {
  const parentDir = entry.isDir ? entry.path : dirname(entry.path);
  const isRoot = rootPath != null && entry.path === rootPath && entry.isDir;

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
    },
    {
      label: favorites.current.includes(entry.path) ? t("sidebar.unfavorite") : t("sidebar.favorite"),
      icon: Star,
      onSelect: () => handleToggleFavorite(entry.path),
    },
    ] as ContextMenuItem[] : []),
    ...(!isRoot ? [{
      label: t("menu.rename"),
      icon: Pencil,
      onSelect: () => { editingPath = entry.path; },
    },
    "divider",
    {
      label: entry.isDir ? t("menu.deleteFolder") : t("menu.delete"),
      icon: Trash2,
      destructive: true,
      onSelect: () => void handleDelete(entry),
    },
    ] as ContextMenuItem[] : []),
    ...(isRoot ? ["divider" as const] : []),
    {
      label: t("menu.copyPath"),
      icon: Copy,
      onSelect: () => void navigator.clipboard.writeText(entry.path),
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
  if (rootPath && src === rootPath) return;
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
  if (rootPath && entry.path === rootPath) return;
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
  const isLinux = await invoke<boolean>("export_pdf");
  if (!isLinux) return;

  // Ensure the rendered preview is in the DOM regardless of current mode.
  const prev = { previewOn, prosemarkOn, presentationOn };
  if (!previewOn) {
    previewOn = true;
    presentationOn = false;
    await tick();
    // Give LazyMarkdownPreview time to resolve its dynamic import and render.
    await new Promise<void>((r) => setTimeout(r, 250));
    await tick();
  }

  document.body.classList.add("mdv-print");
  window.print();
  document.body.classList.remove("mdv-print");

  previewOn = prev.previewOn;
  prosemarkOn = prev.prosemarkOn;
  presentationOn = prev.presentationOn;
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

let canSplit = $derived(editorMode === "raw" && extFromPath(activePath ?? "") === "md");

const handleToggleSplit = (_tabId: string) => {
  if (!canSplit) return;
  splitOn = !splitOn;
};

let splitResizeState: { startX: number; startRatio: number } | null = null;

const startSplitResize = (e: PointerEvent) => {
  const container = (e.currentTarget as HTMLElement).parentElement;
  if (!container) return;
  splitResizeState = { startX: e.clientX, startRatio: splitRatio };
  const rect = container.getBoundingClientRect();
  const onMove = (ev: PointerEvent) => {
    if (!splitResizeState) return;
    const delta = ev.clientX - splitResizeState.startX;
    splitRatio = Math.max(0.2, Math.min(0.8, splitResizeState.startRatio + delta / rect.width));
  };
  const onUp = () => {
    splitResizeState = null;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  e.preventDefault();
};

function syncScroll(left: HTMLElement, right: HTMLElement): () => void {
  const pct = (el: HTMLElement) => {
    const d = el.scrollHeight - el.clientHeight;
    return d > 0 ? el.scrollTop / d : 0;
  };

  let lastL = pct(left);
  let lastR = pct(right);

  const onScroll = () => {
    const curL = pct(left);
    const curR = pct(right);
    const movedL = curL !== lastL;
    const movedR = curR !== lastR;

    if (movedL && !movedR) {
      right.scrollTop = curL * (right.scrollHeight - right.clientHeight);
    } else if (movedR && !movedL) {
      left.scrollTop = curR * (left.scrollHeight - left.clientHeight);
    }

    lastL = pct(left);
    lastR = pct(right);
  };

  left.addEventListener("scroll", onScroll, { passive: true });
  right.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    left.removeEventListener("scroll", onScroll);
    right.removeEventListener("scroll", onScroll);
  };
}

$effect(() => {
  if (!leftPaneEl || !rightPaneEl || !splitOn) return;
  let cleanSync: (() => void) | undefined;
  const attempt = () => {
    const left = leftPaneEl.querySelector<HTMLElement>(".cm-scroller");
    const right = rightPaneEl.querySelector<HTMLElement>(".mdv-preview");
    if (!left || !right) return false;
    cleanSync?.();
    cleanSync = syncScroll(left, right);
    return true;
  };
  const observer = new MutationObserver(() => { if (!cleanSync) attempt(); });
  observer.observe(leftPaneEl, { childList: true, subtree: true });
  observer.observe(rightPaneEl, { childList: true, subtree: true });
  if (!attempt()) {
    const timer = setInterval(() => { if (attempt()) clearInterval(timer); }, 200);
    return () => { clearInterval(timer); observer.disconnect(); cleanSync?.(); };
  }
  return () => { observer.disconnect(); cleanSync?.(); };
});

const handleJumpToLine = (line: number) => {
  jumpToLine = line;
  if (!splitOn) handleSetEditorMode("raw");
  else { prosemarkOn = false; previewOn = false; presentationOn = false; }
};

// Console diagnostic click → editor. Diagnostics are 1-based; the editor is
// 0-based. Ensure an editor is visible (leave viewer mode) to receive the jump.
const handleConsoleJump = (line: number, col?: number | null) => {
  if (typstViewerOn) { typstViewerOn = false; viewerPdfPath = null; }
  jumpToLine = line - 1;
  jumpToCol = col != null ? col - 1 : null;
};

const handleSetEditorMode = (mode: EditorMode) => {
  if (presentationFs && mode !== "presentation") {
    presentationFs = false;
    void getCurrentWindow().setFullscreen(false);
  }
  splitOn = false;
  switch (mode) {
    case "raw":          prosemarkOn = false; previewOn = false; presentationOn = false; break;
    case "prose":        prosemarkOn = true;  previewOn = false; presentationOn = false; break;
    case "preview":      previewOn = true;    presentationOn = false; break;
    // Presentation starts windowed — the user picks a theme from the breadcrumb
    // dropdown, then toggles fullscreen manually.
    case "presentation": prosemarkOn = true;  presentationOn = true; previewOn = false; break;
  }
};

let compilingTypst = $state(false);
let exportingTypst = $state(false);

function typstPdfName(path: string): string {
  return basename(path).replace(/\.typ$/i, ".pdf");
}

const handleToggleTypstPreview = () => {
  typstPreviewOn = !typstPreviewOn;
};

const handleTypstCodeView = () => {
  typstViewerOn = false;
  viewerPdfPath = null;
};

// Compile the current .typ for diagnostics only (no file output) and surface
// them in the console. Returns true if there is no fatal error (safe to export).
async function refreshTypstDiagnostics(): Promise<boolean> {
  if (!activePath) return false;
  try {
    const res = await invoke<{ svg: string | null; diagnostics: Diagnostic[]; pages: number }>(
      "typst_preview",
      { filePath: activePath, source },
    );
    const diags = res.diagnostics ?? [];
    diagnosticsStore.set("typst", diags);
    if (diags.some((d) => d.severity === "error")) consoleOpen = true;
    return res.svg !== null;
  } catch (err) {
    diagnosticsStore.set("typst", [{ severity: "error", message: `${err}` }]);
    consoleOpen = true;
    return false;
  }
}

const handleTypstBuild = async () => {
  if (!activePath || exportingTypst) return;
  exportingTypst = true;
  try {
    const ok = await refreshTypstDiagnostics();
    if (!ok) return; // fatal errors already shown in the console
    const outPath = dirname(activePath) + "/" + typstPdfName(activePath);
    await invoke("typst_export_pdf", { filePath: activePath, source, path: outPath });
    notifications.setInfo(t("app.savedTo", { name: typstPdfName(activePath) }));
  } catch (err) {
    diagnosticsStore.set("typst", [{ severity: "error", message: `${err}` }]);
    consoleOpen = true;
  } finally {
    exportingTypst = false;
  }
};

const handleToggleConsole = () => {
  if (consoleOpen) {
    consoleOpen = false;
    return;
  }
  // Diagnostics only make sense on a .typ; otherwise open straight to the terminal.
  if (!activePath || extFromPath(activePath) !== "typ") consoleTab = "terminal";
  consoleOpen = true;
};

const handleToggleTypstViewer = async () => {
  if (typstViewerOn) {
    typstViewerOn = false;
    viewerPdfPath = null;
    return;
  }
  if (!activePath || compilingTypst) return;
  await handleSave();
  const pdfPath = dirname(activePath) + "/" + typstPdfName(activePath);
  const [srcMtime, pdfMtime] = await Promise.all([getMtime(activePath), getMtime(pdfPath)]);
  const needsCompile = pdfMtime === null || (srcMtime !== null && srcMtime > pdfMtime);
  if (needsCompile) {
    compilingTypst = true;
    const ok = await refreshTypstDiagnostics();
    if (!ok) { compilingTypst = false; return; } // fatal errors shown in console
    try {
      await invoke("typst_export_pdf", { filePath: activePath, source, path: pdfPath });
    } catch (err) {
      diagnosticsStore.set("typst", [{ severity: "error", message: `${err}` }]);
      consoleOpen = true;
      compilingTypst = false;
      return;
    }
    compilingTypst = false;
  }
  typstPreviewOn = false;
  viewerPdfPath = pdfPath;
  typstViewerOn = true;
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
    toggleFullscreen,
    openRecent: (path: string) => { openFileInTab(path); },
    recentFiles: [],
    hasActivePath: activePath != null,
    sidebarOpen: sidebarOpen.current,
    toggleFavorite: () => { if (activePath) handleToggleFavorite(activePath); },
    currentFilePath: activePath,
  }, t),
);
</script>

<div
  class="mdv-app{sidebarOpen.current ? " has-sidebar" : ""}{!titlebarVisible.current ? " has-hidden-titlebar" : ""}"
  style={writingDisplayStyle}
>
  <TitleBar
    rootName={rootPath ? basename(rootPath) : undefined}
  />

  <Breadcrumb
    sidebarOpen={sidebarOpen.current}
    onToggleSidebar={handleToggleSidebar}
    {opencodeOpen}
    onToggleOpencode={() => opencodeOpen = !opencodeOpen}
    {rootPath}
    {activePath}
    {saveStatus}
    onExportPdf={handleExportPdf}
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
    {typstViewerOn}
    {compilingTypst}
    {exportingTypst}
    onTypstCodeView={activePath && extFromPath(activePath) === "typ" ? handleTypstCodeView : undefined}
    onToggleTypstViewer={activePath && extFromPath(activePath) === "typ" ? handleToggleTypstViewer : undefined}
    onTypstBuild={activePath && extFromPath(activePath) === "typ" ? handleTypstBuild : undefined}
    {consoleOpen}
    onToggleConsole={handleToggleConsole}
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
      favorites={favorites.current}
      onToggleFavorite={handleToggleFavorite}
      onReorderFavorites={handleReorderFavorites}
      onMove={handleMove}
      onOpenProject={handleOpenProjectByPath}
      onProjectFromFolder={handleInitProject}
    />

    <div class="mdv-workspace">
      {#if tabs.length > 0}
        <TabsBar {tabs} {activeTabId} onSelect={handleTabSelect} onClose={closeTab} onReorder={handleTabReorder} {splitOn} {canSplit} onToggleSplit={handleToggleSplit} {typstPreviewOn} onToggleTypstPreview={!typstViewerOn && activePath && extFromPath(activePath) === "typ" ? handleToggleTypstPreview : undefined} />
      {/if}
      <div class="mdv-workspace__content">
        <svelte:boundary onerror={(error) => handleViewCrash(error)}>
        {#if splitOn && canSplit}
          <div class="mdv-split">
            <div bind:this={leftPaneEl} class="mdv-split__pane" style="flex: {splitRatio}">
              <Editor
                value={source}
                language={extFromPath(activePath)}
                onChange={(next) => { source = next; }}
                {jumpToLine}
                {jumpToCol}
                onJumpApplied={() => { jumpToLine = null; jumpToCol = null; }}
              />
            </div>
            <div
              class="mdv-split__resize"
              onpointerdown={startSplitResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize split"
            />
            <div bind:this={rightPaneEl} class="mdv-split__pane" style="flex: {1 - splitRatio}">
              <LazyMarkdownPreview value={source} filePath={activePath} onJumpToLine={handleJumpToLine} />
            </div>
          </div>
        {:else if typstPreviewOn && activePath && extFromPath(activePath) === "typ"}
          <div class="mdv-split">
            <div bind:this={leftPaneEl} class="mdv-split__pane" style="flex: {splitRatio}">
              <Editor
                value={source}
                language={extFromPath(activePath)}
                onChange={(next) => { source = next; }}
                {jumpToLine}
                {jumpToCol}
                onJumpApplied={() => { jumpToLine = null; jumpToCol = null; }}
              />
            </div>
            <div
              class="mdv-split__resize"
              onpointerdown={startSplitResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize split"
            />
            <div bind:this={rightPaneEl} class="mdv-split__pane" style="flex: {1 - splitRatio}">
              <TypstPreview
                value={source}
                filePath={activePath}
                initialSvg={activePath ? (typstSvgCache[activePath]?.svg ?? null) : null}
                initialCompiledSource={activePath ? (typstSvgCache[activePath]?.compiledSource ?? null) : null}
                initialDiags={activePath ? (typstSvgCache[activePath]?.diagnostics ?? []) : []}
                onCompileResult={(svg, diags, compiledSource) => {
                  const safeDiags = diags ?? [];
                  if (activePath) {
                    const prev = typstSvgCache[activePath];
                    typstSvgCache[activePath] = {
                      svg: svg ?? prev?.svg ?? "",
                      compiledSource,
                      diagnostics: safeDiags,
                    };
                  }
                  diagnosticsStore.set("typst", safeDiags);
                  if (safeDiags.some((d) => d.severity === "error")) consoleOpen = true;
                }}
              />
            </div>
          </div>
        {:else if typstViewerOn && viewerPdfPath}
          <div class="mdv-shell__editor-solo">
            <LazyPdfViewer path={viewerPdfPath} />
          </div>
        {:else}
          <div class="mdv-shell__editor-solo">
            {#if activePath}
              {#if isPdfPath(activePath)}
                <LazyPdfViewer path={activePath} />
              {:else if isImagePath(activePath)}
                <ImageViewer path={activePath} />
              {:else if previewOn && extFromPath(activePath) === "md"}
                <LazyMarkdownPreview value={source} filePath={activePath} onJumpToLine={handleJumpToLine} />
              {:else if prosemarkOn && presentationOn && extFromPath(activePath) === "md"}
                <LazySlideDeck value={source} filePath={activePath} fullscreen={presentationFs} onExitFullscreen={toggleFullscreen} />
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
                  {jumpToLine}
                  {jumpToCol}
                  onJumpApplied={() => { jumpToLine = null; jumpToCol = null; }}
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
        {/if}

        {#snippet failed(error, reset)}
          <div class="mdv-view-crash">
            <p class="mdv-view-crash__title">Cette vue a planté.</p>
            <pre class="mdv-view-crash__msg">{error instanceof Error ? error.message : String(error)}</pre>
            <button type="button" class="mdv-btn" onclick={reset}>Recharger la vue</button>
          </div>
        {/snippet}
        </svelte:boundary>
      </div>
      {#if consoleMounted}
        <ConsolePanel
          diagnostics={consoleDiags}
          height={consoleHeight}
          activeTab={consoleTab}
          terminalCwd={rootPath ?? (activePath ? dirname(activePath) : null)}
          hidden={!consoleOpen}
          onTabChange={(tab) => { consoleTab = tab; }}
          onHeightChange={(h) => { consoleHeight = h; }}
          onClose={() => { consoleOpen = false; }}
          onJumpToLine={handleConsoleJump}
        />
      {/if}
    </div>

    <OpencodeSidebar open={opencodeOpen} />
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
    open={fileConflict != null && notifications.loadError == null}
    message={fileConflict ? t("app.fileConflict") : ""}
    variant="error"
    durationMs={null}
    onDismiss={() => fileConflict = null}
    action={{ label: t("app.reloadDiscard"), onClick: () => { const p = fileConflict; fileConflict = null; if (p) reloadFile(p); } }}
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
