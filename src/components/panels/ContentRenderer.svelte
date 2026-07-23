<script lang="ts">
import { extFromPath } from "@/lib/editor-languages";
import { isPdfPath, isImagePath } from "@/lib";
import type { Tab } from "@/lib/panel-store";
import Editor from "@/components/editor/Editor.svelte";
import LazyPdfViewer from "@/components/pdf/LazyPdfViewer.svelte";
import ImageViewer from "@/components/image/ImageViewer.svelte";
import LazyProseMark from "@/components/markdown/LazyProseMark.svelte";
import LazySlideDeck from "@/components/markdown/LazySlideDeck.svelte";
import LazyMarkdownPreview from "@/components/markdown/LazyMarkdownPreview.svelte";
import LazyHtmlPreview from "@/components/preview/LazyHtmlPreview.svelte";
import LazyCsvSpreadsheet from "@/components/csv/LazyCsvSpreadsheet.svelte";
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
  onSyncToMain,
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
  onSyncToMain?: (source: string) => void;
} = $props();

// texlab and markdown-oxide start lazily on first .tex/.md file open
</script>

{#if !tab}
  <div class="mdv-empty-state" />
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
{:else if (extFromPath(tab.path) === "csv" || extFromPath(tab.path) === "tsv") && panelId !== "main"}
  <LazyCsvSpreadsheet value={tab.source} filePath={tab.path} onChange={(csv) => onSyncToMain?.(csv)} />
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
