<script lang="ts">
// Panneau « Assistant » — onglet custom du side panel (D5).
// Rendu GÉNÉRIQUE des blocs `session/update` (D8) : texte, réflexion, appel
// d'outil. Un bloc inconnu s'affiche en repli neutre, JAMAIS en erreur — il
// faut survivre aux montées de version de l'agent.
//
// Permissions (phase 4) : affichées DANS LE FIL, jamais en modale — un side
// panel est étroit, une modale y couperait le contexte au pire moment.
import { onMount, onDestroy, tick } from "svelte";
import { createAgentClient, type AgentClient, type McpServerDecl } from "@/lib/agent/client";
import { invoke } from "@tauri-apps/api/core";
import { synchroniserProgrammes, corpusDir } from "@/programmes";
import { programmesSelection } from "@/stores/programmes-selection.svelte";
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
  extractToolBody,
  extractToolDiff,
  type ToolDiff,
} from "@/lib/agent/context";
import { cleLibelleOutil, resumerOutil } from "@/lib/agent/outils";
import { getProjectRoot } from "@/lib/session";
import { appDataDir, join } from "@tauri-apps/api/path";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getT, language } from "@/lib/i18n";
// Pipeline « chat » : même processus que la preview (renderChatMarkdown dans
// markdown/render.ts), classe .mdv-prose pour la même typographie.
import { renderChatMarkdown } from "@/markdown/chat-render";
import { resolveWikilinkPaths } from "@/markdown/wikilinks";
import { typesetMath } from "@/lib/typeset-math";
import { createMathCache } from "@/lib/math-cache";
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
  | { id: number; kind: "tool"; toolCallId: string; outil: string; title: string; toolKind: string; status: string; detail: string; body?: string; diff?: ToolDiff; open: boolean }
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
// « L'agent écrit… » : armé à l'envoi, désarmé au premier contenu RÉEL
// (réflexion, message, outil) — jamais sur les notifications techniques.
let awaiting = $state(false);

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

// Cache des formules déjà composées (même mécanisme que la preview) : clé
// `data-math-source` → outerHTML du <mjx-container>. Grâce à lui, le typeset
// peut tourner PENDANT le stream : une formule complète est composée une
// seule fois, puis réinjectée à chaque rendu — zéro recomposition.
const mathCache = createMathCache();

// ── Throttle du rendu + verrou du typeset (correctif gel UI) ──────────────
// Les chunks arrivent à ~50/s. Sans lissage, CHACUN déclenchait un rendu
// markdown COMPLET du texte accumulé + une réinjection innerHTML incluant les
// SVG MathJax du cache (très verbeux) : travail QUADRATIQUE permanent qui
// sature le main thread sur une réponse longue — le « gel » constaté. Et sans
// verrou, un typeset plus long que le délai empilait des typesetPromise
// CONCURRENTS (MathJax n'est pas réentrant).
const pendingRender = new Set<number>();
let renderTimer: ReturnType<typeof setTimeout> | null = null;

/** Planifie un rendu markdown de l'item — au plus un passage par ~80 ms,
 *  tous les items modifiés rendus en un seul batch. */
function scheduleRender(item: FeedItem) {
  pendingRender.add(item.id);
  if (renderTimer) return;
  renderTimer = setTimeout(flushRenders, 80);
}

function flushRenders() {
  renderTimer = null;
  const ids = [...pendingRender];
  pendingRender.clear();
  if (ids.length === 0) return;
  // Mémoriser les formules composées AVANT que Svelte ne remplace le DOM.
  if (feedEl) mathCache.extractFrom(feedEl);
  for (const id of ids) {
    const item = items.find((i) => i.id === id);
    if (!item || (item.kind !== "agent" && item.kind !== "thought")) continue;
    const text = item.text;
    void renderChatMarkdown(text, theme.resolved).then((html) => {
      // Le texte a pu muter pendant le rendu : ne pas écraser avec un HTML
      // périmé — le batch suivant relancera un rendu si l'item a encore bougé.
      if (item.text !== text) return;
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      mathCache.injectInto(tmp);
      item.html = tmp.innerHTML;
    });
  }
  scheduleLiveTypeset();
}

