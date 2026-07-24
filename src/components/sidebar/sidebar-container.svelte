<script lang="ts">
import type { FileEntry } from "@/lib";
import type { NewEntry } from "@/components/files/file-tree.svelte";
import ActivityBar from "@/components/sidebar/activity-bar.svelte";
import FsView from "@/components/files/fs-view.svelte";
import JournalView from "@/components/sidebar/journal-view.svelte";
import { sidebarView } from "@/stores/sidebar-view.svelte";

let {
  open,
  rootPath,
  folders,
  activePath,
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
  newEntry,
  onSubmitNew,
  onCancelNew,
  treeVersion = 0,
}: {
  open: boolean;
  rootPath: string | null;
  folders: readonly string[];
  activePath: string | null;
  width: number;
  onWidthChange: (next: number) => void;
  onAddFolder: () => void;
  onNewFile?: (dir?: string) => void;
  onNewFolder?: (dir?: string) => void;
  onCloseFolder: (path: string) => void;
  onOpenProject: (path: string) => void;
  onProjectFromFolder: () => void;
  onSelectFile: (path: string) => void;
  onMove?: (src: string, dstParent: string) => void;
  onContextMenu?: (e: MouseEvent, entry: FileEntry) => void;
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
  newEntry?: NewEntry | null;
  onSubmitNew?: (parent: string, kind: "file" | "folder", name: string) => void;
  onCancelNew?: () => void;
  treeVersion?: number;
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
    <ActivityBar onToggle={() => !open && onWidthChange(width)} />
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
          {newEntry}
          {onSubmitNew}
          {onCancelNew}
          {treeVersion}
        />
      {:else if sidebarView.current === "journal"}
        <JournalView {rootPath} {activePath} {onSelectFile} {treeVersion} />
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
