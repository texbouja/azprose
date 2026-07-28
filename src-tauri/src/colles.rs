use calamine::{open_workbook_auto, Data, Reader};
use serde::{Deserialize, Serialize};
use std::fs;

use tauri::command;

#[derive(Serialize, Deserialize)]
pub struct ParsedCreneau {
    pub matiere: String,
    pub colleur: String,
    pub jour: String,
    pub horaire: String,
    pub salle: String,
    pub classe: String,
}

#[derive(Serialize, Deserialize)]
pub struct ParsedSemaine {
    pub date: String,
    pub label: String,
}

#[derive(Serialize, Deserialize)]
pub struct ParsedAssignation {
    pub creneau_index: usize,
    pub semaine_index: usize,
    pub groupe: String,
}

#[derive(Serialize, Deserialize)]
pub struct ParsedEleve {
    pub nom: String,
    pub prenom: String,
    pub classe: String,
    pub groupe: String,
    pub email: String,
}

#[derive(Serialize, Deserialize)]
pub struct ParsedColloscope {
    pub semaines: Vec<ParsedSemaine>,
    pub creneaux: Vec<ParsedCreneau>,
    pub assignations: Vec<ParsedAssignation>,
    pub eleves: Vec<ParsedEleve>,
    pub classes: Vec<String>,
}

fn cell_str(row: &[Data], idx: usize) -> String {
    row.get(idx)
        .and_then(|c| match c {
            Data::String(s) => Some(s.trim().to_string()),
            Data::Float(f) => Some(format!("{}", *f as i64)),
            Data::Int(i) => Some(format!("{i}")),
            _ => None,
        })
        .unwrap_or_default()
}

