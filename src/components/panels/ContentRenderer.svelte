<script lang="ts">
// Ordre des branches VOLONTAIRE et exhaustif (phase 4, idée G) — tout
// nouveau `TabKind` de données DOIT avoir sa branche explicite ici avant le
// `{:else}` final (l'éditeur de fichiers) :
//   1. custom (calendar-editor / journal-calendar / svar-calendar),
//   2. doc (DocPreview — lecture seule, jamais l'éditeur),
//   3. pdf / image (viewers dédiés, pas de contenu texte),
//   4. md side → colle / presentation / preview (rendus dérivés),
//   5. html side → preview html,
//   6. spreadsheet / datafilter (outils — état SQLite, jamais l'éditeur),
//   7. else → Éditeur CodeMirror (tout fichier texte kind file/undefined).
// Un kind de données inconnu sans branche tomberait dans l'éditeur pour un
// chemin `x://…` — signe d'erreur à la relecture, pas d'un comportement voulu.
import { extFromPath } from "@/lib/editor-languages";
import { isPdfPath, isImagePath, isMarkdownPath } from "@/lib";
import type { Tab } from "@/lib/panel-store";
import Editor from "@/components/editor/Editor.svelte";
import LazyPdfViewer from "@/components/pdf/LazyPdfViewer.svelte";
import ImageViewer from "@/components/image/ImageViewer.svelte";
import LazyProseMark from "@/components/markdown/LazyProseMark.svelte";
import LazySlideDeck from "@/components/markdown/LazySlideDeck.svelte";
import LazyCollePreview from "@/components/colles/LazyCollePreview.svelte";
import LazyMarkdownPreview from "@/components/markdown/LazyMarkdownPreview.svelte";
import LazyDocPreview from "@/components/markdown/LazyDocPreview.svelte";
import LazyHtmlPreview from "@/components/preview/LazyHtmlPreview.svelte";
import LazyCalendarPanel from "@/components/calendar/LazyCalendarPanel.svelte";
import LazyJournalCalendarPanel from "@/components/sidebar/LazyJournalCalendarPanel.svelte";
import LazySvarCalendarPanel from "@/components/calendar/LazySvarCalendarPanel.svelte";
import LazySpreadsheetViewer from "@/components/spreadsheet/LazySpreadsheetViewer.svelte";
import LazyDataFilterViewer from "@/components/datafilter/LazyDataFilterViewer.svelte";

import type { TypographySettings } from "@/lib/typography";
import { getTexlabClient } from "@/lib/lsp/texlab";
import { getMarkdownOxideClient } from "@/lib/lsp/markdown-oxide";
import { contentFor, contentVersionOf } from "@/stores/content.svelte";

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
  buildRev?: number;
  onToggleFullscreen?: () => void;
} = $props();

// texlab and markdown-oxide start lazily on first .tex/.md file open
</script>

{#if !tab}
  <div class="mdv-empty-state" />
{:else if tab.kind === "custom" && tab.panelId === "calendar-editor"}
  <LazyCalendarPanel />
{:else if tab.kind === "custom" && tab.panelId === "journal-calendar"}
  <LazyJournalCalendarPanel />
{:else if tab.kind === "custom" && tab.panelId === "svar-calendar"}
  <LazySvarCalendarPanel />
{:else if tab.kind === "doc" && isMarkdownPath(tab.path)}
  <LazyDocPreview
    value={contentFor(tab.path)}
    filePath={tab.path}
  />
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
    value={contentFor(tab.path)}
    filePath={tab.path}
  />
{:else if panelId !== "main" && extFromPath(tab.path) === "md" && tab.renderMode === "presentation"}
  <LazySlideDeck
    value={contentFor(tab.path)}
    filePath={tab.path}
    fullscreen={false}
    onExitFullscreen={() => {}}
  />
{:else if panelId !== "main" && extFromPath(tab.path) === "md"}
  <LazyMarkdownPreview
    value={contentFor(tab.path)}
    rev={contentVersionOf(tab.path)}
    filePath={tab.path}
    tabId={tab.id}
  />
{:else if panelId === "main" && extFromPath(tab.path) === "md" && prosemarkOn}
  <LazyProseMark
    value={contentFor(tab.path)}
    onChange={(next: string) => onSourceChange?.(next)}
  />
{:else if extFromPath(tab.path) === "html" && panelId !== "main"}
  <LazyHtmlPreview
    value={contentFor(tab.path)}
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
    value={contentFor(tab.path)}
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
