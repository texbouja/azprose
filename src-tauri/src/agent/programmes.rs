//! Noyau des programmes officiels — analyse et verdict de périmètre.
//!
//! **Lecture seule de bout en bout.** Rien ici n'écrit, ne compile ni ne
//! convertit : les fichiers indexés sont préparés HORS de l'application
//! (chantier distinct) et livrés. Voir `opencode-plan-rectificatif.md` §4.1.
//!
//! Le format normatif est un FICHIER, pas une description :
//! `src/programmes/mp-mpi-mathematiques.md`. Il porte sa propre légende.
//!
//! Règle de verdict (§5.4) : on lit **l'étiquette**, jamais la tournure. Le
//! texte officiel emploie au moins six formulations pour deux statuts — « hors
//! programme », « n'est pas exigible », « n'est exigible que pour », « n'est
//! pas un objectif du programme », « n'est pas un attendu du programme », « on
//! se limite à ». C'est le préparateur qui tranche, une fois.

use std::path::{Path, PathBuf};

use serde::Serialize;

// ── Étiquettes ──────────────────────────────────────────────────────────────

/// Les quatre intitulés du gabarit, plus l'absence d'intitulé.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Etiquette {
    /// Contenu de programme, sans restriction — colonne de gauche du BO.
    Aucune,
    /// Précision, notation, capacité attendue. Ne restreint rien.
    Commentaire,
    /// Restriction de portée ou d'ambition.
    Limite,
    /// Au programme, mais non exigible (démonstration, activité).
    NonExigible,
    /// EXCLU : ne doit pas être traité, ne peut faire l'objet d'aucune
    /// évaluation. Seule mention prohibitive.
    HorsProgramme,
}

impl Etiquette {
    fn depuis_ligne(ligne: &str) -> Option<(Etiquette, String)> {
        for (prefixe, etiquette) in [
            ("**Hors programme.**", Etiquette::HorsProgramme),
            ("**Non exigible.**", Etiquette::NonExigible),
            ("**Limite.**", Etiquette::Limite),
            ("**Commentaire.**", Etiquette::Commentaire),
        ] {
            if let Some(reste) = ligne.trim_start().strip_prefix(prefixe) {
                return Some((etiquette, reste.trim().to_string()));
            }
        }
        None
    }

    /// Verdict qu'une occurrence sous cette étiquette entraîne.
    fn statut(self) -> &'static str {
        match self {
            // Le texte d'un commentaire précise un contenu qui EST au
            // programme : il ne restreint pas.
            Etiquette::Aucune | Etiquette::Commentaire => "dans",
            Etiquette::Limite | Etiquette::NonExigible => "limitrophe",
            Etiquette::HorsProgramme => "hors",
        }
    }
}

/// Sévérité, pour départager plusieurs occurrences (plus grand = plus strict).
fn severite(statut: &str) -> u8 {
    match statut {
        "hors" => 3,
        "limitrophe" => 2,
        "dans" => 1,
        _ => 0,
    }
}

// ── Modèle ──────────────────────────────────────────────────────────────────

fn chemin_en_texte<S: serde::Serializer>(p: &PathBuf, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_str(&p.to_string_lossy())
}

#[derive(Clone, Serialize)]
pub struct Programme {
    pub id: String,
    pub filiere: Vec<String>,
    pub matiere: Option<String>,
    pub niveau: Option<String>,
    pub source: Option<String>,
    pub statut: Option<String>,
    pub couverture: Vec<String>,
    /// `"livre"` (corpus installé) ou `"vault"` (échappatoire de l'utilisateur).
    pub origine: String,
    /// Chemin absolu — exposé au front pour les actions « éditer » et
    /// « supprimer » du panneau de réglages.
    #[serde(serialize_with = "chemin_en_texte")]
    pub chemin: PathBuf,
    #[serde(skip)]
    pub contenu: String,
}

impl Programme {
    /// Identité au sens de la précédence : filière + matière + niveau.
    fn identite(&self) -> (Vec<String>, Option<String>, Option<String>) {
        let mut f = self.filiere.clone();
        f.sort();
        (f, self.matiere.clone(), self.niveau.clone())
    }

