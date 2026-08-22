<script lang="ts">
// Panneau « Assistant » — onglet custom du side panel (D5).
// Rendu GÉNÉRIQUE des blocs `session/update` (D8) : texte, réflexion, appel
// d'outil. Un bloc inconnu s'affiche en repli neutre, JAMAIS en erreur — il
// faut survivre aux montées de version de l'agent.
//
// Permissions (phase 4) : affichées DANS LE FIL, jamais en modale — un side
// panel est étroit, une modale y couperait le contexte au pire moment.
import { onMount, onDestroy, tick } from "svelte";
import { createAgentClient, resolveAgentBinary, type AgentClient, type McpServerDecl } from "@/lib/agent/client";
import { invoke } from "@tauri-apps/api/core";
import { synchroniserProgrammes, corpusDir } from "@/programmes";
import { programmesSelection } from "@/stores/programmes-selection.svelte";
import type { SessionUpdate, ContentBlock } from "@/lib/agent/types";
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
import { STORAGE_KEYS } from "@/lib/storage";
import {
  ecrirePin,
  epingler,
  essayer,
  lirePin,
  modeleVoulu as modeleVouluDe,
  oublier,
  type EtatModele,
} from "@/lib/agent/modele-defaut";
import { optionModele, modelesDeOption, type ConfigOption } from "@/lib/agent/config-options";
import {
  decouperIdModele,
  filtrerCatalogue,
  fournisseurDeId,
  parserCatalogue,
  trierCatalogue,
  type FournisseurCatalogue,
} from "@/lib/agent/catalogue";
import {
  actionUtilisateur as canalActionUtilisateur,
  canalVide,
  conditionResolue as canalConditionResolue,
  debutDeTour as canalDebutDeTour,
  estBloquant,
  fermer as canalFermer,
  finDeTour as canalFinDeTour,
  poser as canalPoser,
  type MessageStatut,
  type SourceStatut,
} from "@/lib/agent/canal-statut";
import AgentStatusLine from "@/components/agent/AgentStatusLine.svelte";
import { fournisseursSelection } from "@/stores/fournisseurs-selection.svelte";
import { serveurCatalogue } from "@/lib/agent/serve";
import {
  candidatsDe,
  extraireMentions,
  filtrerParRel,
  mentionAuCurseur,
  uriFichier,
  type CandidatCompletion,
} from "@/lib/agent/mentions";
import {
  caretSurDerniereLigne,
  caretSurPremiereLigne,
  cibleHistorique,
  entreeHistorique,
} from "@/lib/agent/historique";
import { nomTranscription, transcriptionMarkdown } from "@/lib/agent/transcription";
import { diagnostiquerQuota, urlPasserelle, type VerdictQuota } from "@/lib/agent/quota";
import { notifications } from "@/stores/notifications.svelte";
import { contextMenu } from "@/stores/context-menu.svelte";
import { mkdir } from "@tauri-apps/plugin-fs";
// Le fetch du webview est bloqué par l'absence de CORS chez opencode.ai ;
// celui du plugin http passe (capability cadrée sur https://opencode.ai/*).
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  joinPath,
  walkSupportedTextFiles,
  writeText,
  type FlatFileEntry,
} from "@/lib/files";
import AgentModelSelect from "@/components/agent/AgentModelSelect.svelte";
import AgentConnectDialog from "@/components/agent/AgentConnectDialog.svelte";
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

// ── Sélecteur de modèle (équivalent `/models`) ──────────────────────────────
// Contrat DOCUMENTÉ (ACP v1 « Session Config Options », stabilisé) :
// `session/new` rend les options de la session — dont celle de catégorie
// `model`, qui porte la LISTE des modèles utilisables (providers configurés
// par l'utilisateur) et la valeur courante ; `session/set_config_option`
// change celle-ci à chaud et rend l'état complet ; l'agent peut aussi changer
// ses options LUI-MÊME (`config_option_update` — repli de fournisseur…) et
// le chip suit. Plus aucun sondage du CLI : la liste vient de l'AGENT.
//
// Le choix GLOBAL persisté (localStorage, comme le chemin du binaire) n'est
// plus la vérité affichée mais la SURCHARGE demandée : `null` = « Défaut
// OpenCode ». Il part dans la config du spawn (clé `model`, documentée) et
// s'applique à chaque session fraîche par set_config_option — un processus
// réutilisé garde sinon SON défaut d'origine.
// Actif vs défaut : toute la logique (essai, pin radio, oubli, migration de
// la clé persistée) vit dans `modele-defaut.ts`, module pur et testé.
const stockageModele = typeof localStorage !== "undefined" ? localStorage : null;
let etatModele = $state<EtatModele>({
  pin: lirePin(stockageModele, STORAGE_KEYS.agentModel),
  session: null,
});
/** Le DÉFAUT (persisté) — ce que le pin du menu montre comme acquis. */
const modelePin = $derived(etatModele.pin);
/** Ce qu'on demande à l'agent : l'essai en cours, sinon le défaut. */
const modeleVoulu = $derived(modeleVouluDe(etatModele));
let respawnRequis = false;
/** État VIVANT des options de la session courante — la source d'affichage. */
let optionsSession = $state<ConfigOption[]>([]);

