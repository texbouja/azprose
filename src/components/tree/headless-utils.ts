import type { ItemInstance, TreeInstance } from "@headless-tree/core";
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

const EVENT_KEY_RE = /^on[A-Z]/;

/**
 * Svelte 5 spread props require lowercase DOM event names (`onClick` → `onclick`);
 * camelCase keys in a `{...props}` spread would be set as plain attributes.
 * Also strips the `ref` key (handled via `use:registerItem` / `bind:this`).
 */
export function normalizeEventKeys(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "ref") continue;
    if (EVENT_KEY_RE.test(key) && typeof value === "function") {
      out[key.toLowerCase()] = value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Props for a tree row (the `treeitem` element): `role`, aria attributes,
 * `tabIndex`, `draggable` + drag handlers from the features, with `ref`
 * stripped and event keys normalized for Svelte. `onClick` is overridden so
 * callers can supply their own multi-select aware click handler.
 */
export function rowProps<T>(
  item: ItemInstance<T>,
  onClick?: (e: MouseEvent) => void,
): Record<string, unknown> {
  const props = item.getProps();
  if (onClick) props.onClick = onClick;
  return normalizeEventKeys(props);
}

/** Props for the tree container (`role="tree"`, dnd handlers, `position: relative`). */
export function containerProps<T>(tree: TreeInstance<T>, label?: string): Record<string, unknown> {
  return normalizeEventKeys(tree.getContainerProps(label ?? ""));
}
