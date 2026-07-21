<script lang="ts">
import "mathjax/tex-svg.js";
// Fira Sans + Fira Code — imported here so they only ship with the ProseMark
// chunk (lazy-loaded), not the main app bundle.
import "@fontsource/fira-sans/400.css";
import "@fontsource/fira-sans/400-italic.css";
import "@fontsource/fira-sans/500.css";
import "@fontsource/fira-sans/600.css";
import "@fontsource/fira-sans/700.css";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";
import { onMount, onDestroy } from "svelte";
import { Compartment, EditorState, Transaction, RangeSetBuilder, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, Decoration, type DecorationSet, type ViewUpdate, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, syntaxHighlighting, HighlightStyle, syntaxTree } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { tags } from "@lezer/highlight";
import { languages } from "@codemirror/language-data";
import {
  prosemarkBasicSetup,
  prosemarkBaseThemeSetup,
  prosemarkMarkdownSyntaxExtensions,
} from "@prosemark/core";
import {
  htmlBlockExtension,
  renderHtmlMarkdownSyntaxExtensions,
} from "@prosemark/render-html";
import { pasteRichTextExtension } from "@prosemark/paste-rich-text";
import {
  latexMarkdownSyntaxTheme,
  latexMarkdownEditorExtensions,
  type LatexMarkdownEditorOptions,
} from "@prosemark/latex";
import { createLatexPreambleExtension } from "@/stores/latex-preamble";
import {
  proseMarkSettings,
  resolveFontFamily,
  resolveMonoFont,
  resolveHeadingFont,
  type ProseMarkStyle,
} from "@/stores/markdown-settings.svelte";
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";

let {
  value = "",
  onChange,
  readOnly = false,
}: {
  value?: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
} = $props();

let hostEl: HTMLDivElement;
let view: EditorView;
let latexCompartment: Compartment;
let proseStyleCompartment: Compartment;
let proseLayoutCompartment: Compartment;
let onChangeRef = onChange;
$effect(() => { onChangeRef = onChange; });

const mathOpts: LatexMarkdownEditorOptions = {
  mathJaxLoadMode: "static-import",
  renderCacheSize: 128,
};

// ── Heading line decoration ──────────────────────────────────────────────────
// ProseMark adds no class to heading LINES — only inline span tokens get tags.
// This ViewPlugin decorates each ATXHeading line so EditorView.theme() can
// target .cm-heading1-line / .cm-heading2-line / .cm-heading3-line for margins.
const headingLinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildLineDecorations(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = buildLineDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

function buildLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  syntaxTree(view.state).cursor().iterate((node) => {
    const m = /^(?:ATX|Setext)Heading(\d)$/.exec(node.name);
    if (!m) return;
    const line = view.state.doc.lineAt(node.from);
    builder.add(line.from, line.from, Decoration.line({ class: `cm-heading${m[1]}-line` }));
  });
  return builder.finish();
}

// ── Heading inline style (font-size, font-weight, font-family) ────────────────
// font-size uses !important to guarantee it wins over baseSyntaxHighlights.
// Margins live on the host via CSS variables (updated reactively in $effect below).
function buildHeadingHighlight(style: ProseMarkStyle): Extension {
  return syntaxHighlighting(HighlightStyle.define([
    {
      tag: tags.heading1,
      fontSize: `${style.h1Size}em !important`,
      fontWeight: "bold",
      fontFamily: resolveHeadingFont(style.h1FontFamily, style.h1CustomFontName),
    },
    {
      tag: tags.heading2,
      fontSize: `${style.h2Size}em !important`,
      fontWeight: "bold",
      fontFamily: resolveHeadingFont(style.h2FontFamily, style.h2CustomFontName),
    },
    {
      tag: tags.heading3,
      fontSize: `${style.h3Size}em !important`,
      fontWeight: "bold",
      fontFamily: resolveHeadingFont(style.h3FontFamily, style.h3CustomFontName),
    },
  ]));
}

function buildProseTypographyTheme(s: ProseMarkStyle) {
  const pad = "28px 36px 96px";
  return EditorView.theme({
    ".cm-scroller": { padding: pad, lineHeight: s.lineHeight },
    ".cm-content":  { fontSize: s.fontSize + "px", maxWidth: s.maxWidth + "px" },
  });
}

