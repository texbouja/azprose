<script lang="ts">
import { onMount, tick } from "svelte";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import { confirm } from "@tauri-apps/plugin-dialog";

import { checkForUpdate, applyUpdate } from "@/lib/updater";
import { language, getT } from "@/lib/i18n";
import { overlays } from "@/stores/overlays.svelte";
import { notifications } from "@/stores/notifications.svelte";
import { contextMenu } from "@/stores/context-menu.svelte";
import { persistedState } from "@/stores/persisted.svelte";
import {
  STORAGE_KEYS,
  CHANGELOG_URL,
  getWhatsNewToastMessage,
  isSupportedTextPath,
  isImagePath,
  isPdfPath,
  isOpenablePath,
  basename,
  dirname,
  buildCommands,
  getMtime,
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
import { PanelManager } from "@/lib/panel-manager";
import PanelLayout from "@/components/panels/PanelLayout.svelte";
import Editor from "@/components/editor/Editor.svelte";
import LazyPdfViewer from "@/components/pdf/LazyPdfViewer.svelte";
import ImageViewer from "@/components/image/ImageViewer.svelte";
import { slideSettings } from "@/components/markdown/slide-settings.svelte";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import { logStore } from "@/components/console/log.svelte";
import { readMarkdown, writeMarkdown } from "@/lib/files";
import { extFromPath } from "@/lib/editor-languages";
import { folderRelation } from "@/lib/paths";
import { saveSession, loadSession, saveDraft, loadDraft, clearDraft, setSessionScope, saveLastFile, loadLastFile, saveGuests, loadGuests } from "@/lib/session";
import { loadProjectSession, saveProjectSession, type PortableSession } from "@/lib/project-session";
import { generalSettings } from "@/stores/general-settings.svelte";
import { proseSettings, DEFAULT_PROSE_STYLE } from "@/stores/prose-settings.svelte";
import {
  createLatexState,
  handleLatexBuild, handleLatexViewer, handleLatexCodeView,
  autoBuildIfDepChanged, clearLatexDeps, setupLatexLogListener,
} from "@/components/tex/latex-build";
import {
  createTypstBuildState,
  refreshDiagnostics as refreshTypstDiagnostics,
  handleBuild as handleTypstBuild,
  handleOpenViewer as handleTypstOpenViewer,
} from "@/components/typst/typst-build";
import type { Diagnostic } from "@/lib/diagnostics";
import { FileOpsManager } from "@/lib/file-operations.svelte";
import ConsolePanel from "@/components/console/ConsolePanel.svelte";
import OpencodeSidebar from "@/components/opencode/OpencodeSidebar.svelte";
import { mathJaxPreamble, mathJaxPackages } from "@/stores/mathjax-preamble.svelte";
import { loadProjectConfig, saveProjectConfig } from "@/lib/project-config";
import { theme } from "@/stores/theme.svelte";
import { listCustomThemes, injectThemeCSS } from "@/lib/custom-themes";
import { BUILTIN_THEMES } from "@/lib/theme";
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
let typography = persistedState<TypographySettings>(STORAGE_KEYS.typography, DEFAULT_TYPOGRAPHY);

let dragActive = $state(false);
let whatsNewVersion = $state<string | null>(null);
let updateAvail = $state<{ version: string } | null>(null);
let updateInstalling = $state(false);
let updateUpToDate = $state(false);

let rootPath = $state<string | null>(projectRoot);

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
let typstForwardTarget = $state<{ page: number; x: number; y: number } | null>(null);

let presentationFs = $state(false);
let viewerFullscreenOn = $state(false);
let ls = $state(createLatexState());
let ts = $state(createTypstBuildState());
// Non-reactive: keyed by filePath, stores last SVG + compiled source for instant re-display.
const typstSvgCache: Record<string, { svg: string; compiledSource: string; diagnostics: Diagnostic[] }> = {};
let consoleOpen = $state(false);
let consoleHeight = $state(160);
const consoleDiags = $derived(diagnosticsStore.all);
const logLines = $derived.by(() => {
  const ext = activePath ? extFromPath(activePath) : "";
  if (ext === "typ") return logStore.get("typst");
  if (ext === "tex") return logStore.get("latex");
  return [];
});
let consoleTab = $state<"diagnostics" | "terminal" | "log">("diagnostics");
// Once the console has been opened, keep ConsolePanel mounted (hidden when closed)
// so the Terminal/shell session survives a close — VS Code behavior.
let consoleMounted = $state(false);
$effect(() => { if (consoleOpen) consoleMounted = true; });
let proseWarmupDone = false;

let saveStatus = $state<"idle" | "dirty" | "saving" | "saved">("idle");

let projectConfig = $state<ProjectConfig>({});
let configRoot = $state<string | null>(null);
let configLoaded = $state(false);
// Gate the boot splash removal on the theme being applied (crafted CSS injected +
// themeMode set) so there is no flash and crafted themes render correctly at boot.
let themeBootDone = $state(false);
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
  if (JSON.stringify(typo) !== JSON.stringify(DEFAULT_TYPOGRAPHY)) cfg.typography = typo;
  if (mathJaxPreamble.current) cfg.mathJaxPreamble = mathJaxPreamble.current;
  if (mathJaxPackages.current.length) cfg.mathJaxPackages = mathJaxPackages.current;
  if (vimOn) cfg.vim = true;
  if (theme.mode !== "latte") cfg.themeMode = theme.mode;
  projectConfig = cfg;
  await saveProjectConfig(configRoot, cfg);
}

