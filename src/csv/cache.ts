/**
 * CSV spreadsheet cache — `.azprose/csv-cache/<name>.<hash>.json`
 *
 * One JSON per CSV, storing jspreadsheet data + styles in native format.
 * Used for fast reload + preserving styles across sessions.
 */

import { exists, readTextFile, writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { getRootPath } from "@/stores/root-path.svelte";
import { basename, joinPath } from "@/lib/paths-utils";

// ── Types ──────────────────────────────────────────────────────────────────

export type CsvCache = {
  version: 3;
  /** SHA-1–ish hash of the CSV content at time of last save (for drift detection). */
  csvHash: string;
  /** Jspreadsheet data array — `worksheet.getData()`. */
  data: (string | number | boolean)[][];
  /** Jspreadsheet styles — `worksheet.getStyle()` → `{ "A1": "css-string", ... }`. */
  styles: Record<string, string>;
  /** Column widths in pixels — `worksheet.getWidth()`. */
  columnWidths: number[];
  /** Column indices hidden via `hideColumn()`. */
  hiddenColumns: number[];
  /** Row indices hidden via `hideRow()`. */
  hiddenRows: number[];
  /** ISO-8601 timestamp of last cache write. */
  savedAt: string;
};

export type DriftStatus = "no-drift" | "csv-newer";

// ── Hash ───────────────────────────────────────────────────────────────────

/** Fast non-crypto hash (djb2) for change detection — not security. */
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

// ── Cache path ─────────────────────────────────────────────────────────────

function cacheDir(root: string): string {
  return joinPath(root, ".azprose/csv-cache");
}

/**
 * Derive a unique cache filename from the CSV path.
 * Pattern: `<basename>.<hash8>.json` where hash8 encodes the full path
 * so same-named files in different directories don't collide.
 */
function cacheFileName(csvPath: string): string {
  const base = basename(csvPath);
  const pathHash = djb2(csvPath).slice(0, 8);
  return `${base}.${pathHash}.json`;
}

function cachePath(csvPath: string, root: string): string {
  return joinPath(cacheDir(root), cacheFileName(csvPath));
}

// ── Read / Write ───────────────────────────────────────────────────────────

export async function readCache(csvPath: string): Promise<CsvCache | null> {
  const root = getRootPath();
  if (!root) return null;

  const path = cachePath(csvPath, root);
  if (!(await exists(path))) return null;

  try {
    const raw = await readTextFile(path);
    const parsed = JSON.parse(raw) as Partial<CsvCache>;
    if (parsed.version !== 3 || !Array.isArray(parsed.data)) return null;
    // Backward compat: v2 caches lack hidden arrays
    if (!Array.isArray(parsed.hiddenColumns)) parsed.hiddenColumns = [];
    if (!Array.isArray(parsed.hiddenRows)) parsed.hiddenRows = [];
    return parsed as CsvCache;
  } catch {
    return null;
  }
}

export async function writeCache(
  csvPath: string,
  data: (string | number | boolean)[][],
  styles: Record<string, string>,
  columnWidths: number[],
  hiddenColumns: number[],
  hiddenRows: number[],
  csvContent: string,
): Promise<void> {
  const root = getRootPath();
  if (!root) return;

  const dir = cacheDir(root);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }

  const cache: CsvCache = {
    version: 3,
    csvHash: djb2(csvContent),
    data,
    styles,
    columnWidths,
    hiddenColumns,
    hiddenRows,
    savedAt: new Date().toISOString(),
  };

  const path = cachePath(csvPath, root);
  await writeTextFile(path, JSON.stringify(cache, null, 2));
}

// ── Drift detection ────────────────────────────────────────────────────────

export async function detectDrift(
  csvPath: string,
  csvContent: string,
): Promise<{ status: DriftStatus; cache: CsvCache | null }> {
  const cache = await readCache(csvPath);
  if (!cache) return { status: "no-drift", cache: null };

  const currentHash = djb2(csvContent);

  // Hash match → no drift
  if (cache.csvHash === currentHash) {
    return { status: "no-drift", cache };
  }

  // Hash mismatch → always prefer CSV (user controls the source of truth)
  return { status: "csv-newer", cache };
}
