import { bundledThemesInfo } from "shiki/themes";
import type { BundledThemeInfo } from "@shikijs/core";
import { tokensToCSS, type DerivedTheme } from "./theme-css";

export interface ShikiThemeInfo {
  id: string;
  displayName: string;
  type: "light" | "dark";
}

function hexToRgb(hex: string): string {
  const cleaned = hex.replace("#", "");
  const v = Number.parseInt(cleaned, 16);
  if (cleaned.length === 3) {
    const r = ((v >> 8) & 0xf) * 17;
    const g = ((v >> 4) & 0xf) * 17;
    const b = (v & 0xf) * 17;
    return `${r}, ${g}, ${b}`;
  }
  return `${(v >> 16) & 0xff}, ${(v >> 8) & 0xff}, ${v & 0xff}`;
}

function parseHex(hex: string): [number, number, number] {
  const c = hexToRgb(hex);
  return c.split(", ").map(Number) as [number, number, number];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return "#" + [r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("");
}

function blendHex(hex1: string, hex2: string, weight: number): string {
  const [r1, g1, b1] = parseHex(hex1);
  const [r2, g2, b2] = parseHex(hex2);
  return toHex(
    r1 * weight + r2 * (1 - weight),
    g1 * weight + g2 * (1 - weight),
    b1 * weight + b2 * (1 - weight),
  );
}

const SCOPE_MAP: [RegExp, string][] = [
  [/\bkeyword\b/, "--syntax-keyword"],
  [/\bstring\b/, "--syntax-string"],
  [/\bconstant\.numeric\b/, "--syntax-number"],
  [/\bentity\.name\.type\b/, "--syntax-type"],
  [/\bsupport\.type\b/, "--syntax-type"],
  [/\bstorage\.type\b/, "--syntax-type"],
  [/\bentity\.name\.function\b/, "--syntax-function"],
  [/\bsupport\.function\b/, "--syntax-function"],
  [/\bkeyword\.operator\b/, "--syntax-operator"],
  [/\bpunctuation\.accessor\b/, "--syntax-operator"],
  [/\bcomment\b/, "--syntax-comment"],
  [/\bconstant\b(?!\.numeric)/, "--syntax-constant"],
  [/\bsupport\.class\b/, "--syntax-constant"],
  [/\bvariable\.language\b/, "--syntax-constant"],
  [/\bconstant\.language\b/, "--syntax-constant"],
];

const SYNTAX_KEYS = [
  "--syntax-keyword",
  "--syntax-string",
  "--syntax-number",
  "--syntax-type",
  "--syntax-function",
  "--syntax-operator",
  "--syntax-comment",
  "--syntax-constant",
];

function extractSyntaxColor(
  tokens: { scope?: string | string[]; settings: { foreground?: string } }[],
): Record<string, string> {
  const result: Record<string, string> = {};

  const scopesAndColors: { scope: string; color: string }[] = [];
  for (const rule of tokens) {
    if (!rule.settings?.foreground) continue;
    const scopes = Array.isArray(rule.scope) ? rule.scope : [rule.scope ?? ""];
    for (const s of scopes) {
      scopesAndColors.push({ scope: s, color: rule.settings.foreground });
    }
  }

  for (const [re, varName] of SCOPE_MAP) {
    const match = scopesAndColors.find((sc) => re.test(sc.scope));
    if (match) result[varName] = match.color;
  }

  for (const key of SYNTAX_KEYS) {
    if (!result[key]) {
      const fallback = scopesAndColors.find((sc) => sc.color);
      if (fallback) result[key] = fallback.color;
    }
  }

  return result;
}

export function getAvailableThemes(): ShikiThemeInfo[] {
  return bundledThemesInfo
    .filter((t: BundledThemeInfo) => t.id !== "vesper")
    .map((t: BundledThemeInfo) => ({
      id: t.id,
      displayName: t.displayName,
      type: t.type as "light" | "dark",
    }));
}

/** Load a Shiki theme and derive the full UI token set (+ completeness). */
export async function deriveThemeTokens(id: string): Promise<DerivedTheme> {
  const info = bundledThemesInfo.find((t: BundledThemeInfo) => t.id === id);
  if (!info) throw new Error(`Unknown Shiki theme: ${id}`);

  const mod = await info.import();
  const theme = mod.default as {
    fg?: string;
    bg?: string;
    colors?: Record<string, string>;
    tokenColors?: { scope?: string | string[]; settings: { foreground?: string; background?: string; fontStyle?: string } }[];
    type?: string;
  };

  const bg = theme.bg || theme.colors?.["editor.background"] || "#ffffff";
  const fg = theme.fg || theme.colors?.["editor.foreground"] || "#000000";
  const type: "light" | "dark" = (theme.type || info.type || "dark") === "light" ? "light" : "dark";
  const isLight = type === "light";

  const syntaxColors = extractSyntaxColor(theme.tokenColors ?? []);

  const accent =
    theme.colors?.["activityBar.foreground"] ||
    theme.colors?.["button.background"] ||
    theme.colors?.["textLink.foreground"] ||
    syntaxColors["--syntax-keyword"] ||
    syntaxColors["--syntax-function"] ||
    (isLight ? "#2563eb" : "#60a5fa");

  const errorColor =
    theme.colors?.["errorForeground"] ||
    theme.colors?.["editorError.foreground"] ||
    theme.colors?.["inputValidation.errorBorder"] ||
    (isLight ? "#d20f39" : "#f38ba8");

  const fgRgb = hexToRgb(fg);
  const bgRgb = hexToRgb(bg);

  // Pull real surface/border/hover/muted from the theme's full VS Code `colors` map
  // (Shiki themes ARE VS Code themes) — far more coherent than blending fg↔bg. Only
  // opaque values are used for solid surfaces; blending stays as the fallback.
  const colors = theme.colors ?? {};
  const opaque = (c?: string | null) => (c && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : null);
  const pick = (...keys: string[]) => {
    for (const k of keys) { const c = opaque(colors[k]); if (c) return c; }
    return null;
  };
  // WCAG-ish relative luminance + contrast, used for both the coherence gate
  // (fg vs bg must be readable) and surface/border distinctness vs bg.
  const lum = (hex: string) => {
    const [r, g, b] = parseHex(hex).map((n) => {
      const s = n / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  // Presence of the key (for completeness) vs a value distinct enough from bg (for
  // visible panels) — many themes reuse the editor bg for the sidebar.
  const distinct = (min: number, ...keys: string[]) => {
    const c = pick(...keys);
    return c && contrast(c, bg) >= min ? c : null;
  };

  const surfaceKey = pick("editorWidget.background", "sideBar.background", "editorGroupHeader.tabsBackground", "panel.background", "activityBar.background");
  const borderKey = pick("editorGroup.border", "panel.border", "editorWidget.border", "input.border", "sideBar.border", "tab.border");
  const surfaceSrc = distinct(1.04, "editorWidget.background", "sideBar.background", "editorGroupHeader.tabsBackground", "panel.background", "activityBar.background");
  const borderSrc = distinct(1.03, "editorGroup.border", "panel.border", "editorWidget.border", "input.border", "sideBar.border", "tab.border");
  const hoverSrc = pick("list.hoverBackground", "toolbar.hoverBackground", "list.inactiveSelectionBackground", "editor.lineHighlightBackground");
  const mutedSrc = pick("descriptionForeground", "editorLineNumber.foreground", "disabledForeground", "tab.inactiveForeground", "editorCodeLens.foreground");

  // Offered only if it has surface+border resources AND readable text on its background.
  const complete = surfaceKey !== null && borderKey !== null && contrast(fg, bg) >= 4.0;

  let muted: string, border: string, surface: string, surfaceHover: string;
  let shadowSoft: string, backdrop: string, shadowColor: string;

  if (isLight) {
    muted = mutedSrc ?? blendHex(fg, bg, 0.52);
    border = borderSrc ?? blendHex(fg, bg, 0.20);
    surface = surfaceSrc ?? blendHex(bg, "#ffffff", 0.10);
    surfaceHover = hoverSrc ?? blendHex(fg, bg, 0.30);
    shadowSoft = `0 1px 2px rgba(${fgRgb}, 0.06), 0 2px 8px rgba(${fgRgb}, 0.05)`;
    backdrop = "rgba(0, 0, 0, 0.22)";
    shadowColor = fgRgb;
  } else {
    muted = mutedSrc ?? blendHex(fg, bg, 0.42);
    border = borderSrc ?? blendHex(fg, bg, 0.10);
    surface = surfaceSrc ?? blendHex("#000000", bg, 0.12);
    surfaceHover = hoverSrc ?? blendHex(fg, bg, 0.22);
    shadowSoft = "0 1px 2px rgba(0, 0, 0, 0.42), 0 2px 8px rgba(0, 0, 0, 0.25)";
    backdrop = "rgba(0, 0, 0, 0.52)";
    shadowColor = "0, 0, 0";
  }

  const syntax: Record<string, string> = {};
  for (const key of SYNTAX_KEYS) {
    if (syntaxColors[key]) syntax[key] = syntaxColors[key];
  }

  return {
    id,
    type,
    complete,
    tokens: { bg, bgRgb, fg, muted, border, accent, surface, surfaceHover, shadowSoft, error: errorColor, backdrop, shadowColor, syntax },
  };
}

export async function generateThemeCSS(id: string): Promise<string> {
  const d = await deriveThemeTokens(id);
  return tokensToCSS(d.id, d.type, d.tokens);
}
