<script lang="ts">
import "mathjax/tex-svg.js";
import { onMount, onDestroy } from "svelte";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
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

let {
  value = "",
  onChange,
}: {
  value?: string;
  onChange?: (next: string) => void;
} = $props();

let hostEl: HTMLDivElement;
let view: EditorView;
let latexCompartment: Compartment;
let onChangeRef = onChange;
$effect(() => { onChangeRef = onChange; });

const mathOpts: LatexMarkdownEditorOptions = {
  mathJaxLoadMode: "static-import",
  renderCacheSize: 128,
};

onMount(() => {
  latexCompartment = new Compartment();

  const state = EditorState.create({
    doc: value,
    extensions: [
      lineNumbers(),
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
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef?.(update.state.doc.toString());
        }
      }),
    ],
  });

  view = new EditorView({ state, parent: hostEl });
});

onDestroy(() => {
  view?.destroy();
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

<div bind:this={hostEl} class="mdv-editor" />
