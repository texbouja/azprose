/**
 * PDF annotation store — `.azprose/pdf/annotation/<basename>.json`
 *
 * One JSON per PDF, storing annotations (rect, highlight, text-note, ink, stamp).
 * Annotations are overlays — the original PDF is never modified.
 */

import { exists, readTextFile, writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { getRootPath } from "@/stores/root-path.svelte";
import { basename, joinPath } from "@/lib/paths-utils";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PdfRect {
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface PdfAnnotation {
  id: string;
  type: "rect" | "highlight" | "text-note" | "ink" | "stamp";
  page: number;
  rect: PdfRect;
  color?: string;
  content?: string;
  width?: number;
  createdAt: string;
}

interface AnnotationFile {
  version: 1;
  filePath: string;
  annotations: PdfAnnotation[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function annotationDir(root: string): string {
  return joinPath(root, ".azprose/pdf/annotation");
}

function annotationPath(pdfPath: string, root: string): string {
  const base = basename(pdfPath);
  return joinPath(annotationDir(root), `${base}.json`);
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function loadAnnotations(pdfPath: string): Promise<PdfAnnotation[]> {
  const root = getRootPath();
  if (!root) return [];

  const path = annotationPath(pdfPath, root);
  if (!(await exists(path))) return [];

  try {
    const raw = await readTextFile(path);
    const parsed = JSON.parse(raw) as Partial<AnnotationFile>;
    if (parsed.version !== 1 || !Array.isArray(parsed.annotations)) return [];
    return parsed.annotations;
  } catch {
    return [];
  }
}

// ── Write ──────────────────────────────────────────────────────────────────

export async function saveAnnotation(
  pdfPath: string,
  ann: PdfAnnotation,
): Promise<void> {
  const root = getRootPath();
  if (!root) return;

  const dir = annotationDir(root);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }

  const existing = await loadAnnotations(pdfPath);
  const idx = existing.findIndex((a) => a.id === ann.id);
  if (idx >= 0) {
    existing[idx] = ann;
  } else {
    existing.push(ann);
  }

  const file: AnnotationFile = {
    version: 1,
    filePath: pdfPath,
    annotations: existing,
  };

  await writeTextFile(annotationPath(pdfPath, root), JSON.stringify(file, null, 2));
}

export async function deleteAnnotation(
  pdfPath: string,
  id: string,
): Promise<void> {
  const root = getRootPath();
  if (!root) return;

  const existing = await loadAnnotations(pdfPath);
  const filtered = existing.filter((a) => a.id !== id);
  if (filtered.length === existing.length) return;

  const file: AnnotationFile = {
    version: 1,
    filePath: pdfPath,
    annotations: filtered,
  };

  const path = annotationPath(pdfPath, root);
  if (filtered.length === 0) {
    // Remove file if no annotations left
    try {
      const { remove } = await import("@tauri-apps/plugin-fs");
      await remove(path);
    } catch { /* ignore */ }
    return;
  }

  await writeTextFile(path, JSON.stringify(file, null, 2));
}
