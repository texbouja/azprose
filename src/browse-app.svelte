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
import MarkdownPreview from "@/components/markdown/MarkdownPreview.svelte";
import DocPreview from "@/components/markdown/DocPreview.svelte";
import TabsBar from "@/components/editor/TabsBar.svelte";
import { basename } from "@/lib";
import { extFromPath } from "@/lib/editor-languages";
import { setRootPath } from "@/stores/root-path.svelte";
import { setScrollTarget } from "@/stores/scroll-target.svelte";
import { getFileIndex } from "@/lib/vault-index";
import { PanelState, normPath } from "@/lib/panel-store";
import {
  createNavStack,
  navStackBack,
  navStackCanGoBack,
  navStackCanGoForward,
  navStackForwardStep,
  navStackPush,
  navStackPushForward,
  type NavStack,
} from "@/lib/nav-stack";
import { getT, language } from "@/lib/i18n";
// Feuilles du RENDU markdown ET du modèle d'onglets — la fenêtre de
// navigation emprunte MarkdownPreview/DocPreview/TabsBar à la fenêtre de
// projet, elle doit donc charger les mêmes styles qu'eux. Sans elles, le HTML
// est bien produit mais wikilinks, callouts, transclusion et onglets restent
// NUS : ces règles vivent dans preview.css/prose.css/tabs.css, importés par
// app.css — c'est-à-dire par la seule fenêtre de projet (piège #1 du plan).
import "@/styles/markdown/prose.css";
import "@/styles/markdown/preview.css";
import "@/styles/editor/tabs.css";

let t = $derived(getT($language));

const params = new URLSearchParams(location.search);
const root = params.get("root");
const isHelp = params.get("help") === "1";
setRootPath(root);

/**
 * Version RUNTIME du panel — bump à chaque mutation (`PanelState.notify`, via
 * le callback `onSessionChange`). Convention du reste de l'app (cf.
 * `_panelVersion` de app.svelte) : `PanelState.tabs` n'est pas un `$state`,
 * cette révision est le pont vers la réactivité Svelte. Aucun callback
 * `onFileOpen`/`onError` : NAV ne touche jamais à la session ni aux
 * notifications de la fenêtre de projet (R1/R3).
 */
let panelRev = $state(0);
const panel = new PanelState("nav", {
  onSessionChange: () => { panelRev++; },
  // Case 3 (matrice, cf. panel-store.ts) : la pile back/forward de l'onglet
  // meurt avec lui.
  onTabClosed: (tabId) => { navStacks.delete(tabId); },
});

let tabs = $derived.by(() => { panelRev; return panel.tabs; });
let activeTabId = $derived.by(() => { panelRev; return panel.activeTabId; });
let activeTab = $derived.by(() => tabs.find(tb => tb.id === activeTabId) ?? null);

/**
 * Pile back/forward PAR ONGLET — closure PURE hors runes (une `Map` mutée en
 * place n'a pas à être `$state` : `stackRev` est le pont de réactivité, comme
 * `panelRev` pour le panel). Un onglet fermé purge sa pile (`onTabClosed`
 * ci-dessus).
 */
const navStacks = new Map<string, NavStack>();
let stackRev = $state(0);

function stackFor(tabId: string): NavStack {
  let s = navStacks.get(tabId);
  if (!s) {
    s = createNavStack();
    navStacks.set(tabId, s);
  }
  return s;
}

