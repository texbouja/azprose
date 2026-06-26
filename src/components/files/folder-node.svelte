<script module lang="ts">
export const DRAG_MIME = "application/x-azprose-path";
</script>

<script lang="ts">
import { ChevronRight, Folder, FolderOpen } from "@/lib/icons";
import Icon from "@/components/primitives/Icon.svelte";
import { type FileEntry } from "@/lib";
import FileTree from "./file-tree.svelte";
import type { NewEntry } from "./file-tree.svelte";

function isDescendantPath(child: string, parent: string): boolean {
  if (child === parent) return true;
  const sep = parent.includes("\\") ? "\\" : "/";
  const prefix = parent.endsWith(sep) ? parent : parent + sep;
  return child.startsWith(prefix);
}

let {
  entry,
  activePath,
  onSelect,
  onMove,
  onContextMenu,
  stagedPaths = [],
  onToggleStage,
  favoritePaths = [],
  onToggleFavorite,
  editingPath,
  onSubmitRename,
  onCancelEdit,
  newEntry,
  onSubmitNew,
  onCancelNew,
  treeVersion,
  depth,
}: {
  entry: FileEntry;
  activePath: string | null;
  onSelect: (path: string) => void;
  onMove?: (src: string, dstParent: string) => void;
  onContextMenu?: (e: MouseEvent, entry: FileEntry) => void;
  stagedPaths?: readonly string[];
  onToggleStage?: (path: string) => void;
  favoritePaths?: readonly string[];
  onToggleFavorite?: (path: string) => void;
  editingPath?: string | null;
  onSubmitRename?: (src: string, newName: string) => void;
  onCancelEdit?: () => void;
  newEntry?: NewEntry | null;
  onSubmitNew?: (parent: string, kind: "file" | "folder", name: string) => void;
  onCancelNew?: () => void;
  treeVersion: number;
  depth: number;
} = $props();

let open = $state(false);
let isDropTarget = $state(false);

$effect(() => {
  if (newEntry && newEntry.parent === entry.path && !open) open = true;
});

function toggle() { open = !open; }

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData(DRAG_MIME, entry.path);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

function onDragOver(e: DragEvent) {
  if (!onMove) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  if (!isDropTarget) isDropTarget = true;
}

function onDragLeave() {
  if (isDropTarget) isDropTarget = false;
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  isDropTarget = false;
  const src = e.dataTransfer?.getData(DRAG_MIME);
  if (!src || !onMove) return;
  if (isDescendantPath(entry.path, src)) return;
  onMove(src, entry.path);
}

function onCtx(e: MouseEvent) {
  if (onContextMenu) {
    e.preventDefault();
    onContextMenu(e, entry);
  }
}
</script>

<li class="mdv-tree__item" role="treeitem" aria-expanded={open}>
  <button
    type="button"
    draggable="true"
    class="mdv-tree__row mdv-tree__row--folder{isDropTarget ? ' is-drop-target' : ''}"
    style="padding-left:{8 + depth * 12}px"
    onclick={toggle}
    oncontextmenu={onCtx}
    ondragstart={onDragStart}
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    ondrop={onDrop}
    title={entry.name}
  >
    <span class="mdv-tree__chevron{open ? ' is-open' : ''}">
      <Icon icon={ChevronRight} size={12} strokeWidth={2} />
    </span>
    <span class="mdv-tree__icon">
      <Icon icon={open ? FolderOpen : Folder} size={13} strokeWidth={1.5} />
    </span>
    <span class="mdv-tree__name">{entry.name}</span>
  </button>
  {#if open}
    <FileTree
      rootPath={entry.path}
      {activePath}
      {onSelect}
      {onMove}
      {onContextMenu}
      {stagedPaths}
      {onToggleStage}
      {favoritePaths}
      {onToggleFavorite}
      {editingPath}
      {onSubmitRename}
      {onCancelEdit}
      {newEntry}
      {onSubmitNew}
      {onCancelNew}
      {treeVersion}
      depth={depth + 1}
    />
  {/if}
</li>
