<script lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
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
  basename,
  buildCommands,
} from "@/lib";
import type { WritingDisplay, WritingFontSize, WritingLineHeight } from "@/lib";
import Toast, { type ToastAction } from "@/components/overlays/Toast.svelte";
import DropOverlay from "@/components/overlays/DropOverlay.svelte";
import CommandPalette from "@/components/overlays/CommandPalette.svelte";
import HelpOverlay from "@/components/overlays/HelpOverlay.svelte";
import AboutOverlay from "@/components/overlays/AboutOverlay.svelte";
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
import { readMarkdown, writeMarkdown } from "@/lib/files";
import { extFromPath } from "@/lib/editor-languages";
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
let rootPath = $state<string | null>(null);

let copyPulse = $state(false);
let vimOn = $state(false);
let readingMode = $state(false);
let prosemarkOn = $state(true);

let saveStatus = $state<"idle" | "dirty" | "saving" | "saved">("idle");

function findTabByPath(path: string): Tab | undefined {
  return tabs.find(t => t.path === path);
}

function findTabIndex(id: string): number {
  return tabs.findIndex(t => t.id === id);
}

async function openFileInTab(path: string) {
  const existing = findTabByPath(path);
  if (existing) {
    activeTabId = existing.id;
    return;
  }
  const id = crypto.randomUUID();
  const title = basename(path);
  tabs = [...tabs, { id, title, path, source: "", savedContent: "" }];
  activeTabId = id;
  const fileSource = await readMarkdown(path);
  tabs = tabs.map(t => t.id === id ? { ...t, source: fileSource, savedContent: fileSource } : t);
}

function closeTab(id: string) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  tabs = tabs.filter(t => t.id !== id);
  if (activeTabId === id) {
    const next = tabs[Math.min(idx, tabs.length - 1)];
    activeTabId = next?.id ?? null;
  }
}

function handleTabSelect(id: string) {
  activeTabId = id;
}

function handleTabReorder(from: number, to: number) {
  const next = [...tabs];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  tabs = next;
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

let writingDisplay = $derived<WritingDisplay>({
  fontSize: normalizeWritingFontSize(writingFontSize.current),
  lineHeight: normalizeWritingLineHeight(writingLineHeight.current),
});
let writingDisplayStyle = $derived(getWritingDisplayVars(writingDisplay));

$effect(() => {
  document.title = activePath ? basename(activePath) : "untitled";
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
    const isFs = await win.isFullscreen();
    await win.setFullscreen(!isFs);
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
      openFileInTab(path);
    }
  }).then((un) => {
    if (cancelled) { un(); return; }
    unlisten = un;
    void invoke<string[]>("take_pending_open_files")
      .then((paths) => {
        if (cancelled) return;
        const latest = paths[paths.length - 1];
        if (latest) openFileInTab(latest);
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

  const isDroppable = (p: string) => isSupportedTextPath(p) || isImagePath(p);

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

const handleCloseFolder = (path: string) => {
  const next = folders.current.filter((f) => f !== path);
  folders.update(() => next);
  if (rootPath === path) rootPath = next[0] ?? null;
};

const handleSelectFile = (path: string) => {
  openFileInTab(path);
};

const handleContextMenu = (e: MouseEvent, entry: any) => {
  contextMenuItems = [];
  contextMenu.open(e, entry);
};

const handleOpenFile = async () => {
  const { pickAnyFile } = await import("@/lib/files");
  const file = await pickAnyFile();
  if (file) openFileInTab(file);
};

const handleNewFile = async () => {
  newEntry = { parent: rootPath ?? "", kind: "file" };
};

const handleSubmitNew = (_parent: string, _kind: "file" | "folder", _name: string) => {
  newEntry = null;
  treeVersion++;
};

const handleCancelNew = () => {
  newEntry = null;
};

const handleSubmitRename = (_src: string, _newName: string) => {
  editingPath = null;
  treeVersion++;
};

const handleCancelEdit = () => {
  editingPath = null;
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

const handleToggleProsemark = () => {
  prosemarkOn = !prosemarkOn;
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
    onNewFile={handleNewFile}
    onOpenFile={handleOpenFile}
    onOpenFolder={handleAddFolder}
    onCopyMarkdown={handleCopyMarkdown}
    onExportPdf={handleExportPdf}
    {copyPulse}
    titlebarVisible={titlebarVisible.current}
    onToggleTitlebar={handleToggleTitlebar}
    {readingMode}
    onToggleReading={handleToggleReading}
    {vimOn}
    onToggleVim={handleToggleVim}
    {writingDisplay}
    onWritingFontSizeChange={handleWritingFontSizeChange}
    onWritingLineHeightChange={handleWritingLineHeightChange}
    onResetWritingDisplay={handleResetWritingDisplay}
    {prosemarkOn}
    onToggleProsemark={handleToggleProsemark}
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
          {#if prosemarkOn && extFromPath(activePath) === "md"}
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
          <div
            style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:0.5rem;color:var(--muted);font-size:0.9rem"
          >
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

  <WelcomeOverlay
    open={overlays.welcomeOpen}
    onClose={overlays.dismissWelcome}
    onOpenFolder={handleAddFolder}
  />

  <DropOverlay active={dragActive} />
  <TooltipRoot />
</div>
