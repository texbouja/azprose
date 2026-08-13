import {
  readMode,
  readTransparencyOpacity,
  subscribeMode,
  subscribeTransparency,
  setThemeMode as libSetThemeMode,
  setTransparency as libSetTransparency,
  getSystemTheme,
} from "@/lib/theme";
import type { Theme, ThemeMode } from "@/lib/theme";

function resolve(mode: ThemeMode): Theme {
  return mode === "system" ? getSystemTheme() : mode;
}

let _mode = $state(readMode());
let _opacity = $state(readTransparencyOpacity());
// Racine du projet courant. Positionnée par app.svelte au boot et au changement de
// racine. N'a plus de lecteur depuis la suppression des thèmes crafted (phase 1.1
// de la refonte UI) — conservée car app.svelte/session-restore.ts l'alimentent
// encore ; sa suppression complète est hors périmètre de cette phase.
let _projectRoot = $state<string | null>(null);

subscribeMode(() => {
  _mode = readMode();
});

subscribeTransparency(() => {
  _opacity = readTransparencyOpacity();
});

const MQ = "(prefers-color-scheme: dark)";
if (typeof window !== "undefined") {
  window.matchMedia(MQ).addEventListener("change", () => {
    if (readMode() === "system") {
      _mode = "system";
    }
  });
}

export const theme = {
  get mode() { return _mode; },
  get resolved() { return resolve(_mode); },
  get opacity() { return _opacity; },
  get transparent() { return _opacity < 100; },
  get projectRoot() { return _projectRoot; },
  setProjectRoot(r: string | null) { _projectRoot = r; },
  setMode(m: ThemeMode) { libSetThemeMode(m); },
  setTransparency(v: number) { libSetTransparency(v); },
};
