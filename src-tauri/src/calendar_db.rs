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

/// Upsert events (transactional, debounced from the frontend store).
#[tauri::command]
pub fn calendar_events_save(
    state: State<'_, Db>,
    root: String,
    events: String,
) -> Result<(), String> {
    let events: Vec<CalendarEventRow> =
        serde_json::from_str(&events).map_err(|e| format!("invalid events JSON: {e}"))?;

    with_db(&state, &root, |conn| {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt = tx
                .prepare(
                    "INSERT OR REPLACE INTO calendar_events
                     (id, text, start, end, all_day, calendar_id, color, data)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                )
                .map_err(|e| e.to_string())?;
            for ev in &events {
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
    })
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
