<script lang="ts">
import { Check, FilePlus2, FileText, Image as ImageIcon, Star, Table2 } from "@/lib/icons";
import Icon from "@/components/primitives/Icon.svelte";
import { DRAG_MIME } from "./folder-node.svelte";
import { isCsvPath, isImagePath, type FileEntry } from "@/lib";

let {
  entry,
  active = false,
  onSelect,
  onContextMenu,
  staged = false,
  onToggleStage,
  favorite = false,
  onToggleFavorite,
  depth,
}: {
  entry: FileEntry;
  active?: boolean;
  onSelect: (path: string, permanent?: boolean) => void;
  onContextMenu?: (e: MouseEvent, entry: FileEntry) => void;
  staged?: boolean;
  onToggleStage?: (path: string) => void;
  favorite?: boolean;
  onToggleFavorite?: (path: string) => void;
  depth: number;
} = $props();

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData(DRAG_MIME, entry.path);
  e.dataTransfer?.setData("text/plain", entry.path);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

function onCtx(e: MouseEvent) {
  if (onContextMenu) {
    e.preventDefault();
    onContextMenu(e, entry);
  }
}

function handleClick(e: MouseEvent) {
  if ((e.metaKey || e.ctrlKey) && onToggleStage) {
    e.preventDefault();
    onToggleStage(entry.path);
    return;
  }
  onSelect(entry.path, false); // single-click → preview (ephemeral) tab
}

function handleDblClick() {
  onSelect(entry.path, true); // double-click → permanent tab
}
</script>

<li class="mdv-tree__item" role="treeitem" aria-selected={active} data-path={entry.path} data-active={active ? "" : undefined}>
  <button
    type="button"
    draggable="true"
    class="mdv-tree__row mdv-tree__row--file{active ? ' is-active' : ''}{staged ? ' is-staged' : ''}{onToggleFavorite ? ' has-fav' : ''}"
    style="padding-left:{8 + depth * 12 + 4}px"
    onclick={handleClick}
    ondblclick={handleDblClick}
    oncontextmenu={onCtx}
    ondragstart={onDragStart}
    title={entry.path}
  >
    <span class="mdv-tree__icon">
      <Icon icon={isCsvPath(entry.name) ? Table2 : isImagePath(entry.path) ? ImageIcon : FileText} size={13} strokeWidth={1.5} />
    </span>
    <span class="mdv-tree__name">{entry.name}</span>
  </button>
  {#if onToggleStage}
    <button
      type="button"
      class="mdv-tree__stage{staged ? ' is-staged' : ''}{onToggleFavorite ? ' has-fav' : ''}"
      data-tooltip={staged ? "remove from context" : "stage for context"}
      aria-label={staged ? "remove {entry.name} from context" : "stage {entry.name} for context"}
      aria-pressed={staged}
      onclick={(e) => {
        e.stopPropagation();
        onToggleStage(entry.path);
      }}
    >
      <Icon icon={staged ? Check : FilePlus2} size={11} strokeWidth={1.8} />
    </button>
  {/if}
  {#if onToggleFavorite}
    <button
      type="button"
      class="mdv-tree__fav{favorite ? ' is-fav' : ''}"
      data-tooltip={favorite ? "remove from favorites" : "add to favorites"}
      aria-label={favorite ? "remove {entry.name} from favorites" : "add {entry.name} to favorites"}
      aria-pressed={favorite}
      onclick={(e) => {
        e.stopPropagation();
        onToggleFavorite(entry.path);
      }}
    >
      <Icon icon={Star} size={11} strokeWidth={1.8} />
    </button>
  {/if}
</li>
