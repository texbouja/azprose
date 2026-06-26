<script lang="ts">
import { listFolder, type FileEntry } from "@/lib";
import sadUrl from "@/assets/mascot/sad.png";
import EditableRow from "./editable-row.svelte";
import FolderNode from "./folder-node.svelte";
import FileNode from "./file-node.svelte";

export type NewEntry = { parent: string; kind: "file" | "folder" };

let {
  rootPath,
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
  treeVersion = 0,
  depth = 0,
}: {
  rootPath: string;
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
  treeVersion?: number;
  depth?: number;
} = $props();

let entries = $state<FileEntry[] | null>(null);
let error = $state<string | null>(null);

$effect(() => {
  // Read treeVersion so Svelte 5 re-runs this effect when the parent bumps it.
  void treeVersion;
  let cancelled = false;
  error = null;
  listFolder(rootPath)
    .then((items) => {
      if (!cancelled) entries = items;
    })
    .catch((e) => {
      if (!cancelled) {
        console.error("azprose: listFolder failed", e);
        error = String(e);
      }
    });
  return () => { cancelled = true; };
});
</script>

{#if error}
  <div class="mdv-tree__error">
    <img src={sadUrl} alt="" aria-hidden="true" width={56} height={56} class="mdv-tree__error-art" />
    <span>cannot read folder</span>
  </div>
{:else if !entries}
  <div class="mdv-tree__loading">loading…</div>
{:else if entries.length === 0 && depth <= 1 && !(newEntry && newEntry.parent === rootPath)}
  <div class="mdv-tree__empty">empty folder</div>
{:else}
  <ul
    class="mdv-tree"
    role={depth === 0 ? "tree" : "group"}
    style={depth > 0 ? "--tree-depth: {depth}" : ""}
  >
    {#if newEntry && newEntry.parent === rootPath && onSubmitNew && onCancelNew}
      <EditableRow
        depth={depth}
        kind={newEntry.kind}
        initialValue=""
        onSubmit={(name) => onSubmitNew(newEntry.parent, newEntry.kind, name)}
        onCancel={onCancelNew}
      />
    {/if}
    {#each entries as entry (entry.path)}
      {#if editingPath === entry.path && onSubmitRename && onCancelEdit}
        <EditableRow
          depth={depth}
          kind={entry.isDir ? "folder" : "file"}
          initialValue={entry.name}
          onSubmit={(name) => onSubmitRename(entry.path, name)}
          onCancel={onCancelEdit}
        />
      {:else if entry.isDir}
        <FolderNode
          {entry}
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
          {depth}
        />
      {:else}
        <FileNode
          {entry}
          active={activePath === entry.path}
          {onSelect}
          {onContextMenu}
          staged={stagedPaths.includes(entry.path)}
          {onToggleStage}
          favorite={favoritePaths.includes(entry.path)}
          {onToggleFavorite}
          {depth}
        />
      {/if}
    {/each}
  </ul>
{/if}