const optionModeleLive = $derived(optionModele(optionsSession));
/** Modèle RÉELLEMENT en cours dans la session, tel que déclaré par l'agent. */
const modeleEnCours = $derived(
  optionModeleLive && typeof optionModeleLive.currentValue === "string"
    ? optionModeleLive.currentValue
    : null,
);
/** Liste proposée au menu : exactement ce que l'agent déclare utilisable. */
const modelesDisponibles = $derived(optionModeleLive ? modelesDeOption(optionModeleLive) : []);
/** Ce que montre le chip : la réalité de la session s'il en existe une,
 *  sinon la surcharge demandée (pas encore de session). */
const modeleAffiche = $derived(modeleEnCours ?? modeleVoulu);

/** Change le modèle de la session courante. Chemin DOCUMENTÉ d'abord
 *  (`set_config_option`, qui rend l'état complet), repli méthode historique
 *  `set_model` pour un agent sans configOptions (rend alors null : pas
 *  d'état à rafraîchir). Le -32601 « method not found » est masqué par le
 *  transport en simple message — c'est lui qui déclenche le repli. */
async function changerModeleSession(sid: string, id: string): Promise<ConfigOption[] | null> {
  try {
    return await client!.setConfigOption(sid, optionModeleLive?.id ?? "model", id);
  } catch (e) {
    if (!/method not found|-32601/i.test(String(e))) throw e;
    await client!.setModel(sid, id);
    return null;
  }
}

// ── Canal d'infrastructure (pied de panneau) ────────────────────────────────
// Critère de routage : est-ce que ça figurerait dans la transcription
// exportée ? Oui → le fil (pushItem). Non → ici. La machine (priorité, durées
// de vie) vit dans canal-statut.ts, module pur et testé ; le composant ne
// fait que du câblage — AgentPanel n'a pas de test de rendu.
let canal = $state(canalVide());
const messageStatut = $derived(canal.message);
const statutBloquant = $derived(estBloquant(canal));

function statut(niveau: MessageStatut["niveau"], source: SourceStatut, texte: string, url?: string) {
  canal = canalPoser(canal, { niveau, texte, source, ...(url ? { url } : {}) });
}
/** Une condition observable s'est résolue → son message tombe seul. */
function statutResolu(source: SourceStatut) {
  canal = canalConditionResolue(canal, source);
}

/** Clic sur une LIGNE du sélecteur : applique maintenant, pour cette session
 *  — ne persiste rien (le défaut, c'est le pin). Renvoie null si appliqué,
 *  sinon le message d'erreur que le menu affichera en place. */
async function choisirModele(id: string): Promise<string | null> {
  // Un choix de modèle EST une action de l'utilisateur : les infos périmées
  // meurent ici (jamais par une horloge).
  canal = canalActionUtilisateur(canal);
  // Validation passerelle AVANT application (retour utilisateur 2026-08-22) :
  // un modèle maison bloqué (quota hebdo…) est refusé en ~1 s À LA SÉLECTION.
  // Le motif verbatim part au PIED DE PANNEAU en erreur bloquante (plus de
  // toast : il s'efface tout seul, or ce refus doit rester jusqu'à ce que
  // l'utilisateur en prenne acte) et le menu se referme : le chip reste sur
  // le modèle précédent. Non concluant (pas de clé, réseau) → on applique
  // normalement ; le diagnostic post-envoi reste le filet.
  const decoupe = decouperIdModele(id);
  if (decoupe && urlPasserelle(decoupe.fournisseur)) {
    const refus = await verifierDisponibilitePasserelle(decoupe);
    if (refus) {
      statut("erreur", "quota", t("agent.quotaLimite", { message: refus.message }), refus.url);
      return null;
    }
  }
  etatModele = essayer(etatModele, id);
  // Pas de session prête : le choix s'appliquera à la session à venir.
  if (!client || !sessionId || status !== "ready") return null;
  try {
    const opts = await changerModeleSession(sessionId, id);
    if (opts) optionsSession = opts;
    return null;
  } catch (e) {
    const msg = String(e);
    if (/model not found/i.test(msg)) return msg; // validation dans le menu
    // Ni l'une ni l'autre disponible : régime B — re-spawn au prochain reset,
    // la config inline du spawn portera le choix.
    respawnRequis = true;
    statut("info", "modele", t("agent.model.prochaineSession", { id }));
    return null;
  }
}

/** Clic sur le PIN : ce modèle devient le défaut — persisté, appliqué aux
 *  prochaines sessions, et appliqué tout de suite si la session est prête.
 *  Sélection unique : recliquer le pin de l'épinglé est sans effet (le menu
 *  garde déjà ce garde-fou, on ne l'inverse pas ici). */
function epinglerModele(id: string): void {
  const nouveau = epingler(etatModele, id);
  if (nouveau === etatModele) return; // déjà épinglé : sans effet
  etatModele = nouveau;
  ecrirePin(stockageModele, STORAGE_KEYS.agentModel, id);
  void choisirModele(id);
}

/** Interroge la passerelle du fournisseur maison : 429 → le motif verbatim
 *  (sera affiché en couleur erreur dans le menu) ; tout autre cas → null,
 *  le choix suit son cours normal. */
async function verifierDisponibilitePasserelle(
  decoupe: { fournisseur: string; modele: string },
): Promise<VerdictQuota | null> {
  return await diagnostiquerQuota({
    fournisseur: decoupe.fournisseur,
    modele: decoupe.modele,
    cle: await cleLocale(decoupe.fournisseur),
    fetchImpl: tauriFetch as unknown as typeof fetch,
  });
}

