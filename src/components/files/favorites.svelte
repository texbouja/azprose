<script lang="ts">
import { ChevronRight, FileText, Star, Table2 } from "@/lib/icons";
import Icon from "@/components/primitives/Icon.svelte";
import { basename, isCsvPath, type FileEntry } from "@/lib";

let {
  favorites,
  activePath,
  title,
  emptyLabel,
  removeLabel,
  onSelect,
  onToggleFavorite,
  onReorder,
  onContextMenu,
}: {
  favorites: readonly string[];
  activePath: string | null;
  title: string;
  emptyLabel: string;
  removeLabel: string;
  onSelect: (path: string) => void;
  onToggleFavorite: (path: string) => void;
  onReorder: (from: number, to: number) => void;
  onContextMenu?: (e: MouseEvent, entry: FileEntry) => void;
} = $props();

let open = $state(true);
let dragIndex = $state<number | null>(null);
let overIndex = $state<number | null>(null);
let dropOver = $state(false);

const DRAG_MIME = "application/x-azprose-path";
</script>

<section class="mdv-rootfolder mdv-favorites">
  <div class="mdv-rootfolder__header">
    <button type="button" class="mdv-rootfolder__toggle" onclick={() => open = !open}>
      <span class="mdv-tree__chevron{open ? ' is-open' : ''}">
        <Icon icon={ChevronRight} size={12} strokeWidth={2} />
      </span>
      <span class="mdv-tree__icon mdv-favorites__star">
        <Icon icon={Star} size={13} strokeWidth={1.5} />
      </span>
      <span class="mdv-rootfolder__name">{title}</span>
    </button>
  </div>
  {#if open}
    {#if favorites.length === 0}
      <div
        class="mdv-favorites__drop-zone{dropOver ? ' is-over' : ''}"
        ondragover={(e) => {
          if (!e.dataTransfer?.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "link";
          dropOver = true;
        }}
        ondragleave={() => dropOver = false}
        ondrop={(e) => {
          const src = e.dataTransfer?.getData(DRAG_MIME);
          if (!src) { dropOver = false; return; }
          e.preventDefault();
          dropOver = false;
          onToggleFavorite(src);
        }}
      >
        <span class="mdv-favorites__drop-hint">{emptyLabel}</span>
      </div>
    {:else}
      <ul class="mdv-tree">
        {#each favorites as path, i (path)}
          <li
            class="mdv-tree__item{overIndex === i && dragIndex !== null && dragIndex !== i ? ' is-fav-over' : ''}"
          >
            <button
              type="button"
              draggable="true"
              class="mdv-tree__row mdv-tree__row--file has-fav{activePath === path ? ' is-active' : ''}"
              style="padding-left:12px"
              onclick={() => onSelect(path)}
              oncontextmenu={(e) => {
                if (!onContextMenu) return;
                e.preventDefault();
                onContextMenu(e, { path, name: basename(path), isDir: false });
              }}
              title={path}
              ondragstart={(e) => {
                dragIndex = i;
                if (e.dataTransfer) {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData(DRAG_MIME, path);
                  e.dataTransfer.setData("text/plain", path);
                }
              }}
              ondragover={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                if (overIndex !== i) overIndex = i;
              }}
              ondrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i);
                dragIndex = null;
                overIndex = null;
              }}
              ondragend={() => {
                dragIndex = null;
                overIndex = null;
              }}
            >
              <span class="mdv-tree__icon">
                <Icon icon={isCsvPath(path) ? Table2 : FileText} size={13} strokeWidth={1.5} />
              </span>
              <span class="mdv-tree__name">{basename(path)}</span>
            </button>
            <button
              type="button"
              class="mdv-tree__fav is-fav"
              data-tooltip={removeLabel}
              aria-label="{removeLabel} {basename(path)}"
              onclick={(e) => {
                e.stopPropagation();
                onToggleFavorite(path);
              }}
            >
              <Icon icon={Star} size={11} strokeWidth={1.8} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
