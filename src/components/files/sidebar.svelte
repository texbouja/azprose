<script lang="ts">
import { Copy, FilePlus2, FolderInput, FolderPlus, Search, Trash2, X } from "@/lib/icons";
import { Button, Icon } from "@/components/primitives";
import { language, getT } from "@/lib/i18n";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type FileEntry } from "@/lib";
import emptyTowerUrl from "@/assets/mascot/empty-m.png";
import type { NewEntry } from "./file-tree.svelte";
import SearchResults from "./sidebar-search.svelte";
import RootFolder from "./root-folder.svelte";
import Favorites from "./favorites.svelte";

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
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onCloseFolder: (path: string) => void;
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

let t = $derived(getT($language));

let query = $state("");
let searchOpen = $state(false);
let rootDrop = $state(false);
let searchInputRef: HTMLInputElement;

let dragging = false;
let startX = 0;
let startWidth = 0;

$effect(() => {
  const _ = rootPath;
  query = "";
  searchOpen = false;
});

$effect(() => {
  if (!searchOpen) return;
  searchInputRef?.focus();
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    e.preventDefault();
    searchOpen = false;
    query = "";
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
});

$effect(() => {
  return () => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
});

function closeSearch() {
  searchOpen = false;
  query = "";
}

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

function onHeaderMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement | null;
  const INTERACTIVE_SELECTOR = "button, a, input, textarea, select, [role='button'], [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], [contenteditable='true'], .mdv-titlebar__theme, .mdv-tooltip";
  if (target?.closest(INTERACTIVE_SELECTOR)) return;
  void getCurrentWindow().startDragging().catch((err) => {
    console.warn("azprose: startDragging failed", err);
  });
}
</script>

<aside
  class="mdv-sidebar{open ? ' is-open' : ''}"
  style="width:{open ? width + 'px' : '0px'}"
  aria-hidden={!open}
