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
import { surveillerSilence } from "./silence";
import type {
  AgentRequest,
  ClientCapabilities,
  ContentBlock,
  InitializeResult,
  PromptResult,
  SessionUpdate,
} from "./types";
import type { ConfigOption } from "./config-options";
import { STORAGE_KEYS } from "@/lib/storage";

/** Id unique du processus agent dans le pont Rust (une session agent par
 *  fenêtre projet — D10 : conversation en mémoire, neuve à chaque lancement). */
const AGENT_PROCESS_ID = "agent";

/** Silence maximal d'un prompt avant abandon : une génération saine émet
 *  des updates en continu ; 90 s sans AUCUN signe de vie = boucle de
 *  réessai serveur (quota épuisé…) — on rend la main avec une erreur
 *  explicite plutôt qu'un spinner de 10 minutes. */
const INACTIVITE_PROMPT_MS = 90_000;

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

/** Résultat de `session/new` — l'identifiant ET les options de configuration
 *  déclarées par l'agent (ACP v1 « Session Config Options », stabilisé) :
 *  c'est par elles qu'on sait QUELS modèles sont utilisables et lequel tourne.
 *  Tableau VIDE si l'agent n'en fournit pas (binaire ancien, autre
 *  implémentation) — l'appelant dégrade, jamais d'erreur. */
export interface SessionNouvelle {
  sessionId: string;
  configOptions: ConfigOption[];
}

export interface AgentClient {
  /** Spawn + initialize. Rejette avec `agent.notInstalled` si le binaire
   *  est absent (ENOENT) — l'UI affiche un message clair, jamais d'échec muet. */
  start(): Promise<InitializeResult>;
  newSession(cwd: string, mcpServers?: McpServerDecl[]): Promise<SessionNouvelle>;
  prompt(
    sessionId: string,
    text: string,
    annexes?: ContentBlock[],
  ): Promise<PromptResult>;
  cancel(sessionId: string): Promise<void>;
  /** Change une option de configuration de la session À CHAUD — chemin
   *  DOCUMENTÉ (ACP v1 : `session/set_config_option`, catégorie `model` pour
   *  le modèle). La réponse porte l'état COMPLET des options (des choix
   *  dépendants peuvent avoir suivi) ; l'appelant s'en sert pour rafraîchir
   *  son affichage. Rejette si la méthode manque (-32601, agent ancien) ou si
   *  la valeur est refusée — à l'appelant de distinguer et replier. */
  setConfigOption(sessionId: string, configId: string, value: string): Promise<ConfigOption[]>;
  /** Repli HISTORIQUE du changement de modèle (`session/set_model`) — non
   *  documentée dans le protocole mais réelle sur OpenCode 1.18.11, gardée
   *  pour les binaires sans configOptions. Ne rend PAS d'état : l'appelant ne
   *  peut pas rafraîchir sa liste depuis cette réponse. */
  setModel(sessionId: string, modelId: string): Promise<void>;
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

    async newSession(cwd: string, mcpServers: McpServerDecl[] = []): Promise<SessionNouvelle> {
      if (!started) throw new Error("agent non démarré (start() requis)");
      const result = (await transport.sendRequest("session/new", {
        cwd,
        mcpServers,
      })) as { sessionId?: string; configOptions?: unknown };
      if (!result?.sessionId) throw new Error("session/new : sessionId absent de la réponse");
      return {
        sessionId: result.sessionId,
        configOptions: Array.isArray(result.configOptions)
          ? (result.configOptions as ConfigOption[])
          : [],
      };
    },

    prompt(
      sessionId: string,
      text: string,
      annexes: ContentBlock[] = [],
    ): Promise<PromptResult> {
      // Un prompt peut être long (génération LLM) : timeout très au-delà du
      // défaut du transport. L'annulation passe par cancel(), pas par un délai.
      // Annexes = blocs ACP additionnels (resource_link des mentions @fichier)
      // — le serveur les convertit en pièces jointes, contenu embarqué.
      //
      // Chien de garde d'inactivité (mesures 2026-08-22, sondes sonde-go-*):
      // sur certaines erreurs (quota hebdo épuisé), OpenCode RETENTE en
      // boucle sans aucune notification — ni réponse, ni effet à cancel().
      // Sans ce chien : spinner infini jusqu'au timeout total (10 min).
      // Une génération saine émet des updates en continu, elle ne déclenchera
      // jamais le rejet ; chaque notification réarme le compteur.
      const surveillance = surveillerSilence(
        transport.sendRequest(
          "session/prompt",
          { sessionId, prompt: [{ type: "text", text }, ...annexes] },
          600_000,
        ) as Promise<PromptResult>,
        INACTIVITE_PROMPT_MS,
      );
      const off = transport.onNotification(() => surveillance.battre());
      return surveillance.resultat.finally(() => {
        off();
        surveillance.arreter();
      });
    },

    async cancel(sessionId: string): Promise<void> {
      transport.sendNotification("session/cancel", { sessionId });
    },

    async setConfigOption(sessionId: string, configId: string, value: string): Promise<ConfigOption[]> {
      // La spec garantit une réponse portant l'état complet — mais un agent
      // défaillant peut répondre vide : tableau vide plutôt qu'exception.
      const result = (await transport.sendRequest("session/set_config_option", {
        sessionId,
        configId,
        value,
      })) as { configOptions?: unknown } | undefined;
      return Array.isArray(result?.configOptions) ? (result.configOptions as ConfigOption[]) : [];
    },

    async setModel(sessionId: string, modelId: string): Promise<void> {
      // Réponse attendue ({}) mais vide : seule l'erreur compte.
      await transport.sendRequest("session/set_model", { sessionId, modelId });
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
