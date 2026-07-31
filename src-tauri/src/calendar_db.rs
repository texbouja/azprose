// ── Calendar SQLite backend ─────────────────────────────────────────────────
// Table: calendar_events (created by db.rs SCHEMA_V3)
// Events are stored as typed columns (id/text/start/end/all_day/calendar_id/color)
// + a `data` JSONB blob for all custom fields (rrule, exdates, persons,
// location, priority, ...). This mirrors SVAR's provider serialization:
// everything JSON.stringify'd except the date fields.

use crate::db::{Db, with_db};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Clone)]
pub struct CalendarEventRow {
    pub id: String,
    pub text: String,
    pub start: String,
    pub end: String,
    #[serde(default)]
    pub all_day: bool,
    #[serde(default)]
    pub calendar_id: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub data: String,
}

/// Load all calendar events (ascending start order).
#[tauri::command]
pub fn calendar_events_get(
    state: State<'_, Db>,
    root: String,
) -> Result<Vec<CalendarEventRow>, String> {
    with_db(&state, &root, |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, text, start, end, all_day, calendar_id, color, data
                 FROM calendar_events ORDER BY start",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(CalendarEventRow {
                    id: row.get(0)?,
                    text: row.get(1)?,
                    start: row.get(2)?,
                    end: row.get(3)?,
                    all_day: row.get::<_, i64>(4)? != 0,
                    calendar_id: row.get(5)?,
                    color: row.get(6)?,
                    data: row.get::<_, Option<String>>(7)?.unwrap_or_else(|| "{}".to_string()),
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    })
}

/// Replace-all save (transactional, debounced from the frontend store).
///
/// The frontend always sends the complete event list (snapshot), so this
/// command must make the table EXACTLY match that list: rows missing from
/// the payload are deleted. A plain upsert would leave deleted events behind
/// (they would reappear on next load).
/// Core replace-all logic (exposed for unit tests; Tauri command wraps it).
fn save_events(conn: &mut rusqlite::Connection, events: &[CalendarEventRow]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        tx.execute("DELETE FROM calendar_events", [])
            .map_err(|e| e.to_string())?;
        let mut stmt = tx
            .prepare(
                "INSERT INTO calendar_events
                 (id, text, start, end, all_day, calendar_id, color, data)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )
            .map_err(|e| e.to_string())?;
        for ev in events {
            stmt.execute(params![
                ev.id,
                ev.text,
                ev.start,
                ev.end,
                ev.all_day as i64,
                ev.calendar_id,
                ev.color,
                ev.data,
            ])
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn calendar_events_save(
    state: State<'_, Db>,
    root: String,
    events: String,
) -> Result<(), String> {
    let events: Vec<CalendarEventRow> =
        serde_json::from_str(&events).map_err(|e| format!("invalid events JSON: {e}"))?;

    with_db(&state, &root, |conn| save_events(conn, &events))
}

/// Delete a single event by id.
#[tauri::command]
pub fn calendar_events_delete(
    state: State<'_, Db>,
    root: String,
    id: String,
) -> Result<(), String> {
    with_db(&state, &root, |conn| {
        conn.execute("DELETE FROM calendar_events WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Delete all events (used by "clear calendar").
#[tauri::command]
pub fn calendar_events_clear(state: State<'_, Db>, root: String) -> Result<(), String> {
    with_db(&state, &root, |conn| {
        conn.execute("DELETE FROM calendar_events", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn test_schema(conn: &rusqlite::Connection) {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS calendar_events (
                id          TEXT PRIMARY KEY,
                text        TEXT NOT NULL,
                start       TEXT NOT NULL,
                end         TEXT NOT NULL,
                all_day     INTEGER NOT NULL DEFAULT 0,
                calendar_id TEXT,
                color       TEXT,
                data        TEXT NOT NULL DEFAULT '{}'
            );",
        )
        .unwrap();
    }

    fn row(id: &str, text: &str, start: &str) -> CalendarEventRow {
        CalendarEventRow {
            id: id.to_string(),
            text: text.to_string(),
            start: start.to_string(),
            end: start.to_string(),
            all_day: false,
            calendar_id: None,
            color: None,
            data: "{}".to_string(),
        }
    }

    fn ids(conn: &rusqlite::Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT id FROM calendar_events ORDER BY start")
            .unwrap();
        stmt.query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect()
    }

    /// Regression test for the "deleted events reappear" bug: save() must
    /// make the table EXACTLY match the snapshot, deleting rows absent from it.
    #[test]
    fn save_is_replace_all_not_upsert() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);

        save_events(&mut conn, &[row("a", "Alpha", "2026-01-01T08:00:00Z")]).unwrap();
        save_events(
            &mut conn,
            &[
                row("a", "Alpha", "2026-01-01T08:00:00Z"),
                row("b", "Beta", "2026-01-02T08:00:00Z"),
            ],
        )
        .unwrap();
        assert_eq!(ids(&conn), vec!["a", "b"]);

        // User deletes "Alpha" in the UI → snapshot no longer contains it.
        save_events(&mut conn, &[row("b", "Beta", "2026-01-02T08:00:00Z")]).unwrap();
        assert_eq!(
            ids(&conn),
            vec!["b"],
            "deleted events must not survive a save"
        );
    }

    /// Empty snapshot must clear the whole table.
    #[test]
    fn save_with_empty_snapshot_clears_table() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);

        save_events(&mut conn, &[row("a", "Alpha", "2026-01-01T08:00:00Z")]).unwrap();
        save_events(&mut conn, &[]).unwrap();
        assert!(ids(&conn).is_empty());
    }
}
