import type { TypstBuildState } from "./types";
import { getTinymistClient } from "@/lib/lsp/tinymist";
import type { Diagnostic } from "@/lib/diagnostics";
import type { ServerRequest } from "@/lib/lsp/transport";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { getCursorLine } from "@/stores/cursor-line.svelte";
import {
  registerPreview,
  unregisterPreview,
  getPreviewTaskForFile,
  getPreviewTaskId,
} from "./preview-task-id.svelte";

export { registerPreview, unregisterPreview, getPreviewTaskForFile, getPreviewTaskId };

export { type TypstBuildState } from "./types";

/** Convert a raw filesystem path to a file:// URI (LSP protocol requires URIs). */
function toFileUri(path: string): string {
  return "file://" + encodeURI(path.replace(/\\/g, "/"));
}

// ── Server request handlers (for tinymist transport) ────────────
// tinymist sends `window/showDocument` as a JSON-RPC server REQUEST (with id),
// NOT as a notification. The transport's routeMessage consumes it before the
// handlers[] array. We register a serverReqHandler that dispatches to
// registered callbacks.

type ShowDocumentHandler = (params: {
  uri?: string;
  selection?: { start?: { line?: number; character?: number } };
}) => void;

const _showDocHandlers: ShowDocumentHandler[] = [];
let _serverReqInstalled = false;

function _ensureServerReqHandler() {
  if (_serverReqInstalled) return;
  _serverReqInstalled = true;
  const client = getTinymistClient();
  const transport = (client as unknown as { transport: { onServerRequest: (h: ((req: ServerRequest) => string | null) | null) => void } }).transport;

  transport.onServerRequest((req: ServerRequest) => {
    if (req.method === "window/showDocument") {
      for (const handler of _showDocHandlers) {
        try { handler(req.params as Record<string, unknown>); } catch (e) { console.error("[typst:server-req] handler error:", e); }
      }
      return JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { success: true } });
    }
    return null;
  });
}

/** Register a handler for window/showDocument server requests from tinymist. */
export function onShowDocument(handler: ShowDocumentHandler): () => void {
  _showDocHandlers.push(handler);
  _ensureServerReqHandler();
  return () => {
    const idx = _showDocHandlers.indexOf(handler);
    if (idx >= 0) _showDocHandlers.splice(idx, 1);
  };
}

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
  const uri = toFileUri(filePath);

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
): Promise<void> {
  const client = getTinymistClient();
  const uri = toFileUri(filePath);
  client.notification("textDocument/didOpen", {
    textDocument: { uri, languageId: "typst", version: 1, text: source },
  });
  client.notification("textDocument/didChange", {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: source }],
  });
  // tinymist.exportPdf args: [path, ExportPdfOpts, ExportActionOpts]
  // tinymist expects a filesystem path (not a URI) to resolve $dir/$name.
  await client.request("workspace/executeCommand", {
    command: "tinymist.exportPdf",
    arguments: [filePath, {}, { write: true }],
  });
}

// ── Preview via LSP ──────────────────────────────────────────────

export interface StartPreviewResult {
  port: number;
  taskId: string;
}

/** Start a tinymist preview via LSP. Returns { port, taskId }.
 *  Sends didOpen with filesystem content before doStartPreview to ensure
 *  tinymist has the document loaded when the preview server starts.
 *  --refresh-style on-save tells tinymist's CompileWatcher to only render
 *  SVG updates when the compile was triggered by a file-system save event
 *  (by_fs_events), NOT by LSP didOpen/didChange. This prevents the flash
 *  and re-rendering on every keystroke. */
