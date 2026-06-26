import MarkdownIt from "markdown-it";
import type { RenderRule } from "markdown-it/lib/renderer.mjs";
import mark from "markdown-it-mark";
import taskLists from "markdown-it-task-lists";
import { createHighlighter, type Highlighter } from "shiki";
import { readFile } from "@tauri-apps/plugin-fs";
import type { Theme } from "./theme";

const THEMES: Record<Theme, string> = {
  latte: "catppuccin-latte",
  mono: "github-light",
  "mono-dark": "github-dark",
  frappe: "catppuccin-frappe",
  macchiato: "catppuccin-macchiato",
  mocha: "catppuccin-mocha",
  matcha: "vitesse-light",
  kanagawa: "kanagawa-wave",
  "rose-pine": "rose-pine",
  ayu: "ayu-dark",
  claude: "vitesse-light",
  codex: "github-dark",
  gemini: "github-light",
  cursor: "github-dark-dimmed",
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
let activeShikiTheme = THEMES.latte;

function getHighlighter(): Promise<Highlighter> {
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
function extractLangs(src: string): string[] {
  const found = new Set<string>();
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(src)) !== null) {
    const lang = m[1];
    if ((LANGS as readonly string[]).includes(lang)) found.add(lang);
  }
  return [...found];
}

async function ensureThemeLoaded(h: Highlighter, shikiTheme: string): Promise<void> {
  if (loadedThemes.has(shikiTheme)) return;
  await h.loadTheme(shikiTheme as Parameters<Highlighter["loadTheme"]>[0]);
  loadedThemes.add(shikiTheme);
}

async function ensureLangsLoaded(h: Highlighter, langs: string[]): Promise<void> {
  const toLoad = langs.filter((l) => !loadedLangs.has(l));
  if (toLoad.length === 0) return;
  await Promise.all(
    toLoad.map((l) => h.loadLanguage(l as Parameters<Highlighter["loadLanguage"]>[0])),
  );
  toLoad.forEach((l) => loadedLangs.add(l));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Math plugin — must run before markdown-it's inline rules (emphasis, escape, etc.)
// to prevent corruption of LaTeX content containing _, *, ^, etc.
// Outputs \(...\) for inline math and \[...\] for display math — MathJax's default delimiters.
function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("backticks", "math", (state, silent) => {
    const src = state.src;
    const pos = state.pos;
    if (src.charCodeAt(pos) !== 0x24 /* $ */) return false;

    // $$...$$ — display math (inline or multi-line within a paragraph)
    if (src.charCodeAt(pos + 1) === 0x24) {
      const end = src.indexOf("$$", pos + 2);
      if (end === -1) return false;
      if (!silent) {
        const t = state.push("math_display", "", 0);
        t.content = src.slice(pos + 2, end).trim();
      }
      state.pos = end + 2;
      return true;
    }

    // $...$ — inline math
    let end = pos + 1;
    while (end <= state.posMax && src.charCodeAt(end) !== 0x24) {
      if (src.charCodeAt(end) === 0x5c /* \ */) end++; // skip escaped char
      end++;
    }
    if (end > state.posMax) return false;
    const content = src.slice(pos + 1, end);
    if (!content.trim()) return false;
    if (!silent) {
      const t = state.push("math_inline", "", 0);
      t.content = content;
    }
    state.pos = end + 1;
    return true;
  });

  md.renderer.rules["math_inline"] = (tokens, idx) =>
    `\\(${escapeHtml(tokens[idx].content)}\\)`;

  md.renderer.rules["math_display"] = (tokens, idx) =>
    `<p class="math-block">\\[${escapeHtml(tokens[idx].content)}\\]</p>`;
}

// html: true — pass raw HTML blocks through, consistent with ProseMark's htmlBlockExtension.
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight: (code, lang) => {
    if (!highlighter) return `<pre><code>${escapeHtml(code)}</code></pre>`;
    const loaded = highlighter.getLoadedLanguages() as readonly string[];
    const language = loaded.includes(lang) ? lang : "text";
    try {
      return highlighter.codeToHtml(code, { lang: language, theme: activeShikiTheme });
    } catch {
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
  },
});

md.use(taskLists, { enabled: false, label: true });
md.use(mark);
md.use(mathPlugin);

// Stamp block tokens with source line range for potential editor↔preview sync.
md.core.ruler.push("source_lines", (state) => {
  for (const token of state.tokens) {
    if (token.map && token.nesting !== -1) {
      token.attrSet("data-sline", String(token.map[0]));
      token.attrSet("data-eline", String(token.map[1]));
    }
  }
  return true;
});

// GitHub-style heading anchors.
const slugify = (text: string): string =>
  text.toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/ /g, "-")
    .replace(/^-|-$/g, "");

