import { EditorView } from "@codemirror/view";
import { HighlightStyle, LanguageSupport, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
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
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { clojure } from "@codemirror/legacy-modes/mode/clojure";
import { tags as t } from "@lezer/highlight";
import {
  mathMarkdownSyntaxExtension,
  mathDelimiterTag,
  mathFormulaTag,
} from "@prosemark/core";
import type { StreamParser } from "@codemirror/language";

const mathHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: mathDelimiterTag, color: "var(--syntax-keyword)" },
  { tag: mathFormulaTag, color: "var(--syntax-string)" },
]));

const typstKeywords = new Set([
  "let", "set", "show", "if", "else", "for", "while", "return",
  "import", "include", "as", "in", "not", "and", "or",
  "none", "auto", "true", "false",
]);

interface TypstState { inBlockComment: boolean; }

const typst: StreamParser<TypstState> = {
  startState: () => ({ inBlockComment: false }),
  token(stream, state) {
    if (state.inBlockComment) {
      if (stream.skipTo("*/")) { stream.next(); stream.next(); state.inBlockComment = false; }
      else stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/\/\/.*/)) return "comment";
    if (stream.match(/\/\*/)) { state.inBlockComment = true; return "comment"; }

    if (stream.match(/#/)) {
      stream.eatWhile(/[\w?]/);
      return "keyword";
    }

    if (stream.match(/"/)) {
      while (!stream.eol()) {
        if (stream.next() === "\\") stream.next();
        else if (stream.peek() === '"') { stream.next(); break; }
      }
      return "string";
    }

    if (stream.match(/[0-9]+(?:\.[0-9]+)?(?:[a-z]+)?/)) return "number";

    if (stream.match(/\$\$[\s\S]*?\$\$/) || stream.match(/\$[^$]*\$/)) return "string";

    stream.eatWhile(/[\w\u{00E0}-\u{00FF}]+/u);
    const word = stream.current();
    if (word && typstKeywords.has(word)) return "keyword";
    if (word) return "variableName";

    stream.next();
    return null;
  },
};

export function languageFromExt(ext: string): LanguageSupport {
  switch (ext) {
    case "md":
    case "markdown":
    case "mdx": {
      const md = markdown({
        codeLanguages: (info) =>
          ["stex", "tex", "latex", "math"].includes(info)
            ? StreamLanguage.define(stex)
            : null,
        extensions: [mathMarkdownSyntaxExtension],
      });
      return new LanguageSupport(md.language, [md.support, mathHighlight]);
    }
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
    case "typ":
      return new LanguageSupport(StreamLanguage.define(typst));
    default:
      return markdown();
  }
}

export function extFromPath(path: string): string {
  const name = path.split("/").pop() || path;
  const dot = name.lastIndexOf(".");
  if (dot === -1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export const mdHighlight = HighlightStyle.define([
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

export function buildTheme() {
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
      '&.cm-focused .cm-selectionBackground, ::selection, .cm-selectionBackground': {
        backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
      },
      ".cm-line": {
        padding: "0",
      },
    },
    { dark: false },
  );
}