    pub fn correspond(&self, filiere: &str, matiere: Option<&str>, niveau: Option<&str>) -> bool {
        let f = self.filiere.iter().any(|x| x.eq_ignore_ascii_case(filiere));
        let m = matiere.is_none_or(|m| {
            self.matiere.as_deref().is_some_and(|x| x.eq_ignore_ascii_case(m))
        });
        let n = niveau.is_none_or(|n| {
            self.niveau.as_deref().is_some_and(|x| x.eq_ignore_ascii_case(n))
        });
        f && m && n
    }
}

#[derive(Clone, Serialize)]
pub struct Citation {
    pub id: String,
    pub section: String,
    pub texte: String,
}

// ── Analyse du front matter ─────────────────────────────────────────────────

/// Analyseur du front matter de NOTRE format — pas un analyseur YAML général.
/// Les champs sont connus et simples : scalaires, liste en ligne
/// (`[MP, MPI]`) et liste en bloc (`- …`). Une dépendance YAML complète
/// coûterait plus qu'elle ne rapporte ici, et le format est sous notre
/// contrôle (le gabarit est un fichier du dépôt).
fn parse_front_matter(contenu: &str) -> (Vec<(String, Vec<String>)>, usize) {
    let lignes: Vec<&str> = contenu.lines().collect();
    if lignes.first().map(|l| l.trim()) != Some("---") {
        return (Vec::new(), 0);
    }
    let fin = match lignes.iter().skip(1).position(|l| l.trim() == "---") {
        Some(p) => p + 1,
        None => return (Vec::new(), 0),
    };

    let mut champs: Vec<(String, Vec<String>)> = Vec::new();
    let mut i = 1;
    while i < fin {
        let ligne = lignes[i];
        i += 1;
        let Some((clef, valeur)) = ligne.split_once(':') else { continue };
        if clef.trim_start() != clef {
            continue; // ligne indentée : appartient à une liste en bloc
        }
        let clef = clef.trim().to_string();
        let valeur = valeur.trim();

        if valeur.is_empty() {
            // Liste en bloc : les lignes « - … » qui suivent.
            let mut items = Vec::new();
            while i < fin {
                let suivante = lignes[i].trim();
                let Some(item) = suivante.strip_prefix("- ") else { break };
                items.push(nettoie_scalaire(item));
                i += 1;
            }
            champs.push((clef, items));
        } else if let Some(inner) = valeur.strip_prefix('[').and_then(|v| v.strip_suffix(']')) {
            champs.push((
                clef,
                inner.split(',').map(nettoie_scalaire).filter(|s| !s.is_empty()).collect(),
            ));
        } else {
            champs.push((clef, vec![nettoie_scalaire(valeur)]));
        }
    }
    (champs, fin + 1)
}

fn nettoie_scalaire(s: &str) -> String {
    let s = s.trim();
    let s = s.strip_prefix('"').and_then(|x| x.strip_suffix('"')).unwrap_or(s);
    let s = s.strip_prefix('\'').and_then(|x| x.strip_suffix('\'')).unwrap_or(s);
    s.trim().to_string()
}

/// Analyse un fichier indexé. `None` si le front matter n'identifie pas le
/// document — un fichier malformé est **ignoré avec diagnostic**, jamais une
/// erreur bloquante (§4.2 : le dossier du vault est ouvert à l'utilisateur).
pub fn parse_programme(chemin: &Path, contenu: &str, origine: &str) -> Option<Programme> {
    let (champs, _) = parse_front_matter(contenu);
    let get = |clef: &str| -> Option<Vec<String>> {
        champs.iter().find(|(k, _)| k == clef).map(|(_, v)| v.clone())
    };
    let premier = |clef: &str| -> Option<String> {
        get(clef).and_then(|v| v.into_iter().next()).filter(|s| !s.is_empty())
    };

    let filiere = get("filiere").unwrap_or_default();
    if filiere.is_empty() {
        eprintln!("[programmes] ignoré (aucune filière déclarée) : {}", chemin.display());
        return None;
    }
    let id = premier("id").unwrap_or_else(|| {
        chemin.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
    });

    Some(Programme {
        id,
        filiere,
        matiere: premier("matiere"),
        niveau: premier("niveau"),
        source: premier("source"),
        statut: premier("statut"),
        couverture: get("couverture").unwrap_or_default(),
        origine: origine.to_string(),
        chemin: chemin.to_path_buf(),
        contenu: contenu.to_string(),
    })
}

