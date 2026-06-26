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
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
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
import { createLatexPreambleExtension } from "./latex-preamble";
import {
  proseSettings,
  resolveFontFamily,
  resolveMonoFont,
  resolveHeadingFont,
  type ProseStyle,
} from "@/stores/prose-settings.svelte";
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
let onChangeRef = onChange;
$effect(() => { onChangeRef = onChange; });

const mathOpts: LatexMarkdownEditorOptions = {
  mathJaxLoadMode: "static-import",
  renderCacheSize: 128,
};

// Heading HighlightStyle — font-size and font-family for Markdown # H1/H2/H3.
// Markdown headings are HighlightStyle tokens (decorated spans), not real <h1> elements.
// Placed last in the extension array so this CSS wins over ProseMark's baseSyntaxHighlights.
function buildHeadingHighlight(style: ProseStyle): Extension {
  return syntaxHighlighting(HighlightStyle.define([
    {
      tag: tags.heading1,
      fontSize: `${style.h1Size}em`,
      fontWeight: "bold",
      fontFamily: resolveHeadingFont(style.h1FontFamily, style.customFontName),
    },
    {
      tag: tags.heading2,
      fontSize: `${style.h2Size}em`,
      fontWeight: "bold",
      fontFamily: resolveHeadingFont(style.h2FontFamily, style.customFontName),
    },
    {
      tag: tags.heading3,
      fontSize: `${style.h3Size}em`,
      fontWeight: "bold",
      fontFamily: resolveHeadingFont(style.h3FontFamily, style.customFontName),
    },
  ]));
}

onMount(() => {
  latexCompartment = new Compartment();
  proseStyleCompartment = new Compartment();

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
      }),
      EditorView.editable.of(!readOnly),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef?.(update.state.doc.toString());
        }
      }),
      // Placed last so our HighlightStyle appears after ProseMark's in the cascade.
      proseStyleCompartment.of(buildHeadingHighlight(proseSettings.current)),
    ],
  });

  view = new EditorView({ state, parent: hostEl });
});

onDestroy(() => {
  view?.destroy();
  // Remove layout/custom CSS style tags so they don't bleed into other editor instances
  // (e.g., switching from Presentation → Raw would leave presentation font-size applied).
  document.getElementById("mdv-prose-layout-css")?.remove();
  document.getElementById("mdv-prose-custom-css")?.remove();
});

// CSS custom properties: font-family on the host element (inherited by .cm-content).
$effect(() => {
  if (!hostEl) return;
  const s = proseSettings.current;
  hostEl.style.setProperty("--font", resolveFontFamily(s.fontFamily, s.customFontName));
  hostEl.style.setProperty("--pm-code-font", resolveMonoFont(s.monoFont));
});

// Layout CSS via <style> tag — appended to <head> after CodeMirror's own styles,
// so font-size wins over ProseMark's theme regardless of extension cascade order.
$effect(() => {
  const s = proseSettings.current;
  const lh = readOnly ? s.presLineHeight : s.lineHeight;
  const fs = readOnly ? s.presFontSize : s.fontSize;
  const mw = readOnly ? s.presMaxWidth : s.maxWidth;
  const pad = readOnly ? "32px 48px 64px" : "28px 36px 96px";
  let el = document.getElementById("mdv-prose-layout-css") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "mdv-prose-layout-css";
    document.head.appendChild(el);
  }
  el.textContent =
    `.cm-editor .cm-scroller { padding: ${pad}; line-height: ${lh}; }\n` +
    `.cm-editor .cm-content  { font-size: ${fs}px; max-width: ${mw}px; }`;
});

// Update heading highlight whenever settings change.
$effect(() => {
  if (!view) return;
  view.dispatch({
    effects: proseStyleCompartment.reconfigure(buildHeadingHighlight(proseSettings.current)),
  });
});

// User-defined custom CSS injected as a global <style> tag.
// Targets .cm-html-widget for HTML block content and arbitrary editor selectors.
$effect(() => {
  const s = proseSettings.current;
  const css = readOnly ? s.presCss : s.customCss;
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
    });
  }
});
</script>

<div bind:this={hostEl} class="mdv-editor"></div>
