<script lang="ts">
/**
 * Fenêtre fille « NAV » (chantier fenêtre NAV, phase 1 — socle multi-onglets).
 * Une fenêtre = un mini-navigateur en LECTURE SEULE (R1) : plusieurs onglets,
 * une pile back/forward PAR ONGLET, conventions navigateur (R4 : clic = sur
 * place, ctrl+clic = nouvel onglet). Le rendu markdown est le MÊME que celui
 * des viewers (MarkdownPreview / DocPreview — aucun pipeline parallèle).
 *
 * La fenêtre ne modifie JAMAIS la session : elle lit des fichiers, point
 * (R3 — aucune persistance propre, aucune écriture dans localStorage).
 */
import { onMount } from "svelte";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emitTo, listen } from "@tauri-apps/api/event";
import MarkdownPreview from "@/components/markdown/MarkdownPreview.svelte";
import LazyDocPreview from "@/components/markdown/LazyDocPreview.svelte";
import LazyPdfViewer from "@/components/pdf/LazyPdfViewer.svelte";
import LazySlideDeck from "@/components/markdown/LazySlideDeck.svelte";
import TabsBar from "@/components/editor/TabsBar.svelte";
import NavTitleBar from "@/components/nav/NavTitleBar.svelte";
import BrowseToolbar from "@/components/nav/BrowseToolbar.svelte";
import BrowseSidebar from "@/components/nav/BrowseSidebar.svelte";
import Toast from "@/components/overlays/Toast.svelte";
import { notifications } from "@/stores/notifications.svelte";
import { basename, isPdfPath } from "@/lib";
import { readText } from "@/lib/files";
import { extFromPath } from "@/lib/editor-languages";
import { setRootPath } from "@/stores/root-path.svelte";
import { setScrollTarget } from "@/stores/scroll-target.svelte";
import { getFileIndex } from "@/lib/vault-index";
import { normPath } from "@/lib/panel-store";
import { navState } from "@/nav/nav-state.svelte";
import { buildDeclaredToc, type DeclaredToc } from "@/lib/toc-declared";
import { parentLabelOf } from "@/lib/browse-window";
import {
  createNavStack,
  navStackBack,
  navStackCanGoBack,
  navStackCanGoForward,
  navStackForwardStep,
  navStackPush,
  navStackPushForward,
} from "@/lib/nav-stack";
import { parseAddress, filterIndexEntries, filterHelpArticles } from "@/nav/address";
// `@/help/catalog` (PAS le baril `@/help`) : le baril réexporte aussi
// `help-bundle.ts`, dont le glob `eager: true` inlinerait TOUT le contenu
// markdown de la doc dans le chunk NAV pour la seule liste {path,title}.
import { catalog as helpCatalog } from "@/help/catalog";
import { helpFilePath, helpIndexPath, isHelpPath } from "@/lib/help-install";
import { getT, language } from "@/lib/i18n";
import { persistedState } from "@/stores/persisted.svelte";
import { STORAGE_KEYS } from "@/lib/storage";
import { windowTitle } from "@/lib/window-title";
import { removeBootSplash } from "@/shell/boot";
// Fin du piège #1 du plan (vague 3, phase 3.1) : TabsBar, BrowseSidebar
// (shell + en-tête) et MarkdownPreview/DocPreview
// (preview.css) portent désormais chacun son propre contrat CSS — plus un
// seul import de feuille de composant dans cette fenêtre (prose.css, lui,
// ne servait même à rien ici : `.cm-html-widget` est l'éditeur ProseMark,
// jamais monté par NAV — R1, lecture seule).
// PDF (phase 6) : pdf_viewer.css (chrome pdf.js, ~160 Ko) + pdf.css (habillage
// AZprose) — mêmes deux feuilles que la fenêtre de projet (piège #1, R7), mais
// chargées en LAZY (voir plus bas, effet sur activeTab) : contrairement à
// prose/preview/tabs (systématiques, quelques Ko), pdf_viewer.css est lourd et
// PDF n'est qu'UN format parmi d'autres — l'importer en eager alourdirait le
// chunk NAV pour des sessions qui ne montrent jamais de PDF (poids du chunk
// NAV : ASSUMÉ pour les compétences de navigation elles-mêmes, pas pour une
// dépendance non sollicitée). Le composant reste le même (LazyPdfViewer) :
// seule la feuille de style change de moment de chargement.

// Thème + polices sont appliqués par initPresentation() dans main.ts, AVANT
// le montage de ce composant (vague 2, phase 2.1 — src/shell/presentation.ts).
// C'est le correctif direct du bug diagnostiqué en phase 1.2 : NAV ne posait
// jamais data-theme et restait figée en latte clair quel que soit le thème.

let t = $derived(getT($language));

const params = new URLSearchParams(location.search);
const root = params.get("root");
setRootPath(root);

// Décorations : cette fenêtre est TOUJOURS décorée par le WM, comme PROJET.
// Le mode « décorations de l'app » (et sa propagation PROJET→NAV par
// l'événement `azprose:decorations`) a été SUPPRIMÉ le 2026-08-14.

// Panel, piles back/forward et pages PDF cibles : état de FENÊTRE, à la portée
// module de nav-state.svelte.ts (phase 1.4) — survit au remontage HMR de CE
// composant, contrairement à un scope d'instance ($state ici). Voir le
// commentaire de tête de nav-state.svelte.ts pour le piège que ça corrige.