// ── Découverte ──────────────────────────────────────────────────────────────

fn lit_dossier(dir: &Path, origine: &str, out: &mut Vec<Programme>) {
    let Ok(entrees) = std::fs::read_dir(dir) else { return };
    for entree in entrees.flatten() {
        let chemin = entree.path();
        if chemin.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Ok(contenu) = std::fs::read_to_string(&chemin) else { continue };
        if let Some(p) = parse_programme(&chemin, &contenu, origine) {
            out.push(p);
        }
    }
}

/// Corpus visible : programmes livrés **plus** échappatoire du vault.
///
/// Précédence (§4.2) : à identité égale (filière + matière + niveau), le
/// fichier du **vault l'emporte** — c'est une surcharge délibérée de
/// l'utilisateur, pas un conflit à signaler.
pub fn decouvrir(corpus_dir: Option<&Path>, vault_root: Option<&Path>) -> Vec<Programme> {
    let mut livres = Vec::new();
    if let Some(d) = corpus_dir {
        lit_dossier(d, "livre", &mut livres);
    }
    let mut vault = Vec::new();
    if let Some(r) = vault_root {
        lit_dossier(&r.join("programmes"), "vault", &mut vault);
    }

    let identites_vault: Vec<_> = vault.iter().map(|p| p.identite()).collect();
    livres.retain(|p| !identites_vault.contains(&p.identite()));
    livres.extend(vault);
    livres
}

// ── Verdict ─────────────────────────────────────────────────────────────────

/// Fragment de texte rencontré, avec son étiquette et son chemin de section.
struct Fragment {
    section: String,
    etiquette: Etiquette,
    texte: String,
}

/// Découpe un document en fragments étiquetés.
///
/// Le rattachement est STRUCTUREL, comme dans le gabarit : un intitulé porte
/// sur l'item qui le précède, et une citation `>` en tête de section porte sur
/// toute la section — c'est pourquoi son étiquette éventuelle est propagée aux
/// fragments du bandeau.
fn fragments(contenu: &str) -> Vec<Fragment> {
    let (_, debut) = parse_front_matter(contenu);
    let mut out = Vec::new();
    let mut section = String::new();
    let mut sous_section = String::new();

    let chemin = |s: &str, ss: &str| -> String {
        if ss.is_empty() { s.to_string() } else { format!("{s} › {ss}") }
    };

    for ligne in contenu.lines().skip(debut) {
        let t = ligne.trim();
        if let Some(titre) = t.strip_prefix("## ") {
            section = titre.trim().to_string();
            sous_section.clear();
            continue;
        }
        if let Some(titre) = t.strip_prefix("### ") {
            sous_section = titre.trim().to_string();
            continue;
        }
        // Bandeau : le contenu d'une citation, étiquette comprise.
        let corps = t.strip_prefix('>').map(|c| c.trim()).unwrap_or(t);
        if corps.is_empty() {
            continue;
        }
        let (etiquette, texte) = match Etiquette::depuis_ligne(corps) {
            Some((e, reste)) => (e, reste),
            None => (
                Etiquette::Aucune,
                corps.trim_start_matches("- ").trim().to_string(),
            ),
        };
        if texte.is_empty() {
            continue;
        }
        out.push(Fragment { section: chemin(&section, &sous_section), etiquette, texte });
    }
    out
}

#[derive(Serialize)]
pub struct Verdict {
    pub statut: String,
    pub citations: Vec<Citation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raison: Option<String>,
}