onMount(() => {
  latexCompartment = new Compartment();
  proseStyleCompartment = new Compartment();
  proseLayoutCompartment = new Compartment();

  // Inject the global MathJax preamble before any formula widget renders.
  // Because resolved-promise callbacks execute in registration order, queueing
  // this .then() before the EditorView is created guarantees our preamble call
  // enters MathJax's serial queue ahead of every formula widget's call.
  const preamble = mathJaxPreamble.current.trim();
  if (preamble) {
    const mj = window.MathJax as
      | { startup?: { promise?: Promise<void> }; tex2svgPromise?: (tex: string, opts: { display: boolean }) => Promise<unknown> }
      | undefined;
    void mj?.startup?.promise?.then(() => {
      void mj.tex2svgPromise?.(preamble, { display: true });
    });
  }

  const state = EditorState.create({
    doc: value,
    extensions: [
      ...(!readOnly ? [lineNumbers()] : []),
      history(),
      drawSelection(),
      highlightActiveLine(),
      bracketMatching(),
      search({ top: true }),
      markdown({
        codeLanguages: languages,
        extensions: [
          GFM,
          prosemarkMarkdownSyntaxExtensions,
          renderHtmlMarkdownSyntaxExtensions,
        ],
      }),
      prosemarkBasicSetup(),
      prosemarkBaseThemeSetup(),
      htmlBlockExtension,
      pasteRichTextExtension(),
      ...latexMarkdownSyntaxTheme,
      latexCompartment.of(latexMarkdownEditorExtensions(mathOpts)),
      ...createLatexPreambleExtension(latexCompartment, mathOpts),
      EditorView.lineWrapping,
      EditorView.theme({
        ".cm-horizontal-rule-container hr": {
          border: "none",
          borderTop: "1.5px solid color-mix(in srgb, var(--pm-blockquote-vertical-line-background-color) 70%, transparent)",
        },
        ".cm-image img": {
          maxWidth: "100%",
          height: "auto",
          borderRadius: "6px",
        },
        // Heading line margins via CSS vars set reactively on hostEl.
        // padding-top/bottom avoids fighting CodeMirror's own line-height layout.
        ".cm-heading1-line": { paddingTop: "var(--h1-mt,0)", paddingBottom: "var(--h1-mb,0)" },
        ".cm-heading2-line": { paddingTop: "var(--h2-mt,0)", paddingBottom: "var(--h2-mb,0)" },
        ".cm-heading3-line": { paddingTop: "var(--h3-mt,0)", paddingBottom: "var(--h3-mb,0)" },
      }),
      headingLinePlugin,
      EditorView.editable.of(!readOnly),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef?.(update.state.doc.toString());
        }
      }),
      proseLayoutCompartment.of(buildProseTypographyTheme(proseMarkSettings.current)),
      // Placed last so our HighlightStyle appears after ProseMark's in the cascade.
      proseStyleCompartment.of(buildHeadingHighlight(proseMarkSettings.current)),
    ],
  });

  view = new EditorView({ state, parent: hostEl });
});

onDestroy(() => {
  view?.destroy();
  // Custom CSS is global in <head> — must clean up explicitly.
  document.getElementById("mdv-prose-custom-css")?.remove();
});

// CSS custom properties on hostEl — inherited by .cm-content and .cm-line children.
$effect(() => {
  if (!hostEl) return;
  const s = proseMarkSettings.current;
  hostEl.style.setProperty("--font", resolveFontFamily(s.fontFamily, s.customFontName));
  hostEl.style.setProperty("--pm-code-font", resolveMonoFont(s.monoFont));
  // Heading margins — consumed by EditorView.theme() .cm-heading*-line rules above.
  hostEl.style.setProperty("--h1-mt", `${s.h1MarginTop}em`);
  hostEl.style.setProperty("--h1-mb", `${s.h1MarginBottom}em`);
  hostEl.style.setProperty("--h2-mt", `${s.h2MarginTop}em`);
  hostEl.style.setProperty("--h2-mb", `${s.h2MarginBottom}em`);
  hostEl.style.setProperty("--h3-mt", `${s.h3MarginTop}em`);
  hostEl.style.setProperty("--h3-mb", `${s.h3MarginBottom}em`);
});

// Typography layout via compartment — scoped by CM's unique theme class.
$effect(() => {
  if (!view) return;
  view.dispatch({
    effects: proseLayoutCompartment.reconfigure(buildProseTypographyTheme(proseMarkSettings.current)),
  });
});

// Update heading highlight whenever settings change.
$effect(() => {
  if (!view) return;
  view.dispatch({
    effects: proseStyleCompartment.reconfigure(buildHeadingHighlight(proseMarkSettings.current)),
  });
});

// User-defined custom CSS injected as a global <style> tag.
// Targets .cm-html-widget for HTML block content and arbitrary editor selectors.
$effect(() => {
  const s = proseMarkSettings.current;
  const css = s.customCss;
  let el = document.getElementById("mdv-prose-custom-css") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "mdv-prose-custom-css";
    document.head.appendChild(el);
  }
  el.textContent = css;
});

$effect(() => {
  const next = value;
  if (view && view.state.doc.toString() !== next) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
      annotations: Transaction.addToHistory.of(false),
    });
  }
});
</script>

<div bind:this={hostEl} class="mdv-editor"></div>
