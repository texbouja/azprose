<script lang="ts">
  import {
    expandAllFeature,
    hotkeysCoreFeature,
    selectionFeature,
    syncDataLoaderFeature,
    type ItemInstance,
    type TreeConfig,
  } from "@headless-tree/core";
  import HeadlessTree from "@/components/tree/HeadlessTree.svelte";
  import { basename, joinPath, type FileEntry } from "@/lib";
  import { ensureContextMenuSelection } from "@/components/tree/headless-utils";
  import { mdvRowClickFeature } from "@/components/tree/mdv-row-click-feature";
  import { sveltePropsFeature } from "@/components/tree/svelte-props-feature";
  import { contextMenu, type ContextMenuItem } from "@/stores/context-menu.svelte";
  import { getT, language } from "@/lib/i18n";

  type VNode = {
    name: string;
    path: string;
    isDir: boolean;
    kind: "year" | "month" | "note";
  };

  let {
    noteDates,
    rootPath,
    activePath,
    onSelect,
    onDelete,
    scrollToPath,
  }: {
    noteDates: Set<string>;
    rootPath: string | null;
    activePath: string | null;
    /** Clic simple (ou Entrée) : `onSelect(path)` — tab actif. Alt+clic :
     *  `onSelect(path, true)` — nouvel onglet. */
    onSelect: (path: string, newTab?: boolean, viewer?: boolean) => void;
    onDelete?: (entry: FileEntry) => void;
    scrollToPath: string | null;
  } = $props();

  let t = $derived(getT($language));

  const MONTH_LABELS = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];

  interface BuiltTree {
    dataById: Map<string, VNode>;
    childrenById: Map<string, string[]>;
    expanded: string[];
  }

  /** Builds the in-memory Year → Month → Note hierarchy once per data change. */
  function buildTree(root: string, dates: Set<string>): BuiltTree {
    const dataById = new Map<string, VNode>();
    const childrenById = new Map<string, string[]>();
    const years = new Map<string, Map<string, string[]>>();

    for (const date of dates) {
      const [y, m, d] = date.split("-");
      if (!y || !m || !d) continue;
      const notePath = joinPath(root, `${date}.md`);
      dataById.set(notePath, { name: `${date}.md`, path: notePath, isDir: false, kind: "note" });
      const yearPath = joinPath(root, y);
      if (!years.has(y)) {
        years.set(y, new Map());
        dataById.set(yearPath, { name: y, path: yearPath, isDir: true, kind: "year" });
      }
      const months = years.get(y)!;
      const monthPath = joinPath(yearPath, m);
      if (!months.has(m)) {
        months.set(m, []);
        const label = MONTH_LABELS[parseInt(m, 10) - 1] ?? m;
        dataById.set(monthPath, { name: label, path: monthPath, isDir: true, kind: "month" });
      }
      months.get(m)!.push(notePath);
    }

    const expanded: string[] = [];
    const yearIds = [...years.keys()].sort((a, b) => b.localeCompare(a));
    // children are keyed by their full PATH in both dataById and childrenById
    // (getItem/getChildren look up by item id = path); the bare year would be
    // an id that exists nowhere → the year node could never expand.
    childrenById.set(root, yearIds.map((y) => joinPath(root, y)));
    for (const y of yearIds) {
      const yearPath = joinPath(root, y);
      const months = years.get(y)!;
      const monthIds = [...months.keys()].sort((a, b) => b.localeCompare(a));
      // Same path-keyed children as above: bare month numbers would be ids
      // that exist nowhere (getItem/getChildren key by full path).
      childrenById.set(yearPath, monthIds.map((m) => joinPath(yearPath, m)));
      expanded.push(yearPath);
      for (const m of monthIds) {
        const monthPath = joinPath(yearPath, m);
        const notes = months.get(m)!.sort((a, b) => a.localeCompare(b));
        childrenById.set(monthPath, notes);
        expanded.push(monthPath);
      }
    }

    return { dataById, childrenById, expanded };
  }

  function buildConfig(root: string, dates: Set<string>): TreeConfig<VNode> {
    const { dataById, childrenById, expanded } = buildTree(root, dates);
    return {
      rootItemId: root,
      state: { expandedItems: expanded, focusedItem: null },
      features: [
        hotkeysCoreFeature,
        selectionFeature,
        syncDataLoaderFeature,
        expandAllFeature,
        // Native row click chain (selection + main) with the modifier guard,
        // remapped to Svelte prop names — see file-tree.svelte for the same
        // trio. No onFolderToggle here: the journal has no user-collapsed
        // tracking (all months stay expanded until manually collapsed).
        mdvRowClickFeature<VNode>({
          onAltAction: (item) => onSelect(item.getId(), true),
          onShiftAction: (item) => onSelect(item.getId(), false, true),
        }),
        sveltePropsFeature,
      ],
      dataLoader: {
        getItem: (id) =>
          dataById.get(id) ?? { name: basename(id), path: id, isDir: true, kind: "month" },
        getChildren: (id) => childrenById.get(id) ?? [],
      },
      getItemName: (item) => item.getItemData()?.name ?? basename(item.getId()),
      isItemFolder: (item) => item.getItemData()?.isDir ?? false,
      onPrimaryAction: (item) => {
        if (!item.isFolder()) onSelect(item.getId());
      },
      // Same VS Code semantics as the file tree: Enter on the focused row
      // also selects it (focus ≠ selection — arrows only move the focus).
      hotkeys: {
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
      },
      indent: 12,
    };
  }

  // The config + key derive from the note dates: any rescan changes the key,
  // remounting the tree with a fresh hierarchy (same pattern as the explorer
  // where the parent keys by rootPath).
  let config = $derived(rootPath ? buildConfig(rootPath, noteDates) : null);
  let treeKey = $derived(
    rootPath ? `${rootPath}\u0000${[...noteDates].sort().join("\u0000")}` : "",
  );

  let containerEl: HTMLDivElement | undefined = $state();

  function handleRowContextMenu(e: MouseEvent, item: ItemInstance<VNode>) {
    // Same selection semantics as the explorer: right-clicking an unselected
    // item selects it alone; an already selected item keeps the selection.
    ensureContextMenuSelection(item);
    const data = item.getItemData();
    if (!data) return;
    const entry: FileEntry = { name: data.name, path: data.path, isDir: data.isDir };
    const root = rootPath ?? "";
    const rel = (p: string) =>
      p.startsWith(root + "/") ? p.slice(root.length + 1) : p;

    const menu: ContextMenuItem[] = [];
    if (data.isDir) {
      menu.push(
        {
          label: t("menu.expandAll"),
          icon: "wxi-expand",
          onSelect: () => void item.expandAll(),
        },
        {
          label: t("menu.collapseAll"),
          // Mirror of the expand glyph (lucide expand/collapse).
          icon: "wxi-expand",
          iconStyle: "transform:rotate(180deg)",
          onSelect: () => void item.collapseAll(),
        },
        "divider",
        {
          label: t("menu.copyPath"),
          icon: "wxi-copy",
          onSelect: () => void navigator.clipboard.writeText(data.path),
        },
      );
    } else {
      menu.push(
        {
          label: t("menu.copyPath"),
          icon: "wxi-copy",
          onSelect: () => void navigator.clipboard.writeText(data.path),
        },
        {
          label: t("menu.copyRelativePath"),
          icon: "wxi-content-copy",
          onSelect: () => void navigator.clipboard.writeText(rel(data.path)),
        },
        "divider",
        {
          label: t("menu.delete"),
          icon: "wxi-trash-2",
          destructive: true,
          onSelect: () => onDelete?.(entry),
        },
      );
    }
    contextMenu.open(e, entry, menu);
  }

  // Scroll the freshly created / selected note into view. Re-runs after a
  // remount (new note added → noteDates changed → treeKey changed).
  $effect(() => {
    if (!scrollToPath) return;
    void treeKey;
    requestAnimationFrame(() => {
      const el = containerEl?.querySelector(
        `[data-path="${CSS.escape(scrollToPath!)}"]`,
      ) as HTMLElement | null;
      if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  });
</script>

<div class="mdv-vtree" bind:this={containerEl}>
  {#if config && treeKey}
    {#key treeKey}
      <HeadlessTree
        {config}
        label={rootPath ?? ""}
        className="mdv-tree mdv-vtree__tree"
      >
        {#snippet children(item: ItemInstance<VNode>)}
          {#if item.isFolder()}
            <div
              class="mdv-tree__rowline"
              style="padding-left:{8 + (item.getItemMeta().level + 1) * 12}px"
            >
              <button
                type="button"
                tabindex="-1"
                class="mdv-tree__chevron-btn{item.isExpanded() ? ' is-open' : ''}"
                aria-label={item.isExpanded() ? "Collapse {item.getItemName()}" : "Expand {item.getItemName()}"}
                onclick={(e) => {
                  // The chevron is the ONLY click toggle for folders — a plain
                  // row click only selects (mdvRowClickFeature). The journal
                  // keeps no userCollapsed tracking: expanded state is derived
                  // from the in-memory buildTree defaults on every remount.
                  e.stopPropagation();
                  if (item.isExpanded()) item.collapse();
                  else item.expand();
                  // Keep the folder focused (no selection) so the ArrowRight/
                  // Left hotkeys keep working after the re-render.
                  item.setFocused();
                  item.getTree().updateDomFocus();
                }}
              >
                <i class="wxi-chevron-right" style="font-size:12px"></i>
              </button>
              <button
                type="button"
                tabindex="-1"
                class="mdv-tree__row mdv-tree__row--folder{item.isSelected() ? ' is-selected' : ''}"
                oncontextmenu={(e) => handleRowContextMenu(e, item)}
                title={item.getId()}
              >
                <span class="mdv-tree__icon">
                  <i class={item.isExpanded() ? 'wxi-folder-open' : 'wxi-folder'} style="font-size:13px"></i>
                </span>
                <span class="mdv-tree__name">{item.getItemName()}</span>
              </button>
            </div>
          {:else}
            <button
              type="button"
              tabindex="-1"
              class="mdv-tree__row mdv-tree__row--file{activePath === item.getId() ? ' is-active' : ''}{item.isSelected() ? ' is-selected' : ''}"
              style="padding-left:{12 + (item.getItemMeta().level + 1) * 12}px"
              data-path={item.getId()}
              oncontextmenu={(e) => handleRowContextMenu(e, item)}
              title={item.getId()}
            >
              <span class="mdv-tree__icon">
                <i class="wxi-file-text" style="font-size:13px"></i>
              </span>
              <span class="mdv-tree__name">{item.getItemName()}</span>
            </button>
          {/if}
        {/snippet}
      </HeadlessTree>
    {/key}
  {:else}
    <div class="mdv-tree__empty">no notes yet</div>
  {/if}
</div>
