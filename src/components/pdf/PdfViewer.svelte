<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as pdfjsLib from "pdfjs-dist";
  import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
  import {
    EventBus,
    PDFViewer,
    PDFLinkService,
    PDFFindController,
  } from "pdfjs-dist/web/pdf_viewer.mjs";
  import { readFile, exists } from "@tauri-apps/plugin-fs";
  import { invoke } from "@tauri-apps/api/core";
  import {
    PanelLeftClose,
    PanelLeftOpen,
    ChevronLeft,
    ChevronRight,
    ArrowBigLeft,
    ArrowBigRight,
    Maximize2,
    ZoomIn,
    ZoomOut,
    Expand,
    Fullscreen,
    List,
    Paperclip,
    FileText,
  } from "@/lib/icons";
  import { Icon } from "@/components/primitives";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";
  import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
  import { getPdfCache, setPdfCache, updatePdfPage, setPdfDoc, deletePdfDoc } from "@/lib/pdf-cache";
  import { attachRectSelection, type RectInfo } from "@/pdf/rect-select";

  let t = $derived(getT($language));

  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  type OutlineNode = {
    title: string;
    dest: string | unknown[] | null;
    items: OutlineNode[];
  };

  let { path, rev = 0, page = null, onInverseSync, onRectSelected, onToggleFullscreen }:
    { path: string; rev?: number; page?: number | null; onInverseSync?: (file: string, line: number) => void; onRectSelected?: (info: RectInfo) => void; onToggleFullscreen?: () => void }
    = $props();

  // DOM refs
  let viewportEl: HTMLDivElement;
  let innerEl: HTMLDivElement;
  let pageInputEl: HTMLInputElement;
  let shellEl: HTMLDivElement;

  // pdfjs instances
  let pdfViewer: PDFViewer | null = null;
  let linkService: PDFLinkService | null = null;
  let eventBus: EventBus | null = null;
  let pdfDoc: PDFDocumentProxy | null = null;
  let loadingTask: PDFDocumentLoadingTask | null = null;
  let blobUrl: string | null = null;

  // Viewer state
  let scale       = $state(1.0);
  let numPages    = $state(0);
  let currentPage = $state(1);
  let pageInput   = $state("1");
  let loading     = $state(false);
  let errorMsg    = $state<string | null>(null);

  // Toolbar hover-reveal (same pattern as ViewToolbar)
  let toolbarVisible = $state(false);
  let hoverZoneEl = $state<HTMLElement | null>(null);
  let pdfToolbarEl = $state<HTMLElement | null>(null);

  function showToolbar() { toolbarVisible = true; }
  function hideToolbar() { toolbarVisible = false; }

  function pdfClickOutside(e: MouseEvent) {
    if (!pdfToolbarEl) return;
    const target = e.target as Node;
    if (!pdfToolbarEl.contains(target)) {
      hideToolbar();
    }
  }

  $effect(() => {
    if (!toolbarVisible) return;
    const handler = (e: MouseEvent) => pdfClickOutside(e);
    requestAnimationFrame(() => document.addEventListener("click", handler));
    return () => document.removeEventListener("click", handler);
  });

  // Generation counter to discard stale async loadPdf calls
  let loadGen = 0;
  let loadedDocPath: string | null = null;
  let pendingScrollPage: number | null = null;
  let cleanupRect: (() => void) | null = null;
  let cleanupScrollToRect: (() => void) | null = null;
  let hasSynctex = $state(false);

  function hasLayout() {
    return viewportEl && viewportEl.offsetParent !== null;
  }

  function onPdfMouseDown(e: MouseEvent) {
    if (!(e.ctrlKey || e.metaKey) || !onInverseSync || !hasSynctex) return;
    const pageEl = (e.target as HTMLElement).closest("[data-page-number]") as HTMLElement | null;
    if (!pageEl) return;
    const page = Number(pageEl.dataset.pageNumber);
    if (!page) return;
    const pageRect = pageEl.getBoundingClientRect();
    const cssX = e.clientX - pageRect.left;
    const cssY = e.clientY - pageRect.top;
    const pageView = (pdfViewer as any)?._pages?.[page - 1];
    if (!pageView) return;
    const [x] = pageView.getPagePoint(cssX, cssY);
    const scale = pageView.viewport.scale;
    const y = cssY / scale;
    invoke<{ file: string; line: number }>("synctex_inverse", { pdfPath: path, page, x, y })
      .then((r) => onInverseSync!(r.file, r.line))
      .catch((err) => console.error("synctex inverse failed", err));
  }

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
    navHistory.length = 0;
    navIndex = -1;

    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    if (loadingTask) { void loadingTask.destroy(); loadingTask = null; pdfDoc = null; }
    if (loadedDocPath) { deletePdfDoc(loadedDocPath); loadedDocPath = null; }

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
      const blob  = new Blob([bytes as BlobPart], { type: "application/pdf" });
      blobUrl = URL.createObjectURL(blob);

      loadingTask = pdfjsLib.getDocument({ url: blobUrl });
      pdfDoc = await loadingTask.promise;
      if (gen !== loadGen) { void loadingTask.destroy(); loadingTask = null; pdfDoc = null; return; }

      setPdfDoc(filePath, pdfDoc);
      loadedDocPath = filePath;
      numPages = pdfDoc.numPages;

      linkService!.setDocument(pdfDoc, null);

      pdfViewer!.setDocument(pdfDoc);

      // Wait for pages to be created (async after setDocument)
      await pdfViewer!.pagesPromise;
      if (gen !== loadGen) return;

      // Restore page & scale from cache (defer to next frame — container may not have layout yet)
      const entry = getPdfCache(filePath);
      const cachedPage = entry && entry.rev === rev && entry.page >= 1 && entry.page <= numPages ? entry.page : null;
      const cachedScale = entry && entry.rev === rev && entry.scale > 0 ? entry.scale : null;
      const scrollTarget = pendingScrollPage && pendingScrollPage >= 1 && pendingScrollPage <= numPages ? pendingScrollPage : null;
      pendingScrollPage = null;
      requestAnimationFrame(() => {
        if (gen !== loadGen || !pdfViewer) return;
        const page = scrollTarget ?? cachedPage;
        if (page != null && hasLayout()) { pdfViewer.currentPageNumber = page; currentPage = page; }
        if (cachedScale != null && hasLayout()) pdfViewer.currentScale = cachedScale;
        pushHistory(currentPage); // seed history with initial position
      });

      const [rawOutline, rawAtt] = await Promise.all([
        pdfDoc.getOutline(),
        pdfDoc.getAttachments(),
      ]);
      if (gen !== loadGen) return;
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
  function goPrev()  { if (pdfViewer && currentPage > 1) pdfViewer.currentPageNumber = currentPage - 1; }
  function goNext()  { if (pdfViewer && currentPage < numPages) pdfViewer.currentPageNumber = currentPage + 1; }

  // — Navigation history (back/forward through TOC + link clicks) —
  const navHistory: number[] = [];
  let navIndex = -1;
  let navPushing = false; // suppress push while navigating

  function pushHistory(pageNumber: number) {
    if (navPushing) return;
    // Truncate forward history when navigating to a new position
    navHistory.length = navIndex + 1;
    navHistory.push(pageNumber);
    navIndex = navHistory.length - 1;
  }

  function goBack() {
    if (navIndex <= 0) return;
    navPushing = true;
    navIndex--;
    if (pdfViewer) pdfViewer.currentPageNumber = navHistory[navIndex];
    navPushing = false;
  }

  function goForward() {
    if (navIndex >= navHistory.length - 1) return;
    navPushing = true;
    navIndex++;
    if (pdfViewer) pdfViewer.currentPageNumber = navHistory[navIndex];
    navPushing = false;
  }

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
    if (linkService && item.dest) {
      pushHistory(currentPage);
      await linkService.goToDestination(item.dest);
    }
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

    // Inverse synctex: Ctrl+click on PDF pages → jump to source line
    viewportEl.addEventListener("mousedown", onPdfMouseDown);

    // Detect synctex availability (basename.synctex.gz next to PDF)
    const synctexPath = path.replace(/\.pdf$/i, "") + ".synctex.gz";
    exists(synctexPath).then((ok) => { hasSynctex = ok; }).catch(() => {});

    // Rect selection: Alt+drag to select region
    cleanupRect = attachRectSelection(
      viewportEl,
      () => pdfViewer,
      () => path,
      (info) => onRectSelected?.(info),
    );

    // Listen for scroll-to-rect requests (from markdown preview wikilink clicks)
    const onScrollToRect = (e: Event) => {
      const detail = (e as CustomEvent).detail as { path: string; page?: number; rect?: string }
      if (!detail.path || detail.path !== path) return
      if (detail.page && detail.page >= 1) {
        pushHistory(currentPage);
        if (pdfViewer && pdfViewer.pagesCount && detail.page <= pdfViewer.pagesCount) {
          pdfViewer.currentPageNumber = detail.page
        } else {
          pendingScrollPage = detail.page
        }
      }
    }
    window.addEventListener("azprose:pdf-scroll-to-rect", onScrollToRect)
    cleanupScrollToRect = () => window.removeEventListener("azprose:pdf-scroll-to-rect", onScrollToRect)

    // Create hover zone for toolbar reveal (top 40px of pdf-shell)
    if (shellEl) {
      const zone = document.createElement("div");
      zone.className = "pdf-hover-zone";
      zone.style.cssText = "position:absolute;top:0;left:0;right:0;height:40px;z-index:19";
      shellEl.appendChild(zone);
      hoverZoneEl = zone;
      zone.addEventListener("mouseenter", showToolbar);
    }
  });

  $effect(() => {
    if (!hoverZoneEl) return;
    const el = hoverZoneEl;
    return () => {
      el.removeEventListener("mouseenter", showToolbar);
      el.remove();
      hoverZoneEl = null;
    };
  });

  // Scroll to page when parent requests it
  $effect(() => {
    if (page != null && pdfViewer && hasLayout()) {
      const p = page;
      if (p >= 1 && pdfViewer.pagesCount && p <= pdfViewer.pagesCount) {
        pdfViewer.currentPageNumber = p;
      }
    }
  });

  // Load on mount & reload when path changes; rev changes trigger full re-create
  $effect(() => { if (path && pdfViewer) void loadPdf(path); });

  // Re-detect synctex when path changes
  $effect(() => { exists(path.replace(/\.pdf$/i, "") + ".synctex.gz").then((ok) => { hasSynctex = ok; }).catch(() => {}); });

  onDestroy(() => {
    void loadingTask?.destroy();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    if (loadedDocPath) { deletePdfDoc(loadedDocPath); loadedDocPath = null; }
    if (viewportEl) viewportEl.removeEventListener("mousedown", onPdfMouseDown);
    cleanupRect?.();
    cleanupScrollToRect?.();
    if (hoverZoneEl) {
      hoverZoneEl.removeEventListener("mouseenter", showToolbar);
      hoverZoneEl.remove();
    }
  });
</script>

<div class="pdf-shell" bind:this={shellEl}>

  <!-- ── Top hover toolbar ── -->
  <header class="pdf-topbar" bind:this={pdfToolbarEl} class:is-hidden={!toolbarVisible}>
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
      <button class="pdf-btn" title={t("pdf.goBack")} onclick={goBack}>
        <Icon icon={ArrowBigLeft} size={14} strokeWidth={1.6} />
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
      <button class="pdf-btn" title={t("pdf.goForward")} onclick={goForward}>
        <Icon icon={ArrowBigRight} size={14} strokeWidth={1.6} />
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
        <span class="pdf-icon-rotate-45"><Icon icon={Maximize2} size={13} strokeWidth={1.6} /></span>
      </button>
      <button class="pdf-btn" title={t("pdf.fitPage")} onclick={fitPage} disabled={!numPages}>
        <Icon icon={Expand}    size={13} strokeWidth={1.6} />
      </button>
      <div class="pdf-vsep"></div>
      <button class="pdf-btn" title="Fullscreen" onclick={() => onToggleFullscreen?.()}>
        <Icon icon={Fullscreen} size={14} strokeWidth={1.6} />
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