let tabs = $derived.by(() => { navState.panelRev; return navState.panel.tabs; });
let activeTabId = $derived.by(() => { navState.panelRev; return navState.panel.activeTabId; });
let activeTab = $derived.by(() => tabs.find(tb => tb.id === activeTabId) ?? null);

let canGoBack = $derived.by(() => {
  navState.stackRev;
  const id = activeTabId;
  return id ? navStackCanGoBack(navState.navStacks.get(id) ?? createNavStack()) : false;
});
let canGoForward = $derived.by(() => {
  navState.stackRev;
  const id = activeTabId;
  return id ? navStackCanGoForward(navState.navStacks.get(id) ?? createNavStack()) : false;
});

/** Message TRANSIENT affiché au-dessus du contenu (cible introuvable, format
 *  non lisible ici, échec de chargement) : un clic de navigation qui ne
 *  produit rien est indiscernable d'une panne — la fenêtre doit toujours dire
 *  ce qu'elle fait. Ne remplace JAMAIS le contenu affiché (piège #3 du plan) :
 *  `repoint`/`open` laissent l'onglet inchangé sur échec, rien n'est perdu.
 *
 *  Toast plutôt qu'une barre fixe (2026-08-14) : une barre occupait un espace
 *  PERMANENT pour un message qui ne l'est pas — contraire à l'objectif même
 *  du chantier chrome façon navigateur (récupérer l'espace vertical gâchi
 *  par la barre de titre GTK). `notifications` est un store GÉNÉRIQUE (pas de
 *  dépendance PROJET) — sûr à réutiliser ici : chaque fenêtre Tauri est son
 *  propre process JS, aucune instance partagée entre PROJET et NAV. */
function say(message: string): void {
  // `setInfo` porte déjà son propre minuteur d'auto-effacement (4s) — rien à
  // gérer ici.
  notifications.setInfo(message);
}

/** Compteur de RENDU (indépendant de `navState.panelRev`, qui bouge aussi pour des
 *  raisons sans rapport avec le contenu affiché — fermeture d'un AUTRE onglet,
 *  réordonnancement…) : force `MarkdownPreview`/`DocPreview` à rejouer leur
 *  effet de rendu à chaque navigation aboutie. */
let contentRev = $state(0);

/** Formats que NAV sait réellement RENDRE (2026-08-14) — borne les suggestions
 *  de la barre d'adresse. Miroir exact du routage de `renderView` : markdown
 *  (MarkdownPreview/DocPreview) et PDF (LazyPdfViewer). Tout le reste (`.tex`,
 *  `.csv`, `.html`, images…) donnerait un onglet incapable d'afficher quoi que
 *  ce soit. `.html` est un candidat CONNU mais hors périmètre : il demanderait
 *  un serveur HTTP en boucle locale pour le JS/CSS embarqué — chantier à part. */
const NAV_RENDERABLE_EXTS = new Set(["md", "markdown", "pdf"]);

// ── Barre d'adresse (phase 2 — R5) ──────────────────────────────────────
// Zone de RECHERCHE, pas un affichage de l'emplacement courant (D9/C : « au
// plus one onglet vide, focus dans la barre d'adresse ») : elle se vide après
// chaque navigation aboutie, comme une omnibox de « nouvel onglet ».
let addressValue = $state("");
let addressEl: HTMLInputElement | undefined = $state();
let vaultSuggestions = $state<{ base: string; path: string }[]>([]);
let helpSuggestions = $state<{ path: string; title: string }[]>([]);

/** Index de la suggestion sélectionnée au clavier dans la liste APLATIE
 *  (vault puis aide, dans l'ordre d'affichage) — -1 = aucune, le texte saisi
 *  fait foi. ↓/↑ déplacent (avec bouclage), Entrée valide la ligne
 *  sélectionnée au lieu de la résolution plein texte (2026-08-14). */
let activeSuggestionIndex = $state(-1);

type FlatSuggestion =
  | { kind: "vault"; base: string; path: string }
  | { kind: "help"; path: string; title: string };

let flatSuggestions = $derived<FlatSuggestion[]>([
  ...vaultSuggestions.map((s) => ({ kind: "vault" as const, ...s })),
  ...helpSuggestions.map((a) => ({ kind: "help" as const, ...a })),
]);

// D4 (round 1) : l'onglet vide donne le focus à la barre d'adresse — dès
// qu'il devient actif (ouverture, sélection), pas seulement à sa création.
$effect(() => {
  if (activeTab && !activeTab.path) addressEl?.focus();
});

