<script lang="ts">
  import {
    asyncDataLoaderFeature,
    dragAndDropFeature,
    expandAllFeature,
    hotkeysCoreFeature,
    keyboardDragAndDropFeature,
    selectionFeature,
    type ItemInstance,
    type TreeConfig,
    type TreeInstance,
  } from "@headless-tree/core";
  import { basename, listFolder, type FileEntry } from "@/lib";
  import HeadlessTree from "@/components/tree/HeadlessTree.svelte";
  import {
    DRAG_MIME,
    ancestorPaths,
    ensureContextMenuSelection,
  } from "@/components/tree/headless-utils";
  import { fsInvalidationFeature } from "@/components/tree/fs-invalidation-feature";
  import { mdvExpansionTrackerFeature } from "@/components/tree/mdv-expansion-tracker";
  import { mdvRowClickFeature } from "@/components/tree/mdv-row-click-feature";
  import { sveltePropsFeature } from "@/components/tree/svelte-props-feature";
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
    onRenameRequest,
    newEntry,
    onSubmitNew,
    onCancelNew,
  treeVersion = 0,
  dirtyPaths = [] as string[],
  onFocusChange,
  onFocusRoot,
  pendingFocusPath = null,
  onFocusAcknowledged,
}: {
    rootPath: string;
    activePath: string | null;
    /** Clic simple sur un fichier (ou Entrée) : `onSelect(path)` — tab du bon
     *  espace (pinned slot du format sinon libre, Phase B).
     *  Alt+clic : `onSelect(path, true)` — nouvel onglet libre.
     *  Alt+Maj+clic : `onSelect(path, false, true)` — viewer libre side. */
    onSelect: (path: string, newTab?: boolean, viewer?: boolean) => void;
    onMove?: (src: string, dstParent: string) => void;
    onContextMenu?: (e: MouseEvent, entry: FileEntry, selection?: FileEntry[]) => void;
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
  /** Paths whose parent folders must be re-listed after the treeVersion bump
      (from the watcher's event or the file-op that caused it). */
  dirtyPaths?: string[];
  /** Reports the FOCUSED item (path + folder flag) on every focus change.
      The parent uses it as the creation target — the toolbar and ⌘N create
      in the focused folder / next to the focused file, never next to the
      editor's active file (VS Code semantics). `null` when nothing in this
      tree is focused (fallback: project root). */
  onFocusChange?: (path: string | null, isFolder: boolean) => void;
  /** Called when the user presses Escape: the tree focus returns to the root
      folder header. The parent should move the DOM focus there so the
      "creation target = root" is visible. */
  onFocusRoot?: () => void;
  /** Path of the item just created (VS Code semantics: after a validated
      create, the created element gets the focus). The tree waits until the
      re-listed parent makes the item visible, then focuses it and reports it
      as the tree focus. `null` = nothing pending. */
  pendingFocusPath?: string | null;
  /** Called once the pending focus landed (or was skipped) — clears the
      FileOpsManager's pendingFocusPath so it cannot fire again. */
  onFocusAcknowledged?: () => void;
} = $props();

  // Folders the user explicitly collapsed — auto-expand (active file / new entry)
  // never re-opens these.
  let userCollapsed = $state(new Set<string>());
  let loadError = $state<string | null>(null);
  let headlessTree = $state<TreeInstance<FileEntry> | null>(null);
  // Last focused item reported to the parent (see syncFocusFromTree). Initial
  // focusedItem is null → the parent falls back to the project root.
  let focusedPath = $state<string | null>(null);
  let focusedIsDir = $state(false);

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
        keyboardDragAndDropFeature,
        expandAllFeature,
        // Our shared features, outermost LAST so their prev chain wraps the
        // built-in ones: fsInvalidation adds tree.invalidatePaths(); mdvRowClick
        // implements file-manager click semantics (select only, no folder
        // toggle); mdvExpansionTracker reports the real expand/collapse
        // transitions (chevron, ArrowRight/Left, Enter, expand/collapse-all)
        // so the auto-expand effect never re-opens user-collapsed folders;
        // svelteProps remaps React prop names to Svelte.
        fsInvalidationFeature,
        mdvRowClickFeature<FileEntry>({
          onAltAction: (item) => onSelect(item.getId(), true),
          onAltShiftAction: (item) => onSelect(item.getId(), false, true),
        }),
        mdvExpansionTrackerFeature<FileEntry>((item, nowExpanded) => {
          const id = item.getId();
          if (nowExpanded) userCollapsed.delete(id);
          // The isLoading guard covers expand() no-ops: expanding a folder
          // that is currently fetching children keeps it collapsed without
          // wrongly marking it user-collapsed.
          else if (!item.isLoading()) userCollapsed.add(id);
        }),
        sveltePropsFeature,
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
        if (!item.isFolder()) onSelect(item.getId());
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
        // like VS Code. Builtin presets have no "open" action. VS Code
        // semantics: Enter on the focused row also SELECTS it (focus ≠
        // selection — arrows only move the focus, Enter bridges the two).
        customopenItem: {
          hotkey: "Enter",
          preventDefault: true,
          handler: (_e, tree) => {
            const item = tree.getFocusedItem();
            if (!item) return;
            tree.setSelectedItems([item.getId()]);
            if (item.isFolder()) {
              if (item.isExpanded()) item.collapse();
              else item.expand();
            } else {
              item.primaryAction();
            }
          },
        },
        // Native rename lives on F2 (renamingFeature preset) — we route it to
        // our own EditableRow instead of the feature's inline editing. The
        // root rename is guarded in submitRename.
        customrenameItem: {
          hotkey: "F2",
          preventDefault: true,
          handler: (_e, tree) => {
            const item = tree.getFocusedItem();
            if (!item) return;
            onRenameRequest?.(item.getId());
          },
        },
        // Escape returns the focus to the ROOT of this tree (VS Code-ish
        // "collapse to root"): clear the focused item so no row is focused,
        // report rootPath as the creation target, and ask the parent to move
        // the DOM focus to the root folder header. focusedItem must be null
        // (NOT rootItemId): the wrapper's focus-restore effect guards on a
        // truthy focusedItem and would otherwise yank the focus back to the
        // first row ~500ms later via updateDomFocus.
        // NOTE: Escape is already bound by the drag feature's `cancelDrag`,
        // but only while a drag is active (isEnabled) — the preset entry
        // then wins (presets are merged before custom hotkeys), so Escape
        // still cancels drags.
        customfocusRoot: {
          hotkey: "Escape",
          preventDefault: true,
          handler: (_e, tree) => {
            tree.applySubStateUpdate("focusedItem", () => null);
            onFocusChange?.(rootPath, true);
            onFocusRoot?.();
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
  //
  // Uses the same native mechanism as item.expand() (applySubStateUpdate on
  // "expandedItems" + rebuildTree) instead of setConfig: setConfig replaces
  // the whole config object and merges the ENTIRE state (a stale config.state
  // would clobber focusedItem etc.). applySubStateUpdate only touches the
  // expandedItems slice — the doc-recommended way to change individual state.
  //
  // CRITICAL: applySubStateUpdate routes through setExpandedItems → setState
  // → the wrapper's setState = bump() → version++ → {#key version} teardown
  // of the ENTIRE item DOM. A focused EditableRow input (new-entry / rename)
  // is destroyed by that teardown, the browser fires blur on the detached
  // input, and onblur={submit} cancels the empty new-entry row — the toolbar
  // buttons "new file"/"new folder" silently did nothing. So this effect must
  // NOT call applySubStateUpdate when the expanded set is unchanged: compute
  // `next` first, and only touch the tree state when it actually differs.
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
    const cur = tree.getState().expandedItems ?? [];
    const merged = new Set(cur);
    for (const p of target) merged.add(p);
    for (const p of userCollapsed) merged.delete(p);
    const next = [...merged];
    // Rebuild only when the expanded set actually changed. rebuildTree
    // triggers the wrapper's {#key version} re-render, which tears down the
    // DOM and drops the keyboard focus — a no-op rebuild right after a
    // chevron collapse (this effect re-runs because userCollapsed changed)
    // would kill the focus the chevron handler just restored.
    const same = next.length === cur.length && next.every((id, i) => id === cur[i]);
    if (same) return;
    tree.applySubStateUpdate("expandedItems", () => next);
    queueMicrotask(() => tree.rebuildTree());
  });

  // Reload folder listings when the FS changes externally (treeVersion bump).
  // Targeted invalidation via the fsInvalidationFeature: only the folders that
  // (may) contain the changed paths re-list, so the tree never flashes all
  // rows on a single change. See fs-invalidation-feature.ts for the rules
  // (dirname + p, full re-list on empty, optimistic native invalidation).
  $effect(() => {
    void treeVersion;
    const tree = headlessTree;
    if (!tree || treeVersion === 0) return;
    tree.invalidatePaths(dirtyPaths ?? []);
  });

  function handleRowContextMenu(e: MouseEvent, item: ItemInstance<FileEntry>) {
    // Right-clicking an unselected item selects it alone; clicking an already
    // selected item keeps the whole selection (menu acts on the selection).
    ensureContextMenuSelection(item);
    const tree = item.getTree();
    const data = item.getItemData();
    if (!data) return;
    const selection = tree
      .getSelectedItems()
      .map((i) => i.getItemData())
      .filter((d): d is FileEntry => !!d);
    onContextMenu?.(e, data, selection.length ? selection : [data]);
  }

  // Reports the focused item to the parent whenever the tree state changes.
  // headless-tree state is NOT reactive — this runs via the wrapper's
  // onStateChange (every setState → bump), reading getState().focusedItem
  // live. Equality guard: only report when the focus actually moved.
  // NOTE: the wrapper also fires for expand/collapse/selection changes; the
  // focused item read is cheap and unchanged → no report, no parent re-render.
  function syncFocusFromTree() {
    const tree = headlessTree;
    if (!tree) return;
    const id = tree.getState().focusedItem;
    let isDir = false;
    if (id) {
      const item = tree.getItemInstance(id);
      isDir = !!item?.isFolder();
    }
    if (id !== focusedPath || isDir !== focusedIsDir) {
      focusedPath = id;
      focusedIsDir = isDir;
      onFocusChange?.(id, isDir);
    }
    // Focus the item just created (pendingFocusPath): the creation commits →
    // onTreeChange → invalidatePaths re-lists the parent → this bump runs
    // with the new item present in getItems(). Focus it in the next microtask
    // so we are outside the bump's synchronous setState chain (calling
    // setFocused here would re-enter applySubStateUpdate mid-bump).
    const target = pendingFocusPath;
    if (!target) return;
    if (tree.getState().focusedItem === target) {
      // Already focused (a second bump while pending was still set) — ack so
      // the manager clears the stale pending.
      onFocusAcknowledged?.();
      return;
    }
    if (!tree.getItems().some((i) => i.getId() === target)) return; // not rendered yet
    queueMicrotask(() => {
      const t = headlessTree;
      if (!t) return;
      const item = t.getItemInstance(target);
      if (!item) return;
      // item.setFocused() is the ONLY state-mutating focus API in this
      // version: tree.setFocusedItem() routes through makeStateUpdater whose
      // updater the main setState ignores (it only fires the bump). The item
      // instance is created on demand — it exists because getItems() has it.
      item.setFocused();
      // DOM focus on the row + report straight to the parent (no rebuildTree:
      // no focus-driven row classes need a re-render, and the next bump would
      // re-read the same focusedItem anyway).
      t.updateDomFocus();
      onFocusChange?.(target, item.isFolder());
      onFocusAcknowledged?.();
    });
  }

  // Rule "Escape during a pending create/rename cancels the action, nothing
  // else": after the keyboard cancel (Escape / Enter on empty) the EditableRow
  // input is destroyed and the DOM focus falls to <body>. Put it back on the
  // row that was focused before the action — "the focus stays at its last
  // position". If nothing was focused (focusedItem null), do nothing at all.
  // The blur path (user clicked away) never calls this — the click target
  // must keep the focus.
  function restoreTreeFocus() {
    queueMicrotask(() => {
      const t = headlessTree;
      if (!t) return;
      if (!t.getState().focusedItem) return;
      t.updateDomFocus();
    });
  }
