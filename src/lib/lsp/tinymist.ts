import { LSPClient, type LSPClientConfig } from "@codemirror/lsp-client";
import { createTauriTransport, killTransport } from "./transport";

// ── Tinymist Singleton ──────────────────────────────────────────

let _client: LSPClient | null = null;
let _id: string | null = null;

/**
 * Get the shared tinymist LSPClient.
 * Created synchronously on first call; the actual process spawn
 * and LSP initialize happen lazily on first message.
 */
export function getTinymistClient(
  config?: {
    notificationHandlers?: LSPClientConfig["notificationHandlers"];
    unhandledNotification?: LSPClientConfig["unhandledNotification"];
  },
): LSPClient {
  if (_client) return _client;

  _id = `tinymist-${Date.now()}`;
  const transport = createTauriTransport(_id, "tinymist", ["lsp"]);

  _client = new LSPClient({
    notificationHandlers: config?.notificationHandlers,
    unhandledNotification: config?.unhandledNotification,
  }).connect(transport);

  return _client;
}

/** Stop the tinymist server. */
export async function stopTinymist(): Promise<void> {
  if (_id) {
    await killTransport(_id);
    _id = null;
  }
  _client = null;
}

/** True once a tinymist client has been created. */
export function isTinymistReady(): boolean {
  return _client !== null;
}
