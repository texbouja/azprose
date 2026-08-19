<script lang="ts">
import { Toolbar } from "@svar-ui/svelte-toolbar";
import { registerToolbarItem } from "@svar-ui/svelte-toolbar";
// Thème SVAR : PLUS importé ici (vague 4, correction de la phase 2.4). Il est
// redevenu global (src/styles/core.css) — c'est un pont de variables, pas un
// contrat de composant. Le pari « ce composant monte en premier, il porte le
// thème pour tous » était faux : la feuille finissait dupliquée dans 6 chunks
// lazy et absente du boot.
import { extFromPath } from "@/lib/editor-languages";
import { isPdfPath, isImagePath } from "@/lib";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import { slideSettings, SLIDE_MODES } from "@/stores/slide-settings.svelte";
import { parseFrontMatter } from "@/lib/front-matter";
import { docTypeSwitches, normalizeDocType } from "@/lib/doc-meta";
import SlideModeRadio from "./SlideModeRadio.svelte";
import type { Tab, RenderMode } from "@/lib/panel-store";
import { pinnedHistory, getPinnedNavActions } from "@/stores/pinned-history.svelte";

// Register SlideModeRadio as a custom toolbar item
registerToolbarItem("slide-mode-radio", SlideModeRadio);

let {
  activeTab = null as Tab | null,
  panelId = "main",
  viewportEl: _viewportEl = null as HTMLElement | null,
  renderMode = "raw" as RenderMode,
  onSetEditorMode,
  onLatexViewer,
  onLatexBuild,
  onExportPdf,
  onToggleRenderMode,
  onToggleColles,
  onToggleFullscreen,
  onCommand,
  /** Format du PINNED slot dont ce tab fait partie (Phase D — D7) : posé pour
   *  l'éditeur épinglé ET pour son viewer compagnon (mêmes actions dans les
   *  deux tabactions), `null` partout ailleurs. Les boutons d'historique de
   *  montage ne concernent QUE les pinned tabs (règle 1.3). */
  pinnedFormat = null as string | null,
}: {
  activeTab?: Tab | null;
  panelId?: string;
  pinnedFormat?: string | null;
  viewportEl?: HTMLElement | null;
  renderMode?: RenderMode;
  onSetEditorMode?: (mode: "raw" | "preview") => void;
  onLatexViewer?: () => void;
  onLatexBuild?: () => void;
  onExportPdf?: () => void;
  onToggleRenderMode?: () => void;
  onToggleColles?: () => void;
  onToggleFullscreen?: () => void;
  onCommand?: (cmd: string) => void;
} = $props();

let visible = $state(false);
let toolbarEl = $state<HTMLElement | null>(null);
let hoverZoneEl = $state<HTMLElement | null>(null);

function show() { visible = true; }
function hide() { visible = false; }

function clickOutside(e: MouseEvent) {
  if (!toolbarEl && !hoverZoneEl) return;
  const target = e.target as Node;
  if (toolbarEl && !toolbarEl.contains(target) && hoverZoneEl && !hoverZoneEl.contains(target)) hide();
}

$effect(() => {
  if (!visible) return;
  const handler = (e: MouseEvent) => clickOutside(e);
  requestAnimationFrame(() => document.addEventListener("click", handler));
  return () => document.removeEventListener("click", handler);
});

let t = $derived(getT($language));

function fire(cmd: string) { onCommand?.(cmd); }

// ── Navigation colles (chevrons) — état rapporté par CollePreview ────────
// `colleStudentsOpen` = état pressé du bouton « Élèves » : la sidebar est
// INTERNE au rendu CollePreview, seul son ouverture/fermeture est reportée
// ici via `studentsOpen` dans le nav-state (bouton pressé = panneau ouvert).
let colleNav = $state({ index: 0, total: 0 });
let colleStudentsOpen = $state(false);

$effect(() => {
  const onState = (e: Event) => {
    const d = (e as CustomEvent).detail as {
      filePath?: string | null;
      index?: number;
      total?: number;
      studentsOpen?: boolean;
    };
    if (
      d.filePath &&
      activeTab &&
      d.filePath === activeTab.path &&
      typeof d.index === "number" &&
      typeof d.total === "number"
    ) {
      colleNav = { index: d.index, total: d.total };
      if (typeof d.studentsOpen === "boolean") colleStudentsOpen = d.studentsOpen;
    }
  };
  window.addEventListener("azprose:colle-nav-state", onState);
  return () => window.removeEventListener("azprose:colle-nav-state", onState);
});

