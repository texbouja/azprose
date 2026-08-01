// ── IPC wrapper for SQLite-backed spreadsheet commands ─────────────────────

import { invoke } from "@tauri-apps/api/core";
import { getRootPath } from "@/stores/root-path.svelte";
import type { SpreadsheetData, SpreadsheetMeta, ColumnDef, SpreadsheetViewState } from "./types";

function requireRoot(): string {
  const r = getRootPath();
  if (!r) throw new Error("rootPath not set");
  return r;
}

/** Create a new spreadsheet from parsed data. Returns the id. */
export async function spreadsheetCreate(
  id: string,
  name: string,
  columns: ColumnDef[],
  data: string[][],
  originalPath?: string,
): Promise<string> {
  const root = requireRoot();
  return invoke("spreadsheet_create", {
    root,
    id,
    name,
    originalPath: originalPath ?? null,
    columns: JSON.stringify(columns),
    data: JSON.stringify(data),
  });
}

/** Get full spreadsheet data for display. */
export async function spreadsheetGet(id: string): Promise<SpreadsheetData> {
  const root = requireRoot();
  return invoke("spreadsheet_get", { root, id });
}

/** List all spreadsheets (metadata only). */
export async function spreadsheetList(): Promise<SpreadsheetMeta[]> {
  const root = requireRoot();
  return invoke("spreadsheet_list", { root });
}

/** Rename a spreadsheet. */
export async function spreadsheetRename(id: string, name: string): Promise<void> {
  const root = requireRoot();
  return invoke("spreadsheet_rename", { root, id, name });
}

/** Delete a spreadsheet and all associated data. */
export async function spreadsheetDelete(id: string): Promise<void> {
  const root = requireRoot();
  return invoke("spreadsheet_delete", { root, id });
}

/** Full save on tab close: replaces all cells, columns, and state. */
export async function spreadsheetSaveAll(
  id: string,
  columns: ColumnDef[],
  data: string[][],
  viewState: SpreadsheetViewState,
): Promise<void> {
  const root = requireRoot();
  return invoke("spreadsheet_save_all", {
    root,
    id,
    columns: JSON.stringify(columns),
    data: JSON.stringify(data),
    viewState: JSON.stringify(viewState),
  });
}

/**
 * Eagerly initialize the SQLite database for a given root path.
 * Called at app startup so the first real spreadsheet operation is fast.
 * This is intentionally a fire-and-forget: errors are silently logged
 * because any subsequent real command will trigger init again anyway.
 */
export async function spreadsheetInitDb(root: string): Promise<void> {
  try {
    await invoke("spreadsheet_init_db", { root });
  } catch (err) {
    console.warn("[spreadsheet] eager DB init failed, will retry on first access", err);
  }
}

/** Export spreadsheet to CSV at given path. */
export async function spreadsheetExportCsv(id: string, path: string): Promise<void> {
  const root = requireRoot();
  return invoke("spreadsheet_export_csv", { root, id, path });
}
