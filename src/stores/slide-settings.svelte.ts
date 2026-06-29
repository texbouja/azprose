import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

// Slide themes adapted from Marp's built-in themes.
export type SlideTheme = "default" | "gaia" | "uncover";
export type SlideMode  = "16:9" | "4:3";

export const SLIDE_THEMES: { id: SlideTheme; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "gaia",    label: "Gaia" },
  { id: "uncover", label: "Uncover" },
];

export const SLIDE_MODES: { id: SlideMode; label: string }[] = [
  { id: "16:9", label: "16:9" },
  { id: "4:3",  label: "4:3" },
];

const _theme = persistedState<SlideTheme>(STORAGE_KEYS.slideTheme, "default");
const _mode  = persistedState<SlideMode>(STORAGE_KEYS.slideMode,  "16:9");

export const slideSettings = {
  get theme(): SlideTheme { return _theme.current; },
  set theme(v: SlideTheme) { _theme.current = v; },
  get mode(): SlideMode { return _mode.current; },
  set mode(v: SlideMode) { _mode.current = v; },
  reset() { _theme.current = "default"; _mode.current = "16:9"; },
};
