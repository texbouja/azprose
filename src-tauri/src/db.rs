// ── Shared SQLite backend ───────────────────────────────────────────────────
// Single database: `{root}/.azprose/data.db`
// All structured storage shares this connection + migration chain:
//   - v1/v2: spreadsheet tables (spreadsheets, spreadsheet_columns,
//            spreadsheet_cells, spreadsheet_state)
//   - v3+:   calendar tables (calendar_events)
// Modules métier (spreadsheet_db, calendar_db, ...) only define their own
// tables + commands and go through `db::with_db`.

use rusqlite::Connection;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use tauri::State;

// ── Schema and migration ───────────────────────────────────────────────────
// NOTE: SCHEMA_V1 must stay identical to the schema shipped at v1 — later
// migrations ALTER it (e.g. `styles` column added at v2). Do not backport
// new columns into SCHEMA_V1 or the ALTER will fail on fresh databases.

const SCHEMA_V1: &str = "
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS spreadsheets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    original_path TEXT,
    lazy_type TEXT,
    lazy_source TEXT,
    lazy_config TEXT,
    imported_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spreadsheet_columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spreadsheet_id TEXT NOT NULL REFERENCES spreadsheets(id) ON DELETE CASCADE,
    col_index INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    width INTEGER DEFAULT 120,
    type TEXT DEFAULT 'text',
    options TEXT,
    UNIQUE(spreadsheet_id, col_index)
);

CREATE TABLE IF NOT EXISTS spreadsheet_cells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spreadsheet_id TEXT NOT NULL REFERENCES spreadsheets(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    col_index INTEGER NOT NULL,
    value TEXT DEFAULT '',
    style TEXT DEFAULT '',
    UNIQUE(spreadsheet_id, row_index, col_index)
);

CREATE TABLE IF NOT EXISTS spreadsheet_state (
    spreadsheet_id TEXT PRIMARY KEY REFERENCES spreadsheets(id) ON DELETE CASCADE,
    hidden_columns TEXT DEFAULT '[]',
    hidden_rows TEXT DEFAULT '[]',
    frozen_columns INTEGER DEFAULT 0,
    frozen_rows INTEGER DEFAULT 0,
    sort_column INTEGER,
    sort_order TEXT
);

CREATE INDEX IF NOT EXISTS idx_cells_lookup ON spreadsheet_cells(spreadsheet_id, row_index, col_index);
CREATE INDEX IF NOT EXISTS idx_columns_order ON spreadsheet_columns(spreadsheet_id, col_index);
";

// v3 — calendar events (SVAR Calendar), custom fields in `data` JSONB.
const SCHEMA_V3: &str = "
CREATE TABLE IF NOT EXISTS calendar_events (
    id          TEXT PRIMARY KEY,
    text        TEXT NOT NULL,
    start       TEXT NOT NULL,
    end         TEXT NOT NULL,
    all_day     INTEGER NOT NULL DEFAULT 0,
    calendar_id TEXT,
    color       TEXT,
    data        TEXT NOT NULL DEFAULT '{}'
);
";

fn init_db(conn: &Connection) -> Result<(), String> {
    let mut version: i32 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap_or(0);

    if version < 1 {
        conn.execute_batch(SCHEMA_V1).map_err(|e| e.to_string())?;
        version = 1;
    }
    if version < 2 {
        conn.execute_batch(
            "ALTER TABLE spreadsheet_state ADD COLUMN styles TEXT DEFAULT '{}';"
        ).map_err(|e| e.to_string())?;
        version = 2;
    }
    if version < 3 {
        conn.execute_batch(SCHEMA_V3).map_err(|e| e.to_string())?;
        version = 3;
    }

    if version > 0 {
        conn.pragma_update(None, "user_version", &version)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── State + with_db helper ─────────────────────────────────────────────────

pub struct Db(pub Mutex<Option<(String, Connection)>>);

pub fn with_db<F, R>(state: &State<Db>, root: &str, f: F) -> Result<R, String>
where
    F: FnOnce(&mut Connection) -> Result<R, String>,
{
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let needs_init = match &*guard {
        Some((r, _)) => r != root,
        None => true,
    };
    if needs_init {
        let db_path = Path::new(root).join(".azprose/data.db");
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        init_db(&conn)?;
        *guard = Some((root.to_string(), conn));
    }
    let (_, conn) = guard.as_mut().unwrap();
    f(conn)
}
