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

#[derive(Serialize, Deserialize)]
pub struct CellChange {
    pub row: usize,
    pub col: usize,
    pub value: String,
    #[serde(default)]
    pub style: String,
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
        let max_row = cells.iter().map(|c| c.0).max().unwrap_or(0) as usize;
        let num_cols = columns.len();
        let mut data: Vec<Vec<String>> = vec![vec![String::new(); num_cols]; max_row + 1];
        for (r, c, val, _style) in &cells {
            if *r as usize <= max_row && (*c as usize) < num_cols {
                data[*r as usize][*c as usize] = val.clone();
            }
        }

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

/// Save incremental cell changes (debounced from frontend).
#[tauri::command]
pub fn spreadsheet_save_cells(
    state: State<'_, Db>,
    root: String,
    id: String,
    changes: String,
) -> Result<(), String> {
    let changes: Vec<CellChange> =
        serde_json::from_str(&changes).map_err(|e| format!("invalid changes JSON: {e}"))?;
    let now = chrono::Utc::now().to_rfc3339();

    with_db(&state, &root, |conn| {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt = tx
                .prepare(
                    "INSERT OR REPLACE INTO spreadsheet_cells (spreadsheet_id, row_index, col_index, value, style)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                )
                .map_err(|e| e.to_string())?;
            for ch in &changes {
                stmt.execute(params![id, ch.row as i32, ch.col as i32, ch.value, ch.style])
                    .map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE spreadsheets SET updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Save view state (hidden columns/rows, frozen, sort).
#[tauri::command]
pub fn spreadsheet_save_state(
    state: State<'_, Db>,
    root: String,
    id: String,
    view_state: String,
) -> Result<(), String> {
    let vs: SpreadsheetViewState =
        serde_json::from_str(&view_state).map_err(|e| format!("invalid state JSON: {e}"))?;

    with_db(&state, &root, |conn| {
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

        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE spreadsheets SET updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
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
    let now = chrono::Utc::now().to_rfc3339();

    with_db(&state, &root, |conn| {
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