// Typeset lissé ET verrouillé : un seul typesetPromise en vol ; une demande
// pendant l'exécution arme `dirty` et enchaîne UN rattrapage à la fin.
let liveTypesetTimer: ReturnType<typeof setTimeout> | null = null;
let typesetting = false;
let typesetDirty = false;

function scheduleLiveTypeset() {
  if (liveTypesetTimer) return;
  liveTypesetTimer = setTimeout(() => {
    liveTypesetTimer = null;
    void runLiveTypeset();
  }, 150);
}

async function runLiveTypeset(): Promise<void> {
  if (!feedEl) return;
  // Rien à faire sans formule — évite la re-composition du préambule et le
  // scan MathJax sur les réponses sans maths.
  if (!feedEl.querySelector("[data-math-source]")) return;
  if (typesetting) { typesetDirty = true; return; }
  typesetting = true;
  try {
    await typesetMath(feedEl);
  } catch {
    // Formule transitoire malformée en cours de frappe : sans objet, le
    // prochain passage (ou le typeset de fin de tour) la reprendra.
  }
  typesetting = false;
  if (typesetDirty) {
    typesetDirty = false;
    scheduleLiveTypeset();
  }
}

/** Finitions de fin de tour (streaming terminé) : rendu final immédiat des
 *  items encore en attente (le throttle laisserait le dernier texte brut
 *  visible ~80 ms), puis DERNIER typeset (verrou partagé avec le live) et
 *  résolution des wikilinks. */
async function finishTurnRendering() {
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = null;
    flushRenders();
  }
  if (liveTypesetTimer) {
    clearTimeout(liveTypesetTimer);
    liveTypesetTimer = null;
  }
  await tick();
  if (!feedEl) return;
  await runLiveTypeset();
  const root = getProjectRoot();
  if (root) await resolveWikilinkPaths(feedEl, root);
}

