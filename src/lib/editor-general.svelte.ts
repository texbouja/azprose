import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, lineNumbers as lineNumbersExt } from "@codemirror/view";
import { editorSettings } from "@/stores/editor-settings.svelte";

export const FONT_FAMILY_MAP: Record<string, string> = {
  "fira-code": "'Fira Code', monospace",
  "jetbrains-mono": "'JetBrains Mono', monospace",
  "source-code-pro": "'Source Code Pro', monospace",
  "ibm-plex-mono": "'IBM Plex Mono', monospace",
  "system": "ui-monospace, monospace",
};

export function resolveFontFamily(es: { fontFamily: string; customFontName: string }): string {
  if (es.fontFamily === "custom" && es.customFontName.trim()) {
    return `'${es.customFontName.trim()}', monospace`;
  }
  return FONT_FAMILY_MAP[es.fontFamily] ?? "monospace";
}

export function buildFontTheme(es: { fontFamily: string; customFontName: string; fontSize: number }) {
  const ff = resolveFontFamily(es);
  const fs = es.fontSize + "px";
  return EditorView.theme({
    ".cm-editor":   { fontFamily: ff, fontSize: fs },
    ".cm-scroller": { fontFamily: ff, fontSize: fs },
    ".cm-gutters":  { fontFamily: ff },
  });
}

export interface GeneralCompartments {
  font: Compartment;
  tabSize: Compartment;
  lineNumbers: Compartment;
  lineWrapping: Compartment;
}

export function createGeneralCompartments(): GeneralCompartments {
  return {
    font: new Compartment(),
    tabSize: new Compartment(),
    lineNumbers: new Compartment(),
    lineWrapping: new Compartment(),
  };
}

export function generalInitialExtensions(gc: GeneralCompartments) {
  const es = editorSettings.current;
  return [
    gc.lineNumbers.of(es.lineNumbers ? lineNumbersExt() : []),
    gc.lineWrapping.of(es.lineWrapping ? EditorView.lineWrapping : []),
    gc.tabSize.of(EditorState.tabSize.of(es.tabSize)),
    gc.font.of(buildFontTheme(es)),
  ];
}

export function wireGeneralEffects(gc: GeneralCompartments, getView: () => EditorView | undefined) {
  $effect(() => {
    const on = editorSettings.current.lineNumbers;
    const view = getView();
    if (view) {
      view.dispatch({ effects: gc.lineNumbers.reconfigure(on ? lineNumbersExt() : []) });
    }
  });

  $effect(() => {
    const es = editorSettings.current;
    const view = getView();
    if (view) {
      view.dispatch({ effects: gc.font.reconfigure(buildFontTheme(es)) });
    }
  });

  $effect(() => {
    const ts = editorSettings.current.tabSize;
    const view = getView();
    if (view) {
      view.dispatch({ effects: gc.tabSize.reconfigure(EditorState.tabSize.of(ts)) });
    }
  });

  $effect(() => {
    const wrap = editorSettings.current.lineWrapping;
    const view = getView();
    if (view) {
      view.dispatch({ effects: gc.lineWrapping.reconfigure(wrap ? EditorView.lineWrapping : []) });
    }
  });
}
