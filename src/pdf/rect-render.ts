/**
 * PDF rect→image renderer with disk cache.
 *
 * Renders a rectangular region of a PDF page to a PNG image.
 * Cached in `.azprose/pdf/rectangle/<basename>/<page>-<coords>.png`.
 * Rendered at scale 2.0 for crisp output on standard displays.
 */

import * as pdfjsLib from "pdfjs-dist";
import { readFile, exists, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { getRootPath } from "@/stores/root-path.svelte";
import { basename, joinPath } from "@/lib/paths-utils";
import { getPdfDoc } from "@/lib/pdf-cache";

const RENDER_SCALE = 2.0;

// ── Cache paths ────────────────────────────────────────────────────────────

function pathHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function rectCacheDir(root: string, pdfPath: string): string {
  const base = basename(pdfPath);
  const dir = `${base}.${pathHash(pdfPath)}`;
  return joinPath(root, `.azprose/pdf/rectangle/${dir}`);
}

function rectCacheKey(page: number, rect: { x1: number; y1: number; x2: number; y2: number }): string {
  return `${page}-${rect.x1},${rect.y1},${rect.x2},${rect.y2}.png`;
}

function rectCachePath(root: string, pdfPath: string, page: number, rect: { x1: number; y1: number; x2: number; y2: number }): string {
  return joinPath(rectCacheDir(root, pdfPath), rectCacheKey(page, rect));
}

// ── In-memory fallback (session) ───────────────────────────────────────────

const memCache = new Map<string, string>();

function memKey(pdfPath: string, page: number, rect: { x1: number; y1: number; x2: number; y2: number }): string {
  return `${pdfPath}#${rectCacheKey(page, rect)}`;
}

// ── Render ─────────────────────────────────────────────────────────────────

export async function renderPdfRect(
  pdfPath: string,
  page: number,
  rect: { x1: number; y1: number; x2: number; y2: number },
): Promise<string> {
  // 1. Check disk cache
  const root = getRootPath();
  if (root) {
    const diskPath = rectCachePath(root, pdfPath, page, rect);
    if (await exists(diskPath)) {
      try {
        const bytes = await readFile(diskPath);
        const dataUrl = `data:image/png;base64,${uint8ToBase64(bytes)}`;
        memCache.set(memKey(pdfPath, page, rect), dataUrl);
        return dataUrl;
      } catch { /* fall through to render */ }
    }
  }

  // 2. Check memory cache
  const mk = memKey(pdfPath, page, rect);
  const cached = memCache.get(mk);
  if (cached) return cached;

  // 3. Load PDF and render
  const cachedDoc = getPdfDoc(pdfPath);
  let blobUrl: string | null = null;
  let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

  let pdfDoc: pdfjsLib.PDFDocumentProxy;
  if (cachedDoc) {
    pdfDoc = cachedDoc;
  } else {
    const bytes = await readFile(pdfPath);
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    blobUrl = URL.createObjectURL(blob);
    loadingTask = pdfjsLib.getDocument({ url: blobUrl });
    pdfDoc = await loadingTask.promise;
  }

  try {
    const pdfPage = await pdfDoc.getPage(page);
    const rotation = pdfPage.rotate || 0;
    const viewport = pdfPage.getViewport({ scale: RENDER_SCALE });

    // Create canvas for full page render
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = viewport.width;
    pageCanvas.height = viewport.height;
    const ctx = pageCanvas.getContext("2d")!;

    await pdfPage.render({ canvas: pageCanvas, canvasContext: ctx, viewport }).promise;

    // Calculate crop region in canvas pixels
    const pageWidth = pdfPage.view[2];   // width in PDF points
    const pageHeight = pdfPage.view[3];  // height in PDF points

    let cropLeft: number, cropTop: number, cropWidth: number, cropHeight: number;

    if (rotation === 90 || rotation === 270) {
      // Rotated: swap effective width/height for coordinate mapping
      cropLeft = (rect.y1) * RENDER_SCALE;
      cropTop = (pageWidth - rect.x2) * RENDER_SCALE;
      cropWidth = (rect.y2 - rect.y1) * RENDER_SCALE;
      cropHeight = (rect.x2 - rect.x1) * RENDER_SCALE;
    } else {
      // Normal orientation (0 or 180)
      cropLeft = (rect.x1) * RENDER_SCALE;
      cropTop = (pageHeight - rect.y2) * RENDER_SCALE;
      cropWidth = (rect.x2 - rect.x1) * RENDER_SCALE;
      cropHeight = (rect.y2 - rect.y1) * RENDER_SCALE;
    }

    // Clamp to canvas bounds
    cropLeft = Math.max(0, Math.floor(cropLeft));
    cropTop = Math.max(0, Math.floor(cropTop));
    cropWidth = Math.min(pageCanvas.width - cropLeft, Math.ceil(cropWidth));
    cropHeight = Math.min(pageCanvas.height - cropTop, Math.ceil(cropHeight));

    if (cropWidth <= 0 || cropHeight <= 0) {
      throw new Error("Invalid crop region");
    }

    // Crop from rendered canvas
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    const cropCtx = cropCanvas.getContext("2d")!;
    cropCtx.drawImage(
      pageCanvas,
      cropLeft, cropTop, cropWidth, cropHeight,
      0, 0, cropWidth, cropHeight,
    );

    // Encode to PNG data URL
    const dataUrl = cropCanvas.toDataURL("image/png");
    memCache.set(mk, dataUrl);

    // Write to disk cache (async, fire-and-forget)
    if (root) {
      void writeToDiskCache(root, pdfPath, page, rect, dataUrl);
    }

    return dataUrl;
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    if (loadingTask && !cachedDoc) void loadingTask.destroy();
  }
}

// ── Disk cache write ───────────────────────────────────────────────────────

async function writeToDiskCache(
  root: string,
  pdfPath: string,
  page: number,
  rect: { x1: number; y1: number; x2: number; y2: number },
  dataUrl: string,
): Promise<void> {
  try {
    const dir = rectCacheDir(root, pdfPath);
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }

    // Extract base64 from data URL
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    await writeFile(rectCachePath(root, pdfPath, page, rect), bytes);
  } catch (e) { console.warn("[pdf-rect-cache] write failed:", e); }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const CHUNK = 8192;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(chunks.join(""));
}
