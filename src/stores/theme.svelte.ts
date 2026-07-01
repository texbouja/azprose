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
// Project root that owns the crafted themes (.azprose/themes/). Set by app.svelte at
// boot and on root change; read by the theme menu for install/list/remove.
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
