<script lang="ts">
import { onMount } from "svelte";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import { confirm } from "@tauri-apps/plugin-dialog";

import { checkForUpdate } from "@/lib/updater";
import { language, getT } from "@/lib/i18n";
import { overlays } from "@/stores/overlays.svelte";
import { notifications } from "@/stores/notifications.svelte";
import { contextMenu } from "@/stores/context-menu.svelte";
import { persistedState } from "@/stores/persisted.svelte";
import {
  STORAGE_KEYS,
  CHANGELOG_URL,
  getWhatsNewToastMessage,
  isImagePath,
  isPdfPath,
  isOpenablePath,
  basename,
  dirname,
  buildCommands,
} from "@/lib";
import {
  DEFAULT_TYPOGRAPHY,
  getTypographyVars,
  normalizeFontSize,
  normalizeLineHeight,
  normalizeTextAlign,
  normalizeFontFamily,
  type TypographySettings,
} from "@/lib/typography";
import Toast from "@/components/overlays/Toast.svelte";
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
import { PanelManager } from "@/lib/panel-manager";
import PanelLayout from "@/components/panels/PanelLayout.svelte";
import { slideSettings } from "@/stores/slide-settings.svelte";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import { logStore } from "@/components/console/log.svelte";
import { executeOxideCommand } from "@/lib/lsp/markdown-oxide";
import { writeMarkdown } from "@/lib/files";
import { extFromPath } from "@/lib/editor-languages";
import { saveSession, clearDraft, setSessionScope, saveLastFile, loadGuests } from "@/lib/session";
import {
  findTabByPath as findTabByPathUtil,
  saveSessionNow as saveSessionNowUtil,
  scheduleSessionMirror as scheduleSessionMirrorUtil,
  flushSessionMirror as flushSessionMirrorUtil,
  saveAllDirtyDrafts as saveAllDirtyDraftsUtil,
} from "@/lib/session-utils";
import {
  trackMtime as trackMtimeUtil,
  reloadFile as reloadFileUtil,
  checkExternalChanges as checkExternalChangesUtil,
  setupExternalChangeAlerts,
  setupDragDrop,
  setupFsWatcher,
  type ExternalChangeState,
  type ExternalChangeDeps,
} from "@/lib/app-events";
import { generalSettings } from "@/stores/general-settings.svelte";
import { proseMarkSettings, previewSettings, presentationSettings } from "@/stores/markdown-settings.svelte";
import { setRootPath } from "@/stores/root-path.svelte";
import { setScrollTarget } from "@/stores/scroll-target.svelte";
import { setSyncLine } from "@/stores/sync-line.svelte";
import { flushAllCsvCaches } from "@/csv/flush";
import { getCursorLine } from "@/stores/cursor-line.svelte";
import { navPush, navBack, navForward, navPushForward, setNavActions } from "@/stores/nav-history.svelte";
import {
  createLatexState,
  cleanLatexAux, cleanLatexAuxAndOutput, cleanLatexAll,
} from "@/latex";
import { createBuildState } from "@/typst/backend";
import { FileOpsManager } from "@/lib/file-operations.svelte";
import ConsolePanel from "@/components/console/ConsolePanel.svelte";
import { mathJaxPreamble, mathJaxPackages } from "@/stores/mathjax-preamble.svelte";
import { latexSettings } from "@/stores/latex-settings.svelte";
import { typstSettings } from "@/stores/typst-settings.svelte";
import { theme } from "@/stores/theme.svelte";
import { createHandlers, type HandlerContext } from "@/lib/handlers";
import { handleKeydown, type KeyboardDeps } from "@/lib/app-keyboard";
import {
  scheduleConfigSync as scheduleConfigSyncUtil,
  flushConfigSync as flushConfigSyncUtil,
  loadConfig as loadConfigUtil,
  type ConfigSyncContext,
} from "@/lib/config-sync";
import {
  handleAddFolder as handleAddFolderUtil,
  handleOpenProjectByPath as handleOpenProjectByPathUtil,
  handleCloseFolder as handleCloseFolderUtil,
  handleInitProject as handleInitProjectUtil,
  handleExportPdf as handleExportPdfUtil,
  type ProjectManagementDeps,
} from "@/lib/project-management";
import { setupSessionRestore, type SessionRestoreDeps } from "@/lib/session-restore";
import { handleApplyUpdate as handleApplyUpdateUtil, handleManualUpdateCheck as handleManualUpdateCheckUtil, type UpdateUIState } from "@/lib/update-ui";
import { handleViewCrash as handleViewCrashUtil, setupCrashListener, type CrashHandlerDeps } from "@/lib/crash-handler";
import { setupCloseHandler } from "@/lib/close-handler";
import {
  setEditorMode as setEditorModeUtil,
  toggleSideRenderMode as toggleSideRenderModeUtil,
  gutterClick as gutterClickUtil,
  inverseSync as inverseSyncUtil,
  jumpToLine as jumpToLineUtil,
  consoleJump as consoleJumpUtil,
  type EditorMode,
  type EditorModeDeps,
} from "@/lib/editor-mode";
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
let titlebarVisible = persistedState<boolean>(STORAGE_KEYS.titlebarVisible, true);
let folders = persistedState<string[]>(STORAGE_KEYS.folders, []);
// Project root = ?root= (project windows) or the last project (main window). Scope the
// session storage to it, then rebuild folders as [projectRoot, ...scoped guests] so the
// project comes from the URL and guests persist per project (no telescoping).
const projectRoot = urlRoot ?? folders.current[0] ?? null;
setSessionScope(projectRoot);
if (projectRoot) folders.update(() => [projectRoot, ...loadGuests().filter((g) => g !== projectRoot)]);
let typography = persistedState<TypographySettings>(STORAGE_KEYS.typography, DEFAULT_TYPOGRAPHY);