// ── Catalogue complet des fournisseurs (voie serveur headless) ──────────────
// Le contrat ACP ne rend que l'UTILISABLE ici et maintenant ; le catalogue
// ENTIER (193 fournisseurs à charge réelle) vient de `GET /provider` — voie
// documentée d'OpenCode — servi par le MÊME binaire en mode `serve`. Cycle
// paresseux : premier spawn à la première ouverture du menu, réutilisé
// ensuite, tué avec le panneau (décision 2026-08-21).
let catalogue = $state<FournisseurCatalogue[] | null>(null);
let catalogueErreur = $state(false);

async function chargerCatalogue(): Promise<void> {
  // Prêt → ne rien faire ; échec précédent ([] + erreur) → réessayer à
  // chaque ouverture, le serveur a pu démarrer entre-temps.
  if (catalogue !== null && !catalogueErreur) return;
  try {
    const rep = await serveurCatalogue.requete<unknown>(resolveAgentBinary(), "/provider");
    catalogue = trierCatalogue(parserCatalogue(rep));
    catalogueErreur = false;
    statutResolu("catalogue"); // condition observable : le catalogue est là
  } catch (e) {
    console.warn("[agent] catalogue des fournisseurs indisponible :", e);
    catalogue = [];
    catalogueErreur = true;
    // Avertissement, pas erreur bloquante : le sélecteur reste utilisable
    // avec les modèles déclarés par l'agent. Le menu porte déjà sa propre
    // mention en place ; le pied la double pour qui a refermé le menu.
    statut("avertissement", "catalogue", t("agent.model.catalogueIndisponible"));
  }
}

/** Après connexion réussie : le fournisseur doit QUITTER la section catalogue
 *  pour rejoindre les actifs — l'état `connected` du serveur est LA vérité. */
async function rafraichirCatalogue(): Promise<void> {
  catalogue = null;
  catalogueErreur = false;
  await chargerCatalogue();
}

// ── Curation utilisateur (Réglages › Assistant IA › Fournisseurs) ───────────
// Le catalogue brut compte ~193 entrées : la section « Autres fournisseurs »
// ne montre que les fournisseurs COCHÉS en réglages. Les connectés sont déjà
// exclus par filtrerCatalogue (affichés à part, visibles même non cochés).
const cataloguePourMenu = $derived(
  catalogue === null ? null : filtrerCatalogue(catalogue, fournisseursSelection.current),
);
/** Aucune coche = message d'orientation vers les réglages, pas un « tous déjà
 *  connectés » qui serait faux. */
const aucunFournisseurCoche = $derived(fournisseursSelection.current.length === 0);

/** Flux de connexion en cours : dialogue rendu tant que non null. Le modèle
 *  visé est appliqué une fois le fournisseur authentifié. */
let connexion = $state<{ fournisseur: FournisseurCatalogue; modeleId: string } | null>(null);

/** Modèle choisi dans la section CATALOGUE. Déjà connecté (l'état a changé
 *  entre-temps) → chemin normal du sélecteur ; sinon → dialogue. */
function choisirModeleCatalogue(modeleId: string): void {
  const f = fournisseurDeId(catalogue ?? [], modeleId);
  if (!f || f.connecte) {
    void choisirModele(modeleId);
    return;
  }
  connexion = { fournisseur: f, modeleId };
}

/** Le serveur confirme la connexion (`connected`) : rafraîchir le catalogue,
 *  appliquer le modèle demandé, prévenir qu'un ↺ peut être nécessaire. */
async function connexionReussie(): Promise<void> {
  const modeleId = connexion?.modeleId;
  connexion = null;
  await rafraichirCatalogue();
  if (!modeleId) return;
  await choisirModele(modeleId);
  statut("info", "modele", t("agent.model.connecteNote"));
}

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
  updatesRecus++; // tout signe de vie repousse le diagnostic de silence
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
    case "config_option_update": {
      // L'agent a changé ses options LUI-MÊME (repli de fournisseur après une
      // limite de débit, changement de mode…) : le chip reflète toujours SA
      // déclaration — c'est elle qui fait foi, pas notre choix persisté.
      if (Array.isArray(u.configOptions)) optionsSession = u.configOptions;
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
    // Régime B : un choix qui n'a pas pu passer à chaud (méthode absente chez
    // un agent plus ancien) force un re-spawn — la config inline du spawn
    // porte alors le modèle. Sans ça, le processus réutilisé garderait son
    // défaut d'origine.
    if (client && respawnRequis) {
      offUpdate?.();
      offUpdate = null;
      await client.stop();
      client = null;
      respawnRequis = false;
    }
    client ??= createAgentClient({
      cwd: root,
      // Phase 4 : les capacités fs sont déclarées MAINTENANT qu'elles sont
      // implémentées (P3 — jamais avant). Servies depuis le disque (D9).
      capabilities: { fs: { readTextFile: true, writeTextFile: true } },
      // Contexte d'environnement : instructions (fichier $APPDATA, hors
      // vault) + config inline (external_directory: ask) + modèle choisi —
      // voir context.ts.
      // Aucun modèle voulu → AUCUNE clé `model` dans la config du spawn :
      // OpenCode applique alors sa propre chaîne de priorité (`opencode.json`
      // compris). C'est le comportement du premier lancement.
      env: buildAgentEnv(await ensureAgentInstructions(root), modeleVoulu ?? undefined),
      onServerRequest: (req) => handlers!.handle(req),
    });
    await client.start();
    offUpdate ??= client.onUpdate(applyUpdate);
    const ses = await client.newSession(root, await mcpServers(root));
    sessionId = ses.sessionId;
    optionsSession = ses.configOptions;
    await appliquerModeleSession();
    status = "ready";
    // Condition observable résolue : une session tourne, donc « agent
    // introuvable » n'a plus lieu d'être — l'erreur bloquante tombe seule.
    statutResolu("agent");
  } catch (e) {
    if (e instanceof Error && e.name === "AgentNotInstalledError") {
      status = "not-installed";
      statut("erreur", "agent", t("agent.notInstalled"));
    } else {
      status = "error";
      errorMessage = String(e);
    }
  }
}

