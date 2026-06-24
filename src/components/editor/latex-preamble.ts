/**
 * latex-preamble.ts
 *
 * Enables the LaTeX preamble pattern: macro definitions in $$…$$ display-math
 * blocks (using \newcommand, \def, \gdef, etc.) that are available to all
 * subsequent formula blocks in the document.
 *
 * Root cause of the bug without this extension
 * ─────────────────────────────────────────────
 * ProseMark renders each math widget via an independent MathJax.tex2svgPromise()
 * call.  Although MathJax serialises those calls through an internal queue, the
 * LRU render-cache inside @prosemark/latex stores the very first result keyed on
 * the raw formula text.  If a formula is rendered — and cached as an error —
 * before the preamble widget has a chance to inject \newcommand into MathJax's
 * TeX state, the error stays in cache indefinitely.
 *
 * Fix
 * ───
 * 1.  A StateField tracks the concatenated preamble string (all $$…$$ blocks
 *     containing at least one definition command).
 * 2.  When the preamble changes (user edits a definition block):
 *     a.  resetLatexMathJaxStateForTests() evicts every stale render from
 *         @prosemark/latex's LRU cache.
 *     b.  The Compartment wrapping latexMarkdownEditorExtensions() is
 *         reconfigured — CodeMirror destroys every ProseMark widget and
 *         recreates them in document order.  Because the preamble block sits at
 *         the top of the document its widget mounts first and queues its
 *         tex2svgPromise call into MathJax's serial queue before any formula
 *         widget does.  MathJax therefore processes the \newcommand definitions
 *         before rendering formulas that depend on them.
 */

import { StateField, type Extension } from "@codemirror/state";
import { ViewPlugin, type ViewUpdate, type EditorView } from "@codemirror/view";
import {
  latexMarkdownEditorExtensions,
  resetLatexMathJaxStateForTests,
  type LatexMarkdownEditorOptions,
} from "@prosemark/latex";
import { type Compartment } from "@codemirror/state";

// ── preamble extraction ───────────────────────────────────────────────────────

const DEF_COMMAND_RE =
  /\\(?:newcommand|renewcommand|DeclareMathOperator|newenvironment|renewenvironment|def|gdef|let)\b/;

function extractPreamble(text: string): string {
  const parts: string[] = [];
  const re = /\$\$([\s\S]*?)\$\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const content = m[1].trim();
    if (content && DEF_COMMAND_RE.test(content)) parts.push(content);
  }
  return parts.join("\n");
}

// ── StateField ────────────────────────────────────────────────────────────────

export const latexPreambleField = StateField.define<string>({
  create: (state) => extractPreamble(state.doc.toString()),
  update: (prev, tr) => (tr.docChanged ? extractPreamble(tr.state.doc.toString()) : prev),
});

// ── extension factory ─────────────────────────────────────────────────────────

/**
 * Returns a pair of extensions [latexPreambleField, ViewPlugin].
 *
 * @param latexCompartment  The Compartment that wraps latexMarkdownEditorExtensions()
 *                          in prosemark-editor.tsx.  Reconfiguring it destroys and
 *                          recreates all math widgets, re-establishing correct ordering.
 * @param mathOpts          Same options passed to latexMarkdownEditorExtensions().
 */
export function createLatexPreambleExtension(
  latexCompartment: Compartment,
  mathOpts: LatexMarkdownEditorOptions,
): Extension[] {
  return [
    latexPreambleField,
    ViewPlugin.fromClass(
      class {
        private preamble: string;

        constructor(view: EditorView) {
          this.preamble = view.state.field(latexPreambleField);
        }

        update(update: ViewUpdate) {
          if (!update.docChanged) return;
          const next = update.view.state.field(latexPreambleField);
          if (next === this.preamble) return;
          this.preamble = next;

          // Step 1: evict stale cached renders (error or correct-but-stale).
          resetLatexMathJaxStateForTests();

          // Step 2: force widget recreation in document order.
          // Deferred to avoid dispatching during an update callback.
          const view = update.view;
          queueMicrotask(() => {
            view.dispatch({
              effects: latexCompartment.reconfigure(latexMarkdownEditorExtensions(mathOpts)),
            });
          });
        }
      },
    ),
  ];
}
