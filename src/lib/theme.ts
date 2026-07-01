import { STORAGE_KEYS } from "./storage";

export type BuiltinTheme =
  | "latte"
  | "mono"
  | "mono-dark"
  | "frappe"
  | "macchiato"
  | "mocha"
  | "skarline-fleet-dark"
  | "skarline-fleet-purple"
  | "skarline-fleet-light"
  | "skarline-xcode-dark"
  | "skarline-xcode-light";
export type Theme = BuiltinTheme | (string & Record<never, never>);
export type ThemeMode = "system" | Theme;
export type ThemeChoice = { value: ThemeMode; label: string };
export type ThemeGroup = { label: string; choices: ThemeChoice[] };

export const BUILTIN_THEMES: readonly BuiltinTheme[] = [
  "latte",
  "mono",
  "mono-dark",
  "frappe",
  "macchiato",
  "mocha",
  "skarline-fleet-dark",
  "skarline-fleet-purple",
  "skarline-fleet-light",
  "skarline-xcode-dark",
  "skarline-xcode-light",
];

export const THEME_GROUPS: ThemeGroup[] = [
  {
    label: "neutral",
    choices: [
      { value: "system", label: "system" },
      { value: "mono", label: "mono" },
      { value: "mono-dark", label: "mono dark" },
    ],
  },
  {
    label: "skarline",
    choices: [
      { value: "skarline-fleet-dark",   label: "fleet dark" },
      { value: "skarline-fleet-purple", label: "fleet purple" },
      { value: "skarline-fleet-light",  label: "fleet light" },
      { value: "skarline-xcode-dark",   label: "xcode dark" },
      { value: "skarline-xcode-light",  label: "xcode light" },
    ],
  },
  {
    label: "catppuccin",
    choices: [
      { value: "latte", label: "latte" },
      { value: "frappe", label: "frappé" },
      { value: "macchiato", label: "macchiato" },
      { value: "mocha", label: "mocha" },
    ],
  },
  {
    label: "crafted",
    choices: [],
  },
];

export const THEME_CHOICES: ThemeChoice[] = [];
for (const group of THEME_GROUPS) {
  THEME_CHOICES.push(...group.choices);
}

export const THEME_HINTS: Record<string, string> = {
  system: "follow macOS appearance",
  latte: "catppuccin light",
  mono: "plain black and white",
  "mono-dark": "reverse black and white",
  frappe: "catppuccin mid-dark",
  macchiato: "catppuccin deeper dark",
  mocha: "catppuccin deepest dark",
  "skarline-fleet-dark":   "fleet — dark",
  "skarline-fleet-purple": "fleet — dark purple",
  "skarline-fleet-light":  "fleet — light",
  "skarline-xcode-dark":   "xcode — default dark",
  "skarline-xcode-light":  "xcode — default light",
};

const STORAGE_KEY = STORAGE_KEYS.themeMode;
const MQ = "(prefers-color-scheme: dark)";

const modeListeners = new Set<() => void>();
const transparencyListeners = new Set<() => void>();

export function readMode(): ThemeMode {
  if (typeof window === "undefined") return "latte";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v) return v as ThemeMode;
  } catch {
    // ignore
  }
  return "latte";
}

function systemTheme(): Theme {
  if (typeof window === "undefined") return "latte";
  return window.matchMedia(MQ).matches ? "mocha" : "latte";
}

function resolve(mode: ThemeMode): Theme {
  return mode === "system" ? systemTheme() : mode;
}

function apply(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const resolved = resolve(mode);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-theme-mode", mode);
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
  apply(mode);
  modeListeners.forEach((fn) => fn());
}

/**
 * Visual-only theme preview — does NOT touch localStorage or fire listeners.
 * Used by the theme menu's hover behavior: hover previews, click commits via
 * setThemeMode. Pass `null` to revert to the user's stored mode.
 */
export function previewTheme(theme: Theme | null): void {
  if (typeof document === "undefined") return;
  if (theme === null) {
    // revert to whatever's persisted
    apply(readMode());
    return;
  }
  document.documentElement.setAttribute("data-theme", theme);
}

export function subscribeMode(fn: () => void): () => void {
  modeListeners.add(fn);
  return () => {
    modeListeners.delete(fn);
  };
}

export function subscribeTransparency(fn: () => void): () => void {
  transparencyListeners.add(fn);
  return () => {
    transparencyListeners.delete(fn);
  };
}

const TRANSPARENCY_KEY = STORAGE_KEYS.transparency;
const TRANSPARENCY_OFF = 100;
const TRANSPARENCY_DEFAULT_ON = 74;

// Opacity is a 0-100 integer. 100 = fully opaque (off). <100 = transparency on
// at that opacity. Migrates legacy "on"/"off" string values from prior versions.
export function readTransparencyOpacity(): number {
  if (typeof window === "undefined") return TRANSPARENCY_OFF;
  try {
    const v = window.localStorage.getItem(TRANSPARENCY_KEY);
    if (v === null) return TRANSPARENCY_OFF;
    if (v === "on") return TRANSPARENCY_DEFAULT_ON;
    if (v === "off") return TRANSPARENCY_OFF;
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
    return TRANSPARENCY_OFF;
  } catch {
    return TRANSPARENCY_OFF;
  }
}

function applyTransparencyOpacity(opacity: number): void {
  if (typeof document === "undefined") return;
  const clamped = Math.max(0, Math.min(100, Math.round(opacity)));
  if (clamped >= TRANSPARENCY_OFF) {
    document.documentElement.removeAttribute("data-transparency");
    document.documentElement.style.removeProperty("--user-opacity");
  } else {
    document.documentElement.setAttribute("data-transparency", "on");
    document.documentElement.style.setProperty("--user-opacity", String(clamped / 100));
  }
}

export function setTransparency(opacity: number): void {
  const clamped = Math.max(0, Math.min(100, Math.round(opacity)));
  try {
    window.localStorage.setItem(TRANSPARENCY_KEY, String(clamped));
  } catch {
    // ignore
  }
  applyTransparencyOpacity(clamped);
  transparencyListeners.forEach((fn) => fn());
}

declare global {
  // eslint-disable-next-line no-var
  var __azproseThemeInit: boolean | undefined;
}

if (typeof window !== "undefined" && !globalThis.__azproseThemeInit) {
  globalThis.__azproseThemeInit = true;
  apply(readMode());
  applyTransparencyOpacity(readTransparencyOpacity());
  const mq = window.matchMedia(MQ);
  mq.addEventListener("change", () => {
    if (readMode() === "system") {
      apply("system");
      modeListeners.forEach((fn) => fn());
    }
  });
}

export function getSystemTheme(): Theme {
  return systemTheme();
}


