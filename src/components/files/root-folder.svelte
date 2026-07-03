<script lang="ts">
import { ChevronRight, Folder, FolderOpen, X } from "@/lib/icons";
import Icon from "@/components/primitives/Icon.svelte";
import { basename, type FileEntry } from "@/lib";
import { getT, language } from "@/lib/i18n";
import FileTree from "./file-tree.svelte";
import type { NewEntry } from "./file-tree.svelte";
import { DRAG_MIME } from "./folder-node.svelte";

let {
  path,
  activePath,
  isPrimary = true,
  onSelect,
  onMove,
  onContextMenu,
  onClose,
  closeLabel,
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
  treeVersion = 0,
  selectedPaths = new Set<string>(),
  onToggleSelect,
  onSelectRange,
  onClearSelection,
}: {
  path: string;
  activePath: string | null;
  isPrimary?: boolean;
  onSelect: (path: string) => void;
  onMove?: (src: string, dstParent: string) => void;
  onContextMenu?: (e: MouseEvent, entry: FileEntry) => void;
  onClose: (path: string) => void;
  closeLabel: string;
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
  treeVersion?: number;
  selectedPaths?: Set<string>;
  onToggleSelect?: (path: string) => void;
  onSelectRange?: (clickedPath: string, siblingPaths: string[]) => void;
  onClearSelection?: () => void;
} = $props();

let t = $derived(getT($language));

let open = $state(true);
let isDropTarget = $state(false);
let name = $derived(basename(path));

$effect(() => {
  if (newEntry && newEntry.parent === path && !open) open = true;
});

function onDragOver(e: DragEvent) {
  if (!onMove || !e.dataTransfer?.types.includes(DRAG_MIME)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  if (!isDropTarget) isDropTarget = true;
}

function onDragLeave() {
  if (isDropTarget) isDropTarget = false;
}

function onDrop(e: DragEvent) {
  isDropTarget = false;
  const src = e.dataTransfer?.getData(DRAG_MIME);
  if (!src || !onMove) return;
  e.preventDefault();
  const sep = src.includes("\\") ? "\\" : "/";
  const srcParent = src.slice(0, src.lastIndexOf(sep));
  if (srcParent === path) return;
  onMove(src, path);
}
</script>

<section class="mdv-rootfolder">
  <div
    class="mdv-rootfolder__header{isDropTarget ? ' is-drop-target' : ''}"
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    ondrop={onDrop}
  >
    <button type="button" class="mdv-rootfolder__toggle" onclick={() => open = !open} title={path}>
      <span class="mdv-tree__chevron{open ? ' is-open' : ''}">
        <Icon icon={ChevronRight} size={12} strokeWidth={2} />
      </span>
      <span class="mdv-tree__icon">
        <Icon icon={open ? FolderOpen : Folder} size={13} strokeWidth={1.5} />
      </span>
      <span class="mdv-rootfolder__label">
        <span class="mdv-rootfolder__name">{name}</span>
        {#if !isPrimary}
          <span class="mdv-rootfolder__badge">{t("sidebar.guestFolder")}</span>
        {/if}
        <span class="mdv-rootfolder__path">{path}</span>
      </span>
    </button>
    {#if !isPrimary}
      <button
        type="button"
        class="mdv-rootfolder__close"
        onclick={() => onClose(path)}
        data-tooltip={closeLabel}
        aria-label={closeLabel}
      >
        <Icon icon={X} size={12} strokeWidth={2} />
      </button>
    {/if}
  </div>
  {#if open}
    <FileTree
      rootPath={path}
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
      {selectedPaths}
      {onToggleSelect}
      {onSelectRange}
      {onClearSelection}
      depth={1}
    />
  {/if}
</section>
