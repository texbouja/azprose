<script lang="ts">
  import {
    asyncDataLoaderFeature,
    dragAndDropFeature,
    hotkeysCoreFeature,
    selectionFeature,
    type AsyncDataLoaderDataRef,
    type ItemInstance,
    type TreeConfig,
    type TreeInstance,
  } from "@headless-tree/core";
  import { basename, dirname, listFolder, type FileEntry } from "@/lib";
  import HeadlessTree from "@/components/tree/HeadlessTree.svelte";
  import { DRAG_MIME, ancestorPaths } from "@/components/tree/headless-utils";
  import EditableRow from "./editable-row.svelte";
  import FileIcon from "./FileIcon.svelte";
  import sadUrl from "@/assets/mascot/az-sad.svg";

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
  dirtyPaths = [] as string[],
}: {
    rootPath: string;
    activePath: string | null;
    onSelect: (path: string, permanent?: boolean) => void;
    onMove?: (src: string, dstParent: string) => void;
    onContextMenu?: (e: MouseEvent, entry: FileEntry, selection?: FileEntry[]) => void;
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
  /** Paths whose parent folders must be re-listed after the treeVersion bump
      (from the watcher's event or the file-op that caused it). */
  dirtyPaths?: string[];
} = $props();

  // Folders the user explicitly collapsed — auto-expand (active file / new entry)
  // never re-opens these.
  let userCollapsed = $state(new Set<string>());
  let loadError = $state<string | null>(null);
  let headlessTree = $state<TreeInstance<FileEntry> | null>(null);

  /** Builds the headless-tree config. Runs once per component instance — the
      parent keys this component by `rootPath`, so the config is stable. */
  function buildConfig(): TreeConfig<FileEntry> {
    return {
      rootItemId: rootPath,
      state: { expandedItems: [], focusedItem: null },
      // asyncDataLoaderFeature is REQUIRED for the async dataLoader below:
      // it provides retrieveChildrenIds + the loadingItemChildrens state that
      // both getItemsMeta and the wrapper's loading indicator rely on.
      features: [
        asyncDataLoaderFeature,
        hotkeysCoreFeature,
        selectionFeature,
        dragAndDropFeature,
      ],
      dataLoader: {
        getItem: (id) => ({ name: basename(id), path: id, isDir: false }),
        getChildrenWithData: async (id) => {
          try {
            const entries = await listFolder(id);
            loadError = null;
            return entries.map((e) => ({ id: e.path, data: e }));
          } catch (err) {
            console.error("azprose: listFolder failed", err);
            loadError = String(err);
            return [];
          }
        },
      },
      getItemName: (item) => item.getItemData()?.name ?? basename(item.getId()),
      isItemFolder: (item) => item.getItemData()?.isDir ?? false,
      onPrimaryAction: (item) => {
        if (!item.isFolder()) onSelect(item.getId(), false);
      },
      // File-system moves only: no sibling reordering, no foreign (OS) drops.
      canReorder: false,
      canDrop: () => Boolean(onMove),
      onDrop: async (items, target) => {
        const targetPath = target.item.getId();
        const sep = targetPath.includes("\\") ? "\\" : "/";
        for (const item of items) {
          const src = item.getId();
          const srcParent = src.slice(0, src.lastIndexOf(sep));
          if (srcParent === targetPath) continue; // already inside target — no-op
          onMove?.(src, targetPath);
        }
      },
      // Expose the native MIME so external drop zones (root folder header) work.
      createForeignDragObject: (items) => ({
        format: DRAG_MIME,
        data: items.map((i) => i.getId()).join("\n"),
        dropEffect: "move",
        effectAllowed: "move",
      }),
      hotkeys: {
        // Custom (non-builtin) hotkey: Enter opens files / toggles folders
        // like VS Code. Builtin presets have no "open" action.
        customopenItem: {
          hotkey: "Enter",
          preventDefault: true,
          handler: (_e, tree) => {
            const item = tree.getFocusedItem();
            if (!item) return;
            if (item.isFolder()) {
              if (item.isExpanded()) item.collapse();
              else item.expand();
            } else {
              item.primaryAction();
            }
          },
        },
      },
      indent: 12,
    };
  }

  let config = $state<TreeConfig<FileEntry>>(buildConfig());

  // Auto-expand: ancestors of the active file (unless user-collapsed) and the
  // parent of a pending new entry. Merges with the current expandedItems so
  // manually expanded folders are preserved.
  $effect(() => {
    const tree = headlessTree;
    if (!tree) return;
    const target = new Set<string>();
    if (activePath) {
      for (const p of ancestorPaths(activePath, rootPath)) {
        if (!userCollapsed.has(p)) target.add(p);
      }
    }
    if (newEntry?.parent && newEntry.parent !== rootPath) target.add(newEntry.parent);
    tree.setConfig((c) => {
      const current = new Set(c.state?.expandedItems ?? []);
      for (const p of target) current.add(p);
      for (const p of userCollapsed) current.delete(p);
      return { ...c, state: { ...c.state, expandedItems: [...current] } };
    });
  });

  // Reload folder listings when the FS changes externally (treeVersion bump).
  // Targeted invalidation: only the folders that (may) contain the changed
  // paths re-list, so the tree never flashes all rows on a single change.
  // Without path info (empty list) it falls back to a full re-list.
  $effect(() => {
    void treeVersion;
    const tree = headlessTree;
    if (!tree || treeVersion === 0) return;
    const ref = tree.getDataRef<AsyncDataLoaderDataRef<FileEntry>>();
    if (!dirtyPaths?.length) {
      ref.current.childrenIds = {};
    } else {
      const dirs = new Set<string>();
      for (const p of dirtyPaths) {
        dirs.add(dirname(p));
        dirs.add(p); // p itself may be a (re)created folder with stale children
      }
      dirs.add(rootPath);
      for (const d of dirs) delete ref.current.childrenIds[d];
    }
    tree.rebuildTree();
  });

  function handleRowClick(e: MouseEvent, item: ItemInstance<FileEntry>) {
    if (e.shiftKey) {
      item.selectUpTo(e.ctrlKey || e.metaKey);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      item.toggleSelect();
      return;
    }
    item.getTree().setSelectedItems([item.getId()]);
    item.setFocused();
    if (item.isFolder()) {
      if (item.isExpanded()) {
        userCollapsed.add(item.getId());
        item.collapse();
      } else {
        userCollapsed.delete(item.getId());
        item.expand();
      }
    } else {
      onSelect(item.getId(), false);
    }
  }

  function handleRowContextMenu(e: MouseEvent, item: ItemInstance<FileEntry>) {
    const tree = item.getTree();
    // Right-clicking an unselected item selects it alone; clicking an already
    // selected item keeps the whole selection (menu acts on the selection).
    if (!item.isSelected()) tree.setSelectedItems([item.getId()]);
    const data = item.getItemData();
    if (!data) return;
    const selection = tree
      .getSelectedItems()
      .map((i) => i.getItemData())
      .filter((d): d is FileEntry => !!d);
    onContextMenu?.(e, data, selection.length ? selection : [data]);
  }
