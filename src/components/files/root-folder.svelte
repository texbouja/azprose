<script lang="ts">
import { basename, type FileEntry } from "@/lib";
import { getT, language } from "@/lib/i18n";
import FileTree from "./file-tree.svelte";
import type { NewEntry } from "./file-tree.svelte";
import { DRAG_MIME } from "@/components/tree/headless-utils";

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
  onRenameRequest,
  newEntry,
  onSubmitNew,
  onCancelNew,
  treeVersion = 0,
  dirtyPaths = [] as string[],
  onFocusChange,
  pendingFocusPath = null,
  onFocusAcknowledged,
}: {
  path: string;
  activePath: string | null;
  isPrimary?: boolean;
  onSelect: (path: string, newTab?: boolean) => void;
  onMove?: (src: string, dstParent: string) => void;
  onContextMenu?: (e: MouseEvent, entry: FileEntry, selection?: FileEntry[]) => void;
  onClose: (path: string) => void;
  closeLabel: string;
  stagedPaths?: readonly string[];
  onToggleStage?: (path: string) => void;
  favoritePaths?: readonly string[];
  onToggleFavorite?: (path: string) => void;
  editingPath?: string | null;
  onSubmitRename?: (src: string, newName: string) => void;
  onCancelEdit?: () => void;
  onRenameRequest?: (path: string) => void;
  newEntry?: NewEntry | null;
  onSubmitNew?: (parent: string, kind: "file" | "folder", name: string) => void;
  onCancelNew?: () => void;
  treeVersion?: number;
  dirtyPaths?: string[];
  /** Forwarded to the inner tree — reports the focused item so the toolbar
      can create in the focused folder / next to the focused file. */
  onFocusChange?: (path: string | null, isFolder: boolean) => void;
  /** Forwarded — focus target of the item just created (VS Code semantics). */
  pendingFocusPath?: string | null;
  /** Forwarded — clears the pending focus once it landed. */
  onFocusAcknowledged?: () => void;
} = $props();

let t = $derived(getT($language));

let open = $state(true);
let isDropTarget = $state(false);
let name = $derived(basename(path));
let rootToggleRef = $state<HTMLButtonElement>();

// Escape in the tree reports rootPath as the creation target AND asks to move
// the DOM focus here — the header button is the visible "root" of this tree.
function focusRootHeader() {
  rootToggleRef?.focus();
}

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
    <button
      type="button"
      class="mdv-rootfolder__toggle"
      bind:this={rootToggleRef}
      onclick={() => open = !open}
      title={path}
    >
      <span class="mdv-tree__chevron{open ? ' is-open' : ''}">
        <i class="wxi-chevron-right" style="font-size:12px"></i>
      </span>
      <span class="mdv-tree__icon">
        <i class={open ? 'wxi-folder-open' : 'wxi-folder'} style="font-size:13px"></i>
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
        <i class="wxi-x" style="font-size:12px"></i>
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
      {onRenameRequest}
      {newEntry}
      {onSubmitNew}
      {onCancelNew}
      {treeVersion}
      {dirtyPaths}
      {onFocusChange}
      onFocusRoot={focusRootHeader}
      {pendingFocusPath}
      {onFocusAcknowledged}
    />
  {/if}
</section>
