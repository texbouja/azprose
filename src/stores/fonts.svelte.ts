/**
 * System font store — runtime vocabulary of every font family known to the app.
 *
 * Sources (merged case-insensitively):
 *  - system fonts enumerated by the Rust backend (fontdb / fontconfig)
 *  - families loaded in the document (fontsource bundles, via document.fonts)
 *  - static list of bundled families (fallback while/if enumeration is slow)
 *
 * Validation is word-based (not full-name based): every token of a custom font
 * name is checked against the vocabulary, so typing "Fira Sans Light" gives
 * progressive feedback instead of flagging an error until the last word lands.
 */

import { invoke } from "@tauri-apps/api/core";

export type FontCheck = "ok" | "partial" | "error" | null;

// Families bundled via @fontsource and always available in the webview — static
// fallback so custom names validate even before the system list is loaded.
const BUNDLED_FAMILIES = [
  "Fira Code",
  "Fira Mono",
  "Fira Sans",
  "Inter",
  "JetBrains Mono",
  "Ubuntu",
  "Ubuntu Condensed",
  "Ubuntu Mono",
];

// Standard style tokens — fontdb normalises weight/stretch/style (they are not
// real family names), so a partial name like "Fira Sans Light" must not flag
// "Light" as an unknown word while typing.
const STYLE_TOKENS = [
  "thin",
  "extralight",
  "light",
  "regular",
  "medium",
  "semibold",
  "bold",
  "extrabold",
  "black",
  "extrablack",
  "heavy",
  "italic",
  "oblique",
  "condensed",
  "expanded",
  "narrow",
  "wide",
  "normal",
  "book",
  "roman",
  "display",
  "text",
  "smallcaps",
  "small-caps",
];

// CSS generic families an advanced user may type directly.
const GENERIC_TOKENS = [
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "math",
  "emoji",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "sans",
  "mono",
  "script",
  "default",
  "message-box",
];

let status = $state<"idle" | "loading" | "ready">("idle");
let families = $state<Set<string>>(new Set());
let words = $state<Set<string>>(new Set());

function collectDocumentFonts(): string[] {
  try {
    const docFonts = (document as unknown as { fonts: FontFaceSet }).fonts;
    const names: string[] = [];
    for (const face of docFonts) {
      const family = face.family.replace(/^['"]|['"]$/g, "");
      if (family) names.push(family);
    }
    return names;
  } catch {
    return [];
  }
}

function tokenize(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Normalize for exact family matching: lowercase, any separator → space. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildVocabulary(system: string[]): { families: Set<string>; words: Set<string> } {
  const fam = new Set<string>();
  const w = new Set<string>();
  for (const name of [...BUNDLED_FAMILIES, ...collectDocumentFonts(), ...system]) {
    const normalized = normalize(name);
    if (!normalized) continue;
    fam.add(normalized);
    for (const tok of tokenize(name)) w.add(tok);
  }
  for (const tok of [...STYLE_TOKENS, ...GENERIC_TOKENS]) w.add(tok);
  return { families: fam, words: w };
}

export function getFontStore() {
  async function load() {
    if (status !== "idle") return;
    status = "loading";
    try {
      const system: string[] = await invoke<string[]>("list_system_fonts");
      const v = buildVocabulary(system);
      families = v.families;
      words = v.words;
    } catch {
      // System enumeration failed — fall back to document + bundled fonts only.
      const v = buildVocabulary([]);
      families = v.families;
      words = v.words;
    }
    status = "ready";
  }

  /** Force a reload (e.g. a font was installed while the app was running). */
  function reload() {
    status = "idle";
    return load();
  }

  /**
   * Word-by-word validation of a custom font name:
   *  - error   — at least one word is unknown to every known family
   *  - partial — every word is known but the exact family is not installed
   *  - ok      — the full name matches an installed/bundled family
   *  - null    — empty input
   */
  function check(name: string): FontCheck {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (families.has(normalize(trimmed))) return "ok";
    const tokens = tokenize(trimmed);
    return tokens.every((tok) => words.has(tok)) ? "partial" : "error";
  }

  const store = {
    get status() {
      return status;
    },
    get familyCount() {
      return families.size;
    },
    get wordCount() {
      return words.size;
    },
    load,
    reload,
    check,
  };

  // Kick off enumeration lazily on first access; ready by the time the
  // settings overlay is opened.
  void load();

  return store;
}
