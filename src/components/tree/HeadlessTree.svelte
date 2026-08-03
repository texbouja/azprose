<script lang="ts" generics="T extends object">
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import { createTree, type ItemInstance, type TreeConfig, type TreeInstance } from "@headless-tree/core";
  import { containerProps, registerItem, rowProps } from "./headless-utils";

  let {
    config,
    onTree,
    onRowClick,
    label,
    className = "mdv-tree",
    children,
    prependItems,
    empty,
    loading = "loading…",
  }: {
    /** Stable tree config. The component is meant to be keyed by the parent when the root/data changes. */
    config: TreeConfig<T>;
    /** Called once the tree instance exists (for external state sync like auto-expand). */
    onTree?: (tree: TreeInstance<T>) => void;
    /** Custom row click (multi-select aware). Replaces the feature onClick chain. */
    onRowClick?: (e: MouseEvent, item: ItemInstance<T>) => void;
    label?: string;
    className?: string;
    /** Renders the content of each treeitem `<li>`. */
    children: Snippet<[ItemInstance<T>]>;
    /** Extra rows rendered before the items (e.g. a "new entry" row at the root). */
    prependItems?: Snippet;
    /** Rendered when the tree is loaded but empty. */
    empty?: Snippet;
    loading?: string;
  } = $props();

  let version = $state(0);
  const bump = () => {
    // `version++` compiles to a read followed by a write. Called synchronously
    // from inside the mount $effect (via `rebuildTree` → `setState`), the read
    // would register the effect as a dependency of `version`; the write would
    // then re-schedule it (Svelte's self-invalidation guard) → infinite loop →
    // `effect_update_depth_exceeded`. `untrack` keeps the write reactive for the
    // deriveds (`items`/`isLoading`/…) which read `version` outside any effect,
    // but stops the mount effect from depending on it.
    untrack(() => {
      version++;
    });
  };

  let tree = $state(createTree<T>({ ...config, setState: bump }));

  $effect(() => {
    onTree?.(tree);
  });

  let containerEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    tree.setMounted(true);
    tree.rebuildTree();
    const el = containerEl;
    if (el) tree.registerElement(el);
    return () => {
      tree.registerElement(null);
      tree.setMounted(false);
    };
  });

  let items = $derived.by(() => {
    void version;
    return tree.getItems();
  });

  let isLoading = $derived.by(() => {
    void version;
    const loadingIds = tree.getState().loadingItemChildrens;
    return Array.isArray(loadingIds) && loadingIds.includes(tree.getConfig().rootItemId);
  });

  let dragLineStyle = $derived.by(() => {
    void version;
    // getDragLineStyle exists only when dragAndDropFeature is part of the
    // config (file explorer). Journal/calendar trees don't include it.
    if (typeof tree.getDragLineStyle !== "function") return "";
    const s = tree.getDragLineStyle();
    if (s.display === "none") return "";
    return [
      `position:${s.position}`,
      `top:${s.top}`,
      `left:${s.left}`,
      `width:${s.width}`,
      "pointer-events:none",
    ].join(";");
  });
</script>

<div bind:this={containerEl} class={className} {...containerProps(tree, label)}>
  {#if prependItems}
    {@render prependItems()}
  {/if}
  {#if items.length === 0}
    {#if isLoading}
      <div class="mdv-tree__loading">{loading}</div>
    {:else if empty}
      {@render empty()}
    {:else}
      <div class="mdv-tree__empty">{loading}</div>
    {/if}
  {:else}
    {#each items as item (item.getId())}
      <li
        class="mdv-tree__item"
        use:registerItem={item}
        {...rowProps(item, (e) => onRowClick?.(e, item))}
      >
        {@render children(item)}
      </li>
    {/each}
  {/if}
  {#if dragLineStyle}
    <div class="mdv-tree__dragline" style={dragLineStyle}></div>
  {/if}
</div>
