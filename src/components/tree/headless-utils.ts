import type { ItemInstance } from "@headless-tree/core";
import { dirname } from "@/lib/paths-utils";

/** MIME type used for file-tree drag & drop payloads (moved from folder-node.svelte). */
export const DRAG_MIME = "application/x-azprose-path";

/** True when `child` equals `parent` or lives under it (moved from folder-node.svelte). */
export function isDescendantPath(child: string, parent: string): boolean {
  if (child === parent) return true;
  const sep = parent.includes("\\") ? "\\" : "/";
  const prefix = parent.endsWith(sep) ? parent : parent + sep;
  return child.startsWith(prefix);
}

/**
 * Ancestor paths strictly between `root` (excluded) and `path` (excluded).
 * `root/a/b/c` with root `root` → `["root/a", "root/a/b"]`. These are the
 * folders that must stay expanded so the target file is visible.
 */
export function ancestorPaths(path: string, root: string): string[] {
  const out: string[] = [];
  let cur = dirname(path);
  const sep = root.includes("\\") ? "\\" : "/";
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  while (cur !== root && cur.startsWith(rootPrefix)) {
    out.unshift(cur);
    const next = dirname(cur);
    if (next === cur) break;
    cur = next;
  }
  return out;
}

/**
 * Svelte action pairing a row element with its headless-tree item.
 * Use: `<li use:registerItem={item} …>`.
 */
export function registerItem<T>(node: HTMLElement, item: ItemInstance<T>) {
  item.registerElement(node);
  return {
    destroy() {
      item.registerElement(null);
    },
  };
}

/**
 * Right-click selection semantics shared by our trees: right-clicking an
 * unselected item selects it alone; an already selected item keeps the whole
 * selection (the context menu then acts on the whole selection).
 */
export function ensureContextMenuSelection<T>(item: ItemInstance<T>): void {
  if (!item.isSelected()) item.getTree().setSelectedItems([item.getId()]);
}
