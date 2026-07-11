import { ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { type Extension } from "@codemirror/state";
import {
  setDiagnosticsEffect,
  lintGutter,
  type Diagnostic,
} from "@codemirror/lint";
import { LspClient } from "./client";

/**
 * LSP position {line, character} → CM6 document offset.
 */
function lspPosToOffset(
  view: import("@codemirror/view").EditorView,
  line: number,
  character: number,
): number {
  const l = view.state.doc.line(line + 1);
  return Math.min(l.from + character, l.to);
}

/**
 * Map LSP DiagnosticSeverity to CM6 severity.
 */
function lspSeverity(severity: number | undefined): Diagnostic["severity"] {
  if (severity === 1) return "error";
  if (severity === 2) return "warning";
  return "info";
}

interface LspDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity?: number;
  message: string;
  source?: string;
}

/**
 * Convert an LSP diagnostic to a CM6 Diagnostic, resolving offsets via the view.
 */
function toCmDiagnostic(
  d: LspDiagnostic,
  view: import("@codemirror/view").EditorView,
): Diagnostic {
  return {
    from: lspPosToOffset(view, d.range.start.line, d.range.start.character),
    to: lspPosToOffset(view, d.range.end.line, d.range.end.character),
    severity: lspSeverity(d.severity),
    message: d.message,
  };
}

// ── Module-level diagnostic router ──────────────────────────────

const diagnosticHandlers = new Map<
  string,
  (diags: unknown[]) => void
>();

function routeDiagnostics(uri: string, diags: unknown[]) {
  diagnosticHandlers.get(uri)?.(diags);
}

let routerAttached = false;

function ensureRouter(client: LspClient) {
  if (routerAttached) return;
  routerAttached = true;
  client.onDiagnostics = routeDiagnostics;
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Create a CM6 extension that connects an LspClient to an editor instance.
 *
 * Provides:
 * - `lintGutter()` + diagnostics from `textDocument/publishDiagnostics`
 * - debounced `textDocument/didChange` sync
 * - `textDocument/didOpen` on mount, `didClose` on destroy
 *
 * @param client  The shared LspClient instance (singleton per server).
 * @param filePath  Absolute path to the file being edited.
 */
export function lspExtension(
  client: LspClient,
  filePath: string,
): Extension[] {
  ensureRouter(client);

  const uri = `file://${filePath}`;

  return [
    lintGutter(),
    ViewPlugin.fromClass(
      class {
        private debounce: ReturnType<typeof setTimeout> | null = null;

        constructor(view: import("@codemirror/view").EditorView) {
          diagnosticHandlers.set(uri, (diags) => {
            const cmDiags = diags.map((d) =>
              toCmDiagnostic(d as LspDiagnostic, view),
            );
            view.dispatch({
              effects: setDiagnosticsEffect.of(cmDiags),
            });
          });

          client.openFile(filePath, view.state.doc.toString());
        }

        update(update: ViewUpdate) {
          if (update.docChanged) {
            if (this.debounce) clearTimeout(this.debounce);
            this.debounce = setTimeout(() => {
              this.debounce = null;
              client.changeFile(update.state.doc.toString());
            }, 500);
          }
        }

        destroy() {
          if (this.debounce) clearTimeout(this.debounce);
          diagnosticHandlers.delete(uri);
          client.closeFile();
        }
      },
    ),
  ];
}

// ── Completion / hover (TODO) ───────────────────────────────────
