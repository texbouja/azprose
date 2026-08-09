<script lang="ts">
import { onMount, onDestroy } from "svelte";
import { Annotation, Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { languageFromExt, mdHighlight, buildTheme } from "@/lib/editor-languages";
import { calloutCompletionSource } from "@/lib/callout-completion";
import { calloutSettings } from "@/stores/callout-settings.svelte";
import type { LSPClient } from "@codemirror/lsp-client";
import {
  createGeneralCompartments,
  generalInitialExtensions,
  wireGeneralEffects,
} from "@/lib/editor-general.svelte";
import { reportCursor } from "@/stores/cursor-line.svelte";

function toFileUri(path: string): string {
  return "file://" + encodeURI(path.replace(/\\/g, "/"));
}

/** Marque les transactions de SYNCHRONISATION (prop value → doc), par
 *  opposition aux éditions utilisateur. L'updateListener ignore leur
 *  `onChange` : un reflet ne doit jamais écrire le buffer du store.
 *  Cause racine du bug « fichier .md affiché vide » : lors d'une
 *  ré-affectation de tab (panel-store.open l.243 pose `source: ""` AVANT la
 *  lecture async), ce $effect dispatchait "" → onChange("") → setBuffer →
 *  le load() préservait le buffer "" → fichier vide + dirty + draft vide
 *  parké (qui gagnait ensuite à chaque lecture preferDraft). */
const syncValueAnnotation = Annotation.define<boolean>();

let {
  value = "",
  onChange,
  language = "md",
  jumpToLine = null as number | null,
  jumpToCol = null as number | null,
  onJumpApplied,
  onGutterClick,
  lspClient = null as LSPClient | null,
  filePath = "",
}: {
  value?: string;
  onChange?: (next: string) => void;
  language?: string;
  jumpToLine?: number | null;
  jumpToCol?: number | null;
  onJumpApplied?: () => void;
  onGutterClick?: (line: number) => void;
  lspClient?: LSPClient | null;
  filePath?: string;
} = $props();

let hostEl: HTMLDivElement;
let view: EditorView;
let langCompartment: Compartment;
let lspCompartment: Compartment;
const gc = createGeneralCompartments();
let docVersion = $state(0);
let onChangeRef = onChange;
$effect(() => { onChangeRef = onChange; });

// La vue Preview suit le curseur après chaque save : la ligne 0-based courante
// est rapportée (par chemin) à chaque déplacement de sélection / changement de
// document. Consommée par app.svelte au moment du save.
function trackCursor(state: EditorState): void {
  const head = state.selection.main.head;
  reportCursor(filePath, state.doc.lineAt(head).number - 1);
}

// Custom callouts (theorem, definition, …) are proposed locally — the 27
// Obsidian types come from markdown-oxide's LSP (callout_completions in
// .moxide.toml). Names are read fresh on each completion query.
const mdCalloutSource = calloutCompletionSource(() =>
  calloutSettings.current.map((c) => ({ name: c.name, label: c.label })),
);
const mdCompletions = [mdCalloutSource];

onMount(() => {
  langCompartment = new Compartment();
  lspCompartment = new Compartment();

  const state = EditorState.create({
    doc: value,
    extensions: [
      ...generalInitialExtensions(gc),
      history(),
      drawSelection(),
      highlightActiveLine(),
      bracketMatching(),
      syntaxHighlighting(mdHighlight, { fallback: true }),
      langCompartment.of(languageFromExt(language, mdCompletions)),
      lspCompartment.of(lspClient && filePath ? lspClient.plugin(toFileUri(filePath)) : []),
      search({ top: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      buildTheme(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          // Seules les éditions utilisateur notifient : les transactions de
          // sync value (annotation dédiée) reflètent le store, elles ne le
          // ré-alimentent pas.
          const isUserEdit = !update.transactions.some((t) => t.annotation(syncValueAnnotation));
          if (isUserEdit) onChangeRef?.(update.state.doc.toString());
          docVersion++;
        }
        if (update.docChanged || update.selectionSet) {
          trackCursor(update.state);
        }
      }),
      onGutterClick ? EditorView.domEventHandlers({
        mousedown: (event, view) => {
          const target = event.target as HTMLElement;
          if (!target.classList.contains("cm-lineNumber")) return false;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos == null) return false;
          const line = view.state.doc.lineAt(pos).number;
          onGutterClick!(line);
          return false;
        },
      }) : [],
    ],
  });

  view = new EditorView({ state, parent: hostEl });
  trackCursor(view.state); // position initiale du curseur (rapportée aussi par le dispatch du saut)

  const initialLine = jumpToLine;
  if (initialLine != null) {
    const lineNum = Math.min(Math.max(initialLine + 1, 1), view.state.doc.lines);
    const lineObj = view.state.doc.line(lineNum);
    const pos = jumpToCol != null ? Math.min(lineObj.from + jumpToCol, lineObj.to) : lineObj.from;
    view.dispatch({
      selection: { anchor: pos, head: pos },
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
    view.focus();
    onJumpApplied?.();
  }
});

$effect(() => {
  const line = jumpToLine;
  const col = jumpToCol;
  void docVersion;
  if (!view || line == null) return;
  const lineNum = Math.min(line + 1, view.state.doc.lines);
  if (lineNum < 1) return;
  const lineObj = view.state.doc.line(lineNum);
  const pos = col != null ? Math.min(lineObj.from + col, lineObj.to) : lineObj.from;
  view.dispatch({
    selection: { anchor: pos, head: pos },
    effects: EditorView.scrollIntoView(pos, { y: "center" }),
  });
  view.focus();
  onJumpApplied?.();
});

onDestroy(() => {
  view?.destroy();
});

$effect(() => {
  const lang = language;
  if (view && langCompartment) {
    view.dispatch({
      effects: langCompartment.reconfigure(languageFromExt(lang, mdCompletions)),
    });
  }
});

wireGeneralEffects(gc, () => view);

$effect(() => {
  const next = value;
  if (view && view.state.doc.toString() !== next) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
      annotations: [
        Transaction.addToHistory.of(false),
        syncValueAnnotation.of(true),
      ],
    });
    trackCursor(view.state); // changement d'onglet : la sélection est recalculée par CM
  }
});
</script>

<div bind:this={hostEl} class="mdv-editor" />
