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
import SidebarContainer from "@/components/sidebar/sidebar-container.svelte";
import ActivityBar from "@/components/sidebar/activity-bar.svelte";
import ContextMenu from "@/components/files/context-menu.svelte";
import { TooltipRoot } from "@/components/primitives";
import { PanelManager } from "@/lib/panel-manager";
import PanelLayout from "@/components/panels/PanelLayout.svelte";
import { slideSettings } from "@/stores/slide-settings.svelte";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import { logStore } from "@/components/console/log.svelte";
import { executeOxideCommand } from "@/lib/lsp/markdown-oxide";
import { writeText } from "@/lib/files";
import { writeBackColleKeys } from "@/colles/write-back";
import { extFromPath } from "@/lib/editor-languages";
import { setOpenSheetIds } from "@/spreadsheet/open-tabs.svelte";
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
import { generalSettings, applyFontHinting } from "@/stores/general-settings.svelte";
import { proseMarkSettings, previewSettings, presentationSettings } from "@/stores/markdown-settings.svelte";
import { setRootPath, getRootPath } from "@/stores/root-path.svelte";
import { setActivePath } from "@/stores/active-path.svelte";
import { setScrollTarget } from "@/stores/scroll-target.svelte";
import { setSyncLine } from "@/stores/sync-line.svelte";
import { getCalendarStore } from "@/stores/calendar-store.svelte";
import { navPush, navBack, navForward, navPushForward, setNavActions } from "@/stores/nav-history.svelte";
import {
  createLatexState,
  cleanLatexAux, cleanLatexAuxAndOutput, cleanLatexAll,
} from "@/latex";
import { FileOpsManager } from "@/lib/file-operations.svelte";
import ConsolePanel from "@/components/console/ConsolePanel.svelte";
import { mathJaxPreamble, mathJaxPackages } from "@/stores/mathjax-preamble.svelte";
import { latexSettings } from "@/stores/latex-settings.svelte";
import { theme } from "@/stores/theme.svelte";
import { editorSettings } from "@/stores/editor-settings.svelte";
import { collesSettings } from "@/stores/colles-settings.svelte";
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

// Keep the activePath store in sync for opencode panel (file context).
$effect(() => { setActivePath(activePath); });