let canGoBack = $derived.by(() => {
  stackRev;
  const id = activeTabId;
  return id ? navStackCanGoBack(navStacks.get(id) ?? createNavStack()) : false;
});
let canGoForward = $derived.by(() => {
  stackRev;
  const id = activeTabId;
  return id ? navStackCanGoForward(navStacks.get(id) ?? createNavStack()) : false;
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

/** Compteur de RENDU (indépendant de `panelRev`, qui bouge aussi pour des
 *  raisons sans rapport avec le contenu affiché — fermeture d'un AUTRE onglet,
 *  réordonnancement…) : force `MarkdownPreview`/`DocPreview` à rejouer leur
 *  effet de rendu à chaque navigation aboutie. */
let contentRev = $state(0);

function setWindowTitle(): void {
  const tab = panel.activeTab;
  void getCurrentWindow().setTitle(tab && tab.path ? basename(tab.path) : t("browse.emptyTab"));
}

/** Onglet VIDE (R6, D4) — état de première classe, pas de page d'accueil.
 *  `PanelState.open` exige un chemin RÉEL (`isOpenablePath`) : un onglet vide
 *  n'a pas de contenu à charger, il est donc créé directement (mutation
 *  publique de `tabs`/`activeTabId`, hors des méthodes de `PanelState`). */
function openEmptyTab(): void {
  const id = crypto.randomUUID();
  panel.tabs = [...panel.tabs, { id, title: t("browse.emptyTab"), path: "", source: "", savedContent: "" }];
  panel.activeTabId = id;
  panelRev++;
  setWindowTitle();
}

/** Charge `path` DANS l'onglet `tabId` (navigation « sur place », R4). Sur
 *  échec l'onglet reste INCHANGÉ (contrat de `PanelState.repoint`) — rien
 *  n'est perdu, on se contente de le dire. */
async function loadInPlace(tabId: string, path: string, heading?: string | null): Promise<boolean> {
  const { ok } = await panel.repoint(tabId, path, { silent: true });
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
  const before = panel.tabs.length;
  try {
    await panel.open(path, { silent: true });
  } catch {
    say(t("browse.loadFailed", { name: basename(path) }));
    return false;
  }
  // `silent: true` avale les échecs (format non ouvrable, lecture impossible)
  // sans lever — un onglet manquant après l'appel EST l'échec.
  if (panel.tabs.length === before && !panel.tabs.some(tb => normPath(tb.path) === normPath(path))) {
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
    navStackPush(stackFor(tabId), previousPath);
    stackRev++;
  }
}

async function goBack(): Promise<void> {
  const tab = activeTab;
  if (!tab) return;
  const stack = stackFor(tab.id);
  const target = navStackBack(stack);
  if (!target) return;
  const current = tab.path;
  const ok = await loadInPlace(tab.id, target);
  if (ok) navStackPushForward(stack, current);
  else navStackPush(stack, target);
  stackRev++;
}

async function goForward(): Promise<void> {
  const tab = activeTab;
  if (!tab) return;
  const stack = stackFor(tab.id);
  const target = navStackForwardStep(stack, tab.path);
  if (!target) return;
  if (!(await loadInPlace(tab.id, target))) navStackPushForward(stack, target);
  stackRev++;
}

function selectTab(id: string): void {
  // `wake: false` : les onglets NAV ne sont jamais dormants (aucun restore de
  // session) — `select` par défaut appellerait `wake()` pour rien à chaque clic.
  panel.select(id, { wake: false });
  setWindowTitle();
}

function closeTab(id: string): void {
  panel.close(id);
  // Jamais zéro onglet (R6) : fermer le dernier onglet rouvre un onglet vide,
  // l'équivalent NAV d'une page « nouvel onglet ».
  if (panel.tabs.length === 0) openEmptyTab();
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
  // Le boot screen (index.html) est retiré par app.svelte dans la fenêtre de
  // projet ; cette fenêtre-ci a son propre montage.
  document.getElementById("boot")?.remove();

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
      // Formats lisibles ICI (le PDF aura son propre onglet viewer — chantier
      // fenêtre NAV, phase 6).
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
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); void goBack(); }
    if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); void goForward(); }
  };

  window.addEventListener("azprose:wikilink-navigate", onWikilink);
  window.addEventListener("azprose:wikilink-open-new", onWikilink);
  window.addEventListener("azprose:doc-navigate", onDocNav);
  window.addEventListener("keydown", onKey);
  return () => {
    window.removeEventListener("azprose:wikilink-navigate", onWikilink);
    window.removeEventListener("azprose:wikilink-open-new", onWikilink);
    window.removeEventListener("azprose:doc-navigate", onDocNav);
    window.removeEventListener("keydown", onKey);
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
        onReorder={(from, to) => panel.reorder(from, to)}
      />
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

  <header class="browse__bar" data-tauri-drag-region>
    <button
      type="button"
      class="browse__nav"
      title={t("preview.back")}
      aria-label={t("preview.back")}
      disabled={!canGoBack}
      onclick={() => void goBack()}
    >
      <i class="wxi-arrow-left" aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="browse__nav"
      title={t("preview.forward")}
      aria-label={t("preview.forward")}
      disabled={!canGoForward}
      onclick={() => void goForward()}
    >
      <i class="wxi-arrow-right" aria-hidden="true"></i>
    </button>
  </header>

  {#if notice}
    <!-- Message TRANSIENT : il informe SANS masquer la page en cours de
         lecture (une cible introuvable ne doit pas coûter la page affichée). -->
    <p class="browse__notice" role="status">{notice}</p>
  {/if}

  <main class="browse__body">
    {#if !activeTab || !activeTab.path}
      <p class="browse__empty" role="status">{t("browse.emptyHint")}</p>
    {:else if isHelp}
      <DocPreview value={activeTab.source} filePath={activeTab.path} />
    {:else}
      <MarkdownPreview value={activeTab.source} filePath={activeTab.path} rev={contentRev} />
    {/if}
  </main>
</div>

<style>
.browse {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
  color: var(--fg);
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
.browse__bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.browse__nav {
  width: 28px;
  height: 28px;
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
.browse__nav:hover:not([disabled]) {
  background: var(--surface-hover);
}
.browse__nav[disabled] {
  opacity: 0.35;
  cursor: default;
}
.browse__body {
  flex: 1;
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
