import { useCallback, useEffect, useRef, useState } from "react";
import { AnnotationLayer, getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { readFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Maximize, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { Icon } from "@/components/primitives";

GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const GAP = 16;
const BUFFER = 400;

type PageDim = { w: number; h: number };
type PdfViewerProps = { path: string };

function buildLinkService(
  pdfRef: { readonly current: PDFDocumentProxy | null },
  scrollToPage: (n: number) => void,
) {
  return {
    externalLinkEnabled: true,
    externalLinkTarget: 2,
    externalLinkRel: "noopener noreferrer",
    addLinkAttributes(el: HTMLAnchorElement, url: string) {
      el.removeAttribute("href");
      el.style.cursor = "pointer";
      el.addEventListener("click", (e) => {
        e.preventDefault();
        openUrl(url).catch(console.error);
      });
    },
    getDestinationHash() { return "#"; },
    getAnchorUrl(h: string) { return h; },
    async goToDestination(dest: unknown) {
      const pdf = pdfRef.current;
      if (!pdf) return;
      try {
        let d: unknown[] | null = null;
        if (typeof dest === "string") d = await pdf.getDestination(dest);
        else if (Array.isArray(dest)) d = dest;
        if (!d?.[0]) return;
        const idx = await pdf.getPageIndex(d[0] as { num: number; gen: number });
        scrollToPage(idx + 1);
      } catch { /* noop */ }
    },
    isPageVisible() { return true; },
    isPageCached() { return false; },
  };
}

export function PdfViewer({ path }: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const dimsRef = useRef<PageDim[]>([]);
  const genRef = useRef(0);
  const scaleRef = useRef(0);
  const renderedRef = useRef<Set<number>>(new Set());
  const textLayersRef = useRef<Map<number, TextLayer>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkSvcRef = useRef<any>(null);

  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(0);
  const [totalHeight, setTotalHeight] = useState(0);

  useEffect(() => { scaleRef.current = scale; }, [scale]);

  const scrollToPage = useCallback((pageNum: number) => {
    const el = scrollRef.current;
    const dims = dimsRef.current;
    const s = scaleRef.current;
    if (!el || !dims.length) return;
    const n = Math.max(1, Math.min(pageNum, dims.length));
    let top = 0;
    for (let i = 0; i < n - 1; i++) top += Math.round(dims[i].h * s) + GAP;
    el.scrollTop = top;
  }, []);

  if (!linkSvcRef.current) {
    linkSvcRef.current = buildLinkService(pdfRef, scrollToPage);
  }

  // --- Load document ---
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setError(null);
        setNumPages(null);
        setScale(0);
        setTotalHeight(0);
        dimsRef.current = [];
        renderedRef.current = new Set();
        for (const tl of textLayersRef.current.values()) tl.cancel();
        textLayersRef.current = new Map();
        if (pagesRef.current) pagesRef.current.innerHTML = "";
        if (loadingTaskRef.current) { loadingTaskRef.current.destroy(); loadingTaskRef.current = null; }
        pdfRef.current = null;

        const bytes = await readFile(path);
        if (cancelled) return;

        const loadingTask = getDocument({ data: bytes });
        loadingTaskRef.current = loadingTask;
        const pdf = await loadingTask.promise;
        if (cancelled) { loadingTask.destroy(); return; }
        pdfRef.current = pdf;

        const pageObjs = await Promise.all(
          Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)),
        );
        if (cancelled) return;
        dimsRef.current = pageObjs.map((p) => {
          const vp = p.getViewport({ scale: 1 });
          return { w: vp.width, h: vp.height };
        });
        setNumPages(pdf.numPages);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }

    load();
    return () => { cancelled = true; };
  }, [path]);

  // --- Fit width once dims are ready ---
  useEffect(() => {
    if (!numPages || !dimsRef.current.length || !scrollRef.current) return;
    setScale(+(scrollRef.current.clientWidth / dimsRef.current[0].w).toFixed(2));
  }, [numPages]);

  // --- Total height ---
  useEffect(() => {
    if (!numPages || scale === 0) return;
    const dims = dimsRef.current;
    let h = 0;
    for (let i = 0; i < dims.length; i++) h += dims[i].h * scale + GAP;
    setTotalHeight(h - GAP);
  }, [numPages, scale]);

  // --- Build / reset page wrappers ---
  useEffect(() => {
    if (!numPages || scale === 0 || !pagesRef.current) return;

    for (const tl of textLayersRef.current.values()) tl.cancel();
    textLayersRef.current = new Map();
    renderedRef.current = new Set();

    const el = pagesRef.current;
    const dims = dimsRef.current;
    let top = 0;

    for (let i = 0; i < dims.length; i++) {
      const pw = Math.round(dims[i].w * scale);
      const ph = Math.round(dims[i].h * scale);

      let div = el.children[i] as HTMLDivElement | undefined;
      if (!div) {
        div = document.createElement("div");
        div.className = "mdv-pdf-page";
        el.appendChild(div);
      }

      Object.assign(div.style, {
        position: "absolute",
        top: `${top}px`,
        left: "50%",
        width: `${pw}px`,
        height: `${ph}px`,
        transform: "translateX(-50%)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
        background: "#fff",
      });

      // Canvas
      if (!div.querySelector("canvas")) {
        const c = document.createElement("canvas");
        c.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:block;";
        div.appendChild(c);
      }

      // Text layer
      let textDiv = div.querySelector(".textLayer") as HTMLDivElement | null;
      if (!textDiv) {
        textDiv = document.createElement("div");
        textDiv.className = "textLayer";
        div.appendChild(textDiv);
      } else {
        textDiv.replaceChildren();
      }

      // Annotation layer
      let annDiv = div.querySelector(".annotationLayer") as HTMLDivElement | null;
      if (!annDiv) {
        annDiv = document.createElement("div");
        annDiv.className = "annotationLayer";
        div.appendChild(annDiv);
      } else {
        annDiv.replaceChildren();
      }

      top += ph + GAP;
    }

    while (el.children.length > dims.length) el.lastChild?.remove();
  }, [numPages, scale]);

  // --- Render visible pages (canvas + text + annotations) ---
  const renderVisible = useCallback(() => {
    const pdf = pdfRef.current;
    const scrollEl = scrollRef.current;
    const pagesEl = pagesRef.current;
    const linkSvc = linkSvcRef.current;
    if (!pdf || !scrollEl || !pagesEl || !linkSvc) return;

    const gen = ++genRef.current;
    const st = scrollEl.scrollTop;
    const ch = scrollEl.clientHeight;
    const vTop = st - BUFFER;
    const vBot = st + ch + BUFFER;
    const dims = dimsRef.current;
    const s = scale;
    const dpr = window.devicePixelRatio || 1;

    let pageTop = 0;
    for (let i = 0; i < dims.length; i++) {
      const pageH = Math.round(dims[i].h * s);
      const pageNum = i + 1;

      if (pageTop + pageH >= vTop && pageTop <= vBot && !renderedRef.current.has(pageNum)) {
        const div = pagesEl.children[i] as HTMLDivElement | undefined;
        if (!div) { pageTop += pageH + GAP; continue; }
        renderedRef.current.add(pageNum);

        (async () => {
          try {
            const pageObj = await pdf.getPage(pageNum);
            if (gen !== genRef.current) { renderedRef.current.delete(pageNum); return; }

            // CSS-pixel viewport (for text and annotation layers)
            const viewport = pageObj.getViewport({ scale: s });
            // DPR viewport (for crisp canvas rendering)
            const dprViewport = pageObj.getViewport({ scale: s * dpr });

            // --- Canvas ---
            const canvas = div.querySelector("canvas") as HTMLCanvasElement;
            canvas.width = Math.round(dprViewport.width);
            canvas.height = Math.round(dprViewport.height);
            await pageObj.render({ canvas, viewport: dprViewport }).promise;
            if (gen !== genRef.current) return;

            // --- Text layer (transparent, selectable) ---
            const textDiv = div.querySelector(".textLayer") as HTMLDivElement;
            textDiv.replaceChildren();
            const textLayer = new TextLayer({
              textContentSource: pageObj.streamTextContent(),
              container: textDiv,
              viewport,
            });
            textLayersRef.current.set(pageNum, textLayer);
            await textLayer.render();
            if (gen !== genRef.current) { textLayer.cancel(); return; }

            // --- Annotation layer (links, etc.) ---
            const annDiv = div.querySelector(".annotationLayer") as HTMLDivElement;
            annDiv.replaceChildren();
            const annotations = await pageObj.getAnnotations();
            if (gen !== genRef.current) return;

            const annLayer = new AnnotationLayer({
              div: annDiv,
              accessibilityManager: null,
              annotationCanvasMap: null,
              annotationEditorUIManager: null,
              page: pageObj,
              viewport: viewport.clone({ dontFlip: true }),
              structTreeLayer: null,
              commentManager: null,
              linkService: linkSvc,
              annotationStorage: null,
            });
            await annLayer.render({
              viewport: viewport.clone({ dontFlip: true }),
              div: annDiv,
              annotations,
              page: pageObj,
              linkService: linkSvc,
              renderForms: false,
              imageResourcesPath: "",
            });
          } catch {
            renderedRef.current.delete(pageNum);
          }
        })();
      }

      pageTop += pageH + GAP;
    }
  }, [scale]);

  // --- Scroll listener ---
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", renderVisible, { passive: true });
    return () => el.removeEventListener("scroll", renderVisible);
  }, [renderVisible]);

  // --- Resize observer ---
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(renderVisible);
    ro.observe(el);
    return () => ro.disconnect();
  }, [renderVisible]);

  // --- Initial render after wrappers are built ---
  useEffect(() => {
    if (!numPages || scale === 0) return;
    const id = requestAnimationFrame(renderVisible);
    return () => cancelAnimationFrame(id);
  }, [numPages, scale, renderVisible]);

  // --- Fit handlers ---
  const fitWidth = useCallback(() => {
    if (!scrollRef.current || !dimsRef.current.length) return;
    setScale(+(scrollRef.current.clientWidth / dimsRef.current[0].w).toFixed(2));
  }, []);

  const fitPage = useCallback(() => {
    if (!scrollRef.current || !dimsRef.current.length) return;
    const { clientWidth: cw, clientHeight: ch } = scrollRef.current;
    const { w, h } = dimsRef.current[0];
    setScale(+Math.min(cw / w, ch / h).toFixed(2));
  }, []);

  const zoomIn = useCallback(() => setScale((s) => Math.min(5, +(s * 1.25).toFixed(2))), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(0.1, +(s / 1.25).toFixed(2))), []);

  const isLoading = !numPages && !error;

  return (
    <div className="mdv-pdf-viewer">
      <div className="mdv-pdf-viewer__canvas" ref={scrollRef}>
        {isLoading && <div className="mdv-pdf-viewer__info">loading…</div>}
        {error && <div className="mdv-pdf-viewer__error">could not load pdf — {error}</div>}
        {numPages && (
          <div
            className="mdv-pdf-viewer__pages"
            ref={pagesRef}
            style={{ position: "relative", width: "100%", height: totalHeight }}
          />
        )}
      </div>
      <div className="mdv-pdf-viewer__toolbar">
        <button className="mdv-pdf-viewer__btn" onClick={zoomIn} aria-label="zoom in">
          <Icon icon={ZoomIn} size={16} strokeWidth={1.5} />
        </button>
        <button className="mdv-pdf-viewer__btn" onClick={zoomOut} aria-label="zoom out">
          <Icon icon={ZoomOut} size={16} strokeWidth={1.5} />
        </button>
        <span className="mdv-pdf-viewer__zoom-label">
          {scale > 0 ? `${Math.round(scale * 100)}%` : "—"}
        </span>
        <button className="mdv-pdf-viewer__btn" onClick={fitWidth} aria-label="fit width">
          <Icon icon={Minimize2} size={16} strokeWidth={1.5} />
        </button>
        <button className="mdv-pdf-viewer__btn" onClick={fitPage} aria-label="fit page">
          <Icon icon={Maximize} size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
