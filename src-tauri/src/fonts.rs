//! System font enumeration.
//!
//! Exposes the list of every font family installed on the system via the
//! `fontdb` crate (fontconfig backend on Linux). The frontend builds a runtime
//! font store from this list to validate custom font names word-by-word.

use fontdb::Database;

/// Enumerate all system font family names (sorted, deduplicated).
///
/// Returns the original family spelling (e.g. "Fira Sans"), not a normalized
/// form — the frontend lowercases for lookups.
#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    let mut db = Database::new();
    db.load_system_fonts();

    let mut names: Vec<String> = db
        .faces()
        .flat_map(|face| face.families.iter().map(|(name, _)| name.clone()))
        .collect();

    names.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    names
}
