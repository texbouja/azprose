import type { FileEntry } from "@/lib";

export type ContextMenuItem =
  | {
      label: string;
      icon?: string;
      /** Extra CSS applied to the icon `<i>` (e.g. rotation for a mirrored
          glyph: `"transform:rotate(180deg)"`). */
      iconStyle?: string;
      onSelect: () => void;
      disabled?: boolean;
      hint?: string;
      destructive?: boolean;
    }
  | "divider";

export type ContextMenuTarget = {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
};

function createContextMenu() {
  let target = $state<ContextMenuTarget | null>(null);
  let items = $state<ContextMenuItem[]>([]);

  return {
    get target() { return target; },
    get items() { return items; },
    /** Opens the menu. `e.preventDefault()` suppresses the native webview
        context menu (Reload / Inspect Element…) so our menu is the ONLY one —
        this was a reported bug on the FS tree rows. */
    open(e: MouseEvent, entry: FileEntry, menuItems: ContextMenuItem[]) {
      e.preventDefault();
      e.stopPropagation();
      target = { x: e.clientX, y: e.clientY, path: entry.path, isDir: entry.isDir };
      items = menuItems;
    },
    /** Ouvre le menu sur des items arbitraires, SANS cible fichier (le fil de
     *  l'assistant, par exemple). Même sémantique d'événement que open() ;
     *  le rendu ne lit que x/y/items — les champs path/isDir du target y sont
     *  indifférents. */
    openItems(e: MouseEvent, menuItems: ContextMenuItem[]) {
      e.preventDefault();
      e.stopPropagation();
      target = { x: e.clientX, y: e.clientY, path: "", isDir: false };
      items = menuItems;
    },
    close() { target = null; items = []; },
  };
}

export const contextMenu = createContextMenu();