async function updateSuggestions(): Promise<void> {
  // Toute frappe invalide la sélection clavier en cours — la liste sous-
  // jacente change, l'index n'a plus de sens garanti.
  activeSuggestionIndex = -1;
  const { kind, query } = parseAddress(addressValue);
  if (!query) {
    vaultSuggestions = [];
    helpSuggestions = [];
    return;
  }
  if (kind === "help") {
    helpSuggestions = filterHelpArticles(helpCatalog, query);
    vaultSuggestions = [];
    return;
  }
  helpSuggestions = [];
  if (!root) {
    vaultSuggestions = [];
    return;
  }
  const index = await getFileIndex(root);
  vaultSuggestions = filterIndexEntries(index, query)
    .map((base) => ({ base, path: index.get(base)! }))
    // NAV ne sait afficher que du markdown et du PDF : proposer un `.tex`, un
    // `.csv` ou une image mène à un onglet qui ne peut RIEN rendre. Le filtre
    // vit ICI, jamais dans `getFileIndex` : cet index est massivement PARTAGÉ
    // (wikilinks, transclusion, toc-forest, toc-declared, pdf-rect-embed) — le
    // restreindre casserait la résolution des liens et des transclusions, qui
    // doivent continuer de voir TOUS les fichiers du vault.
    .filter(({ path }) => NAV_RENDERABLE_EXTS.has(extFromPath(path)));
}

function clearAddress(): void {
  addressValue = "";
  vaultSuggestions = [];
  helpSuggestions = [];
  activeSuggestionIndex = -1;
}

/** Résolution PLEINE (Entrée sans suggestion choisie) : préfixe `aide:`/`help:`
 *  → catalogue de l'aide (titre puis chemin) ; sinon → index du vault, en
 *  résolution wikilink SANS crochets (basename exact, puis insensible à la
 *  casse, puis meilleure correspondance de la complétion — R5). */
async function resolveAddress(raw: string): Promise<string | null> {
  const { kind, query } = parseAddress(raw);
  if (kind === "help") {
    if (!root) return null;
    if (!query) return helpIndexPath(root);
    const q = query.toLowerCase();
    const match = helpCatalog.find((a) => a.title.toLowerCase().includes(q))
      ?? helpCatalog.find((a) => a.path.toLowerCase().includes(q));
    return match ? helpFilePath(root, match.path) : null;
  }
  if (!query || !root) return null;
  const index = await getFileIndex(root);
  const direct = index.get(query);
  if (direct) return direct;
  const lowerHit = [...index.entries()].find(([base]) => base.toLowerCase() === query.toLowerCase());
  if (lowerHit) return lowerHit[1];
  const [best] = filterIndexEntries(index, query, 1);
  return best ? (index.get(best) ?? null) : null;
}

/** Ouvre une cible résolue par la barre d'adresse : PDF → TOUJOURS un
 *  nouvel onglet (R4, comme un lien), sinon navigation « sur place ». */
async function openAddressTarget(path: string): Promise<void> {
  if (extFromPath(path) === "pdf") {
    await loadNewTab(path, null);
    return;
  }
  await navigateTo(path, null, false);
}

async function submitAddress(): Promise<void> {
  const raw = addressValue.trim();
  if (!raw) return;
  const target = await resolveAddress(raw);
  if (!target) {
    say(t("browse.addressNotFound", { name: raw }));
    return;
  }
  clearAddress();
  await openAddressTarget(target);
}

async function chooseSuggestion(path: string): Promise<void> {
  clearAddress();
  await openAddressTarget(path);
}

async function chooseFlatSuggestion(s: FlatSuggestion): Promise<void> {
  await chooseSuggestion(s.kind === "vault" ? s.path : helpFilePath(root ?? "", s.path));
}

/** Fait défiler la ligne sélectionnée dans la vue si ↓/↑ l'a sortie de la
 *  zone visible (liste bornée à 260px, `overflow-y:auto`) — un id stable par
 *  ligne (gabarit ci-dessous) suffit, une seule barre d'adresse existe dans
 *  ce document. */
function scrollActiveSuggestionIntoView(): void {
  document.getElementById(`browse-suggestion-${activeSuggestionIndex}`)
    ?.scrollIntoView({ block: "nearest" });
}

function onAddressKeydown(e: KeyboardEvent): void {
  if (e.key === "ArrowDown") {
    if (flatSuggestions.length === 0) return;
    e.preventDefault();
    activeSuggestionIndex = (activeSuggestionIndex + 1) % flatSuggestions.length;
    scrollActiveSuggestionIntoView();
  } else if (e.key === "ArrowUp") {
    if (flatSuggestions.length === 0) return;
    e.preventDefault();
    activeSuggestionIndex =
      (activeSuggestionIndex - 1 + flatSuggestions.length) % flatSuggestions.length;
    scrollActiveSuggestionIntoView();
  } else if (e.key === "Enter") {
    e.preventDefault();
    // Une ligne sélectionnée au clavier prime sur la résolution plein texte —
    // Entrée valide ce qui est SOUS LES YEUX, pas une devinette recalculée.
    const selected = activeSuggestionIndex >= 0 ? flatSuggestions[activeSuggestionIndex] : null;
    if (selected) void chooseFlatSuggestion(selected);
    else void submitAddress();
  } else if (e.key === "Escape") {
    vaultSuggestions = [];
    helpSuggestions = [];
    activeSuggestionIndex = -1;
  }
}

// ── Toolbar au survol (phase 4) ─────────────────────────────────────────

/** Sidebar repliable — repli persisté (phase 1.5, R6 : mobilier SYSTÈME de
 *  fenêtre, clé DISTINCTE de celle de PROJET). */
const sidebarVisible = persistedState<boolean>(STORAGE_KEYS.navSidebarOpen, true);