let dragActive = $state(false);
let whatsNewVersion = $state<string | null>(null);
let updateAvail = $state<{ version: string } | null>(null);
let updateInstalling = $state(false);
let updateUpToDate = $state(false);

let rootPath = $state<string | null>(projectRoot);

// Keep session scope (and getProjectRoot()) in sync with rootPath changes
// so LSP servers can access the project root without prop drilling.
$effect(() => { setSessionScope(rootPath); });

// Keep the rootPath store in sync for preview components (wikilink resolution).
$effect(() => { setRootPath(rootPath); });

// Ensure .moxide.toml exists at project root before markdown-oxide spawns.
// Handled by markdown handler after lazy load.

let pm = new PanelManager({
  onSessionChange: (data) => {
    _panelVersion++;
    saveSession({
      main: data.main,
      side: { ...data.side, visible: pm.sideVisible },
    });
    scheduleSessionMirror();
  },
  onError: (title, message) => {
    notifications.setLoadError({ title, message });
  },
});

// Reactive panel version — incremented after every panel mutation to trigger
// $derived.by re-evaluation. PanelManager stays non-reactive (plain class).
let _panelVersion = $state(0);

// sideVisible and splitRatio are $state directly (not driven by _panelVersion)
// so they update in real-time during resize / toggle.
let sideVisible = $state(pm.sideVisible);
let splitRatio = $state(pm.splitRatio);

// Main panel reactive views
let tabs = $derived.by(() => { _panelVersion; return pm.main.tabs; });
let activeTabId = $derived.by(() => { _panelVersion; return pm.main.activeTabId; });
let source = $derived.by(() => { _panelVersion; return pm.main.source; });
let savedContent = $derived.by(() => { _panelVersion; return pm.main.savedContent; });
let activePath = $derived.by(() => { _panelVersion; return pm.main.activePath; });

// Side panel reactive views
let sideTabs = $derived.by(() => { _panelVersion; return pm.side.tabs; });
let sideActiveTabId = $derived.by(() => { _panelVersion; return pm.side.activeTabId; });
let sideActivePath = $derived.by(() => { _panelVersion; return pm.side.activePath; });

$effect(() => {
  if (sideTabs.length === 0 && sideVisible) {
    pm.sideVisible = false;
    sideVisible = false;
  }
});

let words = $state(0);
let minutes = $state(1);

let vimOn = $state(false);
let prosemarkOn = $state(generalSettings.defaultEditorMode === "prose");
let jumpToLine = $state<number | null>(null);
let jumpToCol = $state<number | null>(null);
let forwardTargetPage = $state<number | null>(null);

let presentationFs = $state(false);
let viewerFullscreenOn = $state(false);
let ls = $state(createLatexState());
let ts = $state(createBuildState());
let consoleOpen = $state(false);
let consoleHeight = $state(160);

// POC: LSP frontend test — starts tinymist on mount, logs diagnostics to console
const consoleDiags = $derived(diagnosticsStore.all);
const logLines = $derived.by(() => {
  const ext = activePath ? extFromPath(activePath) : "";
  if (ext === "typ") return logStore.get("typst");
  if (ext === "tex") return logStore.get("latex");
  if (ext === "md") return logStore.get("markdown");
  return [];
});
let consoleTab = $state<"diagnostics" | "terminal" | "log">("diagnostics");
// Once the console has been opened, keep ConsolePanel mounted (hidden when closed)
// so the Terminal/shell session survives a close — VS Code behavior.
let consoleMounted = $state(false);
$effect(() => { if (consoleOpen) consoleMounted = true; });

let saveStatus = $state<"idle" | "dirty" | "saving" | "saved">("idle");

let configRoot = $state<string | null>(null);
let configLoaded = $state(false);
let themeBootDone = $state(false);
let _skipCloseConfirm = false;

