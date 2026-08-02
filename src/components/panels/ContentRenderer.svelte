<script lang="ts">
import { extFromPath } from "@/lib/editor-languages";
import { isPdfPath, isImagePath } from "@/lib";
import type { Tab } from "@/lib/panel-store";
import Editor from "@/components/editor/Editor.svelte";
import LazyPdfViewer from "@/components/pdf/LazyPdfViewer.svelte";
import ImageViewer from "@/components/image/ImageViewer.svelte";
import LazyProseMark from "@/components/markdown/LazyProseMark.svelte";
import LazySlideDeck from "@/components/markdown/LazySlideDeck.svelte";
import LazyCollePreview from "@/components/colles/LazyCollePreview.svelte";
import LazyMarkdownPreview from "@/components/markdown/LazyMarkdownPreview.svelte";
import LazyHtmlPreview from "@/components/preview/LazyHtmlPreview.svelte";
import LazyCalendarPanel from "@/components/calendar/LazyCalendarPanel.svelte";
import LazyOpenCodePanel from "@/components/opencode/LazyOpenCodePanel.svelte";
import LazyJournalCalendarPanel from "@/components/sidebar/LazyJournalCalendarPanel.svelte";
import LazySvarCalendarPanel from "@/components/calendar/LazySvarCalendarPanel.svelte";
import LazySpreadsheetViewer from "@/components/spreadsheet/LazySpreadsheetViewer.svelte";
import LazyDataFilterViewer from "@/components/datafilter/LazyDataFilterViewer.svelte";

import type { TypographySettings } from "@/lib/typography";
import { getTexlabClient } from "@/lib/lsp/texlab";
import { getMarkdownOxideClient } from "@/lib/lsp/markdown-oxide";

let {
  tab = null as Tab | null,
  panelId = "main",
  onSourceChange,
  onGutterClick,
  typo: _typo = undefined as TypographySettings | undefined,
  jumpToLine = null as number | null,
  jumpToCol = null as number | null,
  onJumpApplied,
  vimOn: _vimOn = false,
  prosemarkOn = false,
  forwardToPage = null as number | null,
  onInverseSync,
  onJumpToLine,
  buildRev = 0,
  onToggleFullscreen,
}: {
  tab?: Tab | null;
  panelId?: string;
  onSourceChange?: (source: string) => void;
  onGutterClick?: (line: number) => void;
  typo?: TypographySettings;
  jumpToLine?: number | null;
  jumpToCol?: number | null;
  onJumpApplied?: () => void;
  vimOn?: boolean;
  prosemarkOn?: boolean;
  previewOn?: never;
  presentationOn?: never;
  forwardToPage?: number | null;
  onInverseSync?: (file: string, line: number, col?: number) => void;
  onJumpToLine?: (line: number) => void;
  buildRev?: number;
  onToggleFullscreen?: () => void;
} = $props();

// texlab and markdown-oxide start lazily on first .tex/.md file open
</script>

{#if !tab}
  <div class="mdv-empty-state" />
{:else if tab.kind === "custom" && tab.panelId === "calendar-editor"}
  <LazyCalendarPanel />
{:else if tab.kind === "custom" && tab.panelId === "opencode"}
  <LazyOpenCodePanel />
{:else if tab.kind === "custom" && tab.panelId === "journal-calendar"}
  <LazyJournalCalendarPanel />
{:else if tab.kind === "custom" && tab.panelId === "svar-calendar"}
  <LazySvarCalendarPanel />
{:else if isPdfPath(tab.path)}
  <LazyPdfViewer
    path={tab.path}
    rev={buildRev}
    page={forwardToPage}
    {onInverseSync}
    {onToggleFullscreen}
  />
{:else if isImagePath(tab.path)}
  <ImageViewer path={tab.path} />
{:else if panelId !== "main" && extFromPath(tab.path) === "md" && tab.renderMode === "colle"}
  <LazyCollePreview
    value={tab.source}
    filePath={tab.path}
  />
{:else if panelId !== "main" && extFromPath(tab.path) === "md" && tab.renderMode === "presentation"}
  <LazySlideDeck
    value={tab.source}
    filePath={tab.path}
    fullscreen={false}
    onExitFullscreen={() => {}}
  />
{:else if panelId !== "main" && extFromPath(tab.path) === "md"}
  <LazyMarkdownPreview
    value={tab.source}
    filePath={tab.path}
    {onJumpToLine}
  />
{:else if panelId === "main" && extFromPath(tab.path) === "md" && prosemarkOn}
  <LazyProseMark
    value={tab.source}
    onChange={(next: string) => onSourceChange?.(next)}
  />
{:else if extFromPath(tab.path) === "html" && panelId !== "main"}
  <LazyHtmlPreview
    value={tab.source}
    filePath={tab.path}
  />
{:else if tab.kind === "spreadsheet"}
  <LazySpreadsheetViewer
    spreadsheetId={tab.spreadsheetId}
  />
{:else if tab.kind === "datafilter"}
  <LazyDataFilterViewer
    datafilterIds={tab.datafilterIds ?? []}
  />
{:else}
  <Editor
    value={tab.source}
    language={extFromPath(tab.path)}
    onChange={(next) => onSourceChange?.(next)}
    {jumpToLine}
    {jumpToCol}
    {onJumpApplied}
    onGutterClick={extFromPath(tab.path) === "tex" ? onGutterClick : undefined}
    lspClient={(() => {
      const ext = extFromPath(tab.path);
      if (ext === "tex") return getTexlabClient();
      if (ext === "md") return getMarkdownOxideClient();
      return null;
    })()}
    filePath={tab.path}
  />
{/if}
