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

/** Dépendances Tauri injectables (jamais mock.module — règle P6). Sans
 *  elles, un échec de `acp_spawn` n'était testable qu'en simulant le
 *  transport entier, c'est-à-dire en sautant justement le code fautif. */
export interface DepsTransport {
  invoquer(commande: string, args: Record<string, unknown>): Promise<unknown>;
  ecouter(nom: string, cb: (charge: unknown) => void): Promise<() => void>;
}

function depsParDefaut(): DepsTransport {
  return {
    invoquer: (commande, args) => invoke(commande, args),
    ecouter: (nom, cb) => listen(nom, (ev) => cb(ev.payload)),
  };
}

export function createAcpTransport(
  id: string,
  command: string,
  args: string[],
  env?: Record<string, string>,
  depsPartielles?: Partial<DepsTransport>,
): AcpTransport {
  const deps: DepsTransport = { ...depsParDefaut(), ...depsPartielles };
  let spawnPromise: Promise<void> | null = null;
  let reqId = 0;
  const pending = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const notifHandlers: Array<(method: string, params: unknown) => void> = [];
  let serverReqHandler: ((req: AgentRequest) => Promise<unknown> | unknown) | null = null;
  let dead = false;
  // Désabonnements des trois écouteurs Tauri. L'id de processus étant
  // CONSTANT, des écouteurs laissés vivants après destruction du panneau
  // captent les événements du panneau suivant (stderr journalisé N fois
  // après N ouvertures) — modèle correct recopié de serve.ts.
  let desabonnements: Array<() => void> = [];

  const desabonnerTout = () => {
    for (const off of desabonnements) {
      try { off(); } catch { /* écouteur déjà retiré */ }
    }
    desabonnements = [];
  };

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
        await deps.invoquer("acp_spawn", { id, command, args, env: env ?? null });
        desabonnements.push(
          await deps.ecouter("acp://output", (charge) => {
            const p = charge as { id?: unknown; data?: unknown };
            if (p.id === id && typeof p.data === "string") routeMessage(p.data);
          }),
        );
        desabonnements.push(
          await deps.ecouter("acp://stderr", (charge) => {
            const p = charge as { id?: unknown; data?: unknown };
            if (p.id === id && typeof p.data === "string") console.log(`[agent:stderr] ${p.data.trimEnd()}`);
          }),
        );
        desabonnements.push(
          await deps.ecouter("acp://exit", (charge) => {
            // Le pont Rust émet l'id NU ici (contrairement à output/stderr qui
            // portent {id, data}) — on tolère les deux formes par prudence.
            const c = charge as string | { id?: string };
            const sortiId = typeof c === "string" ? c : c?.id;
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
            // Le transport est définitivement mort (`dead` barre toute
            // requête ultérieure) : ses écouteurs n'ont plus rien à écouter.
            desabonnerTout();
          }),
        );
      })();
    }
    return spawnPromise;
  };

  /** Écrit une trame NDJSON, en garantissant le spawn au préalable. Rejette —
   *  c'est à l'appelant de décider quoi faire du rejet. */
  const ecrire = async (payload: unknown): Promise<void> => {
    await ensureSpawned();
    await deps.invoquer("acp_write", { id, content: JSON.stringify(payload) });
  };

  /** Variante « au fil de l'eau » pour les trames sans réponse attendue
   *  (notifications, réponses aux requêtes de l'agent) : personne n'attend,
   *  donc l'échec ne peut que se journaliser. */
  const ecrireDetache = (payload: unknown) => {
    void ecrire(payload).catch((e) => console.error("[agent] écriture échouée :", e));
  };

  const self: AcpTransport = {
    async sendRequest(method, params, timeoutMs = 30_000) {
      if (dead) throw new Error("agent process exited");
      // Le spawn est attendu AVANT d'armer la minuterie, et son rejet est
      // propagé tel quel : sinon un binaire absent se traduisait par 30 s
      // d'attente puis un « sendRequest timeout », chaîne que la détection
      // d'« agent introuvable » (client.ts) ne reconnaît pas — la bannière
      // dédiée, pourtant traduite et câblée, ne s'affichait jamais.
      await ensureSpawned();
      const rid = ++reqId;
      return await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(rid);
          reject(new Error(`sendRequest timeout: ${method} (id=${rid})`));
        }, timeoutMs);
        pending.set(rid, { resolve, reject, timer });
        // Écriture échouée = réponse impossible : inutile d'attendre le délai.
        ecrire({ jsonrpc: "2.0", id: rid, method, params: params ?? {} }).catch((e) => {
          if (!pending.delete(rid)) return;
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(String(e)));
        });
      });
    },
    sendNotification(method, params) {
      ecrireDetache({ jsonrpc: "2.0", method, params: params ?? {} });
    },
    respond(id, result) {
      ecrireDetache({ jsonrpc: "2.0", id, result });
    },
    respondError(id, code, message) {
      ecrireDetache({ jsonrpc: "2.0", id, error: { code, message } });
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
      desabonnerTout();
      try { await deps.invoquer("acp_kill", { id }); } catch { /* déjà mort */ }
    },
  };

  return self;
}
