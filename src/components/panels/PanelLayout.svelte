<script lang="ts">
import type { PanelManager } from "@/lib/panel-manager";
import { tabPinFormat, tabSpace, type Tab } from "@/lib/panel-store";
import PanelContainer from "./PanelContainer.svelte";
import type { TypographySettings } from "@/lib/typography";

let {
  panelManager,
  tabs = [] as Tab[],
  activeTabId = null as string | null,
  sideTabs = [] as Tab[],
  sideActiveTabId = null as string | null,
  sideVisible = false,
  splitRatio = 0.45,
  onSplitRatioChange = (_v: number) => {},
  onSourceChange,
  onSideSourceChange,
  onGutterClick,
  typo,
  jumpToLine = null as number | null,
  jumpToCol = null as number | null,
  onJumpApplied,
  vimOn = false,
  forwardToPage = null as number | null,
  onInverseSync,
  buildRev = 0,
  onSetEditorMode,
  onLatexViewer,
  onLatexBuild,
  onExportPdf,
  onToggleRenderMode,
  onToggleColles,
  onToggleSideColles,
  onToggleFullscreen,
  viewerFullscreenOn = false,
  onViewerFullscreen,
  onTabDoubleClick,
  latexBuildFailed = false,
  onTogglePin,
  onDropOnPinned,
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
  forwardToPage?: number | null;
  onInverseSync?: (file: string, line: number, col?: number) => void;
  buildRev?: number;
  onSetEditorMode?: (mode: "raw" | "preview") => void;
  onLatexViewer?: () => void;
  onLatexBuild?: () => void;
  onExportPdf?: () => void;
  onToggleRenderMode?: () => void;
  onToggleColles?: () => void;
  onToggleSideColles?: () => void;
  onToggleFullscreen?: () => void;
  viewerFullscreenOn?: boolean;
  onViewerFullscreen?: () => void;
  onTabDoubleClick?: (id: string) => void;
  latexBuildFailed?: boolean;
  onTogglePin?: (id: string, pinned: boolean) => void;
  onDropOnPinned?: (draggedId: string, pinnedId: string) => void;
} = $props();

let splitResizeState: { startX: number; startRatio: number } | null = null;

/** Format du PINNED slot dont le tab actif fait partie (Phase D) : l'éditeur
 *  ÉPINGLÉ lui-même (main) ou son viewer COMPAGNON (side, résolu via
 *  `pinnedOwner` — la liaison tient en excursion) ; `null` pour tout tab
 *  libre. Les boutons d'historique de montage ne s'affichent que là (règle
 *  1.3 : les tabs libres n'ont pas de pile de montage). Dérivé des props
 *  `tabs`/`sideTabs` (snapshots réactifs fournis par l'app). */
let mainPinnedFormat = $derived.by(() => {
  const tab = tabs.find(t => t.id === activeTabId);
  return tab && tabSpace(tab) === "pinned" ? tabPinFormat(tab.path) : null;
});

let sidePinnedFormat = $derived.by(() => {
  const tab = sideTabs.find(t => t.id === sideActiveTabId);
  if (!tab || tabSpace(tab) !== "pinned" || !tab.pinnedOwner) return null;
  const owner = tabs.find(t => t.id === tab.pinnedOwner);
  return owner ? tabPinFormat(owner.path) : null;
});

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
    {forwardToPage}
    {onInverseSync}
    {buildRev}
    {onSetEditorMode}
    {onLatexViewer}
    {onLatexBuild}
    {onExportPdf}
    {onToggleColles}
    {onTabDoubleClick}
    onCloseTab={(id) => panelManager.closeMainTab(id)}
    {latexBuildFailed}
    {onTogglePin}
    {onDropOnPinned}
    pinnedFormat={mainPinnedFormat}
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
      onToggleColles={onToggleSideColles}
      {onToggleFullscreen}
      {viewerFullscreenOn}
    {onViewerFullscreen}
    {onTabDoubleClick}
    {latexBuildFailed}
    pinnedFormat={sidePinnedFormat}
  />
  {/if}
</div>
