// ── Shared SQLite backend ───────────────────────────────────────────────────
// Single database: `{root}/.azprose/data.db`
// All structured storage shares this connection + migration chain:
//   - v1/v2: spreadsheet tables (spreadsheets, spreadsheet_columns,
//            spreadsheet_cells, spreadsheet_state)
//   - v3:    calendar tables (calendar_events)
//   - v4:    datagrid tables (datagrids, datagrid_columns, datagrid_rows)
//   - v5:    datagrids.source_spreadsheet_id (live bridge spreadsheet→grid)
//   - v6:    drop redundant indexes (UNIQUE constraints already cover lookups)
//   - v7:    filter_keywords table (datagrid stack filter suggestions) —
//            DROPPED again at v10 once the text search field was removed
//   - v8:    datagrids become VIEWS over their source spreadsheet — drop
//            autonomous grids + datagrid_rows, add datagrid_columns
//            sort_order/filter (title/type/options come from the JOIN)
//   - v9:    datagrid_columns.id is no longer a global primary key — column
//            identity is per-view (grid_id, col_index); ids are positional
//            `c{n}` and may repeat across views (second view used to collide)
//   - v10:   datagrid_stack_rules — the STACK-wide multi-criteria filter
//            (one rule per column TITLE, shared by every grid in the
//            "Recherche dans la base de données" stack). The old keyword
//            suggestions table (filter_keywords, v7) is dropped — the shared
//            text search field it fed was replaced by the unified filter
//            widget (datagrid_columns.filter stays: per-VIEW rule storage)
// Modules métier (spreadsheet_db, calendar_db, datagrid_db, ...) only define
// their own tables + commands and go through `db::with_db`.

use rusqlite::Connection;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use tauri::State;

// ── Schema and migration ───────────────────────────────────────────────────
// NOTE: SCHEMA_V1 must stay identical to the schema shipped at v1 — later
// migrations ALTER it (e.g. `styles` column added at v2). Do not backport
// new columns into SCHEMA_V1 or the ALTER will fail on fresh databases.

pub(crate) const SCHEMA_V1: &str = "
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

