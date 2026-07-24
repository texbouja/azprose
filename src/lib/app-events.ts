import { listen } from "@tauri-apps/api/event"
import { watch } from "@tauri-apps/plugin-fs"
import { readText } from "@/lib/files"
import { isSupportedTextPath, isImagePath, isPdfPath, getMtime } from "@/lib"
import type { PanelManager } from "@/lib/panel-manager"

export interface ExternalChangeState {
  mtimeMap: Map<string, number>
  fileConflict: string | null
  externalChangeAlerts: boolean
}

export interface ExternalChangeDeps {
  pm: PanelManager
  tabs: { path: string; source: string; savedContent: string }[]
  bumpPanelVersion: () => void
  setFileConflict: (path: string | null) => void
  setExternalChangeAlerts: (v: boolean) => void
  notify: { setInfo: (msg: string) => void }
  t: (key: string, params?: Record<string, string>) => string
}

export function trackMtime(state: ExternalChangeState, path: string) {
  return getMtime(path).then((mtime) => {
    if (mtime != null) state.mtimeMap.set(path, mtime);
  });
}

export async function reloadFile(
  state: ExternalChangeState,
  deps: ExternalChangeDeps,
  path: string,
) {
  const fresh = await readText(path);
  deps.pm.main.tabs = deps.pm.main.tabs.map((t: any) =>
    t.path === path ? { ...t, source: fresh, savedContent: fresh } : t,
  );
  deps.bumpPanelVersion();
  await trackMtime(state, path);
}

export async function checkExternalChanges(
  state: ExternalChangeState,
  deps: ExternalChangeDeps,
) {
  for (const tab of deps.tabs) {
    if (isPdfPath(tab.path) || isImagePath(tab.path)) continue;
    const oldMtime = state.mtimeMap.get(tab.path);
    if (oldMtime == null) { await trackMtime(state, tab.path); continue; }
    const current = await getMtime(tab.path);
    if (current == null) continue;
    if (current > oldMtime) {
      if (tab.source === tab.savedContent || !state.externalChangeAlerts) {
        await reloadFile(state, deps, tab.path);
        if (state.externalChangeAlerts) {
          deps.notify.setInfo(deps.t("app.fileReloaded"));
        }
      } else {
        deps.setFileConflict(tab.path);
      }
    }
  }
}

export function setupExternalChangeAlerts(
  set: (v: boolean) => void,
): () => void {
  let cancelled = false;
  let unlisten: (() => void) | undefined;
  listen<string>("azprose:set-alerts", (e) => {
    if (cancelled) return;
    set(e.payload === "on");
  }).then((un) => { if (cancelled) un(); else unlisten = un; });
  return () => { cancelled = true; unlisten?.(); };
}

export interface DragDropDeps {
  openFileInTab: (path: string) => Promise<void>
  setDragActive: (v: boolean) => void
  notify: { setLoadError: (err: { title: string; message: string }) => void }
  t: (key: string, params?: Record<string, string>) => string
}

export function setupDragDrop(deps: DragDropDeps): () => void {
  type DragPayload = { paths: string[] };
  let cancelled = false;
  const unlisteners: (() => void)[] = [];

  const isDroppable = (p: string) => isSupportedTextPath(p) || isImagePath(p) || isPdfPath(p);

  listen<DragPayload>("tauri://drag-enter", (event) => {
    if (cancelled) return;
    deps.setDragActive(event.payload.paths?.some(isDroppable) ?? false);
  }).then((ul) => { if (!cancelled) unlisteners.push(ul); });

  listen<DragPayload>("tauri://drag-drop", (event) => {
    if (cancelled) return;
    deps.setDragActive(false);
    const paths = event.payload.paths ?? [];
    const first = paths.find(isDroppable);
    if (first) {
      deps.openFileInTab(first);
    } else if (paths.length > 0) {
      deps.notify.setLoadError({
        title: "Drop error",
        message: deps.t("app.dropMarkdownOnly"),
      });
    }
  }).then((ul) => { if (!cancelled) unlisteners.push(ul); });

  listen("tauri://drag-leave", () => {
    if (cancelled) return;
    deps.setDragActive(false);
  }).then((ul) => { if (!cancelled) unlisteners.push(ul); });

  return () => { cancelled = true; unlisteners.forEach((u) => u()); };
}

export interface FsWatcherDeps {
  bumpTreeVersion: () => void
}

export function setupFsWatcher(
  rootPath: string | null,
  deps: FsWatcherDeps,
): () => void {
  let cleanup: (() => void) | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  if (!rootPath) return () => {};

  watch(
    rootPath,
    () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { deps.bumpTreeVersion(); }, 200);
    },
    { recursive: true, delayMs: 200 },
  ).then((unwatch) => { cleanup = unwatch; });

  return () => {
    cleanup?.();
    cleanup = null;
    if (debounce) { clearTimeout(debounce); debounce = null; }
  };
}
