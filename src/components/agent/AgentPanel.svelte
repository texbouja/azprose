<script lang="ts">
// Panneau « Assistant » — onglet custom du side panel (D5).
// Rendu GÉNÉRIQUE des blocs `session/update` (D8) : texte, réflexion, appel
// d'outil. Un bloc inconnu s'affiche en repli neutre, JAMAIS en erreur — il
// faut survivre aux montées de version de l'agent.
//
// Permissions (phase 4) : affichées DANS LE FIL, jamais en modale — un side
// panel est étroit, une modale y couperait le contexte au pire moment.
import { onMount, onDestroy, tick } from "svelte";
import { createAgentClient, type AgentClient } from "@/lib/agent/client";
import type { SessionUpdate } from "@/lib/agent/types";
import { getProjectRoot } from "@/lib/session";
import { getT, language } from "@/lib/i18n";

let t = $derived(getT($language));

// ── Items du fil ────────────────────────────────────────────────────────────
// Identifiants locaux croissants — les ids de l'agent (messageId, toolCallId)
// servent à l'AGRÉGATION, pas au rendu.
type FeedItem =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "agent"; text: string }
  | { id: number; kind: "thought"; text: string; open: boolean }
  | { id: number; kind: "tool"; toolCallId: string; title: string; toolKind: string; status: string; detail: string; open: boolean }
  | { id: number; kind: "permission"; requestId: number | string; description: string; resolved: boolean };

type Status = "starting" | "ready" | "busy" | "not-installed" | "error";

// Omit sur une union ne distribue pas (il garderait les clés COMMUNES) —
// d'où cette forme distributive pour construire un item sans son id.
type FeedItemDraft = FeedItem extends infer T ? (T extends FeedItem ? Omit<T, "id"> : never) : never;

let items = $state<FeedItem[]>([]);
let status = $state<Status>("starting");
let errorMessage = $state("");
let draft = $state("");
let feedEl = $state<HTMLElement | null>(null);
let nextId = 0;

let client: AgentClient | null = null;
let sessionId = $state<string | null>(null);
let offUpdate: (() => void) | null = null;
// Phase 4 y ajoutera `onServerRequest` (fs/*, permissions) ; en phase 3,
// aucune capacité n'est déclarée (P3) donc le filet -32601 du transport suffit.

// Agrégation des chunks streamés, par messageId (phase 0 : OpenCode émet des
// chunks de quelques caractères, jamais un message complet).
const messageItems = new Map<string, number>();
const toolItems = new Map<string, number>();

function pushItem(item: FeedItemDraft): number {
  const id = ++nextId;
  items.push({ ...item, id } as FeedItem);
  return id;
}

function applyUpdate(u: SessionUpdate) {
  switch (u.sessionUpdate) {
    case "agent_message_chunk":
    case "user_message_chunk": {
      const key = u.messageId ?? "?";
      const existing = messageItems.get(key);
      const text = u.content?.text ?? "";
      if (existing !== undefined) {
        const item = items.find((i) => i.id === existing);
        if (item && item.kind === "agent") item.text += text;
      } else {
        messageItems.set(key, pushItem({ kind: "agent", text }));
      }
      break;
    }
    case "agent_thought_chunk": {
      const key = u.messageId ?? "?";
      const existing = messageItems.get(`thought:${key}`);
      const text = u.content?.text ?? "";
      if (existing !== undefined) {
        const item = items.find((i) => i.id === existing);
        if (item && item.kind === "thought") item.text += text;
      } else {
        // Repliée par défaut (anatomie arrêtée) : la réflexion est un
        // contexte, pas le contenu.
        messageItems.set(`thought:${key}`, pushItem({ kind: "thought", text, open: false }));
      }
      break;
    }
    case "tool_call": {
      if (!u.toolCallId) break;
      toolItems.set(u.toolCallId, pushItem({
        kind: "tool",
        toolCallId: u.toolCallId,
        title: u.title ?? "?",
        toolKind: u.kind ?? "",
        status: u.status ?? "pending",
        detail: "",
        open: false,
      }));
      break;
    }
    case "tool_call_update": {
      const toolCallId = u.toolCallId;
      if (!toolCallId) break;
      const item = items.find((i) => i.id === toolItems.get(toolCallId));
      if (!item || item.kind !== "tool") break;
      if (u.status) item.status = u.status;
      if (u.title) item.title = u.title;
      const loc = u.locations?.[0]?.path;
      if (loc) item.detail = loc;
      // Déplié seulement s'il échoue (règle de rendu 2).
      if (u.status === "failed") item.open = true;
      break;
    }
    case "available_commands_update":
    case "usage_update":
      // Utiles au protocole, sans objet visuel dans ce panneau.
      break;
    default:
      // Repli neutre (D8) — l'inconnu ne casse jamais le fil.
      pushItem({ kind: "agent", text: "" });
      break;
  }
  scrollToBottom();
}

async function scrollToBottom() {
  // Le fil défile du haut, la saisie est ancrée en bas : chaque ajout doit
  // garder le dernier bloc visible sans intervention.
  await tick();
  feedEl?.scrollTo({ top: feedEl.scrollHeight });
}

async function startSession() {
  status = "starting";
  errorMessage = "";
  items = [];
  messageItems.clear();
  toolItems.clear();
  sessionId = null;
  try {
    client ??= createAgentClient({ cwd: getProjectRoot() ?? "/" });
    await client.start();
    offUpdate ??= client.onUpdate(applyUpdate);
    sessionId = await client.newSession(getProjectRoot() ?? "/");
    status = "ready";
  } catch (e) {
    if (e instanceof Error && e.name === "AgentNotInstalledError") {
      status = "not-installed";
    } else {
      status = "error";
      errorMessage = String(e);
    }
  }
}