function scheduleConfigSync() {
  scheduleConfigSyncUtil(configSyncCtx);
}

function flushConfigSync() {
  flushConfigSyncUtil();
}

const configSyncCtx: ConfigSyncContext = {
  get configRoot() { return configRoot; },
  get configLoaded() { return configLoaded; },
  get vimOn() { return vimOn; },
  get typo() { return typo; },
  get fo() { return fo; },
}

async function loadConfig(root: string) {
  configRoot = await loadConfigUtil(root, {
    vimOn: { get current() { return vimOn; }, set current(v) { vimOn = v; } },
    typography,
    fo,
    setConfigLoaded: (v) => { configLoaded = v; },
    setThemeBootDone: (v) => { themeBootDone = v; },
    notify: notifications,
    t,
  });
}

$effect(() => {
  const root = rootPath;
  theme.setProjectRoot(root);
  if (root) void loadConfig(root);
  else themeBootDone = true;
});

// Fade out the boot splash once the theme is ready (crafted CSS injected + themeMode
// applied) → no flash, crafted themes correct at first paint.
let splashRemoved = false;
$effect(() => {
  if (!themeBootDone || splashRemoved) return;
  splashRemoved = true;
  requestAnimationFrame(() => {
    const boot = document.getElementById("boot");
    if (boot) {
      boot.style.opacity = "0";
      boot.addEventListener("transitionend", () => boot.remove(), { once: true });
    }
  });
});

$effect(() => {
  if (!configRoot) return;
  proseMarkSettings.current;
  previewSettings.current;
  presentationSettings.current;
  slideSettings.mode;
  generalSettings.defaultEditorMode;
  typography.current;
  mathJaxPreamble.current;
  mathJaxPackages.current;
  vimOn;
  theme.mode;
  latexSettings.current;
  typstSettings.current;
  scheduleConfigSync();
});

// Typst settings sync and auto-export on type → handled by typst handler

// mtime tracking for external change detection
let mtimeMap = $state(new Map<string, number>());
let fileConflict = $state<string | null>(null);
let externalChangeAlerts = $state(true);

const extChangeState: ExternalChangeState = { mtimeMap, get fileConflict() { return fileConflict; }, get externalChangeAlerts() { return externalChangeAlerts; } };
const extChangeDeps: ExternalChangeDeps = {
  get pm() { return pm; },
  get tabs() { return tabs; },
  bumpPanelVersion: () => { _panelVersion++; },
  setFileConflict: (v) => { fileConflict = v; },
  setExternalChangeAlerts: (v) => { externalChangeAlerts = v; },
  notify: notifications,
  t,
};

$effect(() => { return setupExternalChangeAlerts((v) => { externalChangeAlerts = v; }); });

async function trackMtime(path: string) { await trackMtimeUtil(extChangeState, path); }
async function reloadFile(path: string) { await reloadFileUtil(extChangeState, extChangeDeps, path); }
async function checkExternalChanges() { await checkExternalChangesUtil(extChangeState, extChangeDeps); }

onMount(() => {
  // Safety net: never trap the splash if config/theme load hangs.
  const splashSafety = setTimeout(() => { themeBootDone = true; }, 2000);

  const myLabel = getCurrentWindow().label;
  const isProjectWindow = myLabel.startsWith("azprose-project-");
  // Folder already known from ?root= (see urlRoot) — just register this window so
  // find_project_window can detect it. No event handshake.
  if (isProjectWindow && urlRoot) {
    void invoke("register_project_window", { label: myLabel, path: urlRoot });
  }

  // Close handling for EVERY window.
  setupCloseHandler({
    tabs,
    skipCloseConfirm: _skipCloseConfirm,
    isProjectWindow,
    myLabel,
    saveAllDirtyDrafts,
    flushSessionMirror,
    t,
  });

  // Sauvegarde des brouillons sur perte de focus (stratégie VSCode hot-exit).
// localStorage est synchrone : pas de risque de perte sur crash.
  const onBlur = () => saveAllDirtyDrafts();
  const onVisibility = () => { if (document.visibilityState === "hidden") { saveAllDirtyDrafts(); flushSessionMirror(); void flushAllCsvCaches(); } };
  const onBeforeUnload = () => { saveAllDirtyDrafts(); flushSessionMirror(); void flushAllCsvCaches(); };
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

  // ── Latex log listener, oxide events, wikilink nav → handlers ──

  // — preview navigation history (back / forward) —
  const navGoBack = () => {
    if (!sideActivePath) return;
    const prev = navBack();
    if (!prev) return;
    navPushForward(sideActivePath);
    pm.openInSide(prev, { preview: true }).catch(() => {});
  };
  const navGoForward = () => {
    if (!sideActivePath) return;
    const next = navForward();
    if (!next) return;
    navPush(sideActivePath);
    pm.openInSide(next, { preview: true }).catch(() => {});
  };
  setNavActions({ goBack: navGoBack, goForward: navGoForward });

  // ── File-type handlers (typst, latex, markdown) — lazy-loaded ──
  const handlerCtx: HandlerContext = {
    activePath:     () => activePath,
    source:         () => source,
    savedContent:   () => savedContent,
    consoleOpen:    () => consoleOpen,
    rootPath:       () => rootPath,
    sideActivePath: () => sideActivePath,
    getCursorLine:  () => getCursorLine(),
    setConsoleOpen: (v) => { consoleOpen = v; },
    setConsoleTab:  (tab) => { consoleTab = tab; },
    setSideVisible: (v) => { sideVisible = v; pm.sideVisible = v; },
    setScrollTarget: (target) => { setScrollTarget(target); },
    setSyncLine:    (line) => { setSyncLine(line); },
    navPush:        (path) => { navPush(path); },
    ts,
    ls,
    pm,
    openFileInTab: async (path, opts) => { await openFileInTab(path, opts); },
    bumpPanelVersion: () => { _panelVersion++; },
    currentExt: () => activePath ? extFromPath(activePath) : null,
    handleSave:    () => handleSave(),
    handleSaveAll: async (deps) => { await handleSaveAll(deps); },
    t: (key, params) => t(key, params),
    notify: notifications,
  };
  const { cleanup: cleanupHandlers } = createHandlers(handlerCtx);

  return () => {
    cleanupHandlers();
    clearTimeout(splashSafety);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("beforeunload", onBeforeUnload);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibilityVisible);
    window.removeEventListener("beforeunload", onConfigFlush);
    document.removeEventListener("visibilitychange", onConfigVisibility);
  };
});

