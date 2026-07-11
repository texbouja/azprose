import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Transport } from "@codemirror/lsp-client";

/**
 * Create a Transport that bridges to a Rust-spawned LSP server.
 * The server process is spawned lazily on the first send().
 * Content-Length framing is handled on Rust side for writes,
 * parsed here on the JS side for reads.
 */
export function createTauriTransport(
  id: string,
  command: string,
  args: string[],
): Transport {
  const handlers: Array<(value: string) => void> = [];
  let buffer = "";
  let initialized = false;

  const processBuffer = () => {
    const headerMatch = buffer.match(/Content-Length: (\d+)(?:\r\n|\n){2}/);
    if (!headerMatch) return;

    const contentLength = parseInt(headerMatch[1], 10);
    const headerEnd = headerMatch.index! + headerMatch[0].length;
    const body = buffer.slice(headerEnd);

    if (body.length < contentLength) return;

    const raw = body.slice(0, contentLength);
    buffer = buffer.slice(headerEnd + contentLength);

    for (const handler of handlers) handler(raw);

    if (buffer.includes("Content-Length:")) processBuffer();
  };

  const ensureInit = async () => {
    if (initialized) return;
    initialized = true;

    await invoke("lsp_spawn", { id, command, args });

    await listen<{ id: string; data: string }>("lsp://output", (ev) => {
      if (ev.payload.id !== id) return;
      buffer += ev.payload.data;
      processBuffer();
    });
  };

  return {
    send(message: string) {
      ensureInit().then(() =>
        invoke("lsp_write", { id, content: message }).catch(() => {}),
      );
    },
    subscribe(handler) {
      handlers.push(handler);
    },
    unsubscribe(handler) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    },
  };
}

/** Kill an LSP server session via the Rust bridge. */
export async function killTransport(id: string): Promise<void> {
  try {
    await invoke("lsp_kill", { id });
  } catch { /* ignore */ }
}