export async function startPreview(filePath: string): Promise<StartPreviewResult> {
  const client = getTinymistClient();
  const uri = toFileUri(filePath);

  // Read file content from filesystem and send didOpen BEFORE starting preview.
  // This eliminates the race condition where doStartPreview arrives before
  // tinymist has processed CM6's didOpen (sent during Editor mount).
  let content: string;
  try {
    content = await readTextFile(filePath);
  } catch (err) {
    throw new Error(`Cannot read ${filePath}: ${err}`);
  }

  client.notification("textDocument/didOpen", {
    textDocument: { uri, languageId: "typst", version: 1, text: content },
  });

  const taskId = Math.random().toString(36).substring(2, 10);
  const args = [
    "--task-id", taskId,
    "--data-plane-host", "127.0.0.1:0",
    "--refresh-style", "on-save",
    "--no-open",
    filePath,
  ];

  let resp: { dataPlanePort?: number } | undefined;
  try {
    resp = await client.request<
      { command: string; arguments: unknown[] },
      { dataPlanePort?: number }
    >(
      "workspace/executeCommand",
      { command: "tinymist.doStartPreview", arguments: [args] },
    );
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : JSON.stringify(err);
    throw new Error(`Preview start failed: ${msg}`);
  }

  if (!resp?.dataPlanePort) {
    throw new Error("tinymist preview did not return a data plane port");
  }

  registerPreview(filePath, taskId);
  return { port: resp.dataPlanePort, taskId };
}

/** Kill a specific tinymist preview by task ID. */
export async function stopPreview(taskId: string): Promise<void> {
  if (!taskId) return;
  try {
    const client = getTinymistClient();
    await client.request("workspace/executeCommand", {
      command: "tinymist.doKillPreview",
      arguments: [taskId],
    });
  } catch { /* ignore — preview may already be dead */ }
}

/** Send a scroll command to a specific tinymist preview. */
export async function scrollPreview(taskId: string, req: ScrollPreviewRequest): Promise<void> {
  const client = getTinymistClient();
  await client.request("workspace/executeCommand", {
    command: "tinymist.scrollPreview",
    arguments: [taskId, req],
  });
}

/** Send didChange to tinymist preview (called on save, NOT on every keystroke). */
export async function updatePreview(filePath: string, source: string): Promise<void> {
  const client = getTinymistClient();
  const uri = toFileUri(filePath);
  client.notification("textDocument/didChange", {
    textDocument: { uri, version: Date.now() },
    contentChanges: [{ text: source }],
  });
}

/** Scroll the preview to the editor's current cursor position. */
export async function scrollToCursor(filePath: string, taskId: string): Promise<void> {
  const line = getCursorLine();
  const lineNum = line != null ? Math.max(line - 1, 0) : 0;
  await scrollPreview(taskId, {
    event: "changeCursorPosition",
    filepath: filePath,
    line: lineNum,
    character: 0,
  }).catch(() => {});
}

// ── Preview dispose notification ─────────────────────────────────
// tinymist sends `tinymist/preview/dispose` when a preview is killed.

type DisposeHandler = (taskId: string) => void;
const _disposeHandlers: DisposeHandler[] = [];
let _disposeListenerInstalled = false;

function _ensureDisposeListener() {
  if (_disposeListenerInstalled) return;
  _disposeListenerInstalled = true;
  const client = getTinymistClient();
  const transport = (client as unknown as { transport: { subscribe: (h: (v: string) => void) => void; unsubscribe: (h: (v: string) => void) => void } }).transport;

  transport.subscribe((raw: string) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.method === "tinymist/preview/dispose" && msg.params?.task_id) {
        for (const handler of _disposeHandlers) {
          try { handler(msg.params.task_id); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  });
}

/** Register a handler for tinymist/preview/dispose. Returns unsubscribe. */
export function onPreviewDispose(handler: DisposeHandler): () => void {
  _disposeHandlers.push(handler);
  _ensureDisposeListener();
  return () => {
    const idx = _disposeHandlers.indexOf(handler);
    if (idx >= 0) _disposeHandlers.splice(idx, 1);
  };
}

// ── Preview notifications ────────────────────────────────────────

/** Register a listener for tinymist preview notifications. Returns unsubscribe. */
export function onPreviewNotification(handler: (msg: { method?: string; params?: unknown }) => void): () => void {
  const client = getTinymistClient();
  const transport = (client as unknown as { transport: { subscribe: (h: (v: string) => void) => void; unsubscribe: (h: (v: string) => void) => void } }).transport;

  const wrappedHandler = (raw: string) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.method?.startsWith("tinymist/preview/")) {
        handler(msg);
      }
    } catch { /* ignore */ }
  };
  transport.subscribe(wrappedHandler);
  return () => {
    transport.unsubscribe(wrappedHandler);
  };
}
