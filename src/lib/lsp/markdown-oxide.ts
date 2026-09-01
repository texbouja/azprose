import { LSPClient, type LSPClientConfig, type LSPClientExtension, serverCompletion, serverDiagnostics } from "@codemirror/lsp-client";
import { createTauriTransport, killTransport, type TauriTransport } from "./transport";
import { MultiViewWorkspace } from "./multi-view-workspace";
import { DEFAULT_MOXIDE_TOML, patchCalloutCompletions } from "@/lib/moxide-config";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";
import { logStore } from "@/components/console/log.svelte";
import { getProjectRoot } from "@/lib/session";
import {
  estSurveille,
  surveillantsDeLEnregistrement,
  MODIFIE,
  type Surveillant,
  type TypeChangement,
} from "./watched-files";
import type { Diagnostic } from "@/lib/diagnostics";
import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { emit } from "@tauri-apps/api/event";

// ── Markdown-Oxide Singleton ────────────────────────────────────

let _client: LSPClient | null = null;
let _id: string | null = null;
let _transport: TauriTransport | null = null;
let _reqId = 0;

// Surveillants de fichiers demandés par le serveur (`client/registerCapability`),
// indexés par identifiant d'enregistrement pour pouvoir les retirer.
// Vide = le serveur n'a rien demandé (encore) ; `estSurveille` laisse alors
// passer tout le Markdown plutôt que de se taire.
let _enregistrements = new Map<string, Surveillant[]>();
let _surveillants: Surveillant[] = [];

function recalculerSurveillants(): void {
  _surveillants = [..._enregistrements.values()].flat();
}

function toSeverity(s: number): "error" | "warning" | "info" {
  if (s === 1) return "error";
  if (s === 2) return "warning";
  return "info";
}

// markdown-oxide requires didChangeWatchedFiles.dynamicRegistration to function properly.
const markdownOxideCapabilities: LSPClientExtension = {
  clientCapabilities: {
    workspace: {
      didChangeWatchedFiles: {
        dynamicRegistration: true,
      },
    },
  },
};

/**
 * Ensure a `.moxide.toml` exists at the vault root so markdown-oxide
 * can find it at initialize-time. Creates a minimal config if missing;
 * patches an existing one with `callout_completions = true` (settings are
 * only read at initialize, so the server is restarted when patched).
 */
export async function ensureMoxideConfig(rootPath: string | null): Promise<void> {
  if (!rootPath) return;
  try {
    const configPath = rootPath + "/.moxide.toml";
    if (!(await exists(configPath))) {
      await writeTextFile(configPath, DEFAULT_MOXIDE_TOML);
      console.log(`[markdown-oxide] created ${configPath}`);
      return;
    }
    // Existing config (e.g. created before callout_completions existed):
    // patch it and restart the server so the setting is picked up at the
    // next initialize (markdown-oxide does not hot-reload settings).
    const current = await readTextFile(configPath);
    const patched = patchCalloutCompletions(current);
    if (patched !== current) {
      await writeTextFile(configPath, patched);
      console.log(`[markdown-oxide] added callout_completions = true to ${configPath}`);
      if (isMarkdownOxideReady()) {
        await stopMarkdownOxide();
        console.log(`[markdown-oxide] config changed — server will restart on next .md open`);
      }
    }
  } catch (e) {
    console.warn(`[markdown-oxide] ensureMoxideConfig failed:`, e);
  }
}

// ── Helpers ─────────────────────────────────────────────────────

/** Send a workspace/executeCommand request to markdown-oxide. */
export function executeOxideCommand(command: string, args?: unknown[]): void {
  if (!_transport) {
    console.warn(`[markdown-oxide] executeOxideCommand: server not started`);
    return;
  }
  const id = ++_reqId;
  const req = JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "workspace/executeCommand",
    params: { command, arguments: args ?? [] },
  });
  console.log(`[markdown-oxide] → executeCommand: ${command}`, args ?? "");
  _transport.send(req);
}

/**
 * Send a direct JSON-RPC request to markdown-oxide and await the result.
 * Resolves with the `result` field, rejects on server error or timeout.
 * The response also reaches CM6's LSP client, which ignores unknown ids.
 */