>
  <div class="mdv-sidebar__inner" style="width:{width}px">
    <header
      class="mdv-sidebar__header"
      data-tauri-drag-region
      onmousedown={onHeaderMouseDown}
    >
      <span class="mdv-sidebar__title">
        {t("sidebar.explorer")}
      </span>
      <div class="mdv-sidebar__header-actions">
        {#if folders.length > 0}
          {#snippet searchBtnIcon()}
            <Icon icon={Search} size={12} strokeWidth={1.5} />
          {/snippet}
          <Button
            data-tooltip={searchOpen ? t("sidebar.closeSearchShortcut") : t("sidebar.searchFolder")}
            aria-label={searchOpen ? t("sidebar.closeSearch") : t("sidebar.searchFolder")}
            aria-pressed={searchOpen}
            onclick={() => (searchOpen ? closeSearch() : searchOpen = true)}
            icon={searchBtnIcon}
          />
          {#snippet newFileIcon()}
            <Icon icon={FilePlus2} size={13} strokeWidth={1.5} />
          {/snippet}
          <Button
            data-tooltip={t("menu.newFile")}
            aria-label={t("menu.newFile")}
            onclick={() => onNewFile?.(rootPath ?? undefined)}
            icon={newFileIcon}
          />
          {#snippet newFolderIcon()}
            <Icon icon={FolderPlus} size={13} strokeWidth={1.5} />
          {/snippet}
          <Button
            data-tooltip={t("menu.newFolder")}
            aria-label={t("menu.newFolder")}
            onclick={() => onNewFolder?.(rootPath ?? undefined)}
            icon={newFolderIcon}
          />
        {/if}
        {#snippet addWorkspaceFolderIcon()}
          <Icon icon={FolderInput} size={13} strokeWidth={1.5} />
        {/snippet}
        <Button
          data-tooltip={t("sidebar.addFolder")}
          aria-label={t("sidebar.addFolder")}
          onclick={onAddFolder}
          icon={addWorkspaceFolderIcon}
        />
      </div>
    </header>
    {#if rootPath}
      <div
        class="mdv-sidebar__search-row{searchOpen ? ' is-open' : ''}"
        aria-hidden={!searchOpen}
      >
        <span class="mdv-sidebar__search-icon" aria-hidden="true">
          <Icon icon={Search} size={12} strokeWidth={1.5} />
        </span>
        <input
          bind:this={searchInputRef}
          type="text"
          class="mdv-sidebar__search-input"
          placeholder={t("sidebar.searchPlaceholder")}
          bind:value={query}
          spellcheck={false}
          autocorrect="off"
          autocapitalize="off"
          tabindex={searchOpen ? 0 : -1}
        />
        <button
          type="button"
          class="mdv-sidebar__search-close"
          aria-label={t("sidebar.closeSearch")}
          onclick={closeSearch}
          tabindex={searchOpen ? 0 : -1}
        >
          <Icon icon={X} size={11} strokeWidth={2} />
        </button>
      </div>
    {/if}
    <div
      class="mdv-sidebar__body{rootDrop ? ' is-root-drop' : ''}"
      ondragover={(e) => {
        if (!onMove || !rootPath) return;
        const target = e.target as HTMLElement;
        if (target.closest(".mdv-tree__row--folder")) {
          if (rootDrop) rootDrop = false;
          return;
        }
        if (!e.dataTransfer?.types.includes("application/x-azprose-path")) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        if (!rootDrop) rootDrop = true;
      }}
      ondragleave={(e) => {
        if (e.currentTarget === e.target) rootDrop = false;
      }}
      ondrop={(e) => {
        if (!onMove || !rootPath) return;
        const target = e.target as HTMLElement;
        if (target.closest(".mdv-tree__row--folder")) return;
        const src = e.dataTransfer?.getData("application/x-azprose-path");
        if (!src) return;
        e.preventDefault();
        rootDrop = false;
        const sep = src.includes("\\") ? "\\" : "/";
        const srcParent = src.slice(0, src.lastIndexOf(sep));
        if (srcParent === rootPath) return;
        onMove(src, rootPath);
      }}
    >
      {#if folders.length > 0}
        {#if query.trim().length > 0 && rootPath}
          <SearchResults
            {rootPath}
            {query}
            {activePath}
            {treeVersion}
            onSelect={onSelectFile}
          />
        {:else}
          <Favorites
            {favorites}
            {activePath}
            title={t("sidebar.favorites")}
            emptyLabel={t("sidebar.noFavorites")}
            removeLabel={t("sidebar.unfavorite")}
            onSelect={onSelectFile}
            onToggleFavorite={(p) => onToggleFavorite?.(p)}
            onReorder={(from, to) => onReorderFavorites?.(from, to)}
            {onContextMenu}
          />
          {#each folders as folder (folder)}
            <RootFolder
              path={folder}
              {activePath}
              onSelect={onSelectFile}
              {onMove}
              {onContextMenu}
              onClose={onCloseFolder}
              closeLabel={t("sidebar.closeFolder")}
              {stagedPaths}
              {onToggleStage}
              favoritePaths={favorites}
              {onToggleFavorite}
              {editingPath}
              {onSubmitRename}
              {onCancelEdit}
              {newEntry}
              {onSubmitNew}
              {onCancelNew}
              {treeVersion}
            />
          {/each}
        {/if}
      {:else}
        <Favorites
          {favorites}
          {activePath}
          title={t("sidebar.favorites")}
          emptyLabel={t("sidebar.noFavorites")}
          removeLabel={t("sidebar.unfavorite")}
          onSelect={onSelectFile}
          onToggleFavorite={(p) => onToggleFavorite?.(p)}
          onReorder={(from, to) => onReorderFavorites?.(from, to)}
          {onContextMenu}
        />
        {#if favorites.length === 0}
          <button type="button" class="mdv-sidebar__empty" onclick={onAddFolder}>
            <img
              src={emptyTowerUrl}
              alt=""
              aria-hidden="true"
              width={72}
              height={68}
              draggable={false}
              class="mdv-sidebar__empty-art"
            />
            <span>{t("sidebar.addFolder")}</span>
            <span class="mdv-sidebar__hint">{t("sidebar.browseNotes")}</span>
          </button>
        {/if}
      {/if}
    </div>
    {#if rootPath && stagedPaths.length > 0}
      {#snippet copyContextIcon()}
        <Icon icon={Copy} size={12} strokeWidth={1.6} />
      {/snippet}
      {#snippet clearContextIcon()}
        <Icon icon={Trash2} size={12} strokeWidth={1.6} />
      {/snippet}
      <footer class="mdv-context-tray">
        <div class="mdv-context-tray__meta">
          <span class="mdv-context-tray__label">{t("sidebar.context")}</span>
          <span class="mdv-context-tray__count">
            {stagedPaths.length === 1 ? t("app.fileSingular", { count: 1 }) : t("app.filePlural", { count: stagedPaths.length })}
          </span>
          <span class="mdv-context-tray__tokens">{t("sidebar.tokens", { tokens: stagedTokenLabel })}</span>
        </div>
        <div class="mdv-context-tray__actions">
          <Button
            data-tooltip={t("sidebar.copyContext")}
            aria-label={t("sidebar.copyContext")}
            onclick={onCopyContext}
            icon={copyContextIcon}
          />
          <Button
            data-tooltip={t("sidebar.clearContext")}
            aria-label={t("sidebar.clearContext")}
            onclick={onClearContext}
            icon={clearContextIcon}
          />
        </div>
      </footer>
    {/if}
  </div>

  <div
    class="mdv-sidebar__resize"
    onpointerdown={onResizePointerDown}
    onpointermove={onResizePointerMove}
    onpointerup={stopResize}
    onpointercancel={stopResize}
    role="separator"
    aria-orientation="vertical"
    aria-label={t("sidebar.resize")}
  />
</aside>
