import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Transport } from "@codemirror/lsp-client";

export interface ServerRequest {
  method: string;
  id: number;
  params?: unknown;
}

/** Extended transport with message preprocessing (consume before handlers). */
export interface TauriTransport extends Transport {
  /** Set a filter that runs BEFORE handlers. Return true to consume the message. */
  setFilter(filter: ((raw: string) => boolean) | null): void;
  /** Handle server requests not consumed by the filter.
   *  Return a JSON-RPC response string to send back, or null for -32601. */
  onServerRequest(handler: ((req: ServerRequest) => string | null) | null): void;
  /** Send a JSON-RPC request and return a promise with the response. */
  sendRequest(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
}

/**
 * Create a Transport that bridges to a Rust-spawned LSP server.
 * The server process is spawned lazily on the first send().
 * Content-Length framing is parsed on the Rust side — each
 * lsp://output event contains one complete JSON-RPC message.
 */
export function createTauriTransport(
  id: string,
  command: string,
  args: string[],
  env?: Record<string, string>,
): TauriTransport {
  const handlers: Array<(value: string) => void> = [];
  let filter: ((raw: string) => boolean) | null = null;
  let serverReqHandler: ((req: ServerRequest) => string | null) | null = null;
  let initPromise: Promise<void> | null = null;
  let _reqId = 0;

  // Forward-declare so processBuffer can send responses (e.g. to server requests).
  const self = {
    send(_message: string) { /* filled below */ },
    subscribe(_h: (v: string) => void) { /* filled below */ },
    unsubscribe(_h: (v: string) => void) { /* filled below */ },
    setFilter(_f: ((raw: string) => boolean) | null) { /* filled below */ },
    onServerRequest(_h: ((req: ServerRequest) => string | null) | null) { /* filled below */ },
    sendRequest(_method: string, _params?: unknown, _timeoutMs?: number): Promise<unknown> { return Promise.resolve(null); },
  };

  /** Route a complete JSON-RPC message to the appropriate handler. */
  const routeMessage = (raw: string) => {
    // Filter runs first — if it consumes the message, skip everything.
    if (filter && filter(raw)) {
      console.log(`[transport:${command}] ← filtered (consumed by pre-filter)`);
      return;
    }

    // Server requests (method + id, no result/error) go to serverReqHandler
    try {
      const msg = JSON.parse(raw);
      if (msg.method && msg.id !== undefined && !("result" in msg) && !("error" in msg)) {
        if (serverReqHandler) {
          const resp = serverReqHandler({ method: msg.method, id: msg.id, params: msg.params });
          if (resp !== null) {
            console.log(`[transport:${command}] ← server request: ${msg.method} (id=${msg.id}) → handled`);
            self.send(resp);
            return;
          }
        }
        // No handler or handler returned null → send -32601 to prevent CM6's response
        const errResp = JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not implemented" } });
        console.log(`[transport:${command}] ← server request: ${msg.method} (id=${msg.id}) → -32601`);
        self.send(errResp);
        return;
      }
    } catch (e) {
      console.error(`[transport:${command}] JSON parse error in routeMessage:`, e, `raw=${raw.slice(0, 200)}`);
      return;
    }

    // Notifications and responses pass through to CM6 handlers.
    for (const handler of handlers) {
      try {
        handler(raw);
      } catch (e) {
        console.error(`[transport:${command}] handler error:`, e);
      }
    }
  };

  const ensureInit = () => {
    if (!initPromise) {
      initPromise = (async () => {
        console.log(`[transport:${command}] spawning… id=${id}`);
        await invoke("lsp_spawn", { id, command, args, env: env ?? null });
        console.log(`[transport:${command}] spawn done, registering listeners`);

        await listen<{ id: string; data: string }>("lsp://output", (ev) => {
          if (ev.payload.id !== id) return;
          routeMessage(ev.payload.data);
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

  // Wire up the self-reference so processBuffer can send responses.
  self.send = (message: string) => {
    ensureInit().then(() => {
      invoke("lsp_write", { id, content: message })
        .catch((e) => console.error(`[transport:${command}] → write FAILED:`, e));
    });
  };
  self.subscribe = (handler) => { handlers.push(handler); };
  self.unsubscribe = (handler) => {
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  };
  self.setFilter = (f) => { filter = f; };
  self.onServerRequest = (h) => { serverReqHandler = h; };

  self.sendRequest = (method: string, params?: unknown, timeoutMs = 5000): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const reqId = ++_reqId;
      const req = JSON.stringify({ jsonrpc: "2.0", id: reqId, method, params: params ?? {} });
      const timer = setTimeout(() => {
        self.unsubscribe(handler);
        reject(new Error(`sendRequest timeout: ${method} (id=${reqId})`));
      }, timeoutMs);
      const handler = (raw: string) => {
        try {
          const msg = JSON.parse(raw);
          if (msg.id === reqId && ("result" in msg || "error" in msg)) {
            clearTimeout(timer);
            self.unsubscribe(handler);
            if (msg.error) reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
            else resolve(msg.result);
          }
        } catch { /* not our response */ }
      };
      self.subscribe(handler);
      self.send(req);
    });
  };

  return self;
}

/** Kill an LSP server session via the Rust bridge. */
export async function killTransport(id: string): Promise<void> {
  try {
    await invoke("lsp_kill", { id });
  } catch { /* ignore */ }
}
