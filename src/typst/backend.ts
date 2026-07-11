import { invoke } from "@tauri-apps/api/core";
import type { TypstPreviewResult, TypstSpanPosition, TypstForwardTarget, TypstBuildState } from "./types";
import { getTinymistClient, startTinymist } from "@/lib/lsp/tinymist";
import type { NotificationHandler } from "@/lib/lsp/client";

export { type TypstBuildState } from "./types";

/** Scroll request sent to tinymist.scrollPreview */
export type ScrollPreviewRequest =
  | { event: "panelScrollTo"; filepath: string; line: number; character: number }
  | { event: "panelScrollByPosition"; position: { page_no: number; x: number; y: number } }
  | { event: "changeCursorPosition"; filepath: string; line: number; character: number }
  | { event: "sourceScrollBySpan"; span: string };

/** Response from tinymist.doStartPreview */
export interface StartPreviewResponse {
  staticServerPort?: number;
  staticServerAddr?: string;
  dataPlanePort?: number;
  isPrimary?: boolean;
}

export function createBuildState(): TypstBuildState {
  return {
    compiling: false,
    exporting: false,
    viewerPdfPath: null,
  };
}

export async function preview(filePath: string, source: string): Promise<TypstPreviewResult> {
  return invoke<TypstPreviewResult>("typst_sidecar_preview", { filePath, source });
}

export async function resolveSpan(filePath: string, source: string, page: number, x: number, y: number): Promise<TypstSpanPosition | null> {
  const client = getTinymistClient();
  await startTinymist();
  const uri = `file://${filePath}`;
  await client.openFile(filePath, source);
  const result = await client.request<{ line: number; character: number } | null>("typst/jumpFromClick", { uri, page, x, y });
  if (!result) return null;
  return { line: result.line + 1, col: result.character + 1 };
}

export async function forwardLine(filePath: string, source: string, line: number): Promise<TypstForwardTarget | null> {
  const client = getTinymistClient();
  await startTinymist();
  const uri = `file://${filePath}`;
  await client.openFile(filePath, source);
  const result = await client.request<{ page: number; x: number; y: number } | null>("typst/jumpFromCursor", {
    uri,
    position: { line: line - 1, character: 0 },
  });
  return result;
}

export async function exportPdf(filePath: string, source: string, path: string): Promise<void> {
  await invoke<void>("typst_sidecar_export_pdf", { filePath, source, path });
}

// ── Preview via LSP ──────────────────────────────────────────────

let _previewTaskId: string | null = null;

/** Start a tinymist preview via LSP. Returns the data plane port. */
export async function startPreview(filePath: string, content: string): Promise<number> {
  const client = getTinymistClient();
  await startTinymist();
  await client.openFile(filePath, content);

  const taskId = Math.random().toString(36).substring(2, 10);
  const args = [
    "--task-id", taskId,
    "--data-plane-host", "127.0.0.1:0",
    "--no-open",
    filePath,
  ];

  console.log("azprose:preview calling doStartPreview", args);
  const resp = await client.executeCommand<StartPreviewResponse>(
    "tinymist.doStartPreview",
    [args],
  );
  console.log("azprose:preview got response", resp);

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
  await client.executeCommand("tinymist.doKillPreview", [_previewTaskId]);
  _previewTaskId = null;
}

/** Send a scroll command to the tinymist preview. */
export async function scrollPreview(taskId: string, req: ScrollPreviewRequest): Promise<void> {
  const client = getTinymistClient();
  await client.executeCommand("tinymist.scrollPreview", [taskId, req]);
}

/** Get the current preview task ID (or null). */
export function getPreviewTaskId(): string | null {
  return _previewTaskId;
}

/** Register a listener for tinymist preview notifications. Returns unsubscribe. */
export function onPreviewNotification(handler: NotificationHandler): () => void {
  const client = getTinymistClient();
  return client.onNotificationAdd((msg) => {
    if (msg.method?.startsWith("tinymist/preview/") || msg.method === "window/showDocument") {
      handler(msg);
    }
  });
}
