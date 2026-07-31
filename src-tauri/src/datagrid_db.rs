// ── SVAR datagrid SQLite backend ───────────────────────────────────────────
// Tables: datagrids, datagrid_columns, datagrid_rows (created by db.rs
// SCHEMA_V4). A datagrid is a set of typed columns + rows stored as JSON
// `{colId: value}` DataHash blobs (mirrors SVAR's IRow shape).
// A datagrid can be created empty or derived from an existing spreadsheet
// (matrix 2D → columns + DataHash rows), bridging the two representations.

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
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DatagridColumnDef {
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
}

fn default_col_type() -> String {
    "text".to_string()
}
fn default_width() -> i32 {
    120
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
                "SELECT id, name, created_at, updated_at
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
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    })
}

/// Load a full datagrid (columns in order, rows in order).
#[tauri::command]
pub fn datagrid_get(
    state: State<'_, Db>,
    root: String,
    id: String,
) -> Result<DatagridData, String> {
    with_db(&state, &root, |conn| {
        // Metadata
        let meta: DatagridMeta = conn
            .query_row(
                "SELECT id, name, created_at, updated_at FROM datagrids WHERE id = ?1",
                params![id],
                |row| {
                    Ok(DatagridMeta {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        created_at: row.get(2)?,
                        updated_at: row.get(3)?,
                    })
                },
            )
            .map_err(|e| format!("datagrid not found: {e}"))?;

        // Columns
        let mut col_stmt = conn
            .prepare(
                "SELECT id, title, col_type, width, options, hidden
                 FROM datagrid_columns WHERE grid_id = ?1 ORDER BY col_index",
            )
            .map_err(|e| e.to_string())?;
        let columns: Vec<DatagridColumnDef> = col_stmt
            .query_map(params![id], |row| {
                Ok(DatagridColumnDef {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    col_type: row.get::<_, Option<String>>(2)?.unwrap_or_else(default_col_type),
                    width: row.get::<_, Option<i32>>(3)?.unwrap_or_else(default_width),
                    options: row.get(4)?,
                    hidden: row.get::<_, i64>(5)? != 0,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        // Rows
        let mut row_stmt = conn
            .prepare(
                "SELECT id, data FROM datagrid_rows WHERE grid_id = ?1 ORDER BY row_index",
            )
            .map_err(|e| e.to_string())?;
        let rows: Vec<DatagridRow> = row_stmt
            .query_map(params![id], |row| {
                Ok(DatagridRow {
                    id: row.get(0)?,
                    data: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "{}".to_string()),
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(DatagridData {
            id: meta.id,
            name: meta.name,
            columns,
            rows,
            created_at: meta.created_at,
            updated_at: meta.updated_at,
        })
    })
}

/// Replace-all save (transactional, debounced from the frontend store).
///
/// Same contract as calendar_events_save: the frontend always sends the
/// complete snapshot (columns + rows), so this command must make the tables
/// EXACTLY match that snapshot — rows/columns missing from the payload are
/// deleted. A plain upsert would leave deleted items behind.
fn save_grid(
    conn: &mut rusqlite::Connection,
    grid_id: &str,
    name: &str,
    columns: &[DatagridColumnDef],
    rows: &[DatagridRow],
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
        tx.execute(
            "DELETE FROM datagrid_rows WHERE grid_id = ?1",
            params![grid_id],
        )
        .map_err(|e| e.to_string())?;

        {
            let mut col_stmt = tx
                .prepare(
                    "INSERT INTO datagrid_columns
                     (id, grid_id, col_index, title, col_type, width, options, hidden)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                )
                .map_err(|e| e.to_string())?;
            for (i, col) in columns.iter().enumerate() {
                col_stmt
                    .execute(params![
                        col.id,
                        grid_id,
                        i as i64,
                        col.title,
                        col.col_type,
                        col.width,
                        col.options,
                        col.hidden as i64,
                    ])
                    .map_err(|e| e.to_string())?;
            }
        }
        {
            let mut row_stmt = tx
                .prepare(
                    "INSERT INTO datagrid_rows (id, grid_id, row_index, data)
                     VALUES (?1, ?2, ?3, ?4)",
                )
                .map_err(|e| e.to_string())?;
            for (i, row) in rows.iter().enumerate() {
                row_stmt
                    .execute(params![row.id, grid_id, i as i64, row.data])
                    .map_err(|e| e.to_string())?;
            }
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
    rows: String,
) -> Result<(), String> {
    let columns: Vec<DatagridColumnDef> =
        serde_json::from_str(&columns).map_err(|e| format!("invalid columns JSON: {e}"))?;
    let rows: Vec<DatagridRow> =
        serde_json::from_str(&rows).map_err(|e| format!("invalid rows JSON: {e}"))?;

    with_db(&state, &root, |conn| {
        save_grid(conn, &id, &name, &columns, &rows)
    })
}

/// Convert a spreadsheet (typed columns + flat cells) into datagrid columns
/// + DataHash rows. Column ids are stable (`c0`, `c1`, ...) and row ids are
/// stable (`r0`, `r1`, ...) so a grid can later be re-synced from the same
/// spreadsheet without regenerating ids. Exposed for unit tests.
fn build_grid_from_spreadsheet(
    spreadsheet_id: &str,
    conn: &mut rusqlite::Connection,
) -> Result<(Vec<DatagridColumnDef>, Vec<DatagridRow>), String> {
    // Load spreadsheet columns
    let mut col_stmt = conn
        .prepare(
            "SELECT title, width, type, options
             FROM spreadsheet_columns WHERE spreadsheet_id = ?1 ORDER BY col_index",
        )
        .map_err(|e| e.to_string())?;
    let columns: Vec<(String, i32, String, Option<String>)> = col_stmt
        .query_map(params![spreadsheet_id], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                row.get::<_, Option<i32>>(1)?.unwrap_or(120),
                row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "text".to_string()),
                row.get(3)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Load spreadsheet cells (row_index, col_index, value)
    let mut cell_stmt = conn
        .prepare(
            "SELECT row_index, col_index, value
             FROM spreadsheet_cells WHERE spreadsheet_id = ?1
             ORDER BY row_index, col_index",
        )
        .map_err(|e| e.to_string())?;
    let cells: Vec<(i32, i32, String)> = cell_stmt
        .query_map(params![spreadsheet_id], |row| {
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

    let grid_columns: Vec<DatagridColumnDef> = columns
        .iter()
        .enumerate()
        .map(|(i, (title, width, col_type, options))| DatagridColumnDef {
            id: format!("c{i}"),
            title: title.clone(),
            col_type: col_type.clone(),
            width: *width,
            options: options.clone(),
            hidden: false,
        })
        .collect();

    let grid_rows: Vec<DatagridRow> = matrix
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

    Ok((grid_columns, grid_rows))
}

/// Create a new datagrid from an existing spreadsheet (matrix 2D → columns
/// + DataHash rows).
#[tauri::command]
pub fn datagrid_create_from_spreadsheet(
    state: State<'_, Db>,
    root: String,
    grid_id: String,
    grid_name: String,
    spreadsheet_id: String,
) -> Result<String, String> {
    with_db(&state, &root, |conn| {
        let (grid_columns, grid_rows) =
            build_grid_from_spreadsheet(&spreadsheet_id, conn)?;

        let now = crate::db::now_iso();

        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            tx.execute(
                "INSERT INTO datagrids (id, name, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?3)",
                params![grid_id, grid_name, now],
            )
            .map_err(|e| e.to_string())?;
            {
                let mut col_stmt = tx
                    .prepare(
                        "INSERT INTO datagrid_columns
                         (id, grid_id, col_index, title, col_type, width, options, hidden)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    )
                    .map_err(|e| e.to_string())?;
                for (i, col) in grid_columns.iter().enumerate() {
                    col_stmt
                        .execute(params![
                            col.id, grid_id, i as i64, col.title, col.col_type,
                            col.width, col.options, 0_i64,
                        ])
                        .map_err(|e| e.to_string())?;
                }
            }
            {
                let mut row_stmt = tx
                    .prepare(
                        "INSERT INTO datagrid_rows (id, grid_id, row_index, data)
                         VALUES (?1, ?2, ?3, ?4)",
                    )
                    .map_err(|e| e.to_string())?;
                for (i, row) in grid_rows.iter().enumerate() {
                    row_stmt
                        .execute(params![row.id, grid_id, i as i64, row.data])
                        .map_err(|e| e.to_string())?;
                }
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(grid_id)
    })
}

/// Delete a datagrid (cascades to columns and rows).
#[tauri::command]
pub fn datagrid_delete(state: State<'_, Db>, root: String, id: String) -> Result<(), String> {
    with_db(&state, &root, |conn| {
        conn.execute("DELETE FROM datagrids WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Rename a datagrid.
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

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn test_schema(conn: &rusqlite::Connection) {
        conn.execute_batch(crate::db::SCHEMA_V4).unwrap();
    }

    fn col(id: &str, title: &str) -> DatagridColumnDef {
        DatagridColumnDef {
            id: id.to_string(),
            title: title.to_string(),
            col_type: "text".to_string(),
            width: 120,
            options: None,
            hidden: false,
        }
    }

    fn row(id: &str, data: &str) -> DatagridRow {
        DatagridRow {
            id: id.to_string(),
            data: data.to_string(),
        }
    }

    fn grid_ids(conn: &rusqlite::Connection) -> Vec<String> {
        let mut stmt = conn.prepare("SELECT id FROM datagrids").unwrap();
        stmt.query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect()
    }

    fn count(conn: &rusqlite::Connection, table: &str) -> i64 {
        conn.query_row(
            &format!("SELECT COUNT(*) FROM {table}"),
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap()
    }

    /// Same regression as calendar save: save() must make the grid EXACTLY
    /// match the snapshot — deleted rows/columns must not survive.
    #[test]
    fn save_is_replace_all_not_upsert() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        let now = crate::db::now_iso();
        conn.execute(
            "INSERT INTO datagrids (id, name, created_at, updated_at) VALUES ('g', 'G', ?1, ?1)",
            params![now],
        )
        .unwrap();

        let cols = vec![col("c0", "A"), col("c1", "B")];
        let rows = vec![row("r0", r#"{"c0":"x","c1":"y"}"#), row("r1", r#"{"c0":"z"}"#)];
        save_grid(&mut conn, "g", "G", &cols, &rows).unwrap();
        assert_eq!(count(&conn, "datagrid_columns"), 2);
        assert_eq!(count(&conn, "datagrid_rows"), 2);

        // User deletes a column and a row in the UI → snapshot shrinks.
        let cols = vec![col("c0", "A")];
        let rows = vec![row("r1", r#"{"c0":"z"}"#)];
        save_grid(&mut conn, "g", "G", &cols, &rows).unwrap();
        assert_eq!(
            count(&conn, "datagrid_columns"),
            1,
            "deleted columns must not survive a save"
        );
        assert_eq!(
            count(&conn, "datagrid_rows"),
            1,
            "deleted rows must not survive a save"
        );
    }

    /// Empty snapshot must clear both child tables (keep the grid row).
    #[test]
    fn save_with_empty_snapshot_clears_tables() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        let now = crate::db::now_iso();
        conn.execute(
            "INSERT INTO datagrids (id, name, created_at, updated_at) VALUES ('g', 'G', ?1, ?1)",
            params![now],
        )
        .unwrap();

        save_grid(
            &mut conn,
            "g",
            "G",
            &[col("c0", "A")],
            &[row("r0", r#"{"c0":"x"}"#)],
        )
        .unwrap();
        save_grid(&mut conn, "g", "G", &[], &[]).unwrap();
        assert_eq!(count(&conn, "datagrid_columns"), 0);
        assert_eq!(count(&conn, "datagrid_rows"), 0);
        assert_eq!(grid_ids(&conn), vec!["g"]);
    }

    /// Creating a grid from a spreadsheet must convert matrix → columns + rows.
    #[test]
    fn create_from_spreadsheet_maps_matrix() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        // Fresh test schema needs spreadsheet + datagrid tables.
        conn.execute_batch(crate::db::SCHEMA_V1).unwrap();
        conn.execute_batch(crate::db::SCHEMA_V4).unwrap();
        let now = crate::db::now_iso();
        conn.execute(
            "INSERT INTO spreadsheets (id, name, imported_at, updated_at)
             VALUES ('s1', 'S', ?1, ?1)",
            params![now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spreadsheet_columns (spreadsheet_id, col_index, title, width, type)
             VALUES ('s1', 0, 'Nom', 150, 'text'), ('s1', 1, 'Note', 100, 'number')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spreadsheet_cells (spreadsheet_id, row_index, col_index, value)
             VALUES ('s1', 0, 0, 'Alice'), ('s1', 0, 1, '15'),
                    ('s1', 1, 0, 'Bob'),   ('s1', 1, 1, '17')",
            [],
        )
        .unwrap();

        let (cols, rows) = build_grid_from_spreadsheet("s1", &mut conn).unwrap();

        assert_eq!(cols.len(), 2);
        assert_eq!(cols[0].id, "c0");
        assert_eq!(cols[0].title, "Nom");
        assert_eq!(cols[0].col_type, "text");
        assert_eq!(cols[1].id, "c1");
        assert_eq!(cols[1].col_type, "number");

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].id, "r0");
        assert_eq!(rows[0].data, r#"{"c0":"Alice","c1":"15"}"#);
        assert_eq!(rows[1].data, r#"{"c0":"Bob","c1":"17"}"#);
    }
}