function saveSessionNow() {
  saveSessionNowUtil({ pm, projectRoot, onSessionChange: () => { _panelVersion++; } });
  scheduleSessionMirror();
}

// Portable session mirror (Étape 2b): debounce a write of the session to
// <project>/.azprose/session.json alongside the scoped localStorage.
function scheduleSessionMirror() {
  scheduleSessionMirrorUtil({ pm, projectRoot });
}

function flushSessionMirror() {
  flushSessionMirrorUtil({ pm, projectRoot });
}

function saveAllDirtyDrafts() {
  saveAllDirtyDraftsUtil(pm);
}

// Crash plumbing. A render/effect error caught by the per-view <svelte:boundary>
// (or an async error relayed from main.ts via azprose:crash) flushes drafts and
// surfaces the error in the Diagnostics console instead of killing the UI.
const crashDeps: CrashHandlerDeps = {
  saveAllDirtyDrafts,
  flushSessionMirror,
  setConsoleTab: (tab) => { consoleTab = tab; },
  setConsoleOpen: (v) => { consoleOpen = v; },
};
function handleViewCrash(error: unknown) { handleViewCrashUtil(crashDeps, error); }
$effect(() => setupCrashListener(crashDeps));

$effect(() => {
  const onJump = (e: Event) => handleJumpToLine((e as CustomEvent<number>).detail);
  window.addEventListener("azprose:jump-to-line", onJump);
  return () => window.removeEventListener("azprose:jump-to-line", onJump);
});

$effect(() => {
  const onJumpFile = async (e: Event) => {
    const { path, line } = (e as CustomEvent<{ path: string; line?: number }>).detail;
    if (!path) return;
    // Normalize path (same as handleInverseSync)
    const normFile = path.replace(/\\/g, "/").split("/").filter(s => s !== ".").join("/");
    const found = pm.findTabByPath(normFile);
    if (found && found.panel === "main") {
      pm.main.select(found.tab.id);
    } else {
      await pm.openInMain(normFile, { silent: true, preview: true });
    }
    if (line != null) {
      jumpToLine = line;
      handleSetEditorMode("raw");
    }
  };
  window.addEventListener("azprose:jump-to-file", onJumpFile);
  return () => window.removeEventListener("azprose:jump-to-file", onJumpFile);
});

async function openFileInTab(path: string, opts?: { preferDraft?: boolean; silent?: boolean; preview?: boolean; sourceType?: "latex" | "typst" }) {
  if (!isOpenablePath(path)) {
    if (!opts?.silent) {
      notifications.setLoadError({ title: "Format", message: t("app.unsupportedFormat", { name: basename(path) }) });
    }
    return;
  }
  if (isImagePath(path) || isPdfPath(path)) {
    await pm.openInSide(path, opts);
    sideVisible = true;
  } else {
    await pm.openInMain(path, opts);
  }
  void trackMtime(path);
}

function closeTab(id: string) {
  pm.main.close(id);
}

const fo = new FileOpsManager({
  pm,
  getRootPath: () => rootPath,
  getActivePath: () => activePath,
  onOpenFile: openFileInTab,
  onTabClose: closeTab,
  onTreeChange: () => { fo.treeVersion++; },
  onPanelChange: () => { _panelVersion++; },
  getT: () => t,
});

