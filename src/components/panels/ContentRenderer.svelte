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
import LazySynctexPdfViewer from "@/components/tex/LazySynctexPdfViewer.svelte";
import LazyTypstPdfOutput from "@/components/typst/LazyTypstPdfOutput.svelte";
import LazyTypstPreview from "@/components/typst/LazyTypstPreview.svelte";
import type { TypographySettings } from "@/lib/typography";
import { getTinymistClient } from "@/lib/lsp/tinymist";
import { getTexlabClient } from "@/lib/lsp/texlab";

let {
  tab = null as Tab | null,
  panelId = "main",
  onSourceChange,
  onGutterClick,
  typo = undefined as TypographySettings | undefined,
  jumpToLine = null as number | null,
  jumpToCol = null as number | null,
  onJumpApplied,
  vimOn = false,
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

// tinymist and texlab start lazily on first .typ/.typ file open
</script>

{#if !tab}
  <div class="mdv-empty-state" />
{:else if isPdfPath(tab.path)}
  {#if tab.sourceType === "latex"}
    <LazySynctexPdfViewer
      path={tab.path}
      rev={buildRev}
      {forwardToPage}
      {onInverseSync}
      {onToggleFullscreen}
    />
  {:else if tab.sourceType === "typst"}
    <LazyTypstPdfOutput
      path={tab.path}
      rev={buildRev}
      {onToggleFullscreen}
    />
  {:else}
    <LazyPdfViewer
      path={tab.path}
      {onToggleFullscreen}
    />
  {/if}
{:else if isImagePath(tab.path)}
  <ImageViewer path={tab.path} />
  {:else if panelId !== "main" && extFromPath(tab.path) === "typ"}
  <LazyTypstPreview
    value={tab.source}
    filePath={tab.path}
    {onToggleFullscreen}
    {onInverseSync}
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
{:else}
  <Editor
    value={tab.source}
    language={extFromPath(tab.path)}
    lineNumbers={typo?.codeLineNumbers !== false}
    onChange={(next) => onSourceChange?.(next)}
    {jumpToLine}
    {jumpToCol}
    {onJumpApplied}
    onGutterClick={extFromPath(tab.path) === "tex" || extFromPath(tab.path) === "typ" ? onGutterClick : undefined}
    lspClient={(() => {
      const ext = extFromPath(tab.path);
      if (ext === "typ") return getTinymistClient();
      if (ext === "tex") return getTexlabClient();
      return null;
    })()}
    filePath={tab.path}
  />
{/if}