/** État maximisé de la fenêtre — remonté ICI (pas dans NavTitleBar) : sert à
 *  la fois au bouton restaurer/maximiser (icône) ET à `.browse` elle-même,
 *  qui doit perdre marge/ombre/coins arrondis en plein écran (2026-08-14,
 *  constat visuel post-test — l'effet « carte flottante » n'a pas de sens
 *  une fois la fenêtre maximisée : il n'y a plus de bureau à montrer autour).
 *  Source UNIQUE ici plutôt que dupliquée dans NavTitleBar (un seul
 *  `onResized`, un seul état, propagé en prop). */
let isMaximized = $state(false);

async function refreshMaximized() {
  try { isMaximized = await getCurrentWindow().isMaximized(); } catch {}
}

// Le WM ne prévient pas d'un maximize externe (raccourci clavier, tuilage) :
// on se resynchronise sur chaque redimensionnement.
$effect(() => {
  const win = getCurrentWindow();
  const unlisten = win.onResized(() => { refreshMaximized(); });
  refreshMaximized();
  return () => { unlisten.then((fn) => fn()); };
});

/** TOC déclarative (§3) de l'onglet ACTIF — recalculée à chaque navigation
 *  aboutie. Sert ICI au bouton « home » (racine de l'arbre déclaré) ; sert
 *  aussi de base à la sidebar (phase 5), évitant un second calcul. */
let currentToc = $state<DeclaredToc | null>(null);

$effect(() => {
  const tab = activeTab;
  // Dépendances explicitement LUES avant l'await (règle Svelte 5 : un effect
  // async ne peut suivre que ce qu'il a lu de façon SYNCHRONE avant le premier await).
  const path = tab?.path ?? "";
  const source = tab?.source ?? "";
  const tabId = tab?.id ?? null;
  const r = root;
  // Le front-matter sommaire:/parent: n'a de sens que pour du markdown — un
  // .tex/.typ/.txt monté (résolu par un wikilink, cf. onWikilink) ne déclenche
  // aucun calcul (extFromPath, pas isMarkdownPath : accepte aussi .markdown).
  if (!path || !r || !["md", "markdown"].includes(extFromPath(path))) {
    currentToc = null;
    return;
  }
  void (async () => {
    const result = await buildDeclaredToc({
      documentPath: path,
      documentSource: source,
      rootPath: r,
      readText,
      getIndex: getFileIndex,
    });
    // Garde anti-course : n'applique le résultat que si l'onglet actif est
    // toujours celui qui a déclenché ce calcul (navigation rapide entre onglets).
    if (activeTab?.id === tabId) currentToc = result;
  })();
});

let canGoHome = $derived(currentToc?.origin === "declared");

function goHome(): void {
  if (currentToc?.origin === "declared") void navigateTo(currentToc.rootPath, null, false);
}

/** R10 : « ouvrir dans l'éditeur » cible la fenêtre de PROJET qui a lancé
 *  cette fenêtre NAV (jamais une autre) — le label parent est encodé dans le
 *  label de la fenêtre courante. `session-restore.ts` écoute déjà cet
 *  événement côté projet et ouvre un nouvel onglet éditeur avec dédup. */
async function openInEditor(): Promise<void> {
  const tab = activeTab;
  if (!tab || !tab.path) return;
  const parent = parentLabelOf(getCurrentWindow().label);
  if (!parent) return;
  await emitTo(parent, "azprose:open-file", tab.path);
}

let presentationAvailable = $derived(!!activeTab?.path && extFromPath(activeTab.path) === "md");
let presentationActive = $derived(activeTab?.renderMode === "presentation");

/** `setRenderMode` ne notifie pas (panel-store.ts) — bump manuel via `navState.bumpPanel()`. */
function togglePresentation(): void {
  const tab = activeTab;
  if (!tab) return;
  navState.panel.setRenderMode(tab.id, tab.renderMode === "presentation" ? "preview" : "presentation");
  navState.bumpPanel();
}

let isFullscreen = $state(false);

async function toggleFullscreen(): Promise<void> {
  const next = !isFullscreen;
  await getCurrentWindow().setFullscreen(next);
  isFullscreen = next;
}

// ── Formats (phase 6) : PDF ─────────────────────────────────────────────

/** Chargement PARESSEUX des feuilles de `PdfViewer` (~160 Ko à elles deux) —
 *  au premier onglet PDF activé, jamais avant (cf. commentaire des imports en
 *  tête de fichier). Idempotent : un `import()` déjà résolu revient du cache
 *  du module, un second déclenchement (autre onglet PDF, ou retour sur le
 *  même) ne re-télécharge rien. */
$effect(() => {
  if (activeTab && isPdfPath(activeTab.path)) {
    void import("pdfjs-dist/web/pdf_viewer.css");
    void import("@/styles/pdf/pdf.css");
  }
});

// Titre de fenêtre — "AZprose — <projet>", règle COMMUNE avec PROJET (cf.
// window-title.ts). Posé UNE fois : le projet d'une fenêtre NAV est fixé par
// son `?root=` et ne change jamais. Avant, le titre suivait le fichier actif
// et devait donc être rejoué à chaque navigation (5 sites d'appel) — c'est
// tout ce mécanisme qui disparaît.
$effect(() => {
  void getCurrentWindow().setTitle(windowTitle(root ? basename(root) : null));
});

