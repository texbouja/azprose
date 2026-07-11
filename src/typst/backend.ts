import type { TypstBuildState } from "./types";
import { getTinymistClient } from "@/lib/lsp/tinymist";
import type { Diagnostic } from "@/lib/diagnostics";

export { type TypstBuildState } from "./types";

// ── Scroll request sent to tinymist.scrollPreview ────────────────

export type ScrollPreviewRequest =
  | { event: "panelScrollTo"; filepath: string; line: number; character: number }
  | { event: "panelScrollByPosition"; position: { page_no: number; x: number; y: number } }
  | { event: "changeCursorPosition"; filepath: string; line: number; character: number }
  | { event: "sourceScrollBySpan"; span: string };

export function createBuildState(): TypstBuildState {
  return {
    compiling: false,
    exporting: false,
    viewerPdfPath: null,
  };
}

// ── Diagnostics via tinymist LSP ─────────────────────────────────

/** Convert LSP diagnostics to our engine-neutral Diagnostic model. */
function toDiagnostics(raw: unknown[]): Diagnostic[] {
  return (raw as Array<{
    severity?: number;
    message: string;
    range?: { start: { line: number; character: number }; end: { line: number; character: number } };
    relatedInformation?: Array<{ location: { uri: string; range: { start: { line: number; character: number } } }; message: string }>;
  }>).map((d) => ({
    severity: d.severity === 1 ? "error" : d.severity === 2 ? "warning" : "info",
    message: d.message,
    line: d.range ? d.range.start.line + 1 : undefined,
    col: d.range ? d.range.start.character + 1 : undefined,
    hints: d.relatedInformation?.map((r) => r.message) ?? [],
  }));
}

/**
 * Send source to tinymist and wait for the next diagnostics notification.
 * Returns the diagnostics array (may be empty if no errors).
 */
export async function requestDiagnostics(
  filePath: string,
  source: string,
): Promise<Diagnostic[]> {
  const client = getTinymistClient();
  const uri = `file://${filePath}`;

  return new Promise<Diagnostic[]>((resolve) => {
    let resolved = false;

    // We need raw access to the transport for diagnostics.
    // The LSPClient handles publishDiagnostics internally for CM6,
    // but we need to intercept it for programmatic use.
    // Access the transport via the client's internal state.
    const transport = (client as unknown as { transport: { subscribe: (h: (v: string) => void) => void; unsubscribe: (h: (v: string) => void) => void } }).transport;

    const handler = (raw: string) => {
      if (resolved) return;
      try {
        const msg = JSON.parse(raw);
        if (msg.method === "textDocument/publishDiagnostics" && msg.params?.uri === uri) {
          resolved = true;
          transport.unsubscribe(handler);
          resolve(toDiagnostics(msg.params.diagnostics));
        }
      } catch { /* ignore parse errors */ }
    };
    transport.subscribe(handler);

    // Open file and send content
    client.notification("textDocument/didOpen", {
      textDocument: { uri, languageId: "typst", version: 1, text: source },
    });
    client.notification("textDocument/didChange", {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: source }],
    });

    // Timeout: resolve with empty after 5s
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        transport.unsubscribe(handler);
        resolve([]);
      }
    }, 5000);
  });
}

// ── Export PDF via tinymist LSP ──────────────────────────────────

export async function exportPdf(
  filePath: string,
  source: string,
  outputPath: string,
): Promise<void> {
  const client = getTinymistClient();
  const uri = `file://${filePath}`;
  client.notification("textDocument/didOpen", {
    textDocument: { uri, languageId: "typst", version: 1, text: source },
  });
  client.notification("textDocument/didChange", {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: source }],
  });
  await client.request("workspace/executeCommand", {
    command: "tinymist.exportPdf",
    arguments: [{ path: uri, outputPath }],
  });
}

// ── Preview via LSP ──────────────────────────────────────────────

let _previewTaskId: string | null = null;

/** Start a tinymist preview via LSP. Returns the data plane port. */
export async function startPreview(filePath: string, content: string): Promise<number> {
  const client = getTinymistClient();
  const uri = `file://${filePath}`;
  client.notification("textDocument/didOpen", {
    textDocument: { uri, languageId: "typst", version: 1, text: content },
  });

  const taskId = Math.random().toString(36).substring(2, 10);
  const args = [
    "--task-id", taskId,
    "--data-plane-host", "127.0.0.1:0",
    "--no-open",
    filePath,
  ];

  const resp = await client.request<
    { command: string; arguments: unknown[] },
    { dataPlanePort?: number }
  >(
    "workspace/executeCommand",
    { command: "tinymist.doStartPreview", arguments: [args] },
  );

  if (!resp?.dataPlanePort) {
    throw new Error("tinymist preview did not return a data plane port");
  }

  _previewTaskId = taskId;
  return resp.dataPlanePort;
}

/** Kill the current tinymist preview task. */
export async function stopPreview(): Promise<void> {
  if (!_previewTaskId) return;
  const client = getTinymistClient();
  await client.request("workspace/executeCommand", {
    command: "tinymist.doKillPreview",
    arguments: [_previewTaskId],
  });
  _previewTaskId = null;
}

/** Send a scroll command to the tinymist preview. */
export async function scrollPreview(taskId: string, req: ScrollPreviewRequest): Promise<void> {
  const client = getTinymistClient();
  await client.request("workspace/executeCommand", {
    command: "tinymist.scrollPreview",
    arguments: [taskId, req],
  });
}

/** Get the current preview task ID (or null). */
export function getPreviewTaskId(): string | null {
  return _previewTaskId;
}

/** Register a listener for tinymist preview notifications. Returns unsubscribe. */
export function onPreviewNotification(handler: (msg: { method?: string; params?: unknown }) => void): () => void {
  const client = getTinymistClient();
  const transport = (client as unknown as { transport: { subscribe: (h: (v: string) => void) => void; unsubscribe: (h: (v: string) => void) => void } }).transport;

  const wrappedHandler = (raw: string) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.method?.startsWith("tinymist/preview/") || msg.method === "window/showDocument") {
        handler(msg);
      }
    } catch { /* ignore */ }
  };
  transport.subscribe(wrappedHandler);
  return () => transport.unsubscribe(wrappedHandler);
}