// v4 — SVAR datagrids.
// datagrids            : table metadata (id/name/dates)
// datagrid_columns     : typed column definitions (SVAR editor types, options)
// datagrid_rows        : each row = a JSON `{colId: value}` DataHash blob
//                        (mirrors SVAR's IRow shape, same pattern as the
//                        calendar_events.data JSONB field)
pub(crate) const SCHEMA_V4: &str = "
CREATE TABLE IF NOT EXISTS datagrids (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS datagrid_columns (
    id       TEXT PRIMARY KEY,
    grid_id  TEXT NOT NULL REFERENCES datagrids(id) ON DELETE CASCADE,
    col_index INTEGER NOT NULL,
    title    TEXT NOT NULL DEFAULT '',
    col_type TEXT DEFAULT 'text',
    width    INTEGER DEFAULT 120,
    options  TEXT,
    hidden   INTEGER DEFAULT 0,
    UNIQUE(grid_id, col_index)
);

CREATE TABLE IF NOT EXISTS datagrid_rows (
    id       TEXT PRIMARY KEY,
    grid_id  TEXT NOT NULL REFERENCES datagrids(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    data     TEXT NOT NULL DEFAULT '{}',
    UNIQUE(grid_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_grid_columns ON datagrid_columns(grid_id, col_index);
CREATE INDEX IF NOT EXISTS idx_grid_rows ON datagrid_rows(grid_id, row_index);
";

// v8 migration as a pure function so unit tests can apply it on a fresh
// in-memory schema (and assert the autonomous-grid cleanup + drop table).
pub(crate) fn migrate_v8(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(
        // Autonomous grids (no source) were the only users of datagrid_rows;
        // their data dies with them. Linked grids keep their identity and the
        // bridge link — only the duplicated rows table goes away.
        "BEGIN;
         DELETE FROM datagrids WHERE source_spreadsheet_id IS NULL;
         DROP TABLE IF EXISTS datagrid_rows;
         ALTER TABLE datagrid_columns ADD COLUMN sort_order TEXT;
         ALTER TABLE datagrid_columns ADD COLUMN filter TEXT;
         COMMIT;"
    ).map_err(|e| e.to_string())
}

// v9 migration as a pure function. v8's column ids are POSITIONAL (`c{col_index}`,
// derived from col_index) yet datagrid_columns.id was a GLOBAL primary key:
// creating a second view over another spreadsheet re-inserted `c0..cN` and
// failed with "UNIQUE constraint failed: datagrid_columns.id". v9 recreates the
// table WITHOUT the global PK — column identity is per-view `(grid_id,
// col_index)` (already UNIQUE); `id` stays `c{n}` as a plain derived value. The
// UNIQUE(grid_id, col_index) index covers the grid lookups (same reasoning as
// the v6 index drop).
pub(crate) fn migrate_v9(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(
        "BEGIN;
         CREATE TABLE datagrid_columns_v9 (
             id         TEXT NOT NULL,
             grid_id    TEXT NOT NULL REFERENCES datagrids(id) ON DELETE CASCADE,
             col_index  INTEGER NOT NULL,
             title      TEXT NOT NULL DEFAULT '',
             col_type   TEXT DEFAULT 'text',
             width      INTEGER DEFAULT 120,
             options    TEXT,
             hidden     INTEGER DEFAULT 0,
             sort_order TEXT,
             filter     TEXT,
             UNIQUE(grid_id, col_index)
         );
         INSERT INTO datagrid_columns_v9
             (id, grid_id, col_index, title, col_type, width, options, hidden, sort_order, filter)
             SELECT id, grid_id, col_index, title, col_type, width, options, hidden, sort_order, filter
             FROM datagrid_columns;
         DROP TABLE datagrid_columns;
         ALTER TABLE datagrid_columns_v9 RENAME TO datagrid_columns;
         COMMIT;"
    ).map_err(|e| e.to_string())
}

fn init_db(conn: &Connection) -> Result<(), String> {
    // Per-connection pragma (not persisted in the DB file): WAL mode with
    // synchronous=NORMAL is the recommended fast+safe combo — a crash may
    // lose recent frames on checkpoint but can never corrupt the database.
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| e.to_string())?;

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
    if version < 4 {
        conn.execute_batch(SCHEMA_V4).map_err(|e| e.to_string())?;
        version = 4;
    }
    // v5 — live bridge: a datagrid can be derived from a spreadsheet.
    if version < 5 {
        conn.execute_batch(
            "ALTER TABLE datagrids ADD COLUMN source_spreadsheet_id TEXT;"
        ).map_err(|e| e.to_string())?;
        version = 5;
    }
    // v6 — perf: the UNIQUE(spreadsheet_id, col_index) and
    // UNIQUE(spreadsheet_id, row_index, col_index) constraints already build
    // the exact indexes every query needs (WHERE spreadsheet_id + ORDER BY
    // index). The extra idx_cells_lookup / idx_columns_order indexes only
    // doubled the write cost of every INSERT without speeding up reads.
    if version < 6 {
        conn.execute_batch(
            "DROP INDEX IF EXISTS idx_cells_lookup;
             DROP INDEX IF EXISTS idx_columns_order;"
        ).map_err(|e| e.to_string())?;
        version = 6;
    }
    // v7 — filter keywords: persistent store of every filter keyword with its
    // detected type (text/number/date/tuple), feeding value suggestions in the
    // datagrid stack filter across sessions.
    if version < 7 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS filter_keywords (
                keyword  TEXT PRIMARY KEY,
                type     TEXT NOT NULL DEFAULT 'text',
                last_used TEXT NOT NULL
            );"
        ).map_err(|e| e.to_string())?;
    }
    // v8 — datagrids become VIEWS over their source spreadsheet. The data
    // (rows) is no longer duplicated in datagrid_rows: it is read live from
    // spreadsheet_cells, the single source of truth shared with the tableur.
    // Autonomous grids (no source_spreadsheet_id) were the only users of
    // datagrid_rows — they are dropped. datagrid_columns keeps only per-view
    // config (width/hidden + new sort_order/filter); title/type/options now
    // come from spreadsheet_columns via the JOIN.
    // NOTE: guarded like every other migration — without the `version < 8`
    // check, a base already at v8 would re-run the ALTERs and fail with
    // "duplicate column name: sort_order" on every re-open (init_db runs on
    // every connection).
    if version < 8 {
        migrate_v8(conn).map_err(|e| e.to_string())?;
        version = 8;
    }
    // v9 — datagrid_columns.id was a GLOBAL primary key but the column ids are
    // positional (`c{col_index}`, derived): the second view over another
    // spreadsheet collided ("UNIQUE constraint failed: datagrid_columns.id").
    // Recreate the table with identity on (grid_id, col_index) instead.
    if version < 9 {
        migrate_v9(conn).map_err(|e| e.to_string())?;
        version = 9;
    }
    // v10 — the unified stack filter widget. Rules are GLOBAL to the stack
    // (keyed by column TITLE, applied to every grid that has that column),
    // stored here as replace-all rows. The v7 keyword-suggestion table is no
    // longer used — the text-search field it fed is gone.
    if version < 10 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS datagrid_stack_rules (
                 field      TEXT PRIMARY KEY,
                 rule       TEXT NOT NULL,
                 updated_at TEXT NOT NULL
             );
             DROP TABLE IF EXISTS filter_keywords;"
        )
        .map_err(|e| e.to_string())?;
        version = 10;
    }

    if version > 0 {
        conn.pragma_update(None, "user_version", &version)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── State + with_db helper ─────────────────────────────────────────────────

pub struct Db(pub Mutex<Option<(String, Connection)>>);

/// Current timestamp in RFC 3339 (UTC) — shared by all module backends
/// for `created_at` / `updated_at` columns.
pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

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

#[cfg(test)]
mod tests {
    use super::*;

    /// init_db runs on EVERY connection open (with_db re-opens per root change
    /// or app restart). A migration chain with an unguarded step re-runs its
    /// ALTERs on a base that already reached that version — the v8 bug
    /// ("duplicate column name: sort_order", every command failing at runtime)
    /// was exactly this. Calling init_db twice on the same connection must be
    /// a no-op.
    #[test]
    fn init_db_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).expect("first init succeeds");
        init_db(&conn).expect("second init is a no-op — every migration is guarded");
        let version: i32 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(version, 10);
        // The v8 columns exist exactly once.
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('datagrid_columns')
                 WHERE name IN ('sort_order', 'filter')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
        // v9: no global PK on id anymore (two views may share `c0` ids).
        let pk: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('datagrid_columns') WHERE pk = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pk, 0, "v9 removes the global primary key on datagrid_columns");
        // v10: stack rules table exists; the v7 keyword table is gone.
        let rules: i64 = conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='datagrid_stack_rules'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rules, 1, "v10 creates datagrid_stack_rules");
        let kw: i64 = conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='filter_keywords'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kw, 0, "v10 drops the unused filter_keywords table");
    }
}
