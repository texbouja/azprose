// ── Datagrid stack rules SQLite backend ─────────────────────────────────────
// Table: datagrid_stack_rules (created by db.rs migration v10). The unified
// multi-criteria filter of the "Recherche dans la base de données" stack: one
// rule per column TITLE (field = title), applied to every grid in the stack
// that has that column. Rules are GLOBAL to the stack — they are not per-view
// (per-view rules would live in datagrid_columns.filter). Stored as opaque
// JSON (an @svar-ui `IFilter` without `field` — the field IS the title) with
// the same replace-all snapshot contract as calendar/datagrid.

use crate::db::{Db, with_db};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Clone)]
pub struct StackRule {
    /// Column title (the rule's field, shared across every grid).
    pub field: String,
    /// Opaque JSON rule: `{"filter":<predicate id>,"type":<type>,"value":<v>}`.
    pub rule: String,
    pub updated_at: String,
}

/// List all stack rules (alphabetical — the frontend rebuilds its Map).
#[tauri::command]
pub fn datagrid_stack_rules_get(
    state: State<'_, Db>,
    root: String,
) -> Result<Vec<StackRule>, String> {
    with_db(&state, &root, |conn| {
        let mut stmt = conn
            .prepare("SELECT field, rule, updated_at FROM datagrid_stack_rules ORDER BY field")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(StackRule {
                    field: row.get(0)?,
                    rule: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    updated_at: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    })
}

/// Replace-all save of the rules snapshot (pure form — unit-testable).
fn save_rules(
    conn: &mut rusqlite::Connection,
    rules: &[StackRule],
    now: &str,
) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        tx.execute("DELETE FROM datagrid_stack_rules", [])
            .map_err(|e| e.to_string())?;
        {
            let mut stmt = tx
                .prepare(
                    "INSERT INTO datagrid_stack_rules (field, rule, updated_at)
                     VALUES (?1, ?2, ?3)",
                )
                .map_err(|e| e.to_string())?;
            for r in rules {
                stmt.execute(params![r.field, r.rule, now])
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Replace-all save (same contract as calendar/datagrid): the frontend always
/// sends the complete rules snapshot, so the table must EXACTLY match it —
/// rules dropped from the payload (e.g. cleared by the user) are deleted.
#[tauri::command]
pub fn datagrid_stack_rules_save(
    state: State<'_, Db>,
    root: String,
    rules: String,
) -> Result<(), String> {
    let rules: Vec<StackRule> = serde_json::from_str(&rules)
        .map_err(|e| format!("invalid rules JSON: {e}"))?;
    let now = crate::db::now_iso();
    with_db(&state, &root, |conn| save_rules(conn, &rules, &now))
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn test_schema(conn: &rusqlite::Connection) {
        conn.execute_batch(crate::db::SCHEMA_V1).unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS datagrid_stack_rules (
                 field      TEXT PRIMARY KEY,
                 rule       TEXT NOT NULL,
                 updated_at TEXT NOT NULL
             );",
        )
        .unwrap();
    }

    fn count(conn: &rusqlite::Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM datagrid_stack_rules", [], |r| r.get(0))
            .unwrap()
    }

    fn rule(field: &str, rule: &str) -> StackRule {
        StackRule {
            field: field.to_string(),
            rule: rule.to_string(),
            updated_at: String::new(),
        }
    }

    /// Save is replace-all: rules missing from the payload must not survive.
    #[test]
    fn save_is_replace_all_not_upsert() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        let now = crate::db::now_iso();
        conn.execute(
            "INSERT INTO datagrid_stack_rules (field, rule, updated_at)
             VALUES ('Note', '{}', ?1), ('Nom', '{}', ?1)",
            params![now],
        )
        .unwrap();

        save_rules(
            &mut conn,
            &[rule("Note", r#"{"filter":"greaterOrEqual","type":"number","value":"15"}"#)],
            &now,
        )
        .unwrap();

        assert_eq!(count(&conn), 1, "dropped rules must not survive");
        let r: String = conn
            .query_row(
                "SELECT rule FROM datagrid_stack_rules WHERE field = 'Note'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(r, r#"{"filter":"greaterOrEqual","type":"number","value":"15"}"#);
    }

    /// Empty snapshot clears the table.
    #[test]
    fn save_with_empty_snapshot_clears_table() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        let now = crate::db::now_iso();
        conn.execute(
            "INSERT INTO datagrid_stack_rules (field, rule, updated_at)
             VALUES ('Nom', '{}', ?1)",
            params![now],
        )
        .unwrap();

        save_rules(&mut conn, &[], &now).unwrap();

        assert_eq!(count(&conn), 0);
    }

    /// Get returns the persisted rules in stable field order.
    #[test]
    fn get_roundtrips_persisted_rules() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        test_schema(&conn);
        let now = crate::db::now_iso();
        save_rules(
            &mut conn,
            &[
                rule("Note", r#"{"filter":"greaterOrEqual","type":"number","value":"15"}"#),
                rule("Nom", r#"{"filter":"beginsWith","type":"text","value":"A"}"#),
            ],
            &now,
        )
        .unwrap();

        let mut stmt = conn
            .prepare("SELECT field, rule FROM datagrid_stack_rules ORDER BY field")
            .unwrap();
        let rows: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].0, "Nom");
        assert_eq!(rows[1].0, "Note");
        assert_eq!(rows[1].1, r#"{"filter":"greaterOrEqual","type":"number","value":"15"}"#);
    }
}
