import type { FeatureImplementation, ItemInstance } from "@headless-tree/core";

/**
 * Reports folder expand/collapse transitions to the consumer.
 *
 * The plain row click no longer toggles folders (see mdvRowClickFeature), so
 * the only ways to expand/collapse are: the row chevron, the
 * ArrowRight/ArrowLeft hotkeys, the Enter "open" hotkey and the
 * expand/collapse-all context menu actions. All of them funnel through
 * `item.expand()` / `item.collapse()`, which this feature wraps.
 *
 * Programmatic expansions that must NOT be reported (e.g. the auto-expand
 * effect in file-tree.svelte) bypass the item API and mutate `expandedItems`
 * directly via `applySubStateUpdate`, so they never reach this wrapper.
 *
 * The report is filtered to REAL transitions (checked after `prev?.()`), so
 * no-op calls (expand while still loading, collapse of an already collapsed
 * folder, non-folder items) are not reported.
 */
export const mdvExpansionTrackerFeature = <T>(
  onToggle: (item: ItemInstance<T>, nowExpanded: boolean) => void,
): FeatureImplementation<T> => ({
  key: "mdvExpansionTracker",
  itemInstance: {
    expand: ({ item, prev }) => {
      prev?.();
      if (item.isExpanded()) onToggle(item, true);
    },
    collapse: ({ item, prev }) => {
      prev?.();
      if (!item.isExpanded()) onToggle(item, false);
    },
  },
});