async function loadConfig(root: string) {
  configRoot = root;
  // Crafted-first (Étape 4): inject this project's crafted CSS before applying its
  // themeMode, so a crafted theme renders correctly (parity with builtins) — no flash,
  // no fallback to :root defaults. Best-effort; builtins don't need it.
  let crafted: { name: string; css: string }[] = [];
  try {
    crafted = await listCustomThemes(root);
    for (const c of crafted) injectThemeCSS(c.name, c.css);
  } catch { /* crafted CSS is best-effort */ }
  const { config: cfg, warnings } = await loadProjectConfig(root);
  projectConfig = cfg;
  if (cfg.proseStyle) proseSettings.patch(cfg.proseStyle);
  if (cfg.slideTheme) slideSettings.theme = cfg.slideTheme;
  if (cfg.slideMode) slideSettings.mode = cfg.slideMode;
  if (cfg.defaultEditorMode != null) generalSettings.defaultEditorMode = cfg.defaultEditorMode;
  if (cfg.typography != null) typography.current = { ...DEFAULT_TYPOGRAPHY, ...cfg.typography };
  if (cfg.mathJaxPreamble != null) mathJaxPreamble.current = cfg.mathJaxPreamble;
  if (cfg.mathJaxPackages != null) mathJaxPackages.current = cfg.mathJaxPackages;
  if (cfg.vim != null) vimOn = cfg.vim;
  if (cfg.themeMode != null) {
    theme.setMode(cfg.themeMode);
  } else {
    // No per-project theme: keep the global default, unless it points at a crafted
    // theme this project doesn't have → fall back to a builtin to avoid a broken :root.
    const m = theme.mode;
    const ok = m === "system"
      || (BUILTIN_THEMES as readonly string[]).includes(m)
      || crafted.some((c) => c.name === m);
    if (!ok) theme.setMode("latte");
  }
  configLoaded = true;
  themeBootDone = true;
  if (warnings.length) {
    notifications.setInfo(t("config.warnings"));
  }
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
  proseSettings.current;
  slideSettings.theme;
  slideSettings.mode;
  generalSettings.defaultEditorMode;
  typography.current;
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
  pm.main.tabs = pm.main.tabs.map((t: any) => t.path === path ? { ...t, source: fresh, savedContent: fresh } : t);
  _panelVersion++;
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
  // Safety net: never trap the splash if config/theme load hangs.
  const splashSafety = setTimeout(() => { themeBootDone = true; }, 2000);

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
        await doSessionMirror();
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

  // — LaTeX build log streaming —
  const unlistenLatex = setupLatexLogListener();

  return () => {
    clearTimeout(splashSafety);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("beforeunload", onBeforeUnload);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibilityVisible);
    window.removeEventListener("beforeunload", onConfigFlush);
    document.removeEventListener("visibilitychange", onConfigVisibility);
    unlistenLatex();
  };
});