#[command]
pub fn parse_colloscope_xlsx(path: String) -> Result<ParsedColloscope, String> {
    let mut workbook = open_workbook_auto(&path)
        .map_err(|e| format!("open xlsx: {e}"))?;

    let sheet_names: Vec<String> = workbook.sheet_names().to_vec();

    // Find the main Coloscope sheet or fall back to first sheet with class data
    let main_sheet = sheet_names.iter().find(|n| n.as_str() == "Coloscope")
        .or_else(|| sheet_names.iter().find(|n| n.starts_with("MP")))
        .ok_or("no colloscope sheet found")?;

    let range = workbook.worksheet_range(main_sheet)
        .map_err(|e| format!("read sheet: {e}"))?;

    let rows: Vec<Vec<Data>> = range.rows().map(|r| r.to_vec()).collect();

    // Parse semaines from header row (find row with dates or "Semaine" labels)
    let mut semaine_row_idx = None;
    for (i, row) in rows.iter().enumerate() {
        let has_dates = row.iter().any(|c| matches!(c, Data::DateTime(_) | Data::Float(_)));
        let has_semaine_label = (6..row.len()).any(|col| {
            let s = cell_str(row, col);
            s.starts_with("Semaine ") || s.starts_with("S ")
        });
        if has_dates || has_semaine_label {
            semaine_row_idx = Some(i);
            break;
        }
    }

    let semaine_row = semaine_row_idx.ok_or("no semaine header row found")?;

    // Extract semaines from columns G onwards — accept dates OR "Semaine N" labels
    let mut semaines = Vec::new();
    let header_row = &rows[semaine_row];
    for col in 6..header_row.len() {
        let cell = &header_row[col];
        match cell {
            Data::DateTime(d) => {
                let date_str = (*d)
                    .as_datetime()
                    .map(|dt| dt.format("%Y-%m-%d").to_string())
                    .unwrap_or_else(|| "2000-01-01".into());
                semaines.push(ParsedSemaine {
                    date: date_str,
                    label: format!("S{}", semaines.len() + 1),
                });
            }
            Data::Float(f) => {
                let serial = *f as f64;
                if serial > 40000.0 && serial < 50000.0 {
                    let dt = chrono::DateTime::from_timestamp(
                        ((serial - 25569.0) * 86400.0) as i64, 0,
                    );
                    if let Some(dt) = dt {
                        semaines.push(ParsedSemaine {
                            date: dt.format("%Y-%m-%d").to_string(),
                            label: format!("S{}", semaines.len() + 1),
                        });
                    }
                }
            }
            Data::String(s) => {
                let trimmed = s.trim();
                // "Semaine N" pattern
                if let Some(n) = trimmed.strip_prefix("Semaine ") {
                    let n = n.trim();
                    semaines.push(ParsedSemaine {
                        date: String::new(),
                        label: format!("S{}", n),
                    });
                } else if trimmed.starts_with("20") && trimmed.len() == 10 {
                    // ISO date string
                    semaines.push(ParsedSemaine {
                        date: trimmed.to_string(),
                        label: format!("S{}", semaines.len() + 1),
                    });
                } else {
                    continue; // skip non-date, non-semaine cells
                }
            }
            _ => {}
        }
    }

    if semaines.is_empty() {
        return Err("no semaines found in header".into());
    }

    // Parse class sections — each section starts with a class label in column A
    let mut creneaux = Vec::new();
    let mut assignations = Vec::new();
    let mut classes = Vec::new();

    // Also parse student sheets
    let mut eleves = Vec::new();

    // Find all class sections by scanning for class labels
    let mut current_class = String::new();

    for (_i, row) in rows.iter().enumerate() {
        let a = cell_str(row, 0);
        // Class labels: "MP*1", "MP*2", "MP1", "MP2"
        if a.starts_with("MP") && row.len() > 5 {
            // Check if this is a header row (has "Matière" in B)
            let b = cell_str(row, 1);
            if b == "Matière" || b == "Nom Colleur" {
                current_class = a.clone();
                if !classes.contains(&current_class) {
                    classes.push(current_class.clone());
                }
                continue;
            }
        }

        // Data rows: have matière in B, colleur in C, jour in D
        if !current_class.is_empty() {
            let matiere = cell_str(row, 1);
            let colleur = cell_str(row, 2);
            let jour = cell_str(row, 3);
            let horaire = cell_str(row, 4);
            let salle = cell_str(row, 5);

            if matiere.is_empty() || jour.is_empty() {
                continue;
            }

            // Skip TP Chimie (different format, not a standard colle)
            if matiere.contains("TP Chimie") {
                continue;
            }

            let creneau_idx = creneaux.len();
            creneaux.push(ParsedCreneau {
                matiere,
                colleur: if colleur.is_empty() { "—".into() } else { colleur },
                jour,
                horaire,
                salle,
                classe: current_class.clone(),
            });

            // Parse assignations for this creneau
            for col in 6..row.len().min(6 + semaines.len()) {
                let groupe = cell_str(row, col);
                if !groupe.is_empty() && groupe.starts_with('G') {
                    assignations.push(ParsedAssignation {
                        creneau_index: creneau_idx,
                        semaine_index: col - 6,
                        groupe,
                    });
                }
            }
        }
    }

    // Parse student sheets (Feuil1, Groupes, etc.)
    for sheet_name in &sheet_names {
        if sheet_name.starts_with("Feuil") || sheet_name.as_str() == "Groupes" {
            if let Ok(student_range) = workbook.worksheet_range(sheet_name) {
                let student_rows: Vec<Vec<Data>> = student_range.rows().map(|r| r.to_vec()).collect();
                for row in &student_rows[1..] {
                    // Skip header rows
                    let nom = cell_str(row, 0);
                    let prenom = cell_str(row, 1);
                    let classe = cell_str(row, 2);
                    let groupe = cell_str(row, 3);

                    if nom.is_empty() || !classe.starts_with("MP") {
                        continue;
                    }

                    // Deduplicate
                    let id = format!("{}-{}-{}", nom.to_uppercase(), prenom.to_uppercase(), classe);
                    if !eleves.iter().any(|e: &ParsedEleve| {
                        format!("{}-{}-{}", e.nom.to_uppercase(), e.prenom.to_uppercase(), e.classe) == id
                    }) {
                        eleves.push(ParsedEleve {
                            nom: nom.to_uppercase(),
                            prenom,
                            classe,
                            groupe,
                            email: String::new(),
                        });
                    }
                }
            }
        }
    }

    Ok(ParsedColloscope {
        semaines,
        creneaux,
        assignations,
        eleves,
        classes,
    })
}

fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    for ch in line.chars() {
        match ch {
            '"' if in_quotes => in_quotes = false,
            '"' if !in_quotes => in_quotes = true,
            ',' if !in_quotes => {
                fields.push(current.trim().to_string());
                current = String::new();
            }
            _ => current.push(ch),
        }
    }
    fields.push(current.trim().to_string());
    fields
}

