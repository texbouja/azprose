// ── IPC wrapper for SQLite-backed datagrid commands ────────────────────────
// v8 model: a datagrid is a VIEW over a source spreadsheet. The data lives in
// spreadsheet_cells (shared with the tableur); the grid only persists per-view
// column config (width/hidden + per-column filter rules). There is no
// duplicated snapshot and no bridge to keep in sync — writes land directly in
// the shared table, reads are live.

import { invoke } from "@tauri-apps/api/core";
import { getRootPath } from "@/stores/root-path.svelte";
import type {
  DatagridData,
  DatagridMeta,
  DatagridColumnDef,
  StackFilterRule,
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

/** Load a full datagrid VIEW (columns joined from the source spreadsheet,
 *  rows built live from spreadsheet_cells). */
export async function datagridGet(id: string): Promise<DatagridData> {
  const root = requireRoot();
  return invoke("datagrid_get", { root, id });
}

/** Save the VIEW config only (name + per-column width/hidden + filter rules).
 *  The data is never part of the payload — it lives in spreadsheet_cells. */
export async function datagridSave(
  id: string,
  name: string,
  columns: DatagridColumnDef[],
): Promise<void> {
  const root = requireRoot();
  return invoke("datagrid_save", {
    root,
    id,
    name,
    columns: JSON.stringify(columns),
  });
}

/** Create a new datagrid VIEW over an existing spreadsheet (copies column
 *  widths as initial view config, never the data). */
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

/** Delete a datagrid VIEW. The source spreadsheet — data included — survives. */
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
 * Find the datagrid view derived from a given spreadsheet.
 * Returns null when the spreadsheet has no linked grid.
 */
export async function datagridFindBySource(
  spreadsheetId: string,
): Promise<DatagridMeta | null> {
  const root = requireRoot();
  return invoke("datagrid_find_by_source", { root, spreadsheetId });
}

/**
 * Write a batch of cell edits from the datagrid VIEW straight into the source
 * spreadsheet's own cells (`spreadsheet_cells`) — the shared source of truth,
 * O(changes) native upsert. The tableur sees the edit on its next load; there
 * is no bridge to go stale. Out-of-bounds columns are skipped.
 */
export async function datagridSaveCells(
  id: string,
  changes: CellChange[],
): Promise<void> {
  const root = requireRoot();
  return invoke("datagrid_save_cells", {
    root,
    id,
    changes: JSON.stringify(changes),
  });
}

/** List the STACK-wide filter rules (unified filter widget, v10). */
export async function datagridStackRulesGet(): Promise<StackFilterRule[]> {
  const root = requireRoot();
  return invoke("datagrid_stack_rules_get", { root });
}

/** Replace-all save of the STACK-wide filter rules. The frontend always sends
 *  the complete snapshot, so dropped rules (e.g. cleared by the user) are
 *  deleted. */
export async function datagridStackRulesSave(
  rules: StackFilterRule[],
): Promise<void> {
  const root = requireRoot();
  return invoke("datagrid_stack_rules_save", {
    root,
    rules: JSON.stringify(rules),
  });
}