function findTabByPath(path: string) {
  return pm.main.tabs.find((t: { path: string }) => t.path === path);
}

function saveSessionNow() {
  const data = pm.toJSON();
  saveSession({
    main: data.main,
    side: { ...data.side, visible: pm.sideVisible },
  });
  scheduleSessionMirror();
}

// Portable session mirror (Étape 2b): debounce a write of the session to
// <project>/.azprose/session.json alongside the scoped localStorage. The mirror is a
// best-effort portable copy; localStorage stays the synchronous primary (anti-loss).
let sessionMirrorTimer: ReturnType<typeof setTimeout> | null = null;

function buildPortableSession(): PortableSession {
  const data = pm.toJSON();
  return {
    main: data.main,
    side: { ...data.side, visible: pm.sideVisible },
    lastFile: data.main.activePath ?? loadLastFile(),
  };
}

async function doSessionMirror() {
  if (!projectRoot) return;
  try {
    await saveProjectSession(projectRoot, buildPortableSession());
  } catch {
    // Portable copy is best-effort; the scoped localStorage already holds the session.
  }
}

function scheduleSessionMirror() {
  if (!projectRoot) return;
  if (sessionMirrorTimer) clearTimeout(sessionMirrorTimer);
  sessionMirrorTimer = setTimeout(() => { void doSessionMirror(); }, 400);
}

function flushSessionMirror() {
  if (sessionMirrorTimer) {
    clearTimeout(sessionMirrorTimer);
    sessionMirrorTimer = null;
  }
  void doSessionMirror();
}

function saveAllDirtyDrafts() {
  pm.saveAllDrafts();
}

