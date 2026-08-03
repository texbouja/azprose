import type { AsyncDataLoaderDataRef, FeatureImplementation } from "@headless-tree/core";
import { dirname } from "@/lib/paths-utils";

/**
 * Targeted FS invalidation for the file explorer.
 *
 * Exposes `tree.invalidatePaths(paths)` — the native, doc-recommended way
 * to refresh the cached children of affected folders after external file
 * operations (see the "Handling external state updates" recipe):
 *
 * - `dirname(p)` covers every parent folder of a changed path (create at
 *   root, delete, rename, move all include the parent); adding `p` itself
 *   covers a (re)created folder with stale children. The root needs no
 *   special-case — it is always some path's dirname.
 * - An empty `paths` list falls back to a full re-list of every folder we
 *   have loaded children for.
 * - Folders that were never loaded are left alone: they fetch fresh
 *   whenever they are first expanded, so no wasted listFolder for
 *   collapsed subtrees.
 *
 * Uses the native optimistic invalidation (`item.invalidateChildrenIds(true)`):
 * the old children stay visible while the refetch runs in the background and
 * the tree calls rebuildTree() itself once the new data arrives — no loading
 * flash, no manual dataRef/childrenIds mutation (that ref is @internal).
 *
 * The tree-instance method is declared via module augmentation so callers
 * get a typed `tree.invalidatePaths(...)`. The runtime method only exists
 * when this feature is part of the tree config (file explorer).
 */
declare module "@headless-tree/core" {
  export interface TreeInstance<T> {
    /** Re-list the folders affected by `paths` (optimistic, no loading flash). */
    invalidatePaths: (paths: string[]) => void;
  }
}

export const fsInvalidationFeature: FeatureImplementation = {
  key: "fsInvalidation",
  treeInstance: {
    invalidatePaths: ({ tree }, paths) => {
      const ref = tree.getDataRef<AsyncDataLoaderDataRef<unknown>>();
      const dirs = new Set<string>();
      if (paths?.length) {
        for (const p of paths) {
          dirs.add(dirname(p));
          dirs.add(p); // p itself may be a (re)created folder with stale children
        }
      } else {
        // Full re-list: every folder we have loaded children for.
        for (const d of Object.keys(ref.current.childrenIds)) dirs.add(d);
      }
      for (const d of dirs) {
        if (ref.current.childrenIds[d]) {
          void tree.getItemInstance(d).invalidateChildrenIds(true);
        }
      }
    },
  },
};