</script>

<HeadlessTree
  {config}
  label={rootPath}
  onTree={(t) => {
    headlessTree = t;
  }}
  onStateChange={syncFocusFromTree}
>
  {#snippet children(item: ItemInstance<FileEntry>)}
    {#if editingPath === item.getId() && onSubmitRename && onCancelEdit}
      <EditableRow
        depth={item.getItemMeta().level + 1}
        kind={item.isFolder() ? "folder" : "file"}
        initialValue={item.getItemName()}
        onSubmit={(name) => onSubmitRename(item.getId(), name)}
        onCancel={(viaKeyboard) => {
          onCancelEdit?.();
          if (viaKeyboard) restoreTreeFocus();
        }}
      />
    {:else if item.isFolder()}
      <div
        class="mdv-tree__rowline"
        style="padding-left:{8 + (item.getItemMeta().level + 1) * 12}px"
      >
        <button
          type="button"
          tabindex="-1"
          class="mdv-tree__chevron-btn{item.isExpanded() ? ' is-open' : ''}"
          aria-label={item.isExpanded() ? "Collapse folder {item.getItemName()}" : "Expand folder {item.getItemName()}"}
          onclick={(e) => {
            // The chevron is the ONLY click toggle for folders — a plain row
            // click only selects (mdvRowClickFeature). stopPropagation keeps
            // the li's onClick (which would select & focus) from firing, so
            // chevron clicks toggle without touching the selection.
            e.stopPropagation();
            if (item.isExpanded()) item.collapse();
            else item.expand();
            // Keep the folder focused (no selection) so the ArrowRight/Left
            // hotkeys continue working after the wrapper's {#key version}
            // re-render drops the button from the DOM.
            item.setFocused();
            item.getTree().updateDomFocus();
          }}
        >
          <i class="wxi-chevron-right" style="font-size:12px"></i>
        </button>
        <button
          type="button"
          tabindex="-1"
          class="mdv-tree__row mdv-tree__row--folder{item.isSelected() ? ' is-selected' : ''}{item.isDragTarget() ? ' is-drop-target' : ''}"
          oncontextmenu={(e) => handleRowContextMenu(e, item)}
          title={item.getItemName()}
        >
          <span class="mdv-tree__icon">
            <i class={item.isExpanded() ? 'wxi-folder-open' : 'wxi-folder'} style="font-size:13px"></i>
          </span>
          <span class="mdv-tree__name">{item.getItemName()}</span>
        </button>
      </div>
      {#if newEntry && newEntry.parent === item.getId() && onSubmitNew && onCancelNew}
        <EditableRow
          depth={item.getItemMeta().level + 2}
          kind={newEntry.kind}
          initialValue=""
          onSubmit={(name) => onSubmitNew(newEntry.parent, newEntry.kind, name)}
          onCancel={(viaKeyboard) => {
            onCancelNew?.();
            if (viaKeyboard) restoreTreeFocus();
          }}
        />
      {/if}
    {:else}
      <button
        type="button"
        tabindex="-1"
        class="mdv-tree__row mdv-tree__row--file{activePath === item.getId() ? ' is-active' : ''}{stagedPaths.includes(item.getId()) ? ' is-staged' : ''}{item.isSelected() ? ' is-selected' : ''}{onToggleFavorite ? ' has-fav' : ''}"
        style="padding-left:{12 + (item.getItemMeta().level + 1) * 12}px"
        oncontextmenu={(e) => handleRowContextMenu(e, item)}
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
          onCancel={(viaKeyboard) => {
            onCancelNew?.();
            if (viaKeyboard) restoreTreeFocus();
          }}
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