export function requestMarkdownOxide<T = unknown>(
  method: string,
  params?: unknown,
  timeoutMs = 8000,
): Promise<T> {
  if (!_transport) {
    return Promise.reject(new Error(`[markdown-oxide] ${method}: server not started`));
  }
  return _transport.sendRequest(method, params, timeoutMs) as Promise<T>;
}

/**
 * Notify markdown-oxide that a file changed on disk. The server responds by
 * rebuilding its vault index — this keeps backlinks (textDocument/references)
 * and wikilink resolution fresh after a save. Messages are processed in order
 * on the same stream, so a request sent AFTER this notification sees the new index.
 */
export function notifyMarkdownOxideFileChanged(path: string): void {
  notifierChangementsSurveilles([{ path, type: MODIFIE }]);
}

/**
 * Envoie un lot de changements de fichiers surveillés.
 *
 * Le type compte : `2` (Modifié) sur un fichier que le serveur ne connaît pas
 * ne le fait pas entrer dans son index. C'est pourquoi les créations doivent
 * porter `1` et les suppressions `3` — l'ancienne version codait `2` en dur,
 * si bien qu'un fichier neuf n'apparaissait jamais dans la complétion.
 *
 * Les changements sont filtrés par les surveillants que le serveur a lui-même
 * enregistrés : lui envoyer ce qu'il n'a pas demandé ne sert qu'à disputer son
 * verrou d'index.
 */
export function notifierChangementsSurveilles(
  changements: readonly { path: string; type: TypeChangement }[],
): void {
  if (!_transport || changements.length === 0) return;
  const racine = getProjectRoot();
  const retenus = changements.filter((c) => estSurveille(c.path, c.type, _surveillants, racine));
  if (retenus.length === 0) return;
  const req = JSON.stringify({
    jsonrpc: "2.0",
    method: "workspace/didChangeWatchedFiles",
    params: {
      changes: retenus.map((c) => ({
        uri: "file://" + encodeURI(c.path.replace(/\\/g, "/")),
        type: c.type,
      })),
    },
  });
  _transport.send(req);
}

// ── Get Client ──────────────────────────────────────────────────

/**
 * Get the shared markdown-oxide LSPClient.
 * Created synchronously on first call; the actual process spawn
 * and LSP initialize happen lazily on first message.
 */
