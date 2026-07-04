import type { EditorView } from "@codemirror/view";

let activeView: EditorView | null = null;

export function registerEditorView(view: EditorView | null) {
  activeView = view;
}

export function getEditorView(): EditorView | null {
  return activeView;
}
