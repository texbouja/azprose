import { listen } from "@tauri-apps/api/event"
import { watch, type WatchEventKind } from "@tauri-apps/plugin-fs"
import { readText } from "@/lib/files"
import { isSupportedTextPath, isImagePath, isPdfPath, getMtime } from "@/lib"
import type { PanelManager } from "@/lib/panel-manager"
import type { ContentStore } from "@/lib/content-store"

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
  /** Source unique du contenu (phase 7) : quand présent, le reload passe par
   *  `load(path, { forceBuffer: true })` — l'utilisateur a choisi de recharger
   *  le disque, le buffer (s'il y en avait un) est écrasé. */
  content?: ContentStore
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
  if (deps.content) {
    // L'écrivain unique : le contenu vit dans le store — load force le
    // disque dans le buffer (reload externe), les reflets suivent le store.
    await deps.content.load(path, { forceBuffer: true });
    const src = deps.content.get(path);
    deps.pm.main.tabs = deps.pm.main.tabs.map((t: any) =>
      t.path === path ? { ...t, source: src, savedContent: src } : t,
    );
  } else {
    deps.pm.main.tabs = deps.pm.main.tabs.map((t: any) =>
      t.path === path ? { ...t, source: fresh, savedContent: fresh } : t,
    );
  }
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
  /** Notified after a debounced structural FS change. `paths` = the changed
      paths (absolute), so consumers can invalidate only the affected folders. */
  bumpTreeVersion: (paths: string[]) => void
  /** Chemins dont l'EXISTENCE a pu changer (création, suppression, renommage),
   *  pour `workspace/didChangeWatchedFiles`. Séparé de `bumpTreeVersion` parce
   *  que les deux consommateurs ne veulent pas la même chose : l'arbre veut des
   *  dossiers à invalider, le serveur LSP veut des fichiers et leur sort. */
  onStructuralChange?: (paths: string[]) => void
}

/** True when `p` lives under a hidden (dotfile) directory of the vault
    (e.g. `.azprose/`, `.git/`). The FS view never shows those entries
    (`isVisibleTreeEntryName`), so a change there must not reload the tree —
    the app's own writes to `.azprose/` (session mirror, config.json, data.db)
    would otherwise trigger a full tree reload on every write. */
function isHiddenPath(rootPath: string, p: string): boolean {
  const prefix = rootPath.endsWith("/") ? rootPath : rootPath + "/";
  const rel = p.startsWith(prefix) ? p.slice(prefix.length) : p;
  return rel.split(/[/\\]/).some((seg) => seg.startsWith("."));
}

/** True when the event can only be a content/metadata/access change that never
    alters the file names or folder structure shown in the tree. Content saves —
    including the app's own (`writeTextFile` is a direct write, not atomic) —
    arrive as `modify: { kind: "data" }`; skipping them stops the tree from
    reloading (and flashing) on every save. Renames arrive as
    `modify: { kind: "rename" }` and MUST reload. */
function isTreeIrrelevantEvent(type: WatchEventKind): boolean {
  if (type === "any" || type === "other") return false;
  if ("access" in type) return true;
  if ("modify" in type) {
    return type.modify.kind === "data" || type.modify.kind === "metadata";
  }
  return false; // create / remove → structural → reload
}

export function setupFsWatcher(
  rootPath: string | null,
  deps: FsWatcherDeps,
): () => void {
  let cleanup: (() => void) | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  if (!rootPath) return () => {};

  // Accumulés pendant la fenêtre d'anti-rebond, puis vidés d'un coup : un
  // renommage ou une copie de dossier produit une rafale, et le serveur LSP
  // préfère une notification portant dix changements que dix notifications —
  // il tente un verrou NON bloquant sur son index et abandonne s'il est pris.
  const enAttente = new Set<string>();

  watch(
    rootPath,
    (event) => {
      // Filter hidden paths FIRST so they never cancel a pending reload
      // scheduled for a visible change.
      if (event.paths?.length && event.paths.every((p) => isHiddenPath(rootPath, p))) {
        return;
      }
      // Skip content writes / metadata / access — they never change the names
      // or structure the tree displays (the app's own saves land here too), et
      // le contenu d'un fichier DÉJÀ connu du serveur est notifié à la
      // sauvegarde par un autre chemin.
      if (isTreeIrrelevantEvent(event.type)) return;

      for (const p of event.paths ?? []) {
        if (!isHiddenPath(rootPath, p)) enAttente.add(p);
      }
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        const chemins = [...enAttente];
        enAttente.clear();
        deps.bumpTreeVersion(chemins);
        deps.onStructuralChange?.(chemins);
      }, 200);
    },
    { recursive: true, delayMs: 200 },
  ).then((unwatch) => { cleanup = unwatch; });

  return () => {
    cleanup?.();
    cleanup = null;
    if (debounce) { clearTimeout(debounce); debounce = null; }
  };
}
