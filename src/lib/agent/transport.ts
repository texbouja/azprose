// Transport ACP : pont vers le sous-processus agent spawné par la commande
// Rust `acp_spawn`. Calque de `src/lib/lsp/transport.ts` SANS la dépendance à
// `@codemirror/lsp-client` — ACP n'a rien à voir avec CodeMirror.
//
// Cadrage NDJSON fait côté Rust (acp_bridge.rs) : chaque événement
// `acp://output` porte UNE ligne JSON complète. Le `\n` en écriture est
// ajouté par Rust — ici on n'envoie que du `JSON.stringify` (jamais de `\n`
// littéral dans la charge, NDJSON l'interdit).
//
// Requêtes agent→client (P4) : elles portent un `id` et attendent une
// réponse. Le filet `-32601` reste en place pour les méthodes non gérées,
// mais une capacité non implémentée ne doit JAMAIS avoir été déclarée (P3).

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AgentRequest } from "./types";

export interface AcpTransport {
  /** Envoyer une requête JSON-RPC et attendre sa réponse. */
  sendRequest(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
  /** Envoyer une notification (pas de réponse attendue). */
  sendNotification(method: string, params?: unknown): void;
  /** Répondre à une requête de l'agent. */
  respond(id: number | string, result: unknown): void;
  /** Répondre une erreur à une requête de l'agent. */
  respondError(id: number | string, code: number, message: string): void;
  /** S'abonner aux notifications de l'agent (ex. `session/update`). */
  onNotification(handler: (method: string, params: unknown) => void): () => void;
  /** Traiter les requêtes agent→client. Renvoyer `undefined` → -32601. */
  onServerRequest(handler: ((req: AgentRequest) => Promise<unknown> | unknown) | null): void;
  /** Arrêter le processus agent. */
  kill(): Promise<void>;
}

export function createAcpTransport(
  id: string,
  command: string,
  args: string[],
  env?: Record<string, string>,
): AcpTransport {
  let spawnPromise: Promise<void> | null = null;
  let reqId = 0;
  const pending = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const notifHandlers: Array<(method: string, params: unknown) => void> = [];
  let serverReqHandler: ((req: AgentRequest) => Promise<unknown> | unknown) | null = null;
  let dead = false;

  const routeMessage = (raw: string) => {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.error(`[agent] ligne NDJSON non parsable : ${raw.slice(0, 200)}`);
      return;
    }

    // Réponse à une de nos requêtes (id connu, result/error).
    if (msg.id !== undefined && ("result" in msg || "error" in msg) && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
      else p.resolve(msg.result);
      return;
    }

    // Requête agent→client (method + id) : réponse OBLIGATOIRE (P4).
    if (msg.method && msg.id !== undefined) {
      const req: AgentRequest = { method: msg.method, id: msg.id, params: msg.params };
      if (!serverReqHandler) {
        self.respondError(msg.id, -32601, "Method not implemented");
        return;
      }
      Promise.resolve()
        .then(() => serverReqHandler!(req))
        .then((result) => {
          if (result === undefined) self.respondError(msg.id, -32601, "Method not implemented");
          else self.respond(msg.id, result ?? null);
        })
        .catch((e) => self.respondError(msg.id, -32603, String(e)));
      return;
    }

    // Notification (method sans id).
    if (msg.method) {
      for (const h of notifHandlers) {
        try { h(msg.method, msg.params); } catch (e) { console.error("[agent] handler notification :", e); }
      }
    }
  };

  const ensureSpawned = (): Promise<void> => {
    if (!spawnPromise) {
      spawnPromise = (async () => {
        await invoke("acp_spawn", { id, command, args, env: env ?? null });
        await listen<{ id: string; data: string }>("acp://output", (ev) => {
          if (ev.payload.id === id) routeMessage(ev.payload.data);
        });
        await listen<{ id: string; data: string }>("acp://stderr", (ev) => {
          if (ev.payload.id === id) console.log(`[agent:stderr] ${ev.payload.data.trimEnd()}`);
        });
        await listen<unknown>("acp://exit", (ev) => {
          // Le pont Rust émet l'id NU ici (contrairement à output/stderr qui
          // portent {id, data}) — on tolère les deux formes par prudence.
          const charge = ev.payload as string | { id?: string };
          const sortiId = typeof charge === "string" ? charge : charge?.id;
          if (sortiId !== id) return;
          dead = true;
          console.warn(`[agent] processus terminé — id=${id}`);
          // Toute requête en vol est rejetée : sans ça elle attendrait son
          // timeout alors que le processus n'existe plus.
          for (const [rid, p] of pending) {
            clearTimeout(p.timer);
            p.reject(new Error("agent process exited"));
            pending.delete(rid);
          }
        });
      })();
    }
    return spawnPromise;
  };

  const write = (payload: unknown) => {
    void ensureSpawned().then(() => {
      invoke("acp_write", { id, content: JSON.stringify(payload) })
        .catch((e) => console.error("[agent] écriture échouée :", e));
    });
  };

  const self: AcpTransport = {
    sendRequest(method, params, timeoutMs = 30_000) {
      return new Promise((resolve, reject) => {
        if (dead) { reject(new Error("agent process exited")); return; }
        const id = ++reqId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`sendRequest timeout: ${method} (id=${id})`));
        }, timeoutMs);
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
        write({ jsonrpc: "2.0", id, method, params: params ?? {} });
      });
    },
    sendNotification(method, params) {
      write({ jsonrpc: "2.0", method, params: params ?? {} });
    },
    respond(id, result) {
      write({ jsonrpc: "2.0", id, result });
    },
    respondError(id, code, message) {
      write({ jsonrpc: "2.0", id, error: { code, message } });
    },
    onNotification(handler) {
      notifHandlers.push(handler);
      return () => {
        const i = notifHandlers.indexOf(handler);
        if (i >= 0) notifHandlers.splice(i, 1);
      };
    },
    onServerRequest(handler) {
      serverReqHandler = handler;
    },
    async kill() {
      try { await invoke("acp_kill", { id }); } catch { /* déjà mort */ }
    },
  };

  return self;
}
