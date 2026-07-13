import { persistedState } from "@/stores/persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

export type SlideMode = "16:9" | "4:3";

export const SLIDE_MODES: { id: SlideMode; label: string }[] = [
  { id: "16:9", label: "16:9" },
  { id: "4:3",  label: "4:3" },
];

const _mode = persistedState<SlideMode>(STORAGE_KEYS.slideMode, "16:9");

export const slideSettings = {
  get mode(): SlideMode { return _mode.current; },
  set mode(v: SlideMode) { _mode.current = v; },
  reset() { _mode.current = "16:9"; },
};
