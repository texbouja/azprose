<script lang="ts" generics="T extends object">
  // Contrat CSS du vocabulaire de rangée (vague 3, phase 3.1) : base commune
  // de file-tree.svelte (donc de RootFolder ET de la liste déroulante de
  // Breadcrumb) et de sidebar/virtual-tree.svelte (journal) — favorites.svelte
  // rend ses propres lignes sans passer par ce composant, elle importe la
  // même feuille de son côté (voir son en-tête).
  import "@/styles/files/sidebar-tree.css";
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import { createTree, type ItemInstance, type TreeConfig, type TreeInstance } from "@headless-tree/core";
  import { registerItem } from "./headless-utils";

  let {
    config,
    onTree,
    onStateChange,
    label,
    className = "mdv-tree",
    children,
    prependItems,
    empty,
    loading = "loading…",
    emptyLabel = "empty",
  }: {
    /** Stable tree config. The component is meant to be keyed by the parent when the root/data changes. */
    config: TreeConfig<T>;
    /** Called once the tree instance exists (for external state sync like auto-expand). */
    onTree?: (tree: TreeInstance<T>) => void;
    /** Called after EVERY state change (focus, selection, expansion…), from
        the same `bump()` that re-renders the items. The headless-tree state
        is NOT reactive on its own — this is the only signal parents can
        subscribe to for external sync (e.g. reporting the focused item). */
    onStateChange?: (tree: TreeInstance<T>) => void;
    label?: string;
    className?: string;
    /** Renders the content of each treeitem `<li>`. */
    children: Snippet<[ItemInstance<T>]>;
    /** Extra rows rendered before the items (e.g. a "new entry" row at the root). */
    prependItems?: Snippet;
    /** Rendered when the tree is loaded but empty. */
    empty?: Snippet;
    loading?: string;
    /** Repli textuel quand la liste est vide, NI en chargement NI couverte
     *  par `empty` — un caller qui omet `empty` ne doit jamais voir le texte
     *  `loading` réutilisé pour un état qui ne charge plus (bug constaté :
     *  virtual-tree.svelte, sans `empty`, affichait « loading… » à l'infini
     *  pour un dossier journal réellement vide). */
    emptyLabel?: string;
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
      // Same untrack rationale: `tree` is a $state read, and bump() may be
      // called from inside an effect (auto-expand). Reading it inside the
      // untrack keeps that effect free of the dependency.
      onStateChange?.(tree);
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
    // Spread into a NEW array: headless-tree caches the itemInstances array,
    // so returning it directly would give Svelte the same reference on every
    // state change (selection, focus, search…) — the derived would compare
    // equal and the DOM would never re-render (a stale tree is exactly what
    // the pre-refactor multi-select bug looked like).
    return [...tree.getItems()];
  });

  // After every re-render ({#key version}) restore the keyboard focus on the
  // focused item. The bundle hotkey handlers already call updateDomFocus
  // (focusNextItem/focusPreviousItem/collapseOrUp/…), so arrow navigation is
  // covered — but OTHER rebuilds are not: the auto-expand effect
  // (applySubStateUpdate + rebuildTree via queueMicrotask) destroys the
  // focused <li> and the DOM focus falls back to <body>, silently killing
  // the container hotkeys. This effect catches that case.
  // Guards: (1) never auto-focus before the user has focused something
  // (focusedItem set); (2) only steal the focus back when it actually fell to
  // <body>/<html> — an input being edited inside the tree, a toolbar button,
  // or the main editor must keep the focus.
  $effect(() => {
    void version;
    const t = tree;
    if (!t?.getState()?.focusedItem) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) return;
    queueMicrotask(() => t.updateDomFocus?.());
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

<div bind:this={containerEl} class={className} {...tree.getContainerProps(label)}>
  {#if prependItems}
    {@render prependItems()}
  {/if}
  {#if items.length === 0}
    {#if isLoading}
      <div class="mdv-tree__loading">{loading}</div>
    {:else if empty}
      {@render empty()}
    {:else}
      <div class="mdv-tree__empty">{emptyLabel}</div>
    {/if}
  {:else}
    {#key version}
      {#each items as item (item.getId())}
        <li
          class="mdv-tree__item"
          data-version={version}
          use:registerItem={item}
          {...item.getProps()}
        >
          {@render children(item)}
        </li>
      {/each}
    {/key}
  {/if}
  {#if dragLineStyle}
    <div class="mdv-tree__dragline" style={dragLineStyle}></div>
  {/if}
</div>
