// Offline curated crafted-theme catalog (run manually, NOT part of the app build):
//
//   bun run scripts/gen-catalog.mjs
//
// Scans all bundled Shiki themes, keeps only those whose VS Code `colors` map is rich
// enough for a coherent UI (DerivedTheme.complete), and bakes the derived tokens into
// src/lib/crafted-catalog.json. The runtime "Add Theme" modal reads this static catalog
// (preview + install) and never loads a Shiki theme module — lighter, and "rien en dehors
// de ce système". BUILTIN/addon source themes are excluded (already shipped).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getAvailableThemes, deriveThemeTokens } from "../src/lib/theme-generator.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "src/lib/crafted-catalog.json");

// Shiki ids that are already our BUILTIN/preinstalled themes — don't re-offer them.
const EXCLUDE = new Set([
  "catppuccin-latte", "catppuccin-frappe", "catppuccin-macchiato", "catppuccin-mocha",
]);

const all = getAvailableThemes();
const catalog = [];
const rejected = [];

for (const info of all) {
  if (EXCLUDE.has(info.id)) continue;
  try {
    const d = await deriveThemeTokens(info.id);
    if (!d.complete) { rejected.push(info.id); continue; }
    catalog.push({ id: info.id, displayName: info.displayName, type: d.type, tokens: d.tokens });
  } catch {
    rejected.push(info.id);
  }
}

catalog.sort((a, b) => a.displayName.localeCompare(b.displayName));
writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n", "utf8");
console.log(`catalog: ${catalog.length} themes kept (${rejected.length} rejected: incomplete colors map or low fg/bg contrast)`);
if (rejected.length) console.log("  rejected:", rejected.sort().join(", "));
