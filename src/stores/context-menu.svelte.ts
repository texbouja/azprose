import type { FileEntry } from "@/lib";

export type ContextMenuTarget = {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
};

function createContextMenu() {
  let target = $state<ContextMenuTarget | null>(null);

  return {
    get target() { return target; },
    open(e: MouseEvent, entry: FileEntry) {
      target = { x: e.clientX, y: e.clientY, path: entry.path, isDir: entry.isDir };
    },
    close() { target = null; },
  };
}

export const contextMenu = createContextMenu();
