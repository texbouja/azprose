import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

export type DefaultEditorMode = "prose" | "raw";

function createGeneralSettings() {
  const mode = persistedState<DefaultEditorMode>(STORAGE_KEYS.defaultEditorMode, "prose");

  return {
    get defaultEditorMode() { return mode.current; },
    set defaultEditorMode(v: DefaultEditorMode) { mode.current = v; },
    reset() { mode.current = "prose"; },
  };
}

export const generalSettings = createGeneralSettings();