// Wire stores to rootPath and load on vault open.
$effect(() => {
  const rp = rootPath;
  if (rp) {
    getCalendarStore().load(rp);
    // Pre-warm SQLite database so the first spreadsheet open is fast —
    // avoids an intermittent Tauri IPC timeout when with_db() creates
    // the .azprose/data.db for the first time during a user interaction.
    import("@/spreadsheet/store").then(({ spreadsheetInitDb }) => {
      spreadsheetInitDb(rp);
    });
  }
});

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
    // Keep the open-sheet-IDs store in sync for SpreadsheetManager
    const allOpen: string[] = [];
    for (const t of pm.main.tabs) if (t.kind === "spreadsheet" && t.spreadsheetId) allOpen.push(t.spreadsheetId);
    for (const t of pm.side.tabs) if (t.kind === "spreadsheet" && t.spreadsheetId) allOpen.push(t.spreadsheetId);
    setOpenSheetIds(allOpen);
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
  } else if (sideTabs.length > 0 && !sideVisible) {
    // Spreadsheet, Calendar, and other side tabs are opened via
    // PanelManager methods that set pm.side.visible = true, but the
    // local $state copy (sideVisible) does not reactively update.
    // This effect syncs it when _panelVersion increments.
    sideVisible = true;
    pm.sideVisible = true;
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
let consoleOpen = $state(false);
let consoleHeight = $state(160);

const buildLabel = $derived(
  ls.latexBuilding ? "LaTeX…" :
  null
);

// POC: LSP frontend test — starts language server on mount, logs diagnostics to console
const consoleDiags = $derived(diagnosticsStore.all);
const logLines = $derived.by(() => {
  const ext = activePath ? extFromPath(activePath) : "";
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
  editorSettings.current;
  collesSettings.current;
  scheduleConfigSync();
});

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
  const onVisibility = () => { if (document.visibilityState === "hidden") { saveAllDirtyDrafts(); flushSessionMirror(); } };
  const onBeforeUnload = () => { saveAllDirtyDrafts(); flushSessionMirror(); };
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

  // ── File-type handlers (latex, markdown) — lazy-loaded ──
  const handlerCtx: HandlerContext = {
    activePath:     () => activePath,
    source:         () => source,
    savedContent:   () => savedContent,
    consoleOpen:    () => consoleOpen,
    rootPath:       () => rootPath,
    sideActivePath: () => sideActivePath,
    setConsoleOpen: (v) => { consoleOpen = v; },
    setConsoleTab:  (tab) => { consoleTab = tab; },
    setSideVisible: (v) => { sideVisible = v; pm.sideVisible = v; },
    setScrollTarget: (target) => { setScrollTarget(target); },
    setSyncLine:    (line) => { setSyncLine(line); },
    navPush:        (path) => { navPush(path); },
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

// Journal date click → create or open daily note (wired from JournalCalendarPanel)
$effect(() => {
  const handler = async (e: Event) => {
    const { date } = (e as CustomEvent<{ date: string }>).detail;
    if (!date) return;
    const { journal } = await import("@/stores/journal-store.svelte");
    const rp = getRootPath();
    if (!rp) return;
    const { journalSettings } = await import("@/stores/journal-settings.svelte");
    const folder = journalSettings.current.journalFolder;
    const p = await journal.createNote(date, rp, folder);
    if (p) {
      await openFileInTab(p);
    }
    // Refresh note scan so the JournalCalendarPanel picks up the new file
    await journal.scanForNotes(rp, folder);
  };
  window.addEventListener("azprose:journal-date-click", handler);
  return () => window.removeEventListener("azprose:journal-date-click", handler);
});

// Spreadsheet title change → update the tab title
$effect(() => {
  const handler = (e: Event) => {
    const { spreadsheetId, title } = (e as CustomEvent<{ spreadsheetId: string; title: string }>).detail;
    pm.setSpreadsheetTabTitle(spreadsheetId, title);
  };
  window.addEventListener("azprose:spreadsheet-title-change", handler);
  return () => window.removeEventListener("azprose:spreadsheet-title-change", handler);
});

// Spreadsheet "open in new tab" from the manager
$effect(() => {
  const handler = async (e: Event) => {
    const { id } = (e as CustomEvent<{ id: string }>).detail;
    // If already open in any panel, just activate it — no duplicate editors
    const existing = pm.findSpreadsheetTab(id);
    if (existing) {
      const panel = existing.panel === "main" ? pm.main : pm.side;
      panel.select(existing.tab.id);
      if (existing.panel === "side") {
        sideVisible = true;
        pm.sideVisible = true;
        pm.layout = "main+side";
      }
      return;
    }
    try {
      const { spreadsheetGet } = await import("@/spreadsheet/store");
      const data = await spreadsheetGet(id);
      pm.openSpreadsheetInSide(id, data.name);
    } catch (err) {
      console.error("[spreadsheet] failed to open in new tab:", err);
    }
  };
  window.addEventListener("azprose:spreadsheet-open-new", handler);
  return () => window.removeEventListener("azprose:spreadsheet-open-new", handler);
});

// Spreadsheet "set-id" — upgrade a create-mode tab with a real spreadsheetId
$effect(() => {
  const handler = (e: Event) => {
    const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail;
    pm.setSpreadsheetTabId(id, title);
  };
  window.addEventListener("azprose:spreadsheet-set-id", handler);
  return () => window.removeEventListener("azprose:spreadsheet-set-id", handler);
});

// Spreadsheet "open in DataFilter" (toolbar) — find the linked grid, or
// create one from the spreadsheet snapshot, then open DataFilter in the side
// panel with this table loaded (the user can add more tables from there).
$effect(() => {
  const handler = async (e: Event) => {
    const { spreadsheetId, name } = (e as CustomEvent<{ spreadsheetId: string; name: string }>).detail;
    try {
      const { datagridFindBySource, datagridCreateFromSpreadsheet } = await import("@/datagrid/store");
      let gridId: string | null = null;
      const meta = await datagridFindBySource(spreadsheetId);
      if (meta) {
        gridId = meta.id;
      } else {
        gridId = await datagridCreateFromSpreadsheet(
          `dg-${spreadsheetId}`,
          name || "Tableau",
          spreadsheetId,
        );
      }
      pm.openDataFilterInSide([gridId], name || "Filtre de données");
    } catch (err) {
      console.error("[spreadsheet] failed to open data filter:", err);
    }
  };
  window.addEventListener("azprose:datafilter-open", handler);
  return () => window.removeEventListener("azprose:datafilter-open", handler);
});

// DataFilter "open stack" — same as above, but opens ALL the spreadsheets of a
// set as a single stack (the DataFilter stack view). Used by the colloscope
// import: students + per-class tables are stacked together, one grid per table,
// sharing the unified stack filter. A linked grid is created on first use.
$effect(() => {
  const handler = async (e: Event) => {
    const { spreadsheetIds, name } = (e as CustomEvent<{ spreadsheetIds: string[]; name?: string }>).detail;
    if (!spreadsheetIds?.length) return;
    try {
      const { datagridFindBySource, datagridCreateFromSpreadsheet, datagridRename } = await import("@/datagrid/store");
      const { spreadsheetGet } = await import("@/spreadsheet/store");
      const gridIds: string[] = [];
      for (const spreadsheetId of spreadsheetIds) {
        // Le grid porte le nom de SON tableau source (jamais le nom de la pile
        // — un grid créé avec le nom de pile afficherait « Colloscope —
        // Colloscope » sur toutes les cartes). On lit le nom live depuis la db
        // pour rester aligné même après un rename du tableur.
        const sheet = await spreadsheetGet(spreadsheetId).catch(() => null);
        const sheetName = sheet?.name || name || "Tableau";
        const meta = await datagridFindBySource(spreadsheetId);
        if (meta) {
          // Réparer les grids créés avant ce fix (nom de pile au lieu du nom
          // du tableau) : `datagridRename` n'a aucun appelant UI, pas de
          // rename manuel à préserver.
          if (meta.name !== sheetName) {
            await datagridRename(meta.id, sheetName);
          }
          gridIds.push(meta.id);
        } else {
          const gridId = await datagridCreateFromSpreadsheet(
            `dg-${spreadsheetId}`,
            sheetName,
            spreadsheetId,
          );
          gridIds.push(gridId);
        }
      }
      pm.openDataFilterInSide(gridIds, name || "Filtre de données");
    } catch (err) {
      console.error("[spreadsheet] failed to open data filter stack:", err);
    }
  };
  window.addEventListener("azprose:datafilter-open-stack", handler);
  return () => window.removeEventListener("azprose:datafilter-open-stack", handler);
});

// DataFilter « Edit dans Spreadsheet » — ouvre le tableur source dans le
// SIDE panel : le panneau principal est réservé EXCLUSIVEMENT à CodeMirror
// (l'éditeur), toute vue d'outil (tableur, DataFilter, calendrier, …) s'ouvre
// en side. La source de vérité des données reste `spreadsheet_cells` ; le
// tableur et la vue datagrid la lisent live (pas de mirror à resynchroniser).
$effect(() => {
  const handler = (e: Event) => {
    const { spreadsheetId, name } = (e as CustomEvent<{ spreadsheetId: string; name: string }>).detail;
    if (!spreadsheetId) return;
    pm.openSpreadsheetInSide(spreadsheetId, name || "Tableur");
  };
  window.addEventListener("azprose:datagrid-edit-in-spreadsheet", handler);
  return () => window.removeEventListener("azprose:datagrid-edit-in-spreadsheet", handler);
});

async function openFileInTab(path: string, opts?: { preferDraft?: boolean; silent?: boolean; preview?: boolean; sourceType?: "latex" }) {
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
  onTreeChange: (paths: string[]) => { fo.treeDirtyPaths = paths; fo.treeVersion++; },
  onPanelChange: () => { _panelVersion++; },
  getT: () => t,
});

// ── Filesystem watcher: bump treeVersion on external changes ──
$effect(() => {
  return setupFsWatcher(rootPath, {
    bumpTreeVersion: (paths: string[]) => { fo.treeDirtyPaths = paths; fo.treeVersion++; },
  });
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
        await writeText(tab.path, tab.source);
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

// Side panel source sync → handled by markdown handler

// Forward sync: editor cursor → preview → handled by handlers

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

const handleOpenSpreadsheet = () => {
  pm.openEmptySpreadsheetPanel();
};

/**
 * Breadcrumb « Filtre de données » — open the DataFilter view in the SIDE
 * panel. It always opens on the HOME page (empty stack), the exact
 * counterpart of the spreadsheet button: the multi-open dialog gives access
 * to ALL tables in the db (spreadsheets + linked datagrid views).
 * NOTE: opens in the SIDE panel — the main panel is reserved exclusively for
 * the CodeMirror editor.
 */
const handleOpenDataFilter = async () => {
  pm.openDataFilterInSide([], t("breadcrumb.dataFilter"));
};

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

// Apply native decorations setting at startup and when toggled
$effect(() => {
  const native = generalSettings.nativeDecorations;
  getCurrentWindow().setDecorations(native).catch(() => {});
});

// Apply UI zoom override
$effect(() => {
  const scale = generalSettings.uiScale;
  const appEl = document.querySelector(".mdv-app") as HTMLElement | null;
  if (!appEl) return;
  if (scale === 1.0) appEl.style.removeProperty("zoom");
  else appEl.style.setProperty("zoom", String(scale));
});

// Apply font hinting override
$effect(() => {
  const h = generalSettings.fontHinting;
  applyFontHinting(h);
});

const handleToggleVim = () => {
  vimOn = !vimOn;
};

const handleToggleTitlebar = () => {
  titlebarVisible.update((v: boolean) => !v);
};

const editorMode = $derived<EditorMode>(
  sideActivePath && pm.side.activeTab?.renderMode === "colle" ? "colle"
  : sideActivePath && pm.side.activeTab?.renderMode === "presentation" ? "presentation"
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
const handleSetEditorMode = (mode: EditorMode) => { setEditorModeUtil(editorModeCtx, mode); _panelVersion++; };
const handleToggleSideRenderMode = () => toggleSideRenderModeUtil(editorModeCtx);
const normPath = (p: string) => p.replace(/\\/g, "/").split("/").filter((s) => s !== ".").join("/");

// Toolbar MAIN « Colles » (daily notes) : bascule la vue planches du fichier
// main actif — ouvre l'onglet side en "colle", revient à "preview" si déjà en colle.
const handleToggleColles = () => {
  if (!activePath) return;
  const target = normPath(activePath);
  const sideTab = pm.side.tabs.find((t: any) => normPath(t.path) === target);
  if (sideTab?.renderMode === "colle") {
    pm.side.setRenderMode(sideTab.id, "preview");
    _panelVersion++;
  } else {
    handleSetEditorMode("colle");
  }
};

// Toolbar SIDE « Colles » : bascule colle ↔ preview pour le fichier side actif.
const handleToggleSideColles = () => {
  const tab = pm.side.activeTab;
  if (!tab) return;
  const next = tab.renderMode === "colle" ? "preview" : "colle";
  pm.side.setRenderMode(tab.id, next);
  _panelVersion++;
};

// État pressé du bouton main : la vue colles du fichier main actif est ouverte.
// (lit _panelVersion : les champs de PanelState ne sont pas $state, la
// réactivité passe par le bump manuel — cf. activePath/tabs plus haut)
const collesOn = $derived.by(() => {
  _panelVersion;
  if (!activePath) return false;
  const target = normPath(activePath);
  return pm.side.tabs.find((t: any) => normPath(t.path) === target)?.renderMode === "colle";
});

const handleToggleConsole = () => {
  if (consoleOpen) {
    consoleOpen = false;
    return;
  }
  // Diagnostics only make sense on .tex or .md; otherwise open straight to the terminal.
  if (!activePath || (extFromPath(activePath) !== "tex" && extFromPath(activePath) !== "md")) consoleTab = "terminal";
  consoleOpen = true;
};

/**
 * Write-back d'évaluation depuis la vue colles (CollePreview → azprose:colle-eval).
 * Base = source LIVE du tab main (même path) pour ne jamais écraser les edits
 * non-sauvegardés de l'éditeur ; repli = source du tab side (dernier contenu sauvé).
 * 1) tab main mis à jour (→ dirty, sauvegarde standard, undo/redo éditeur préservés)
 * 2) tab side mis à jour (→ l'affichage des cartes reflète la note)
 * 3) sauvegarde immédiate : handleSave si le fichier est l'onglet main actif,
 *    sinon écriture directe sur disque.
 */
$effect(() => {
  const onColleEval = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      path?: string | null;
      index: number;
      keys: { notes?: Record<string, number | string> | null; observations?: string | null };
    };
    if (detail.path == null) return;
    const norm = (p: string) => p.split("/").filter((s) => s !== ".").join("/");
    const target = norm(detail.path);
    const mainTab = pm.main.tabs.find((t: any) => norm(t.path) === target);
    const sideTab = pm.side.tabs.find((t: any) => norm(t.path) === target);
    const base = mainTab?.source ?? sideTab?.source;
    if (base === undefined) return;
    const next = writeBackColleKeys(base, detail.index, detail.keys);
    if (next === base) return;
    if (mainTab) {
      pm.main.setTabSource(mainTab.id, next);
    }
    if (sideTab) {
      pm.side.setTabSource(sideTab.id, next);
    }
    _panelVersion++;
    if (mainTab && norm(pm.main.activePath ?? "") === target) {
      // L'effet dirty (source !== savedContent) s'exécute après le flush Svelte :
      // on pose l'état explicitement pour que handleSave() parte immédiatement.
      saveStatus = "dirty";
      void handleSave();
    } else {
      void writeText(detail.path, next).catch((err: unknown) => console.error("azprose: colle write-back direct failed", err));
    }
  };
  window.addEventListener("azprose:colle-eval", onColleEval);
  return () => window.removeEventListener("azprose:colle-eval", onColleEval);
});

const handleToggleViewPanel = () => {
  if (!sideVisible && sideTabs.length > 0) {
    sideVisible = true;
    pm.sideVisible = true;
  } else {
    splitRatio = pm.toggleExpandPanel("main");
  }
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
    isLatexActive: activePath != null && extFromPath(activePath) === "tex",
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
    startColles: () => handleSetEditorMode("colle"),
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
    toggleConsole: handleToggleConsole,
    toggleViewPanel: handleToggleSidebar,
    toggleTitlebar: handleToggleTitlebar,
    openSettings: () => overlays.openSettings("general"),
    openCalendarEditor: () => {
      pm.openCustomInSide("calendar-editor", "Calendrier");
    },
    showOpenCode: () => {
      pm.openCustomInSide("opencode", "OpenCode");
    },
    openJournalCalendar: () => {
      pm.openCustomInSide("journal-calendar", "Journal");
    },
    openSvarCalendar: () => {
      pm.openCustomInSide("svar-calendar", "Calendar");
    },
    openSpreadsheet: handleOpenSpreadsheet,
    calendarExport: async () => {
      const { exportCalendar } = await import("@/lib/calendar-persistence");
      await exportCalendar();
    },
    calendarImport: async () => {
      const { importCalendar } = await import("@/lib/calendar-persistence");
      await importCalendar();
    },
    clearCalendarCache: async () => {
      if (!await confirm(t("command.clearCalendarCacheConfirm"), { kind: "warning" })) return;
      getCalendarStore().clearAll();
      notifications.setInfo(t("command.clearCalendarCacheDone"));
    },
  }, t),
);
</script>