export function getMarkdownOxideClient(
  config?: {
    notificationHandlers?: LSPClientConfig["notificationHandlers"];
    unhandledNotification?: LSPClientConfig["unhandledNotification"];
  },
): LSPClient {
  if (_client) return _client;

  // rootUri tells markdown-oxide where the vault root is.
  // Falls back to cwd (app install dir) if no project is open.
  const root = getProjectRoot();
  const rootUri = root ? "file://" + encodeURI(root.replace(/\\/g, "/")) : undefined;

  _id = `markdown-oxide-${Date.now()}`;
  _transport = createTauriTransport(_id, "markdown-oxide", []);
  const transport = _transport;

  // ── Server request handler ──────────────────────────────────────
  // CM6's receiveMessage rejects ALL server requests with -32601.
  // We intercept server requests here and respond appropriately:
  //   - client/registerCapability → {result: null} (file watchers — no-op)
  //   - window/showDocument → open the file in editor, {result: {success:true}}
  //   - client/applyEdit → open files from workspace edit, {result: {applied:true}}
  //   - window/workDoneProgress/create → {result: null}
  //   - everything else → null (→ -32601)
  transport.onServerRequest((req) => {
    const { method, id, params } = req;

    // Le serveur nous dit ce qu'il veut voir surveillé. Répondre « OK » sans
    // rien enregistrer — ce que faisait cette branche — le laissait croire que
    // le client surveillait le coffre : il ne balayait donc jamais le disque, et
    // aucun fichier créé, renommé ou supprimé n'entrait dans son index.
    if (method === "client/registerCapability") {
      const p = params as { registrations?: Array<{ id?: string; method?: string }> } | undefined;
      const surveillants = surveillantsDeLEnregistrement(params);
      for (const enr of p?.registrations ?? []) {
        if (enr?.method !== "workspace/didChangeWatchedFiles" || !enr.id) continue;
        _enregistrements.set(enr.id, surveillants);
      }
      recalculerSurveillants();
      console.log(
        `[markdown-oxide] ← registerCapability : ${_surveillants.length} surveillant(s)`,
        _surveillants.map((s) => s.motif),
      );
      return JSON.stringify({ jsonrpc: "2.0", id, result: null });
    }

    // `unregisterations` (sic) : l'orthographe est celle du protocole.
    if (method === "client/unregisterCapability") {
      const p = params as { unregisterations?: Array<{ id?: string }> } | undefined;
      for (const enr of p?.unregisterations ?? []) {
        if (enr?.id) _enregistrements.delete(enr.id);
      }
      recalculerSurveillants();
      return JSON.stringify({ jsonrpc: "2.0", id, result: null });
    }

    if (method === "window/workDoneProgress/create") {
      return JSON.stringify({ jsonrpc: "2.0", id, result: null });
    }

    if (method === "window/showDocument") {
      const p = params as { uri?: string; selection?: unknown } | undefined;
      const uri = p?.uri;
      if (uri) {
        const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri;
        console.log(`[markdown-oxide] ← showDocument: ${filePath}`);
        emit("azprose:oxide-show-document", { path: filePath }).catch(() => {});
      }
      return JSON.stringify({ jsonrpc: "2.0", id, result: { success: true } });
    }

    if (method === "client/applyEdit") {
      const p = params as { edit?: { documentChanges?: Array<{ textDocument?: { uri: string } }>; changes?: Record<string, unknown> } } | undefined;
      const edit = p?.edit;
      if (edit?.documentChanges) {
        for (const change of edit.documentChanges) {
          const uri = change.textDocument?.uri;
          if (uri) {
            const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri;
            console.log(`[markdown-oxide] ← applyEdit (open): ${filePath}`);
            emit("azprose:oxide-show-document", { path: filePath }).catch(() => {});
          }
        }
      } else if (edit?.changes) {
        for (const uri of Object.keys(edit.changes)) {
          const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri;
          console.log(`[markdown-oxide] ← applyEdit (open): ${filePath}`);
          emit("azprose:oxide-show-document", { path: filePath }).catch(() => {});
        }
      }
      return JSON.stringify({ jsonrpc: "2.0", id, result: { applied: true } });
    }

    // Unknown server request → let CM6 handle (will get -32601)
    console.log(`[markdown-oxide] ← unhandled server request: ${method} (id=${id})`);
    return null;
  });

  // ── Notification handler: diagnostics + logs ────────────────────
  transport.subscribe((raw: string) => {
    try {
      const msg = JSON.parse(raw);

      // markdown-oxide sends window/logMessage (not $/logMessage)
      if (msg.method === "window/logMessage" || msg.method === "$/logMessage") {
        const text = msg.params?.message ?? "";
        if (text) logStore.append("markdown", text);
      }

      // Diagnostics from server
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
            source: "markdown",
          }),
        );
        diagnosticsStore.set("markdown", diags);
      }
    } catch {
      /* ignore parse errors */
    }
  });

  // Connect — CM6's receiveMessage subscribes here, but server requests
  // are intercepted by onServerRequest above so CM6 only handles responses.
  _client = new LSPClient({
    rootUri,
    notificationHandlers: config?.notificationHandlers,
    unhandledNotification: config?.unhandledNotification,
    extensions: [serverCompletion(), serverDiagnostics(), markdownOxideCapabilities],
    // The same .md can be open in the main editor AND the side preview
    // (which runs a live EditorView for jump-to-line); the default
    // workspace throws on a second view of a file.
    workspace: (client) => new MultiViewWorkspace(client),
  }).connect(transport);

  return _client;
}

/** Stop the markdown-oxide server. */
export async function stopMarkdownOxide(): Promise<void> {
  if (_id) {
    await killTransport(_id);
    _id = null;
  }
  _transport = null;
  _client = null;
  // Les enregistrements appartiennent à l'instance qui vient de mourir : les
  // garder ferait filtrer les changements du prochain serveur avec les motifs
  // de l'ancien, avant même qu'il ait pu enregistrer les siens.
  _enregistrements = new Map();
  _surveillants = [];
}

/** True once a markdown-oxide client has been created. */
export function isMarkdownOxideReady(): boolean {
  return _client !== null;
}

