<script lang="ts">
import { tick } from "svelte";
import { readFile } from "@tauri-apps/plugin-fs";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { ZoomIn, ZoomOut, AlignCenter, Maximize2 } from "lucide-svelte";
import { Icon } from "@/components/primitives";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOM_STEP = 0.25;
const MIN_SCALE = 0.25;
const MAX_SCALE = 5.0;
const PAGE_GAP = 12;       // px between pages
const PRERENDER_PX = 400;  // render pages this many px outside the viewport

let { path }: { path: string } = $props();

// ── DOM refs ─────────────────────────────────────────────────
let scrollEl: HTMLDivElement;

// ── PDF state ────────────────────────────────────────────────
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
let pageCount = $state(0);
let pageWidths: number[]  = [];  // natural width at scale=1
let pageHeights: number[] = [];  // natural height at scale=1

// ── View state ───────────────────────────────────────────────
let scale    = $state(1.0);
let fitMode  = $state<"width" | "page" | "free">("width");
let currentPage = $state(1);
let isLoading   = $state(true);
let loadError   = $state<string | null>(null);

// ── Canvas refs (populated by bind:this inside #each) ────────
let canvases: (HTMLCanvasElement | null)[] = $state([]);

// ── Render management ────────────────────────────────────────
let renderTasks = new Map<number, pdfjsLib.RenderTask>();
let renderTimer: ReturnType<typeof setTimeout> | null = null;
let intersectionObs: IntersectionObserver | null = null;
let resizeObs: ResizeObserver | null = null;
let visiblePageIndices = new Set<number>();

// Derived: page pixel dimensions at current scale
let dims = $derived(
  pageWidths.map((w, i) => ({
    w: Math.round(w * scale),
    h: Math.round(pageHeights[i] * scale),
  }))
);

// ── Load PDF ─────────────────────────────────────────────────
$effect(() => {
  const p = path;
  let blobUrl: string | null = null;

  teardown();
  isLoading  = true;
  loadError  = null;

  void (async () => {
    try {
      const bytes = await readFile(p);
      if (p !== path) return;

      blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const doc = await pdfjsLib.getDocument({ url: blobUrl }).promise;
      if (p !== path) { doc.destroy(); return; }

      // Collect page dimensions (no rendering, just page structure)
      const ws: number[] = [];
      const hs: number[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        ws.push(vp.width);
        hs.push(vp.height);
        page.cleanup();
      }

      pdfDoc      = doc;
      pageCount   = doc.numPages;
      pageWidths  = ws;
      pageHeights = hs;
      canvases    = new Array(doc.numPages).fill(null);
      isLoading   = false;

      await tick();        // let Svelte create the canvas elements
      applyFit();
      setupObservers();
    } catch (e) {
      if (p !== path) return;
      loadError = "Impossible de charger le PDF.";
      isLoading = false;
      console.error("PdfViewer:", e);
    }
  })();

  return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
});

// ── Fit / zoom ───────────────────────────────────────────────
function applyFit() {
  if (!scrollEl || pageWidths.length === 0) return;
  const cw = scrollEl.clientWidth  - 32;
  const ch = scrollEl.clientHeight - 32;

  if (fitMode === "width") {
    scale = clamp(cw / Math.max(...pageWidths), MIN_SCALE, MAX_SCALE);
  } else if (fitMode === "page") {
    const sw = cw / Math.max(...pageWidths);
    const sh = ch / Math.max(...pageHeights);
    scale = clamp(Math.min(sw, sh), MIN_SCALE, MAX_SCALE);
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function zoomIn() {
  fitMode = "free";
  scale   = clamp(parseFloat((scale + ZOOM_STEP).toFixed(2)), MIN_SCALE, MAX_SCALE);
}



function zoomOut() {
  fitMode = "free";
  scale   = clamp(parseFloat((scale - ZOOM_STEP).toFixed(2)), MIN_SCALE, MAX_SCALE);
}

function fitWidth() { fitMode = "width"; applyFit(); }
function fitPage()  { fitMode = "page";  applyFit(); }

// Re-render on scale change (debounced)
$effect(() => {
  const s = scale; // subscribe
  if (!pdfDoc || isLoading) return;
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    cancelAllRenders();
    renderVisible();
  }, 80);
});

// ── Rendering ────────────────────────────────────────────────
async function renderPage(i: number) {
  if (!pdfDoc || !canvases[i]) return;
  if (renderTasks.has(i)) return;

  const canvas       = canvases[i]!;
  const capturedScale = scale;
  let page: pdfjsLib.PDFPageProxy | null = null;

  try {
    page = await pdfDoc.getPage(i + 1);
    const viewport = page.getViewport({ scale: capturedScale });

    canvas.width  = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const task = page.render({ canvasContext: ctx, viewport });
    renderTasks.set(i, task);
    await task.promise;
  } catch (e: any) {
    if (e?.name !== "RenderingCancelledException") {
      console.warn(`PdfViewer: page ${i + 1}`, e);
    }
  } finally {
    renderTasks.delete(i);
    page?.cleanup();
  }
}