<div
  class="mdv-app{sidebarOpen.current ? " has-sidebar" : ""}{!titlebarVisible.current ? " has-hidden-titlebar" : ""}"
  style={Object.entries(typographyStyle).map(([k, v]) => `${k}:${v}`).join(";")}
>
  <TitleBar
    rootName={rootPath ? basename(rootPath) : undefined}
    nativeDecorations={generalSettings.nativeDecorations}
  />

  <Breadcrumb
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
    onOpenCode={() => pm.openCustomInSide("opencode", "OpenCode")}
    onOpenSvarCalendar={() => pm.openCustomInSide("svar-calendar", "Calendar")}
    onOpenSpreadsheet={handleOpenSpreadsheet}
    onOpenDataFilter={handleOpenDataFilter}
    onOpenPalette={() => overlays.setPaletteOpen(true)}
    onSelectFile={fo.selectFile}
  />

  <main class="mdv-shell">
    <ActivityBar isOpen={sidebarOpen.current} onToggle={handleToggleSidebar} />
    <SidebarContainer
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
      onRenameRequest={(path) => (fo.editingPath = path)}
      onSubmitRename={fo.submitRename}
      onCancelEdit={fo.cancelEdit}
      onDeleteEntry={fo.delete}
      newEntry={fo.newEntry}
      onSubmitNew={fo.submitNew}
      onCancelNew={fo.cancelNew}
      treeVersion={fo.treeVersion}
      dirtyPaths={fo.treeDirtyPaths}
      favorites={fo.favorites.current}
      onToggleFavorite={fo.toggleFavorite}
      onReorderFavorites={fo.reorderFavorites}
      onMove={fo.move}
      onOpenProject={handleOpenProjectByPath}
      onProjectFromFolder={handleInitProject}
      onOpenCalendar={() => pm.openCustomInSide("svar-calendar", "Calendar")}
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
          onTabDoubleClick={(id) => {
            const panelId = pm.main.tabs.some(t => t.id === id) ? "main" : "side";
            splitRatio = pm.toggleExpandPanel(panelId);
          }}
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
          onExportPdf={activePath && extFromPath(activePath) === "md" ? handleExportPdf : undefined}
          onToggleRenderMode={handleToggleSideRenderMode}
          onToggleColles={handleToggleColles}
          onToggleSideColles={handleToggleSideColles}
          collesOn={collesOn}
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
    {buildLabel}
  />

  <ContextMenu
    open={contextMenu.target !== null}
    x={contextMenu.target?.x ?? 0}
    y={contextMenu.target?.y ?? 0}
    items={contextMenu.items}
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
    open={notifications.infoToast != null && notifications.loadError == null}
    message={notifications.infoToast ?? ""}
    variant="info"
    onDismiss={notifications.dismissInfoToast}
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
