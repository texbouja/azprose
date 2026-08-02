// ── SVAR datagrid SQLite backend — « vue » model ───────────────────────────
// A datagrid is now a VIEW over a source spreadsheet (migration v8). There is
// NO duplicated snapshot anymore — the spreadsheet owns the data, the datagrid
// owns only per-view column config:
//
//   datagrids          : view metadata (id/name/dates + source_spreadsheet_id)
//   datagrid_columns   : per-view column config ONLY — col_index, width,
//                        hidden, sort_order, filter. title/type/options come
//                        from spreadsheet_columns via the JOIN (single source
//                        of truth). Stable ids `c{col_index}`.
//   spreadsheet_cells  : THE data. Rows are built from it at read time, edits
//                        are upserted into it (ON CONFLICT … DO UPDATE).
//
// The old `datagrid_rows` table (duplicated snapshot) was dropped in v8; the
// `datagrid_sync_from_spreadsheet` / `datagrid_sync_cells` bridge commands are
// gone — writes already land in the shared table, reads are always live.
//
// Consequences:
//   - adding a column to the spreadsheet makes it appear in every view
//   - deleting a VIEW never touches the spreadsheet data
//   - a spreadsheet without a linked grid simply has no view

use crate::db::{Db, with_db};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Clone)]
pub struct DatagridMeta {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_spreadsheet_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DatagridColumnDef {
    /// Stable view column id: `c{col_index}`.
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    #[serde(default = "default_col_type")]
    pub col_type: String,
    #[serde(default = "default_width")]
    pub width: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<String>,
    #[serde(default)]
    pub hidden: bool,
    /// Per-column filter rule, persisted as opaque JSON (an `@svar-ui`
    /// `IFilter` without `field` — the field IS the column). Saved by the
    /// stack viewers when the user edits a filter, re-applied on load.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DatagridRow {
    pub id: String,
    /// JSON `{colId: value}` DataHash (SVAR IRow shape).
    pub data: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DatagridData {
    pub id: String,
    pub name: String,
    pub columns: Vec<DatagridColumnDef>,
    pub rows: Vec<DatagridRow>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_spreadsheet_id: Option<String>,
}

fn default_col_type() -> String {
    "text".to_string()
}
fn default_width() -> i32 {
    120
}

/// Parse a stable view column id (`c{n}`) → col_index. Unknown shapes → None.
fn col_index_from_id(id: &str) -> Option<i32> {
    id.strip_prefix('c')?.parse::<i32>().ok()
}

/// List all datagrids (metadata only, newest first).
#[tauri::command]
pub fn datagrid_list(
    state: State<'_, Db>,
    root: String,
) -> Result<Vec<DatagridMeta>, String> {
    with_db(&state, &root, |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, created_at, updated_at, source_spreadsheet_id
                 FROM datagrids ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(DatagridMeta {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                    source_spreadsheet_id: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    })
}

/// Resolve the source spreadsheet of a view. Error when the grid is unknown
/// or has no source (autonomous grids were removed in migration v8).
fn source_of_grid(
    conn: &rusqlite::Connection,
    grid_id: &str,
) -> Result<(String, String, String, String, String), String> {
    // (name, created_at, updated_at, source_spreadsheet_id)
    conn.query_row(
        "SELECT name, created_at, updated_at, source_spreadsheet_id
         FROM datagrids WHERE id = ?1",
        params![grid_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        },
    )
    .map_err(|e| format!("datagrid not found: {e}"))
    .and_then(|(name, created_at, updated_at, src)| match src {
        Some(s) => Ok((grid_id.to_string(), name, created_at, updated_at, s)),
        None => Err("datagrid has no source spreadsheet (autonomous grids were removed)".to_string()),
    })
}

/// Load a full datagrid view: columns joined from the source spreadsheet
/// (title/type/options) × view config (width/hidden), rows built live from
/// spreadsheet_cells. Pure form (unit-testable); the command wraps it.
fn get_view(
    conn: &rusqlite::Connection,
    id: &str,
) -> Result<DatagridData, String> {
    let (grid_id, name, created_at, updated_at, src) = source_of_grid(conn, id)?;

    // Columns: JOIN spreadsheet_columns (source of truth for title/type/
    // options) with datagrid_columns (view width/hidden). View width wins;
    // absent view config falls back to the spreadsheet width.
    let mut col_stmt = conn
        .prepare(
            "SELECT sc.col_index, sc.title, sc.type, sc.options, sc.width,
                    dc.width, COALESCE(dc.hidden, 0), dc.filter
             FROM spreadsheet_columns sc
             LEFT JOIN datagrid_columns dc
                    ON dc.grid_id = ?1 AND dc.col_index = sc.col_index
             WHERE sc.spreadsheet_id = ?2
             ORDER BY sc.col_index",
        )
        .map_err(|e| e.to_string())?;
    let columns: Vec<DatagridColumnDef> = col_stmt
        .query_map(params![grid_id, src], |row| {
            let col_index: i64 = row.get(0)?;
            let title: String = row.get::<_, Option<String>>(1)?.unwrap_or_default();
            let col_type: String = row.get::<_, Option<String>>(2)?.unwrap_or_else(default_col_type);
            let options: Option<String> = row.get(3)?;
            let sheet_width: i32 = row.get::<_, Option<i32>>(4)?.unwrap_or_else(default_width);
            let view_width: Option<i32> = row.get(5)?;
            let hidden: i64 = row.get(6)?;
            let filter: Option<String> = row.get(7)?;
            Ok(DatagridColumnDef {
                id: format!("c{col_index}"),
                title,
                col_type,
                width: view_width.unwrap_or(sheet_width),
                options,
                hidden: hidden != 0,
                filter,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Rows: rebuilt from spreadsheet_cells — the data lives in the
    // spreadsheet, never duplicated. Same matrix reconstruction as the
    // pre-v8 `build_grid_from_spreadsheet` (absent cells → "").
    let mut cell_stmt = conn
        .prepare(
            "SELECT row_index, col_index, value
             FROM spreadsheet_cells WHERE spreadsheet_id = ?1
             ORDER BY row_index, col_index",
        )
        .map_err(|e| e.to_string())?;
    let cells: Vec<(i32, i32, String)> = cell_stmt
        .query_map(params![src], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let num_cols = columns.len();
    let max_row = cells.iter().map(|c| c.0).max().unwrap_or(0) as usize;
    let mut matrix: Vec<Vec<String>> = vec![vec![String::new(); num_cols]; max_row + 1];
    for (r, c, val) in &cells {
        if *r as usize <= max_row && (*c as usize) < num_cols {
            matrix[*r as usize][*c as usize] = val.clone();
        }
    }
    let rows: Vec<DatagridRow> = matrix
        .iter()
        .enumerate()
        .map(|(r, row_cells)| {
            let mut map = serde_json::Map::new();
            for (c, val) in row_cells.iter().enumerate() {
                map.insert(format!("c{c}"), serde_json::Value::String(val.clone()));
            }
            DatagridRow {
                id: format!("r{r}"),
                data: serde_json::Value::Object(map).to_string(),
            }
        })
        .collect();

    Ok(DatagridData {
        id: grid_id,
        name,
        columns,
        rows,
        created_at,
        updated_at,
        source_spreadsheet_id: Some(src),
    })
}

/// Load a full datagrid view: columns joined from the source spreadsheet
/// (title/type/options) × view config (width/hidden), rows built live from
/// spreadsheet_cells.
#[tauri::command]
pub fn datagrid_get(
    state: State<'_, Db>,
    root: String,
    id: String,
) -> Result<DatagridData, String> {
    with_db(&state, &root, |conn| get_view(conn, &id))
}

/// Replace-all save of the VIEW CONFIG only (name + per-column width/hidden +
/// per-column filter rule). The data is never touched — it lives in
/// spreadsheet_cells. Column identity is the stable id (`c{n}`);
/// title/type/options are ignored (they come from the spreadsheet JOIN).
fn save_view_config(
    conn: &mut rusqlite::Connection,
    grid_id: &str,
    name: &str,
    columns: &[DatagridColumnDef],
) -> Result<(), String> {
    let now = crate::db::now_iso();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        tx.execute(
            "UPDATE datagrids SET name = ?2, updated_at = ?3 WHERE id = ?1",
            params![grid_id, name, now],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            "DELETE FROM datagrid_columns WHERE grid_id = ?1",
            params![grid_id],
        )
        .map_err(|e| e.to_string())?;

        let mut col_stmt = tx
            .prepare(
                "INSERT INTO datagrid_columns
                 (id, grid_id, col_index, width, hidden, filter)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .map_err(|e| e.to_string())?;
        for col in columns {
            let Some(col_index) = col_index_from_id(&col.id) else {
                continue;
            };
            col_stmt
                .execute(params![
                    col.id,
                    grid_id,
                    col_index as i64,
                    col.width,
                    col.hidden as i64,
                    col.filter,
                ])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn datagrid_save(
    state: State<'_, Db>,
    root: String,
    id: String,
    name: String,
    columns: String,
) -> Result<(), String> {
    let columns: Vec<DatagridColumnDef> =
        serde_json::from_str(&columns).map_err(|e| format!("invalid columns JSON: {e}"))?;
    with_db(&state, &root, |conn| {
        save_view_config(conn, &id, &name, &columns)
    })
}

/// Create a new datagrid VIEW over an existing spreadsheet. Copies the
/// spreadsheet's column widths as the initial view config (so the view is
/// readable immediately) but NOT the data — rows are read live from
/// spreadsheet_cells. Pure form (unit-testable).
fn create_view(
    conn: &mut rusqlite::Connection,
    id: &str,
    grid_name: &str,
    spreadsheet_id: &str,
) -> Result<String, String> {
    // The spreadsheet must exist (and be a real one) before creating a view.
    conn.query_row(
        "SELECT id FROM spreadsheets WHERE id = ?1",
        params![spreadsheet_id],
        |r| r.get::<_, String>(0),
    )
    .map_err(|e| format!("source spreadsheet not found: {e}"))?;

    let now = crate::db::now_iso();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        tx.execute(
            "INSERT INTO datagrids (id, name, created_at, updated_at, source_spreadsheet_id)
             VALUES (?1, ?2, ?3, ?3, ?4)",
            params![id, grid_name, now, spreadsheet_id],
        )
        .map_err(|e| e.to_string())?;
        // Initial view config: one row per spreadsheet column, width copied.
        {
            let mut copy_stmt = tx
                .prepare(
                    "INSERT INTO datagrid_columns (id, grid_id, col_index, width, hidden)
                     SELECT 'c' || col_index, ?1, col_index, COALESCE(width, 120), 0
                     FROM spreadsheet_columns WHERE spreadsheet_id = ?2",
                )
                .map_err(|e| e.to_string())?;
            copy_stmt
                .execute(params![id, spreadsheet_id])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(id.to_string())
}

/// Create a new datagrid VIEW over an existing spreadsheet. Copies the
/// spreadsheet's column widths as the initial view config (so the view is
/// readable immediately) but NOT the data — rows are read live from
/// spreadsheet_cells.
#[tauri::command]
pub fn datagrid_create_from_spreadsheet(
    state: State<'_, Db>,
    root: String,
    id: String,
    grid_name: String,
    spreadsheet_id: String,
) -> Result<String, String> {
    with_db(&state, &root, |conn| create_view(conn, &id, &grid_name, &spreadsheet_id))
}

/// Delete a datagrid VIEW. The source spreadsheet — including its data — is
/// never touched (the view was only per-column config on top of the shared
/// spreadsheet_cells table).
#[tauri::command]
pub fn datagrid_delete(state: State<'_, Db>, root: String, id: String) -> Result<(), String> {
    with_db(&state, &root, |conn| {
        conn.execute("DELETE FROM datagrids WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Find the datagrid view derived from a given spreadsheet.
/// Returns None when the spreadsheet has no linked grid.
#[tauri::command]
pub fn datagrid_find_by_source(
    state: State<'_, Db>,
    root: String,
    spreadsheet_id: String,
) -> Result<Option<DatagridMeta>, String> {
    with_db(&state, &root, |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, created_at, updated_at, source_spreadsheet_id
                 FROM datagrids WHERE source_spreadsheet_id = ?1
                 ORDER BY updated_at DESC LIMIT 1",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map(params![spreadsheet_id], |row| {
                Ok(DatagridMeta {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                    source_spreadsheet_id: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(meta)) => Ok(Some(meta)),
            Some(Err(e)) => Err(e.to_string()),
            None => Ok(None),
        }
    })
}

#[tauri::command]
pub fn datagrid_rename(
    state: State<'_, Db>,
    root: String,
    id: String,
    name: String,
) -> Result<(), String> {
    with_db(&state, &root, |conn| {
        conn.execute(
            "UPDATE datagrids SET name = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, name, crate::db::now_iso()],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Write a batch of cell edits from a datagrid VIEW straight into the source
/// spreadsheet's own table (`spreadsheet_cells`) — the shared source of truth.
/// O(changes): native upsert, no diff, no snapshot. This replaces both the old
/// autonomous `datagrid_save_cells` (datagrid_rows) and the live-bridge
/// `datagrid_sync_cells` (which mirrored into a snapshot): writing directly to
/// spreadsheet_cells means the tableur sees the edit on its next load and no
/// bridge ever goes stale.
///
/// For each change: upsert `(spreadsheet_id, row_index, col_index)` with the
/// payload value. Changes whose column is beyond the spreadsheet's columns are
/// skipped (the view's own columns always fit — the JOIN only exposes
/// spreadsheet columns). Unknown grid or grid without source → silent no-op.
fn save_cells_into_spreadsheet(
    conn: &mut rusqlite::Connection,
    grid_id: &str,
    changes: &[crate::spreadsheet_db::CellChange],
) -> Result<(), String> {
    let src: Option<String> = conn
        .query_row(
            "SELECT source_spreadsheet_id FROM datagrids WHERE id = ?1",
            params![grid_id],
            |r| r.get::<_, Option<String>>(0),
        )
        .ok()
        .flatten();
    let Some(src) = src else {
        return Ok(());
    };

    let num_cols: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM spreadsheet_columns WHERE spreadsheet_id = ?1",
            params![src],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let now = crate::db::now_iso();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        tx.execute(
            "UPDATE datagrids SET updated_at = ?2 WHERE id = ?1",
            params![grid_id, now],
        )
        .map_err(|e| e.to_string())?;
        let mut upsert = tx
            .prepare(
                "INSERT INTO spreadsheet_cells (spreadsheet_id, row_index, col_index, value)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT (spreadsheet_id, row_index, col_index)
                 DO UPDATE SET value = excluded.value",
            )
            .map_err(|e| e.to_string())?;
        for ch in changes {
            if ch.col_index as i64 >= num_cols || ch.row_index < 0 {
                continue;
            }
            upsert
                .execute(params![src, ch.row_index, ch.col_index, ch.value])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn datagrid_save_cells(
    state: State<'_, Db>,
    root: String,
    id: String,
    changes: String,
) -> Result<(), String> {
    let changes: Vec<crate::spreadsheet_db::CellChange> = serde_json::from_str(&changes)
        .map_err(|e| format!("invalid changes JSON: {e}"))?;
    if changes.is_empty() {
        return Ok(());
    }
    with_db(&state, &root, |conn| save_cells_into_spreadsheet(conn, &id, &changes))
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Full post-v9 test schema: spreadsheet tables + datagrid tables +
    /// v5 bridge column + v8 migration (drops datagrid_rows, adds view
    /// columns, removes autonomous grids) + v9 migration (drops the global
    /// PK on datagrid_columns.id so multiple views can share `c{n}` ids).
    fn test_schema(conn: &rusqlite::Connection) {
        conn.execute_batch(crate::db::SCHEMA_V1).unwrap();
        conn.execute_batch(crate::db::SCHEMA_V4).unwrap();
        conn.execute_batch(
            "ALTER TABLE datagrids ADD COLUMN source_spreadsheet_id TEXT;",
        )
        .unwrap();
        crate::db::migrate_v8(conn).unwrap();
        crate::db::migrate_v9(conn).unwrap();
    }

    fn seed_spreadsheet(conn: &rusqlite::Connection, id: &str) {
        let now = crate::db::now_iso();
        conn.execute(
            "INSERT INTO spreadsheets (id, name, imported_at, updated_at)
             VALUES (?1, 'S', ?2, ?2)",
            params![id, now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spreadsheet_columns (spreadsheet_id, col_index, title, width, type)
             VALUES (?1, 0, 'Nom', 150, 'text'), (?1, 1, 'Note', 100, 'number')",
            params![id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spreadsheet_cells (spreadsheet_id, row_index, col_index, value)
             VALUES (?1, 0, 0, 'Alice'), (?1, 0, 1, '15'),
                    (?1, 1, 0, 'Bob'),   (?1, 1, 1, '17')",
            params![id],
        )
        .unwrap();
    }

    fn count(conn: &rusqlite::Connection, table: &str) -> i64 {
        conn.query_row(
            &format!("SELECT COUNT(*) FROM {table}"),
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap()
    }

    /// v8 migration drops the duplicated rows table.
    #[test]
    fn migrate_v8_drops_datagrid_rows_table() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::SCHEMA_V4).unwrap();
        conn.execute_batch(
            "ALTER TABLE datagrids ADD COLUMN source_spreadsheet_id TEXT;",
        )
        .unwrap();
        assert!(count(&conn, "datagrid_rows") == 0, "table exists pre-migration");

        crate::db::migrate_v8(&conn).unwrap();
        let err = conn
            .query_row("SELECT COUNT(*) FROM datagrid_rows", [], |r| r.get::<_, i64>(0))
            .err();
        assert!(err.is_some(), "datagrid_rows must be dropped by v8");
    }

    /// v8 migration removes autonomous grids (they were the only users of the
    /// dropped table); linked grids survive with their bridge link.
    #[test]
    fn migrate_v8_drops_autonomous_grids() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::SCHEMA_V4).unwrap();
        conn.execute_batch(
            "ALTER TABLE datagrids ADD COLUMN source_spreadsheet_id TEXT;",
        )
        .unwrap();
        let now = crate::db::now_iso();
        conn.execute(
            "INSERT INTO datagrids (id, name, created_at, updated_at) VALUES ('auto', 'A', ?1, ?1)",
            params![now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO datagrids (id, name, created_at, updated_at, source_spreadsheet_id)
             VALUES ('link', 'L', ?1, ?1, 's1')",
            params![now],
        )
        .unwrap();

        crate::db::migrate_v8(&conn).unwrap();

        let ids = grid_ids(&conn);
        assert_eq!(ids, vec!["link"], "autonomous grid must be removed, linked kept");
    }

    /// v9 regression: column ids are positional (`c{col_index}`) but were a
    /// GLOBAL primary key — a second view over another spreadsheet re-inserted
    /// `c0..cN` and failed. After v9, two views may share the same `c{n}` ids.
    #[test]
    fn two_views_on_different_spreadsheets_do_not_collide() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_spreadsheet(&conn, "s1");
        seed_spreadsheet(&conn, "s2");

        create_view(&mut conn, "g1", "G1", "s1").expect("first view");
        create_view(&mut conn, "g2", "G2", "s2").expect("second view must not collide on column ids");

        assert_eq!(count(&conn, "datagrids"), 2);
        assert_eq!(count(&conn, "datagrid_columns"), 4, "2 columns per view, ids may repeat");

        // The second view is fully readable (JOIN + live rows on ITS source).
        let view = get_view(&conn, "g2").unwrap();
        assert_eq!(view.columns.len(), 2);
        assert_eq!(view.rows.len(), 2);
        assert_eq!(view.rows[0].data, r#"{"c0":"Alice","c1":"15"}"#);
    }

    fn grid_ids(conn: &rusqlite::Connection) -> Vec<String> {
        let mut stmt = conn.prepare("SELECT id FROM datagrids").unwrap();
        stmt.query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect()
    }

    /// Creating a view records the source link and copies the spreadsheet's
    /// column widths as initial view config — but copies NO data.
    #[test]
    fn create_from_spreadsheet_creates_view_without_data_copy() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_spreadsheet(&conn, "s1");

        let id = create_view(&mut conn, "g1", "G", "s1").unwrap();
        assert_eq!(id, "g1");

        let link: Option<String> = conn
            .query_row(
                "SELECT source_spreadsheet_id FROM datagrids WHERE id = 'g1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(link.as_deref(), Some("s1"));

        // View config copied the widths (150 / 100).
        let widths: Vec<i64> = {
            let mut stmt = conn
                .prepare("SELECT width FROM datagrid_columns WHERE grid_id = 'g1' ORDER BY col_index")
                .unwrap();
            stmt.query_map([], |r| r.get::<_, i64>(0))
                .unwrap()
                .map(|r| r.unwrap())
                .collect()
        };
        assert_eq!(widths, vec![150, 100]);

        // No data copy — the spreadsheet owns the cells.
        assert_eq!(count(&conn, "spreadsheet_cells"), 4);
    }

    /// get() joins spreadsheet columns (title/type/options) with view config
    /// (width/hidden) and builds rows live from spreadsheet_cells.
    #[test]
    fn get_joins_spreadsheet_and_returns_live_rows() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_spreadsheet(&conn, "s1");
        create_view(&mut conn, "g1", "G", "s1").unwrap();

        let data = get_view(&conn, "g1").unwrap();

        assert_eq!(data.name, "G");
        assert_eq!(data.source_spreadsheet_id.as_deref(), Some("s1"));
        assert_eq!(data.columns.len(), 2);
        assert_eq!(data.columns[0].id, "c0");
        assert_eq!(data.columns[0].title, "Nom");
        assert_eq!(data.columns[0].col_type, "text");
        assert_eq!(data.columns[0].width, 150);
        assert_eq!(data.columns[1].col_type, "number");
        assert_eq!(data.columns[1].width, 100);

        assert_eq!(data.rows.len(), 2);
        assert_eq!(data.rows[0].id, "r0");
        assert_eq!(data.rows[0].data, r#"{"c0":"Alice","c1":"15"}"#);
        assert_eq!(data.rows[1].data, r#"{"c0":"Bob","c1":"17"}"#);
    }

    /// View width/hidden config overrides the spreadsheet defaults.
    #[test]
    fn view_config_overrides_spreadsheet_width() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_spreadsheet(&conn, "s1");
        create_view(&mut conn, "g1", "G", "s1").unwrap();

        // User resized column c0 in the view → narrower width + hidden c1.
        conn.execute(
            "UPDATE datagrid_columns SET width = 80, hidden = 0 WHERE grid_id = 'g1' AND col_index = 0",
            [],
        )
        .unwrap();
        conn.execute(
            "UPDATE datagrid_columns SET hidden = 1 WHERE grid_id = 'g1' AND col_index = 1",
            [],
        )
        .unwrap();

        let data = get_view(&conn, "g1").unwrap();
        assert_eq!(data.columns[0].width, 80);
        assert!(!data.columns[0].hidden);
        assert_eq!(data.columns[1].width, 100, "untouched view column keeps spreadsheet width");
        assert!(data.columns[1].hidden);
    }

    /// Filter rules are per-column view config: saved via save_view_config
    /// (replace-all) and returned by get_view — round-trip across sessions.
    #[test]
    fn filter_rules_roundtrip_through_get_view() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_spreadsheet(&conn, "s1");
        create_view(&mut conn, "g1", "G", "s1").unwrap();

        let cols = vec![
            DatagridColumnDef {
                id: "c0".into(),
                title: "Nom".into(),
                col_type: "text".into(),
                width: 150,
                options: None,
                hidden: false,
                filter: Some(r#"{"filter":"beginsWith","type":"text","value":"A"}"#.into()),
            },
            DatagridColumnDef {
                id: "c1".into(),
                title: "Note".into(),
                col_type: "number".into(),
                width: 100,
                options: None,
                hidden: false,
                filter: Some(r#"{"filter":"greaterOrEqual","type":"number","value":"15"}"#.into()),
            },
        ];
        save_view_config(&mut conn, "g1", "G", &cols).unwrap();

        // A column without any rule keeps filter = None.
        conn.execute(
            "UPDATE datagrid_columns SET filter = NULL WHERE grid_id = 'g1' AND col_index = 0",
            [],
        )
        .unwrap();

        let data = get_view(&conn, "g1").unwrap();
        assert_eq!(data.columns.len(), 2);
        assert!(data.columns[0].filter.is_none());
        assert_eq!(
            data.columns[1].filter.as_deref(),
            Some(r#"{"filter":"greaterOrEqual","type":"number","value":"15"}"#)
        );
    }

    /// A column added to the spreadsheet appears in the view without any view
    /// config row — the JOIN falls back to the spreadsheet defaults.
    #[test]
    fn added_spreadsheet_column_appears_in_view() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_spreadsheet(&conn, "s1");
        create_view(&mut conn, "g1", "G", "s1").unwrap();

        conn.execute(
            "INSERT INTO spreadsheet_columns (spreadsheet_id, col_index, title, width, type)
             VALUES ('s1', 2, 'Date', 90, 'calendar')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spreadsheet_cells (spreadsheet_id, row_index, col_index, value)
             VALUES ('s1', 0, 2, '2026-01-01')",
            [],
        )
        .unwrap();

        let data = get_view(&conn, "g1").unwrap();
        assert_eq!(data.columns.len(), 3);
        assert_eq!(data.columns[2].id, "c2");
        assert_eq!(data.columns[2].title, "Date");
        assert_eq!(data.columns[2].col_type, "calendar");
        assert_eq!(data.columns[2].width, 90);
        assert_eq!(data.rows[0].data, r#"{"c0":"Alice","c1":"15","c2":"2026-01-01"}"#);
    }

    /// save_view_config is replace-all on the VIEW columns and never touches
    /// spreadsheet data. Width/hidden survive; the source link survives.
    #[test]
    fn save_view_config_is_replace_all_and_keeps_link() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_spreadsheet(&conn, "s1");
        create_view(&mut conn, "g1", "G", "s1").unwrap();

        let cols = vec![
            DatagridColumnDef {
                id: "c0".into(),
                title: "Nom".into(),
                col_type: "text".into(),
                width: 200,
                options: None,
                hidden: false,
                filter: Some(r#"{"filter":"contains","type":"text","value":"al"}"#.into()),
            },
            DatagridColumnDef {
                id: "c1".into(),
                title: "Note".into(),
                col_type: "number".into(),
                width: 60,
                options: None,
                hidden: true,
                filter: None,
            },
        ];
        save_view_config(&mut conn, "g1", "Renommée", &cols).unwrap();

        // View config replaced (2 rows, new widths, hidden flag).
        let (w0, h0): (i64, i64) = conn
            .query_row(
                "SELECT width, hidden FROM datagrid_columns WHERE grid_id = 'g1' AND col_index = 0",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(w0, 200);
        assert_eq!(h0, 0);
        let (w1, h1): (i64, i64) = conn
            .query_row(
                "SELECT width, hidden FROM datagrid_columns WHERE grid_id = 'g1' AND col_index = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(w1, 60);
        assert_eq!(h1, 1);

        // Filter rule persisted with the view config (c0) and absent (c1).
        let f0: Option<String> = conn
            .query_row(
                "SELECT filter FROM datagrid_columns WHERE grid_id = 'g1' AND col_index = 0",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            f0.as_deref(),
            Some(r#"{"filter":"contains","type":"text","value":"al"}"#)
        );
        let f1: Option<String> = conn
            .query_row(
                "SELECT filter FROM datagrid_columns WHERE grid_id = 'g1' AND col_index = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(f1.is_none());

        // Data untouched; link untouched.
        assert_eq!(count(&conn, "spreadsheet_cells"), 4);
        let link: Option<String> = conn
            .query_row("SELECT source_spreadsheet_id FROM datagrids WHERE id = 'g1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(link.as_deref(), Some("s1"));
        let name: String = conn
            .query_row("SELECT name FROM datagrids WHERE id = 'g1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(name, "Renommée");
    }

    /// save_cells writes straight into the SOURCE spreadsheet's own cells —
    /// the tableur sees the edit immediately (no bridge to go stale).
    #[test]
    fn save_cells_upserts_into_source_spreadsheet() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_spreadsheet(&conn, "s1");
        create_view(&mut conn, "g1", "G", "s1").unwrap();

        use crate::spreadsheet_db::CellChange;
        let ch = |r: i32, c: i32, v: &str| CellChange {
            row_index: r,
            col_index: c,
            value: v.to_string(),
        };

        // Update existing cell (0,0) Alice→Aline + create a new row (2,0).
        save_cells_into_spreadsheet(&mut conn, "g1", &[ch(0, 0, "Aline"), ch(2, 0, "Claire")]).unwrap();

        let v00: String = conn
            .query_row(
                "SELECT value FROM spreadsheet_cells WHERE spreadsheet_id = 's1' AND row_index = 0 AND col_index = 0",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(v00, "Aline");
        let v20: String = conn
            .query_row(
                "SELECT value FROM spreadsheet_cells WHERE spreadsheet_id = 's1' AND row_index = 2 AND col_index = 0",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(v20, "Claire");
        assert_eq!(count(&conn, "spreadsheet_cells"), 5, "one updated, one inserted");
    }

    /// Edits beyond the spreadsheet's column count are skipped (the view's
    /// own columns always fit — the JOIN only exposes spreadsheet columns).
    #[test]
    fn save_cells_skips_out_of_bounds_column() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_spreadsheet(&conn, "s1");
        create_view(&mut conn, "g1", "G", "s1").unwrap();

        use crate::spreadsheet_db::CellChange;
        save_cells_into_spreadsheet(
            &mut conn,
            "g1",
            &[CellChange { row_index: 0, col_index: 7, value: "zz".into() }],
        )
        .unwrap();

        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM spreadsheet_cells WHERE value = 'zz'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0, "out-of-bounds column must not be written");
    }

    /// save_cells on an unknown grid (or a grid whose source vanished) is a
    /// silent no-op.
    #[test]
    fn save_cells_noop_for_unknown_grid() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);

        use crate::spreadsheet_db::CellChange;
        save_cells_into_spreadsheet(
            &mut conn,
            "missing",
            &[CellChange { row_index: 0, col_index: 0, value: "x".into() }],
        )
        .unwrap();
        assert_eq!(count(&conn, "spreadsheet_cells"), 0);
    }

    /// Deleting a VIEW leaves the spreadsheet — including its data — intact.
    /// This is the semantic core of the v8 model: the view is only per-column
    /// config on top of the shared data.
    #[test]
    fn delete_removes_view_but_keeps_spreadsheet() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_spreadsheet(&conn, "s1");
        create_view(&mut conn, "g1", "G", "s1").unwrap();

        conn.execute("DELETE FROM datagrids WHERE id = 'g1'", []).unwrap();

        assert_eq!(count(&conn, "datagrids"), 0);
        assert_eq!(count(&conn, "datagrid_columns"), 0, "view config cascades");
        assert_eq!(count(&conn, "spreadsheets"), 1, "spreadsheet survives");
        assert_eq!(count(&conn, "spreadsheet_cells"), 4, "data survives");
        let ok: i64 = conn
            .query_row("SELECT COUNT(*) FROM spreadsheets WHERE id = 's1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(ok, 1);
    }

    /// A datagrid without a source spreadsheet cannot be loaded (autonomous
    /// grids were removed in v8 — this is a defensive error path).
    #[test]
    fn get_errors_without_source() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        let now = crate::db::now_iso();
        conn.execute(
            "INSERT INTO datagrids (id, name, created_at, updated_at, source_spreadsheet_id)
             VALUES ('g1', 'G', ?1, ?1, NULL)",
            params![now],
        )
        .unwrap();

        let err = match get_view(&conn, "g1") {
            Err(e) => e,
            Ok(_) => panic!("view without source must fail to load"),
        };
        assert!(err.contains("no source spreadsheet"), "got: {err}");
    }

    /// find_by_source returns the view linked to a spreadsheet.
    #[test]
    fn find_by_source_returns_linked_view() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        seed_spreadsheet(&conn, "s1");
        create_view(&mut conn, "g1", "G", "s1").unwrap();

        let meta: Option<DatagridMeta> = conn
            .query_row(
                "SELECT id, name, created_at, updated_at, source_spreadsheet_id
                 FROM datagrids WHERE source_spreadsheet_id = 's1'
                 ORDER BY updated_at DESC LIMIT 1",
                [],
                |row| {
                    Ok(DatagridMeta {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        created_at: row.get(2)?,
                        updated_at: row.get(3)?,
                        source_spreadsheet_id: row.get(4)?,
                    })
                },
            )
            .ok();
        assert!(meta.is_some());
        assert_eq!(meta.unwrap().id, "g1");
    }
}
