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
  onTypstViewer,
  onTypstBuild,
  onTypstViewPdf,
  onToggleRenderMode,
  onToggleFullscreen,
  viewerFullscreenOn = false,
  onViewerFullscreen,
  typstForwardTarget = null as { page: number; x: number; y: number } | null,
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
  buildRev?: number;
  flex?: string;
  onSetEditorMode?: (mode: "raw" | "prose" | "preview" | "presentation") => void;
  onLatexViewer?: () => void;
  onLatexBuild?: () => void;
  onTypstViewer?: () => void;
  onTypstBuild?: () => void;
  onTypstViewPdf?: () => void;
  onToggleRenderMode?: () => void;
  onToggleFullscreen?: () => void;
  viewerFullscreenOn?: boolean;
  onViewerFullscreen?: () => void;
  typstForwardTarget?: { page: number; x: number; y: number } | null;
} = $props();

let activeTab = $derived(tabs.find(t => t.id === activeTabId) ?? null);
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
      />
    </div>
  {/if}
  <div class="panel-viewport" bind:this={viewportEl} style="position:relative;flex:1;min-height:0;display:grid;grid-template-rows:1fr">
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
      {onToggleRenderMode}
      onToggleFullscreen={handleViewerFullscreen}
      onCommand={handleViewerCommand}
    />
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
          {typstForwardTarget}
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
