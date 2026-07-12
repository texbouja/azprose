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
  let initPromise: Promise<void> | null = null;

  const processBuffer = () => {
    const headerMatch = buffer.match(/Content-Length: (\d+)(?:\r\n|\n){2}/);
    if (!headerMatch) {
      if (buffer.length > 0) console.log(`[transport:${command}] processBuffer: no header match, buffer=${buffer.length}b: ${buffer.slice(0, 80)}`);
      return;
    }

    const contentLength = parseInt(headerMatch[1], 10);
    const headerEnd = headerMatch.index! + headerMatch[0].length;
    const body = buffer.slice(headerEnd);

    if (body.length < contentLength) return;

    const raw = body.slice(0, contentLength);
    buffer = buffer.slice(headerEnd + contentLength);

    for (const handler of handlers) handler(raw);

    try {
      const msg = JSON.parse(raw);
      if (msg.id !== undefined || msg.method) {
        console.log(`[transport:${command}] ← parsed: ${raw.slice(0, 200)}`);
      }
    } catch { /* not JSON, ignore */ }

    if (buffer.includes("Content-Length:")) processBuffer();
  };

  const ensureInit = () => {
    if (!initPromise) {
      initPromise = (async () => {
        console.log(`[transport:${command}] spawning… id=${id}`);
        await invoke("lsp_spawn", { id, command, args });
        console.log(`[transport:${command}] spawn done, registering listeners`);

        await listen<{ id: string; data: string }>("lsp://output", (ev) => {
          if (ev.payload.id !== id) return;
          console.log(`[transport:${command}:out] ${ev.payload.data.length}b chunk`);
          buffer += ev.payload.data;
          processBuffer();
        });

        await listen<{ id: string; data: string }>("lsp://stderr", (ev) => {
          if (ev.payload.id !== id) return;
          console.log(`[transport:${command}:stderr] ${ev.payload.data.trimEnd()}`);
        });

        await listen<{ id: string }>("lsp://exit", (ev) => {
          if (ev.payload.id !== id) return;
          console.warn(`[transport:${command}] SERVER EXITED — id=${id}`);
        });

        console.log(`[transport:${command}] listeners registered ✓`);
      })();
    }
    return initPromise;
  };

  return {
    send(message: string) {
      ensureInit().then(() => {
        const preview = message.slice(0, 150);
        console.log(`[transport:${command}] → write ${message.length}b: ${preview}`);
        invoke("lsp_write", { id, content: message })
          .then(() => console.log(`[transport:${command}] → write OK`))
          .catch((e) => console.error(`[transport:${command}] → write FAILED:`, e));
      });
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
