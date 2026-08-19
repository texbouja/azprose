// Plugin markdown-it pour les maths — extrait de render.ts (même motif que
// highlight.ts : le pipeline chat en a besoin sans les imports lourds du
// pipeline document).
//
// QUATRE délimiteurs sont reconnus : `$…$` et `$$…$$` (usage Markdown), plus
// `\(…\)` et `\[…\]` (usage LaTeX). Les seconds comptent pour qui écrit aussi
// du LaTeX : un fragment copié d'un `.tex` se compose sans être réécrit.
//
// ⚠️ La règle s'enregistre AVANT `escape`, et pas seulement avant les règles
// inline (emphase, backticks) comme à l'origine. C'est ce que réclament les
// délimiteurs LaTeX : `\(` est une SÉQUENCE D'ÉCHAPPEMENT CommonMark valide,
// que la règle `escape` consommerait la première — mesuré, `\(x^2\)` rendait
// « (x^2) ». Placée avant, la règle math voit le backslash en premier.
//
// Produit \(...\) (inline) et \[...\] (display) — les délimiteurs par défaut
// de MathJax, quelle que soit la forme écrite par l'auteur.

import type MarkdownIt from "markdown-it";
import { escapeAttr, escapeHtml } from "./highlight";

/** Délimiteurs LaTeX : ouvrant, fermant, et type de formule. */
const PAIRES_LATEX = [
  { ouvrant: "\\(", fermant: "\\)", token: "math_inline" },
  { ouvrant: "\\[", fermant: "\\]", token: "math_display" },
] as const;

export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("escape", "math", (state, silent) => {
    const src = state.src;
    const pos = state.pos;
    const c = src.charCodeAt(pos);

    // ── Délimiteurs LaTeX : \(…\) et \[…\] ──────────────────────────────────
    if (c === 0x5c /* \ */) {
      for (const { ouvrant, fermant, token } of PAIRES_LATEX) {
        if (!src.startsWith(ouvrant, pos)) continue;
        const end = src.indexOf(fermant, pos + 2);
        // Sans fermeture, on ne consomme RIEN : la règle `escape` reprend la
        // main et le texte s'affiche comme avant.
        if (end === -1) return false;
        const contenu = src.slice(pos + 2, end);
        if (!contenu.trim()) return false;
        if (!silent) {
          const t = state.push(token, "", 0);
          t.content = token === "math_display" ? contenu.trim() : contenu;
        }
        state.pos = end + 2;
        return true;
      }
      return false;
    }

    if (c !== 0x24 /* $ */) return false;

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
