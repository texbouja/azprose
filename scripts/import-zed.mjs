// Offline import of skarline's Zed theme packs (Xcode + Fleet) → AZprose tokens.
//   bun run scripts/import-zed.mjs   (or node)
//
// - Skarline BUILTIN (permanent, into themes.json, replacing gruvbox): all Fleet +
//   2 consensual Xcode (Default Dark/Light).
// - The remaining Xcode variants → the crafted catalog (à la carte, crafted-catalog.json).
//
// Re-run regenerates from the upstream repos; then run `npm run themes` to rebuild
// tokens.css. Sources:
//   https://github.com/skarline/zed-xcode-themes  /  zed-fleet-themes

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THEMES_JSON = resolve(root, "src/styles/themes.json");
const CATALOG_JSON = resolve(root, "src/lib/crafted-catalog.json");

const SOURCES = {
  xcode: "https://raw.githubusercontent.com/skarline/zed-xcode-themes/main/themes/xcode.json",
  fleet: "https://raw.githubusercontent.com/skarline/zed-fleet-themes/main/themes/fleet.json",
};

// Skarline BUILTIN selection (everything else from Xcode goes to the crafted catalog).
const BUILTIN = [
  { name: "Fleet Dark",          id: "skarline-fleet-dark",   label: "fleet dark" },
  { name: "Fleet Light",         id: "skarline-fleet-light",  label: "fleet light" },
  { name: "Fleet Dark Purple",   id: "skarline-fleet-purple", label: "fleet purple" },
  { name: "Xcode Default Dark",  id: "skarline-xcode-dark",   label: "xcode dark" },
  { name: "Xcode Default Light", id: "skarline-xcode-light",  label: "xcode light" },
];