// Crash plumbing. A render/effect error caught by the per-view <svelte:boundary>
// (or an async error relayed from main.ts via azprose:crash) flushes drafts and
// surfaces the error in the Diagnostics console instead of killing the UI.
function reportCrash(message: string, err?: unknown) {
  saveAllDirtyDrafts();
  flushSessionMirror();
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
  if (!proseWarmupDone && extFromPath(path) === "md") {
    proseWarmupDone = true;
    void import("@/components/markdown/ProseMarkEditor.svelte");
  }
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

function handleTabSelect(id: string) {
  pm.main.select(id);
}

function handleTabReorder(from: number, to: number) {
  pm.main.reorder(from, to);
}

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
    autoBuildIfDepChanged(ls, activePath, onLatexBuild);
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

$effect(() => {
  if (!activePath || extFromPath(activePath) !== "typ") {
    ls.viewerPdfPath = null;
    // Drop stale Typst diagnostics when leaving a .typ. The console itself is a
    // workspace-level panel (Terminal + Diagnostics) — never auto-closed here, so
    // switching tabs/files or clicking Diagnostics doesn't dismiss it.
    diagnosticsStore.clear("typst");
  } else {
    diagnosticsStore.set("typst", typstSvgCache[activePath]?.diagnostics ?? []);
  }
  if (!activePath || extFromPath(activePath) !== "tex") {
    ls.latexBuilding = false;
    diagnosticsStore.clear("latex");
    clearLatexDeps(ls);
  }
});

// Live diagnostics for the open console outside live-preview mode.
$effect(() => {
  const path = activePath;
  const text = source;
  if (!consoleOpen || !path || extFromPath(path) !== "typ") return;
  // When the live SVG preview is active in the side panel, it handles compilation
  if (pm.findTabByPath(path)?.panel === "side") return;
  const timer = setTimeout(async () => {
    try {
      const res = await invoke<{ pages_svg: string[]; diagnostics: Diagnostic[]; pages: number }>(
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

// Keep side panel preview/presentation tab source in sync with main editor
$effect(() => {
  if (!activePath || extFromPath(activePath) !== "md") return;
  const sideTab = pm.side.tabs.find(t => t.path === activePath && (t.renderMode === "preview" || t.renderMode === "presentation"));
  if (sideTab && sideTab.source !== source) {
    pm.side.tabs = pm.side.tabs.map(t => t.id === sideTab.id ? { ...t, source } : t);
    _panelVersion++;
  }
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
          let session = loadSession();
          if (session.main.tabs.length === 0 && projectRoot) {
            // localStorage vide pour ce projet → récupérer la copie portable
            // .azprose/session.json (projet déplacé/copié, ou nouvelle machine) et
            // réamorcer le localStorage scopé. localStorage reste le primaire ensuite.
            const portable = await loadProjectSession(projectRoot);
            if (portable && portable.main.tabs.length > 0) {
              session = { main: portable.main, side: portable.side };
              saveSession(session);
              if (portable.lastFile) saveLastFile(portable.lastFile);
            }
          }
          if (session.main.tabs.length > 0) {
            for (const tab of session.main.tabs) {
              if (cancelled) break;
              await openFileInTab(tab.path, { preferDraft: true, silent: true, sourceType: tab.sourceType });
            }
            if (!cancelled && session.main.activePath) {
              const active = findTabByPath(session.main.activePath);
              if (active) pm.main.select(active.id);
            }
            // Restore side panel
            if (session.side.visible && session.side.tabs.length > 0) {
              for (const tab of session.side.tabs) {
                if (cancelled) break;
                await pm.openInSide(tab.path, { silent: true, sourceType: tab.sourceType });
              }
              if (!cancelled && session.side.activePath) {
                const sideTab = pm.side.tabs.find(t => t.path === session.side.activePath);
                if (sideTab) pm.side.select(sideTab.id);
              }
              sideVisible = true;
              pm.sideVisible = true;
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
    // getByLabel is async in Tauri v2 — awaiting it is what makes focusing the
    // already-open project window work instead of throwing an unhandled rejection.
    const win = await WebviewWindow.getByLabel(existing);
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
  const folderTabs = pm.main.tabs.filter((t: { path: string }) => t.path.startsWith(path + "/"));
  const dirtyTabs = folderTabs.filter((t: { path: string; source: string; savedContent: string }) => !isPdfPath(t.path) && !isImagePath(t.path) && t.source !== t.savedContent);
  if (dirtyTabs.length > 0) {
    const ok = await confirm(t("tabs.closeUnsavedFolder"), { title: "", kind: "warning" });
    if (!ok) return;
  }
  for (const tab of folderTabs) {
    if (!isPdfPath(tab.path) && !isImagePath(tab.path) && tab.source !== tab.savedContent) {
      saveDraft(tab.path, tab.source);
    }
  }
  for (const tab of folderTabs) {
    pm.main.close(tab.id);
  }
  const next = folders.current.filter((f) => f !== path);
  folders.update(() => next);
  if (rootPath === path) rootPath = next[0] ?? null;
  saveGuests(folders.current.slice(1));
  saveSessionNow();
};

const handleExportPdf = async () => {
  const isLinux = await invoke<boolean>("export_pdf");
  if (!isLinux) return;

  // Lazily import the markdown renderer for printing.
  const { renderMarkdown, ensurePreviewReady } = await import("@/lib/markdown-render");
  await ensurePreviewReady();

  const prevSideVisible = sideVisible;
  const prevSideTabs = [...pm.side.tabs];
  const prevPanelVersion = _panelVersion;

  // Open a preview tab in the side panel so the rendered HTML is in the DOM.
  if (activePath && extFromPath(activePath) === "md") {
    await pm.openInSide(activePath, { preview: true });
    const tab = pm.side.tabs.find(t => t.path === activePath);
    if (tab) pm.side.setRenderMode(tab.id, "preview");
    sideVisible = true;
    pm.sideVisible = true;
    await tick();
    await new Promise<void>((r) => setTimeout(r, 300));
    await tick();
  }

  document.body.classList.add("mdv-print");
  window.print();
  document.body.classList.remove("mdv-print");

  // Restore side panel state.
  pm.side.tabs = prevSideTabs;
  _panelVersion++;
  sideVisible = prevSideVisible;
  pm.sideVisible = prevSideVisible;
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
  sideActivePath && pm.side.activeTab?.renderMode === "presentation" ? "presentation"
  : sideActivePath && pm.side.activeTab?.renderMode === "preview" ? "preview"
  : prosemarkOn ? "prose"
  : "raw"
);

const handleJumpToLine = (line: number) => {
  jumpToLine = line;
  handleSetEditorMode("raw");
};

// Forward sync: user clicks a line number in the editor gutter
const handleGutterClick = (line: number) => {
  if (!activePath) return;
  const ext = extFromPath(activePath);
  if (ext === "tex" && ls.viewerPdfPath) {
    invoke("synctex_forward", { texPath: activePath, pdfPath: ls.viewerPdfPath, line, col: 0 })
      .then((res: any) => {
        if (res?.page) {
          forwardTargetPage = res.page;
          setTimeout(() => { forwardTargetPage = null; }, 0);
        }
      })
      .catch((err: unknown) => notifications.setInfo(`synctex forward failed: ${err}`));
  } else if (ext === "typ") {
    const src = pm.main.source || pm.side.source;
    invoke<any>("typst_forward_line", { filePath: activePath, source: src, line })
      .then((res) => {
        if (res) {
          typstForwardTarget = res;
          setTimeout(() => { typstForwardTarget = null; }, 0);
        }
      })
      .catch((err: unknown) => notifications.setInfo(`typst forward failed: ${err}`));
  }
};

// Inverse synctex: user Ctrl+clicks PDF page → jump editor to source line

const handleInverseSync = async (file: string, line: number) => {
  const normFile = file.replace(/\\/g, "/").split("/").filter(s => s !== ".").join("/");
  const found = pm.findTabByPath(normFile);
  if (found && found.panel === "main") {
    if (found.tab.path !== normFile) found.tab.path = normFile;
    pm.main.select(found.tab.id);
  } else {
    await pm.openInMain(normFile, { silent: true, preview: true, sourceType: "latex" });
  }
  jumpToLine = line - 1;
  handleSetEditorMode("raw");
};

const handleConsoleJump = (line: number, col?: number | null) => {
  sideVisible = false;
  pm.sideVisible = false;
  jumpToLine = line - 1;
  jumpToCol = col != null ? col - 1 : null;
};

const handleSetEditorMode = (mode: EditorMode) => {
  if (presentationFs && mode !== "presentation") {
    presentationFs = false;
    void getCurrentWindow().setFullscreen(false);
  }
  const isMd = activePath && extFromPath(activePath) === "md";
  switch (mode) {
    case "raw":
      prosemarkOn = false;
      break;
    case "prose":
      prosemarkOn = true;
      break;
    case "preview": {
      if (!isMd) return;
      const existing = pm.side.tabs.find(t => t.path === activePath);
      if (existing) {
        pm.side.setRenderMode(existing.id, "preview");
        pm.side.select(existing.id);
        sideVisible = true;
        pm.sideVisible = true;
      } else {
        pm.openInSide(activePath, { preview: true }).catch(() => {});
        const tab = pm.side.tabs.find(t => t.path === activePath);
        if (tab) pm.side.setRenderMode(tab.id, "preview");
        sideVisible = true;
        pm.sideVisible = true;
      }
      break;
    }
    case "presentation": {
      if (!isMd) return;
      prosemarkOn = true;
      const existing = pm.side.tabs.find(t => t.path === activePath);
      if (existing) {
        pm.side.setRenderMode(existing.id, "presentation");
        pm.side.select(existing.id);
        sideVisible = true;
        pm.sideVisible = true;
      } else {
        pm.openInSide(activePath, { preview: true }).catch(() => {});
        const tab = pm.side.tabs.find(t => t.path === activePath);
        if (tab) pm.side.setRenderMode(tab.id, "presentation");
        sideVisible = true;
        pm.sideVisible = true;
      }
      break;
    }
  }
};

const handleToggleSideRenderMode = () => {
  const tab = pm.side.activeTab;
  if (!tab) return;
  const next: "preview" | "presentation" = tab.renderMode === "presentation" ? "preview" : "presentation";
  pm.side.setRenderMode(tab.id, next);
  _panelVersion++;
  if (next === "presentation") presentationFs = false;
};

const handleToggleConsole = () => {
  if (consoleOpen) {
    consoleOpen = false;
    return;
  }
  // Diagnostics only make sense on a .typ or .tex; otherwise open straight to the terminal.
  if (!activePath || (extFromPath(activePath) !== "typ" && extFromPath(activePath) !== "tex")) consoleTab = "terminal";
  consoleOpen = true;
};

const handleToggleViewPanel = () => {
  sideVisible = !sideVisible;
  pm.sideVisible = sideVisible;
};

const onTypstViewer = async () => {
  if (!activePath) return;
  await pm.openInSide(activePath, { sourceType: "typst" });
  // Sync current editor content to the side panel tab immediately
  const found = pm.findTabByPath(activePath);
  if (found && found.panel === "side") {
    pm.side.setTabSource(found.tab.id, source);
  }
  if (!sideVisible) {
    sideVisible = true;
    pm.sideVisible = true;
  }
};

const onTypstBuild = async () => {
  if (!activePath) return;
  await handleTypstBuild(
    ts,
    activePath,
    source,
    handleSave,
    () => { consoleOpen = true; },
    () => { consoleTab = "log"; },
    (name) => notifications.setInfo(t("app.savedTo", { name })),
  );
};

const onTypstViewPdf = async () => {
  if (!activePath) return;
  await handleTypstOpenViewer(
    ts,
    activePath,
    source,
    handleSave,
    () => { consoleOpen = true; },
    (pdfPath) => {
      pm.openInSide(pdfPath, { sourceType: "typst" });
      if (!sideVisible) {
        sideVisible = true;
        pm.sideVisible = true;
      }
    },
  );
};

const onLatexBuild = async () => {
  await handleLatexBuild(ls, activePath, handleSave, handleSaveAll, () => consoleOpen = true, () => consoleTab = "log");
  if (ls.viewerPdfPath) {
    await pm.openInSide(ls.viewerPdfPath, { sourceType: "latex" });
    sideVisible = true;
  }
};
const onLatexViewer = async () => {
  if (!ls.viewerPdfPath) {
    await handleLatexBuild(ls, activePath, handleSave, handleSaveAll, () => consoleOpen = true);
  }
  if (ls.viewerPdfPath) {
    await pm.openInSide(ls.viewerPdfPath, { sourceType: "latex" });
    if (!sideVisible) {
      sideVisible = true;
      pm.sideVisible = true;
    }
  }
};
const onLatexCodeView = () => {
  sideVisible = false;
  pm.sideVisible = false;
  ls.viewerPdfPath = null;
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
    openFile: fo.openFile,
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
  }, t),
);
</script>

<div
  class="mdv-app{sidebarOpen.current ? " has-sidebar" : ""}{!titlebarVisible.current ? " has-hidden-titlebar" : ""}"
  style={typographyStyle}
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
            if (activePath && extFromPath(activePath) === "typ") {
              const found = pm.findTabByPath(activePath);
              if (found && found.panel === "side") {
                pm.side.setTabSource(found.tab.id, next);
              }
            }
            _panelVersion++;
          }}
          onSideSourceChange={(next) => { pm.side.setSource(next); _panelVersion++; }}
          onGutterClick={handleGutterClick}
          typo={typo}
          {jumpToLine}
          {jumpToCol}
          onJumpApplied={() => { jumpToLine = null; jumpToCol = null; }}
          {vimOn}
          {prosemarkOn}
          forwardToPage={forwardTargetPage}
          typstForwardTarget={typstForwardTarget}
          onInverseSync={handleInverseSync}
          buildRev={ls.buildRev}
          onSetEditorMode={activePath && extFromPath(activePath) === "md" ? handleSetEditorMode : undefined}
          onLatexViewer={activePath && extFromPath(activePath) === "tex" ? onLatexViewer : undefined}
          onLatexBuild={activePath && extFromPath(activePath) === "tex" ? onLatexBuild : undefined}
          onTypstViewer={activePath && extFromPath(activePath) === "typ" ? onTypstViewer : undefined}
          onTypstBuild={activePath && extFromPath(activePath) === "typ" ? onTypstBuild : undefined}
          onTypstViewPdf={activePath && extFromPath(activePath) === "typ" ? onTypstViewPdf : undefined}
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
