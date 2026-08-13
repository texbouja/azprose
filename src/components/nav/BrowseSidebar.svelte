<script lang="ts">
/**
 * Sidebar TOC de la fenêtre NAV (chantier fenêtre NAV, phase 5). Conteneur
 * repliable + largeur ajustable — CSS de la sidebar du projet (R7 : héritage
 * de présentation), et le mécanisme de redimensionnement au pointeur repris
 * de `@/components/sidebar/sidebar-container.svelte`. La largeur est
 * persistée (phase 1.5, R6 : mobilier SYSTÈME de fenêtre, distinct du travail
 * utilisateur que R3 protège — une largeur de sidebar n'est pas un brouillon).
 *
 * Affiche l'ORIGINE de l'arbre (§3 du plan, exigence d'ergonomie) : un arbre
 * qui apparaît sans dire d'où il vient est ce qui a fait échouer le
 * mécanisme précédent (analyse de liens). « Sommaire déclaré » (origin:
 * "declared") vs « Document seul » (origin: "single", repli sans `parent:`).
 */
// Chrome + en-tête (vague 3, phase 3.1) : ce composant N'IMBRIQUE PAS
// sidebar-container.svelte ni fs-view.svelte (gabarit NAV indépendant, plus
// simple) mais rend les mêmes classes — importées ici directement, chacune
// portant son propre contrat CSS plutôt que de compter sur la fenêtre.
import "@/styles/files/sidebar-shell.css";
import "@/styles/files/sidebar-header.css";
import TocPanel from "@/components/links/TocPanel.svelte";
import { getT, language } from "@/lib/i18n";
import type { DeclaredToc } from "@/lib/toc-declared";
import { persistedState } from "@/stores/persisted.svelte";
import { STORAGE_KEYS } from "@/lib/storage";

const MIN_WIDTH = 200;
const DEFAULT_WIDTH = 260;

let {
  visible = true,
  rootPath = null as string | null,
  toc = null as DeclaredToc | null,
  onNavigate,
}: {
  visible?: boolean;
  rootPath?: string | null;
  toc?: DeclaredToc | null;
  /** Pont `azprose:toc-navigate` → navigation NAV (repointe l'onglet actif ou
   *  ouvre un nouvel onglet selon `ctrlKey`, comme les wikilinks — R4). */
  onNavigate?: (path: string, heading: string | null, ctrlKey: boolean) => void;
} = $props();

let t = $derived(getT($language));

const sidebarWidth = persistedState<number>(STORAGE_KEYS.navSidebarWidth, DEFAULT_WIDTH);
let dragging = $state(false);
let startX = 0;
let startWidth = 0;

function onResizePointerDown(e: PointerEvent) {
  dragging = true;
  startX = e.clientX;
  startWidth = sidebarWidth.current;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function onResizePointerMove(e: PointerEvent) {
  if (!dragging) return;
  const delta = e.clientX - startX;
  sidebarWidth.current = Math.max(MIN_WIDTH, startWidth + delta);
}

function stopResize(e: PointerEvent) {
  if (!dragging) return;
  dragging = false;
  try {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  } catch {}
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

$effect(() => {
  const onTocNav = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      path?: string; heading?: string; ctrlKey?: boolean;
    };
    if (detail.path) onNavigate?.(detail.path, detail.heading ?? null, !!detail.ctrlKey);
  };
  window.addEventListener("azprose:toc-navigate", onTocNav);
  return () => window.removeEventListener("azprose:toc-navigate", onTocNav);
});
</script>

<aside class="mdv-sidebar{visible ? ' is-open' : ''}" style="width:{visible ? sidebarWidth.current + 'px' : '0px'}">
  <div class="mdv-sidebar__inner" style="width:{sidebarWidth.current}px">
    <div class="mdv-sidebar__view">
      <div class="mdv-sidebar__header">
        {#if toc?.origin === "declared"}
          <span class="mdv-sidebar__title" title={t("browse.tocOriginDeclared")}>
            <i class="wxi-list" aria-hidden="true"></i>
            {t("browse.tocOriginDeclared")}
          </span>
        {:else if toc?.origin === "single"}
          <span class="mdv-sidebar__title is-empty" title={t("browse.tocOriginSingle")}>
            <i class="wxi-file-text" aria-hidden="true"></i>
            {t("browse.tocOriginSingle")}
          </span>
        {:else}
          <span class="mdv-sidebar__title is-empty">{t("browse.emptyTab")}</span>
        {/if}
      </div>
      <div class="mdv-sidebar__body">
        <TocPanel
          {rootPath}
          filePath={toc?.displayPath ?? null}
          helpActivePath={toc?.displayPath ?? null}
          declaredForest={toc}
        />
      </div>
    </div>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="mdv-sidebar__resize"
    onpointerdown={onResizePointerDown}
    onpointermove={onResizePointerMove}
    onpointerup={stopResize}
    onpointercancel={stopResize}
  ></div>
</aside>

<style>
.mdv-sidebar__title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mdv-sidebar__title .wxi-list,
.mdv-sidebar__title .wxi-file-text {
  flex: none;
  font-size: 12px;
}
</style>
