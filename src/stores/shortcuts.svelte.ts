import { IS_MAC } from "@/lib/platform";
import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

export type ShortcutAction =
  | "save"
  | "commandPalette"
  | "sidebar"
  | "openFile"
  | "newFile"
  | "openFolder"
  | "undoFileOp"
  | "fullscreen"
  | "exportPdf"
  | "help"
  | "build"
  | "editorMode1"
  | "editorMode2"
  | "editorMode3"
  | "console"
  | "viewPanel"
  | "settings";

/** Mac-style glyph label (displayed in UI). */
export type ShortcutDef = { key: string; shift?: boolean; alt?: boolean; ctrl?: boolean };

/** Default shortcuts per platform. */
const MAC_DEFAULTS: Record<ShortcutAction, ShortcutDef> = {
  save:          { key: "s" },
  commandPalette: { key: "p", shift: true },
  sidebar:       { key: "b" },
  openFile:      { key: "o" },
  newFile:       { key: "n" },
  openFolder:    { key: "o", shift: true },
  undoFileOp:    { key: "z", alt: true },
  fullscreen:    { key: "f", ctrl: true },
  exportPdf:     { key: "p" },
  help:          { key: "/" },
  build:         { key: "b", alt: true },
  editorMode1:   { key: "1" },
  editorMode2:   { key: "2" },
  editorMode3:   { key: "3" },
  console:       { key: "c", shift: true },
  viewPanel:     { key: "\\" },
  settings:      { key: "," },
};

const OTHER_DEFAULTS: Record<ShortcutAction, ShortcutDef> = {
  save:          { key: "s" },
  commandPalette: { key: "p", shift: true },
  sidebar:       { key: "b" },
  openFile:      { key: "o" },
  newFile:       { key: "n" },
  openFolder:    { key: "o", shift: true },
  undoFileOp:    { key: "z", alt: true },
  fullscreen:    { key: "F11" },
  exportPdf:     { key: "p" },
  help:          { key: "/" },
  build:         { key: "b", alt: true },
  editorMode1:   { key: "1" },
  editorMode2:   { key: "2" },
  editorMode3:   { key: "3" },
  console:       { key: "c", shift: true },
  viewPanel:     { key: "\\" },
  settings:      { key: "," },
};

function defaults(): Record<ShortcutAction, ShortcutDef> {
  return IS_MAC ? { ...MAC_DEFAULTS } : { ...OTHER_DEFAULTS };
}

function createShortcuts() {
  const stored = persistedState<Partial<Record<ShortcutAction, ShortcutDef>>>(
    STORAGE_KEYS.shortcuts,
    {},
  );

  function getDef(action: ShortcutAction): ShortcutDef {
    return stored.current[action] ?? defaults()[action];
  }

  /** Check whether a KeyboardEvent matches a given action. */
  function matches(e: KeyboardEvent, action: ShortcutAction): boolean {
    const def = getDef(action);
    // For F-keys the key is the whole string (e.g. "F11")
    const isSpecial = def.key.startsWith("F") || def.key === "Escape" || def.key === "Tab";
    const keyMatch = isSpecial ? e.key === def.key : e.key.toLowerCase() === def.key.toLowerCase();
    const modKey = IS_MAC ? e.metaKey : e.ctrlKey;
    const shiftMatch = def.shift ? e.shiftKey : !e.shiftKey;
    const altMatch = def.alt ? e.altKey : !e.altKey;
    // On non-Mac, "ctrl" in the def means Ctrl (e.g. Ctrl+Cmd+F equivalent)
    const ctrlMatch = IS_MAC ? (def.ctrl ? e.ctrlKey : !e.ctrlKey) : true;
    return keyMatch && modKey && shiftMatch && altMatch && ctrlMatch;
  }

  /** Human-readable glyph string for display (Mac glyphs). */
  function toLabel(action: ShortcutAction): string {
    const def = getDef(action);
    const parts: string[] = [];
    if (IS_MAC) {
      if (def.ctrl) parts.push("⌃");
      parts.push("⌘");
      if (def.shift) parts.push("⇧");
      if (def.alt) parts.push("⌥");
    } else {
      if (def.shift) parts.push("Shift+");
    }
    // Capitalize key
    const k = def.key.length === 1 ? def.key.toUpperCase() : def.key;
    parts.push(k);
    return parts.join(IS_MAC ? "" : "Ctrl+");
  }

  return {
    get def() { return stored.current; },
    getDef,
    matches,
    toLabel,
    reset(action?: ShortcutAction) {
      if (action) {
        const { [action]: _, ...rest } = stored.current;
        stored.current = rest;
      } else {
        stored.current = {};
      }
    },
    set(action: ShortcutAction, def: ShortcutDef) {
      stored.current = { ...stored.current, [action]: def };
    },
  };
}

export const shortcuts = createShortcuts();