// À l'entrée en mode colle, on re-synchronise l'état auprès de la vue active
// (le CollePreview monté répond au fichier correspondant).
$effect(() => {
  if (isMain || renderMode !== "colle" || !activeTab) return;
  window.dispatchEvent(
    new CustomEvent("azprose:colle-nav-sync", { detail: { filePath: activeTab.path } }),
  );
});

function dispatchColleNav(dir: "prev" | "next") {
  if (!activeTab) return;
  window.dispatchEvent(
    new CustomEvent("azprose:colle-nav", { detail: { filePath: activeTab.path, dir } }),
  );
}

let ext = $derived(extFromPath(activeTab?.path ?? ""));
let isMd = $derived(ext === "md");
let isTex = $derived(ext === "tex");
let isCsv = $derived(ext === "csv" || ext === "tsv");
let isMain = $derived(panelId === "main");
// Mode ALTERNATIF du viewer pour le fichier affiché (généralisation).
// Le viewer GÉNÉRALISTE (« preview ») est le mode d'affichage par défaut
// universel — le seul lancé par le bouton Preview de l'éditeur, et le seul à
// survivre au recyclage d'un tab (panel-store `recycleRenderMode` réarme tout
// mode viewer sur "preview" quand le fichier change). Un fichier peut déclarer
// un mode alternatif, exposé comme BASCULE dans la toolbar de ce tab viewer.
// Les COMMUTATEURS de type (doc-meta, `docTypeSwitches`) décident, sans
// privilège de type : `type: colle` → vue planches (CollePreview, commutateur
// `.isColle`) ; tout autre .md → SlideDeck (« Presentation », mode d'affichage
// du viewer généraliste). Une future vue dédiée lira son propre commutateur
// (ex. `.isBanque` pour une banque d'exercices) — même pattern.
// La bascule ne permute qu'entre preview ↔ mode alternatif : un recyclage
// retombe TOUJOURS sur le mode général (décision utilisateur).
let altMode = $derived.by<"colle" | "presentation" | null>(() => {
  if (!isMd) return null;
  const switches = docTypeSwitches(
    normalizeDocType(parseFrontMatter(activeTab?.source ?? "").values.type),
  );
  return switches.isColle ? "colle" : "presentation";
});

/* ── Toolbar items — reactive on mode + renderMode + slideMode ── */

// Historique de MONTAGE du pinned slot (Phase D — D6/D7) : « remonter » /
// « redescendre » dans les contenus successivement montés dans le slot. Les
// MÊMES boutons apparaissent dans la tabaction de l'éditeur épinglé et dans
// celle de son viewer compagnon (`pinnedFormat` posé des deux côtés). À ne pas
// confondre avec un historique de viewer : celui-ci suit le SLOT.
let pinnedHistItems = $derived.by(() => {
  if (!pinnedFormat) return [] as any[];
  const hist = pinnedHistory(pinnedFormat);
  void hist.revision;
  return [
    { comp: "icon", icon: "wxi-arrow-left", text: t("pinned.back"), pinned: true,
      disabled: !hist.canGoBack,
      handler: () => getPinnedNavActions().goBack(pinnedFormat!) },
    { comp: "icon", icon: "wxi-arrow-right", text: t("pinned.forward"), pinned: true,
      disabled: !hist.canGoForward,
      handler: () => getPinnedNavActions().goForward(pinnedFormat!) },
  ];
});

let mainItems = $derived.by(() => {
  if (isMd) {
    // Navigation preview (back/forward) : réservée à la toolbar SIDE — les
    // boutons de la toolbar main ont été retirés (décision utilisateur :
    // « Je ne vois pas l'utilité d'ajouter des boutons de navigation dans
    // l'éditeur »). L'éditeur suit désormais le preview (tab lié) ; les
    // boutons ⌘[ / ⌘] restent disponibles globalement.
    const items: any[] = [
      ...pinnedHistItems,
      { spacer: true },
      { comp: "button", icon: "wxi-file-down", text: t("tabs.exportPdf"),
        handler: () => onExportPdf?.() },
      { comp: "button", icon: "wxi-eye", text: t("tabs.preview"),
        type: (renderMode === "preview" || renderMode === "presentation") ? "pressed" : "",
        handler: () => onSetEditorMode?.("preview") },
    ];
    return items;
  }
  if (isTex) return [
    ...pinnedHistItems,
    { spacer: true },
    { comp: "button", icon: "wxi-file-down", text: t("tabs.build"),
      handler: () => onLatexBuild?.() },
    { comp: "button", icon: "wxi-file-text", text: t("tabs.viewPdf"),
      handler: () => onLatexViewer?.() },
  ];
  if (isCsv) return [
    ...pinnedHistItems,
    { comp: "button", icon: "wxi-table", text: "Grille",
      type: renderMode === "preview" ? "pressed" : "",
      handler: () => onSetEditorMode?.("preview") },
  ];
  return pinnedHistItems.length ? [...pinnedHistItems, { spacer: true }] : [];
});

