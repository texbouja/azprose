import type { PDFDocumentProxy } from "pdfjs-dist";

interface PdfCacheEntry {
  data: Uint8Array;
  page: number;
  scale: number;
  rev: number;
}

const cache = new Map<string, PdfCacheEntry>();

export function getPdfCache(path: string): PdfCacheEntry | undefined {
  return cache.get(path);
}

export function setPdfCache(path: string, entry: PdfCacheEntry): void {
  cache.set(path, entry);
}

export function updatePdfPage(path: string, page: number): void {
  const entry = cache.get(path);
  if (entry) entry.page = page;
}

export function invalidatePdfCache(path: string): void {
  cache.delete(path);
}

// ── Shared PDFDocumentProxy cache ──────────────────────────────────────────
// PdfViewer registers its loaded doc; renderPdfRect reuses it to avoid
// loading a second document on the same worker (which causes white pages).

const docCache = new Map<string, PDFDocumentProxy>();

export function setPdfDoc(path: string, doc: PDFDocumentProxy): void {
  docCache.set(path, doc);
}

export function getPdfDoc(path: string): PDFDocumentProxy | undefined {
  return docCache.get(path);
}

export function deletePdfDoc(path: string): void {
  docCache.delete(path);
}
