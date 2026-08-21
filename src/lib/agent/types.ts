// Types ACP (Agent Client Protocol) — sous-ensemble retenu par AZprose.
// Couvre ce que le client sait émettre et recevoir ; tout bloc de
// `session/update` inconnu doit être conservé tel quel et affiché en repli
// neutre par l'UI (D8 : rendu générique, jamais d'erreur sur l'inconnu).

import type { ConfigOption } from "./config-options";

/** Capacités déclarées à l'agent dans `initialize` (contrat — P3 : ne jamais
 *  promettre ce qui n'est pas implémenté à la phase courante). */
export interface ClientCapabilities {
  fs?: { readTextFile: boolean; writeTextFile: boolean };
  terminal?: boolean;
}

/** Capacités annoncées par l'agent dans sa réponse à `initialize`. */
export interface AgentCapabilities {
  loadSession?: boolean;
  mcpCapabilities?: { http?: boolean; sse?: boolean };
  promptCapabilities?: { embeddedContext?: boolean; image?: boolean; audio?: boolean };
  sessionCapabilities?: Record<string, unknown>;
}

export interface InitializeResult {
  protocolVersion: number;
  agentCapabilities?: AgentCapabilities;
  agentInfo?: { name?: string; version?: string };
  authMethods?: Array<{ id: string; name: string; description?: string }>;
}

/** Un bloc de contenu dans un prompt ou un message (forme la plus courante). */
export interface ContentBlock {
  type: string; // "text" | "image" | "resource" | …
  text?: string;
  [key: string]: unknown;
}

/** Charge `update` d'une notification `session/update`. Le discriminateur est
 *  `sessionUpdate` ; les variantes listées sont celles observées en phase 0
 *  (OpenCode 1.18.11) — toute autre valeur reste valide (repli générique). */
export interface SessionUpdate {
  sessionUpdate: string;
  messageId?: string;
  content?: ContentBlock;
  toolCallId?: string;
  title?: string;
  kind?: string;
  status?: string; // "pending" | "in_progress" | "completed" | "failed"
  locations?: Array<{ path: string }>;
  rawInput?: unknown;
  rawOutput?: unknown;
  availableCommands?: Array<{ name: string; description?: string }>;
  /** Variante `config_option_update` : l'agent a changé ses options LUI-MÊME
   *  (repli de fournisseur, changement de mode…) — état complet, ACP v1. */
  configOptions?: ConfigOption[];
  [key: string]: unknown;
}

export interface SessionUpdateParams {
  sessionId: string;
  update: SessionUpdate;
}

export interface PromptResult {
  stopReason?: string;
  usage?: Record<string, unknown>;
}

/** Requête agent→client (ex. `fs/read_text_file`,
 *  `session/request_permission`) : a un `id` et ATTEND une réponse. */
export interface AgentRequest {
  method: string;
  id: number | string;
  params?: unknown;
}

/** Réponse à une `session/request_permission` (forme ACP standard). */
export interface PermissionOutcome {
  outcome: { outcome: "selected"; optionId: string } | { outcome: "cancelled" };
}