#[command]
pub fn parse_colloscope_csv(path: String) -> Result<ParsedColloscope, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("read csv: {e}"))?;

    let lines: Vec<String> = content.lines()
        .map(|l| l.trim_end().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    if lines.is_empty() {
        return Err("empty csv file".into());
    }

    let header = parse_csv_line(&lines[0]);
    if header.len() < 6 {
        return Err("csv must have at least 6 columns: Matière,Colleur,Jour,Créneau,Salle,<semaines...>".into());
    }

    // Verify first header is Matière
    if !header[0].eq_ignore_ascii_case("Matière") && !header[0].eq_ignore_ascii_case("Matiere") {
        return Err(format!("column A must be 'Matière', got '{}'", header[0]));
    }

    // Extract semaines from columns 5+ — use raw header text as label
    let mut semaines = Vec::new();
    for col in 5..header.len() {
        let raw = header[col].trim();
        if raw.is_empty() {
            continue;
        }
        semaines.push(ParsedSemaine {
            date: String::new(),
            label: raw.to_string(),
        });
    }

    if semaines.is_empty() {
        return Err("no semaines found in header columns (F+)".into());
    }

    let mut creneaux = Vec::new();
    let mut assignations = Vec::new();

    for line in &lines[1..] {
        let cols = parse_csv_line(line);
        if cols.len() < 6 {
            continue;
        }

        let matiere = cols[0].clone();
        let colleur = cols[1].clone();
        let jour = cols[2].clone();
        let horaire = cols[3].clone();
        let salle = cols[4].clone();

        if matiere.is_empty() || jour.is_empty() {
            continue;
        }

        let creneau_idx = creneaux.len();
        creneaux.push(ParsedCreneau {
            matiere,
            colleur: if colleur.is_empty() { "—".into() } else { colleur },
            jour,
            horaire,
            salle,
            classe: String::new(),
        });

        // Assignations from columns 5+
        for col in 5..cols.len().min(5 + semaines.len()) {
            let groupe = cols[col].clone();
            if !groupe.is_empty() {
                assignations.push(ParsedAssignation {
                    creneau_index: creneau_idx,
                    semaine_index: col - 5,
                    groupe,
                });
            }
        }
    }

    if creneaux.is_empty() {
        return Err("no creneaux found in csv data rows".into());
    }

    Ok(ParsedColloscope {
        semaines,
        creneaux,
        assignations,
        eleves: Vec::new(),
        classes: Vec::new(),
    })
}

#[derive(Serialize, Deserialize)]
pub struct ParsedElevesCsv {
    pub eleves: Vec<ParsedEleve>,
}

#[command]
pub fn parse_eleves_csv(path: String) -> Result<ParsedElevesCsv, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("read csv: {e}"))?;

    let lines: Vec<String> = content.lines()
        .map(|l| l.trim_end().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    if lines.is_empty() {
        return Err("empty csv file".into());
    }

    let header = parse_csv_line(&lines[0]);
    if header.len() < 6 {
        return Err("csv must have at least 6 columns: ID,Nom,Prénom,Classe,Groupe,Email".into());
    }

    // Map header names to column indices (case-insensitive, flexible)
    let find_col = |name: &str| -> Option<usize> {
        header.iter().position(|h| h.eq_ignore_ascii_case(name))
    };

    let col_id = find_col("ID").or_else(|| find_col("id"));
    let col_nom = find_col("Nom").or_else(|| find_col("nom"));
    let col_prenom = find_col("Prénom").or_else(|| find_col("Prenom")).or_else(|| find_col("prenom"));
    let col_classe = find_col("Classe").or_else(|| find_col("classe"));
    let col_groupe = find_col("Groupe").or_else(|| find_col("groupe"));
    let col_email = find_col("Email").or_else(|| find_col("email"));

    // If named headers not found, fall back to positional (first 6 cols)
    let (_i_id, i_nom, i_prenom, i_classe, i_groupe, i_email) = match (col_id, col_nom, col_prenom, col_classe, col_groupe, col_email) {
        (Some(a), Some(b), Some(c), Some(d), Some(e), Some(f)) => (a, b, c, d, e, f),
        _ => (0, 1, 2, 3, 4, 5),
    };

    let mut eleves = Vec::new();

    for line in &lines[1..] {
        let cols = parse_csv_line(line);
        if cols.len() < 6 {
            continue;
        }

        let nom = cols.get(i_nom).cloned().unwrap_or_default();
        let prenom = cols.get(i_prenom).cloned().unwrap_or_default();
        let classe = cols.get(i_classe).cloned().unwrap_or_default();
        let groupe = cols.get(i_groupe).cloned().unwrap_or_default();
        let email = cols.get(i_email).cloned().unwrap_or_default();

        if nom.is_empty() && prenom.is_empty() {
            continue;
        }

        eleves.push(ParsedEleve {
            nom,
            prenom,
            classe,
            groupe,
            email,
        });
    }

    Ok(ParsedElevesCsv { eleves })
}

