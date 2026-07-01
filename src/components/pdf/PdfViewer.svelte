<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as pdfjsLib from "pdfjs-dist";
  import type { PDFDocumentProxy } from "pdfjs-dist";
  import {
    EventBus,
    PDFViewer,
    PDFLinkService,
    PDFFindController,
  } from "pdfjs-dist/web/pdf_viewer.mjs";
  import { readFile } from "@tauri-apps/plugin-fs";
  import {
    PanelLeftClose,
    PanelLeftOpen,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ZoomIn,
    ZoomOut,
    Maximize2,
    Shrink,
    List,
    Paperclip,
    FileText,
  } from "@/lib/icons";
  import { Icon } from "@/components/primitives";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";
  import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
  import { getPdfCache, setPdfCache, updatePdfPage } from "@/lib/pdf-cache";

  let t = $derived(getT($language));

  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  type OutlineNode = {
    title: string;
    dest: string | unknown[] | null;
    items: OutlineNode[];
  };

  let { path, rev = 0 }: { path: string; rev?: number } = $props();

  // DOM refs
  let viewportEl: HTMLDivElement;
  let innerEl: HTMLDivElement;
  let pageInputEl: HTMLInputElement;

  // pdfjs instances
  let pdfViewer: PDFViewer | null = null;
  let linkService: PDFLinkService | null = null;
  let eventBus: EventBus | null = null;
  let pdfDoc: PDFDocumentProxy | null = null;
  let blobUrl: string | null = null;

  // Viewer state
  let scale       = $state(1.0);
  let numPages    = $state(0);
  let currentPage = $state(1);
  let pageInput   = $state("1");
  let loading     = $state(false);
  let errorMsg    = $state<string | null>(null);

  // Generation counter to discard stale async loadPdf calls
  let loadGen = 0;

  // Panel state
  let panelOpen = $state(false);
  let panelTab  = $state<"toc" | "attachments">("toc");
  let outline     = $state<OutlineNode[]>([]);
  let attachments = $state<Record<string, { filename: string }> | null>(null);

  const PANEL_W = 260;

  let scaleLabel = $derived(Math.round(scale * 100) + "%");

  // Keep page input in sync when the viewer scrolls to a new page
  $effect(() => { pageInput = String(currentPage); });

  async function loadPdf(filePath: string) {
    const gen = ++loadGen;

    loading   = true;
    errorMsg  = null;
    numPages  = 0;
    currentPage = 1;
    outline     = [];
    attachments = null;

    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    if (pdfDoc)  { pdfDoc.destroy(); pdfDoc = null; }

    // Use cached bytes if rev matches (avoids re-read on tab switch-back)
    const cached = getPdfCache(filePath);
    let bytes: Uint8Array;
    if (cached && cached.rev === rev) {
      bytes = cached.data;
    } else {
      bytes = await readFile(filePath);
      if (gen !== loadGen) return;
      setPdfCache(filePath, { data: bytes, page: 1, scale: 1.0, rev });
    }

    try {
      const blob  = new Blob([bytes], { type: "application/pdf" });
      blobUrl = URL.createObjectURL(blob);

      pdfDoc = await pdfjsLib.getDocument(blobUrl).promise;
      if (gen !== loadGen) { pdfDoc.destroy(); pdfDoc = null; return; }

      numPages = pdfDoc.numPages;

      linkService!.setDocument(pdfDoc, null);

      pdfViewer!.setDocument(pdfDoc);

      // Wait for pages to be created (async after setDocument)
      await pdfViewer!.pagesPromise;
      if (gen !== loadGen) return;

      // Restore page & scale from cache
      const entry = getPdfCache(filePath);
      if (entry && entry.rev === rev) {
        if (entry.page >= 1 && entry.page <= numPages) {
          pdfViewer!.currentPageNumber = entry.page;
          currentPage = entry.page;
        }
        if (entry.scale > 0) pdfViewer!.currentScale = entry.scale;
      }

      const [rawOutline, rawAtt] = await Promise.all([
        pdfDoc.getOutline(),
        pdfDoc.getAttachments(),
      ]);
      outline     = (rawOutline ?? []) as OutlineNode[];
      attachments = rawAtt as typeof attachments;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      errorMsg = errMsg;
    } finally {
      loading = false;
    }
  }

  // — Navigation —
  function goFirst() { if (pdfViewer && numPages) pdfViewer.currentPageNumber = 1; }
  function goPrev()  { if (pdfViewer && currentPage > 1) pdfViewer.currentPageNumber = currentPage - 1; }
  function goNext()  { if (pdfViewer && currentPage < numPages) pdfViewer.currentPageNumber = currentPage + 1; }
  function goLast()  { if (pdfViewer && numPages) pdfViewer.currentPageNumber = numPages; }

  function commitPageInput() {
    const n = parseInt(pageInput, 10);
    if (!isNaN(n) && n >= 1 && n <= numPages && pdfViewer) {
      pdfViewer.currentPageNumber = n;
    } else {
      pageInput = String(currentPage);
    }
  }

  // — Zoom —
  function zoomIn()   { if (pdfViewer) pdfViewer.currentScale = Math.min(10, pdfViewer.currentScale * 1.15); }
  function zoomOut()  { if (pdfViewer) pdfViewer.currentScale = Math.max(0.1, pdfViewer.currentScale / 1.15); }
  function fitWidth() { if (pdfViewer) pdfViewer.currentScaleValue = "page-width"; }
  function fitPage()  { if (pdfViewer) pdfViewer.currentScaleValue = "page-fit"; }

  // — TOC navigation —
  async function goToOutlineItem(item: OutlineNode) {
    if (linkService && item.dest) await linkService.goToDestination(item.dest);
    panelOpen = false;
  }

  onMount(() => {
    eventBus    = new EventBus();
    linkService = new PDFLinkService({ eventBus });
    const findController = new PDFFindController({ linkService, eventBus });

    pdfViewer = new PDFViewer({
      container: viewportEl,
      viewer: innerEl,
      eventBus,
      linkService,
      findController,
      removePageBorders: true,
    });

    linkService.setViewer(pdfViewer);

    eventBus.on("pagechanging",  (e: { pageNumber: number }) => { currentPage = e.pageNumber; updatePdfPage(path, e.pageNumber); });
    eventBus.on("scalechanging", (e: { scale: number })      => { scale = e.scale; });
  });

  // Load on mount & reload when path changes; rev changes trigger full re-create
  $effect(() => { if (path && pdfViewer) void loadPdf(path); });

  onDestroy(() => {
    pdfDoc?.destroy();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  });
