<script lang="ts">
import { onMount, onDestroy } from "svelte";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { languageFromExt, mdHighlight, buildTheme } from "@/lib/editor-languages";

let {
  value = "",
  onChange,
  language = "md",
}: {
  value?: string;
  onChange?: (next: string) => void;
  language?: string;
} = $props();

let hostEl: HTMLDivElement;
let view: EditorView;
let langCompartment: Compartment;
let onChangeRef = onChange;
$effect(() => { onChangeRef = onChange; });

onMount(() => {
  langCompartment = new Compartment();

  const state = EditorState.create({
    doc: value,
    extensions: [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      bracketMatching(),
      syntaxHighlighting(mdHighlight, { fallback: true }),
      langCompartment.of(languageFromExt(language)),
      EditorView.lineWrapping,
      search({ top: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      buildTheme(),
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
  const lang = language;
  if (view && langCompartment) {
    view.dispatch({
      effects: langCompartment.reconfigure(languageFromExt(lang)),
    });
  }
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
