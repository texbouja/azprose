// Client agent — SEULE API exposée au reste d'AZprose, en termes MÉTIER
// (« envoyer un prompt », « annuler »), jamais en termes de protocole (D3 :
// le nom « opencode » n'apparaît que dans la résolution du binaire).
//
// P2 : AUCUNE capacité déclarée à l'initialize (P3 — le contrat ne promet
// que ce qui est implémenté ; `fs` arrive en phase 4, `terminal` en phase 6).
//
// Mesure de phase 0 (OpenCode 1.18.11) : l'agent exécute ses outils INTERNES
// sans passer par les `fs/*` du client, même quand ils sont déclarés — le
// garde-fou réel côté OpenCode est `session/request_permission` (phase 4).

import { createAcpTransport, type AcpTransport } from "./transport";
import type {
  AgentRequest,
  ClientCapabilities,
  InitializeResult,
  PromptResult,
  SessionUpdate,
} from "./types";
import { STORAGE_KEYS } from "@/lib/storage";

/** Id unique du processus agent dans le pont Rust (une session agent par
 *  fenêtre projet — D10 : conversation en mémoire, neuve à chaque lancement). */
const AGENT_PROCESS_ID = "agent";

export interface AgentClientOptions {
  /** Racine du vault — `cwd` de la session (D13). */
  cwd: string;
  /** Capacités annoncées à l'initialize. Défaut P2 : aucune. */
  capabilities?: ClientCapabilities;
  /** Chemin explicite du binaire (surcharge le réglage persisté/PATH). */
  binaryPath?: string;
  /** Variables d'environnement du sous-processus (ex. `OPENCODE_CONFIG_CONTENT`
   *  — voir context.ts : instructions + permissions, config inline MERGÉE). */
  env?: Record<string, string>;
  /** Injection de dépendances pour les tests (P6 : jamais mock.module). */
  transport?: AcpTransport;
  /** Requêtes agent→client (fs/*, permissions…). Non traitée → -32601. */
  onServerRequest?: (req: AgentRequest) => Promise<unknown> | unknown;
}

/** Serveur MCP déclaré à la session — **forme mesurée en R0** contre OpenCode
 *  1.18.11 : `type` et `headers` sont OBLIGATOIRES, une déclaration réduite à
 *  `{name, url}` est rejetée en `-32602 Invalid params`. */
export interface McpServerDecl {
  name: string;
  type: "http";
  url: string;
  headers: { name: string; value: string }[];
}

export interface AgentClient {
  /** Spawn + initialize. Rejette avec `agent.notInstalled` si le binaire
   *  est absent (ENOENT) — l'UI affiche un message clair, jamais d'échec muet. */
  start(): Promise<InitializeResult>;
  newSession(cwd: string, mcpServers?: McpServerDecl[]): Promise<string>;
  prompt(sessionId: string, text: string): Promise<PromptResult>;
  cancel(sessionId: string): Promise<void>;
  onUpdate(cb: (u: SessionUpdate) => void): () => void;
  stop(): Promise<void>;
}

class AgentNotInstalledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentNotInstalledError";
  }
}

/** Résolution du binaire (D6 — sidecar PUR) : réglage explicite s'il existe,
 *  sinon `opencode` nu, résolu par le PATH. Aucun cache, aucun téléchargement.
 *  Exportée pour les tests (module pur, DI — P6 : jamais mock.module). */
export function resolveAgentBinary(override?: string): string {
  if (override?.trim()) return override.trim();
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.agentBinaryPath);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === "string" && parsed.trim()) return parsed.trim();
    }
  } catch { /* clé absente ou invalide : repli PATH */ }
  return "opencode";
}

export function createAgentClient(options: AgentClientOptions): AgentClient {
  const command = resolveAgentBinary(options.binaryPath);
  const transport =
    options.transport ?? createAcpTransport(AGENT_PROCESS_ID, command, ["acp"], options.env);

  if (options.onServerRequest) transport.onServerRequest(options.onServerRequest);

  let started = false;

  return {
    async start() {
      try {
        const result = (await transport.sendRequest("initialize", {
          protocolVersion: 1,
          clientCapabilities: options.capabilities ?? {},
          clientInfo: { name: "AZprose", version: "0.1.0" },
        })) as InitializeResult;
        started = true;
        return result;
      } catch (e) {
        const msg = String(e);
        // spawn ENOENT remonte en « failed to spawn … » depuis le pont Rust.
        if (/failed to spawn|not found|ENOENT/i.test(msg)) {
          throw new AgentNotInstalledError(command);
        }
        throw e;
      }
    },

    async newSession(cwd: string, mcpServers: McpServerDecl[] = []): Promise<string> {
      if (!started) throw new Error("agent non démarré (start() requis)");
      const result = (await transport.sendRequest("session/new", {
        cwd,
        mcpServers,
      })) as { sessionId: string };
      return result.sessionId;
    },

    async prompt(sessionId: string, text: string): Promise<PromptResult> {
      // Un prompt peut être long (génération LLM) : timeout très au-delà du
      // défaut du transport. L'annulation passe par cancel(), pas par un délai.
      return (await transport.sendRequest(
        "session/prompt",
        { sessionId, prompt: [{ type: "text", text }] },
        600_000,
      )) as PromptResult;
    },

    async cancel(sessionId: string): Promise<void> {
      transport.sendNotification("session/cancel", { sessionId });
    },

    onUpdate(cb) {
      return transport.onNotification((method, params) => {
        if (method === "session/update") {
          cb((params as { update: SessionUpdate }).update);
        }
      });
    },

    async stop() {
      await transport.kill();
    },
  };
}