let sideItems = $derived.by(() => {
  // Viewer COMPAGNON de la sphère pinned : mêmes boutons d'historique de
  // montage que l'éditeur épinglé (D7) — tout à gauche.
  const items: any[] = [...pinnedHistItems];

  // (chantier fenêtre NAV, phase 8) Le lancement de NAV depuis un viewer
  // spécifique a été retiré au profit du lancement UNIFIÉ (icône compass du
  // breadcrumb, singleton R2) — plus de bouton wxi-maximize-2 ici.

  // Left: navigation colles (bouton « Élèves » + chevrons + compteur) — vue
  // planches active dans le side panel. Le bouton « Élèves » est TOUT À
  // GAUCHE : il ouvre/ferme la sidebar INTERNE au rendu CollePreview
  // (azprose:colle-students-toggle → CollePreview bascule son panneau local ;
  // l'état pressé est resynchronisé via studentsOpen dans le nav-state).
  if (renderMode === "colle") {
    const prevDisabled = colleNav.total <= 0 || colleNav.index <= 0;
    const nextDisabled = colleNav.total <= 0 || colleNav.index >= colleNav.total - 1;
    items.push(
      { comp: "icon", icon: "wxi-user-list", text: t("colle.students"), pinned: true,
        type: colleStudentsOpen ? "pressed" : "",
        handler: () =>
          window.dispatchEvent(new CustomEvent("azprose:colle-students-toggle")) },
      { comp: "icon", icon: "wxi-chevron-left", text: t("colle.prev"), pinned: true,
        disabled: prevDisabled, handler: () => dispatchColleNav("prev") },
      { comp: "icon", icon: "wxi-chevron-right", text: t("colle.next"), pinned: true,
        disabled: nextDisabled, handler: () => dispatchColleNav("next") },
    );
    if (colleNav.total > 0) {
      items.push({
        comp: "label",
        text: `${colleNav.index + 1} / ${colleNav.total}`,
        css: "ta-colle-count",
      });
    }
  }

  // Left: title (PDF/image/HTML)
  if (isPdfPath(activeTab?.path ?? "") || isImagePath(activeTab?.path ?? "") || ext === "html") {
    items.push({
      comp: "label", text: activeTab!.title,
      css: "tab-actions-title",
    });
  }

  items.push({ spacer: true });

  // Center: zoom / radios
  if (isImagePath(activeTab?.path ?? "")) {
    items.push(
      { comp: "icon", icon: "wxi-zoom-out", text: "Zoom out", pinned: true, handler: () => fire("zoom-out") },
      { comp: "icon", icon: "wxi-zoom-in", text: "Zoom in", pinned: true, handler: () => fire("zoom-in") },
    );
  } else if (isMd && renderMode !== "presentation" && renderMode !== "colle") {
    items.push(
      { comp: "icon", icon: "wxi-zoom-out", text: "Zoom out", pinned: true, handler: () => fire("zoom-out") },
      { comp: "icon", icon: "wxi-zoom-reset", text: "Reset zoom", pinned: true, handler: () => fire("zoom-reset") },
      { comp: "icon", icon: "wxi-zoom-in", text: "Zoom in", pinned: true, handler: () => fire("zoom-in") },
    );
  } else if (isMd && renderMode === "presentation") {
    for (const sm of SLIDE_MODES) {
      items.push({
        comp: "slide-mode-radio",
        value: sm.id,
        mode: slideSettings.mode,
        pinned: true,
      });
    }
    items.push(
      { comp: "icon", icon: "wxi-zoom-out", text: "Zoom out", pinned: true, handler: () => fire("zoom-out") },
      { comp: "icon", icon: "wxi-zoom-reset", text: "Reset zoom", pinned: true, handler: () => fire("zoom-reset") },
      { comp: "icon", icon: "wxi-zoom-in", text: "Zoom in", pinned: true, handler: () => fire("zoom-in") },
    );
  } else if (isMd && renderMode === "colle") {
    // Zoom du TEXTE markdown de la vue planches (énoncé + observations) — même
    // canal `azprose:viewer-command` que le preview md ; CollePreview zoome
    // uniquement le contenu rendu, jamais les cartes/métadonnées YAML.
    items.push(
      { comp: "icon", icon: "wxi-zoom-out", text: "Zoom out", pinned: true, handler: () => fire("zoom-out") },
      { comp: "icon", icon: "wxi-zoom-reset", text: "Reset zoom", pinned: true, handler: () => fire("zoom-reset") },
      { comp: "icon", icon: "wxi-zoom-in", text: "Zoom in", pinned: true, handler: () => fire("zoom-in") },
    );
  }

  items.push({ spacer: true });

  // Right: bascule du mode ALTERNATIF du viewer + (vue colle) impression/envoi
  // + fullscreen — dans cet ordre. `pinned: true` = jamais basculés dans le
  // menu « … » de débordement (l'overflow SVAR masque tout ce qui ne tient
  // pas — l'exception native est le pinning).
  // La bascule ne permute que preview ↔ altMode (mode général ←→ mode
  // alternatif du fichier) : le viewer généraliste reste toujours le défaut,
  // le bouton « Preview » de l'éditeur ne lance QUE ce mode (jamais un mode
  // alternatif), et le recyclage d'un tab retombe sur preview (panel-store).
  if (altMode === "colle") {
    // Vue colles du side panel : Print puis Send (ordre demandé par l'utilisateur).
    if (renderMode === "colle") {
      items.push({
        comp: "icon",
        icon: "wxi-printer",
        text: t("colle.print"),
        pinned: true,
        handler: () =>
          activeTab &&
          window.dispatchEvent(
            new CustomEvent("azprose:colle-print", { detail: { filePath: activeTab.path } }),
          ),
      });
      items.push({
        comp: "icon",
        icon: "wxi-send",
        text: t("colle.send"),
        pinned: true,
        handler: () =>
          activeTab &&
          window.dispatchEvent(
            new CustomEvent("azprose:colle-send", { detail: { filePath: activeTab.path } }),
          ),
      });
    }
  }
  if (altMode) {
    const altOn = renderMode === altMode;
    items.push({
      comp: "icon",
      icon: altMode === "colle"
        ? "wxi-chalkboard-teacher"
        : renderMode === "presentation" ? "wxi-slideshow" : "wxi-image",
      text: altMode === "colle" ? t("tabs.colles") : "Presentation",
      pinned: true,
      type: altOn ? "pressed" : "",
      handler: () => (altMode === "colle" ? onToggleColles?.() : onToggleRenderMode?.()),
    });
  }
  // « Ouvrir dans l'éditeur » : le fichier RENDU par ce tab side s'ouvre dans
  // le tab éditeur main (dédup — jamais de doublon). App.svelte dé-maximise
  // le side au besoin (matrice : double-clic viewer / bouton).
  if (!isMain && isMd) {
    items.push({
      comp: "icon",
      icon: "wxi-external",
      text: t("preview.openInEditor"),
      pinned: true,
      handler: () =>
        activeTab &&
        window.dispatchEvent(
          new CustomEvent("azprose:preview-open-editor", {
            detail: { path: activeTab.path },
          }),
        ),
    });
  }
  items.push(
    { comp: "icon", icon: "wxi-fullscreen", text: "Fullscreen", pinned: true, handler: () => onToggleFullscreen?.() },
  );

  return items;
});
</script>

