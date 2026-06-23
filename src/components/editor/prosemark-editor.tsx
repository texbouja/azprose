import { useEffect, useRef, type RefObject } from "react";
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
} from "@prosemark/latex";


type ProseMarkEditorProps = {
  value: string;
  onChange: (next: string) => void;
  vimOn?: boolean;
  onVimMode?: (mode: "normal" | "insert" | "visual" | "replace" | null) => void;
  viewRef?: RefObject<EditorView | null>;
};

export function ProseMarkEditor({ value, onChange, vimOn = false, onVimMode, viewRef: externalViewRef }: ProseMarkEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const vimCompartment = useRef(new Compartment());

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
        ...latexMarkdownEditorExtensions(),
        EditorView.lineWrapping,
        vimCompartment.current.of([]),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
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