/// Verdict de périmètre pour `notion` dans les programmes correspondants.
///
/// Le rapprochement se fait fragment par fragment, ce qui est décisif : dans
/// « Irréductibles de $\mathbb{C}[X]$ », l'item est AU programme tandis que
/// l'intitulé « Hors programme » ne vise que la démonstration du théorème de
/// d'Alembert-Gauss. Chercher la notion dans le texte de CHAQUE fragment, et
/// non dans l'item entier, rend donc le bon verdict pour l'une comme pour
/// l'autre.
///
/// Plusieurs occurrences : le **plus restrictif** l'emporte, et toutes les
/// citations sont rendues — un garde-fou doit pencher du côté prudent, et
/// l'utilisateur garde de quoi juger.
pub fn verifier_perimetre(
    programmes: &[Programme],
    notion: &str,
    filiere: &str,
    matiere: Option<&str>,
    niveau: Option<&str>,
) -> Verdict {
    let aiguille = notion.trim().to_lowercase();
    if aiguille.is_empty() {
        return Verdict {
            statut: "indetermine".into(),
            citations: Vec::new(),
            raison: Some("notion vide".into()),
        };
    }

    let retenus: Vec<&Programme> = programmes
        .iter()
        .filter(|p| p.correspond(filiere, matiere, niveau))
        .collect();

    if retenus.is_empty() {
        return Verdict {
            statut: "indetermine".into(),
            citations: Vec::new(),
            raison: Some(format!(
                "aucun programme disponible pour la filière « {filiere} »"
            )),
        };
    }

    let mut citations = Vec::new();
    let mut statut = "indetermine".to_string();

    for p in &retenus {
        for f in fragments(&p.contenu) {
            if !f.texte.to_lowercase().contains(&aiguille) {
                continue;
            }
            let s = f.etiquette.statut();
            if severite(s) > severite(&statut) {
                statut = s.to_string();
            }
            citations.push(Citation {
                id: p.id.clone(),
                section: f.section.clone(),
                texte: f.texte.clone(),
            });
        }
    }

    if citations.is_empty() {
        // ⚠️ ABSENCE ≠ EXCLUSION. Un programme énumère ce qu'il inclut ;
        // rendre « hors » sur une non-occurrence produirait un assistant qui
        // refuse à tort. Et si la transcription est partielle, le dire.
        let partiels: Vec<&&Programme> = retenus
            .iter()
            .filter(|p| !p.couverture.is_empty() || p.statut.as_deref() == Some("specimen"))
            .collect();
        let raison = if let Some(p) = partiels.first() {
            format!(
                "notion absente des sections transcrites — ce document est partiel ({}). Sections couvertes : {}.",
                p.statut.as_deref().unwrap_or("partiel"),
                if p.couverture.is_empty() { "non déclarées".into() } else { p.couverture.join(" ; ") }
            )
        } else {
            "notion non mentionnée dans le programme consulté ; l'absence de mention n'est PAS une exclusion".into()
        };
        return Verdict { statut: "indetermine".into(), citations, raison: Some(raison) };
    }

    Verdict { statut, citations, raison: None }
}

// ── Commande Tauri (réglages) ───────────────────────────────────────────────