/** Onglet VIDE (R6, D4) — état de première classe, pas de page d'accueil.
 *  `PanelState.open` exige un chemin RÉEL (`isOpenablePath`) : un onglet vide
 *  n'a pas de contenu à charger, il est donc créé directement (mutation
 *  publique de `tabs`/`activeTabId`, hors des méthodes de `PanelState`). */
function openEmptyTab(): void {
  const id = crypto.randomUUID();
  navState.panel.tabs = [...navState.panel.tabs, { id, title: t("browse.emptyTab"), path: "", source: "", savedContent: "" }];
  navState.panel.activeTabId = id;
  navState.bumpPanel();
}

/** Charge `path` DANS l'onglet `tabId` (navigation « sur place », R4). Sur
 *  échec l'onglet reste INCHANGÉ (contrat de `PanelState.repoint`) — rien
 *  n'est perdu, on se contente de le dire. */
async function loadInPlace(tabId: string, path: string, heading?: string | null): Promise<boolean> {
  const { ok } = await navState.panel.repoint(tabId, path, { silent: true });
  if (!ok) {
    say(t("browse.loadFailed", { name: basename(path) }));
    return false;
  }
  contentRev++;
  if (heading) setScrollTarget(heading);
  return true;
}

/** Ouvre `path` dans un NOUVEL onglet (ctrl+clic, bouton `+`, absence
 *  d'onglet actif). Dédup NATURELLE de `PanelState.open` : un onglet déjà
 *  ouvert sur ce contenu est activé plutôt que dupliqué. */
async function loadNewTab(path: string, heading?: string | null): Promise<boolean> {
  const before = navState.panel.tabs.length;
  try {
    await navState.panel.open(path, { silent: true });
  } catch {
    say(t("browse.loadFailed", { name: basename(path) }));
    return false;
  }
  // `silent: true` avale les échecs (format non ouvrable, lecture impossible)
  // sans lever — un onglet manquant après l'appel EST l'échec.
  if (navState.panel.tabs.length === before && !navState.panel.tabs.some(tb => normPath(tb.path) === normPath(path))) {
    say(t("browse.loadFailed", { name: basename(path) }));
    return false;
  }
  contentRev++;
  if (heading) setScrollTarget(heading);
  return true;
}

/** Navigation d'un lien (R4) : `newTab` = ctrl/cmd+clic. Cible déjà affichée
 *  dans l'onglet actif → on ne bouge pas, mais l'ancre est honorée (aller à
 *  une section de la page affichée). */
async function navigateTo(path: string, heading: string | null, newTab: boolean): Promise<void> {
  if (!path) return;
  const current = activeTab;
  if (!newTab && current && current.path && normPath(current.path) === normPath(path)) {
    // Cible DÉJÀ affichée — cas dominant d'un clic dans la TOC (ses titres sont
    // ceux du document courant). Il n'y a donc AUCUN re-rendu à venir, et c'est
    // précisément ce qui cassait les liens de la TOC : `setScrollTarget` pose
    // une cible que `MarkdownPreview` ne consomme QUE dans son effet de rendu
    // (`consumeScrollTarget`) — sans re-rendu, elle n'était jamais lue et rien
    // ne défilait. On passe donc par `azprose:preview-jump-line`, le mécanisme
    // de saut HORS rendu déjà utilisé pour la synchronisation éditeur→preview :
    // il localise le titre par son id et nettoie lui-même la cible en attente.
    // `path` est OBLIGATOIRE dans le détail : le récepteur ignore l'événement
    // s'il ne correspond pas au fichier qu'il affiche (garde anti-diaphonie
    // entre previews). L'omettre rendrait le saut silencieusement inopérant.
    if (heading) {
      setScrollTarget(heading);
      window.dispatchEvent(new CustomEvent("azprose:preview-jump-line", { detail: { path, heading } }));
    }
    return;
  }
  if (newTab || !current) {
    await loadNewTab(path, heading);
    return;
  }
  const previousPath = current.path;
  const tabId = current.id;
  const ok = await loadInPlace(tabId, path, heading);
  if (ok && previousPath) {
    navStackPush(navState.stackFor(tabId), previousPath);
    navState.bumpStack();
  }
}

async function goBack(): Promise<void> {
  const tab = activeTab;
  if (!tab) return;
  const stack = navState.stackFor(tab.id);
  const target = navStackBack(stack);
  if (!target) return;
  const current = tab.path;
  const ok = await loadInPlace(tab.id, target);
  if (ok) navStackPushForward(stack, current);
  else navStackPush(stack, target);
  navState.bumpStack();
}

async function goForward(): Promise<void> {
  const tab = activeTab;
  if (!tab) return;
  const stack = navState.stackFor(tab.id);
  const target = navStackForwardStep(stack, tab.path);
  if (!target) return;
  if (!(await loadInPlace(tab.id, target))) navStackPushForward(stack, target);
  navState.bumpStack();
}

function selectTab(id: string): void {
  // `wake: false` : les onglets NAV ne sont jamais dormants (aucun restore de
  // session) — `select` par défaut appellerait `wake()` pour rien à chaque clic.
  navState.panel.select(id, { wake: false });
}

function closeTab(id: string): void {
  navState.panel.close(id);
  // Jamais zéro onglet (R6) : fermer le dernier onglet rouvre un onglet vide,
  // l'équivalent NAV d'une page « nouvel onglet ».
  if (navState.panel.tabs.length === 0) openEmptyTab();
}

