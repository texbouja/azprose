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
import {
  createAgentHandlers,
  type PermissionOption,
  type PermissionRequest,
} from "@/lib/agent/handlers";
import {
  AGENT_INSTRUCTIONS_FILENAME,
  buildAgentEnv,
  buildAgentInstructions,
  extractToolDiff,
  type ToolDiff,
} from "@/lib/agent/context";
import { getProjectRoot } from "@/lib/session";
import { appDataDir, join } from "@tauri-apps/api/path";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getT, language } from "@/lib/i18n";
// Pipeline « chat » : même processus que la preview (renderChatMarkdown dans
// markdown/render.ts), classe .mdv-prose pour la même typographie.
import { renderChatMarkdown } from "@/markdown/chat-render";
import { resolveWikilinkPaths } from "@/markdown/wikilinks";
import { typesetMath } from "@/lib/typeset-math";
import { theme } from "@/stores/theme.svelte";
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";
import { calloutSettings } from "@/stores/callout-settings.svelte";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@/styles/markdown/preview.css";

let t = $derived(getT($language));

// ── Items du fil ────────────────────────────────────────────────────────────
// Identifiants locaux croissants — les ids de l'agent (messageId, toolCallId)
// servent à l'AGRÉGATION, pas au rendu.
type FeedItem =
  | { id: number; kind: "user"; text: string }
  // `html` : rendu markdown du texte (pipeline chat), rempli en asynchrone —
  // repli sur le texte brut tant que le premier rendu n'est pas prêt.
  | { id: number; kind: "agent"; text: string; html?: string }
  | { id: number; kind: "thought"; text: string; html?: string; open: boolean }
  | { id: number; kind: "tool"; toolCallId: string; title: string; toolKind: string; status: string; detail: string; diff?: ToolDiff; open: boolean }
  // Permission DANS LE FIL (jamais en modale — règle 3 de l'anatomie) :
  // `resolve` renvoie l'optionId choisi au handler suspendu, null = annulé.
  | { id: number; kind: "permission"; title: string; location?: string; diff?: ToolDiff; options: PermissionOption[]; resolved: boolean; resolve: (optionId: string | null) => void };

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
// Handlers phase 4 : fs/* en accès disque pur (D9) + permissions dans le fil.
// Recréés à chaque session (startSession) : les « toujours » ne survivent pas
// à une réinitialisation (D12 — mémoire de session, jamais disque).
let handlers = $state<ReturnType<typeof createAgentHandlers> | null>(null);

/** Rend une demande de permission dans le fil et suspend jusqu'au clic. */
function askPermission(req: PermissionRequest): Promise<string | null> {
  return new Promise((resolve) => {
    pushItem({
      kind: "permission",
      title: req.title,
      location: req.location,
      diff: req.diff,
      options: req.options,
      resolved: false,
      resolve,
    });
    scrollToBottom();
  });
}

function answerPermission(item: Extract<FeedItem, { kind: "permission" }>, optionId: string | null) {
  if (item.resolved) return;
  item.resolved = true;
  item.resolve(optionId);
}

/** D12 : trois issues — une fois / toujours (cette session) / refuser.
 *  Les kinds viennent de l'agent ; un kind absent n'affiche pas son bouton. */
function optionOfKind(item: Extract<FeedItem, { kind: "permission" }>, prefix: string): PermissionOption | undefined {
  return item.options.find((o) => o.kind?.startsWith(prefix));
}

// Agrégation des chunks streamés, par messageId (phase 0 : OpenCode émet des
// chunks de quelques caractères, jamais un message complet).
const messageItems = new Map<string, number>();
const toolItems = new Map<string, number>();

function pushItem(item: FeedItemDraft): number {
  const id = ++nextId;
  items.push({ ...item, id } as FeedItem);
  return id;
}

/** Re-rend le markdown d'un item (agent/thought) — appelé à CHAQUE chunk du
 *  stream. Le rendu est asynchrone (chargement Shiki à la demande) : le texte
 *  brut sert de repli visible entre-temps. */
function renderItem(item: FeedItem | undefined) {
  if (!item || (item.kind !== "agent" && item.kind !== "thought")) return;
  const text = item.text;
  void renderChatMarkdown(text, theme.resolved).then((html) => {
    // Le texte a pu muter pendant le rendu (chunk suivant) : ne pas écraser
    // avec un HTML périmé — le prochain chunk relancera un rendu.
    if (item.text === text) item.html = html;
  });
}

