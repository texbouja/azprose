// Infrastructure de coloration syntaxique — EXTRAITE de render.ts pour que
// le pipeline « chat » (chat-render.ts, panneau agent) puisse réutiliser le
// highlighter sans hériter les imports lourds du pipeline document (colles,
// transclusion, doc-template…) qui chargent des stores à runes et cassent
// `bun test` (runes absentes du runtime bun brut).
//
// AUCUN import métier ici : ce module doit rester testable sous bun.

import { createHighlighter, type Highlighter } from "shiki";
import type { Theme } from "@/lib/theme";

// ── HTML escape utilities ────────────────────────────────
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Thème AZprose → thème Shiki. */
export const SHIKI_THEMES: Record<string, string> = {
  latte: "catppuccin-latte",
  frappe: "catppuccin-frappe",
  macchiato: "catppuccin-macchiato",
  mocha: "catppuccin-mocha",
  "skarline-fleet-dark":   "github-dark",
  "skarline-fleet-purple": "github-dark",
  "skarline-fleet-light":  "github-light",
  "skarline-xcode-dark":   "github-dark",
  "skarline-xcode-light":  "github-light",
};

// Python first — primary language for professors.
const LANGS = [
  "python",
  "markdown", "ts", "tsx", "js", "jsx", "json",
  "bash", "shellscript",
  "css", "html",
  "rust", "c", "cpp", "csharp",
  "java", "kotlin",
  "r",
  "sql", "yaml", "toml", "xml",
  "dockerfile", "diff",
] as const;

let highlighter: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();
const loadedThemes = new Set<string>();
/** Thème Shiki actif — mutable partagé, positionné avant chaque rendu. */
export let activeShikiTheme = SHIKI_THEMES.latte;

export function setActiveShikiTheme(t: string): void {
  activeShikiTheme = t;
}

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes: [], langs: [] })
      .then((h) => { highlighter = h; return h; })
      .catch((err) => {
        console.error("azprose: shiki init failed", err);
        highlighterPromise = null;
        throw err;
      });
  }
  return highlighterPromise;
}

const FENCE_RE = /^[ \t]*```([a-zA-Z0-9_+\-]+)/gm;
export function extractLangs(src: string): string[] {
  const found = new Set<string>();
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(src)) !== null) {
    const lang = m[1];
    if ((LANGS as readonly string[]).includes(lang)) found.add(lang);
  }
  return [...found];
}

export async function ensureThemeLoaded(h: Highlighter, shikiTheme: string): Promise<void> {
  if (loadedThemes.has(shikiTheme)) return;
  await h.loadTheme(shikiTheme as Parameters<Highlighter["loadTheme"]>[0]);
  loadedThemes.add(shikiTheme);
}

export async function ensureLangsLoaded(h: Highlighter, langs: string[]): Promise<void> {
  const toLoad = langs.filter((l) => !loadedLangs.has(l));
  if (toLoad.length === 0) return;
  await Promise.all(
    toLoad.map((l) => h.loadLanguage(l as Parameters<Highlighter["loadLanguage"]>[0])),
  );
  toLoad.forEach((l) => loadedLangs.add(l));
}

/** Cœur fence Shiki partagé par le pipeline document et le pipeline chat. */
export function shikiFence(code: string, lang: string): string {
  if (!highlighter) return `<pre><code>${escapeHtml(code)}</code></pre>`;
  const loaded = highlighter.getLoadedLanguages() as readonly string[];
  const language = loaded.includes(lang) ? lang : "text";
  try {
    return highlighter.codeToHtml(code, { lang: language, theme: activeShikiTheme });
  } catch {
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }
}

/** Précharge le thème Shiki du thème AZprose courant et les langages du texte. */
export async function prepareShiki(src: string, theme: Theme): Promise<void> {
  const h = await getHighlighter();
  const shikiTheme = SHIKI_THEMES[theme] ?? theme;
  try {
    await ensureThemeLoaded(h, shikiTheme);
    activeShikiTheme = shikiTheme;
  } catch {
    await ensureThemeLoaded(h, "github-light");
    activeShikiTheme = "github-light";
  }
  await ensureLangsLoaded(h, extractLangs(src));
}
