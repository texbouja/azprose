import type { Completion, CompletionContext, CompletionResult, CompletionSource } from "@codemirror/autocomplete";

/**
 * Callout completion for the Markdown editor.
 *
 * The Obsidian-flavored callout types (the 27 official ones — note, tip,
 * warning, …) are already provided by markdown-oxide's LSP `CalloutCompleter`
 * (see `src/completion/callout_completer.rs` upstream), gated by the
 * `callout_completions` setting in `.moxide.toml`.
 *
 * markdown-oxide's list is FIXED — it cannot know the app's custom callouts
 * (theorem, proposition, definition, remark, exercise, … from
 * `calloutSettings`). This local completion source fills that gap: it activates
 * inside a blockquote `[!…` context and proposes ONLY the custom callouts that
 * are not already covered by the LSP list, so the two sources merge into a
 * single popup without duplicates (both register through `languageData`, a
 * cumulative facet — never through `autocompletion({ override })`, which would
 * throw a "Config merge conflict" with the LSP client's own override).
 */

/**
 * The 27 callout types proposed by markdown-oxide's CalloutCompleter.
 * Local custom callouts whose name collides with one of these are excluded
 * (the LSP already provides them).
 */
export const OBSIDIAN_CALLOUT_TYPES: ReadonlySet<string> = new Set([
  "note",
  "abstract",
  "summary",
  "tldr",
  "info",
  "todo",
  "tip",
  "hint",
  "important",
  "success",
  "check",
  "done",
  "question",
  "help",
  "faq",
  "warning",
  "caution",
  "attention",
  "failure",
  "fail",
  "missing",
  "danger",
  "error",
  "bug",
  "example",
  "quote",
  "cite",
]);

export interface CalloutContext {
  /** Number of blockquote levels (`>` markers) before the cursor. */
  nested: number;
  /** The `> ` prefix repeated `nested` times (markdown-oxide keeps it verbatim). */
  prefix: string;
  /** Text typed after `[!` (may be empty). */
  typed: string;
  /** Distance from the cursor back to the `[` of `[!` (for the completion `from`). */
  fromDelta: number;
}

// A blockquote prefix: one or more `>` markers, each optionally followed by spaces.
const BLOCKQUOTE_RE = /^(> *)+/;
// An in-progress callout opener: `[!` + (empty or partial) name, NOT yet closed by `]`.
const CALLOUT_OPEN_RE = /^\[!([^\]]*)$/;

/**
 * Parse the text before the cursor for an in-progress callout.
 *
 * Returns `null` unless the line starts with a blockquote prefix (`> `, `> > `,
 * `>>`, …) AND the text after the prefix is `[!` followed by an unterminated
 * callout name. A closed callout (`[!note] `) does NOT match — completion only
 * happens while typing the name.
 *
 * Pure and unit-testable (no CodeMirror dependency).
 */
export function parseCalloutContext(lineText: string): CalloutContext | null {
  const prefixMatch = lineText.match(BLOCKQUOTE_RE);
  if (!prefixMatch) return null;

  const prefix = prefixMatch[0];
  const rest = lineText.slice(prefix.length);
  const open = rest.match(CALLOUT_OPEN_RE);
  if (!open) return null;

  return {
    nested: prefix.match(/>/g)?.length ?? 0,
    prefix,
    typed: open[1],
    fromDelta: rest.length,
  };
}

/**
 * Build the completion options for the custom callouts at the given context.
 * Names covered by the LSP list are excluded (no duplicates in the popup).
 * Pure and unit-testable.
 */
export function buildCalloutCompletions(
  callouts: ReadonlyArray<{ name: string; label: string }>,
): Completion[] {
  return callouts
    .filter((c) => !OBSIDIAN_CALLOUT_TYPES.has(c.name))
    .map((c) => ({
      label: c.name,
      detail: c.label,
      apply: `[!${c.name}] `,
      type: "keyword",
    }));
}

/**
 * CodeMirror completion source for custom callouts.
 *
 * Activates only inside a blockquote `[!` context (nested `>` supported).
 * Returns `null` when the context does not match or there is nothing custom to
 * propose — a non-matching source must not block the other sources (the LSP).
 */
export function calloutCompletionSource(
  getCallouts: () => ReadonlyArray<{ name: string; label: string }>,
): CompletionSource {
  return (ctx: CompletionContext): CompletionResult | null => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = line.text.slice(0, ctx.pos - line.from);
    const context = parseCalloutContext(before);
    if (!context) return null;

    const options = buildCalloutCompletions(getCallouts());
    if (options.length === 0) return null;

    return {
      from: ctx.pos - context.fromDelta,
      options,
      // Revalidate while typing: the text from the `[` to the cursor is `[!name`.
      validFor: /^\[![a-zA-Z0-9-]*$/,
    };
  };
}