/// Programmes visibles, pour le panneau de réglages.
///
/// Doublon assumé du chemin MCP : l'UI ne passe pas par l'agent pour se
/// remplir — elle doit fonctionner que l'assistant soit démarré ou non.
/// L'analyse, elle, n'est pas dupliquée : les deux appellent `decouvrir`.
#[tauri::command]
pub fn programmes_lister(corpus_dir: Option<String>, root: Option<String>) -> Vec<Programme> {
    decouvrir(
        corpus_dir.as_deref().map(Path::new),
        root.as_deref().map(Path::new),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const SPECIMEN: &str = r#"---
id: test-maths
filiere: [TEST, TEST2]
matiere: mathematiques
niveau: 2
statut: specimen
couverture:
  - Structures algébriques
---

# Programme de test

## Structures algébriques

> Cadre de l'étude des structures.
>
> **Hors programme.** La notion de produit scalaire hermitien.

### a) Groupes

- Sous-groupe engendré par une partie.
- Groupe monogène, groupe cyclique.

  **Commentaire.** Groupe des racines de l'unité.
- L'ordre d'un élément divise le cardinal du groupe.

  **Non exigible.** La démonstration pour un groupe non commutatif.
- Irréductibles de C[X].

  **Hors programme.** La démonstration du théorème de d'Alembert-Gauss.

  **Limite.** L'étude pour un corps autre que R n'est pas un objectif.
"#;

    fn prog() -> Vec<Programme> {
        vec![parse_programme(Path::new("/x/test-maths.md"), SPECIMEN, "livre").unwrap()]
    }

    fn verdict(notion: &str) -> Verdict {
        verifier_perimetre(&prog(), notion, "TEST", None, None)
    }

    #[test]
    fn front_matter_liste_en_ligne_et_en_bloc() {
        let p = &prog()[0];
        assert_eq!(p.id, "test-maths");
        assert_eq!(p.filiere, vec!["TEST", "TEST2"]);
        assert_eq!(p.matiere.as_deref(), Some("mathematiques"));
        assert_eq!(p.statut.as_deref(), Some("specimen"));
        assert_eq!(p.couverture, vec!["Structures algébriques"]);
    }

    #[test]
    fn item_sans_intitule_est_dans() {
        let v = verdict("Sous-groupe engendré");
        assert_eq!(v.statut, "dans");
        assert!(!v.citations.is_empty());
        assert!(v.citations[0].section.contains("Groupes"));
    }

    #[test]
    fn commentaire_ne_restreint_pas() {
        assert_eq!(verdict("racines de l'unité").statut, "dans");
    }

    #[test]
    fn intitule_hors_programme_donne_hors_avec_citation() {
        let v = verdict("d'Alembert-Gauss");
        assert_eq!(v.statut, "hors");
        assert!(v.citations.iter().any(|c| c.texte.contains("Alembert")));
    }

    #[test]
    fn bandeau_hors_programme_vaut_pour_toute_la_section() {
        let v = verdict("produit scalaire hermitien");
        assert_eq!(v.statut, "hors");
    }

    #[test]
    fn non_exigible_et_limite_donnent_limitrophe() {
        assert_eq!(verdict("démonstration pour un groupe non commutatif").statut, "limitrophe");
        assert_eq!(verdict("corps autre que R").statut, "limitrophe");
    }

    #[test]
    fn item_au_programme_malgre_une_exclusion_attachee() {
        // Le cœur de la règle : l'item « Irréductibles de C[X] » EST au
        // programme ; seule sa démonstration en est exclue. Chercher l'item ne
        // doit pas hériter du « hors » de son intitulé.
        assert_eq!(verdict("Irréductibles de C[X]").statut, "dans");
    }

    #[test]
    fn notion_absente_rend_indetermine_jamais_hors() {
        let v = verdict("séries de Fourier");
        assert_eq!(v.statut, "indetermine");
        assert!(v.citations.is_empty());
        let raison = v.raison.unwrap();
        assert!(raison.contains("partiel"), "raison inattendue : {raison}");
        assert!(raison.contains("Structures algébriques"));
    }

    #[test]
    fn filiere_inconnue_rend_indetermine_avec_raison() {
        let v = verifier_perimetre(&prog(), "groupes", "PCSI", None, None);
        assert_eq!(v.statut, "indetermine");
        assert!(v.raison.unwrap().contains("PCSI"));
    }

    #[test]
    fn notion_vide_rend_indetermine() {
        assert_eq!(verdict("   ").statut, "indetermine");
    }

    #[test]
    fn fichier_malforme_est_ignore_sans_erreur() {
        // Aucune filière : le document ne s'identifie pas.
        assert!(parse_programme(Path::new("/x/y.md"), "pas de front matter", "vault").is_none());
        assert!(parse_programme(Path::new("/x/y.md"), "---\nid: seul\n---\n", "vault").is_none());
    }

    #[test]
    fn precedence_le_vault_lemporte_sur_le_livre() {
        let dir = tempfile::tempdir().unwrap();
        let corpus = dir.path().join("corpus");
        let vault = dir.path().join("vault");
        std::fs::create_dir_all(&corpus).unwrap();
        std::fs::create_dir_all(vault.join("programmes")).unwrap();

        std::fs::write(corpus.join("a.md"), SPECIMEN).unwrap();
        std::fs::write(
            vault.join("programmes/a.md"),
            SPECIMEN.replace("id: test-maths", "id: surcharge-utilisateur"),
        )
        .unwrap();

        let trouves = decouvrir(Some(&corpus), Some(&vault));
        assert_eq!(trouves.len(), 1, "la surcharge doit remplacer, pas s'ajouter");
        assert_eq!(trouves[0].id, "surcharge-utilisateur");
        assert_eq!(trouves[0].origine, "vault");
    }

    #[test]
    fn corpus_vide_est_un_succes() {
        let dir = tempfile::tempdir().unwrap();
        assert!(decouvrir(Some(dir.path()), Some(dir.path())).is_empty());
    }
}
