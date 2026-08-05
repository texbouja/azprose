<script lang="ts">
import { Toolbar } from "@svar-ui/svelte-toolbar";
import { registerToolbarItem } from "@svar-ui/svelte-toolbar";
import { extFromPath } from "@/lib/editor-languages";
import { isPdfPath, isImagePath } from "@/lib";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import { slideSettings, SLIDE_MODES } from "@/stores/slide-settings.svelte";
import { journalSettings } from "@/stores/journal-settings.svelte";
import { isDailyNotePath } from "@/stores/journal-store.svelte";
import SlideModeRadio from "./SlideModeRadio.svelte";
import type { Tab, RenderMode } from "@/lib/panel-store";
import { navHistory, getNavActions } from "@/stores/nav-history.svelte";

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
}: {
  activeTab?: Tab | null;
  panelId?: string;
  viewportEl?: HTMLElement | null;
  renderMode?: RenderMode;
  onSetEditorMode?: (mode: "raw" | "prose" | "preview") => void;
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
let colleNav = $state({ index: 0, total: 0 });

$effect(() => {
  const onState = (e: Event) => {
    const d = (e as CustomEvent).detail as {
      filePath?: string | null;
      index?: number;
      total?: number;
    };
    if (
      d.filePath &&
      activeTab &&
      d.filePath === activeTab.path &&
      typeof d.index === "number" &&
      typeof d.total === "number"
    ) {
      colleNav = { index: d.index, total: d.total };
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
let isDaily = $derived(
  isMd && isDailyNotePath(activeTab?.path ?? "", journalSettings.current.journalFolder),
);

/* ── Toolbar items — reactive on mode + renderMode + slideMode ── */

let mainItems = $derived.by(() => {
  if (isMd) {
    const items: any[] = [
      { spacer: true },
      { comp: "button", icon: "wxi-code", text: t("tabs.raw"),
        type: renderMode === "raw" ? "pressed" : "",
        handler: () => onSetEditorMode?.("raw") },
      { comp: "button", icon: "wxi-edit", text: t("tabs.prose"),
        type: renderMode === "prose" ? "pressed" : "",
        handler: () => onSetEditorMode?.("prose") },
      { comp: "separator" },
      { comp: "button", icon: "wxi-file-down", text: t("tabs.exportPdf"),
        handler: () => onExportPdf?.() },
      { comp: "separator" },
      { comp: "button", icon: "wxi-eye", text: t("tabs.preview"),
        type: (renderMode === "preview" || renderMode === "presentation") ? "pressed" : "",
        handler: () => onSetEditorMode?.("preview") },
    ];
    return items;
  }
  if (isTex) return [
    { spacer: true },
    { comp: "button", icon: "wxi-file-down", text: t("tabs.build"),
      handler: () => onLatexBuild?.() },
    { comp: "separator" },
    { comp: "button", icon: "wxi-file-text", text: t("tabs.viewPdf"),
      handler: () => onLatexViewer?.() },
  ];
  if (isCsv) return [
    { comp: "button", icon: "wxi-table", text: "Grille",
      type: renderMode === "preview" ? "pressed" : "",
      handler: () => onSetEditorMode?.("preview") },
  ];
  return [];
});

let sideItems = $derived.by(() => {
  const items: any[] = [];

  // Left: preview navigation — back / forward (wikilink history) + home
  // (rootPath/index.md), shown for the .md PREVIEW tab (the side tab whose
  // rendered file it displays; the tab↔file association survives navigation).
  // The side tab renders the preview by default (renderMode undefined/"raw"),
  // so only the colle/presentation modes exclude these buttons.
  if (!isMain && isMd && renderMode !== "colle" && renderMode !== "presentation") {
    const hist = navHistory();
    items.push(
      { comp: "icon", icon: "wxi-arrow-left", text: t("preview.back"), pinned: true,
        disabled: !hist.canGoBack, handler: () => getNavActions().goBack() },
      { comp: "icon", icon: "wxi-arrow-right", text: t("preview.forward"), pinned: true,
        disabled: !hist.canGoForward, handler: () => getNavActions().goForward() },
      { comp: "icon", icon: "wxi-home", text: t("preview.home"), pinned: true,
        handler: () => window.dispatchEvent(new CustomEvent("azprose:preview-home")) },
    );
    items.push({ comp: "separator" });
  }

  // Left: navigation colles (chevrons) — vue planches active dans le side panel
  if (renderMode === "colle") {
    const prevDisabled = colleNav.total <= 0 || colleNav.index <= 0;
    const nextDisabled = colleNav.total <= 0 || colleNav.index >= colleNav.total - 1;
    items.push(
      { comp: "icon", icon: "wxi-chevron-left", text: t("colle.prev"), pinned: true,
        disabled: prevDisabled, handler: () => dispatchColleNav("prev") },
      { comp: "icon", icon: "wxi-chevron-right", text: t("colle.next"), pinned: true,
        disabled: nextDisabled, handler: () => dispatchColleNav("next") },
    );
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
      { comp: "separator" },
      { comp: "icon", icon: "wxi-zoom-out", text: "Zoom out", pinned: true, handler: () => fire("zoom-out") },
      { comp: "icon", icon: "wxi-zoom-reset", text: "Reset zoom", pinned: true, handler: () => fire("zoom-reset") },
      { comp: "icon", icon: "wxi-zoom-in", text: "Zoom in", pinned: true, handler: () => fire("zoom-in") },
    );
  }

  items.push({ spacer: true });

  // Right: impression + envoi (vue colles, daily notes), bascule « Colles »
  // (daily notes), presentation (non-daily md) + fullscreen — dans cet ordre.
  // `pinned: true` = jamais basculés dans le menu « … » de débordement (l'overflow
  // SVAR masque tout ce qui ne tient pas — l'exception native est le pinning).
  if (isDaily) {
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
    items.push({
      comp: "icon",
      icon: "wxi-star",
      text: t("tabs.colles"),
      pinned: true,
      type: renderMode === "colle" ? "pressed" : "",
      handler: () => onToggleColles?.(),
    });
  }
  if (isMd && !isDaily) {
    items.push({
      comp: "icon",
      icon: renderMode === "presentation" ? "wxi-slideshow" : "wxi-image",
      text: "Presentation",
      pinned: true,
      type: renderMode === "presentation" ? "pressed" : "",
      handler: () => onToggleRenderMode?.(),
    });
    items.push({ comp: "separator" });
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

  /* ── Separators ───────────────────────────────────────── */
  .ta-wrap :global(.wx-toolbar .wx-separator) {
    background: var(--border);
    width: 1px;
    height: 20px;
    margin: 0 4px;
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
</style>