function cancelAllRenders() {
  for (const t of renderTasks.values()) t.cancel();
  renderTasks.clear();
}

function renderVisible() {
  if (!scrollEl) return;
  const sr = scrollEl.getBoundingClientRect();
  scrollEl.querySelectorAll<HTMLElement>(".mdv-pdf__page").forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const inRange =
      r.bottom > sr.top  - PRERENDER_PX &&
      r.top    < sr.bottom + PRERENDER_PX;
    if (inRange) void renderPage(i);
  });
}

// ── Observers ────────────────────────────────────────────────
function setupObservers() {
  intersectionObs?.disconnect();
  resizeObs?.disconnect();
  visiblePageIndices.clear();

  // Intersection: lazy render + current-page tracking
  intersectionObs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const i = parseInt((e.target as HTMLElement).dataset.pi ?? "0");
        if (e.isIntersecting) {
          visiblePageIndices.add(i);
          void renderPage(i);
        } else {
          visiblePageIndices.delete(i);
        }
      }
      if (visiblePageIndices.size > 0) {
        currentPage = Math.min(...visiblePageIndices) + 1;
      }
    },
    {
      root: scrollEl,
      rootMargin: `${PRERENDER_PX}px 0px ${PRERENDER_PX}px 0px`,
      threshold: 0,
    },
  );

  scrollEl.querySelectorAll<HTMLElement>(".mdv-pdf__page").forEach((el) => {
    intersectionObs!.observe(el);
  });

  // Resize: recompute fit
  resizeObs = new ResizeObserver(() => {
    if (fitMode !== "free") applyFit();
  });
  resizeObs.observe(scrollEl);
}

// ── Teardown ─────────────────────────────────────────────────
function teardown() {
  cancelAllRenders();
  if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
  intersectionObs?.disconnect();
  resizeObs?.disconnect();
  visiblePageIndices.clear();
  pdfDoc?.destroy();
  pdfDoc      = null;
  pageCount   = 0;
  pageWidths  = [];
  pageHeights = [];
  canvases    = [];
}

$effect(() => () => teardown());

// Percent label for toolbar
let pct = $derived(`${Math.round(scale * 100)}%`);
</script>

<div class="mdv-pdf">
  <!-- ── Scroll area ───────────────────────────────── -->
  <div class="mdv-pdf__scroll" bind:this={scrollEl}>
    {#if isLoading}
      <div class="mdv-pdf__msg">Lecture du fichier…</div>
    {:else if loadError}
      <div class="mdv-pdf__msg mdv-pdf__msg--error">{loadError}</div>
    {:else}
      <div class="mdv-pdf__pages" style:gap="{PAGE_GAP}px">
        {#each { length: pageCount } as _, i}
          <div
            class="mdv-pdf__page"
            data-pi={i}
            style:width="{dims[i]?.w ?? 0}px"
            style:height="{dims[i]?.h ?? 0}px"
          >
            <canvas bind:this={canvases[i]}></canvas>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ── Right toolbar ────────────────────────────── -->
  {#if !isLoading && !loadError}
    <aside class="mdv-pdf__toolbar">
      <button
        class="mdv-pdf__tbtn"
        onclick={zoomIn}
        disabled={scale >= MAX_SCALE}
        data-tooltip="Zoom avant"
        aria-label="Zoom avant"
      >
        <Icon icon={ZoomIn} size={14} strokeWidth={1.5} />
      </button>

      <span class="mdv-pdf__pct">{pct}</span>

      <button
        class="mdv-pdf__tbtn"
        onclick={zoomOut}
        disabled={scale <= MIN_SCALE}
        data-tooltip="Zoom arrière"
        aria-label="Zoom arrière"
      >
        <Icon icon={ZoomOut} size={14} strokeWidth={1.5} />
      </button>

      <div class="mdv-pdf__tsep"></div>

      <button
        class="mdv-pdf__tbtn"
        class:mdv-pdf__tbtn--on={fitMode === "width"}
        onclick={fitWidth}
        data-tooltip="Ajuster à la largeur"
        aria-label="Ajuster à la largeur"
      >
        <Icon icon={AlignCenter} size={14} strokeWidth={1.5} />
      </button>

      <button
        class="mdv-pdf__tbtn"
        class:mdv-pdf__tbtn--on={fitMode === "page"}
        onclick={fitPage}
        data-tooltip="Ajuster à la page"
        aria-label="Ajuster à la page"
      >
        <Icon icon={Maximize2} size={14} strokeWidth={1.5} />
      </button>

      <div class="mdv-pdf__tsep"></div>

      <span class="mdv-pdf__page-info">{currentPage}</span>
      <span class="mdv-pdf__page-info mdv-pdf__page-info--muted">/</span>
      <span class="mdv-pdf__page-info mdv-pdf__page-info--muted">{pageCount}</span>
    </aside>
  {/if}
</div>
