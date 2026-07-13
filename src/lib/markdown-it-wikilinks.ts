import type MarkdownIt from "markdown-it";
import { getFileIndex } from "./vault-index";

/**
 * Obsidian-style wikilinks for markdown-it.
 * Supports: [[page]], [[page|alias]], [[page#heading]], [[page#heading|alias]]
 * Transclusion (![[file]]) is handled separately in Phase 2.
 */

const WIKILINK_RE = /\[\[([^\[\]]+?)\]\]/;

interface WikilinkParts {
  target: string;
  heading: string | null;
  alias: string | null;
}

function parseWikilink(raw: string): WikilinkParts {
  const idx = raw.indexOf("|");
  const display = idx >= 0 ? raw.slice(idx + 1).trim() : null;
  const path = (idx >= 0 ? raw.slice(0, idx) : raw).trim();
  const hashIdx = path.indexOf("#");
  const target = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
  const heading = hashIdx >= 0 ? path.slice(hashIdx + 1) || null : null;
  return { target, heading, alias: display };
}

function renderWikilink(target: string, heading: string | null, alias: string | null): string {
  const label = alias || (heading ? `${target} > ${heading}` : target);
  const attrs = `data-wikilink-target="${target}"${heading ? ` data-wikilink-heading="${heading}"` : ""}`;
  return `<a class="wikilink" href="#" ${attrs}>${label}</a>`;
}

export function wikilinkPlugin(md: MarkdownIt): void {
  // Inline rule: runs early so it captures [[ before other rules
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
    const { target, heading, alias } = tokens[idx].meta as WikilinkParts;
    return renderWikilink(target, heading, alias);
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
    const fullPath = index.get(target);
    if (fullPath) a.setAttribute("data-wikilink-fullpath", fullPath);
  }
}
