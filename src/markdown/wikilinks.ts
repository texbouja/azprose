import type MarkdownIt from "markdown-it";
import { getFileIndex } from "@/lib/vault-index";

/**
 * Obsidian-style wikilinks for markdown-it.
 * Supports: [[page]], [[page|alias]], [[page#heading]], [[page#heading|alias]]
 * PDF rect: [[file.pdf#page=N&rect=x,y,w,h]], ![[file.pdf#page=N&rect=x,y,w,h]]
 * Transclusion (![[file]]) is handled separately in transclusion.ts.
 */

const WIKILINK_RE = /\[\[([^\[\]]+?)\]\]/;
const PDF_RECT_RE = /!\[\[([^\[\]]+?)\]\]/;

// ── PDF param parsing ──────────────────────────────────────────────────────

interface PdfRect {
  x1: number; y1: number; x2: number; y2: number;
}

interface PdfParams {
  page: number | null;
  rect: PdfRect | null;
  width: number | null;
}

function parsePdfParams(fragment: string): PdfParams {
  const params = new URLSearchParams(fragment);
  const page = parseInt(params.get("page") ?? "") || null;
  let rect: PdfRect | null = null;
  const rectStr = params.get("rect");
  if (rectStr) {
    const parts = rectStr.split(",").map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      rect = { x1: parts[0], y1: parts[1], x2: parts[2], y2: parts[3] };
    }
  }
  const width = parseInt(params.get("width") ?? "") || null;
  return { page, rect, width };
}

function rectToStr(r: PdfRect): string {
  return `${r.x1},${r.y1},${r.x2},${r.y2}`;
}

// ── Wikilink types ─────────────────────────────────────────────────────────

interface WikilinkParts {
  target: string;
  heading: string | null;
  alias: string | null;
  pdfPage: number | null;
  pdfRect: PdfRect | null;
  pdfWidth: number | null;
}

function parseWikilink(raw: string): WikilinkParts {
  const idx = raw.indexOf("|");
  const display = idx >= 0 ? raw.slice(idx + 1).trim() : null;
  const path = (idx >= 0 ? raw.slice(0, idx) : raw).trim();
  const hashIdx = path.indexOf("#");
  const base = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
  const fragment = hashIdx >= 0 ? path.slice(hashIdx + 1) || null : null;

  let pdfPage: number | null = null;
  let pdfRect: PdfRect | null = null;
  let pdfWidth: number | null = null;
  let heading: string | null = fragment;
  let target = base;

  // PDF-specific: file.pdf#page=N&rect=x,y,w,h
  if (base.toLowerCase().endsWith(".pdf") && fragment) {
    const pdfParams = parsePdfParams(fragment);
    if (pdfParams.rect) {
      pdfPage = pdfParams.page;
      pdfRect = pdfParams.rect;
      pdfWidth = pdfParams.width;
      heading = null; // not a heading, it's PDF params
    }
  }

  return { target, heading, alias: display, pdfPage, pdfRect, pdfWidth };
}

function renderWikilink(parts: WikilinkParts): string {
  const { target, heading, alias, pdfPage, pdfRect, pdfWidth } = parts;

  if (pdfRect) {
    const label = alias || `${target} p.${pdfPage ?? "?"}`;
    const attrs = [
      `data-wikilink-target="${target}"`,
      `data-pdf-page="${pdfPage ?? ""}"`,
      `data-pdf-rect="${rectToStr(pdfRect)}"`,
    ];
    if (pdfWidth) attrs.push(`data-pdf-width="${pdfWidth}"`);
    return `<a class="wikilink pdf-link" href="#" ${attrs.join(" ")}>${label}</a>`;
  }

  const label = alias || (heading ? `${target} > ${heading}` : target);
  const attrs = `data-wikilink-target="${target}"${heading ? ` data-wikilink-heading="${heading}"` : ""}`;
  return `<a class="wikilink" href="#" ${attrs}>${label}</a>`;
}

// ── Markdown-it plugin ─────────────────────────────────────────────────────

