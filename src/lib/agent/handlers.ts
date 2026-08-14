// Requêtes agent→client de la phase 4 : `fs/*` (accès DISQUE PUR — D9, aucun
// contact avec CodeMirror) et `session/request_permission` (garde-fou D12).
//
// Pourquoi le disque pur est suffisant : si l'agent modifie un fichier ouvert,
// `checkExternalChanges` (src/lib/app-events.ts) gère déjà les deux cas —
// buffer propre → rechargement + toast ; buffer modifié → conflit arbitré par
// l'utilisateur. Ne RIEN ajouter à ce mécanisme : il couvre le cas dangereux.
//
// Permissions (D12) : par appel d'outil, trois issues — une fois / toujours
// POUR CETTE SESSION (en mémoire, jamais écrit sur disque) / refuser. Un refus
// DOIT renvoyer une réponse ACP valide (`outcome: cancelled`) : une absence
// de réponse figerait l'agent, qui attend.

import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { AgentRequest } from "./types";

/** Dépendances fs injectables (tests — P6 : jamais mock.module). */
export interface AgentFsDeps {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

const diskDeps: AgentFsDeps = {
  readFile: (path) => readTextFile(path),
  writeFile: (path, content) => writeTextFile(path, content),
};

export interface PermissionOption {
  optionId: string;
  name?: string;
  kind?: string; // "allow_once" | "allow_always" | "reject_once" | "reject_always"
}

export interface PermissionRequest {
  toolCallId: string;
  title: string;
  location?: string;
  options: PermissionOption[];
}

/** L'UI rend la demande dans le fil et renvoie l'optionId choisi,
 *  ou null si l'utilisateur a annulé/fermé sans décider. */
export type PermissionPrompt = (req: PermissionRequest) => Promise<string | null>;

export interface AgentHandlers {
  handle(req: AgentRequest): Promise<unknown>;
}

export function createAgentHandlers(
  deps: AgentFsDeps = diskDeps,
  onPermission?: PermissionPrompt,
): AgentHandlers {
  // « Toujours » mémorisé par TITRE d'outil (ex. « write », « bash ») —
  // la session seule vit ici ; rien n'est persisté (D12).
  const alwaysAllowed = new Set<string>();

  /** Choisit l'option « allow » la plus permanente offerte par l'agent. */
  function bestAllowOption(options: PermissionOption[]): PermissionOption | undefined {
    return (
      options.find((o) => o.kind === "allow_always") ??
      options.find((o) => o.kind === "allow_once") ??
      options.find((o) => o.kind?.startsWith("allow"))
    );
  }

  return {
    async handle(req: AgentRequest): Promise<unknown> {
      switch (req.method) {
        case "fs/read_text_file": {
          const p = (req.params ?? {}) as { path?: string };
          if (!p.path) throw new Error("fs/read_text_file: path manquant");
          return { content: await deps.readFile(p.path) };
        }
        case "fs/write_text_file": {
          const p = (req.params ?? {}) as { path?: string; content?: string };
          if (!p.path) throw new Error("fs/write_text_file: path manquant");
          await deps.writeFile(p.path, p.content ?? "");
          return null;
        }
        case "session/request_permission": {
          const p = (req.params ?? {}) as {
            toolCall?: { toolCallId?: string; title?: string; locations?: Array<{ path: string }> };
            options?: PermissionOption[];
          };
          const options = p.options ?? [];
          const title = p.toolCall?.title ?? "?";

          // « Toujours » déjà donné pour cet outil : réponse immédiate, sans
          // repasser par l'utilisateur.
          if (alwaysAllowed.has(title)) {
            const allow = bestAllowOption(options);
            if (allow) return { outcome: { outcome: "selected", optionId: allow.optionId } };
          }

          const chosen = onPermission
            ? await onPermission({
                toolCallId: p.toolCall?.toolCallId ?? "",
                title,
                location: p.toolCall?.locations?.[0]?.path,
                options,
              })
            : null;

          if (chosen === null) {
            // Refus ou absence de réponse = annulation EXPLICITE (jamais de
            // silence : l'agent attend une réponse pour continuer).
            return { outcome: { outcome: "cancelled" } };
          }
          const opt = options.find((o) => o.optionId === chosen);
          if (opt?.kind === "allow_always") alwaysAllowed.add(title);
          return { outcome: { outcome: "selected", optionId: chosen } };
        }
        default:
          // Filet : le transport renvoie -32601 (P4). Une méthode qui tombe
          // ici ne devrait pas exister — ses capacités ne sont pas déclarées.
          return undefined;
      }
    },
  };
}
