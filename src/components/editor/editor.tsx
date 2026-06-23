import { useEffect, useRef, type RefObject } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting, bracketMatching, LanguageSupport } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { sql } from "@codemirror/lang-sql";
import { rust } from "@codemirror/lang-rust";
import { tags as t } from "@lezer/highlight";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { clojure } from "@codemirror/legacy-modes/mode/clojure";

const mdHighlight = HighlightStyle.define([
  // --- markdown ---
  { tag: t.heading1, fontSize: "1.35em", fontWeight: "600", color: "var(--fg)" },
  { tag: t.heading2, fontSize: "1.18em", fontWeight: "600", color: "var(--fg)" },
  { tag: t.heading3, fontSize: "1.08em", fontWeight: "600", color: "var(--fg)" },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: "600", color: "var(--fg)" },
  { tag: t.strong, fontWeight: "600", color: "var(--fg)" },
  { tag: t.emphasis, fontStyle: "italic", color: "var(--fg)" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--muted)" },
  { tag: t.link, color: "var(--accent)", textDecoration: "none" },
  { tag: t.url, color: "var(--accent)" },
  { tag: t.quote, color: "var(--muted)", fontStyle: "italic" },
  { tag: t.monospace, color: "var(--accent)" },
  { tag: t.list, color: "var(--accent)" },
  { tag: t.contentSeparator, color: "var(--muted)" },
  { tag: t.meta, color: "var(--muted)" },
  { tag: t.processingInstruction, color: "var(--muted)" },
  // --- code ---
  { tag: t.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: t.lineComment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: t.blockComment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: t.docComment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: t.keyword, color: "var(--syntax-keyword)" },
  { tag: t.controlKeyword, color: "var(--syntax-keyword)" },
  { tag: t.definitionKeyword, color: "var(--syntax-keyword)" },
  { tag: t.moduleKeyword, color: "var(--syntax-keyword)" },
  { tag: t.operatorKeyword, color: "var(--syntax-keyword)" },
  { tag: t.string, color: "var(--syntax-string)" },
  { tag: t.number, color: "var(--syntax-number)" },
  { tag: t.bool, color: "var(--syntax-constant)" },
  { tag: t.regexp, color: "var(--syntax-string)" },
  { tag: t.typeName, color: "var(--syntax-type)" },
  { tag: t.className, color: "var(--syntax-type)" },
  { tag: t.name, color: "var(--syntax-function)" },
  { tag: t.definition(t.name), color: "var(--syntax-function)", fontWeight: "600" },
  { tag: t.definition(t.className), color: "var(--syntax-type)", fontWeight: "600" },
  { tag: t.definition(t.typeName), color: "var(--syntax-type)", fontWeight: "600" },
  { tag: t.labelName, color: "var(--syntax-function)" },
  { tag: t.namespace, color: "var(--syntax-type)" },
  { tag: t.macroName, color: "var(--syntax-keyword)" },
  { tag: t.literal, color: "var(--syntax-constant)" },
  { tag: t.unit, color: "var(--syntax-number)" },
  { tag: t.self, color: "var(--syntax-constant)" },
  { tag: t.null, color: "var(--syntax-constant)" },
  { tag: t.atom, color: "var(--syntax-constant)" },
  { tag: t.attributeName, color: "var(--syntax-keyword)" },
  { tag: t.attributeValue, color: "var(--syntax-string)" },
  { tag: t.tagName, color: "var(--syntax-type)" },
  { tag: t.angleBracket, color: "var(--syntax-operator)" },
  { tag: t.brace, color: "var(--syntax-operator)" },
  { tag: t.bracket, color: "var(--syntax-operator)" },
  { tag: t.paren, color: "var(--syntax-operator)" },
  { tag: t.operator, color: "var(--syntax-operator)" },
  { tag: t.punctuation, color: "var(--syntax-operator)" },
  { tag: t.separator, color: "var(--syntax-operator)" },
  { tag: t.derefOperator, color: "var(--syntax-operator)" },
  { tag: t.arithmeticOperator, color: "var(--syntax-operator)" },
  { tag: t.logicOperator, color: "var(--syntax-operator)" },
  { tag: t.bitwiseOperator, color: "var(--syntax-operator)" },
  { tag: t.compareOperator, color: "var(--syntax-operator)" },
  { tag: t.updateOperator, color: "var(--syntax-operator)" },
  { tag: t.definitionOperator, color: "var(--syntax-operator)" },
  { tag: t.escape, color: "var(--syntax-string)" },
  { tag: t.inserted, color: "var(--syntax-string)" },
  { tag: t.deleted, color: "var(--syntax-comment)" },
  { tag: t.changed, color: "var(--syntax-constant)" },
  { tag: t.invalid, color: "var(--syntax-comment)" },
]);

