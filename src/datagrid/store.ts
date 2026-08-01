// ── IPC wrapper for SQLite-backed datagrid commands ────────────────────────

import { invoke } from "@tauri-apps/api/core";
import { getRootPath } from "@/stores/root-path.svelte";
import type {
  DatagridData,
  DatagridMeta,
  DatagridColumnDef,
  DatagridRow,
} from "./types";
import type { CellChange } from "@/spreadsheet/types";

function requireRoot(): string {
  const r = getRootPath();
  if (!r) throw new Error("rootPath not set");
  return r;
}

/** List all datagrids (metadata only, newest first). */
export async function datagridList(): Promise<DatagridMeta[]> {
  const root = requireRoot();
  return invoke("datagrid_list", { root });
}

/** Load a full datagrid (columns + rows). */
export async function datagridGet(id: string): Promise<DatagridData> {
  const root = requireRoot();
  return invoke("datagrid_get", { root, id });
}

/** Replace-all save: the caller always sends the complete snapshot. */
export async function datagridSave(
  id: string,
  name: string,
  columns: DatagridColumnDef[],
  rows: DatagridRow[],
): Promise<void> {
  const root = requireRoot();
  return invoke("datagrid_save", {
    root,
    id,
    name,
    columns: JSON.stringify(columns),
    rows: JSON.stringify(rows),
  });
}

/** Create a new datagrid snapshot from an existing spreadsheet. */
export async function datagridCreateFromSpreadsheet(
  id: string,
  name: string,
  spreadsheetId: string,
): Promise<string> {
  const root = requireRoot();
  return invoke("datagrid_create_from_spreadsheet", {
    root,
    id,
    gridName: name,
    spreadsheetId,
  });
}

/** Delete a datagrid (cascades to columns and rows). */
export async function datagridDelete(id: string): Promise<void> {
  const root = requireRoot();
  return invoke("datagrid_delete", { root, id });
}

/** Rename a datagrid. */
export async function datagridRename(id: string, name: string): Promise<void> {
  const root = requireRoot();
  return invoke("datagrid_rename", { root, id, name });
}

/**
 * Find the datagrid derived from a given spreadsheet (live bridge).
 * Returns null when the spreadsheet has no linked grid.
 */
export async function datagridFindBySource(
  spreadsheetId: string,
): Promise<DatagridMeta | null> {
  const root = requireRoot();
  return invoke("datagrid_find_by_source", { root, spreadsheetId });
}

/**
 * Re-sync a linked datagrid from its source spreadsheet content.
 * Returns the re-synced grid id, or null when no grid is linked.
 */
export async function datagridSyncFromSpreadsheet(
  spreadsheetId: string,
): Promise<string | null> {
  const root = requireRoot();
  return invoke("datagrid_sync_from_spreadsheet", { root, spreadsheetId });
}

/**
 * Incremental live bridge: mirror a batch of cell edits into the linked
 * datagrid — O(changes), no full rebuild. Skipped cells (out-of-bounds)
 * are handled by the structural sync (`datagridSyncFromSpreadsheet`).
 */
export async function datagridSyncCells(
  spreadsheetId: string,
  changes: CellChange[],
): Promise<void> {
  const root = requireRoot();
  return invoke("datagrid_sync_cells", {
    root,
    spreadsheetId,
    changes: JSON.stringify(changes),
  });
}
