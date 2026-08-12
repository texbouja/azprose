<script lang="ts">
import type { PanelState, Tab } from "@/lib/panel-store";
import TabsBar from "@/components/editor/TabsBar.svelte";
import ContentRenderer from "./ContentRenderer.svelte";
import TabActions from "./TabActions.svelte";
import type { TypographySettings } from "@/lib/typography";

let {
  panel,
  tabs = [] as Tab[],
  activeTabId = null as string | null,
  onSourceChange,
  onGutterClick,
  typo,
  jumpToLine = null as number | null,
  jumpToCol = null as number | null,
  onJumpApplied,
  vimOn = false,
  prosemarkOn = false,
  forwardToPage = null as number | null,
  onInverseSync,
  buildRev = 0,
  flex = "1",
  onSetEditorMode,
  onLatexViewer,
  onLatexBuild,
  onExportPdf,
  onToggleRenderMode,
  onToggleColles,
  onToggleFullscreen: _onToggleFullscreen,
  viewerFullscreenOn = false,
  onViewerFullscreen,
  onTabDoubleClick,
  /** Fermeture d'un tab avec règles couplées (Phase C — R4 : fermer le pinned
   *  éditeur ferme son viewer pinned). Fourni par le MAIN panel ; le side
   *  garde `panel.close` simple (fermer un viewer ne ferme jamais l'éditeur). */
  onCloseTab,
  latexBuildFailed = false,
  /** Épinglage d'un tab MAIN avec règles d'adoption (Phase C — R1) : fourni
   *  par le panel main → `PanelManager.setMainPinned` (les viewers side pinned
   *  reflètent les éditeurs épinglés) ; le side n'a pas de pin. Fallback :
   *  `panel.setPinned` simple. */
  onTogglePin,
  /** Format du PINNED slot dont le tab actif de CE panel fait partie (Phase D)
   *  — calculé par PanelLayout (seul à voir les deux panels). */
  pinnedFormat = null as string | null,
}: {
  panel: PanelState;
  pinnedFormat?: string | null;
  tabs?: Tab[];
  activeTabId?: string | null;
  onSourceChange?: (source: string) => void;
  onGutterClick?: (line: number) => void;
  typo?: TypographySettings;
  jumpToLine?: number | null;
  jumpToCol?: number | null;
  onJumpApplied?: () => void;
  vimOn?: boolean;
  prosemarkOn?: boolean;
  forwardToPage?: number | null;
  onInverseSync?: (file: string, line: number, col?: number) => void;
  buildRev?: number;
  flex?: string;
  onSetEditorMode?: (mode: "raw" | "prose" | "preview") => void;
  onLatexViewer?: () => void;
  onLatexBuild?: () => void;
  onExportPdf?: () => void;
  onToggleRenderMode?: () => void;
  onToggleColles?: () => void;
  onToggleFullscreen?: () => void;
  viewerFullscreenOn?: boolean;
  onViewerFullscreen?: () => void;
  onTabDoubleClick?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  latexBuildFailed?: boolean;
  onTogglePin?: (id: string, pinned: boolean) => void;
} = $props();

import { extFromPath } from "@/lib/editor-languages";

let activeTab = $derived(tabs.find(t => t.id === activeTabId) ?? null);
let isCsvPreview = $derived(
  panel.id === "side" && activeTab != null && (extFromPath(activeTab.path) === "csv" || extFromPath(activeTab.path) === "tsv"),
);
let isCustomTab = $derived(activeTab?.kind === "custom");
let isSpreadsheetTab = $derived(activeTab?.kind === "spreadsheet");
let isDataFilterTab = $derived(activeTab?.kind === "datafilter");
let viewportEl = $state<HTMLElement | null>(null);

function handleViewerCommand(cmd: string) {
  window.dispatchEvent(new CustomEvent("azprose:viewer-command", { detail: { cmd, panelId: panel.id } }));
}

function handleViewerFullscreen() {
  onViewerFullscreen?.();
}

</script>

<div
  class="mdv-split__pane"
  class:is-viewer-fullscreen={viewerFullscreenOn}
  style="flex:{flex};min-width:0"
>
  {#if tabs.length > 0 && !viewerFullscreenOn}
    <div style="flex:none">
      <TabsBar
        {tabs}
        {activeTabId}
        panelId={panel.id}
        onSelect={(id) => panel.select(id)}
        onClose={(id) => (onCloseTab ? onCloseTab(id) : panel.close(id))}
        onReorder={(from, to) => panel.reorder(from, to)}
        {onTabDoubleClick}
        onTogglePin={(id) => {
          const tab = tabs.find(t => t.id === id);
          if (tab) (onTogglePin ? onTogglePin(id, tab.space !== "pinned") : panel.setPinned(id, tab.space !== "pinned"));
        }}
      />
    </div>
  {/if}
  <div class="panel-viewport" bind:this={viewportEl} style="position:relative;flex:1;min-height:0;display:grid;grid-template-rows:1fr">
    {#if !isCsvPreview && !isCustomTab && !isSpreadsheetTab && !isDataFilterTab}
    <TabActions
      {activeTab}
      panelId={panel.id}
      {viewportEl}
      renderMode={activeTab?.renderMode ?? "raw"}
      {onSetEditorMode}
      {onLatexViewer}
      {onLatexBuild}
      {onExportPdf}
      {onToggleRenderMode}
      {onToggleColles}
      {pinnedFormat}
      onToggleFullscreen={handleViewerFullscreen}
      onCommand={handleViewerCommand}
    />
    {/if}
    {#each tabs as tab (tab.id)}
      <div style={tab.id === activeTabId ? 'display:grid;grid-template-rows:1fr;min-height:0' : 'display:none'}>
        <ContentRenderer
          {tab}
          panelId={panel.id}
          {onSourceChange}
          {onGutterClick}
          {typo}
          jumpToLine={tab.id === activeTabId ? jumpToLine : null}
          jumpToCol={tab.id === activeTabId ? jumpToCol : null}
          {onJumpApplied}
          {vimOn}
          {prosemarkOn}
          {forwardToPage}
          {onInverseSync}
          {buildRev}
          onToggleFullscreen={handleViewerFullscreen}
          viewerFullscreenOn={viewerFullscreenOn}
          {latexBuildFailed}
        />
      </div>
    {/each}
  </div>
</div>

<style>
.is-viewer-fullscreen {
  position: fixed !important;
  inset: 0 !important;
  z-index: 1000;
  background: var(--bg);
  flex: none !important;
}
</style>