function applyUpdate(u: SessionUpdate) {
  switch (u.sessionUpdate) {
    case "agent_message_chunk":
    case "user_message_chunk": {
      awaiting = false;
      const key = u.messageId ?? "?";
      const existing = messageItems.get(key);
      const text = u.content?.text ?? "";
      if (existing !== undefined) {
        const item = items.find((i) => i.id === existing);
        if (item && item.kind === "agent") {
          item.text += text;
          scheduleRender(item);
        }
      } else {
        const id = pushItem({ kind: "agent", text });
        messageItems.set(key, id);
        const item = items.find((i) => i.id === id);
        if (item) scheduleRender(item);
      }
      break;
    }
    case "agent_thought_chunk": {
      awaiting = false;
      const key = u.messageId ?? "?";
      const existing = messageItems.get(`thought:${key}`);
      const text = u.content?.text ?? "";
      if (existing !== undefined) {
        const item = items.find((i) => i.id === existing);
        if (item && item.kind === "thought") {
          item.text += text;
          scheduleRender(item);
        }
      } else {
        // Repliée par défaut (anatomie arrêtée) : la réflexion est un
        // contexte, pas le contenu.
        const id = pushItem({ kind: "thought", text, open: false });
        messageItems.set(`thought:${key}`, id);
        const item = items.find((i) => i.id === id);
        if (item) scheduleRender(item);
      }
      break;
    }
    case "tool_call": {
      awaiting = false;
      if (!u.toolCallId) break;
      toolItems.set(u.toolCallId, pushItem({
        kind: "tool",
        toolCallId: u.toolCallId,
        // Le nom INTERNE est conservé — il identifie l'outil pour le résumé —
        // mais ce n'est pas lui qu'on montre.
        outil: u.title ?? "",
        title: titreOutil(u.title ?? "?"),
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
      if (u.title) {
        item.outil = u.title;
        item.title = titreOutil(u.title);
      }
      const loc = u.locations?.[0]?.path;
      if (loc) item.detail = loc;
      // Diff de la modification (D14 : relu DANS le panneau, jamais appliqué
      // à l'éditeur) — fourni par OpenCode dans `content` (phase 0c).
      const corps = extractToolBody(u);
      if (corps) {
        // Nos outils répondent en JSON de plusieurs kilo-octets : le montrer
        // tel quel n'apprend rien. Le résumé rend les adresses de section, les
        // contraintes et les refus — ce qui explique la réponse qui suit.
        const resume = resumerOutil(item.outil, corps);
        item.body = resume.corps ?? (resume.apercu ? undefined : corps);
        if (resume.apercu) item.detail = resume.apercu;
      }
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
    sessionId = await client.newSession(root, await mcpServers(root));
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

/** Serveur MCP d'AZprose, démarré et déclaré à la session (R1).
 *
 *  C'est par LUI que passent désormais les données du vault — préambule
 *  mathématique, callouts… — au lieu d'être recopiées dans les instructions
 *  (doctrine du rectificatif : « une donnée ne s'écrit jamais dans les
 *  instructions »). L'agent l'interroge quand il en a besoin, et la réponse
 *  fait foi.
 *
 *  Dégradation VOLONTAIRE : si le serveur ne démarre pas, la session s'ouvre
 *  quand même, sans outils. Perdre l'assistant entier parce qu'un port n'a pas
 *  pu être ouvert serait hors de proportion. */
async function mcpServers(root: string): Promise<McpServerDecl[]> {
  try {
    // L'instantané est POUSSÉ, pas relu du disque par le serveur : les
    // callouts builtin vivent côté TypeScript, et le préambule dans un store
    // que `config.json` peut suivre avec un temps de retard. L'agent voit
    // ainsi exactement ce que l'utilisateur voit.
    // Corpus livré : miroir déposé au démarrage, toujours réécrit (lecture
    // seule côté utilisateur — aucune édition à préserver).
    const corpus = await synchroniserProgrammes();
    const ep = await invoke<{ url: string; token: string }>("mcp_start", {
      facts: {
        root,
        corpusDir: corpus,
        // Les programmes cochés BORNENT la recherche côté serveur. Passer les
        // seuls noms aux instructions ne suffisait pas : la recherche balayait
        // les dix programmes livrés et rendait de la chimie à une question de
        // mathématiques (2026-08-19).
        programmes: [...programmesSelection.current],
        preambuleMath: mathJaxPreamble.current || null,
        callouts: calloutSettings.current.map((c) => ({
          nom: c.name,
          libelle: c.label,
          builtin: c.builtin,
        })),
      },
    });
    return [{
      name: "azprose",
      type: "http",
      url: ep.url,
      headers: [{ name: "Authorization", value: `Bearer ${ep.token}` }],
    }];
  } catch (e) {
    console.warn("[agent] serveur MCP indisponible, session sans outils :", e);
    return [];
  }
}

/** Écrit le fichier d'instructions dans le répertoire applicatif ($APPDATA,
 *  HORS du vault — l'utilisateur final ne peut pas le casser par accident)
 *  et renvoie son chemin absolu pour la config inline. Depuis R2 ce texte ne
 *  porte plus que du COMPORTEMENT (conventions d'écriture, consignes d'usage
 *  des outils) ; les données du vault passent par le serveur MCP. */
async function ensureAgentInstructions(rootPath: string): Promise<string> {
  const path = await join(await appDataDir(), AGENT_INSTRUCTIONS_FILENAME);
  // Plus aucune donnée passée ici (R2) : le préambule et les callouts
  // voyagent désormais par l'instantané du serveur MCP (`mcpServers`), pas
  // par le texte des instructions.
  await writeTextFile(path, buildAgentInstructions(rootPath, {
    programmes: await programmesActifs(),
  }));
  return path;
}

/** Programmes retenus pour ce projet, résolus en filière/matière/niveau.
 *  Liste vide si rien n'est sélectionné — l'instruction omet alors la section
 *  entière, et l'assistant travaille sans contrainte de programme. */
async function programmesActifs() {
  const ids = programmesSelection.current;
  if (ids.length === 0) return [];
  try {
    const dispo = await invoke<
      { id: string; filiere: string[]; matiere?: string; niveau?: string }[]
    >("programmes_lister", { corpusDir: await corpusDir() });
    return ids
      .map((id) => dispo.find((x) => x.id === id))
      .filter((p) => p?.filiere[0])
      .map((p) => ({ filiere: p!.filiere.join(" / "), matiere: p!.matiere, niveau: p!.niveau }));
  } catch {
    return [];
  }
}

async function send() {
  const text = draft.trim();
  if (!text || !client || !sessionId || status === "busy") return;
  pushItem({ kind: "user", text });
  draft = "";
  status = "busy";
  awaiting = true;
  scrollToBottom();
  try {
    await client.prompt(sessionId, text);
  } catch (e) {
    pushItem({ kind: "agent", text: t("agent.errorDetail", { message: String(e) }) });
  } finally {
    status = "ready";
    awaiting = false;
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

/** Titre affiché pour un outil : notre libellé traduit quand nous le
 *  connaissons, le titre natif d'OpenCode sinon (lecture de fichier, shell…),
 *  dont le vocabulaire ne nous appartient pas. */
function titreOutil(nom: string): string {
  const cle = cleLibelleOutil(nom);
  return cle ? t(cle) : nom;
}

/** Icône par famille d'outil ACP (read/edit/execute/search/fetch/think) —
 *  lecture instantanée du fil, convention des UI de chat d'agents. */
function toolIcon(kind: string): string {
  switch (kind) {
    case "read": return "wxi-eye";
    case "edit": return "wxi-pencil";
    case "execute": return "wxi-terminal";
    case "search": return "wxi-search";
    case "fetch": return "wxi-globe";
    default: return "wxi-wrench";
  }
}

onMount(() => {
  void startSession();
});
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
        <!-- Le chevron n'apparaît QUE s'il y a un corps à déplier : une
             affordance qui ouvre sur le vide (cas des tâches de sous-agent,
             sans diff) est pire que pas d'affordance du tout. -->
        {@const depliable = !!item.diff || !!item.body}
        {#if depliable}
          <details class="agent__tool" bind:open={item.open} data-status={item.status}>
            <summary>
              <i class="wxi-chevron-right agent__chevron"></i>
              <i class={toolIcon(item.toolKind)}></i>
              <span class="agent__tool-title">{item.title}</span>
              {#if item.detail}<span class="agent__tool-detail">{item.detail}</span>{/if}
              <span class="agent__tool-status">{item.status}</span>
            </summary>
            {#if item.diff}{@render diffBlock(item.diff)}{/if}
            {#if item.body}<pre class="agent__tool-body">{item.body}</pre>{/if}
          </details>
        {:else}
          <div class="agent__tool agent__tool--plat" data-status={item.status}>
            <div class="agent__tool-row">
              <i class={toolIcon(item.toolKind)}></i>
              <span class="agent__tool-title">{item.title}</span>
              {#if item.detail}<span class="agent__tool-detail">{item.detail}</span>{/if}
              <span class="agent__tool-status">{item.status}</span>
            </div>
          </div>
        {/if}
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

    {#if awaiting}
      <!-- Indicateur d'attente (convention chat/VSCode) : affiché entre
           l'envoi et le premier contenu réel, jamais après. -->
      <div class="agent__typing" aria-label={t("agent.thinking")} role="status">
        <span></span><span></span><span></span>
      </div>
    {/if}
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
  /* Langage visuel inspiré des UI de chat d'agents (TUI OpenCode, Claude) :
     l'utilisateur est ENCADRÉ (son écrit), la réponse de l'agent est À NU
     (pleine largeur, c'est du contenu), les outils sont des CHIPS compactes
     repliables, les permissions des encadrés d'avertissement. Tokens du thème
     courant uniquement — jamais de couleur en dur hors diffs. */
  .agent {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: var(--fg);
    background: var(--bg);
    /* Couleurs de diff (pas de token sémantique add/del dans le thème). */
    --agent-add: #2ea043;
    --agent-del: #f85149;
  }
  .agent__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    flex: none;
  }
  .agent__title { font-weight: 600; font-size: 12px; letter-spacing: 0.02em; }
  .agent__reset {
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    transition: background var(--dur-fast) var(--easing), color var(--dur-fast) var(--easing);
  }
  .agent__reset:hover { background: var(--surface-hover); color: var(--fg); }
  .agent__reset:disabled { opacity: 0.4; cursor: default; }

  .agent__feed {
    flex: 1;
    overflow-y: auto;
    /* Aucun défilement HORIZONTAL : un enfant trop large serait rogné et ses
       bordures apparaîtraient coupées. C'est la contrainte de largeur des
       enfants ci-dessous qui règle le problème à la source. */
    overflow-x: hidden;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }
  /* Largeur de LECTURE conventionnelle : le panneau latéral peut être élargi
     bien au-delà du confort de lecture. Le fil se cale au centre plutôt que de
     s'étirer sur toute la largeur disponible.
     `min-width: 0` : sans lui, un enfant flex refuse de rétrécir sous la
     largeur de son contenu — une longue description de tâche ou un chemin de
     fichier débordait alors du panneau, d'où les décorations tronquées. */
  .agent__feed > :global(*) {
    width: 100%;
    max-width: 68ch;
    margin-inline: auto;
    min-width: 0;
  }
  .agent__notice {
    color: var(--muted);
    font-size: 12px;
    padding: 8px 10px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
    text-align: center;
  }

  /* ── Messages ─────────────────────────────────────────────── */
  /* `overflow-wrap: anywhere` plutôt que `word-break` : un chemin ou une URL
     sans espace doit pouvoir se couper, sinon il élargit son encadré au-delà
     du panneau et la bordure se retrouve tronquée. */
  .agent__msg { font-size: 13px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; min-width: 0; }
  /* Une fois le HTML rendu, ce sont les blocs (<p>, <ul>…) qui portent la
     mise en forme — pre-wrap doublerait les sauts de ligne. */
  .agent__msg--html { white-space: normal; }
  /* Contenu {@html} : les enfants ne portent pas l'attribut de scope —
     :global obligatoire (preview.css porte le reste de la typographie). */
  .agent__msg--html > :global(*:first-child) { margin-top: 0; }
  .agent__msg--html > :global(*:last-child) { margin-bottom: 0; }

  /* Utilisateur : encadré accentué (son écrit). */
  .agent__msg--user {
    align-self: stretch;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
    border-radius: var(--radius-md);
    padding: 7px 10px;
  }
  .agent__msg--user .agent__who {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent);
    margin-bottom: 3px;
    font-weight: 600;
  }
  .agent__bubble { padding: 0; }

  /* Réponse agent : à nu, pleine largeur (c'est du contenu, pas une bulle). */
  .agent__msg--agent { padding: 0 2px; }

  /* ── Indicateur d'attente : trois points en cascade ───────── */
  .agent__typing {
    display: flex;
    gap: 5px;
    padding: 6px 2px;
    align-items: center;
  }
  .agent__typing span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--muted);
    animation: agent-typing 1.2s infinite ease-in-out;
  }
  .agent__typing span:nth-child(2) { animation-delay: 0.15s; }
  .agent__typing span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes agent-typing {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
    30% { transform: translateY(-3px); opacity: 1; }
  }

  /* ── Réflexion : discrète, repliée ────────────────────────── */
  .agent__thought summary {
    cursor: pointer;
    font-size: 11px;
    font-style: italic;
    color: var(--muted);
    list-style: none;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .agent__thought-body {
    font-size: 12px;
    color: var(--muted);
    white-space: pre-wrap;
    margin-top: 4px;
    padding: 2px 0 2px 12px;
    border-left: 2px dotted var(--border);
  }

  /* ── Outils : chips compactes repliables ──────────────────── */
  .agent__tool {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 3px 8px;
  }
  .agent__tool summary {
    min-width: 0;
    cursor: pointer;
    font-size: 12px;
    color: var(--fg);
    list-style: none;
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 22px;
  }
  .agent__chevron {
    font-size: 10px;
    color: var(--muted);
    transition: transform var(--dur-fast) var(--easing);
  }
  .agent__tool[open] .agent__chevron { transform: rotate(90deg); }
  /* Rangée d'un outil NON dépliable : même géométrie que le <summary>, sans
     chevron — l'alignement du fil reste identique. */
  .agent__tool-row {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 22px;
    min-width: 0;
  }
  /* Le titre peut être une phrase entière (tâche de sous-agent) : il doit
     pouvoir rétrécir, sinon il pousse la rangée hors du panneau. */
  .agent__tool-title {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Corps déplié : sortie de l'outil, souvent longue et déjà mise en forme. */
  .agent__tool-body {
    margin: 6px 0 2px;
    padding: 7px 9px;
    background: var(--surface);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.5;
    color: var(--fg);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 320px;
    overflow-y: auto;
  }
  .agent__tool-detail {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
  }
  .agent__tool-status {
    margin-left: auto;
    flex: none;
    font-size: 10px;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--surface-hover);
    color: var(--muted);
  }
  .agent__tool[data-status="in_progress"] .agent__tool-status {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
  }
  .agent__tool[data-status="failed"] { border-color: color-mix(in srgb, var(--color-error) 40%, transparent); }
  .agent__tool[data-status="failed"] .agent__tool-status {
    background: color-mix(in srgb, var(--color-error) 15%, transparent);
    color: var(--color-error);
  }
  .agent__tool[data-status="failed"] summary { color: var(--color-error); }

  /* ── Permission : encadré d'avertissement ─────────────────── */
  .agent__perm {
    border: 1px solid color-mix(in srgb, var(--color-warning) 55%, transparent);
    background: color-mix(in srgb, var(--color-warning) 7%, transparent);
    border-radius: var(--radius-md);
    padding: 8px 10px;
    font-size: 12px;
  }
  .agent__perm--resolved { opacity: 0.55; background: transparent; border-color: var(--border); }
  .agent__perm-q { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .agent__perm-q > i { color: var(--color-warning); }
  .agent__perm-loc {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .agent__perm-btns { display: flex; gap: 6px; margin-top: 8px; }
  .agent__btn--deny { color: var(--color-error); }

  /* ── Diff ─────────────────────────────────────────────────── */
  .agent__diff {
    margin: 6px 0 0;
    padding: 6px 0;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.45;
    overflow-x: auto;
    white-space: pre;
  }
  .agent__diff-add,
  .agent__diff-del { display: block; padding: 0 8px; }
  .agent__diff-add {
    background: color-mix(in srgb, var(--agent-add) 14%, transparent);
    border-left: 2px solid var(--agent-add);
  }
  .agent__diff-del {
    background: color-mix(in srgb, var(--agent-del) 12%, transparent);
    border-left: 2px solid var(--agent-del);
  }

  /* ── Composeur ────────────────────────────────────────────── */
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
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 7px 10px;
    font: inherit;
    font-size: 13px;
    line-height: 1.45;
    box-sizing: border-box;
    transition: border-color var(--dur-fast) var(--easing);
  }
  .agent__composer textarea:focus { outline: none; border-color: var(--accent); }
  .agent__actions { display: flex; justify-content: flex-end; gap: 6px; }
  .agent__btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: background var(--dur-fast) var(--easing);
  }
  .agent__btn:hover:not(:disabled) { background: var(--surface-hover); }
  .agent__btn:disabled { opacity: 0.4; cursor: default; }
  .agent__btn--send {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .agent__btn--send:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 20%, transparent); }
</style>
