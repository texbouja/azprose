<script lang="ts">
import type { FileEntry } from "@/lib";
import type { NewEntry } from "@/components/files/file-tree.svelte";
// Chrome du conteneur (chrome/redimensionnement) — contrat CSS propre
// (vague 3, phase 3.1) : partagé avec BrowseSidebar.svelte (NAV), qui
// n'imbrique pas ce composant et importe donc la même feuille lui-même.
import "@/styles/files/sidebar-shell.css";

import FsView from "@/components/files/fs-view.svelte";
import JournalView from "@/components/sidebar/journal-view.svelte";
import LinksView from "@/components/links/LinksView.svelte";
import { sidebarView } from "@/stores/sidebar-view.svelte";

let {
  open,
  rootPath,
  folders,
  activePath,
  tocRefPath,

  tocRefSource,
  width,
  onWidthChange,
  onAddFolder,
  onNewFile,
  onNewFolder,
  onCloseFolder,
  onOpenProject,
  onProjectFromFolder,
  onSelectFile,
  onMove,
  onContextMenu,
  stagedPaths = [],
  stagedTokenLabel = "0",
  onToggleStage,
  favorites = [],
  onToggleFavorite,
  onReorderFavorites,
  onCopyContext,
  onClearContext,
  editingPath,
  onSubmitRename,
  onCancelEdit,
  onRenameRequest,
  onDeleteEntry,
  newEntry,
  onSubmitNew,
  onCancelNew,
  treeVersion = 0,
  dirtyPaths = [] as string[],
  onOpenCalendar,
  onFocusChange,
  pendingFocusPath = null,
  onFocusAcknowledged,
}: {
  open: boolean;
  rootPath: string | null;
  folders: readonly string[];
  activePath: string | null;
  /** Référence de la TOC : tab viewer md actif, sinon .md actif éditeur.
   *  `null` = à lire sur disque (racine de la doc intégrée, index.md). */
  tocRefPath: string | null;
  tocRefSource: string | null;
  width: number;
  onWidthChange: (next: number) => void;
  onAddFolder: () => void;
  onNewFile?: (dir?: string) => void;
  onNewFolder?: (dir?: string) => void;
  onCloseFolder: (path: string) => void;
  onOpenProject: (path: string) => void;
  onProjectFromFolder: () => void;
  onSelectFile: (path: string, newTab?: boolean) => void;
  onMove?: (src: string, dstParent: string) => void;
  onContextMenu?: (e: MouseEvent, entry: FileEntry, selection?: FileEntry[]) => void;
  stagedPaths?: readonly string[];
  stagedTokenLabel?: string;
  onToggleStage?: (path: string) => void;
  favorites?: readonly string[];
  onToggleFavorite?: (path: string) => void;
  onReorderFavorites?: (from: number, to: number) => void;
  onCopyContext?: () => void;
  onClearContext?: () => void;
  editingPath?: string | null;
  onSubmitRename?: (src: string, newName: string) => void;
  onCancelEdit?: () => void;
  onRenameRequest?: (path: string) => void;
  onDeleteEntry?: (entry: FileEntry) => void;
  newEntry?: NewEntry | null;
  onSubmitNew?: (parent: string, kind: "file" | "folder", name: string) => void;
  onCancelNew?: () => void;
  treeVersion?: number;
  dirtyPaths?: string[];
  onOpenCalendar?: () => void;
  /** Focused item of the active file tree → FileOpsManager.setTreeFocus. */
  onFocusChange?: (path: string | null, isFolder: boolean) => void;
  /** Forwarded — focus target of the item just created (VS Code semantics). */
  pendingFocusPath?: string | null;
  /** Forwarded — clears the pending focus once it landed. */
  onFocusAcknowledged?: () => void;
} = $props();

let dragging = $state(false);
let startX = 0;
let startWidth = 0;

function onResizePointerDown(e: PointerEvent) {
  dragging = true;
  startX = e.clientX;
  startWidth = width;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function onResizePointerMove(e: PointerEvent) {
  if (!dragging) return;
  const delta = e.clientX - startX;
  const next = Math.max(180, startWidth + delta);
  onWidthChange(next);
}

function stopResize(e: PointerEvent) {
  if (!dragging) return;
  dragging = false;
  try {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  } catch {}
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}
</script>

<aside
  class="mdv-sidebar{open ? ' is-open' : ''}"
  style="width:{open ? width + 'px' : '0px'}"
  aria-hidden={!open}
>
  <div class="mdv-sidebar__inner" style="width:{width}px">
    <div class="mdv-sidebar__view">
      {#if sidebarView.current === "files"}
        <FsView
          {rootPath}
          {folders}
          {activePath}
          {onAddFolder}
          {onNewFile}
          {onNewFolder}
          {onCloseFolder}
          {onOpenProject}
          {onProjectFromFolder}
          {onSelectFile}
          {onMove}
          {onContextMenu}
          {stagedPaths}
          {stagedTokenLabel}
          {onToggleStage}
          {favorites}
          {onToggleFavorite}
          {onReorderFavorites}
          {onCopyContext}
          {onClearContext}
          {editingPath}
          {onSubmitRename}
          {onCancelEdit}
          {onRenameRequest}
          {newEntry}
          {onSubmitNew}
          {onCancelNew}
          {treeVersion}
          {dirtyPaths}
          {onFocusChange}
          {pendingFocusPath}
          {onFocusAcknowledged}
        />
      {:else if sidebarView.current === "journal"}
        <JournalView
          {rootPath}
          {activePath}
          {onSelectFile}
          {treeVersion}
          {onOpenCalendar}
          {onDeleteEntry}
        />
      {:else if sidebarView.current === "links"}
        <LinksView
          filePath={tocRefPath}
          source={tocRefSource}
          rootPath={rootPath}
        />
      {/if}
    </div>
  </div>

  <div
    class="mdv-sidebar__resize"
    onpointerdown={onResizePointerDown}
    onpointermove={onResizePointerMove}
    onpointerup={stopResize}
    onpointercancel={stopResize}
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize sidebar"
  />
</aside>
