import { LspTransport, type JsonRpcMessage } from "./transport";

export interface LspClientOptions {
  command: string;
  args?: string[];
  languageId: string;
}

export type NotificationHandler = (msg: JsonRpcMessage) => void;

/**
 * Minimal LSP client — lifecycle, file sync, notification forwarding.
 */
export class LspClient {
  private transport = new LspTransport();
  private initialized = false;
  private fileUri: string | null = null;
  private options: LspClientOptions;
  private _startPromise: Promise<void> | null = null;
  private _notificationHandlers: Set<NotificationHandler> = new Set();

  onDiagnostics: ((uri: string, diagnostics: unknown[]) => void) | null = null;

  /** @deprecated Use onNotificationAdd() for multi-listener support */
  onNotification: ((msg: JsonRpcMessage) => void) | null = null;

  constructor(options: LspClientOptions) {
    this.options = options;
    this.transport.onNotificationCallback((msg) => {
      if (msg.method === "textDocument/publishDiagnostics") {
        const params = msg.params as { uri: string; diagnostics: unknown[] };
        this.onDiagnostics?.(params.uri, params.diagnostics);
      }
      this.onNotification?.(msg);
      for (const handler of this._notificationHandlers) {
        handler(msg);
      }
    });
  }

  /** Register a notification listener. Returns an unsubscribe function. */
  onNotificationAdd(handler: NotificationHandler): () => void {
    this._notificationHandlers.add(handler);
    return () => { this._notificationHandlers.delete(handler); };
  }

  async start(): Promise<void> {
    if (!this._startPromise) {
      this._startPromise = this._doStart();
    }
    await this._startPromise;
  }

  private async _doStart(): Promise<void> {
    try {
      await this.transport.spawn(this.options.command, this.options.args ?? []);
      console.log("azprose:lsp:spawned", this.options.command);

      // Give tinymist time to finish its setup before sending initialize
      await new Promise((r) => setTimeout(r, 500));

      // Initialize LSP with 20s timeout
      const initPromise = this.transport.request("initialize", {
        processId: null,
        clientInfo: { name: "azprose", version: "0.1.0" },
        capabilities: {},
      });
      const timeout = new Promise<void>((_, r) =>
        setTimeout(() => r(new Error("init timeout")), 20000),
      );
      await Promise.race([initPromise, timeout]);

      console.log("azprose:lsp:initialized");
      this.transport.notify("initialized", {});
      this.initialized = true;
    } catch (err) {
      console.warn("azprose:lsp:start failed, continuing without LSP", err);
      this._startPromise = null; // allow retry
      this.initialized = true; // don't block openFile
    }
  }

  async openFile(filePath: string, source: string): Promise<void> {
    // Wait for start to complete before opening files
    if (this._startPromise) await this._startPromise;

    const uri = fileUri(filePath);
    this.fileUri = uri;

    this.transport.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: this.options.languageId,
        version: 1,
        text: source,
      },
    });
  }

  async changeFile(source: string, version = 2): Promise<void> {
    if (!this.fileUri) return;
    this.transport.notify("textDocument/didChange", {
      textDocument: { uri: this.fileUri, version },
      contentChanges: [{ text: source }],
    });
  }

  async closeFile(): Promise<void> {
    if (!this.fileUri) return;
    this.transport.notify("textDocument/didClose", {
      textDocument: { uri: this.fileUri },
    });
    this.fileUri = null;
  }

  async request<T = unknown>(method: string, params: unknown): Promise<T | null> {
    return (await this.transport.request(method, params)) as T | null;
  }

  /** Send a workspace/executeCommand request (standard LSP way to invoke commands). */
  async executeCommand<T = unknown>(command: string, args: unknown[] = []): Promise<T | null> {
    return this.request<T>("workspace/executeCommand", { command, arguments: args });
  }

  async stop(): Promise<void> {
    if (this.initialized) {
      try {
        await this.transport.request("shutdown", null);
      } catch { /* ignore */ }
      this.transport.notify("exit", {});
      this.initialized = false;
    }
    await this.transport.kill();
  }
}

function fileUri(filePath: string): string {
  if (filePath.startsWith("file://")) return filePath;
  if (filePath.startsWith("/")) return `file://${filePath}`;
  return `file:///${filePath}`;
}