md.renderer.rules.heading_open = ((tokens, idx, options, _env, self) => {
  const inline = tokens[idx + 1];
  if (inline?.type === "inline") {
    const id = slugify(inline.content);
    if (id) tokens[idx].attrSet("id", id);
  }
  return self.renderToken(tokens, idx, options);
}) as RenderRule;

export async function ensurePreviewReady(): Promise<void> {
  await getHighlighter();
}

// ── YAML front matter ──────────────────────────────────────────────────────

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

interface FrontMatter {
  meta: Record<string, string>;
  body: string;
}

export function parseFrontMatter(src: string): FrontMatter {
  const m = FM_RE.exec(src);
  if (!m) return { meta: {}, body: src };

  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    // Strip optional surrounding quotes from value
    const raw = line.slice(colon + 1).trim();
    meta[key] = raw.replace(/^["']|["']$/g, "");
  }
  return { meta, body: src.slice(m[0].length) };
}

function renderFrontMatterHeader(meta: Record<string, string>): string {
  const { title, subtitle, author, date } = meta;
  if (!title && !author && !date) return "";

  let html = `<header class="mdv-fm">`;
  if (title)    html += `<h1 class="mdv-fm__title">${escapeHtml(title)}</h1>`;
  if (subtitle) html += `<p class="mdv-fm__subtitle">${escapeHtml(subtitle)}</p>`;
  if (author || date) {
    html += `<p class="mdv-fm__byline">`;
    if (author) html += `<span class="mdv-fm__author">${escapeHtml(author)}</span>`;
    if (author && date) html += `<span class="mdv-fm__sep" aria-hidden="true"> · </span>`;
    if (date)   html += `<time class="mdv-fm__date">${escapeHtml(date)}</time>`;
    html += `</p>`;
  }
  html += `</header>`;
  return html;
}

export async function renderMarkdown(src: string, theme: Theme): Promise<string> {
  const { meta, body } = parseFrontMatter(src);
  const h = await getHighlighter();
  const shikiTheme = THEMES[theme];
  await ensureThemeLoaded(h, shikiTheme);
  await ensureLangsLoaded(h, extractLangs(body));
  activeShikiTheme = shikiTheme;
  return renderFrontMatterHeader(meta) + md.render(body);
}

// ── Post-render DOM helpers ────────────────────────────────────────────────

function imgMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case "jpg": case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "svg": return "image/svg+xml";
    default: return "image/png";
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const CHUNK = 8192;
  for (let i = 0; i < bytes.byteLength; i += CHUNK)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  return btoa(chunks.join(""));
}

// Resolve relative image paths to data URIs so Tauri's WebView can display them.
export async function resolveLocalImages(article: HTMLElement, filePath: string): Promise<void> {
  const lastSep = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"));
  const dir = filePath.slice(0, lastSep);
  const sep = filePath.includes("\\") ? "\\" : "/";
  await Promise.all(
    Array.from(article.querySelectorAll("img")).map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || /^(?:https?:|data:|tauri:|asset:)/.test(src)) return;
      const decoded = decodeURIComponent(src.startsWith("./") ? src.slice(2) : src);
      const absPath = dir + sep + decoded.replace(/\//g, sep);
      const dot = decoded.lastIndexOf(".");
      const ext = dot >= 0 ? decoded.slice(dot + 1) : "png";
      try {
        const bytes = await readFile(absPath);
        img.src = `data:${imgMime(ext)};base64,${uint8ToBase64(bytes)}`;
      } catch {
        // leave src as-is
      }
    }),
  );
}

const COPY_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const CHECK_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

export function decorateCodeBlocks(root: HTMLElement): () => void {
  const cleanups: Array<() => void> = [];
  root.querySelectorAll<HTMLPreElement>("pre.shiki").forEach((pre) => {
    if (pre.parentElement?.classList.contains("mdv-codeblock")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "mdv-codeblock";
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mdv-copy";
    btn.setAttribute("aria-label", "copier le code");
    btn.innerHTML =
      `<span class="mdv-copy__icon mdv-copy__icon--default">${COPY_ICON}copier</span>` +
      `<span class="mdv-copy__icon mdv-copy__icon--done">${CHECK_ICON}copié</span>`;
    wrapper.appendChild(btn);

    const onClick = async () => {
      try { await navigator.clipboard.writeText(pre.textContent ?? ""); } catch { /* ignore */ }
      btn.classList.add("is-done");
      window.setTimeout(() => btn.classList.remove("is-done"), 1400);
    };
    btn.addEventListener("click", onClick);
    cleanups.push(() => btn.removeEventListener("click", onClick));
  });
  return () => cleanups.forEach((fn) => fn());
}
