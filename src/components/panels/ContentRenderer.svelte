<script lang="ts">
// Ordre des branches VOLONTAIRE et exhaustif (phase 4, idée G) — tout
// nouveau `TabKind` de données DOIT avoir sa branche explicite ici avant le
// `{:else}` final (l'éditeur de fichiers) :
//   1. custom (calendar-editor / journal-calendar / svar-calendar / ai-agent),
//   2. pdf / image (viewers dédiés, pas de contenu texte),
//   3. md side → colle / presentation / preview (rendus dérivés),
//   4. html side → preview html,
//   5. spreadsheet / datafilter (outils — état SQLite, jamais l'éditeur),
//   6. else → Éditeur CodeMirror (tout fichier texte kind file/undefined).
// Un kind de données inconnu sans branche tomberait dans l'éditeur pour un
// chemin `x://…` — signe d'erreur à la relecture, pas d'un comportement voulu.
// (chantier fenêtre NAV, phase 7) L'aide intégrée (DocPreview) n'a plus de
// branche ICI : elle vit exclusivement dans la fenêtre NAV désormais.
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
import LazyJournalCalendarPanel from "@/components/sidebar/LazyJournalCalendarPanel.svelte";
import LazySvarCalendarPanel from "@/components/calendar/LazySvarCalendarPanel.svelte";
import LazySpreadsheetViewer from "@/components/spreadsheet/LazySpreadsheetViewer.svelte";
import LazyDataFilterViewer from "@/components/datafilter/LazyDataFilterViewer.svelte";
import LazyAgentPanel from "@/components/agent/LazyAgentPanel.svelte";

import type { TypographySettings } from "@/lib/typography";
import { getTexlabClient } from "@/lib/lsp/texlab";
import { getMarkdownOxideClient } from "@/lib/lsp/markdown-oxide";
import { contentFor, contentVersionOf } from "@/stores/content.svelte";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";

let t = $derived(getT($language));

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
  viewerFullscreenOn = false,
  /** Phase C — D5 : dernier build LaTeX en échec. Affiche le bandeau dans le
   *  CONTAINER du viewer PDF (jamais dans le PDFViewer) — le viewer garde le
   *  dernier buffer valide (`rev` n'a pas bougé, garde-fou build.ts). */
  latexBuildFailed = false,
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
  viewerFullscreenOn?: boolean;
  latexBuildFailed?: boolean;
} = $props();

// texlab and markdown-oxide start lazily on first .tex/.md file open
</script>

{#if !tab}
  <div class="mdv-empty-state" />
{:else if tab.dormant}
  <!-- Onglet restauré JAMAIS monté (Phase E — R9 « rien que du texte pur ») :
       aucun composant de rendu n'est instancié tant que l'utilisateur n'a pas
       cliqué l'onglet ; `select` le réveille (PanelState.wake). -->
  <div class="mdv-empty-state"></div>
{:else if tab.kind === "custom" && tab.panelId === "calendar-editor"}
  <LazyCalendarPanel />
{:else if tab.kind === "custom" && tab.panelId === "journal-calendar"}
  <LazyJournalCalendarPanel />
{:else if tab.kind === "custom" && tab.panelId === "svar-calendar"}
  <LazySvarCalendarPanel />
{:else if tab.kind === "custom" && tab.panelId === "ai-agent"}
  <LazyAgentPanel />
{:else if isPdfPath(tab.path)}
  <!-- CONTAINER du viewer PDF (Phase C — D5) : le message d'échec s'affiche
       ICI, jamais dans le PDFViewer, qui garde le DERNIER BUFFER VALIDE. -->
  <div class="mdv-pdf-container">
    {#if tab.sourceType === "latex" && latexBuildFailed}
      <div class="mdv-tex-banner" role="status">
        <i class="wxi-alert-circle" aria-hidden="true"></i>
        <span>{t("latex.buildFailedBanner")}</span>
      </div>
    {/if}
    <div class="mdv-pdf-container__body">
      <LazyPdfViewer
        path={tab.path}
        rev={buildRev}
        page={forwardToPage}
        {onInverseSync}
        {onToggleFullscreen}
      />
    </div>
  </div>
{:else if isImagePath(tab.path)}
  <ImageViewer path={tab.path} />
{:else if panelId !== "main" && extFromPath(tab.path) === "md" && tab.renderMode === "colle"}
  <LazyCollePreview
    value={contentFor(tab.path)}
    filePath={tab.path}
    viewerFullscreenOn={viewerFullscreenOn}
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

<style>
.mdv-pdf-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.mdv-pdf-container__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr;
}
.mdv-tex-banner {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  font-size: 13px;
  color: var(--color-error);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.mdv-tex-banner .wxi-alert-circle {
  flex: none;
}
</style>