</script>

<HeadlessTree
  {config}
  label={rootPath}
  onTree={(t) => {
    headlessTree = t;
  }}
  onRowClick={handleRowClick}
>
  {#snippet children(item: ItemInstance<FileEntry>)}
    {#if editingPath === item.getId() && onSubmitRename && onCancelEdit}
      <EditableRow
        depth={item.getItemMeta().level + 1}
        kind={item.isFolder() ? "folder" : "file"}
        initialValue={item.getItemName()}
        onSubmit={(name) => onSubmitRename(item.getId(), name)}
        onCancel={onCancelEdit}
      />
    {:else if item.isFolder()}
      <button
        type="button"
        tabindex="-1"
        class="mdv-tree__row mdv-tree__row--folder{item.isSelected() ? ' is-selected' : ''}{item.isDragTarget() ? ' is-drop-target' : ''}"
        style="padding-left:{8 + (item.getItemMeta().level + 1) * 12}px"
        oncontextmenu={(e) => handleRowContextMenu(e, item)}
        title={item.getItemName()}
      >
        <span class="mdv-tree__chevron{item.isExpanded() ? ' is-open' : ''}">
          <i class="wxi-chevron-right" style="font-size:12px"></i>
        </span>
        <span class="mdv-tree__icon">
          <i class={item.isExpanded() ? 'wxi-folder-open' : 'wxi-folder'} style="font-size:13px"></i>
        </span>
        <span class="mdv-tree__name">{item.getItemName()}</span>
      </button>
      {#if newEntry && newEntry.parent === item.getId() && onSubmitNew && onCancelNew}
        <EditableRow
          depth={item.getItemMeta().level + 2}
          kind={newEntry.kind}
          initialValue=""
          onSubmit={(name) => onSubmitNew(newEntry.parent, newEntry.kind, name)}
          onCancel={onCancelNew}
        />
      {/if}
    {:else}
      <button
        type="button"
        tabindex="-1"
        class="mdv-tree__row mdv-tree__row--file{activePath === item.getId() ? ' is-active' : ''}{stagedPaths.includes(item.getId()) ? ' is-staged' : ''}{item.isSelected() ? ' is-selected' : ''}{onToggleFavorite ? ' has-fav' : ''}"
        style="padding-left:{12 + (item.getItemMeta().level + 1) * 12}px"
        oncontextmenu={(e) => handleRowContextMenu(e, item)}
        ondblclick={() => onSelect(item.getId(), true)}
        data-path={item.getId()}
        data-active={activePath === item.getId() ? "" : undefined}
        title={item.getId()}
      >
        <span class="mdv-tree__icon">
          <FileIcon path={item.getId()} size={13} />
        </span>
        <span class="mdv-tree__name">{item.getItemName()}</span>
      </button>
      {#if onToggleStage}
        <button
          type="button"
          class="mdv-tree__stage{stagedPaths.includes(item.getId()) ? ' is-staged' : ''}{onToggleFavorite ? ' has-fav' : ''}"
          data-tooltip={stagedPaths.includes(item.getId()) ? "remove from context" : "stage for context"}
          aria-label={stagedPaths.includes(item.getId()) ? "remove {item.getItemName()} from context" : "stage {item.getItemName()} for context"}
          aria-pressed={stagedPaths.includes(item.getId())}
          onclick={(e) => {
            e.stopPropagation();
            onToggleStage(item.getId());
          }}
        >
          <i class={stagedPaths.includes(item.getId()) ? 'wxi-check' : 'wxi-file-plus-2'} style="font-size:11px"></i>
        </button>
      {/if}
      {#if onToggleFavorite}
        <button
          type="button"
          class="mdv-tree__fav{favoritePaths.includes(item.getId()) ? ' is-fav' : ''}"
          data-tooltip={favoritePaths.includes(item.getId()) ? "remove from favorites" : "add to favorites"}
          aria-label={favoritePaths.includes(item.getId()) ? "remove {item.getItemName()} from favorites" : "add {item.getItemName()} to favorites"}
          aria-pressed={favoritePaths.includes(item.getId())}
          onclick={(e) => {
            e.stopPropagation();
            onToggleFavorite(item.getId());
          }}
        >
          <i class="wxi-star" style="font-size:11px"></i>
        </button>
      {/if}
    {/if}
  {/snippet}

  {#snippet prependItems()}
    {#if newEntry && newEntry.parent === rootPath && onSubmitNew && onCancelNew}
      <li class="mdv-tree__item">
        <EditableRow
          depth={1}
          kind={newEntry.kind}
          initialValue=""
          onSubmit={(name) => onSubmitNew(newEntry.parent, newEntry.kind, name)}
          onCancel={onCancelNew}
        />
      </li>
    {/if}
  {/snippet}

  {#snippet empty()}
    {#if loadError}
      <div class="mdv-tree__error">
        <img src={sadUrl} alt="" aria-hidden="true" width={56} height={56} class="mdv-tree__error-art" />
        <span>cannot read folder</span>
      </div>
    {:else if !(newEntry && newEntry.parent === rootPath)}
      <div class="mdv-tree__empty">empty folder</div>
    {/if}
  {/snippet}
</HeadlessTree>
