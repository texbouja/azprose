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
  isMarkdownPath,
  readText,
  getMtime,
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
import AboutOverlay from "@/components/overlays/AboutOverlay.svelte";
import SettingsOverlay from "@/components/overlays/SettingsOverlay.svelte";
import WelcomeOverlay from "@/components/overlays/WelcomeOverlay.svelte";
import ProjectGate from "@/components/overlays/ProjectGate.svelte";
import TitleBar from "@/components/chrome/TitleBar.svelte";
import Breadcrumb from "@/components/chrome/Breadcrumb.svelte";
import StatusBar from "@/components/chrome/StatusBar.svelte";
import SidebarContainer from "@/components/sidebar/sidebar-container.svelte";
import ActivityBar from "@/components/sidebar/activity-bar.svelte";
import { sidebarView } from "@/stores/sidebar-view.svelte";
import ContextMenu from "@/components/files/context-menu.svelte";
import { TooltipRoot } from "@/components/primitives";
import { PanelManager } from "@/lib/panel-manager";
import PanelLayout from "@/components/panels/PanelLayout.svelte";
import { slideSettings } from "@/stores/slide-settings.svelte";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import { logStore } from "@/components/console/log.svelte";
import { executeOxideCommand, notifyMarkdownOxideFileChanged } from "@/lib/lsp/markdown-oxide";
import { writeText } from "@/lib/files";
import { ensureHelpInstalled, helpIndexPath, isHelpPath } from "@/lib/help-install";
// Import STATIQUE (jamais mélangé avec du dynamique) : index-home est déjà
// dans le chunk principal via LinksView → TocPanel → toc-forest — un dynamic
// import ici ne découperait AUCUN chunk (avertissement INEFFECTIVE_DYNAMIC_IMPORT).
import { findLinkedIndexMd } from "@/lib/index-home";
import { writeBackColleKeys } from "@/colles/write-back";
import ColleSendDialog from "@/components/colles/ColleSendDialog.svelte";
import PrintOverlay from "@/components/overlays/PrintOverlay.svelte";
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
import { proseMarkSettings, previewSettings, printSettings, presentationSettings } from "@/stores/markdown-settings.svelte";
import { setRootPath, getRootPath } from "@/stores/root-path.svelte";
import { setActivePath } from "@/stores/active-path.svelte";
import { setScrollTarget } from "@/stores/scroll-target.svelte";
import { setSyncLine } from "@/stores/sync-line.svelte";
import { getCursorLine } from "@/stores/cursor-line.svelte";
import { getCalendarStore } from "@/stores/calendar-store.svelte";
import { journal } from "@/stores/journal-store.svelte";
import { journalSettings } from "@/stores/journal-settings.svelte";
import { ensureDailyNoteWithColles } from "@/colles/daily-note-io";
import { spreadsheetGet, spreadsheetInitDb } from "@/spreadsheet/store";
import { datagridFindBySource, datagridCreateFromSpreadsheet, datagridRename } from "@/datagrid/store";
import { dataBus } from "@/lib/data/bus";
import { runCommand } from "@/lib/data/commands";
import { exportCalendar, importCalendar } from "@/lib/calendar-persistence";
import { navPush, navBack, navForwardStep, navPushForward, setNavActions } from "@/stores/nav-history.svelte";
import { followPreviewNavigation } from "@/lib/preview-follow";
import {
  createLatexState,
  cleanLatexAux, cleanLatexAuxAndOutput, cleanLatexAll,
  handleLatexBuild,
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

// Keep the activePath store in sync (file context for the workspace view
// and file-operations move detection).
$effect(() => { setActivePath(activePath); });

// Matérialise la documentation intégrée dans <racine>/.azprose/help/ (stamp
// de version) — idempotent, jamais bloquant.
$effect(() => {
  const rp = rootPath;
  if (rp) void ensureHelpInstalled(rp);
});

// Wire stores to rootPath and load on vault open.
$effect(() => {
  const rp = rootPath;
  if (rp) {
    getCalendarStore().load(rp);
    // Pre-warm SQLite database so the first spreadsheet open is fast —
    // avoids an intermittent Tauri IPC timeout when with_db() creates
    // the .azprose/data.db for the first time during a user interaction.
    spreadsheetInitDb(rp);
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

// État maximisé d'un panneau — signalé par le PanelManager via splitRatio :
// toggleExpandPanel pose 1 (MAIN plein écran) / 0 (SIDE plein écran) et
// restaure savedSplitRatio. Déduit ici pour le routage des clics sidebar.
let expandedPanel = $derived(
  splitRatio >= 0.99 ? "main" : splitRatio <= 0.01 ? "side" : null,
);

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

// Référence de la TOC sidebar : tab viewer md actif (side), sinon .md actif
// de l'éditeur (main). Source = buffer live du fichier retenu.
// Tab doc (aide intégrée) → la TOC est TOUJOURS celle de la racine index.md,
// quel que soit l'article consulté (décision utilisateur) — source lue sur
// disque (le buffer ne contient que l'article courant).
let tocRefPath = $derived.by(() => {
  _panelVersion;
  if (pm.side.activeTab?.kind === "doc" && rootPath) return helpIndexPath(rootPath);
  if (pm.side.activePath && extFromPath(pm.side.activePath) === "md") return pm.side.activePath;
  if (pm.main.activePath && extFromPath(pm.main.activePath) === "md") return pm.main.activePath;
  return null;
});
let tocRefSource = $derived.by(() => {
  _panelVersion;
  if (pm.side.activeTab?.kind === "doc") return null;
  return tocRefPath === pm.side.activePath ? pm.side.source : pm.main.source;
});

// Mode aide : l'article de la doc intégrée actuellement affiché dans le
// lecteur (tab side kind === "doc", chemin = l'article courant après openDoc).
// Transmis à la TOC sidebar pour la surbrillance de la branche + le dépli par
// défaut de l'article courant (l'arbre de l'aide reflète TOUT le catalogue).
let helpActivePath = $derived.by(() => {
  _panelVersion;
  return pm.side.activeTab?.kind === "doc" ? pm.side.activePath : null;
});

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
  printSettings.current;
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

/** Rafraîchit le tab SIDE preview du fichier (si ouvert) depuis le disque.
    `reloadFile` ne touche que les tabs main — sans ce rafraîchissement, le
    preview side resterait sur l'ancien contenu après un reload externe. */
async function syncSideTabFromDisk(path: string) {
  const norm = (p: string) => p.replace(/\\/g, "/").split("/").filter((s) => s !== ".").join("/");
  const sideTab = pm.side.tabs.find((t: any) => norm(t.path) === norm(path));
  if (!sideTab) return;
  try {
    const fresh = await readText(path);
    pm.side.setTabSource(sideTab.id, fresh);
    _panelVersion++;
  } catch { /* fichier illisible — conserve l'état courant */ }
}

/** « Recharger (ignorer mes modifications) » du dialog de conflit : relecture
    disque dans le tab main + rafraîchissement du tab side preview + re-rendu
    forcé (même contenu identique). */
async function reloadFileFromConflict(path: string) {
  await reloadFile(path);
  await syncSideTabFromDisk(path);
  window.dispatchEvent(new CustomEvent("azprose:preview-force-rerender", { detail: { path } }));
}

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
  // The preview tab navigates AND the linked editor tab follows (the editor
  // mirrors the preview — see followPreviewNavigation). Unsaved edits in the
  // linked tab are parked (policy A) with a discreet notification.
  const navGoBack = () => {
    if (!sideActivePath) return;
    const prev = navBack();
    if (!prev) return;
    navPushForward(sideActivePath);
    sideVisible = true;
    pm.sideVisible = true;
    pm.openInSide(prev, { preview: true, fallbackToActive: true }).catch(() => {});
    void followPreviewNavigation(pm, prev).then(r => {
      if (r.parked) notifications.setInfo(t("preview.draftParked"));
    });
  };
  const navGoForward = () => {
    if (!sideActivePath) return;
    // navForwardStep pushes the current page onto back WITHOUT clearing the
    // remaining forward entries (a plain navPush would break multi-step
    // forward navigation).
    const next = navForwardStep(sideActivePath);
    if (!next) return;
    sideVisible = true;
    pm.sideVisible = true;
    pm.openInSide(next, { preview: true, fallbackToActive: true }).catch(() => {});
    void followPreviewNavigation(pm, next).then(r => {
      if (r.parked) notifications.setInfo(t("preview.draftParked"));
    });
  };
  setNavActions({ goBack: navGoBack, goForward: navGoForward });

  // Unlink the editor↔preview pairing when the preview tab disappears (closed
  // by the user): the link is re-established on the next preview launch. The
  // effect depends on _panelVersion — PanelState is a plain class, not a rune.
  $effect(() => {
    _panelVersion;
    const hasPreviewTab = pm.side.tabs.some(
      t => t.preview || t.renderMode === "preview" || t.renderMode === "presentation" || t.renderMode === "colle",
    );
    if (!hasPreviewTab) pm.previewLinkedTabId = null;
  });

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
  const onJump = (e: Event) => {
    const detail = (e as CustomEvent<{ path?: string; line: number }>).detail;
    handleJumpToLine(detail.line, detail.path ?? null);
  };
  window.addEventListener("azprose:jump-to-line", onJump);
  return () => window.removeEventListener("azprose:jump-to-line", onJump);
});

// Preview home button → HOME dynamique du preview : `findLinkedIndexMd` remonte
// depuis le fichier courant pour trouver l'`index.md` lié (≤ 3 niveaux, borné au
// vault), repli `rootPath/index.md`, sinon no-op silencieux. Clic simple =
// navigation IN-PLACE du tab preview (azprose:wikilink-navigate — l'association
// tab↔fichier est conservée par previewLinkedTabId) ; alt+clic = NOUVEL onglet
// (azprose:wikilink-open-new, même logique que les liens du viewer).
$effect(() => {
  const onHome = async (e: Event) => {
    const newTab = !!(e as CustomEvent<{ newTab?: boolean }>).detail?.newTab;
    const rp = getRootPath();
    const cur = pm.side.activePath ?? activePath;
    if (!rp || !cur) return;
    const target = await findLinkedIndexMd({ rootPath: rp, currentFilePath: cur, readText });
    if (!target) return; // aucun index lié → no-op silencieux
    window.dispatchEvent(new CustomEvent(
      newTab ? "azprose:wikilink-open-new" : "azprose:wikilink-navigate",
      { detail: { path: target } },
    ));
  };
  window.addEventListener("azprose:preview-home", onHome);
  return () => window.removeEventListener("azprose:preview-home", onHome);
});

// Bouton « Recharger » de la toolbar side (preview) — même procédure que le
// save éditeur (méthode officielle VSCode) : changement EXTERNE + buffer non
// sauvegardé → dialog de décision (fileConflict existant, l'utilisateur choisit
// recharger-en-ignorant ou annuler) ; sinon save (si dirty) puis relecture
// disque + re-rendu FORCÉ du preview (même si le contenu est identique —
// transclusion ou réglages changés sur disque). Agit sur le fichier AFFICHÉ
// par le tab side (détail.path), pas forcément le tab main actif.
$effect(() => {
  const onReload = async (e: Event) => {
    const path = (e as CustomEvent<{ path?: string }>).detail?.path;
    if (!path || extFromPath(path) !== "md") return;
    const norm = (p: string) => p.replace(/\\/g, "/").split("/").filter((s) => s !== ".").join("/");
    const normPath = norm(path);
    // pm.main.tabs lu DIRECTEMENT (pas le $derived `tabs`) : le closure du
    // listener ne doit pas capturer une liste de tabs périmée.
    const mainTab = pm.main.tabs.find((t: any) => norm(t.path) === normPath) ?? null;
    const dirty = mainTab != null && mainTab.source !== mainTab.savedContent;

    // 1. Détection de changement externe (mtime de référence suivi au save).
    const oldMtime = mtimeMap.get(path);
    let externalChanged = false;
    if (oldMtime != null) {
      const current = await getMtime(path);
      externalChanged = current != null && current > oldMtime;
    }

    // 2. Conflit : changement externe + edits non sauvegardés → dialog de
    //    décision (le preview n'est pas rechargé — décision en attente).
    if (externalChanged && dirty) {
      fileConflict = path;
      return;
    }

    // 3. Changement externe sans edits locaux → relecture disque dans le tab main.
    if (externalChanged && mainTab) {
      await reloadFile(path);
    } else if (!externalChanged && dirty) {
      // 4. Pas de changement externe mais buffer non sauvegardé → save (même
      //    procédure que handleSave : écriture disque + savedContent + oxide).
      try {
        await writeText(path, mainTab!.source);
        pm.main.tabs = pm.main.tabs.map((t: any) =>
          t.id === mainTab!.id ? { ...t, savedContent: mainTab!.source } : t,
        );
        _panelVersion++;
        clearDraft(path);
        notifyMarkdownOxideFileChanged(path);
        window.dispatchEvent(new CustomEvent("azprose:links-refresh"));
      } catch (err) {
        console.error("azprose: preview-reload save failed", err);
        return;
      }
    }

    // 5. Rafraîchit le tab side preview depuis le disque + re-rendu forcé.
    await syncSideTabFromDisk(path);
    await trackMtime(path);
    window.dispatchEvent(new CustomEvent("azprose:preview-force-rerender", { detail: { path } }));
  };
  window.addEventListener("azprose:preview-reload", onReload);
  return () => window.removeEventListener("azprose:preview-reload", onReload);
});

// ── Documentation intégrée (DocPreview) ─────────────────────────────────────
// Ouvre (ou ré-affecte) le tab doc unique en side panel avec le contenu d'un
// article .azprose/help. Lecture seule : `source` = contenu disque, jamais de
// draft. Après l'ouverture, un saut d'en-tête est délégué au preview via le
// mécanisme scroll-target existant (doc.navigate).
let docArticleOpen = false; // garde : l'effet d'écoute est monté une fois
$effect(() => {
  if (docArticleOpen) return;
  docArticleOpen = true;
  const onDocNavigate = async (e: Event) => {
    const { path, heading } = (e as CustomEvent<{ path: string; heading?: string }>).detail;
    if (!path || !isHelpPath(path, getRootPath())) return;
    await openDocArticle(path, heading);
  };
  window.addEventListener("azprose:doc-navigate", onDocNavigate);
  return () => window.removeEventListener("azprose:doc-navigate", onDocNavigate);
});

async function openDocArticle(path: string, heading?: string): Promise<void> {
  const rp = getRootPath();
  if (!rp || !isHelpPath(path, rp)) return;
  // Le store lit le contenu depuis le disque (.azprose/help, matérialisé par
  // ensureHelpInstalled) — source = savedContent, lecture seule, jamais de draft.
  await pm.openDoc(path, { silent: true });
  // Sauvegardé dans l'historique de navigation comme une vraie page.
  if (sideActivePath) navPush(sideActivePath);
  if (heading) {
    setScrollTarget(heading);
    window.dispatchEvent(new CustomEvent("azprose:preview-jump-line", {
      detail: { path, line: null, heading },
    }));
  }
}

/** Ouvre la racine de la documentation intégrée dans un tab doc (side). */
async function openHelp(): Promise<void> {
  const rp = getRootPath();
  if (!rp) return;
  const index = helpIndexPath(rp);
  const existing = pm.side.tabs.find((t) => t.kind === "doc" && t.path === index);
  if (existing) pm.side.select(existing.id);
  else await openDocArticle(index);
}

$effect(() => {
  const onJumpFile = async (e: Event) => {
    const { path, line, heading } = (e as CustomEvent<{ path: string; line?: number; heading?: string }>).detail;
    if (!path) return;
    // Chemin de la documentation intégrée → navigation dans le DocPreview
    // (jamais dans l'éditeur main : tab doc = lecture seule).
    if (isHelpPath(path, getRootPath())) {
      await openDocArticle(path, heading);
      return;
    }
    // User navigation (TOC / backlinks / tags click): record the current
    // preview page in the back history BEFORE jumping (browser-like). The
    // store dedupes consecutive duplicates (headings within the same file).
    if (sideActivePath) navPush(sideActivePath);
    // Normalize path (same as handleInverseSync)
    const normFile = path.replace(/\\/g, "/").split("/").filter(s => s !== ".").join("/");
    const found = pm.findTabByPath(normFile);
    if (found && found.panel === "main") {
      pm.main.select(found.tab.id);
    } else {
      await pm.openInMain(normFile, { silent: true, preview: true });
    }
    if (line != null || heading != null) {
      // Line contract of azprose:jump-to-file is 1-BASED (TOC i+1, LSP +1).
      // jumpToLine state and data-sline are 0-BASED (editor does line+1).
      const line0 = line != null ? line - 1 : undefined;
      if (line0 != null) {
        jumpToLine = line0;
        handleSetEditorMode("raw");
      }
      // Sync the side preview when it shows this file. Heading-id scroll is
      // immune to transclusion line shifts, so prefer it; the line-based
      // syncLine remains the fallback for jumps without a heading (backlinks,
      // tags, transcluded dbl-click). The pending store covers a preview still
      // rendering; the event covers an already-rendered preview (immediate
      // scroll that clears the pending value).
      if (heading != null) {
        setScrollTarget(heading);
      } else if (line0 != null) {
        setSyncLine(line0, normFile);
      }
      window.dispatchEvent(new CustomEvent("azprose:preview-jump-line", {
        detail: { path: normFile, line: line0, heading },
      }));
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
    const rp = getRootPath();
    if (!rp) return;
    const folder = journalSettings.current.journalFolder;
    // User navigation (journal calendar click): record the current preview
    // page in the back history before opening the daily note.
    if (sideActivePath) navPush(sideActivePath);
    const p = await ensureDailyNoteWithColles(date, rp, folder);
    if (p) {
      await openFileInTab(p);
    }
    // Refresh note scan so the JournalCalendarPanel picks up the new file
    await journal.scanForNotes(rp, folder);
  };
  window.addEventListener("azprose:journal-date-click", handler);
  return () => window.removeEventListener("azprose:journal-date-click", handler);
});

// Commandes du domaine data (canal 3, phase 0bis) — un seul abonnement au
// bus typé remplace les 6 listeners CustomEvent :
//   azprose:spreadsheet-title-change  → command:set-tab-title
//   azprose:spreadsheet-open-new      → command:open-spreadsheet-new
//   azprose:spreadsheet-set-id        → command:set-spreadsheet-id
//   azprose:datafilter-open           → command:open-grid
//   azprose:datafilter-open-stack     → command:open-grid-stack
//   azprose:datagrid-edit-in-spreadsheet → command:open-spreadsheet
// Les sagas vivent dans src/lib/data/commands.ts (pures, DI : navigateur +
// domaine IPC) ; l'hôte fournit les implémentations réelles ici.
$effect(() => {
  const sub = dataBus.subscribeCommands((cmd) => {
    void runCommand(cmd, {
      nav: pm,
      domain: {
        findGridForSpreadsheet: (spreadsheetId) =>
          datagridFindBySource(spreadsheetId),
        createGridForSpreadsheet: (id, name, spreadsheetId) =>
          datagridCreateFromSpreadsheet(id, name, spreadsheetId),
        renameGrid: (id, name) => datagridRename(id, name),
        getSpreadsheet: (id) =>
          spreadsheetGet(id).then((s) => ({ name: s.name })),
      },
    });
  });
  return () => sub.unsubscribe();
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

/**
 * Clic sidebar (FileTree, favoris, recherche, journal, breadcrumb).
 * Clic simple → tab ACTIF du bon panel ; alt+clic → NOUVEAU tab.
 * Routage maximisé : quand le SIDE preview est plein écran, un clic simple
 * sur un .md navigue le preview IN-PLACE (comme un wikilink, via
 * followPreviewNavigation — le tab side reste unique, l'éditeur lié suit
 * via previewLinkedTabId) au lieu d'empiler un onglet éditeur en main.
 * PDF/images passent toujours par le side (même maximisé).
 */
async function handleSidebarFileSelect(path: string, newTab = false) {
  if (!isOpenablePath(path)) {
    notifications.setLoadError({ title: "Format", message: t("app.unsupportedFormat", { name: basename(path) }) });
    return;
  }
  if (isImagePath(path) || isPdfPath(path)) {
    if (newTab) await pm.openInSide(path);
    else await pm.openInSideActiveTab(path);
    sideVisible = true;
    void trackMtime(path);
    return;
  }
  if (newTab) {
    await pm.openInMain(path);
    void trackMtime(path);
    return;
  }
  // Clic simple sur du texte : routage maximisé du preview md — navigation
  // IN-PLACE du tab preview (comme un wikilink), l'éditeur lié suit via
  // followPreviewNavigation (au premier clic, le lien s'établit vers le tab
  // éditeur actif).
  const sideTab = pm.side.activeTab;
  if (
    expandedPanel === "side" &&
    isMarkdownPath(path) &&
    sideTab &&
    isMarkdownPath(sideTab.path) &&
    (sideTab.renderMode === "preview" || sideTab.renderMode === "colle" || sideTab.renderMode === "presentation")
  ) {
    if (sideActivePath) navPush(sideActivePath);
    await pm.openInSide(path, { preview: true, fallbackToActive: true });
    if (!pm.previewLinkedTabId) {
      pm.previewLinkedTabId = pm.main.activeTabId;
    } else {
      const r = await followPreviewNavigation(pm, path);
      if (r.parked) notifications.setInfo(t("preview.draftParked"));
    }
    void trackMtime(path);
    return;
  }
  await pm.openInMainActiveTab(path);
  void trackMtime(path);
}

const fo = new FileOpsManager({
  pm,
  getRootPath: () => rootPath,
  getActivePath: () => activePath,
  onOpenFile: openFileInTab,
  onSidebarFileSelect: handleSidebarFileSelect,
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
    if (extFromPath(activePath) === "md") {
      // Fraîcheur de la vue Links (backlinks + tags) : markdown-oxide
      // reconstruit son index vault sur didChangeWatchedFiles (traitement
      // séquentiel sur le même flux — la requête envoyée ensuite voit l'index
      // à jour), puis les panneaux Backlinks et Tags rechargent via
      // l'événement.
      notifyMarkdownOxideFileChanged(activePath);
      window.dispatchEvent(new CustomEvent("azprose:links-refresh"));
      // La vue Preview (side) suit la position du curseur de l'éditeur après
      // un save. La ligne est 0-based (même convention que data-sline) ; si
      // aucun preview de ce fichier n'est ouvert, aucun écouteur ne réagit.
      const cursorLine = getCursorLine(activePath);
      if (cursorLine != null) {
        window.dispatchEvent(new CustomEvent("azprose:preview-jump-line", {
          detail: { path: activePath, line: cursorLine },
        }));
      }
    }
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
const handleExportPdf = async () => {
  // Phase 3 : ⌘P ouvre le PrintOverlay (configuration) au lieu d'exporter
  // directement — la source LIVE est capturée à l'ouverture. Le mode est
  // réinitialisé à "markdown" (le dernier mode utilisé — planches — ne doit
  // pas survivre à une ouverture ⌘P).
  if (!activePath || extFromPath(activePath) !== "md") return;
  printOverlayPath = activePath;
  printOverlaySource = source;
  printOverlayMode = "markdown";
  printOverlayOpen = true;
};

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
    onShowHelp: openHelp,
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

const handleJumpToLine = (line: number, path?: string | null) => jumpToLineUtil(editorModeCtx, line, path ?? undefined);
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

// État du dialogue d'envoi des rapports de colles (ouvert par azprose:colle-send).
let colleSendOpen = $state(false);
let colleSendPath = $state<string | null>(null);
let colleSendSource = $state<string | null>(null);

// État du PrintOverlay (Phase 3) : l'export md→PDF ET l'impression des
// planches de colles passent par l'overlay de configuration (gabarit, papier,
// marges, colonnes, entêtes/pieds). `mode` distingue les deux rendus.
let printOverlayOpen = $state(false);
let printOverlayMode = $state<"markdown" | "planches">("markdown");
let printOverlayPath = $state<string | null>(null);
let printOverlaySource = $state<string | null>(null);

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
 * Envoi des rapports de colles par email (TabActions → azprose:colle-send).
 * La source est lue LIVE depuis l'onglet (main ou side) au moment du clic :
 * les notes/programme écrits en write-back sont toujours inclus.
 */
$effect(() => {
  const onColleSend = (e: Event) => {
    const detail = (e as CustomEvent).detail as { filePath?: string | null };
    if (!detail.filePath) return;
    const norm = (p: string) => p.split("/").filter((s) => s !== ".").join("/");
    const target = norm(detail.filePath);
    const mainTab = pm.main.tabs.find((t: any) => norm(t.path) === target);
    const sideTab = pm.side.tabs.find((t: any) => norm(t.path) === target);
    const source = mainTab?.source ?? sideTab?.source;
    if (source === undefined) return;
    colleSendPath = detail.filePath;
    colleSendSource = source;
    colleSendOpen = true;
  };
  window.addEventListener("azprose:colle-send", onColleSend);
  return () => window.removeEventListener("azprose:colle-send", onColleSend);
});

// Bascule de la VUE sidebar Links (commande palette open-links). Convention
// VSCode : si la vue est déjà active et la sidebar ouverte, on la ferme ;
// sinon on active la vue et on ouvre la sidebar.
const toggleLinksView = () => {
  if (sidebarView.current === "links" && sidebarOpen.current) {
    handleToggleSidebar();
  } else {
    sidebarView.current = "links";
    if (!sidebarOpen.current) handleToggleSidebar();
  }
};

/**
 * Impression des planches de colles (TabActions → azprose:colle-print).
 * Même pattern que l'envoi : la source est lue LIVE depuis l'onglet (main ou
 * side) au moment du clic, pour inclure les write-backs non sauvegardés.
 * Depuis l'intégration au PrintOverlay (mode « planches »), l'ouverture
 * réutilise le même état d'overlay — mode positionné ici.
 */
$effect(() => {
  const onCollePrint = (e: Event) => {
    const detail = (e as CustomEvent).detail as { filePath?: string | null };
    if (!detail.filePath) return;
    const norm = (p: string) => p.split("/").filter((s) => s !== ".").join("/");
    const target = norm(detail.filePath);
    const mainTab = pm.main.tabs.find((t: any) => norm(t.path) === target);
    const sideTab = pm.side.tabs.find((t: any) => norm(t.path) === target);
    const source = mainTab?.source ?? sideTab?.source;
    if (source === undefined) return;
    printOverlayPath = detail.filePath;
    printOverlaySource = source;
    printOverlayMode = "planches";
    printOverlayOpen = true;
  };
  window.addEventListener("azprose:colle-print", onCollePrint);
  return () => window.removeEventListener("azprose:colle-print", onCollePrint);
});

/**
 * Write-back d'évaluation depuis la vue colles (CollePreview → azprose:colle-eval).
 * Base = source LIVE du tab main (même path) pour ne jamais écraser les edits
 * non-sauvegardés de l'éditeur ; repli = source du tab side (dernier contenu sauvé).
 *
 * Le detail porte soit la forme héritée `{index, keys}` (une écriture), soit la
 * forme `{updates: Array<{index, keys}>}` (propagation volontaire du programme :
 * plusieurs planches écrites dans le MÊME événement). Les write-back sont
 * CHAÎNÉS sur le même `base` (chaque étape prend le résultat de la précédente),
 * puis UNE seule mise à jour des tabs + UNE seule sauvegarde — pas de course
 * entre plusieurs événements successifs.
 */
$effect(() => {
  const onColleEval = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      path?: string | null;
      index?: number;
      keys?: {
        notes?: Record<string, number | string> | null;
        observations?: string | null;
        programme?: string | null;
      };
      updates?: Array<{
        index: number;
        keys: {
          notes?: Record<string, number | string> | null;
          observations?: string | null;
          programme?: string | null;
        };
      }>;
    };
    if (detail.path == null) return;
    const norm = (p: string) => p.split("/").filter((s) => s !== ".").join("/");
    const target = norm(detail.path);
    const mainTab = pm.main.tabs.find((t: any) => norm(t.path) === target);
    const sideTab = pm.side.tabs.find((t: any) => norm(t.path) === target);
    const base = mainTab?.source ?? sideTab?.source;
    if (base === undefined) return;
    const updates = detail.updates ?? [{ index: detail.index!, keys: detail.keys! }];
    let next = base;
    for (const u of updates) {
      const n = writeBackColleKeys(next, u.index, u.keys);
      if (n !== next) next = n;
    }
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
    showWelcome: overlays.showWelcome,
    showAbout: overlays.showAbout,
    openHelp,
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
    oxidNextMonday: () => executeOxideCommand("next monday"),
    oxidNextTuesday: () => executeOxideCommand("next tuesday"),
    oxidNextWednesday: () => executeOxideCommand("next wednesday"),
    oxidNextThursday: () => executeOxideCommand("next thursday"),
    oxidNextFriday: () => executeOxideCommand("next friday"),
    oxidNextSaturday: () => executeOxideCommand("next saturday"),
    oxidNextSunday: () => executeOxideCommand("next sunday"),
    oxidLastMonday: () => executeOxideCommand("last monday"),
    oxidLastTuesday: () => executeOxideCommand("last tuesday"),
    oxidLastWednesday: () => executeOxideCommand("last wednesday"),
    oxidLastThursday: () => executeOxideCommand("last thursday"),
    oxidLastFriday: () => executeOxideCommand("last friday"),
    oxidLastSaturday: () => executeOxideCommand("last saturday"),
    oxidLastSunday: () => executeOxideCommand("last sunday"),
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
      await handleLatexBuild(ls, activePath, handleSave, handleSaveAll, () => consoleOpen = true, () => consoleTab = "log");
      if (ls.viewerPdfPath) { await pm.openInSide(ls.viewerPdfPath, { sourceType: "latex" }); sideVisible = true; }
    },
    latexViewPdf: async () => {
      if (!activePath) return;
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
    openJournalCalendar: () => {
      pm.openCustomInSide("journal-calendar", "Journal");
    },
    openSvarCalendar: () => {
      pm.openCustomInSide("svar-calendar", "Calendar");
    },
    openLinks: toggleLinksView,
    openSpreadsheet: handleOpenSpreadsheet,
    calendarExport: async () => {
      await exportCalendar();
    },
    calendarImport: async () => {
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
  {#if !rootPath && !overlays.welcomeOpen}
    <!-- Dialogue de récupération de projet : aucun projet ouvert (premier
         lancement sans dossier choisi, ou dernier dossier fermé). L'éditeur
         n'est pas utilisable sans projet — rootPath n'est JAMAIS nul en usage
         normal. Un SEUL bouton : le dialogue système de sélection de dossier
         permet d'ouvrir un dossier existant OU d'en créer un nouveau ;
         handleInitProject enregistre le projet (add_project idempotent) puis
         l'ouvre. -->
    <ProjectGate onChooseFolder={handleInitProject} />
  {/if}
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
    onOpenSvarCalendar={() => pm.openCustomInSide("svar-calendar", "Calendar")}
    onOpenSpreadsheet={handleOpenSpreadsheet}
    onOpenDataFilter={handleOpenDataFilter}
    onOpenPalette={() => overlays.setPaletteOpen(true)}
    onSelectFile={handleSidebarFileSelect}
  />

  <main class="mdv-shell">
    <ActivityBar isOpen={sidebarOpen.current} onToggle={handleToggleSidebar} />
    <SidebarContainer
      open={sidebarOpen.current}
      {rootPath}
      folders={folders.current}
      {activePath}
      tocRefPath={tocRefPath}
      tocRefSource={tocRefSource}
      helpActivePath={helpActivePath}
      width={sidebarWidth.current}
      onWidthChange={(next) => sidebarWidth.current = next}
      onAddFolder={handleAddFolder}
      onNewFile={fo.newFile}
      onNewFolder={fo.newFolder}
      onCloseFolder={handleCloseFolder}
      onSelectFile={handleSidebarFileSelect}
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
      onFocusChange={fo.setTreeFocus}
      pendingFocusPath={fo.pendingFocusPath}
      onFocusAcknowledged={fo.acknowledgePendingFocus}
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
            if (!ls.viewerPdfPath) await handleLatexBuild(ls, activePath, handleSave, handleSaveAll, () => consoleOpen = true);
            if (ls.viewerPdfPath) { await pm.openInSide(ls.viewerPdfPath, { sourceType: "latex" }); if (!sideVisible) { sideVisible = true; pm.sideVisible = true; } }
          } : undefined}
          onLatexBuild={activePath && extFromPath(activePath) === "tex" ? async () => {
            await handleLatexBuild(ls, activePath, handleSave, handleSaveAll, () => consoleOpen = true, () => consoleTab = "log");
            if (ls.viewerPdfPath) { await pm.openInSide(ls.viewerPdfPath, { sourceType: "latex" }); sideVisible = true; }
          } : undefined}
          onExportPdf={activePath && extFromPath(activePath) === "md" ? handleExportPdf : undefined}
          onToggleRenderMode={handleToggleSideRenderMode}
          onToggleColles={handleToggleColles}
          onToggleSideColles={handleToggleSideColles}
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
    {buildLabel}
    onHelp={openHelp}
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
    action={{ label: t("app.reloadDiscard"), onClick: () => { const p = fileConflict; fileConflict = null; if (p) void reloadFileFromConflict(p); } }}
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

  <AboutOverlay
    open={overlays.aboutOpen}
    onClose={() => overlays.setAboutOpen(false)}
    onCheckForUpdates={handleManualUpdateCheck}
  />

  <SettingsOverlay
    open={overlays.settingsOpen}
    onClose={() => overlays.setSettingsOpen(false)}
  />

  <ColleSendDialog
    open={colleSendOpen}
    filePath={colleSendPath}
    source={colleSendSource}
    onClose={() => (colleSendOpen = false)}
    onOpenSettings={() => {
      colleSendOpen = false;
      overlays.showSettings();
    }}
  />

  <PrintOverlay
    open={printOverlayOpen}
    mode={printOverlayMode}
    filePath={printOverlayPath}
    source={printOverlaySource}
    onClose={() => (printOverlayOpen = false)}
  />

  <WelcomeOverlay
    open={overlays.welcomeOpen}
    onClose={overlays.dismissWelcome}
    onOpenFolder={handleAddFolder}
  />

  <DropOverlay active={dragActive} />
  <TooltipRoot />
</div>
