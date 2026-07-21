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
  onJumpToLine,
  buildRev = 0,
  flex = "1",
  onSetEditorMode,
  onSyncToMain,
  onLatexViewer,
  onLatexBuild,
  onTypstViewer,
  onTypstBuild,
  onTypstViewPdf,
  onExportPdf,
  onToggleRenderMode,
  onToggleFullscreen: _onToggleFullscreen,
  viewerFullscreenOn = false,
  onViewerFullscreen,
  onTabDoubleClick,
}: {
  panel: PanelState;
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
  onJumpToLine?: (line: number) => void;
  buildRev?: number;
  flex?: string;
  onSetEditorMode?: (mode: "raw" | "prose" | "preview") => void;
  onSyncToMain?: (source: string) => void;
  onLatexViewer?: () => void;
  onLatexBuild?: () => void;
  onTypstViewer?: () => void;
  onTypstBuild?: () => void;
  onTypstViewPdf?: () => void;
  onExportPdf?: () => void;
  onToggleRenderMode?: () => void;
  onToggleFullscreen?: () => void;
  viewerFullscreenOn?: boolean;
  onViewerFullscreen?: () => void;
  onTabDoubleClick?: (id: string) => void;
} = $props();

import { extFromPath } from "@/lib/editor-languages";

let activeTab = $derived(tabs.find(t => t.id === activeTabId) ?? null);
let isCsvPreview = $derived(
  panel.id === "side" && activeTab != null && (extFromPath(activeTab.path) === "csv" || extFromPath(activeTab.path) === "tsv"),
);
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
        onSelect={(id) => panel.select(id)}
        onClose={(id) => panel.close(id)}
        onReorder={(from, to) => panel.reorder(from, to)}
        {onTabDoubleClick}
      />
    </div>
  {/if}
  <div class="panel-viewport" bind:this={viewportEl} style="position:relative;flex:1;min-height:0;display:grid;grid-template-rows:1fr">
    {#if !isCsvPreview}
    <TabActions
      {activeTab}
      panelId={panel.id}
      {viewportEl}
      renderMode={activeTab?.renderMode ?? "raw"}
      {onSetEditorMode}
      {onLatexViewer}
      {onLatexBuild}
      {onTypstViewer}
      {onTypstBuild}
      {onTypstViewPdf}
      {onExportPdf}
      {onToggleRenderMode}
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
          {onSyncToMain}
          {forwardToPage}
          {onInverseSync}
          {onJumpToLine}
          {buildRev}
          onToggleFullscreen={handleViewerFullscreen}
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
