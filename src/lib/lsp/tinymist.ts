import { LSPClient, type LSPClientConfig } from "@codemirror/lsp-client";
import { createTauriTransport, killTransport, type TauriTransport } from "./transport";
import type { TypstSettings } from "@/stores/typst-settings.svelte";

// ── Tinymist Singleton ──────────────────────────────────────────

let _client: LSPClient | null = null;
let _transport: TauriTransport | null = null;
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
  _transport = createTauriTransport(_id, "tinymist", ["lsp"]);

  _client = new LSPClient({
    notificationHandlers: config?.notificationHandlers,
    unhandledNotification: config?.unhandledNotification,
  }).connect(_transport);

  return _client;
}

/** Send workspace/didChangeConfiguration to tinymist. */
export function sendTinymistConfig(settings: TypstSettings, projectRoot?: string | null): void {
  if (!_client) return;

  const typstExtraArgs: string[] = [];
  if (settings.typstExtraArgs.trim()) {
    typstExtraArgs.push(...settings.typstExtraArgs.trim().split(/\s+/));
  }
  // Always include project-local packages directory
  if (projectRoot) {
    typstExtraArgs.push("--package-path", `${projectRoot}/.azprose/typst`);
  }

  _client.notification("workspace/didChangeConfiguration", {
    settings: {
      tinymist: {
        systemFonts: settings.systemFonts,
        formatterMode: settings.formatterMode,
        formatterPrintWidth: settings.formatterPrintWidth,
        formatterIndentSize: settings.formatterIndentSize,
        exportPdf: settings.exportPdf,
        lint: { enabled: settings.lintEnabled, when: settings.lintWhen },
        semanticTokens: settings.semanticTokens ? "enable" : "disable",
        typstExtraArgs,
      },
    },
  });
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

/** Get the tinymist transport (for installing outFilter, etc.). Creates client if needed. */
export function getTinymistTransport(): TauriTransport {
  getTinymistClient();
  return _transport!;
}