function languageFromExt(ext: string): LanguageSupport {
  switch (ext) {
    case "md":
    case "markdown":
    case "mdx":
      return markdown();
    case "html":
    case "htm":
    case "xhtml":
      return html();
    case "css":
    case "scss":
    case "less":
      return css();
    case "js":
    case "mjs":
    case "cjs":
    case "jsx":
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return javascript();
    case "json":
    case "jsonc":
      return json();
    case "xml":
    case "svg":
      return xml();
    case "py":
      return python();
    case "yaml":
    case "yml":
      return yaml();
    case "sql":
      return sql();
    case "rs":
      return rust();
    case "tex":
    case "sty":
    case "cls":
    case "ltx":
    case "bib":
      return new LanguageSupport(StreamLanguage.define(stex));
    case "clj":
    case "cljs":
    case "edn":
      return new LanguageSupport(StreamLanguage.define(clojure));
    default:
      return markdown();
  }
}

type EditorProps = {
  value: string;
  onChange: (next: string) => void;
  /** opt-in vim keybindings (lazy-loaded on first true) */
  vimOn?: boolean;
  /** fired when vim mode changes; null when vim is off (#23) */
  onVimMode?: (mode: "normal" | "insert" | "visual" | "replace" | null) => void;
  /** shared ref populated with the EditorView once it mounts */
  viewRef?: RefObject<EditorView | null>;
  /** file extension for syntax highlighting (e.g. "md", "py", "rs") */
  language?: string;
};

function buildTheme() {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: "transparent",
        color: "var(--fg)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--mdv-writing-font-size)",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        lineHeight: "var(--mdv-writing-line-height)",
        padding: "20px 28px 80px",
      },
      ".cm-content": {
        caretColor: "var(--accent)",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--accent)",
        borderLeftWidth: "1.5px",
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: "var(--muted)",
        border: "none",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        paddingRight: "8px",
      },
      ".cm-activeLine": {
        backgroundColor: "transparent",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: "var(--fg)",
      },
      "&.cm-focused": {
        outline: "none",
      },
      "&.cm-focused .cm-selectionBackground, ::selection, .cm-selectionBackground": {
        backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
      },
      ".cm-line": {
        padding: "0",
      },
    },
    { dark: false },
  );
}

export function Editor({ value, onChange, vimOn = false, onVimMode, viewRef: externalViewRef, language = "md" }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const vimCompartment = useRef(new Compartment());
  const langCompartment = useRef(new Compartment());

  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        bracketMatching(),
        syntaxHighlighting(mdHighlight, { fallback: true }),
        langCompartment.current.of(languageFromExt(language)),
        EditorView.lineWrapping,
        search({ top: true }),
        vimCompartment.current.of([]),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        buildTheme(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    if (externalViewRef) externalViewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
      if (externalViewRef) externalViewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: langCompartment.current.reconfigure(languageFromExt(language)),
    });
  }, [language]);

  // vim mode toggle (#23)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const compartment = vimCompartment.current;
    let cancelled = false;
    let detach: (() => void) | undefined;
    if (vimOn) {
      void import("@replit/codemirror-vim")
        .then(({ vim, getCM }) => {
          if (cancelled) return;
          view.dispatch({ effects: compartment.reconfigure(vim()) });
          const cm = getCM(view);
          if (cm && onVimMode) {
            onVimMode("normal");
            const handler = (e: { mode: string }) => {
              const m = e.mode as "normal" | "insert" | "visual" | "replace";
              onVimMode(m);
            };
            cm.on("vim-mode-change", handler);
            detach = () => cm.off("vim-mode-change", handler);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("azprose: failed to load vim mode", err);
        });
    } else {
      view.dispatch({ effects: compartment.reconfigure([]) });
      onVimMode?.(null);
    }
    return () => {
      cancelled = true;
      detach?.();
    };
  }, [vimOn, onVimMode]);

  return <div ref={hostRef} className="mdv-editor" />;
}
