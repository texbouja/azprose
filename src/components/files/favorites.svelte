<script lang="ts">
// Contrat CSS des rangées (vague 3, phase 3.1) : ce composant rend ses
// propres .mdv-tree__item/__row SANS passer par HeadlessTree.svelte (aucune
// composition entre les deux) — import direct, la feuille est partagée mais
// idempotente (déjà chargée si HeadlessTree a aussi rendu ailleurs).
import "@/styles/files/sidebar-tree.css";
import FileIcon from "./FileIcon.svelte";
import { basename, type FileEntry } from "@/lib";

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
  onSelect: (path: string, newTab?: boolean, viewer?: boolean) => void;
  onToggleFavorite: (path: string) => void;
  onReorder: (from: number, to: number) => void;
  onContextMenu?: (e: MouseEvent, entry: FileEntry, selection?: FileEntry[]) => void;
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
        <i class="wxi-chevron-right" style="font-size:12px"></i>
      </span>
      <span class="mdv-tree__icon mdv-favorites__star">
        <i class="wxi-star" style="font-size:13px"></i>
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
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          dropOver = true;
        }}
        ondragleave={() => dropOver = false}
        ondrop={(e) => {
          const src = e.dataTransfer?.getData(DRAG_MIME);
          if (!src) { dropOver = false; return; }
          e.preventDefault();
          e.stopPropagation();
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
              onclick={(e) => onSelect(path, e.altKey, e.shiftKey)}
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
                e.stopPropagation();
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
                <FileIcon path={path} size={13} />
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
              <i class="wxi-star" style="font-size:11px"></i>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