/** Applique le modèle voulu (essai en cours, sinon pin) à la session
 *  fraîche. La liste déclarée par l'agent permet de valider SANS
 *  aller-retour : un modèle disparu du binaire (désauthentifié, renommé)
 *  retombe sur le défaut au lieu de faire échouer le premier prompt. */
async function appliquerModeleSession() {
  const choix = modeleVoulu;
  if (!client || !sessionId || !choix) return;
  const liste = modelesDisponibles;
  if (liste.length > 0 && !liste.some((m) => m.id === choix)) {
    oublierModeleVoulu();
    console.warn("[agent] modèle mémorisé absent de la liste de l'agent, retour au défaut :", choix);
    return;
  }
  try {
    const opts = await changerModeleSession(sessionId, choix);
    if (opts) optionsSession = opts;
  } catch (e) {
    const msg = String(e);
    if (/model not found/i.test(msg)) {
      // Refusé malgré la liste (course avec un changement amont) : ne pas
      // afficher un choix mensonger — retour au défaut, choix dépersisté.
      oublierModeleVoulu();
      console.warn("[agent] modèle mémorisé refusé par le binaire, retour au défaut :", msg);
    } else {
      respawnRequis = true;
      console.warn("[agent] changement de modèle indisponible, re-spawn au prochain reset :", msg);
    }
  }
}

/** Le modèle voulu est inapplicable : on l'oublie (essai d'abord, pin
 *  ensuite — voir `oublier`). Le disque suit si le pin a bougé. */