/** Résout la cible d'un wikilink : chemin complet si le rendu l'a déjà résolu,
 *  sinon l'index du vault (basename → chemin), comme le viewer. */
async function resolveTarget(detail: { path?: string; target?: string }): Promise<string | null> {
  if (detail.path) return detail.path;
  if (!detail.target || !root) return null;
  const index = await getFileIndex(root);
  const bare = detail.target.replace(/\.[^.]+$/, "");
  return index.get(bare) ?? index.get(detail.target) ?? null;
}

onMount(() => {
  // NAV n'attend rien (pas de config de projet à charger) : le splash peut
  // s'effacer dès le montage — même mécanique de fondu que PROJET
  // (src/shell/boot.ts, phase 2.1), qui l'appelle après sa propre condition
  // de prêt (themeBootDone).
  removeBootSplash();

  // État initial du bouton plein écran (R5 : la fenêtre PEUT démarrer en
  // plein écran si la fenêtre de lancement l'était — browse-window.ts).
  void getCurrentWindow().isFullscreen().then((v) => { isFullscreen = v; });

  const initial = params.get("browse") ?? "";
  if (initial) {
    // Échec au boot (fichier introuvable) : jamais zéro onglet (R6) — un
    // onglet vide prend le relais, l'échec reste dit via `say()`.
    void loadNewTab(initial).then((ok) => { if (!ok) openEmptyTab(); });
  } else {
    openEmptyTab();
  }

  const onWikilink = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      path?: string; target?: string; heading?: string | null; ctrlKey?: boolean;
    };
    void (async () => {
      const next = await resolveTarget(detail);
      if (!next) {
        say(t("nav.wikilinkUnresolved", { name: detail.target ?? "?" }));
        return;
      }
      // PDF (phase 6) : TOUJOURS un nouvel onglet, quel que soit le clic (R4).
      if (extFromPath(next) === "pdf") {
        void loadNewTab(next, null);
        return;
      }
      if (["md", "markdown", "txt", "tex", "typ"].includes(extFromPath(next))) {
        void navigateTo(next, detail.heading ?? null, !!detail.ctrlKey);
        return;
      }
      say(t("browse.unsupportedHere", { name: basename(next) }));
    })();
  };
  const onDocNav = (e: Event) => {
    const detail = (e as CustomEvent).detail as { path?: string; heading?: string; ctrlKey?: boolean };
    if (detail.path) void navigateTo(detail.path, detail.heading ?? null, !!detail.ctrlKey);
  };
  /** Lien PDF avec page/rect (citation précise, cf. MarkdownPreview) — TOUJOURS
   *  un nouvel onglet (R4). La page cible est portée par la PROP `page` de
   *  `LazyPdfViewer` (pas par l'événement `azprose:pdf-scroll-to-rect` : son
   *  listener n'existe qu'APRÈS le montage de `PdfViewer`, piège de timing —
   *  la prop, elle, est lue dès le premier rendu). */
  const onPdfRect = (e: Event) => {
    const detail = (e as CustomEvent).detail as { path?: string; page?: number; rect?: string };
    if (!detail.path) return;
    void loadNewTab(detail.path, null).then((ok) => {
      if (!ok) return;
      const tab = navState.panel.activeTab;
      if (tab && detail.page) {
        navState.pdfPages.set(tab.id, detail.page);
        navState.bumpPanel(); // relit pdfPages au rendu (cf. commentaire de la déclaration)
      }
    });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); void goBack(); }
    if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); void goForward(); }
  };

  window.addEventListener("azprose:wikilink-navigate", onWikilink);
  window.addEventListener("azprose:wikilink-open-new", onWikilink);
  window.addEventListener("azprose:doc-navigate", onDocNav);
  window.addEventListener("azprose:pdf-rect-navigate", onPdfRect);
  window.addEventListener("keydown", onKey);

  // R2/phase 7-8 : cette fenêtre NAV est un SINGLETON par fenêtre de projet —
  // `openOrFocusBrowseWindow` (browse-window.ts) émet CET événement Tauri
  // (pas un CustomEvent DOM : cette fenêtre est un processus séparé) quand
  // l'aide, le compass du breadcrumb ou un autre lanceur NAV cible une
  // fenêtre déjà ouverte : le chemin est monté dans un NOUVEL onglet plutôt
  // que de dupliquer la fenêtre — chemin VIDE (compass, D4/R6) → onglet vide.
  let navOpenCancelled = false;
  let navOpenUnlisten: (() => void) | null = null;
  void listen<string>("azprose:nav-open", (event) => {
    const path = event.payload;
    if (typeof path !== "string") return;
    if (path) void loadNewTab(path);
    else openEmptyTab();
  }).then((un) => {
    if (navOpenCancelled) { un(); return; }
    navOpenUnlisten = un;
  });

  return () => {
    window.removeEventListener("azprose:wikilink-navigate", onWikilink);
    window.removeEventListener("azprose:wikilink-open-new", onWikilink);
    window.removeEventListener("azprose:doc-navigate", onDocNav);
    window.removeEventListener("azprose:pdf-rect-navigate", onPdfRect);
    window.removeEventListener("keydown", onKey);
    navOpenCancelled = true;
    navOpenUnlisten?.();
  };
});
</script>