/** Finitions de fin de tour (streaming terminé) : maths MathJax et
 *  résolution des wikilinks. Pendant le stream elles restent en repli
 *  (spans \(…\) lisibles, liens stylés non câblés) — re-traiter à chaque
 *  chunk serait du gaspillage, et les maths déjà composées ne sont pas
 *  re-traitées par MathJax (plus de délimiteur textuel après conversion). */
async function finishTurnRendering() {
  await tick();
  if (!feedEl) return;
  await typesetMath(feedEl);
  const root = getProjectRoot();
  if (root) await resolveWikilinkPaths(feedEl, root);
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
        if (item && item.kind === "agent") {
          item.text += text;
          renderItem(item);
        }
      } else {
        const id = pushItem({ kind: "agent", text });
        messageItems.set(key, id);
        renderItem(items.find((i) => i.id === id));
      }
      break;
    }
    case "agent_thought_chunk": {
      const key = u.messageId ?? "?";
      const existing = messageItems.get(`thought:${key}`);
      const text = u.content?.text ?? "";
      if (existing !== undefined) {
        const item = items.find((i) => i.id === existing);
        if (item && item.kind === "thought") {
          item.text += text;
          renderItem(item);
        }
      } else {
        // Repliée par défaut (anatomie arrêtée) : la réflexion est un
        // contexte, pas le contenu.
        const id = pushItem({ kind: "thought", text, open: false });
        messageItems.set(`thought:${key}`, id);
        renderItem(items.find((i) => i.id === id));
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
      // Diff de la modification (D14 : relu DANS le panneau, jamais appliqué
      // à l'éditeur) — fourni par OpenCode dans `content` (phase 0c).
      const diff = extractToolDiff(u);
      if (diff) item.diff = diff;
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
    const root = getProjectRoot() ?? "/";
    handlers = createAgentHandlers(undefined, askPermission);
    client ??= createAgentClient({
      cwd: root,
      // Phase 4 : les capacités fs sont déclarées MAINTENANT qu'elles sont
      // implémentées (P3 — jamais avant). Servies depuis le disque (D9).
      capabilities: { fs: { readTextFile: true, writeTextFile: true } },
      // Contexte d'environnement : instructions (fichier $APPDATA, hors
      // vault) + config inline (external_directory: ask) — voir context.ts.
      env: buildAgentEnv(await ensureAgentInstructions(root)),
      onServerRequest: (req) => handlers!.handle(req),
    });
    await client.start();
    offUpdate ??= client.onUpdate(applyUpdate);
    sessionId = await client.newSession(root);
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

/** Écrit le fichier d'instructions dans le répertoire applicatif ($APPDATA,
 *  HORS du vault — l'utilisateur final ne peut pas le casser par accident)
 *  et renvoie son chemin absolu pour la config inline. Le préambule MathJax
 *  et les callouts du vault y sont injectés à l'état courant (l'agent peut
 *  utiliser les macros et la syntaxe custom sans lecture préalable). */
async function ensureAgentInstructions(rootPath: string): Promise<string> {
  const path = await join(await appDataDir(), AGENT_INSTRUCTIONS_FILENAME);
  await writeTextFile(path, buildAgentInstructions(rootPath, {
    mathPreamble: mathJaxPreamble.current,
    callouts: calloutSettings.current,
  }));
  return path;
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
    void finishTurnRendering();
  }
}

async function cancel() {
  if (client && sessionId) await client.cancel(sessionId);
  status = "ready";
  void finishTurnRendering();
}

/** Clics dans le fil : même mécanisme que la preview — wikilinks dispatchés
 *  en `azprose:wikilink-navigate` (app.svelte résout et ouvre), liens externes
 *  dans le navigateur système. Aucun couplage nouveau avec le panel store. */
function onFeedClick(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest("a");
  if (!a) return;
  const href = a.getAttribute("href");
  if (!href) return;
  if (a.classList.contains("wikilink")) {
    e.preventDefault();
    const fullpath = a.getAttribute("data-wikilink-fullpath");
    const heading = a.getAttribute("data-wikilink-heading");
    const target = a.getAttribute("data-wikilink-target");
    const ctrlKey = e.ctrlKey || e.metaKey;
    if (fullpath) {
      window.dispatchEvent(new CustomEvent("azprose:wikilink-navigate", { detail: { path: fullpath, heading, ctrlKey } }));
    } else if (target) {
      window.dispatchEvent(new CustomEvent("azprose:wikilink-navigate", { detail: { target, heading, ctrlKey } }));
    }
    return;
  }
  if (/^https?:\/\//.test(href)) {
    e.preventDefault();
    void openUrl(href);
  }
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
  {#snippet diffBlock(diff: ToolDiff)}
    <!-- Relu DANS le panneau (D14) : oldText en retrait (rouge), newText en
         ajout (vert) ; `unified` en repli si l'agent ne fournit que ça. -->
    {#if diff.unified}
      <pre class="agent__diff">{diff.unified}</pre>
    {:else}
      <pre class="agent__diff">{#each (diff.oldText ?? "").split("\n") as line}<span class="agent__diff-del">- {line}
</span>{/each}{#each (diff.newText ?? "").split("\n") as line}<span class="agent__diff-add">+ {line}
</span>{/each}</pre>
    {/if}
  {/snippet}

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

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions — clic délégué sur les <a> du rendu markdown, même motif que la preview -->
  <div class="agent__feed" bind:this={feedEl} onclick={onFeedClick}>
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
          <div class="agent__thought-body mdv-prose" class:agent__msg--html={!!item.html}>
            {#if item.html}{@html item.html}{:else}{item.text}{/if}
          </div>
        </details>
      {:else if item.kind === "tool"}
        <details class="agent__tool" bind:open={item.open} data-status={item.status}>
          <summary>
            <i class="wxi-wrench"></i>
            <span class="agent__tool-title">{item.title}</span>
            {#if item.detail}<span class="agent__tool-detail">{item.detail}</span>{/if}
            <span class="agent__tool-status">{item.status}</span>
          </summary>
          {#if item.diff}{@render diffBlock(item.diff)}{/if}
        </details>
      {:else if item.kind === "permission"}
        <div class="agent__perm" class:agent__perm--resolved={item.resolved}>
          <div class="agent__perm-q">
            <i class="wxi-alert-circle"></i>
            {t("agent.permission", { action: item.title })}
            {#if item.location}<span class="agent__perm-loc">{item.location}</span>{/if}
          </div>
          <!-- Le diff est l'objet de la décision : visible d'emblée. -->
          {#if item.diff}{@render diffBlock(item.diff)}{/if}
          {#if !item.resolved}
            <div class="agent__perm-btns">
              {#if optionOfKind(item, "allow_once")}
                <button class="agent__btn" onclick={() => answerPermission(item, optionOfKind(item, "allow_once")!.optionId)}>
                  {t("agent.permOnce")}
                </button>
              {/if}
              {#if optionOfKind(item, "allow_always")}
                <button class="agent__btn" onclick={() => answerPermission(item, optionOfKind(item, "allow_always")!.optionId)}>
                  {t("agent.permAlways")}
                </button>
              {/if}
              <button
                class="agent__btn agent__btn--deny"
                onclick={() => answerPermission(item, optionOfKind(item, "reject")?.optionId ?? null)}
              >
                {t("agent.permDeny")}
              </button>
            </div>
          {/if}
        </div>
      {:else if item.kind === "agent"}
        {#if item.text}
          <div class="agent__msg agent__msg--agent mdv-prose" class:agent__msg--html={!!item.html}>
            {#if item.html}{@html item.html}{:else}{item.text}{/if}
          </div>
        {/if}
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
  /* Une fois le HTML rendu, ce sont les blocs (<p>, <ul>…) qui portent la
     mise en forme — pre-wrap doublerait les sauts de ligne. */
  .agent__msg--html { white-space: normal; }
  /* Contenu {@html} : les enfants ne portent pas l'attribut de scope —
     :global obligatoire (preview.css porte le reste de la typographie). */
  .agent__msg--html > :global(*:first-child) { margin-top: 0; }
  .agent__msg--html > :global(*:last-child) { margin-bottom: 0; }
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

  .agent__perm {
    border: 1px solid var(--accent);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
  }
  .agent__perm--resolved { opacity: 0.55; border-color: var(--border); }
  .agent__perm-q { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .agent__perm-loc {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .agent__perm-btns { display: flex; gap: 6px; margin-top: 8px; }
  .agent__btn--deny { color: var(--danger, #d33); }

  .agent__diff {
    margin: 6px 0 0;
    padding: 6px 8px;
    background: var(--bg-soft, var(--border));
    border-radius: 6px;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    line-height: 1.45;
    overflow-x: auto;
    white-space: pre;
  }
  .agent__diff-add { color: var(--success, #2a9d54); display: block; }
  .agent__diff-del { color: var(--danger, #d33); display: block; }

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
