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
import BrowseToolbar from "@/components/nav/BrowseToolbar.svelte";
import BrowseSidebar from "@/components/nav/BrowseSidebar.svelte";
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
// Fin du piège #1 du plan (vague 3, phase 3.1) : TabsBar, TitleBar/
// ThemeButton, BrowseSidebar (shell + en-tête) et MarkdownPreview/DocPreview
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
 *  `repoint`/`open` laissent l'onglet inchangé sur échec, rien n'est perdu. */
let notice = $state<string | null>(null);
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

function say(message: string): void {
  notice = message;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice = null; }, 4000);
}

/** Compteur de RENDU (indépendant de `navState.panelRev`, qui bouge aussi pour des
 *  raisons sans rapport avec le contenu affiché — fermeture d'un AUTRE onglet,
 *  réordonnancement…) : force `MarkdownPreview`/`DocPreview` à rejouer leur
 *  effet de rendu à chaque navigation aboutie. */
let contentRev = $state(0);

// ── Barre d'adresse (phase 2 — R5) ──────────────────────────────────────
// Zone de RECHERCHE, pas un affichage de l'emplacement courant (D9/C : « au
// plus one onglet vide, focus dans la barre d'adresse ») : elle se vide après
// chaque navigation aboutie, comme une omnibox de « nouvel onglet ».
let addressValue = $state("");
let addressEl: HTMLInputElement | undefined = $state();
let vaultSuggestions = $state<{ base: string; path: string }[]>([]);
let helpSuggestions = $state<{ path: string; title: string }[]>([]);

// D4 (round 1) : l'onglet vide donne le focus à la barre d'adresse — dès
// qu'il devient actif (ouverture, sélection), pas seulement à sa création.
$effect(() => {
  if (activeTab && !activeTab.path) addressEl?.focus();
});

async function updateSuggestions(): Promise<void> {
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
  vaultSuggestions = filterIndexEntries(index, query).map((base) => ({ base, path: index.get(base)! }));
}

function clearAddress(): void {
  addressValue = "";
  vaultSuggestions = [];
  helpSuggestions = [];
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

function onAddressKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter") {
    e.preventDefault();
    void submitAddress();
  } else if (e.key === "Escape") {
    vaultSuggestions = [];
    helpSuggestions = [];
  }
}

// ── Toolbar au survol (phase 4) ─────────────────────────────────────────

/** Sidebar repliable — repli persisté (phase 1.5, R6 : mobilier SYSTÈME de
 *  fenêtre, clé DISTINCTE de celle de PROJET). */
const sidebarVisible = persistedState<boolean>(STORAGE_KEYS.navSidebarOpen, true);

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

function setWindowTitle(): void {
  const tab = navState.panel.activeTab;
  void getCurrentWindow().setTitle(windowTitle(tab && tab.path ? basename(tab.path) : t("browse.emptyTab")));
}

/** Onglet VIDE (R6, D4) — état de première classe, pas de page d'accueil.
 *  `PanelState.open` exige un chemin RÉEL (`isOpenablePath`) : un onglet vide
 *  n'a pas de contenu à charger, il est donc créé directement (mutation
 *  publique de `tabs`/`activeTabId`, hors des méthodes de `PanelState`). */
function openEmptyTab(): void {
  const id = crypto.randomUUID();
  navState.panel.tabs = [...navState.panel.tabs, { id, title: t("browse.emptyTab"), path: "", source: "", savedContent: "" }];
  navState.panel.activeTabId = id;
  navState.bumpPanel();
  setWindowTitle();
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
  setWindowTitle();
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
  setWindowTitle();
  return true;
}

/** Navigation d'un lien (R4) : `newTab` = ctrl/cmd+clic. Cible déjà affichée
 *  dans l'onglet actif → on ne bouge pas, mais l'ancre est honorée (aller à
 *  une section de la page affichée). */
async function navigateTo(path: string, heading: string | null, newTab: boolean): Promise<void> {
  if (!path) return;
  const current = activeTab;
  if (!newTab && current && current.path && normPath(current.path) === normPath(path)) {
    if (heading) setScrollTarget(heading);
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
  setWindowTitle();
}

function closeTab(id: string): void {
  navState.panel.close(id);
  // Jamais zéro onglet (R6) : fermer le dernier onglet rouvre un onglet vide,
  // l'équivalent NAV d'une page « nouvel onglet ».
  if (navState.panel.tabs.length === 0) openEmptyTab();
  else setWindowTitle();
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

<div class="browse">
  <div class="browse__tabbar">
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
    <div class="browse__address-wrap">
      <input
        bind:this={addressEl}
        bind:value={addressValue}
        type="text"
        class="browse__address"
        placeholder={t("browse.emptyHint")}
        aria-label={t("browse.emptyHint")}
        oninput={() => void updateSuggestions()}
        onkeydown={onAddressKeydown}
      />
      {#if vaultSuggestions.length > 0 || helpSuggestions.length > 0}
        <ul class="browse__suggestions" role="listbox">
          {#each vaultSuggestions as s (s.path)}
            <li role="option" aria-selected="false">
              <button type="button" onclick={() => void chooseSuggestion(s.path)}>{s.base}</button>
            </li>
          {/each}
          {#each helpSuggestions as a (a.path)}
            <li role="option" aria-selected="false">
              <button type="button" onclick={() => void chooseSuggestion(helpFilePath(root ?? "", a.path))}>{a.title}</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <button
      type="button"
      class="browse__newtab"
      title={t("browse.newTab")}
      aria-label={t("browse.newTab")}
      onclick={openEmptyTab}
    >
      <i class="wxi-plus" aria-hidden="true"></i>
    </button>
  </div>

  {#if notice}
    <!-- Message TRANSIENT : il informe SANS masquer la page en cours de
         lecture (une cible introuvable ne doit pas coûter la page affichée). -->
    <p class="browse__notice" role="status">{notice}</p>
  {/if}

  <div class="browse__row">
    <!-- Sidebar TOC (phase 5) — même CSS que la sidebar du projet (R7). -->
    <BrowseSidebar
      visible={sidebarVisible.current}
      rootPath={root}
      toc={currentToc}
      onNavigate={(path, heading, ctrlKey) => void navigateTo(path, heading, ctrlKey)}
    />

    <main class="browse__body">
      <!-- Toolbar au SURVOL (phase 4) : remplace la barre back/forward fixe de
           la phase 1 — même châssis que TabActions (zone de survol + reveal). -->
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
      />
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

<style>
.browse {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
  color: var(--fg);
}
.browse__row {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
}
.browse__tabbar {
  flex: none;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.browse__tabs {
  flex: 1;
  min-width: 0;
}
.browse__address-wrap {
  position: relative;
  flex: none;
  width: 240px;
  margin-left: 6px;
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
  position: relative; /* ancre l'overlay de BrowseToolbar (survol, phase 4) */
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
.browse__notice {
  flex: none;
  margin: 0;
  padding: 0.4rem 0.75rem;
  font-size: 13px;
  color: var(--color-error);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
</style>
