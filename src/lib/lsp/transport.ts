import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

/**
 * LSP transport over stdio via Rust-side bridge (bypasses tauri-plugin-shell).
 * Content-Length framing is handled on the Rust side to avoid Tauri IPC issues.
 */
export class LspTransport {
  private id: string;
  private buffer = "";
  private nextId = 1;
  private resolveQueue: Array<{ id: number | string; resolve: (msg: JsonRpcMessage) => void }> = [];
  private onNotification: ((msg: JsonRpcMessage) => void) | null = null;
  private unlisteners: Array<() => void> = [];

  constructor(id?: string) {
    this.id = id ?? `lsp-${Date.now()}`;
  }

  onNotificationCallback(cb: (msg: JsonRpcMessage) => void) {
    this.onNotification = cb;
  }

  async spawn(commandName: string, args: string[] = []): Promise<void> {
    const unlisten1 = await listen<{ id: string; data: string }>("lsp://output", (ev) => {
      if (ev.payload.id !== this.id) return;
      this.buffer += ev.payload.data;
      this.processBuffer();
    });
    this.unlisteners.push(unlisten1);

    const unlisten2 = await listen<{ id: string; data: string }>("lsp://stderr", (ev) => {
      if (ev.payload.id !== this.id) return;
      console.debug("azprose:lsp:stderr", ev.payload.data);
    });
    this.unlisteners.push(unlisten2);

    const unlisten3 = await listen<{ id: string }>("lsp://exit", (ev) => {
      if (ev.payload.id !== this.id) return;
      console.log("azprose:lsp:process exited");
    });
    this.unlisteners.push(unlisten3);

    await invoke("lsp_spawn", {
      id: this.id,
      command: commandName,
      args,
    });
  }

  /** Send a JSON-RPC message and wait for the response. */
  async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    this.write(msg);

    return new Promise((resolve) => {
      this.resolveQueue.push({
        id,
        resolve: (response) => {
          if (response.error) {
            console.error("azprose:lsp:error", response.error);
            resolve(null);
          } else {
            resolve(response.result);
          }
        },
      });
    });
  }

  /** Send a JSON-RPC notification (no response expected). */
  notify(method: string, params: unknown): void {
    const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
    this.write(msg);
  }

  async kill(): Promise<void> {
    for (const fn of this.unlisteners) fn();
    this.unlisteners = [];
    try {
      await invoke("lsp_kill", { id: this.id });
    } catch { /* ignore */ }
    this.buffer = "";
    this.resolveQueue = [];
  }

  /** Send raw JSON-RPC payload. Content-Length framing is added by Rust. */
  private write(content: string): void {
    console.log("azprose:lsp:write", content.substring(0, 100));
    invoke("lsp_write", { id: this.id, content }).catch((err) => {
      console.error("azprose:lsp:write error", err);
    });
  }

  private processBuffer(): void {
    const headerMatch = this.buffer.match(/Content-Length: (\d+)(?:\r\n|\n){2}/);
    if (!headerMatch) return;

    const contentLength = parseInt(headerMatch[1], 10);
    const headerEnd = headerMatch.index! + headerMatch[0].length;
    const body = this.buffer.slice(headerEnd);

    if (body.length < contentLength) return;

    const raw = body.slice(0, contentLength);
    this.buffer = this.buffer.slice(headerEnd + contentLength);

    try {
      const msg = JSON.parse(raw) as JsonRpcMessage;
      console.log("azprose:lsp:recv", msg.id ?? "notif", msg.method ?? (msg.result ? "result" : msg.error ? "error" : "?"));
      this.dispatch(msg);
    } catch (err) {
      console.error("azprose:lsp:parse error", err, raw);
    }

    this.processBuffer();
  }

  private dispatch(msg: JsonRpcMessage): void {
    if (msg.id != null) {
      // Check if it's a response to our request
      for (let i = 0; i < this.resolveQueue.length; i++) {
        const { id, resolve } = this.resolveQueue[i];
        if (msg.id === id) {
          this.resolveQueue.splice(i, 1);
          resolve(msg);
          return;
        }
      }
      // Server-initiated request (e.g. window/showDocument for inverse search)
      // Respond to keep tinymist happy, and forward to notification handlers
      // so components can react (e.g. inverse search in TypstPreview).
      if (msg.method) {
        console.log("azprose:lsp:server-request", msg.id, msg.method);
        let result: unknown = null;
        if (msg.method === "window/showDocument") {
          result = { success: true };
        }
        const resp = JSON.stringify({ jsonrpc: "2.0", id: msg.id, result });
        this.write(resp);
        this.onNotification?.(msg);
        return;
      }
      console.warn("azprose:lsp:unmatched response id", msg.id);
      return;
    }
    this.onNotification?.(msg);
  }
}