// ── Wikilink resolution via LSP ─────────────────────────────────

interface LspPosition {
  line: number;
  character: number;
}

interface LspLocation {
  uri: string;
  range: { start: LspPosition; end: LspPosition };
}

interface LspCompletionItem {
  label: string;
  textEdit?: { range: { start: LspPosition; end: LspPosition }; newText: string };
  documentation?: string | { value: string };
  data?: unknown;
}

/**
 * Find the position of `[[target` in the source text.
 * Returns { line, character } or null if not found.
 */
function findWikilinkPosition(source: string, target: string): LspPosition | null {
  const needle = `[[${target}`;
  const idx = source.indexOf(needle);
  if (idx === -1) return null;

  let line = 0;
  let col = 0;
  for (let i = 0; i < idx; i++) {
    if (source[i] === "\n") { line++; col = 0; }
    else col++;
  }
  return { line, character: col };
}

/**
 * Ask markdown-oxide to resolve a wikilink via LSP.
 * Tries textDocument/definition first, then textDocument/completion + resolve.
 * Returns the absolute file path, or null if all methods fail.
 */
export async function resolveWikilink(
  filePath: string,
  source: string,
  target: string,
): Promise<string | null> {
  if (!_client) {
    console.log(`[markdown-oxide] resolveWikilink: no client`);
    return null;
  }

  const pos = findWikilinkPosition(source, target);
  if (!pos) {
    console.log(`[markdown-oxide] resolveWikilink: "[[${target}" not found in source`);
    return null;
  }

  const fileUri = "file://" + encodeURI(filePath.replace(/\\/g, "/"));

  // Method 1: textDocument/definition
  try {
    console.log(`[markdown-oxide] resolveWikilink: trying definition at ${pos.line}:${pos.character}`);
    const defResult = await _client.request(
      "textDocument/definition" as never,
      { textDocument: { uri: fileUri }, position: pos } as never,
    ) as LspLocation | LspLocation[] | null;

    console.log(`[markdown-oxide] resolveWikilink: definition result =`, JSON.stringify(defResult));

    if (defResult) {
      const locations = Array.isArray(defResult) ? defResult : [defResult];
      const first = locations[0] as LspLocation & { targetUri?: string };
      const uri = first?.uri ?? first?.targetUri;
      if (uri) {
        const path = uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri;
        console.log(`[markdown-oxide] resolveWikilink: definition resolved to ${path}`);
        return path;
      }
    }
  } catch (e) {
    console.warn(`[markdown-oxide] resolveWikilink: definition failed:`, e);
  }

  // Method 2: textDocument/completion at [[ position — Oxide knows all links
  try {
    console.log(`[markdown-oxide] resolveWikilink: trying completion at ${pos.line}:${pos.character}`);
    const compResult = await _client.request(
      "textDocument/completion" as never,
      { textDocument: { uri: fileUri }, position: pos } as never,
    ) as LspCompletionItem[] | null;

    console.log(`[markdown-oxide] resolveWikilink: completion returned ${compResult?.length ?? 0} items`);

    if (compResult) {
      const match = compResult.find((item) => item.label === target);
      if (match) {
        console.log(`[markdown-oxide] resolveWikilink: found matching completion item`, JSON.stringify(match));
        if (match.textEdit) {
          console.log(`[markdown-oxide] resolveWikilink: textEdit.newText = "${match.textEdit.newText}"`);
        }
        // Try completionItem/resolve for full details
        if (match.data) {
          const resolved = await _client.request(
            "completionItem/resolve" as never,
            match as never,
          ) as LspCompletionItem;
          console.log(`[markdown-oxide] resolveWikilink: resolved item =`, JSON.stringify(resolved));
          const doc = resolved.documentation;
          if (typeof doc === "string") {
            console.log(`[markdown-oxide] resolveWikilink: documentation = "${doc}"`);
          } else if (doc && "value" in doc) {
            console.log(`[markdown-oxide] resolveWikilink: documentation = "${doc.value}"`);
          }
        }
      }
    }
  } catch (e) {
    console.warn(`[markdown-oxide] resolveWikilink: completion failed:`, e);
  }

  return null;
}
