<script lang="ts">
import type { PanelManager } from "@/lib/panel-manager";
import type { Tab } from "@/lib/panel-store";
import PanelContainer from "./PanelContainer.svelte";
import type { TypographySettings } from "@/lib/typography";

let {
  panelManager,
  tabs = [] as Tab[],
  activeTabId = null as string | null,
  sideTabs = [] as Tab[],
  sideActiveTabId = null as string | null,
  sideVisible = false,
  splitRatio = 0.55,
  onSplitRatioChange = (_v: number) => {},
  onSourceChange,
  onSideSourceChange,
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
}: {
  panelManager: PanelManager;
  tabs?: Tab[];
  activeTabId?: string | null;
  sideTabs?: Tab[];
  sideActiveTabId?: string | null;
  sideVisible?: boolean;
  splitRatio?: number;
  onSplitRatioChange?: (v: number) => void;
  onSourceChange?: (source: string) => void;
  onSideSourceChange?: (source: string) => void;
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
} = $props();

let splitResizeState: { startX: number; startRatio: number } | null = null;

function startResize(e: PointerEvent) {
  const container = (e.currentTarget as HTMLElement).parentElement;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  splitResizeState = { startX: e.clientX, startRatio: splitRatio };
  const onMove = (ev: PointerEvent) => {
    if (!splitResizeState) return;
    const delta = ev.clientX - splitResizeState.startX;
    onSplitRatioChange(Math.max(0.2, Math.min(0.8, splitResizeState.startRatio + delta / rect.width)));
  };
  const onUp = () => {
    splitResizeState = null;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  e.preventDefault();
}
</script>

<div class="mdv-split" style="flex:1">
  <PanelContainer
    panel={panelManager.main}
    {tabs}
    {activeTabId}
    flex={sideVisible ? String(splitRatio) : "1"}
    {onSourceChange}
    {onGutterClick}
    {typo}
    {jumpToLine}
    {jumpToCol}
    {onJumpApplied}
    {vimOn}
    {prosemarkOn}
    {forwardToPage}
    {onInverseSync}
    {buildRev}
    {onSetEditorMode}
    {onLatexViewer}
    {onLatexBuild}
    {onTypstViewer}
    {onTypstBuild}
    {onTypstViewPdf}
  />
  {#if sideVisible}
    <div
      class="mdv-split__resize"
      onpointerdown={startResize}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize split"
    />
    <PanelContainer
      panel={panelManager.side}
      tabs={sideTabs}
      activeTabId={sideActiveTabId}
      flex={String(1 - splitRatio)}
      onSourceChange={onSideSourceChange}
      typo={typo}
      {jumpToLine}
      {jumpToCol}
      {onJumpApplied}
      {vimOn}
      {forwardToPage}
      {onInverseSync}
      {buildRev}
      {onToggleRenderMode}
      {onToggleFullscreen}
      {viewerFullscreenOn}
      {onViewerFullscreen}
    />
  {/if}
</div>