export function wikilinkPlugin(md: MarkdownIt): void {
  // PDF rect embed: ![[file.pdf#page=N&rect=x,y,w,h]]
  // Must run before the transclusion pre-processor and before the wikilink rule.
  md.inline.ruler.before("backticks", "pdf_rect_embed", (state, silent) => {
    const src = state.src;
    const pos = state.pos;

    // Must start with ![[ and end with ]]
    if (src.charCodeAt(pos) !== 0x21 /* ! */) return false;
    if (src.charCodeAt(pos + 1) !== 0x5B /* [ */) return false;
    if (src.charCodeAt(pos + 2) !== 0x5B /* [ */) return false;

    const remaining = src.slice(pos);
    const match = PDF_RECT_RE.exec(remaining);
    if (!match) return false;

    const inner = match[1].trim();

    const hashIdx = inner.indexOf("#");
    if (hashIdx < 0) return false;

    const target = inner.slice(0, hashIdx);
    if (!target.toLowerCase().endsWith(".pdf")) return false;

    const fragment = inner.slice(hashIdx + 1);
    const pdfParams = parsePdfParams(fragment);
    if (!pdfParams.rect) return false;

    const fullLen = match[0].length;

    if (!silent) {
      const token = state.push("pdf_rect_embed", "", 0);
      token.content = inner;
      token.meta = {
        target,
        page: pdfParams.page,
        rect: pdfParams.rect,
        width: pdfParams.width,
      };
    }

    state.pos += fullLen;
    return true;
  });

  md.renderer.rules.pdf_rect_embed = (tokens, idx) => {
    const { target, page, rect, width } = tokens[idx].meta;
    const attrs = [
      `class="pdf-rect-embed"`,
      `data-pdf-target="${target}"`,
      `data-pdf-page="${page ?? ""}"`,
      `data-pdf-rect="${rectToStr(rect)}"`,
    ];
    if (width) attrs.push(`data-pdf-width="${width}"`);
    return `<div ${attrs.join(" ")}>${target} p.${page ?? "?"}</div>`;
  };

  // Standard wikilink: [[page]], [[page|alias]], [[page#heading]], [[file.pdf#page=...&rect=...]]
  md.inline.ruler.before("backticks", "wikilink", (state, silent) => {
    const src = state.src;
    const pos = state.pos;

    if (src.charCodeAt(pos) !== 0x5B || src.charCodeAt(pos + 1) !== 0x5B) return false;

    // Don't match transclusion ![[ — that's handled separately
    if (pos > 0 && src.charCodeAt(pos - 1) === 0x21) return false;

    const remaining = src.slice(pos);
    const match = WIKILINK_RE.exec(remaining);
    if (!match) return false;

    const fullLen = match[0].length;

    if (!silent) {
      const parts = parseWikilink(match[1]);
      const token = state.push("wikilink", "", 0);
      token.content = match[1];
      token.meta = parts;
    }

    state.pos += fullLen;
    return true;
  });

  md.renderer.rules.wikilink = (tokens, idx) => {
    const parts = tokens[idx].meta as WikilinkParts;
    return renderWikilink(parts);
  };

  // Inline tag rule: #tagname — must not be at line start (heading) or inside [[ ]]
  md.inline.ruler.after("backticks", "hashtag", (state, silent) => {
    const src = state.src;
    const pos = state.pos;

    if (src.charCodeAt(pos) !== 0x23 /* # */) return false;

    // Must not be at line start — that's a heading
    if (pos === 0 || src.charCodeAt(pos - 1) === 0x0A) return false;

    // Must be preceded by a word boundary (space, punctuation, or start)
    const prev = src.charCodeAt(pos - 1);
    if (prev === 0x5D /* ] */ || prev === 0x29 /* ) */) return false; // inside link/footnote ref

    // Must be followed by at least one alphanumeric (tag name)
    const rest = src.slice(pos + 1);
    const tagMatch = rest.match(/^[a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F_-]*/);
    if (!tagMatch) return false;

    if (!silent) {
      const token = state.push("hashtag", "", 0);
      token.content = tagMatch[0];
    }

    state.pos += 1 + tagMatch[0].length;
    return true;
  });

  md.renderer.rules.hashtag = (tokens, idx) => {
    const tag = tokens[idx].content;
    return `<a class="hashtag" href="#${tag}">#${tag}</a>`;
  };
}

// ── Post-render wikilink path resolution ────────────────────────

/**
 * Resolve all wikilink targets in a rendered article to full file paths.
 * Sets `data-wikilink-fullpath` on each `.wikilink` element.
 */
export async function resolveWikilinkPaths(article: HTMLElement, rootPath: string): Promise<void> {
  const index = await getFileIndex(rootPath);
  const links = article.querySelectorAll<HTMLAnchorElement>("a.wikilink");
  for (const a of links) {
    const target = a.getAttribute("data-wikilink-target");
    if (!target) continue;
    // Index keys are basenames without extension — strip ext for lookup
    const baseName = target.replace(/\.[^.]+$/, "");
    const fullPath = index.get(baseName) ?? index.get(target);
    if (fullPath) a.setAttribute("data-wikilink-fullpath", fullPath);
  }
}
