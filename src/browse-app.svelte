<script lang="ts">
/**
 * Fenêtre fille « browser » (Phase F — D2/R5) : la lecture en chaîne sort des
 * panneaux. Une fenêtre = une pile de navigation (wikilinks + back/forward),
 * le rendu markdown est le MÊME que celui des viewers (MarkdownPreview /
 * DocPreview — aucun pipeline parallèle). L'aide intégrée utilise ce même
 * mécanisme (`?help=1`).
 *
 * La fenêtre ne modifie JAMAIS la session : elle lit des fichiers, point.
 */
import { onMount } from "svelte";
import { getCurrentWindow } from "@tauri-apps/api/window";
import MarkdownPreview from "@/components/markdown/MarkdownPreview.svelte";
import DocPreview from "@/components/markdown/DocPreview.svelte";
import { readText } from "@/lib/files";
import { basename } from "@/lib";
import { extFromPath } from "@/lib/editor-languages";
import { setRootPath } from "@/stores/root-path.svelte";
import { setScrollTarget } from "@/stores/scroll-target.svelte";
import { getFileIndex } from "@/lib/vault-index";
import {
  createNavStack,
  navStackBack,
  navStackCanGoBack,
  navStackCanGoForward,
  navStackForwardStep,
  navStackPush,
  navStackPushForward,
} from "@/lib/nav-stack";
import { getT, language } from "@/lib/i18n";
// Feuilles du RENDU markdown — la fenêtre de navigation monte les MÊMES
// composants de rendu que les viewers, elle doit donc charger les mêmes
// styles. Sans elles, le HTML est bien produit (markdown-it, MathJax) mais
// wikilinks, callouts et marques de transclusion restent NUS : ces règles
// vivent dans `preview.css`, importé par `app.css` — c'est-à-dire par la
// seule fenêtre de projet.
import "@/styles/markdown/prose.css";
import "@/styles/markdown/preview.css";

let t = $derived(getT($language));

const params = new URLSearchParams(location.search);
const root = params.get("root");
const isHelp = params.get("help") === "1";
setRootPath(root);

let path = $state(params.get("browse") ?? "");
let value = $state("");
let rev = $state(0);
let error = $state<string | null>(null);
/** Pile back/forward de CETTE fenêtre (browser-like, jamais persistée). */
const stack = $state(createNavStack());

/** Message TRANSIENT affiché au-dessus du contenu (cible introuvable, format
 *  non lisible ici) : un clic de navigation qui ne produit rien est
 *  indiscernable d'une panne — la fenêtre doit toujours dire ce qu'elle fait. */
let notice = $state<string | null>(null);
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

function say(message: string): void {
  notice = message;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice = null; }, 4000);
}

async function load(next: string, heading?: string | null): Promise<boolean> {
  try {
    value = await readText(next);
    path = next;
    rev++;
    error = null;
    // Ancre du wikilink (`[[note#titre]]`) : le store est consommé par
    // MarkdownPreview APRÈS le rendu — il faut donc la poser avant que le
    // nouveau contenu ne soit rendu, pas après.
    if (heading) setScrollTarget(heading);
    void getCurrentWindow().setTitle(basename(next));
    return true;
  } catch {
    error = t("browse.loadFailed", { name: basename(next) });
    return false;
  }
}

/** Navigation d'un lien : empile la page courante, charge la cible. Un échec
 *  de chargement laisse la pile intacte (rien n'est perdu). Même cible que la
 *  page courante : on ne bouge pas, mais l'ancre est honorée (aller à une
 *  section de la page affichée). */
async function navigateTo(next: string, heading?: string | null): Promise<void> {
  if (!next) return;
  if (next === path) {
    if (heading) setScrollTarget(heading);
    return;
  }
  const previous = path;
  const ok = await load(next, heading);
  if (ok) navStackPush(stack, previous);
}

async function goBack(): Promise<void> {
  const target = navStackBack(stack);
  if (!target) return;
  const current = path;
  const ok = await load(target);
  if (ok) navStackPushForward(stack, current);
  else navStackPush(stack, target);
}

async function goForward(): Promise<void> {
  const target = navStackForwardStep(stack, path);
  if (!target) return;
  if (!(await load(target))) navStackPushForward(stack, target);
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
  void load(path);

  const onWikilink = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      path?: string; target?: string; heading?: string | null;
    };
    void (async () => {
      const next = await resolveTarget(detail);
      if (!next) {
        say(t("nav.wikilinkUnresolved", { name: detail.target ?? "?" }));
        return;
      }
      // Formats lisibles ICI (le PDF aura son propre onglet viewer — chantier
      // fenêtre NAV, phase « formats »).
      if (["md", "markdown", "txt", "tex", "typ"].includes(extFromPath(next))) {
        void navigateTo(next, detail.heading ?? null);
        return;
      }
      say(t("browse.unsupportedHere", { name: basename(next) }));
    })();
  };
  const onDocNav = (e: Event) => {
    const detail = (e as CustomEvent).detail as { path?: string; heading?: string };
    if (detail.path) void navigateTo(detail.path, detail.heading ?? null);
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
  <header class="browse__bar" data-tauri-drag-region>
    <button
      type="button"
      class="browse__nav"
      title={t("preview.back")}
      aria-label={t("preview.back")}
      disabled={!navStackCanGoBack(stack)}
      onclick={() => void goBack()}
    >
      <i class="wxi-arrow-left" aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="browse__nav"
      title={t("preview.forward")}
      aria-label={t("preview.forward")}
      disabled={!navStackCanGoForward(stack)}
      onclick={() => void goForward()}
    >
      <i class="wxi-arrow-right" aria-hidden="true"></i>
    </button>
    <span class="browse__title" title={path}>{basename(path)}</span>
  </header>

  {#if notice}
    <!-- Message TRANSIENT : il informe SANS masquer la page en cours de
         lecture (une cible introuvable ne doit pas coûter la page affichée). -->
    <p class="browse__notice" role="status">{notice}</p>
  {/if}

  <main class="browse__body">
    {#if error}
      <p class="browse__error" role="status">{error}</p>
    {:else if isHelp}
      <DocPreview {value} filePath={path} />
    {:else}
      <MarkdownPreview {value} filePath={path} {rev} />
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
.browse__bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 38px;
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
.browse__title {
  margin-left: 6px;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.browse__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr;
  overflow: hidden;
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
.browse__error {
  padding: 1.5rem;
  color: var(--color-error);
}
</style>