<div class="browse" class:browse--maximized={isMaximized}>
  <NavTitleBar {isMaximized}>
    <div class="browse__tabs">
      <TabsBar
        {tabs}
        {activeTabId}
        panelId="nav"
        onSelect={selectTab}
        onClose={closeTab}
        onReorder={(from, to) => navState.panel.reorder(from, to)}
      />
    </div>
    <button
      type="button"
      class="browse__newtab"
      title={t("browse.newTab")}
      aria-label={t("browse.newTab")}
      onclick={openEmptyTab}
      data-tauri-drag-region="false"
    >
      <i class="wxi-plus" aria-hidden="true"></i>
    </button>
  </NavTitleBar>

  <!-- Toolbar PERMANENTE (phase B3, remplace le mode « au survol » de la
       phase 4) — pleine largeur, rangée dédiée AU-DESSUS de la sidebar ET du
       contenu (cf. maquette du plan §2), pas nichée dans .browse__body :
       toggle sidebar tout à gauche (props existantes), navigation, champ de
       recherche au milieu (passé en children — état/logique restent ici). -->
  <BrowseToolbar
    sidebarVisible={sidebarVisible.current}
    onToggleSidebar={() => { sidebarVisible.current = !sidebarVisible.current; }}
    {canGoHome}
    onHome={goHome}
    {canGoBack}
    onBack={() => void goBack()}
    {canGoForward}
    onForward={() => void goForward()}
    canOpenInEditor={!!activeTab?.path}
    onOpenInEditor={() => void openInEditor()}
    {presentationAvailable}
    {presentationActive}
    onTogglePresentation={togglePresentation}
    fullscreenActive={isFullscreen}
    onToggleFullscreen={() => void toggleFullscreen()}
  >
    <div class="browse__address-wrap">
      <input
        bind:this={addressEl}
        bind:value={addressValue}
        type="text"
        class="browse__address"
        placeholder={t("browse.emptyHint")}
        aria-label={t("browse.emptyHint")}
        role="combobox"
        aria-expanded={flatSuggestions.length > 0}
        aria-controls="browse-suggestions"
        aria-activedescendant={activeSuggestionIndex >= 0 ? `browse-suggestion-${activeSuggestionIndex}` : undefined}
        oninput={() => void updateSuggestions()}
        onkeydown={onAddressKeydown}
      />
      {#if flatSuggestions.length > 0}
        <ul class="browse__suggestions" id="browse-suggestions" role="listbox">
          {#each flatSuggestions as s, i (s.kind === "vault" ? s.path : `help:${s.path}`)}
            <li id="browse-suggestion-{i}" role="option" aria-selected={i === activeSuggestionIndex}>
              <button
                type="button"
                onclick={() => void chooseFlatSuggestion(s)}
                onmouseenter={() => { activeSuggestionIndex = i; }}
              >{s.kind === "vault" ? s.base : s.title}</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </BrowseToolbar>

  <div class="browse__row">
    <!-- Sidebar TOC (phase 5) — même CSS que la sidebar du projet (R7). -->
    <BrowseSidebar
      visible={sidebarVisible.current}
      rootPath={root}
      toc={currentToc}
      onNavigate={(path, heading, ctrlKey) => void navigateTo(path, heading, ctrlKey)}
    />

    <main class="browse__body">
      {#if !activeTab || !activeTab.path}
        <p class="browse__empty" role="status">{t("browse.emptyHint")}</p>
      {:else if isPdfPath(activeTab.path)}
        <LazyPdfViewer path={activeTab.path} rev={contentRev} page={navState.pdfPages.get(activeTab.id) ?? null} />
      {:else if presentationActive}
        <LazySlideDeck
          value={activeTab.source}
          filePath={activeTab.path}
          fullscreen={isFullscreen}
          onExitFullscreen={() => void toggleFullscreen()}
        />
      {:else if isHelpPath(activeTab.path, root)}
        <LazyDocPreview value={activeTab.source} filePath={activeTab.path} toc={currentToc} />
      {:else}
        <MarkdownPreview value={activeTab.source} filePath={activeTab.path} rev={contentRev} />
      {/if}
    </main>
  </div>
</div>

<!-- position:fixed (toast.css) : l'emplacement dans l'arbre n'a pas
     d'incidence visuelle, monté ici par cohérence avec la fin de gabarit. -->
<Toast
  open={notifications.infoToast != null}
  message={notifications.infoToast ?? ""}
  variant="info"
  onDismiss={notifications.dismissInfoToast}
/>

<style>
/* Fenêtre NAV créée avec `transparent:true` (browse-window.ts, 2026-08-14,
   option 2 — bordure « flottante ») : la fenêtre OS est invisible hors du
   contenu peint. `body`/`html` peignent leur propre fond dans core.css
   (PARTAGÉ par les deux fenêtres, PROJET y compris) — ce `:global()` ne vise
   QUE le document NAV (bundle séparé, nav-main.ts) : `!important` prime sur
   core.css sans dépendre d'un ordre de chargement entre feuilles distinctes,
   qui n'est pas une garantie assez solide à elle seule. Sans ce retrait de
   fond, `body` resterait opaque sous la marge de `.browse` et annulerait
   l'effet de flottement (le bureau ne serait jamais visible à travers). */
:global(html),
:global(body) {
  background: transparent !important;
}

.browse {
  /* Marge ET ombre dérivées de la MÊME variable pour ne plus pouvoir
     diverger (constat visuel 2026-08-14 : la marge d'origine, 12px, était
     plus étroite que la portée réelle de l'ombre — celle-ci se faisait
     couper net par le bord RÉEL de la fenêtre OS, qui reste un rectangle
     carré même transparent. Résultat : un bord droit bien visible là où le
     dégradé de l'ombre s'arrêtait brutalement, trahissant la triche.
     `--nav-float-reach` borne la portée MAXIMALE de la plus grosse couche
     d'ombre ci-dessous (offset 6px + blur 20px = 26px) ; la marge (28px) lui
     laisse 2px de marge de sécurité — le dégradé s'éteint AVANT d'atteindre
     le bord réel, invisible où qu'on regarde. */
  --nav-float-margin: 28px;
  display: flex;
  flex-direction: column;
  height: calc(100vh - (var(--nav-float-margin) * 2));
  margin: var(--nav-float-margin);
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 10px;
  /* `overflow:hidden` : nécessaire pour que les enfants (titlebar, toolbar…)
     respectent les coins arrondis — sans ça leurs fonds carrés dépasseraient
     du rayon. Sans risque de clipper `.browse__suggestions` (position:
     absolute, mais contenue verticalement bien avant le bas de `.browse`) ni
     le Toast (position:fixed — échappe à TOUT overflow d'ancêtre tant que
     celui-ci ne pose ni transform ni filter, ce qui n'est pas le cas ici). */
  overflow: hidden;
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.4),
    0 1px 6px rgba(0, 0, 0, 0.25);
  /* Pas de transition CSS sur la marge/hauteur : le maximize/restore anime
     déjà la fenêtre OS elle-même (durée hors contrôle CSS) — animer la carte
     EN PLUS, sur une durée forcément désynchronisée, ferait plus de mal que
     de bien (à-coup visible entre les deux animations). */
}

/* Fenêtre maximisée : plus de bureau visible autour, la carte flottante n'a
   plus de sens (constat 2026-08-14) — la fenêtre doit se comporter comme
   n'importe quelle fenêtre maximisée : à ras bord, sans marge ni ombre ni
   coins arrondis. Piloté par `isMaximized`, remonté depuis NavTitleBar. */
.browse--maximized {
  --nav-float-margin: 0px;
  border-radius: 0;
  border: none;
  box-shadow: none;
}
.browse__row {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
}
.browse__tabs {
  /* flex:0 (pas flex:1 hérité de l'ex-tabbar, retirée en phase B3 — voir
     historique git pour .browse__tabbar) : dans NavTitleBar, ce bloc doit se
     limiter au contenu réel des onglets (comme sur la maquette du plan,
     "[onglet][onglet][+]" collés à gauche) — sinon .mdv-tabs (racine de
     TabsBar, sans largeur propre) s'étire jusqu'à occuper la moitié de la
     barre au profit de .nav-titlebar__spacer, avec une COULEUR DE FOND
     différente de ce dernier (var(--bg) vs var(--surface)) : une rupture
     visible en plein milieu de la barre. Toujours utilisée (habille le
     wrapper de TabsBar dans NavTitleBar) — PAS orpheline, contrairement à ce
     que la phase B3 du plan anticipait : conservée. */
  flex: 0 1 auto;
  min-width: 0;
}
.browse__address-wrap {
  /* Plus de margin-left (ex-espacement après .browse__tabs dans l'ancienne
     tabbar) : ce bloc est désormais centré par .nt-search (BrowseToolbar,
     phase B3), un margin résiduel l'aurait décalé du centre. */
  position: relative;
  flex: none;
  width: 240px;
}
.browse__address {
  width: 100%;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg);
  color: var(--fg);
  font-size: 12px;
}
.browse__address:focus {
  outline: none;
  border-color: var(--accent);
}
.browse__suggestions {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  z-index: 20;
  margin: 0;
  padding: 4px;
  list-style: none;
  max-height: 260px;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
.browse__suggestions button {
  display: block;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--fg);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.browse__suggestions button:hover {
  background: var(--surface-hover);
}
/* Sélection clavier (↓/↑) — même fond que le survol souris : les deux
   moyens de désigner une ligne doivent se lire de façon identique. */
.browse__suggestions li[aria-selected="true"] button {
  background: var(--surface-hover);
}
.browse__newtab {
  flex: none;
  width: 30px;
  height: 30px;
  margin: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--fg);
  font-size: 14px;
  cursor: pointer;
}
.browse__newtab:hover {
  background: var(--surface-hover);
}
.browse__body {
  /* BrowseToolbar n'est plus un overlay ancré ici depuis la phase B3 (rangée
     permanente, pleine largeur, hors de .browse__body) — position:relative
     conservée par prudence (repli défensif, pas de positionnement absolu
     connu en dépendant parmi MarkdownPreview/LazyPdfViewer/LazySlideDeck/
     LazyDocPreview, mais non vérifié pour chacun). */
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr;
  overflow: hidden;
}
.browse__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}
/* .browse__notice retirée (2026-08-14) : remplacée par un Toast, cf. say()
   et son commentaire — plus de barre fixe consommant de l'espace en
   permanence pour un message transitoire. */
</style>
