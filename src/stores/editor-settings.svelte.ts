export type EditorFontFamily = "fira-code" | "jetbrains-mono" | "source-code-pro" | "ibm-plex-mono" | "system" | "custom";

export interface EditorSettings {
  fontFamily: EditorFontFamily;
  customFontName: string;
  fontSize: number;
  tabSize: number;
  lineNumbers: boolean;
  lineWrapping: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontFamily: "jetbrains-mono",
  customFontName: "",
  fontSize: 14,
  tabSize: 4,
  lineNumbers: true,
  lineWrapping: true,
};

let value = $state<EditorSettings>({ ...DEFAULT_EDITOR_SETTINGS });

export const editorSettings = {
  get current() { return value; },
  patch(partial: Partial<EditorSettings>) {
    value = { ...value, ...partial };
  },
  reset() { value = { ...DEFAULT_EDITOR_SETTINGS }; },
};