</script>

<div class="pdf-shell">

  <!-- ── Top hover toolbar ── -->
  <header class="pdf-topbar">
    <!-- Left: panel toggle -->
    <div class="pdf-topbar__section pdf-topbar__left">
      <button
        class="pdf-btn"
        title={panelOpen ? t("pdf.hidePanel") : t("pdf.showPanel")}
        onclick={() => (panelOpen = !panelOpen)}
      >
        {#if panelOpen}
          <Icon icon={PanelLeftClose} size={14} strokeWidth={1.6} />
        {:else}
          <Icon icon={PanelLeftOpen} size={14} strokeWidth={1.6} />
        {/if}
      </button>
    </div>

    <!-- Center: navigation -->
    <div class="pdf-topbar__section pdf-topbar__center">
      <button class="pdf-btn" title={t("pdf.firstPage")}    onclick={goFirst} disabled={!numPages || currentPage <= 1}>
        <Icon icon={ChevronsLeft}  size={14} strokeWidth={1.6} />
      </button>
      <button class="pdf-btn" title={t("pdf.prevPage")} onclick={goPrev}  disabled={!numPages || currentPage <= 1}>
        <Icon icon={ChevronLeft}   size={14} strokeWidth={1.6} />
      </button>
      <input
        bind:this={pageInputEl}
        class="pdf-page-input"
        type="text"
        inputmode="numeric"
        bind:value={pageInput}
        disabled={!numPages}
        onchange={commitPageInput}
        onkeydown={(e) => { if (e.key === "Enter") { commitPageInput(); pageInputEl?.blur(); } }}
        onclick={() => pageInputEl?.select()}
      />
      <span class="pdf-page-sep">/ {numPages || "—"}</span>
      <button class="pdf-btn" title={t("pdf.nextPage")} onclick={goNext} disabled={!numPages || currentPage >= numPages}>
        <Icon icon={ChevronRight}  size={14} strokeWidth={1.6} />
      </button>
      <button class="pdf-btn" title={t("pdf.lastPage")} onclick={goLast} disabled={!numPages || currentPage >= numPages}>
        <Icon icon={ChevronsRight} size={14} strokeWidth={1.6} />
      </button>
    </div>

    <!-- Right: zoom + fit -->
    <div class="pdf-topbar__section pdf-topbar__right">
      <button class="pdf-btn" title={t("pdf.zoomOut")} onclick={zoomOut} disabled={!numPages}>
        <Icon icon={ZoomOut} size={14} strokeWidth={1.6} />
      </button>
      <span class="pdf-scale-chip">{numPages ? scaleLabel : "—"}</span>
      <button class="pdf-btn" title={t("pdf.zoomIn")} onclick={zoomIn} disabled={!numPages}>
        <Icon icon={ZoomIn}  size={14} strokeWidth={1.6} />
      </button>
      <div class="pdf-vsep"></div>
      <button class="pdf-btn" title={t("pdf.fitWidth")} onclick={fitWidth} disabled={!numPages}>
        <Icon icon={Maximize2} size={13} strokeWidth={1.6} />
      </button>
      <button class="pdf-btn" title={t("pdf.fitPage")} onclick={fitPage} disabled={!numPages}>
        <Icon icon={Shrink}    size={13} strokeWidth={1.6} />
      </button>
    </div>
  </header>

  <!-- ── Left panel (TOC / attachments) ── -->
  {#if panelOpen}
    <aside class="pdf-panel" style="width:{PANEL_W}px">
      <nav class="pdf-panel__tabs">
        <button
          class="pdf-panel__tab"
          class:is-active={panelTab === "toc"}
          onclick={() => (panelTab = "toc")}
        >
          <Icon icon={List} size={12} strokeWidth={1.6} />
          {t("pdf.contents")}
        </button>
        <button
          class="pdf-panel__tab"
          class:is-active={panelTab === "attachments"}
          onclick={() => (panelTab = "attachments")}
        >
          <Icon icon={Paperclip} size={12} strokeWidth={1.6} />
          {t("pdf.attachments")}
        </button>
      </nav>

      <div class="pdf-panel__body">
        {#if panelTab === "toc"}
          {#if outline.length === 0}
            <p class="pdf-panel__empty">{t("pdf.noToc")}</p>
          {:else}
            {#snippet tocTree(nodes: OutlineNode[], depth: number)}
              {#each nodes as item}
                <button
                  class="pdf-toc-item"
                  style="padding-left:{10 + depth * 14}px"
                  onclick={() => goToOutlineItem(item)}
                >
                  {item.title}
                </button>
                {#if item.items?.length}
                  {@render tocTree(item.items, depth + 1)}
                {/if}
              {/each}
            {/snippet}
            {@render tocTree(outline, 0)}
          {/if}

        {:else if panelTab === "attachments"}
          {#if !attachments || Object.keys(attachments).length === 0}
            <p class="pdf-panel__empty">{t("pdf.noAttachments")}</p>
          {:else}
            {#each Object.values(attachments) as att}
              <div class="pdf-att-item">{att.filename}</div>
            {/each}
          {/if}
        {/if}
      </div>
    </aside>
  {/if}

  <!-- ── PDF viewport — scrollbar on left via direction:rtl ── -->
  <div
    class="pdf-viewport"
    bind:this={viewportEl}
  >
    <div class="pdfViewer" bind:this={innerEl}></div>
  </div>

  <!-- Loading / error overlays -->
  {#if loading}
    <div class="pdf-overlay">
      <span class="pdf-loading-text">{t("pdf.loading")}</span>
    </div>
  {/if}
  {#if errorMsg}
    <div class="pdf-overlay pdf-error-overlay">
      <Icon icon={FileText} size={32} strokeWidth={1.5} />
      <p>{t("pdf.couldNotOpen")}</p>
      <code>{errorMsg}</code>
    </div>
  {/if}
</div>
