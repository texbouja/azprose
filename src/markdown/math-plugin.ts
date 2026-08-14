// Plugin markdown-it pour les maths — extrait de render.ts (même motif que
// highlight.ts : le pipeline chat en a besoin sans les imports lourds du
// pipeline document).
//
// Doit s'enregistrer AVANT les règles inline de markdown-it (emphasis,
// escape…) pour ne pas corrompre le LaTeX contenant _, *, ^, etc.
// Produit \(...\) (inline) et \[...\] (display) — les délimiteurs par défaut
// de MathJax.

import type MarkdownIt from "markdown-it";
import { escapeAttr, escapeHtml } from "./highlight";

export function mathPlugin(md: MarkdownIt): void {
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

  md.renderer.rules["math_inline"] = (tokens, idx) => {
    const src = escapeAttr(tokens[idx].content);
    return `<span class="math-inline" data-math-source="${src}">\\(${escapeHtml(tokens[idx].content)}\\)</span>`;
  };

  md.renderer.rules["math_display"] = (tokens, idx) => {
    const src = escapeAttr(tokens[idx].content);
    return `<p class="math-block" data-math-source="${src}">\\[${escapeHtml(tokens[idx].content)}\\]</p>`;
  };
}
