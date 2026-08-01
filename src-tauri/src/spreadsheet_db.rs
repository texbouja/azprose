// ── Spreadsheet SQLite backend ─────────────────────────────────────────────
// Tables: spreadsheets, spreadsheet_columns, spreadsheet_cells, spreadsheet_state
// Connection + migrations are shared via `crate::db`.

use crate::db::{Db, with_db};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::State;

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct SpreadsheetMeta {
    pub id: String,
    pub name: String,
    pub original_path: Option<String>,
    pub lazy_type: Option<String>,
    pub imported_at: String,
    pub updated_at: String,
}

/// One cell edit: coordinates come straight from the jspreadsheet `onchange`
/// callback (col, row, value) — no diff needed, no O(R×C) snapshot.
#[derive(Serialize, Deserialize, Clone)]
pub struct CellChange {
    pub row_index: i32,
    pub col_index: i32,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SpreadsheetData {
    pub id: String,
    pub name: String,
    pub original_path: Option<String>,
    pub columns: Vec<ColumnDef>,
    pub data: Vec<Vec<String>>,
    pub state: SpreadsheetViewState,
    pub imported_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ColumnDef {
    pub title: String,
    #[serde(default = "default_width")]
    pub width: i32,
    #[serde(rename = "type")]
    #[serde(default = "default_col_type")]
    pub col_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<String>,
}

fn default_width() -> i32 {
    120
}
fn default_col_type() -> String {
    "text".to_string()
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SpreadsheetViewState {
    #[serde(default = "default_hidden")]
    pub hidden_columns: String,
    #[serde(default = "default_hidden")]
    pub hidden_rows: String,
    #[serde(default)]
    pub frozen_columns: i32,
    #[serde(default)]
    pub frozen_rows: i32,
    #[serde(default)]
    pub sort_column: Option<i32>,
    #[serde(default)]
    pub sort_order: Option<String>,
    #[serde(default = "default_styles")]
    pub styles: String,
}

fn default_hidden() -> String {
    "[]".to_string()
}
fn default_styles() -> String {
    "{}".to_string()
}

impl Default for SpreadsheetViewState {
    fn default() -> Self {
        Self {
            hidden_columns: "[]".to_string(),
            hidden_rows: "[]".to_string(),
            frozen_columns: 0,
            frozen_rows: 0,
            sort_column: None,
            sort_order: None,
            styles: "{}".to_string(),
        }
    }
}

// ── Commands ───────────────────────────────────────────────────────────────

/// Create a new spreadsheet from parsed data.
/// Frontend passes a UUID (via `crypto.randomUUID()`), name, columns JSON, and data JSON.
#[tauri::command]
pub fn spreadsheet_create(
    state: State<'_, Db>,
    root: String,
    id: String,
    name: String,
    original_path: Option<String>,
    columns: String,
    data: String,
) -> Result<String, String> {
    let cols: Vec<ColumnDef> =
        serde_json::from_str(&columns).map_err(|e| format!("invalid columns JSON: {e}"))?;
    let rows: Vec<Vec<String>> =
        serde_json::from_str(&data).map_err(|e| format!("invalid data JSON: {e}"))?;

    let now = chrono::Utc::now().to_rfc3339();

    with_db(&state, &root, |conn| {
        conn.execute(
            "INSERT INTO spreadsheets (id, name, original_path, imported_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, name, original_path, now, now],
        )
        .map_err(|e| e.to_string())?;

        // Insert columns
        for (i, col) in cols.iter().enumerate() {
            conn.execute(
                "INSERT INTO spreadsheet_columns (spreadsheet_id, col_index, title, width, type, options)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, i as i32, col.title, col.width, col.col_type, col.options],
            )
            .map_err(|e| e.to_string())?;
        }

        // Insert cells in bulk
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt = tx
                .prepare(
                    "INSERT OR REPLACE INTO spreadsheet_cells (spreadsheet_id, row_index, col_index, value)
                     VALUES (?1, ?2, ?3, ?4)",
                )
                .map_err(|e| e.to_string())?;
            for (r, row) in rows.iter().enumerate() {
                for (c, val) in row.iter().enumerate() {
                    stmt.execute(params![id, r as i32, c as i32, val])
                        .map_err(|e| e.to_string())?;
                }
            }
        }
        tx.commit().map_err(|e| e.to_string())?;

        // Initialize view state
        conn.execute(
            "INSERT OR REPLACE INTO spreadsheet_state (spreadsheet_id) VALUES (?1)",
            params![id],
        )
        .map_err(|e| e.to_string())?;

        Ok(id)
    })
}

/// Rebuild the 2D data matrix from the column defs + stored cells.
/// Dimensions: `columns.len()` columns × (max row index + 1) rows.
/// Cells outside the column bounds are dropped (defensive — save paths keep
/// columns and cells consistent, but a partial write must not panic the get).
fn build_matrix(columns: &[ColumnDef], cells: &[(i32, i32, String, String)]) -> Vec<Vec<String>> {
    let max_row = cells.iter().map(|c| c.0).max().unwrap_or(0) as usize;
    let num_cols = columns.len();
    let mut data: Vec<Vec<String>> = vec![vec![String::new(); num_cols]; max_row + 1];
    for (r, c, val, _style) in cells {
        if *r as usize <= max_row && (*c as usize) < num_cols {
            data[*r as usize][*c as usize] = val.clone();
        }
    }
    data
}

/// Get full spreadsheet data for display.
#[tauri::command]
pub fn spreadsheet_get(
    state: State<'_, Db>,
    root: String,
    id: String,
) -> Result<SpreadsheetData, String> {
    with_db(&state, &root, |conn| {
        // Metadata
        let mut meta_stmt = conn
            .prepare("SELECT id, name, original_path, imported_at, updated_at FROM spreadsheets WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let meta = meta_stmt
            .query_row(params![id], |row| {
                Ok(SpreadsheetMeta {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    original_path: row.get(2)?,
                    lazy_type: None,
                    imported_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .map_err(|e| format!("spreadsheet not found: {e}"))?;

        // Columns
        let mut col_stmt = conn
            .prepare("SELECT title, width, type, options FROM spreadsheet_columns WHERE spreadsheet_id = ?1 ORDER BY col_index")
            .map_err(|e| e.to_string())?;
        let columns: Vec<ColumnDef> = col_stmt
            .query_map(params![id], |row| {
                Ok(ColumnDef {
                    title: row.get(0)?,
                    width: row.get::<_, Option<i32>>(1)?.unwrap_or(120),
                    col_type: row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "text".to_string()),
                    options: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        // Cells — build data matrix
        let mut cell_stmt = conn
            .prepare("SELECT row_index, col_index, value, style FROM spreadsheet_cells WHERE spreadsheet_id = ?1 ORDER BY row_index, col_index")
            .map_err(|e| e.to_string())?;
        let cells: Vec<(i32, i32, String, String)> = cell_stmt
            .query_map(params![id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        // Build matrix: determine dimensions from columns + max row index
        let data = build_matrix(&columns, &cells);

        // View state
        let mut state_stmt = conn
            .prepare("SELECT hidden_columns, hidden_rows, frozen_columns, frozen_rows, sort_column, sort_order, styles FROM spreadsheet_state WHERE spreadsheet_id = ?1")
            .map_err(|e| e.to_string())?;
        let view_state: SpreadsheetViewState = state_stmt
            .query_row(params![id], |row| {
                Ok(SpreadsheetViewState {
                    hidden_columns: row.get::<_, Option<String>>(0)?.unwrap_or_else(|| "[]".to_string()),
                    hidden_rows: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "[]".to_string()),
                    frozen_columns: row.get::<_, Option<i32>>(2)?.unwrap_or(0),
                    frozen_rows: row.get::<_, Option<i32>>(3)?.unwrap_or(0),
                    sort_column: row.get(4)?,
                    sort_order: row.get(5)?,
                    styles: row.get::<_, Option<String>>(6)?.unwrap_or_else(|| "{}".to_string()),
                })
            })
            .unwrap_or_default();

        Ok(SpreadsheetData {
            id: meta.id,
            name: meta.name,
            original_path: meta.original_path,
            columns,
            data,
            state: view_state,
            imported_at: meta.imported_at,
            updated_at: meta.updated_at,
        })
    })
}

/// List all spreadsheets (metadata only).
#[tauri::command]
pub fn spreadsheet_list(
    state: State<'_, Db>,
    root: String,
) -> Result<Vec<SpreadsheetMeta>, String> {
    with_db(&state, &root, |conn| {
        let mut stmt = conn
            .prepare("SELECT id, name, original_path, lazy_type, imported_at, updated_at FROM spreadsheets ORDER BY updated_at DESC")
            .map_err(|e| e.to_string())?;
        let metas = stmt
            .query_map([], |row| {
                Ok(SpreadsheetMeta {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    original_path: row.get(2)?,
                    lazy_type: row.get(3)?,
                    imported_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(metas)
    })
}

/// Rename a spreadsheet.
#[tauri::command]
pub fn spreadsheet_rename(
    state: State<'_, Db>,
    root: String,
    id: String,
    name: String,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    with_db(&state, &root, |conn| {
        conn.execute(
            "UPDATE spreadsheets SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, now, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Delete a spreadsheet and all associated data.
#[tauri::command]
pub fn spreadsheet_delete(
    state: State<'_, Db>,
    root: String,
    id: String,
) -> Result<(), String> {
    with_db(&state, &root, |conn| {
        // CASCADE should handle children, but be explicit for clarity
        conn.execute("DELETE FROM spreadsheet_state WHERE spreadsheet_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM spreadsheet_cells WHERE spreadsheet_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM spreadsheet_columns WHERE spreadsheet_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM spreadsheets WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Replace-all save: makes the tables EXACTLY match the snapshot.
///
/// Same contract as calendar_events_save / datagrid_save: the frontend always
/// sends the complete snapshot (columns + cells + state), so any row/column
/// missing from the payload is deleted. This is what makes structural edits
/// (added/deleted/moved/resized columns, renamed headers, added/deleted rows)
/// persist — an incremental cell diff would never touch `spreadsheet_columns`.
/// Exposed as a pure function for unit tests.
fn save_all(
    conn: &mut rusqlite::Connection,
    id: &str,
    cols: &[ColumnDef],
    rows: &[Vec<String>],
    vs: &SpreadsheetViewState,
) -> Result<(), String> {
    let now = crate::db::now_iso();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Replace columns
    tx.execute("DELETE FROM spreadsheet_columns WHERE spreadsheet_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO spreadsheet_columns (spreadsheet_id, col_index, title, width, type, options)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .map_err(|e| e.to_string())?;
        for (i, col) in cols.iter().enumerate() {
            stmt.execute(params![id, i as i32, col.title, col.width, col.col_type, col.options])
                .map_err(|e| e.to_string())?;
        }
    }

    // Replace cells
    tx.execute("DELETE FROM spreadsheet_cells WHERE spreadsheet_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO spreadsheet_cells (spreadsheet_id, row_index, col_index, value)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .map_err(|e| e.to_string())?;
        for (r, row) in rows.iter().enumerate() {
            for (c, val) in row.iter().enumerate() {
                stmt.execute(params![id, r as i32, c as i32, val])
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    // Update state + timestamp
    conn.execute(
        "INSERT OR REPLACE INTO spreadsheet_state (spreadsheet_id, hidden_columns, hidden_rows, frozen_columns, frozen_rows, sort_column, sort_order, styles)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            vs.hidden_columns,
            vs.hidden_rows,
            vs.frozen_columns,
            vs.frozen_rows,
            vs.sort_column,
            vs.sort_order,
            vs.styles,
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE spreadsheets SET updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Incremental cell save: upsert each edited cell with a native
/// `ON CONFLICT … DO UPDATE` — O(changes), no DELETE-all, no table rewrite.
///
/// Contract with the frontend: cell edits come from the jspreadsheet
/// `onchange` callback which provides exact (row, col, value) coordinates,
/// so there is nothing to diff — the DB follows every single edit.
/// Structural edits are NOT handled here: they go to `save_structure`
/// (a missing structure save is exactly the bug that lost added columns).
///
/// The frontend flushes BOTH (cells then structure) together on every
/// change batch, so a mid-edit crash can only lose the very last edits.
fn save_cells(
    conn: &mut rusqlite::Connection,
    id: &str,
    changes: &[CellChange],
) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO spreadsheet_cells (spreadsheet_id, row_index, col_index, value)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(spreadsheet_id, row_index, col_index)
                 DO UPDATE SET value = excluded.value",
            )
            .map_err(|e| e.to_string())?;
        for ch in changes {
            stmt.execute(params![id, ch.row_index, ch.col_index, ch.value])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE spreadsheets SET updated_at = ?1 WHERE id = ?2",
        params![crate::db::now_iso(), id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Structural save: replace-all columns + view state (same replace-all
/// contract as `save_all` for the structural tables), then garbage-collect
/// orphan cells — rows beyond `num_rows` and columns beyond the new column
/// list must not survive (deleted rows / deleted columns).
///
/// O(columns + orphans): column count is small and orphan cleanup is a
/// bounded DELETE, so this stays cheap even on huge sheets.
fn save_structure(
    conn: &mut rusqlite::Connection,
    id: &str,
    cols: &[ColumnDef],
    num_rows: usize,
    vs: &SpreadsheetViewState,
) -> Result<(), String> {
    let now = crate::db::now_iso();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Replace columns (exact same contract as save_all)
    tx.execute("DELETE FROM spreadsheet_columns WHERE spreadsheet_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO spreadsheet_columns (spreadsheet_id, col_index, title, width, type, options)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .map_err(|e| e.to_string())?;
        for (i, col) in cols.iter().enumerate() {
            stmt.execute(params![id, i as i32, col.title, col.width, col.col_type, col.options])
                .map_err(|e| e.to_string())?;
        }
    }

    // Orphan cells: rows beyond num_rows or columns beyond cols.len()
    tx.execute(
        "DELETE FROM spreadsheet_cells WHERE spreadsheet_id = ?1
         AND (row_index >= ?2 OR col_index >= ?3)",
        params![id, num_rows as i32, cols.len() as i32],
    )
    .map_err(|e| e.to_string())?;

    // View state (replace-all, exact same contract as save_all)
    tx.execute(
        "INSERT OR REPLACE INTO spreadsheet_state (spreadsheet_id, hidden_columns, hidden_rows, frozen_columns, frozen_rows, sort_column, sort_order, styles)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            vs.hidden_columns,
            vs.hidden_rows,
            vs.frozen_columns,
            vs.frozen_rows,
            vs.sort_column,
            vs.sort_order,
            vs.styles,
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE spreadsheets SET updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Full save on tab close: replaces all cells, columns, and state.
#[tauri::command]
pub fn spreadsheet_save_all(
    state: State<'_, Db>,
    root: String,
    id: String,
    columns: String,
    data: String,
    view_state: String,
) -> Result<(), String> {
    let cols: Vec<ColumnDef> =
        serde_json::from_str(&columns).map_err(|e| format!("invalid columns JSON: {e}"))?;
    let rows: Vec<Vec<String>> =
        serde_json::from_str(&data).map_err(|e| format!("invalid data JSON: {e}"))?;
    let vs: SpreadsheetViewState =
        serde_json::from_str(&view_state).map_err(|e| format!("invalid state JSON: {e}"))?;

    with_db(&state, &root, |conn| save_all(conn, &id, &cols, &rows, &vs))
}

/// Incremental cell save (upsert by coordinates).
#[tauri::command]
pub fn spreadsheet_save_cells(
    state: State<'_, Db>,
    root: String,
    id: String,
    changes: String,
) -> Result<(), String> {
    let changes: Vec<CellChange> =
        serde_json::from_str(&changes).map_err(|e| format!("invalid changes JSON: {e}"))?;
    with_db(&state, &root, |conn| save_cells(conn, &id, &changes))
}

/// Structural save: columns replace-all + orphan cleanup + view state.
#[tauri::command]
pub fn spreadsheet_save_structure(
    state: State<'_, Db>,
    root: String,
    id: String,
    columns: String,
    num_rows: usize,
    view_state: String,
) -> Result<(), String> {
    let cols: Vec<ColumnDef> =
        serde_json::from_str(&columns).map_err(|e| format!("invalid columns JSON: {e}"))?;
    let vs: SpreadsheetViewState =
        serde_json::from_str(&view_state).map_err(|e| format!("invalid state JSON: {e}"))?;
    with_db(&state, &root, |conn| {
        save_structure(conn, &id, &cols, num_rows, &vs)
    })
}

/// Eagerly initialize the SQLite database (called at app startup so the
/// first user spreadsheet interaction doesn't trigger a slow full init).
#[tauri::command]
pub fn spreadsheet_init_db(
    state: State<'_, Db>,
    root: String,
) -> Result<(), String> {
    with_db(&state, &root, |_conn| Ok(()))
}

/// Export spreadsheet to CSV at given path.
#[tauri::command]
pub fn spreadsheet_export_csv(
    state: State<'_, Db>,
    root: String,
    id: String,
    path: String,
) -> Result<(), String> {
    with_db(&state, &root, |conn| {
        // Get columns count
        let num_cols: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM spreadsheet_columns WHERE spreadsheet_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        // Get cells
        let mut stmt = conn
            .prepare(
                "SELECT row_index, col_index, value FROM spreadsheet_cells WHERE spreadsheet_id = ?1 ORDER BY row_index, col_index",
            )
            .map_err(|e| e.to_string())?;
        let cells: Vec<(i32, i32, String)> = stmt
            .query_map(params![id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let max_row = cells.iter().map(|c| c.0).max().unwrap_or(0) as usize;
        let cols = num_cols as usize;

        // Build matrix
        let mut data: Vec<Vec<String>> = vec![vec![String::new(); cols]; max_row + 1];
        for (r, c, val) in &cells {
            if *r as usize <= max_row && (*c as usize) < cols {
                data[*r as usize][*c as usize] = val.clone();
            }
        }

        // Serialize to CSV
        let csv_content = data
            .iter()
            .map(|row| {
                row.iter()
                    .map(|cell| {
                        let s = cell.as_str();
                        if s.contains(',') || s.contains('"') || s.contains('\n') {
                            format!("\"{}\"", s.replace('"', "\"\""))
                        } else {
                            s.to_string()
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(",")
            })
            .collect::<Vec<_>>()
            .join("\n");

        // Atomic write
        if let Some(parent) = Path::new(&path).parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let tmp = format!("{}.tmp", &path);
        fs::write(&tmp, &csv_content).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &path).map_err(|e| e.to_string())?;

        Ok(())
    })
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Fresh schema: SCHEMA_V1 (spreadsheet tables) + the v2 `styles` column
    /// migration (mirror of production init_db), so spreadsheet_state accepts
    /// the styles field that save_all writes.
    fn test_schema(conn: &rusqlite::Connection) {
        conn.execute_batch(crate::db::SCHEMA_V1).unwrap();
        conn.execute_batch(
            "ALTER TABLE spreadsheet_state ADD COLUMN styles TEXT DEFAULT '{}';",
        )
        .unwrap();
    }

    fn seed_sheet(conn: &rusqlite::Connection, id: &str) {
        let now = crate::db::now_iso();
        conn.execute(
            "INSERT INTO spreadsheets (id, name, imported_at, updated_at) VALUES (?1, 'S', ?2, ?2)",
            params![id, now],
        )
        .unwrap();
    }

    fn col(title: &str, width: i32, col_type: &str) -> ColumnDef {
        ColumnDef {
            title: title.to_string(),
            width,
            col_type: col_type.to_string(),
            options: None,
        }
    }

    fn state() -> SpreadsheetViewState {
        SpreadsheetViewState::default()
    }

    fn count(conn: &rusqlite::Connection, table: &str, id: &str) -> i64 {
        conn.query_row(
            &format!("SELECT COUNT(*) FROM {table} WHERE spreadsheet_id = '{}'", id),
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap()
    }

    /// Regression test: a snapshot with MORE columns than before must persist
    /// the added column AND its cell values (the old incremental cell-diff
    /// saved values but never spreadsheet_columns, so added columns vanished
    /// on reload because spreadsheet_get rebuilt the matrix with the stale
    /// column count).
    #[test]
    fn save_all_persists_added_column_with_values() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_sheet(&conn, "s1");

        // 2 columns, 1 row of data
        let cols = vec![col("Nom", 150, "text"), col("Note", 100, "number")];
        let rows = vec![vec!["Alice".to_string(), "15".to_string()]];
        save_all(&mut conn, "s1", &cols, &rows, &state()).unwrap();
        assert_eq!(count(&conn, "spreadsheet_columns", "s1"), 2);
        assert_eq!(count(&conn, "spreadsheet_cells", "s1"), 2);

        // User adds a 3rd column and fills it — full snapshot now has 3 cols
        let cols = vec![
            col("Nom", 150, "text"),
            col("Note", 100, "number"),
            col("Salle", 120, "text"),
        ];
        let rows = vec![vec![
            "Alice".to_string(),
            "15".to_string(),
            "A103".to_string(),
        ]];
        save_all(&mut conn, "s1", &cols, &rows, &state()).unwrap();

        assert_eq!(
            count(&conn, "spreadsheet_columns", "s1"),
            3,
            "added column must be persisted in spreadsheet_columns"
        );
        // The value of the added column must be readable back
        let value: String = conn
            .query_row(
                "SELECT value FROM spreadsheet_cells
                 WHERE spreadsheet_id = 's1' AND row_index = 0 AND col_index = 2",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(value, "A103");
    }

    /// Replace-all contract: a column removed from the snapshot must not
    /// survive — same regression as calendar/datagrid replace-all saves.
    #[test]
    fn save_all_removes_deleted_column() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_sheet(&conn, "s1");

        let cols = vec![col("A", 120, "text"), col("B", 120, "text")];
        let rows = vec![vec!["x".to_string(), "y".to_string()]];
        save_all(&mut conn, "s1", &cols, &rows, &state()).unwrap();
        assert_eq!(count(&conn, "spreadsheet_columns", "s1"), 2);

        // User deletes column B in the UI → snapshot shrinks to 1 column
        let cols = vec![col("A", 120, "text")];
        let rows = vec![vec!["x".to_string()]];
        save_all(&mut conn, "s1", &cols, &rows, &state()).unwrap();

        assert_eq!(
            count(&conn, "spreadsheet_columns", "s1"),
            1,
            "deleted column must not survive a save"
        );
        assert_eq!(
            count(&conn, "spreadsheet_cells", "s1"),
            1,
            "cells of deleted column must not survive"
        );
    }

    /// Empty snapshot clears cells but keeps the sheet + state row.
    #[test]
    fn save_all_with_empty_snapshot_clears_tables() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_sheet(&conn, "s1");

        let cols = vec![col("A", 120, "text")];
        let rows = vec![vec!["x".to_string()]];
        save_all(&mut conn, "s1", &cols, &rows, &state()).unwrap();

        save_all(&mut conn, "s1", &[], &[], &state()).unwrap();
        assert_eq!(count(&conn, "spreadsheet_columns", "s1"), 0);
        assert_eq!(count(&conn, "spreadsheet_cells", "s1"), 0);
    }

    /// Full round-trip through the exact storage path used by `spreadsheet_get`:
    /// save_all writes → read cells back → build_matrix → must equal the
    /// original snapshot. Proves the "no persistence" symptom cannot come
    /// from the SQLite layer (columns + cells stay consistent).
    #[test]
    fn save_all_roundtrip_preserves_data_and_structure() {        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_sheet(&conn, "s1");

        let cols = vec![
            col("Nom", 150, "text"),
            col("Note", 100, "number"),
            col("Salle", 120, "text"),
        ];
        let rows = vec![
            vec!["Alice".to_string(), "15".to_string(), "A103".to_string()],
            vec!["Bob".to_string(), "12".to_string(), String::new()],
            vec![String::new(), String::new(), String::new()],
        ];
        save_all(&mut conn, "s1", &cols, &rows, &state()).unwrap();

        // Replicate spreadsheet_get's read path: columns + cells ordered.
        let col_defs: Vec<ColumnDef> = {
            let mut stmt = conn
                .prepare("SELECT title, width, type, options FROM spreadsheet_columns WHERE spreadsheet_id = 's1' ORDER BY col_index")
                .unwrap();
            stmt.query_map([], |row| {
                Ok(ColumnDef {
                    title: row.get(0)?,
                    width: row.get::<_, Option<i32>>(1)?.unwrap_or(120),
                    col_type: row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "text".to_string()),
                    options: row.get(3)?,
                })
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
        };
        let cells: Vec<(i32, i32, String, String)> = {
            let mut stmt = conn
                .prepare("SELECT row_index, col_index, value, style FROM spreadsheet_cells WHERE spreadsheet_id = 's1' ORDER BY row_index, col_index")
                .unwrap();
            stmt.query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                ))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
        };

        let rebuilt = build_matrix(&col_defs, &cells);
        assert_eq!(rebuilt, rows, "round-trip must return the original matrix");
        assert_eq!(rebuilt.len(), 3, "trailing empty rows must be preserved");
        assert_eq!(rebuilt[0].len(), 3, "added columns must be preserved");
        assert_eq!(rebuilt[0][2], "A103");
        assert_eq!(rebuilt[1][2], "");
    }

    fn cell(row: i32, col: i32, value: &str) -> CellChange {
        CellChange {
            row_index: row,
            col_index: col,
            value: value.to_string(),
        }
    }

    fn value_at(conn: &rusqlite::Connection, id: &str, row: i32, col: i32) -> Option<String> {
        conn.query_row(
            "SELECT value FROM spreadsheet_cells
             WHERE spreadsheet_id = ?1 AND row_index = ?2 AND col_index = ?3",
            params![id, row, col],
            |r| r.get(0),
        )
        .ok()
    }

    /// save_cells must upsert WITHOUT duplicating (no DELETE-all) and must
    /// not touch unrelated cells or the structure tables.
    #[test]
    fn save_cells_upserts_by_coordinates() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_sheet(&conn, "s1");

        let cols = vec![col("A", 120, "text"), col("B", 120, "text")];
        let rows = vec![vec!["x".to_string(), "y".to_string()]];
        save_all(&mut conn, "s1", &cols, &rows, &state()).unwrap();
        assert_eq!(count(&conn, "spreadsheet_cells", "s1"), 2);

        // Edit two cells, one of them twice (must collapse to one row)
        save_cells(
            &mut conn,
            "s1",
            &[
                cell(0, 0, "X2"),
                cell(1, 1, "NEW"),
                cell(0, 0, "X3"),
            ],
        )
        .unwrap();

        assert_eq!(
            count(&conn, "spreadsheet_cells", "s1"),
            3,
            "2 original cells + 1 new (1,1), with (0,0) collapsed to one row"
        );
        assert_eq!(value_at(&conn, "s1", 0, 0).as_deref(), Some("X3"), "last write wins, no duplicate row");
        assert_eq!(value_at(&conn, "s1", 1, 1).as_deref(), Some("NEW"));
        assert_eq!(value_at(&conn, "s1", 0, 1).as_deref(), Some("y"), "unrelated cell untouched");
        // Structure untouched by a cell-only save
        assert_eq!(count(&conn, "spreadsheet_columns", "s1"), 2);
    }

    /// save_cells can create cells for columns/rows that do not exist yet
    /// (the frontend flushes structure AFTER cells; the structure save then
    /// adds the column). The cell itself must survive.
    #[test]
    fn save_cells_precedes_structure_ok() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_sheet(&conn, "s1");

        save_cells(&mut conn, "s1", &[cell(0, 5, "v")]).unwrap();
        assert_eq!(value_at(&conn, "s1", 0, 5).as_deref(), Some("v"));
    }

    /// save_structure: columns replace-all + orphan GC + state. A deleted
    /// column/row must purge its cells; a shrunk matrix must not leave
    /// trailing rows behind.
    #[test]
    fn save_structure_persists_columns_and_gcs_orphans() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_sheet(&conn, "s1");

        // 3 cols × 3 rows, then user deletes col 2 and row 2
        let cols = vec![
            col("A", 120, "text"),
            col("B", 120, "text"),
            col("C", 120, "text"),
        ];
        let rows = vec![
            vec!["a1".into(), "b1".into(), "c1".into()],
            vec!["a2".into(), "b2".into(), "c2".into()],
            vec!["a3".into(), "b3".into(), "c3".into()],
        ];
        save_all(&mut conn, "s1", &cols, &rows, &state()).unwrap();
        assert_eq!(count(&conn, "spreadsheet_cells", "s1"), 9);

        // Structure save with 2 cols × 2 rows → orphan cells (col 2, row 2) must die
        let cols = vec![col("A", 120, "text"), col("B", 120, "text")];
        save_structure(&mut conn, "s1", &cols, 2, &state()).unwrap();

        assert_eq!(count(&conn, "spreadsheet_columns", "s1"), 2);
        assert_eq!(
            count(&conn, "spreadsheet_cells", "s1"),
            4,
            "cells of deleted column+row must be garbage-collected"
        );
        assert_eq!(value_at(&conn, "s1", 0, 0).as_deref(), Some("a1"));
        assert_eq!(value_at(&conn, "s1", 1, 1).as_deref(), Some("b2"));
        assert_eq!(value_at(&conn, "s1", 2, 0), None, "deleted row must be purged");
        assert_eq!(value_at(&conn, "s1", 0, 2), None, "deleted column must be purged");
    }

    /// save_cells then save_structure is idempotent with save_all for the
    /// same logical content: same tables in the end.
    #[test]
    fn cells_plus_structure_matches_save_all() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_sheet(&conn, "s1");

        // Incremental path: seed structure, then edit cells
        let cols = vec![col("A", 120, "text"), col("B", 120, "text")];
        save_structure(&mut conn, "s1", &cols, 2, &state()).unwrap();
        save_cells(
            &mut conn,
            "s1",
            &[
                cell(0, 0, "p1"),
                cell(0, 1, "p2"),
                cell(1, 0, "p3"),
                cell(1, 1, "p4"),
            ],
        )
        .unwrap();

        // Reference path: single snapshot save with identical content
        let mut conn2 = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn2);
        seed_sheet(&conn2, "s1");
        let rows2 = vec![
            vec!["p1".to_string(), "p2".to_string()],
            vec!["p3".to_string(), "p4".to_string()],
        ];
        save_all(&mut conn2, "s1", &cols, &rows2, &state()).unwrap();

        // Both databases must now be identical
        for (r, row) in rows2.iter().enumerate() {
            for (c, val) in row.iter().enumerate() {
                assert_eq!(
                    value_at(&conn, "s1", r as i32, c as i32).as_deref(),
                    Some(val.as_str()),
                    "incremental path must match snapshot path at ({r},{c})"
                );
            }
        }
        assert_eq!(count(&conn, "spreadsheet_columns", "s1"), count(&conn2, "spreadsheet_columns", "s1"));
        assert_eq!(count(&conn, "spreadsheet_cells", "s1"), count(&conn2, "spreadsheet_cells", "s1"));
    }
}