async function send() {
  const text = draft.trim();
  if (!text || !client || !sessionId || status === "busy") return;
  pushItem({ kind: "user", text });
  draft = "";
  status = "busy";
  scrollToBottom();
  try {
    await client.prompt(sessionId, text);
  } catch (e) {
    pushItem({ kind: "agent", text: t("agent.errorDetail", { message: String(e) }) });
  } finally {
    status = "ready";
  }
}

async function cancel() {
  if (client && sessionId) await client.cancel(sessionId);
  status = "ready";
}

function onKeydown(e: KeyboardEvent) {
  // Entrée envoie, Maj+Entrée saute une ligne.
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void send();
  }
}

onMount(startSession);
onDestroy(() => {
  offUpdate?.();
  void client?.stop();
});
</script>

<div class="agent">
  <div class="agent__header">
    <span class="agent__title">{t("agent.title")}</span>
    <button
      class="agent__reset"
      data-tooltip={t("agent.reset")}
      aria-label={t("agent.reset")}
      onclick={startSession}
      disabled={status === "starting"}
    >
      <i class="wxi-rotate-ccw"></i>
    </button>
  </div>

  <div class="agent__feed" bind:this={feedEl}>
    {#if status === "not-installed"}
      <div class="agent__notice">{t("agent.notInstalled")}</div>
    {:else if status === "error"}
      <div class="agent__notice">{t("agent.error")}{errorMessage ? ` — ${errorMessage}` : ""}</div>
    {:else if status === "starting"}
      <div class="agent__notice">{t("agent.starting")}</div>
    {/if}

    {#each items as item (item.id)}
      {#if item.kind === "user"}
        <div class="agent__msg agent__msg--user">
          <div class="agent__who">{t("agent.you")}</div>
          <div class="agent__bubble">{item.text}</div>
        </div>
      {:else if item.kind === "thought"}
        <details class="agent__thought" bind:open={item.open}>
          <summary>{t("agent.thinking")}</summary>
          <div class="agent__thought-body">{item.text}</div>
        </details>
      {:else if item.kind === "tool"}
        <details class="agent__tool" bind:open={item.open} data-status={item.status}>
          <summary>
            <i class="wxi-wrench"></i>
            <span class="agent__tool-title">{item.title}</span>
            {#if item.detail}<span class="agent__tool-detail">{item.detail}</span>{/if}
            <span class="agent__tool-status">{item.status}</span>
          </summary>
        </details>
      {:else if item.kind === "agent"}
        {#if item.text}<div class="agent__msg agent__msg--agent">{item.text}</div>{/if}
      {/if}
    {/each}
  </div>

  <div class="agent__composer">
    <textarea
      bind:value={draft}
      onkeydown={onKeydown}
      placeholder={t("agent.placeholder")}
      rows="3"
      disabled={status !== "ready" && status !== "busy"}
    ></textarea>
    <div class="agent__actions">
      {#if status === "busy"}
        <button class="agent__btn" onclick={cancel} aria-label={t("agent.cancel")}>
          <i class="wxi-square"></i> {t("agent.cancel")}
        </button>
      {/if}
      <button
        class="agent__btn agent__btn--send"
        onclick={send}
        disabled={status !== "ready" || !draft.trim()}
        aria-label={t("agent.send")}
      >
        <i class="wxi-send"></i>
      </button>
    </div>
  </div>
</div>

<style>
  .agent {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: var(--fg);
    background: var(--bg);
  }
  .agent__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    flex: none;
  }
  .agent__title { font-weight: 600; font-size: 12px; }
  .agent__reset {
    border: none;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
  }
  .agent__reset:hover { background: var(--bg-hover, var(--border)); color: var(--fg); }
  .agent__reset:disabled { opacity: 0.4; cursor: default; }

  .agent__feed {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
  }
  .agent__notice {
    color: var(--fg-muted);
    font-size: 12px;
    padding: 8px;
    border: 1px dashed var(--border);
    border-radius: 6px;
  }
  .agent__msg { font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .agent__msg--user .agent__who {
    font-size: 11px;
    color: var(--accent);
    margin-bottom: 2px;
    font-weight: 600;
  }
  .agent__bubble {
    background: var(--bg-soft, var(--border));
    border-radius: 8px;
    padding: 6px 10px;
  }
  .agent__thought summary,
  .agent__tool summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--fg-muted);
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .agent__thought-body {
    font-size: 12px;
    color: var(--fg-muted);
    white-space: pre-wrap;
    padding: 4px 0 4px 14px;
  }
  .agent__tool[data-status="failed"] summary { color: var(--danger, #d33); }
  .agent__tool-status { margin-left: auto; font-size: 11px; opacity: 0.7; }
  .agent__tool-detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 40%;
  }

  .agent__composer {
    flex: none;
    border-top: 1px solid var(--border);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .agent__composer textarea {
    width: 100%;
    resize: none;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    font: inherit;
    font-size: 13px;
    box-sizing: border-box;
  }
  .agent__composer textarea:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
  .agent__actions { display: flex; justify-content: flex-end; gap: 6px; }
  .agent__btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--fg);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .agent__btn:hover:not(:disabled) { background: var(--bg-hover, var(--border)); }
  .agent__btn:disabled { opacity: 0.4; cursor: default; }
  .agent__btn--send { color: var(--accent); border-color: var(--accent); }
</style>