function oublierModeleVoulu(): void {
  const nouveau = oublier(etatModele);
  if (nouveau.pin !== etatModele.pin) ecrirePin(stockageModele, STORAGE_KEYS.agentModel, nouveau.pin);
  etatModele = nouveau;
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

/** Signes de vie du prompt en cours (tout session/update) — sert au
 *  diagnostic de silence : si le compteur n'a pas bougé depuis l'envoi,
 *  l'agent n'a RIEN émis. */
let updatesRecus = 0;
/** Un verdict de quota a déjà été affiché pour ce tour : l'erreur générique
 *  du chien de garde (qui rejeta plus tard la promesse suspendue) ne doit
 *  pas se superposer. */
let quotaSignale = false;
const DELAI_DIAGNOSTIC_MS = 15_000;

/** Clé API locale d'un fournisseur connecté, relue de GET /provider brut
 *  (le parseur du catalogue jette ce champ). null = introuvable/indispo —
 *  les appelants traitent ça comme « diagnostic non concluant ». */
async function cleLocale(fournisseur: string): Promise<string | null> {
  try {
    const rep = await serveurCatalogue.requete<{
      all?: { id?: unknown; key?: unknown }[];
    }>(resolveAgentBinary(), "/provider");
    const brut = rep.all?.find((p) => p.id === fournisseur);
    return typeof brut?.key === "string" && brut.key ? brut.key : null;
  } catch {
    return null; // serveur headless indisponible : diagnostic impossible
  }
}

/** Prompt muet depuis DELAI_DIAGNOSTIC_MS sur un modèle maison → on demande
 *  son avis à la passerelle (clé locale, micro-requête) : un 429 y est
 *  explicite (« Weekly usage limit reached. Resets in … »).
 *
 *  Cas MIXTE, le seul du panneau : le tour meurt pour de bon, donc le fil
 *  garde une marque brève (« tour interrompu » — sans elle la transcription
 *  exportée montrerait une question sans réponse ni raison), et la RAISON
 *  verbatim part au pied de panneau, où elle survit au tour et porte le lien
 *  vers l'espace de travail. Non concluant → on ne conclut rien. */
async function diagnostiquerSilence(modeleId: string, avant: number): Promise<void> {
  if (status !== "busy" || !sessionId || updatesRecus !== avant) return;
  const decoupe = decouperIdModele(modeleId);
  if (!decoupe) return;
  const verdict = await diagnostiquerQuota({
    fournisseur: decoupe.fournisseur,
    modele: decoupe.modele,
    cle: await cleLocale(decoupe.fournisseur),
    fetchImpl: tauriFetch as unknown as typeof fetch,
  });
  if (!verdict || status !== "busy" || updatesRecus !== avant) return;
  quotaSignale = true;
  pushItem({ kind: "agent", text: t("agent.tourInterrompu") });
  statut("erreur", "quota", t("agent.quotaLimite", { message: verdict.message }), verdict.url);
  void client?.cancel(sessionId); // la boucle serveur, au cas où elle s'arrête
  status = "ready";
  awaiting = false;
  canal = canalFinDeTour(canal);
  void finishTurnRendering();
}

async function send() {
  const text = draft.trim();
  if (!text || !client || !sessionId || status === "busy") return;
  pushItem({ kind: "user", text });
  draft = "";
  completionOuverte = false;
  histPos = -1; // nouvel envoi = retour au brouillon vivant
  quotaSignale = false;
  // Envoyer EST une action de l'utilisateur (les infos meurent), et ouvre un
  // tour (les avertissements se décomptent dessus).
  canal = canalDebutDeTour(canalActionUtilisateur(canal));
  status = "busy";
  awaiting = true;
  // Diagnostic de quota (mesures 2026-08-22) : sur forfait Go épuisé, la
  // passerelle répond en ~0,5 s par un 429 EXPLICITE alors que le prompt ACP,
  // lui, reste suspendu indéfiniment. Après DELAI sans AUCUN update, on
  // interroge la passerelle directement : verdict → message réel dans le fil ;
  // non concluant → on laisse le chien de garde d'inactivité agir.
  const avant = updatesRecus;
  const modeleId = modeleAffiche ?? "";
  const gardien = setTimeout(() => void diagnostiquerSilence(modeleId, avant), DELAI_DIAGNOSTIC_MS);
  scrollToBottom();
  try {
    await client.prompt(sessionId, text, annexesFichier(text));
  } catch (e) {
    if (!quotaSignale) {
      pushItem({ kind: "agent", text: t("agent.errorDetail", { message: String(e) }) });
    }
  } finally {
    clearTimeout(gardien);
    status = "ready";
    awaiting = false;
    canal = canalFinDeTour(canal);
    void finishTurnRendering();
  }
}

async function cancel() {
  if (client && sessionId) await client.cancel(sessionId);
  // `awaiting` autant que `status` : sur un prompt qui ne résout pas (la
  // boucle de réessai serveur ignore session/cancel), le `finally` de send()
  // n'arrivera qu'au chien de garde — d'ici là la saisie était réactivée
  // pendant que l'indicateur de frappe tournait encore.
  status = "ready";
  awaiting = false;
  canal = canalFinDeTour(canalActionUtilisateur(canal));
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

// ── Complétion @fichiers (calque du « @ » de la TUI OpenCode) ───────────────
// Le listing vient de walkSupportedTextFiles (JS existant, aucun backend) ;
// à l'envoi, chaque mention devient un bloc resource_link dont le contenu
// arrive à l'agent embarqué (mesuré sur le serveur ACP réel).
let textareaEl = $state<HTMLTextAreaElement | null>(null);
let listeEl = $state<HTMLElement | null>(null);
/** Fichiers du coffre ; null = jamais listé (chargement au premier @). */
let fichiersVault = $state<FlatFileEntry[] | null>(null);
let completionOuverte = $state(false);
let completionDebut = $state(0);
let completionQuery = $state("");
let completionIndex = $state(0);

async function assurerFichiersVault(): Promise<void> {
  if (fichiersVault !== null) return;
  try {
    fichiersVault = await walkSupportedTextFiles(getProjectRoot() ?? "/");
  } catch (e) {
    console.warn("[agent] liste des fichiers du coffre indisponible :", e);
    fichiersVault = [];
  }
}

/** Candidats mixtes (dossiers + fichiers) — recalculés une seule fois par
 *  listing du coffre, pas à chaque frappe. */
const candidatsVault = $derived(fichiersVault ? candidatsDe(fichiersVault) : []);

const candidats = $derived(
  completionOuverte ? filtrerParRel(candidatsVault, completionQuery) : [],
);

/** Recalcul après toute modification du texte ou déplacement du caret :
 *  token @ courant → popup ouvert dessus, ou fermé. */
function verifierCompletion(): void {
  const caret = textareaEl?.selectionStart ?? draft.length;
  const m = mentionAuCurseur(draft, caret);
  if (!m) {
    completionOuverte = false;
    return;
  }
  void assurerFichiersVault();
  completionDebut = m.debut;
  completionQuery = m.query;
  completionIndex = 0;
  completionOuverte = true;
}

/** VALIDATION d'un candidat (Entrée, clic, Tab sur fichier) : remplace le
 *  token par le chemin complet (+ espace final), referme la liste, met en
 *  valeur éphémère la mention insérée. */
function choisirCandidat(c: CandidatCompletion): void {
  const finToken = completionDebut + 1 + completionQuery.length;
  const remplacement = "@" + c.insertion + " ";
  draft = draft.slice(0, completionDebut) + remplacement + draft.slice(finToken);
  completionOuverte = false;
  const pos = completionDebut + remplacement.length;
  flashMention(completionDebut + 1, c.insertion.length);
  void tick().then(() => {
    textareaEl?.focus();
    textareaEl?.setSelectionRange(pos, pos);
  });
}

/** Tab sur un DOSSIER : déroule sans valider — « @docs/ » SANS espace final,
 *  le token reste ouvert et la liste rouvre sur les enfants. C'est
 *  l'affinage dans l'arborescence ; seule une validation (Entrée/clic)
 *  fige un dossier dans le message. */
function deroulerDossier(c: CandidatCompletion): void {
  const finToken = completionDebut + 1 + completionQuery.length;
  const remplacement = "@" + c.insertion;
  draft = draft.slice(0, completionDebut) + remplacement + draft.slice(finToken);
  const pos = completionDebut + remplacement.length;
  void tick().then(() => {
    textareaEl?.focus();
    textareaEl?.setSelectionRange(pos, pos);
    verifierCompletion();
  });
}

let flashEl = $state<HTMLElement | null>(null);

/** Mise en valeur éphémère de la mention validée (comportement TUI). Le
 *  champ ne stylise pas ses sous-chaînes : on mesure les fragments de ligne
 *  du token dans un miroir hors écran aux styles identiques, puis on peint
 *  une surbrillance par fragment qui s'estompe. */
function flashMention(debut: number, longueur: number): void {
  const ta = textareaEl;
  const couche = flashEl;
  const comp = couche?.parentElement;
  if (!ta || !couche || !comp || longueur <= 0) return;
  const cs = getComputedStyle(ta);
  // Miroir : mêmes boîte (bordures/padding/width inclus) et typographie que
  // le champ — visibility:hidden conserve la géométrie.
  const miroir = document.createElement("div");
  miroir.setAttribute("aria-hidden", "true");
  Object.assign(miroir.style, {
    position: "absolute",
    top: "-9999px",
    left: "-9999px",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    boxSizing: cs.boxSizing,
    width: cs.width,
    borderWidth: cs.borderWidth,
    padding: cs.padding,
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    letterSpacing: cs.letterSpacing,
    lineHeight: cs.lineHeight,
    tabSize: cs.tabSize,
  } satisfies Partial<CSSStyleDeclaration>);
  const avant = document.createElement("span");
  avant.textContent = draft.slice(0, debut);
  const jeton = document.createElement("span");
  jeton.textContent = draft.slice(debut, debut + longueur);
  miroir.replaceChildren(avant, jeton);
  comp.appendChild(miroir);
  // Fragments = un rectangle PAR ligne visuelle (un chemin long peut se
  // replier). Repère : bord interne du composer ; le scroll du champ est
  // soustrait car le miroir, lui, ne défile pas.
  const plage = document.createRange();
  plage.selectNodeContents(jeton);
  const rComp = comp.getBoundingClientRect();
  const origineX = rComp.left + comp.clientLeft - ta.scrollLeft;
  const origineY = rComp.top + comp.clientTop - ta.scrollTop;
  couche.replaceChildren(
    ...[...plage.getClientRects()].map((r) => {
      const frag = document.createElement("i");
      Object.assign(frag.style, {
        left: `${r.left - origineX}px`,
        top: `${r.top - origineY}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      return frag;
    }),
  );
  miroir.remove();
  // Rejouable à validation rapprochée : on fige, force le reflow, relâche.
  couche.style.transition = "none";
  couche.style.opacity = "1";
  void couche.offsetWidth;
  couche.style.transition = "";
  couche.style.opacity = "0";
}

/** L'item actif reste visible quand on navigue aux flèches. */
$effect(() => {
  void completionIndex;
  if (!completionOuverte || !listeEl) return;
  listeEl.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
});

/** Historique des demandes de la session — ↑/↓ façon TUI. La position
 *  compte depuis le présent : -1 = brouillon vivant, 0 = dernier envoi.
 *  Le brouillon non envoyé est mis de côté au premier rappel et restitué
 *  au retour ; les éditions d'une entrée rappelée ne sont pas conservées
 *  quand on poursuit la navigation (comportement shell). */
let histPos = $state(-1);
let histBrouillon = "";
const demandesEnvoyees = $derived(
  items.filter((i) => i.kind === "user").map((i) => i.text),
);

function naviguerHistorique(delta: number): void {
  const hist = demandesEnvoyees;
  if (histPos >= hist.length) histPos = -1; // position périmée
  const cible = cibleHistorique(histPos, delta, hist.length);
  if (cible === histPos) return;
  if (histPos === -1) histBrouillon = draft;
  histPos = cible;
  completionOuverte = false;
  draft = entreeHistorique(hist, histPos, histBrouillon);
  void tick().then(() => {
    textareaEl?.focus();
    textareaEl?.setSelectionRange(draft.length, draft.length);
  });
}

/** Export de la retranscription (équivalent /export TUI, adapté) : écrit
 *  .azprose/export/transcription-….md dans le coffre puis ouvre le fichier
 *  via une intention open-file — routage texte → tab éditeur main. Le
 *  dossier .azprose étant invisible au coffre (préfixe point), l'export ne
 *  pollue ni la navigation ni la complétion @. */
const aTranscription = $derived(items.some((i) => i.kind === "user"));

async function exporterTranscription(): Promise<void> {
  const racine = getProjectRoot();
  if (!racine || !aTranscription) return;
  try {
    const contenu = transcriptionMarkdown(
      items.filter((i) => i.kind === "user" || i.kind === "agent"),
      { modele: modeleAffiche || undefined },
    );
    const dossier = joinPath(racine, ".azprose/export");
    await mkdir(dossier, { recursive: true });
    const chemin = joinPath(dossier, nomTranscription());
    await writeText(chemin, contenu);
    window.dispatchEvent(
      new CustomEvent("azprose:navigate", {
        detail: { type: "open-file", path: chemin },
      }),
    );
    notifications.setInfo(t("agent.exportOk"));
  } catch (e) {
    console.warn("[agent] export de la transcription :", e);
    notifications.setInfo(t("agent.exportErreur"));
  }
}

/** Copie ATOMIQUE d'un message en source Markdown (variante fine de
 *  l'export) : clic droit sur une demande ou une réponse → « Copier en
 *  Markdown ». Le texte BRUT est copié tel quel — pas le rendu HTML — pour
 *  coller dans une note en gardant maths, code et tableaux. Réflexions et
 *  outils exclus (comme dans la transcription). */
function onFeedContextMenu(e: MouseEvent, item: FeedItem): void {
  if (item.kind !== "user" && item.kind !== "agent") return;
  contextMenu.openItems(e, [
    {
      label: t("agent.copierMarkdown"),
      icon: "wxi-copy",
      onSelect: () => void copierMarkdown(item),
    },
  ]);
}

async function copierMarkdown(item: FeedItem): Promise<void> {
  if (item.kind !== "user" && item.kind !== "agent") return;
  try {
    await navigator.clipboard.writeText(item.text);
    notifications.setInfo(t("agent.copieOk"));
  } catch (err) {
    console.warn("[agent] copie presse-papiers :", err);
    notifications.setInfo(t("agent.copieErreur"));
  }
}

/** Blocs ACP `resource_link` pour chaque mention résolvable du message —
 *  le serveur OpenCode y embarque le contenu (comportement TUI documenté).
 *  L'index ne contient que des FICHIERS : une mention de dossier
 *  (« @notes/ ») n'y correspond pas et reste donc du texte — l'agent
 *  explorera le dossier avec ses outils fs si besoin.
 *  Une mention inconnue reste pareillement du simple texte. */
function annexesFichier(texte: string): ContentBlock[] {
  const index = new Map((fichiersVault ?? []).map((f) => [f.rel, f]));
  return extraireMentions(texte)
    .map((m) => index.get(m.chemin))
    .filter((f): f is FlatFileEntry => f !== undefined)
    .map((f) => ({
      type: "resource_link",
      uri: uriFichier(f.path),
      name: f.name,
      title: f.name,
    }));
}

function onKeydown(e: KeyboardEvent) {
  // Complétion ouverte avec des propositions : flèches/Entrée/Tab/Échap
  // lui appartiennent — surtout Entrée, qui ne doit PAS envoyer.
  if (completionOuverte && candidats.length > 0) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      completionIndex = Math.min(completionIndex + 1, candidats.length - 1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      completionIndex = Math.max(completionIndex - 1, 0);
      return;
    }
    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      const c = candidats[completionIndex];
      // Tab sur un dossier DÉROULE (affinage dans l'arborescence) ;
      // Entrée et clic valident toujours — fichier comme dossier.
      if (e.key === "Tab" && c.dossier) deroulerDossier(c);
      else choisirCandidat(c);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      completionOuverte = false;
      return;
    }
  } else if (completionOuverte && e.key === "Escape") {
    completionOuverte = false;
    return;
  }
  // Historique ↑/↓ façon TUI : seulement aux bornes verticales LOGIQUES du
  // champ, pour ne pas voler le déplacement caret dans une demande multiligne
  // (Maj+flèche = sélection, jamais l'historique).
  if (!e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    const caret = textareaEl?.selectionStart ?? draft.length;
    const aBorne =
      e.key === "ArrowUp"
        ? caretSurPremiereLigne(draft, caret)
        : caretSurDerniereLigne(draft, caret);
    if (aBorne) {
      e.preventDefault();
      naviguerHistorique(e.key === "ArrowUp" ? 1 : -1);
      return;
    }
  }
  // Entrée envoie, Maj+Entrée saute une ligne.
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void send();
    return;
  }
  // Le caret a pu quitter le token sans événement input : revérifier.
  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
    queueMicrotask(verifierCompletion);
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
  // Minuteries de rendu : armées, elles muteraient l'état d'un composant
  // démonté (le throttle de rendu survit 80 ms à la fermeture du panneau).
  if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
  if (liveTypesetTimer) { clearTimeout(liveTypesetTimer); liveTypesetTimer = null; }
  void client?.stop();
  // Le serveur de catalogue vit autant que le panneau (décision paresseux-
  // puis-maintenu) : sans ce kill, il resterait orphelin jusqu'à la fermeture
  // de l'app.
  void serveurCatalogue.arreter();
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
    {#if statutBloquant}
      <!-- Marqueur persistant : le pied peut sortir du champ de vision, pas
           l'en-tête. Contre l'accoutumance périphérique (retour utilisateur). -->
      <i
        class="wxi-alert-circle agent__marqueur"
        data-tooltip={messageStatut?.texte}
        aria-hidden="true"
      ></i>
    {/if}
    <div class="agent__actions">
      <!-- Sélecteur de modèle : actif seulement sur session prête (D7 — un
           switch pendant une génération ferait la course au prompt). Deux
           sources : la liste de l'agent (configOptions, actifs) et le
           catalogue complet du serveur headless (chargé au 1er ouvert).
           Le chip montre le modèle EN COURS, pas seulement la surcharge. -->
      <AgentModelSelect
        label={t("agent.model.label")}
        value={modeleAffiche}
        pin={modelePin}
        modeles={modelesDisponibles}
        catalogue={cataloguePourMenu}
        catalogueIndisponible={catalogueErreur}
        aucunCoche={aucunFournisseurCoche}
        disabled={status !== "ready"}
        onSelect={choisirModele}
        onSelectCatalogue={choisirModeleCatalogue}
        onEpingler={epinglerModele}
        onOuvre={chargerCatalogue}
      />
      <button
        class="agent__iconbtn"
        data-tooltip={t("agent.export")}
        aria-label={t("agent.export")}
        onclick={exporterTranscription}
        disabled={!aTranscription || status === "starting"}
      >
        <i class="wxi-download"></i>
      </button>
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
  </div>

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions — clic délégué sur les <a> du rendu markdown, même motif que la preview -->
  <div class="agent__feed" bind:this={feedEl} onclick={onFeedClick}>
    <!-- « agent introuvable » a quitté le fil pour le canal d'infrastructure
         (il ne figurerait pas dans une transcription exportée) ; l'erreur de
         session et le démarrage restent ici, ils qualifient LE fil. -->
    {#if status === "error"}
      <div class="agent__notice">{t("agent.error")}{errorMessage ? ` — ${errorMessage}` : ""}</div>
    {:else if status === "starting"}
      <div class="agent__notice">{t("agent.starting")}</div>
    {/if}

    {#each items as item (item.id)}
      {#if item.kind === "user"}
        <div class="agent__msg agent__msg--user" oncontextmenu={(e) => onFeedContextMenu(e, item)}>
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
          <div class="agent__msg agent__msg--agent mdv-prose" class:agent__msg--html={!!item.html} oncontextmenu={(e) => onFeedContextMenu(e, item)}>
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
    {#if completionOuverte && candidats.length > 0}
      <!-- Liste de complétion @ : au-dessus du champ (portal inutile, le
           composer est fixe en bas du panneau et jamais clippé). -->
      <div bind:this={listeEl} class="agent__mention-liste" role="listbox" aria-label={t("agent.completionLabel")}>
        {#each candidats as f, i (f.rel)}
          <button
            type="button"
            role="option"
            aria-selected={i === completionIndex}
            class="agent__mention-item"
            class:is-active={i === completionIndex}
            title={f.rel}
            onmousedown={(e) => {
              // Sans preventDefault, le clic retirerait le focus au champ.
              e.preventDefault();
              // Clic = Tab : un dossier se DÉROULE, seul Entrée le valide.
              if (f.dossier) deroulerDossier(f);
              else choisirCandidat(f);
            }}
          >
            <i class={"wxi-" + (f.dossier ? "folder" : "file")} aria-hidden="true"></i>
            <span class="agent__mention-nom">{f.nom}</span>
            <span class="agent__mention-rel">{f.rel}</span>
          </button>
        {/each}
      </div>
    {/if}
    <!-- Surbrillance éphémère de la mention validée : conteneur plein
         composer, fragments positionnés par flashMention. -->
    <div bind:this={flashEl} class="agent__mention-flash" aria-hidden="true"></div>
    <textarea
      bind:this={textareaEl}
      bind:value={draft}
      onkeydown={onKeydown}
      oninput={verifierCompletion}
      onclick={verifierCompletion}
      onblur={() => (completionOuverte = false)}
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

  <!-- Canal d'infrastructure : SOUS le composer, en pied de panneau. Ni la
       StatusBar globale (centrée document, et l'assistant peut être fermé),
       ni un toast (qui s'efface tout seul). -->
  <AgentStatusLine message={messageStatut} onFerme={() => (canal = canalFermer(canal))} />

  {#if connexion}
    <!-- Dialogue de connexion d'un fournisseur du catalogue : modal sur toute
         la fenêtre (le sélecteur derrière n'a plus de sens pendant le flux). -->
    <AgentConnectDialog
      fournisseur={connexion.fournisseur}
      onFerme={() => (connexion = null)}
      onConnecte={connexionReussie}
    />
  {/if}
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
  /* Marqueur d'erreur bloquante : `margin-right: auto` pour qu'il colle au
     titre au lieu de se centrer entre lui et les actions. */
  .agent__marqueur {
    color: var(--color-error);
    font-size: 14px;
    margin-left: 6px;
    margin-right: auto;
  }
  .agent__actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .agent__reset,
  .agent__iconbtn {
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    transition: background var(--dur-fast) var(--easing), color var(--dur-fast) var(--easing);
  }
  .agent__reset:hover,
  .agent__iconbtn:hover { background: var(--surface-hover); color: var(--fg); }
  .agent__reset:disabled,
  .agent__iconbtn:disabled { opacity: 0.4; cursor: default; }

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
    position: relative;
    border-top: 1px solid var(--border);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  /* Liste de complétion @ : même échelle que le menu de modèles (items
     12,5 px), ancrée au-dessus du composer entier. */
  .agent__mention-liste {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: calc(100% - 4px);
    max-height: 220px;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 6px);
    box-shadow:
      0 1px 0 color-mix(in srgb, white 4%, transparent) inset,
      0 10px 28px rgba(var(--shadow-color), 0.22),
      0 2px 8px rgba(var(--shadow-color), 0.08);
    z-index: 20;
    padding: 4px;
    display: flex;
    flex-direction: column;
  }
  .agent__mention-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 5px 10px;
    background: transparent;
    border: 0;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--font-ui, system-ui);
    font-size: 12.5px;
    color: var(--fg);
    text-align: left;
    white-space: nowrap;
  }
  .agent__mention-item:hover,
  .agent__mention-item.is-active {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }
  /* Icône fichier/dossier du candidat — muette, elle ne doit pas voler
     l'attention au nom et au chemin. */
  .agent__mention-item .wxi-folder,
  .agent__mention-item .wxi-file {
    flex: none;
    font-size: 14px;
    color: var(--muted);
  }
  .agent__mention-nom {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Chemin relatif : muet, tronqué à droite — c'est lui qui désambiguïse. */
  .agent__mention-rel {
    margin-left: auto;
    font-size: 11px;
    color: var(--muted);
    font-family: var(--font-mono, ui-monospace, monospace);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Surbrillance éphémère d'une mention validée (comportement TUI) : le
     conteneur couvre le composer et s'estompe ; les fragments sont posés au
     pixel par la mesure miroir. Aucune interaction possible (pointer-events). */
  .agent__mention-flash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.55s ease-out;
  }
  /* Fragments <i> créés en JS : :global obligatoire, sinon Svelte juge la
     règle inutilisée et la retire au build. */
  .agent__mention-flash :global(i) {
    position: absolute;
    border-radius: 3px;
    background: color-mix(in srgb, var(--accent) 30%, transparent);
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