// ---- color helpers (Zed colors are #rrggbb or #rrggbbaa) ----
function chan(hex, i) { return parseInt(hex.slice(i, i + 2), 16); }
function flatten(c, bg) {
  if (!c) return null;
  let h = c.replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  if (h.length === 8) {
    const a = chan(h, 6) / 255;
    const b = bg.replace("#", "");
    const mix = (i) => Math.round(chan(h, i) * a + chan(b, i) * (1 - a)).toString(16).padStart(2, "0");
    return "#" + mix(0) + mix(2) + mix(4);
  }
  return "#" + h.slice(0, 6);
}
function rgb(hex) { const h = hex.replace("#", ""); return [0, 2, 4].map((i) => chan(h, i)).join(", "); }
function lum(hex) {
  const h = hex.replace("#", "");
  const v = [0, 2, 4].map((i) => { const s = chan(h, i) / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function contrast(a, b) { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
function blend(a, b, w) {
  const ha = a.replace("#", ""), hb = b.replace("#", "");
  const mix = (i) => Math.round(chan(ha, i) * w + chan(hb, i) * (1 - w)).toString(16).padStart(2, "0");
  return "#" + mix(0) + mix(2) + mix(4);
}

function deriveZed(theme) {
  const s = theme.style;
  const isLight = theme.appearance === "light";
  const bg = flatten(s["background"] ?? s["editor.background"], "#ffffff") ?? "#ffffff";
  const fg = flatten(s["text"], bg) ?? (isLight ? "#1e1e1e" : "#e6e6e6");
  const muted = flatten(s["text.muted"] ?? s["text.placeholder"], bg) ?? blend(fg, bg, isLight ? 0.5 : 0.45);
  let border = flatten(s["border"] ?? s["border.variant"], bg) ?? blend(fg, bg, 0.18);
  const accent = flatten(s["text.accent"] ?? (s["accents"] || [])[0] ?? s["icon.accent"], bg) ?? (isLight ? "#2563eb" : "#60a5fa");
  let surface = flatten(s["surface.background"] ?? s["elevated_surface.background"] ?? s["title_bar.background"] ?? s["element.background"], bg) ?? bg;
  let surfaceHover = flatten(s["element.hover"] ?? s["ghost_element.hover"] ?? s["element.active"], bg) ?? blend(fg, bg, 0.2);
  const error = flatten(s["error"] ?? s["error.background"], bg) ?? (isLight ? "#d20f39" : "#f38ba8");

  // keep panels visible if the theme reuses the editor bg
  if (contrast(surface, bg) < 1.04) surface = isLight ? blend("#000000", bg, 0.05) : blend("#000000", bg, 0.12);
  if (contrast(border, bg) < 1.03) border = blend(fg, bg, isLight ? 0.2 : 0.12);
  if (contrast(surfaceHover, bg) < 1.05) surfaceHover = blend(fg, bg, isLight ? 0.28 : 0.2);

  const syn = s["syntax"] ?? {};
  const sc = (k, fb) => flatten(syn[k]?.color, bg) ?? fb;
  const syntax = {
    "--syntax-keyword": sc("keyword", accent),
    "--syntax-string": sc("string", fg),
    "--syntax-number": sc("number", accent),
    "--syntax-type": sc("type", accent),
    "--syntax-function": sc("function", accent),
    "--syntax-operator": sc("operator", muted),
    "--syntax-comment": sc("comment", muted),
    "--syntax-constant": sc("constant", accent),
  };

  const fgRgb = rgb(fg);
  return {
    type: isLight ? "light" : "dark",
    tokens: {
      bg, bgRgb: rgb(bg), fg, muted, border, accent, surface, surfaceHover,
      shadowSoft: isLight
        ? `0 1px 2px rgba(${fgRgb}, 0.06), 0 2px 8px rgba(${fgRgb}, 0.05)`
        : "0 1px 2px rgba(0, 0, 0, 0.42), 0 2px 8px rgba(0, 0, 0, 0.25)",
      error,
      backdrop: isLight ? "rgba(0, 0, 0, 0.22)" : "rgba(0, 0, 0, 0.52)",
      shadowColor: isLight ? fgRgb : "0, 0, 0",
      syntax,
    },
  };
}

// tokens → themes.json `vars` block (flat --xxx map)
function toVars(t) {
  return {
    "--bg": t.bg, "--bg-rgb": t.bgRgb, "--fg": t.fg, "--muted": t.muted,
    "--border": t.border, "--accent": t.accent, "--surface": t.surface,
    "--surface-hover": t.surfaceHover, "--shadow-soft": t.shadowSoft,
    "--color-error": t.error, "--backdrop": t.backdrop, "--shadow-color": t.shadowColor,
    ...t.syntax,
  };
}

const slug = (name) => "skarline-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function load(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return res.json();
}

const xcode = await load(SOURCES.xcode);
const fleet = await load(SOURCES.fleet);
const allThemes = [...fleet.themes, ...xcode.themes];
const byName = new Map(allThemes.map((t) => [t.name, t]));
const builtinNames = new Set(BUILTIN.map((b) => b.name));

// --- 1. Skarline BUILTIN → themes.json (remove gruvbox, add skarline) ---
const themesDoc = JSON.parse(readFileSync(THEMES_JSON, "utf8"));
themesDoc.themes = themesDoc.themes.filter((t) => !t.names.some((n) => n.startsWith("gruvbox-")));
themesDoc.themes = themesDoc.themes.filter((t) => !t.names.some((n) => n.startsWith("skarline-")));
for (const b of BUILTIN) {
  const theme = byName.get(b.name);
  if (!theme) { console.warn("missing builtin theme:", b.name); continue; }
  const d = deriveZed(theme);
  themesDoc.themes.push({ names: [b.id], comment: `skarline ${b.label}`, colorScheme: d.type, vars: toVars(d.tokens) });
}
writeFileSync(THEMES_JSON, JSON.stringify(themesDoc, null, 2) + "\n", "utf8");

// --- 2. Remaining Xcode → crafted catalog ---
const catalog = JSON.parse(readFileSync(CATALOG_JSON, "utf8")).filter((c) => !c.id.startsWith("skarline-"));
for (const theme of xcode.themes) {
  if (builtinNames.has(theme.name)) continue;
  const d = deriveZed(theme);
  catalog.push({ id: slug(theme.name), displayName: theme.name, type: d.type, tokens: d.tokens });
}
catalog.sort((a, b) => a.displayName.localeCompare(b.displayName));
writeFileSync(CATALOG_JSON, JSON.stringify(catalog, null, 2) + "\n", "utf8");

console.log(`Skarline builtin: ${BUILTIN.length} (themes.json, gruvbox removed)`);
console.log(`Crafted catalog: +${xcode.themes.length - BUILTIN.filter((b) => b.name.startsWith("Xcode")).length} Xcode → ${catalog.length} total`);
