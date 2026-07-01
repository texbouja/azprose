// Derive an xterm.js ITheme object from the current CSS custom properties
// (set by the active Shiki-derived theme). Used at boot and on every theme
// change (hover preview + click commit) so the terminal follows the UI live.

import type { ITheme } from "@xterm/xterm";

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  const v = Number.parseInt(cleaned, 16);
  if (cleaned.length === 3) {
    return [((v >> 8) & 0xf) * 17, ((v >> 4) & 0xf) * 17, (v & 0xf) * 17];
  }
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return "#" + [r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("");
}

function blendHex(hex1: string, hex2: string, weight: number): string {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return toHex(
    r1 * weight + r2 * (1 - weight),
    g1 * weight + g2 * (1 - weight),
    b1 * weight + b2 * (1 - weight),
  );
}

/** Luminance of a hex color (sRGB relative). */
function lum(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((n) => {
    const s = n / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Whether a hex background is dark-ish. */
function isDark(bg: string): boolean {
  return lum(bg) < 0.4;
}

/**
 * Derive a full xterm.js ITheme from the document's current CSS custom
 * properties. Call this whenever `data-theme` changes on `<html>`.
 */
export function readXtermTheme(): ITheme {
  const bg = cssVar("--bg", "#1e1e1e");
  const fg = cssVar("--fg", "#d4d4d4");
  const accent = cssVar("--accent", "#6366f1");
  const muted = cssVar("--muted", "#888");
  const dark = isDark(bg);

  // Syntax colours — fall back to fg if a particular token isn't defined.
  const kw = cssVar("--syntax-keyword", fg);
  const str = cssVar("--syntax-string", fg);
  const typ = cssVar("--syntax-type", fg);
  const fn = cssVar("--syntax-function", fg);
  const op = cssVar("--syntax-operator", fg);
  const constant = cssVar("--syntax-constant", fg);

  // Align syntax categories to ANSI colour indices.
  const base: string[] = [
    bg,       // 0 black
    kw,       // 1 red
    str,      // 2 green
    typ,      // 3 yellow
    fn,       // 4 blue
    constant, // 5 magenta
    op,       // 6 cyan
    fg,       // 7 white
  ];

  // Bright variants: lighten towards white (dark bg) or darken (light bg).
  const mixTarget = dark ? "#ffffff" : "#000000";
  const brighten = (hex: string, amt = 0.5) => blendHex(hex, mixTarget, amt);

  return {
    background: bg,
    foreground: fg,
    cursor: accent,
    cursorAccent: fg,
    selectionBackground: blendHex(accent, bg, 0.3),
    selectionForeground: fg,

    black: base[0],
    red: base[1],
    green: base[2],
    yellow: base[3],
    blue: base[4],
    magenta: base[5],
    cyan: base[6],
    white: base[7],

    brightBlack: brighten(muted, 0.5),
    brightRed: brighten(base[1]),
    brightGreen: brighten(base[2]),
    brightYellow: brighten(base[3]),
    brightBlue: brighten(base[4]),
    brightMagenta: brighten(base[5]),
    brightCyan: brighten(base[6]),
    brightWhite: brighten(base[7], 0.3),
  };
}
