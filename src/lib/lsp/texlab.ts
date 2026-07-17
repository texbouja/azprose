import { LSPClient, type LSPClientConfig, serverDiagnostics } from "@codemirror/lsp-client";
import { createTauriTransport, killTransport } from "./transport";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import { logStore } from "@/components/console/log.svelte";
import type { Diagnostic } from "@/lib/diagnostics";
import { getRootPath } from "@/stores/root-path.svelte";
import { joinPath } from "@/lib/files";

// ── Texlab Singleton ────────────────────────────────────────────

let _client: LSPClient | null = null;
let _id: string | null = null;

function toSeverity(s: number): "error" | "warning" | "info" {
  if (s === 1) return "error";
  if (s === 2) return "warning";
  return "info";
}

function wireNotifications(client: LSPClient): void {
  const transport = (client as unknown as {
    transport: {
      subscribe: (h: (v: string) => void) => void;
      unsubscribe: (h: (v: string) => void) => void;
    };
  }).transport;

  transport.subscribe((raw: string) => {
    try {
      const msg = JSON.parse(raw);

      if (msg.method === "textDocument/publishDiagnostics") {
        const diags: Diagnostic[] = (msg.params?.diagnostics ?? []).map(
          (d: {
            severity?: number;
            message: string;
            range?: {
              start: { line: number; character: number };
              end: { line: number; character: number };
            };
          }) => ({
            severity: toSeverity(d.severity ?? 3),
            message: d.message,
            line: d.range ? d.range.start.line + 1 : undefined,
            col: d.range ? d.range.start.character + 1 : undefined,
            source: "latex",
          }),
        );
        diagnosticsStore.set("latex", diags);
      }

      if (msg.method === "$/logMessage") {
        const text = msg.params?.message ?? "";
        if (text) logStore.append("latex", text);
      }
    } catch {
      /* ignore parse errors */
    }
  });
}

/**
 * Get the shared texlab LSPClient.
 * Created synchronously on first call; the actual process spawn
 * and LSP initialize happen lazily on first message.
 */
export function getTexlabClient(
  config?: {
    notificationHandlers?: LSPClientConfig["notificationHandlers"];
    unhandledNotification?: LSPClientConfig["unhandledNotification"];
  },
): LSPClient {
  if (_client) return _client;

  _id = `texlab-${Date.now()}`;

  // Set TEXMFHOME to .azprose/texmf so texlab finds local packages
  const rp = getRootPath();
  const env: Record<string, string> | undefined = rp
    ? { TEXMFHOME: joinPath(joinPath(rp, ".azprose"), "texmf") }
    : undefined;

  const transport = createTauriTransport(_id, "texlab", [], env);

  _client = new LSPClient({
    notificationHandlers: config?.notificationHandlers,
    unhandledNotification: config?.unhandledNotification,
    extensions: [serverDiagnostics()],
  }).connect(transport);

  wireNotifications(_client);

  return _client;
}

/** Stop the texlab server. */
export async function stopTexlab(): Promise<void> {
  if (_id) {
    await killTransport(_id);
    _id = null;
  }
  _client = null;
}

/** True once a texlab client has been created. */
export function isTexlabReady(): boolean {
  return _client !== null;
}