{#if activeTab}
  {#if isMain}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="ta-hover-zone ta-hover-zone--main" bind:this={hoverZoneEl} onmouseenter={show}></div>
    <div class="ta-indicator" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8" cy="4" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="12" r="1.2"/>
      </svg>
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="ta-hover-zone" bind:this={hoverZoneEl} onmouseenter={show}></div>
  {/if}

  {#if visible}
    {#if isMain}
      <div class="ta-wrap ta-wrap--main" bind:this={toolbarEl}>
        <Toolbar items={mainItems} css="ta-toolbar" overflow="wrap" />
      </div>
    {:else}
      <div class="ta-wrap ta-wrap--side" bind:this={toolbarEl}>
        <Toolbar items={sideItems} css="ta-toolbar ta-toolbar--side" />
      </div>
    {/if}
  {/if}
{/if}

<style>
  /* ── Hover zone (transparent, triggers reveal) ────────── */
  .ta-hover-zone {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 40px;
    z-index: 19;
    pointer-events: auto;
  }
  .ta-hover-zone--main {
    left: auto;
    right: 0;
    width: 80px;
  }

  /* ── Three-dot indicator (main panel, pre-reveal) ────── */
  .ta-indicator {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 18;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    color: var(--muted);
    opacity: 0.4;
    pointer-events: none;
    transition: opacity var(--dur-fast, 0.12s) var(--easing, ease);
  }

  /* ── Toolbar container (absolute overlay) ─────────────── */
  .ta-wrap {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 20;
    height: 40px;
    pointer-events: auto;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(6px);
    border-bottom: 1px solid var(--border);
    /* Manque d'espace horizontal → scroll, jamais de retour à la ligne */
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--border) 75%, transparent) transparent;
  }
  /* Scrollbar fine (WebKit/WebKitGTK) */
  .ta-wrap::-webkit-scrollbar {
    height: 6px;
  }
  .ta-wrap::-webkit-scrollbar-track {
    background: transparent;
  }
  .ta-wrap::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--border) 75%, transparent);
    border-radius: 3px;
  }
  .ta-wrap--main {
    display: flex;
    justify-content: flex-end;
    padding: 0 6px;
  }
  .ta-wrap--side {
    display: flex;
    padding: 0;
  }

  /* ── Override SVAR Toolbar internals ──────────────────── */

  /* `overflow="wrap"` garde les items visibles (jamais cachés dans un menu
     « … »), mais le wrap est NEUTRALISÉ : la barre scrolle horizontalement
     (overflow-x: auto sur .ta-wrap) au lieu de passer à la ligne. */
  .ta-wrap :global(.wx-toolbar.wx-wrap) {
    flex-wrap: nowrap;
  }

  /* Les boutons ne rétrécissent jamais — le débordement est géré par le scroll */
  .ta-wrap :global(.wx-toolbar .wx-button) {
    flex-shrink: 0;
  }

  /* Remove default toolbar bg/border — our .ta-wrap provides them */
  .ta-wrap :global(.wx-toolbar) {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    height: 100%;
    min-height: 0;
  }

  /* Reset SVAR Button's <i> sizing/alignment — it assumes 28px buttons.
     Our buttons are smaller (28px icon-only, auto width+12px text for main). */
  .ta-wrap :global(.wx-toolbar .wx-button i) {
    position: static;
    vertical-align: middle;
    height: auto;
    line-height: 1;
    margin-right: 0;
    opacity: 1;
  }
  .ta-wrap :global(.wx-toolbar .wx-button i::before) {
    display: inline-block;
    position: static;
    top: auto;
    transform: none;
  }

  /* Buttons: match our 28px circle-ish style */
  .ta-wrap :global(.wx-toolbar .wx-button) {
    width: 28px;
    height: 28px;
    min-width: 28px;
    padding: 0 !important;
    border-radius: 5px;
    background: transparent;
    color: var(--fg);
    font-size: 14px;
  }
  .ta-wrap :global(.wx-toolbar .wx-button:hover) {
    background: var(--surface-hover);
  }
  .ta-wrap :global(.wx-toolbar .wx-button:focus-visible) {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }
  .ta-wrap :global(.wx-toolbar .wx-button.wx-pressed) {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .ta-wrap :global(.wx-toolbar .wx-button[disabled]) {
    opacity: 0.35;
    cursor: default;
    color: var(--fg-muted);
  }
  .ta-wrap :global(.wx-toolbar .wx-button[disabled]:hover) {
    background: transparent;
  }

  /* ── Main panel: icon+label buttons ──────────────────── */
  .ta-wrap--main :global(.wx-toolbar .wx-button) {
    width: auto;
    min-width: auto;
    padding: 0 8px !important;
    gap: 5px;
    flex-direction: row;
    font-size: 12px;
    font-weight: 500;
    color: var(--fg-muted);
    font-family: var(--font-preview, var(--font-ui, system-ui));
  }
  .ta-wrap--main :global(.wx-toolbar .wx-button i) {
    font-size: 14px;
  }
  .ta-wrap--main :global(.wx-toolbar .wx-button:hover) {
    color: var(--fg);
  }
  .ta-wrap--main :global(.wx-toolbar .wx-button.wx-pressed) {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  /* ── Side panel: icon-only buttons in center/right ────── */
  .ta-wrap--side :global(.wx-toolbar .wx-button) {
    width: 28px;
    height: 28px;
  }

  /* ── Spacers ──────────────────────────────────────────── */
  .ta-wrap :global(.wx-toolbar .wx-spacer) {
    flex: 1;
  }

  /* ── Title label in side panel ────────────────────────── */
  .ta-wrap :global(.tab-actions-title) {
    font-size: 12px;
    color: var(--fg-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
    padding: 0 8px;
    line-height: 40px;
  }

  /* ── Side panel label element ─────────────────────────── */
  .ta-wrap :global(.wx-toolbar .wx-label) {
    font-family: var(--font-preview, var(--font-ui, system-ui));
  }

  /* ── Colle sheet counter (i / n) ───────────────────────── */
  .ta-wrap :global(.ta-colle-count) {
    flex: none;
    margin-left: 2px;
    padding: 0 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    line-height: 40px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
