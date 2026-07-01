<script lang="ts">
import { onMount, onDestroy } from "svelte";
import { syncLine } from "@/stores/sync-line";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers as lineNumbersExt, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { languageFromExt, mdHighlight, buildTheme } from "@/lib/editor-languages";

let {
  value = "",
  onChange,
  language = "md",
  lineNumbers = true,
  jumpToLine = null as number | null,
  jumpToCol = null as number | null,
  onJumpApplied,
  onGutterClick,
}: {
  value?: string;
  onChange?: (next: string) => void;
  language?: string;
  lineNumbers?: boolean;
  jumpToLine?: number | null;
  jumpToCol?: number | null;
  onJumpApplied?: () => void;
  onGutterClick?: (line: number) => void;
} = $props();

let hostEl: HTMLDivElement;
let view: EditorView;
let langCompartment: Compartment;
let lineNumbersCompartment: Compartment;
let onChangeRef = onChange;
$effect(() => { onChangeRef = onChange; });

onMount(() => {
  langCompartment = new Compartment();
  lineNumbersCompartment = new Compartment();

  const state = EditorState.create({
    doc: value,
    extensions: [
      lineNumbersCompartment.of(lineNumbers ? lineNumbersExt() : []),
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
      onGutterClick && EditorView.domEventHandlers({
        mousedown: (event, view) => {
          const target = event.target as HTMLElement;
          if (!target.classList.contains("cm-lineNumber")) return false;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos == null) return false;
          const line = view.state.doc.lineAt(pos).number;
          onGutterClick(line);
          return false;
        },
      }),
    ],
  });

  view = new EditorView({ state, parent: hostEl });

  // Restore scroll position from a previous mode (preview → editor switch).
  // An explicit jumpToLine is handled by the reactive $effect below instead.
  const restore = syncLine.current;
  if (jumpToLine == null && restore != null) {
    const lineNum = Math.min(Math.max(restore + 1, 1), view.state.doc.lines);
    const pos = view.state.doc.line(lineNum).from;
    view.dispatch({
      selection: { anchor: pos, head: pos },
      effects: EditorView.scrollIntoView(pos, { y: "start" }),
    });
  }
  syncLine.current = null;
});

// Reactive jump: fires for an already-mounted editor (console / preview click),
// not just at mount. Line/col are 0-based; null col jumps to line start.
$effect(() => {
  const line = jumpToLine;
  const col = jumpToCol;
  if (!view || line == null) return;
  const lineNum = Math.min(Math.max(line + 1, 1), view.state.doc.lines);
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
  if (view) {
    // Capture the first visible source line so the next mode can restore position.
    const firstPos = view.visibleRanges[0]?.from;
    if (firstPos != null) {
      syncLine.current = view.state.doc.lineAt(firstPos).number - 1; // 0-based
    }
    view.destroy();
  }
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
  const on = lineNumbers;
  if (view && lineNumbersCompartment) {
    view.dispatch({
      effects: lineNumbersCompartment.reconfigure(on ? lineNumbersExt() : []),
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