// ── Filesystem watcher: bump treeVersion on external changes ──
$effect(() => {
  return setupFsWatcher(rootPath, { bumpTreeVersion: () => { fo.treeVersion++; } });
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

const handleSave = async () => {
  if (!activePath || saveStatus !== "dirty") return;
  saveStatus = "saving";
  try {
    await pm.main.save();
    saveStatus = "saved";
    clearDraft(activePath);
    void trackMtime(activePath);
  } catch (err) {
    console.error("azprose: save failed", err);
    saveStatus = "dirty";
  }
};

/** Save all dirty tabs that match a list of file paths (used to flush LaTeX deps before build). */
const handleSaveAll = async (deps: string[]) => {
  const norm = (p: string) => p.replace(/\\/g, "/");
  const depSet = new Set(deps.map(norm));
  for (const tab of pm.main.tabs) {
    if (tab.source !== tab.savedContent && depSet.has(norm(tab.path))) {
      try {
        await writeMarkdown(tab.path, tab.source);
        pm.main.tabs = pm.main.tabs.map((t: any) => t.id === tab.id ? { ...t, savedContent: tab.source } : t);
        _panelVersion++;
        if (tab.path !== activePath) clearDraft(tab.path);
      } catch { /* best-effort */ }
    }
  }
};

let typo = $derived<TypographySettings>({
  markdownFont: normalizeFontFamily(typography.current.markdownFont),
  markdownFontSize: normalizeFontSize(typography.current.markdownFontSize),
  markdownLineHeight: normalizeLineHeight(typography.current.markdownLineHeight),
  markdownAlign: normalizeTextAlign(typography.current.markdownAlign),
  codeFont: normalizeFontFamily(typography.current.codeFont),
  codeFontSize: normalizeFontSize(typography.current.codeFontSize),
  codeLineHeight: normalizeLineHeight(typography.current.codeLineHeight),
  codeLineNumbers: typography.current.codeLineNumbers !== false,
});
let typographyStyle = $derived(getTypographyVars(typo));

$effect(() => {
  document.title = activePath ? basename(activePath) : "untitled";
});

$effect(() => {
  if (activePath) saveLastFile(activePath);
});

// File-type cleanup, root detection, live diagnostics, side sync, forward sync → handlers

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

// Side panel source sync → handled by typst + markdown handlers

// Forward sync: editor cursor → Typst Live View → handled by typst handler

$effect(() => {
  const timer = window.setTimeout(async () => {
    const result = await checkForUpdate();
    if (result.status === "available") {
      updateAvail = { version: result.version };
    }
  }, 1500);
  return () => window.clearTimeout(timer);
});

$effect(() => {
  if (!viewerFullscreenOn) return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      exitViewerFullscreen();
    }
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
});

const updateUIState: UpdateUIState = {
  get updateInstalling() { return updateInstalling; },
  get updateAvail() { return updateAvail; },
  get updateUpToDate() { return updateUpToDate; },
  setUpdateInstalling: (v) => { updateInstalling = v; },
  setUpdateAvail: (v) => { updateAvail = v; },
  setUpdateUpToDate: (v) => { updateUpToDate = v; },
  notify: notifications,
};
const handleApplyUpdate = () => handleApplyUpdateUtil(updateUIState);
const handleManualUpdateCheck = () => handleManualUpdateCheckUtil(updateUIState);

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

const toggleViewerFullscreen = async () => {
  const win = getCurrentWindow();
  try {
    viewerFullscreenOn = !viewerFullscreenOn;
    await win.setFullscreen(viewerFullscreenOn);
  } catch (err) {
    console.error("azprose: viewer fullscreen toggle failed", err);
  }
};

function exitViewerFullscreen() {
  if (!viewerFullscreenOn) return;
  viewerFullscreenOn = false;
  void getCurrentWindow().setFullscreen(false);
}

const projectManagementCtx: ProjectManagementDeps = {
  pm,
  fo,
  get rootPath() { return rootPath; },
  setRootPath: (v) => { rootPath = v; },
  get sideVisible() { return sideVisible; },
  setSideVisible: (v) => { sideVisible = v; pm.sideVisible = v; },
  get tabs() { return tabs; },
  folders,
  get projectRoot() { return projectRoot; },
  openFileInTab,
  findTabByPath: (p) => findTabByPathUtil(pm, p) as any,
  skipCloseConfirm: { get current() { return _skipCloseConfirm; }, set current(v) { _skipCloseConfirm = v; } },
  saveSessionNow,
  notify: notifications,
  t,
};
const handleAddFolder = () => handleAddFolderUtil(projectManagementCtx);
const handleOpenProjectByPath = (f: string) => handleOpenProjectByPathUtil(projectManagementCtx, f);
const handleInitProject = () => handleInitProjectUtil(projectManagementCtx);
const handleCloseFolder = (path: string) => handleCloseFolderUtil(projectManagementCtx, path);
const handleExportPdf = () => handleExportPdfUtil({ pm, activePath, extFromPath, themeResolved: theme.resolved });

// Session restore, CLI open-file, CLI project-folder, single-instance open-project
$effect(() => {
  const sessionCtx: SessionRestoreDeps = {
    pm,
    projectRoot,
    openFileInTab,
    findTabByPath: (p) => findTabByPathUtil(pm, p) as any,
    setSideVisible: (v) => { sideVisible = v; pm.sideVisible = v; },
    setRootPath: (v) => { rootPath = v; },
    setSessionScope,
    folders,
    setProjectRoot: (v) => { theme.setProjectRoot(v); },
    loadGuests,
    handleOpenProjectByPath,
  };
  return setupSessionRestore(sessionCtx, urlRoot);
});

$effect(() => {
  return setupDragDrop({
    openFileInTab,
    setDragActive: (v) => { dragActive = v; },
    notify: notifications,
    t,
  });
});

$effect(() => {
  const kbd: KeyboardDeps = {
    activePath,
    source,
    ls,
    ts,
    pm,
    sideVisible,
    setConsoleOpen: (v) => { consoleOpen = v; },
    setConsoleTab: (tab) => { consoleTab = tab; },
    setSideVisible: (v) => { sideVisible = v; pm.sideVisible = v; },
    handleSave,
    handleSaveAll,
    handleExportPdf,
    handleSetEditorMode,
    sidebarOpen,
    notify: notifications,
    t,
  };
  const onKey = (e: KeyboardEvent) => handleKeydown(e, kbd);
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
});

const handleToggleVim = () => {
  vimOn = !vimOn;
};

const handleToggleTitlebar = () => {
  titlebarVisible.update((v: boolean) => !v);
};

const editorMode = $derived<EditorMode>(
  sideActivePath && pm.side.activeTab?.renderMode === "presentation" ? "presentation"
  : sideActivePath && pm.side.activeTab?.renderMode === "preview" ? "preview"
  : prosemarkOn ? "prose"
  : "raw"
);

const editorModeCtx: EditorModeDeps = {
  pm,
  get activePath() { return activePath; },
  get sideVisible() { return sideVisible; },
  setSideVisible: (v) => { sideVisible = v; pm.sideVisible = v; },
  get presentationFs() { return presentationFs; },
  setPresentationFs: (v) => { presentationFs = v; },
  get prosemarkOn() { return prosemarkOn; },
  setProsemarkOn: (v) => { prosemarkOn = v; },
  bumpPanelVersion: () => { _panelVersion++; },
  get jumpToLine() { return jumpToLine; },
  setJumpToLine: (v) => { jumpToLine = v; },
  get jumpToCol() { return jumpToCol; },
  setJumpToCol: (v) => { jumpToCol = v; },
  setForwardTargetPage: (v) => { forwardTargetPage = v; },
  ls,
  extFromPath,
  invoke,
  notify: notifications,
};

const handleJumpToLine = (line: number) => jumpToLineUtil(editorModeCtx, line);
const handleGutterClick = (line: number) => gutterClickUtil(editorModeCtx, line);
const handleInverseSync = (file: string, line: number) => inverseSyncUtil(editorModeCtx, file, line);
const handleConsoleJump = (line: number, col?: number | null) => consoleJumpUtil(editorModeCtx, line, col);
const handleSetEditorMode = (mode: EditorMode) => setEditorModeUtil(editorModeCtx, mode);
const handleToggleSideRenderMode = () => toggleSideRenderModeUtil(editorModeCtx);

const handleToggleConsole = () => {
  if (consoleOpen) {
    consoleOpen = false;
    return;
  }
  // Diagnostics only make sense on a .typ, .tex or .md; otherwise open straight to the terminal.
  if (!activePath || (extFromPath(activePath) !== "typ" && extFromPath(activePath) !== "tex" && extFromPath(activePath) !== "md")) consoleTab = "terminal";
  consoleOpen = true;
};

const handleToggleViewPanel = () => {
  sideVisible = !sideVisible;
  pm.sideVisible = sideVisible;
};

const handleTypographyChange = (patch: Partial<TypographySettings>) => {
  typography.current = { ...typo, ...patch };
};

const handleResetTypography = () => {
  typography.current = { ...DEFAULT_TYPOGRAPHY };
};

let cmds = $derived(
  buildCommands({
    newFile: fo.newFile,
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
    toggleFavorite: () => { if (activePath) fo.toggleFavorite(activePath); },
    currentFilePath: activePath,
    // oxide: daily note commands
    oxidToday: () => executeOxideCommand("today"),
    oxidYesterday: () => executeOxideCommand("yesterday"),
    oxidTomorrow: () => executeOxideCommand("tomorrow"),
    oxidJump: () => executeOxideCommand("jump"),
    isMdActive: activePath != null && extFromPath(activePath) === "md",
    exportPdf: handleExportPdf,
    isTypstActive: activePath != null && extFromPath(activePath) === "typ",
    isLatexActive: activePath != null && extFromPath(activePath) === "tex",
    typstClean: async () => { if (activePath) { const { cleanBuild } = await import("@/typst/build"); cleanBuild(activePath); } },
    typstCleanAll: async () => { if (activePath) { const { cleanAll } = await import("@/typst/build"); cleanAll(dirname(activePath)); } },
    latexCleanAux: () => activePath && cleanLatexAux(ls.rootFilePath ?? activePath),
    latexCleanAuxAndOutput: () => activePath && cleanLatexAuxAndOutput(ls.rootFilePath ?? activePath),
    latexCleanAll: async () => {
      if (!activePath) return;
      const ok = await confirm(t("latex.cleanAllConfirm"), { title: t("latex.cleanAllTitle"), kind: "warning" });
      if (ok) await cleanLatexAll(ls.rootFilePath ?? activePath);
    },
    setEditorMode: (mode: "raw" | "prose" | "preview") => {
      handleSetEditorMode(mode);
    },
    startPresentation: () => handleSetEditorMode("presentation"),
    editorMode,
    latexBuild: async () => {
      if (!activePath) return;
      const { handleLatexBuild } = await import("@/latex");
      await handleLatexBuild(ls, activePath, handleSave, handleSaveAll, () => consoleOpen = true, () => consoleTab = "log");
      if (ls.viewerPdfPath) { await pm.openInSide(ls.viewerPdfPath, { sourceType: "latex" }); sideVisible = true; }
    },
    latexViewPdf: async () => {
      if (!activePath) return;
      const { handleLatexBuild } = await import("@/latex");
      if (!ls.viewerPdfPath) await handleLatexBuild(ls, activePath, handleSave, handleSaveAll, () => consoleOpen = true);
      if (ls.viewerPdfPath) { await pm.openInSide(ls.viewerPdfPath, { sourceType: "latex" }); if (!sideVisible) { sideVisible = true; pm.sideVisible = true; } }
    },
    typstBuild: async () => {
      if (!activePath) return;
      const typst = await import("@/typst");
      await typst.build(ts, activePath, source, handleSave, () => { consoleOpen = true; }, () => { consoleTab = "log"; }, (name: string) => notifications.setInfo(t("app.savedTo", { name })));
    },
    typstLiveView: async () => {
      if (!activePath) return;
      await pm.openInSide(activePath, { sourceType: "typst" });
      const sideTab = pm.side.tabs.find((t: any) => t.path === activePath && t.sourceType === "typst");
      if (sideTab) { pm.side.setTabSource(sideTab.id, source); _panelVersion++; }
      if (!sideVisible) { sideVisible = true; pm.sideVisible = true; }
    },
    typstViewPdf: async () => {
      if (!activePath) return;
      const typst = await import("@/typst");
      await typst.openViewer(ts, activePath, source, handleSave, () => { consoleOpen = true; }, (pdfPath: string) => {
        pm.openInSide(pdfPath, { sourceType: "typst" });
        if (!sideVisible) { sideVisible = true; pm.sideVisible = true; }
      });
    },
    toggleConsole: handleToggleConsole,
    toggleViewPanel: handleToggleSidebar,
    toggleTitlebar: handleToggleTitlebar,
    openSettings: () => overlays.openSettings("general"),
  }, t),
);
</script>

<div
  class="mdv-app{sidebarOpen.current ? " has-sidebar" : ""}{!titlebarVisible.current ? " has-hidden-titlebar" : ""}"
  style={Object.entries(typographyStyle).map(([k, v]) => `${k}:${v}`).join(";")}
>
  <TitleBar
    rootName={rootPath ? basename(rootPath) : undefined}
  />

  <Breadcrumb
    sidebarOpen={sidebarOpen.current}
    onToggleSidebar={handleToggleSidebar}
    {rootPath}
    {activePath}
    {saveStatus}
    titlebarVisible={titlebarVisible.current}
    onToggleTitlebar={handleToggleTitlebar}
    {vimOn}
    onToggleVim={handleToggleVim}
    typography={typo}
    onTypographyChange={handleTypographyChange}
    onResetTypography={handleResetTypography}
    onToggleFullscreen={toggleFullscreen}
    onOpenSettings={overlays.showSettings}
    {consoleOpen}
    onToggleConsole={handleToggleConsole}
    viewPanelOpen={sideVisible}
    onToggleViewPanel={handleToggleViewPanel}
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
      onNewFile={fo.newFile}
      onNewFolder={fo.newFolder}
      onCloseFolder={handleCloseFolder}
      onSelectFile={fo.selectFile}
      onContextMenu={fo.buildContextMenu}
      editingPath={fo.editingPath}
      onSubmitRename={fo.submitRename}
      onCancelEdit={fo.cancelEdit}
      newEntry={fo.newEntry}
      onSubmitNew={fo.submitNew}
      onCancelNew={fo.cancelNew}
      treeVersion={fo.treeVersion}
      favorites={fo.favorites.current}
      onToggleFavorite={fo.toggleFavorite}
      onReorderFavorites={fo.reorderFavorites}
      onMove={fo.move}
      onOpenProject={handleOpenProjectByPath}
      onProjectFromFolder={handleInitProject}
    />

    <div class="mdv-workspace">
      <div class="mdv-workspace__content">
        <svelte:boundary onerror={(error) => handleViewCrash(error)}>
        <PanelLayout
          panelManager={pm}
          {tabs}
          {activeTabId}
          {sideTabs}
          {sideActiveTabId}
          {sideVisible}
          {splitRatio}
          onSplitRatioChange={(v) => { pm.splitRatio = v; splitRatio = v; }}
          onSourceChange={(next) => {
            pm.main.setSource(next);
            _panelVersion++;
          }}
          onSideSourceChange={(next) => { pm.side.setSource(next); _panelVersion++; }}
          onGutterClick={handleGutterClick}
          onJumpToLine={handleJumpToLine}
          typo={typo}
          {jumpToLine}
          {jumpToCol}
          onJumpApplied={() => { jumpToLine = null; jumpToCol = null; }}
          {vimOn}
          {prosemarkOn}
          forwardToPage={forwardTargetPage}
          onInverseSync={handleInverseSync}
          buildRev={ls.buildRev}
          onSetEditorMode={activePath && (extFromPath(activePath) === "md" || extFromPath(activePath) === "csv" || extFromPath(activePath) === "tsv") ? handleSetEditorMode : undefined}
          onLatexViewer={activePath && extFromPath(activePath) === "tex" ? async () => {
            const { handleLatexBuild } = await import("@/latex");
            if (!ls.viewerPdfPath) await handleLatexBuild(ls, activePath, handleSave, handleSaveAll, () => consoleOpen = true);
            if (ls.viewerPdfPath) { await pm.openInSide(ls.viewerPdfPath, { sourceType: "latex" }); if (!sideVisible) { sideVisible = true; pm.sideVisible = true; } }
          } : undefined}
          onLatexBuild={activePath && extFromPath(activePath) === "tex" ? async () => {
            const { handleLatexBuild } = await import("@/latex");
            await handleLatexBuild(ls, activePath, handleSave, handleSaveAll, () => consoleOpen = true, () => consoleTab = "log");
            if (ls.viewerPdfPath) { await pm.openInSide(ls.viewerPdfPath, { sourceType: "latex" }); sideVisible = true; }
          } : undefined}
          onTypstViewer={activePath && extFromPath(activePath) === "typ" ? async () => {
            await pm.openInSide(activePath, { sourceType: "typst" });
            const sideTab = pm.side.tabs.find((t: any) => t.path === activePath && t.sourceType === "typst");
            if (sideTab) { pm.side.setTabSource(sideTab.id, source); _panelVersion++; }
            if (!sideVisible) { sideVisible = true; pm.sideVisible = true; }
          } : undefined}
          onTypstBuild={activePath && extFromPath(activePath) === "typ" ? async () => {
            const typst = await import("@/typst");
            await typst.build(ts, activePath, source, handleSave, () => { consoleOpen = true; }, () => { consoleTab = "log"; }, (name: string) => notifications.setInfo(t("app.savedTo", { name })));
          } : undefined}
          onTypstViewPdf={activePath && extFromPath(activePath) === "typ" ? async () => {
            const typst = await import("@/typst");
            await typst.openViewer(ts, activePath, source, handleSave, () => { consoleOpen = true; }, (pdfPath: string) => {
              pm.openInSide(pdfPath, { sourceType: "typst" });
              if (!sideVisible) { sideVisible = true; pm.sideVisible = true; }
            });
          } : undefined}
          onExportPdf={activePath && extFromPath(activePath) === "md" ? handleExportPdf : undefined}
          onToggleRenderMode={handleToggleSideRenderMode}
          onToggleFullscreen={toggleFullscreen}
          {viewerFullscreenOn}
          onViewerFullscreen={toggleViewerFullscreen}
        />
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
          logLines={logLines}
          hidden={!consoleOpen}
          onTabChange={(tab) => { consoleTab = tab; }}
          onHeightChange={(h) => { consoleHeight = h; }}
          onClose={() => { consoleOpen = false; }}
          onJumpToLine={handleConsoleJump}
        />
      {/if}
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
    items={fo.contextMenuItems}
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
