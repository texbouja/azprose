//! Noyau des programmes officiels — analyse et verdict de périmètre.
//!
//! **Lecture seule de bout en bout.** Rien ici n'écrit, ne compile ni ne
//! convertit : les fichiers indexés sont préparés HORS de l'application
//! (chantier distinct) et livrés. Voir `opencode-plan-rectificatif.md` §4.1.
//!
//! Le format normatif est un FICHIER, pas une description :
//! `corpus/mathematiques-mp-mpi.md`. Il porte sa propre légende.
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
    /// Chemin absolu du fichier livré — informatif (diagnostic, réglages).
    #[serde(serialize_with = "chemin_en_texte")]
    pub chemin: PathBuf,
    #[serde(skip)]
    pub contenu: String,
}

/// Compare deux libellés sans tenir compte de la casse NI DES ACCENTS.
///
/// Le modèle reçoit ce que l'utilisateur a tapé — « mathématiques » avec son
/// accent — alors que le corpus écrit `matiere: mathematiques`. Une
/// comparaison ASCII stricte les déclarait différents, et la matière demandée
/// était silencieusement ignorée (transcription du 2026-08-19).
pub fn meme_libelle(a: &str, b: &str) -> bool {
    plier(a) == plier(b)
}

/// Forme comparable d'un libellé : minuscules, sans accent ni séparateur.
pub fn plier(s: &str) -> String {
    {
        fn plie(s: &str) -> String {
        s.chars()
            .filter(|c| !c.is_whitespace() && *c != '-' && *c != '_')
            .flat_map(|c| {
                let c = c.to_ascii_lowercase();
                match c {
                    'á' | 'à' | 'â' | 'ä' => 'a',
                    'é' | 'è' | 'ê' | 'ë' => 'e',
                    'í' | 'ì' | 'î' | 'ï' => 'i',
                    'ó' | 'ò' | 'ô' | 'ö' => 'o',
                    'ú' | 'ù' | 'û' | 'ü' => 'u',
                    'ç' => 'c',
                    autre => autre.to_lowercase().next().unwrap_or(autre),
                }
                .to_lowercase()
            })
                .collect()
        }
        plie(s)
    }
}

impl Programme {
    pub fn correspond(&self, filiere: &str, matiere: Option<&str>, niveau: Option<&str>) -> bool {
        let f = self.filiere.iter().any(|x| meme_libelle(x, filiere));
        let m = matiere.is_none_or(|m| {
            self.matiere.as_deref().is_some_and(|x| meme_libelle(x, m))
        });
        // `niveau` ABSENT = vaut pour toutes les années. Ce n'est pas une
        // tolérance, c'est le cas réel : le programme de sciences
        // industrielles couvre six filières ET les deux années. Exiger une
        // correspondance stricte le rendrait introuvable.
        let n = match (niveau, self.niveau.as_deref()) {
            (None, _) | (Some(_), None) => true,
            (Some(demande), Some(porte)) => meme_libelle(porte, demande),
        };
        f && m && n
    }
}

// ── Vocabulaire des matières ────────────────────────────────────────────────

/// Codes de matière acceptés par les outils — **quatre lettres, sans accent**.
///
/// Un vocabulaire FERMÉ plutôt qu'un texte libre : l'argument venait de ce que
/// l'utilisateur avait tapé (« mathématiques »), traversait l'appel d'outil en
/// JSON, et s'y faisait tronquer. Cinq codes ASCII n'ont ni accent, ni pluriel,
/// ni variante — il n'y a plus rien à deviner.
///
/// `(code, libellé du corpus, alias reconnus pour SUGGÉRER une correction)`
pub const MATIERES: &[(&str, &str, &[&str])] = &[
    ("math", "mathematiques", &["mathematiques", "maths", "mathematique", "m"]),
    ("phys", "physique", &["physique", "physiques", "p"]),
    ("chim", "chimie", &["chimie", "chimies", "c"]),
    ("info", "informatique", &["informatique", "informatiques", "algo", "i"]),
    ("scii", "sciences industrielles", &["sciencesindustrielles", "si", "sii", "industrielles"]),
];

/// Libellé du corpus pour un code EXACT. `None` si le code est inconnu —
/// aucune tolérance ici, c'est le principe du vocabulaire fermé.
pub fn matiere_depuis_code(code: &str) -> Option<&'static str> {
    MATIERES
        .iter()
        .find(|(c, _, _)| *c == code.trim())
        .map(|(_, libelle, _)| *libelle)
}

/// Code le plus plausible pour une saisie hors vocabulaire — de quoi PROPOSER
/// une correction plutôt que de refuser sèchement.
///
/// Aucune tolérance à l'exécution : cette fonction ne sert qu'à formuler la
/// suggestion, jamais à sélectionner un programme.
pub fn suggerer_matiere(saisie: &str) -> Option<&'static str> {
    let s = saisie.trim();
    if s.is_empty() {
        return None;
    }
    MATIERES
        .iter()
        .find(|(code, libelle, alias)| {
            meme_libelle(code, s)
                || meme_libelle(libelle, s)
                || alias.iter().any(|a| meme_libelle(a, s))
                // Une saisie plus longue qui COMMENCE par le libellé attendu :
                // « mathematiques appliquees » suggère `math`.
                || plier(s).starts_with(&plier(libelle))
                || plier(libelle).starts_with(&plier(s))
        })
        .map(|(code, _, _)| *code)
}

/// Résultat d'une sélection de programme.
///
/// ⚠️ `Plusieurs` est un cas NORMAL, pas une erreur : « MPSI » seul désigne
/// cinq programmes (maths, physique, chimie, SI, informatique). Rendre le
/// premier de la liste — ce que faisait `find` — donnait le programme
/// d'informatique à qui demandait les mathématiques, avec `trouve: true` pour
/// couronner le tout (transcription du 2026-08-19).
pub enum Selection<'a> {
    Unique(&'a Programme),
    Plusieurs(Vec<&'a Programme>),
    Aucun,
}

/// Choisit UN programme, ou dit pourquoi il ne peut pas.
///
/// `id` l'emporte sur tout le reste : c'est l'identifiant exact rendu par
/// `programme_lister`, sans accent ni ambiguïté — la façon fiable de désigner
/// un programme pour un modèle.
pub fn selectionner<'a>(
    programmes: &'a [Programme],
    id: Option<&str>,
    filiere: Option<&str>,
    matiere: Option<&str>,
    niveau: Option<&str>,
) -> Selection<'a> {
    if let Some(id) = id.map(str::trim).filter(|s| !s.is_empty()) {
        return match programmes.iter().find(|p| meme_libelle(&p.id, id)) {
            Some(p) => Selection::Unique(p),
            None => Selection::Aucun,
        };
    }
    let Some(filiere) = filiere.map(str::trim).filter(|s| !s.is_empty()) else {
        return Selection::Aucun;
    };
    let candidats: Vec<&Programme> = programmes
        .iter()
        .filter(|p| p.correspond(filiere, matiere, niveau))
        .collect();
    match candidats.len() {
        0 => Selection::Aucun,
        1 => Selection::Unique(candidats[0]),
        _ => Selection::Plusieurs(candidats),
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
pub fn parse_programme(chemin: &Path, contenu: &str) -> Option<Programme> {
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
        chemin: chemin.to_path_buf(),
        contenu: contenu.to_string(),
    })
}

// ── Découverte ──────────────────────────────────────────────────────────────

fn lit_dossier(dir: &Path, out: &mut Vec<Programme>) {
    let Ok(entrees) = std::fs::read_dir(dir) else { return };
    for entree in entrees.flatten() {
        let chemin = entree.path();
        if chemin.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Ok(contenu) = std::fs::read_to_string(&chemin) else { continue };
        if let Some(p) = parse_programme(&chemin, &contenu) {
            out.push(p);
        }
    }
}

/// Corpus visible — **une seule source : les programmes livrés avec
/// l'application**, en lecture seule.
///
/// L'échappatoire `<vault>/programmes/` et la précédence qui l'accompagnait
/// ont été retirées (2026-08-16) : un fichier déposé par l'utilisateur pouvait
/// masquer silencieusement un programme officiel, ce qui est précisément
/// l'aléa qu'on cherche à supprimer d'un référentiel de conformité. Lever ou
/// ajouter une contrainte reste possible — mais **dans la conversation**, à la
/// demande explicite et assumée de l'utilisateur.
pub fn decouvrir(corpus_dir: Option<&Path>) -> Vec<Programme> {
    let mut out = Vec::new();
    if let Some(d) = corpus_dir {
        lit_dossier(d, &mut out);
    }
    out
}

// ── Verdict ─────────────────────────────────────────────────────────────────

/// Fragment de texte rencontré, avec son étiquette et son ancrage.
struct Fragment {
    section: String,
    etiquette: Etiquette,
    texte: String,
    /// Item de programme que cette étiquette qualifie — « quel résultat
    /// officiel est sujet de la contrainte ». `None` pour un item lui-même, ou
    /// pour un bandeau, dont la portée est la section entière.
    porte_sur: Option<String>,
    /// Issu d'un bandeau (citation en tête de section) : portée = la section.
    bandeau: bool,
}

/// Titre de la section de légende du gabarit — exclue de l'analyse.
/// Sans cette exclusion, une recherche de notion pourrait tomber sur le mode
/// d'emploi (« Hors programme », « non exigible »…) et produire des citations
/// qui ne viennent pas du programme.
const SECTION_LEGENDE: &str = "Comment lire ce document";

fn chemin_section(s: &str, ss: &str) -> String {
    if ss.is_empty() { s.to_string() } else { format!("{s} › {ss}") }
}

/// Clôt le fragment en cours et mémorise l'item courant, auquel les étiquettes
/// suivantes se rattacheront.
///
/// Seule une puce de PREMIER niveau devient l'item courant. Une puce indentée
/// (`porte_sur` renseigné) est un détail de l'item — capacité exigible de la
/// colonne de droite en physique-chimie, hypothèse d'un théorème en
/// mathématiques : elle ne doit pas capter les intitulés qui suivent, sans quoi
/// un `**Hors programme.**` posé après une notion et ses capacités viserait la
/// dernière capacité au lieu de la notion.
fn pousser(out: &mut Vec<Fragment>, dernier_item: &mut Option<String>, f: Option<Fragment>) {
    let Some(f) = f else { return };
    if f.texte.trim().is_empty() {
        return;
    }
    if f.etiquette == Etiquette::Aucune && !f.bandeau && f.porte_sur.is_none() {
        *dernier_item = Some(f.texte.clone());
    }
    out.push(f);
}

/// Découpe un document en fragments étiquetés.
///
/// Le rattachement est STRUCTUREL, comme dans le gabarit : un intitulé porte
/// sur l'item qui le précède, une citation `>` en tête de section vaut pour
/// toute la section.
///
/// Les lignes de continuation sont **agrégées** au fragment courant : un item
/// s'étend souvent sur plusieurs lignes (formule affichée comprise), et le
/// découper ligne à ligne empêcherait de retrouver une notion à cheval — en
/// plus de ne rattacher qu'un bout d'item à sa contrainte.
fn fragments(contenu: &str) -> Vec<Fragment> {
    let (_, debut) = parse_front_matter(contenu);
    let mut out: Vec<Fragment> = Vec::new();
    let mut section = String::new();
    let mut sous_section = String::new();
    let mut dernier_item: Option<String> = None;
    let mut courant: Option<Fragment> = None;

    let mut dans_fence = false;

    for ligne in contenu.lines().skip(debut) {
        let t = ligne.trim();
        // Profondeur d'indentation, mesurée AVANT de rogner : elle porte du
        // sens (une puce indentée est un détail de la puce qui la précède).
        let indentation = ligne.len() - ligne.trim_start().len();

        // Blocs délimités (```mermaid, ```python…) : leur contenu n'est PAS du
        // programme. Un diagramme y écrit des lignes qui ressemblent à des
        // items ou à du texte de section ; les agréger polluerait les citations
        // rendues à l'utilisateur avec du code de dessin. Le bloc est donc
        // sauté d'un délimiteur à l'autre, et il CLÔT le fragment courant —
        // ce qui suit lui est étranger.
        if t.starts_with("```") {
            if !dans_fence {
                pousser(&mut out, &mut dernier_item, courant.take());
            }
            dans_fence = !dans_fence;
            continue;
        }
        if dans_fence {
            continue;
        }

        if let Some(titre) = t.strip_prefix("## ") {
            pousser(&mut out, &mut dernier_item, courant.take());
            section = titre.trim().to_string();
            sous_section.clear();
            dernier_item = None;
            continue;
        }
        if let Some(titre) = t.strip_prefix("### ") {
            pousser(&mut out, &mut dernier_item, courant.take());
            sous_section = titre.trim().to_string();
            dernier_item = None;
            continue;
        }
        if t.starts_with("# ") {
            pousser(&mut out, &mut dernier_item, courant.take());
            continue;
        }
        // Légende du gabarit : mode d'emploi, pas contenu de programme.
        if section == SECTION_LEGENDE {
            continue;
        }
        // Rangées de tableau : jamais du contenu de programme dans ce format.
        if t.starts_with('|') {
            continue;
        }

        let bandeau = t.starts_with('>');
        let corps = if bandeau { t.trim_start_matches('>').trim() } else { t };
        // Ligne vide : séparateur pour un item (dont l'intitulé est séparé par
        // une ligne blanche, et dont une formule affichée peut l'être aussi),
        // mais FIN d'un fragment étiqueté. Sans cette clôture, un intitulé
        // avalerait le paragraphe suivant : la contrainte citerait alors du
        // texte qu'elle ne restreint pas, et l'ordre du document devrait être
        // tordu pour l'éviter (intitulés rejetés en fin de citation).
        if corps.is_empty() {
            if courant.as_ref().is_some_and(|f| f.etiquette != Etiquette::Aucune) {
                pousser(&mut out, &mut dernier_item, courant.take());
            }
            continue;
        }

        if let Some((etiquette, reste)) = Etiquette::depuis_ligne(corps) {
            pousser(&mut out, &mut dernier_item, courant.take());
            courant = Some(Fragment {
                section: chemin_section(&section, &sous_section),
                etiquette,
                texte: reste,
                porte_sur: if bandeau { None } else { dernier_item.clone() },
                bandeau,
            });
            continue;
        }

        if let Some(item) = corps.strip_prefix("- ") {
            pousser(&mut out, &mut dernier_item, courant.take());
            // Puce indentée hors bandeau = détail de l'item courant : capacité
            // exigible de la colonne de droite (physique-chimie), hypothèse ou
            // cas d'une énumération (mathématiques). On la rattache à sa
            // notion parente au lieu d'en faire un item de plein droit.
            let sous_item = indentation >= 2 && !bandeau;
            courant = Some(Fragment {
                section: chemin_section(&section, &sous_section),
                etiquette: Etiquette::Aucune,
                texte: item.trim().to_string(),
                porte_sur: if sous_item { dernier_item.clone() } else { None },
                bandeau,
            });
            continue;
        }

        match courant.as_mut() {
            Some(f) => {
                f.texte.push(' ');
                f.texte.push_str(corps);
            }
            None => {
                courant = Some(Fragment {
                    section: chemin_section(&section, &sous_section),
                    etiquette: Etiquette::Aucune,
                    texte: corps.to_string(),
                    porte_sur: None,
                    bandeau,
                });
            }
        }
    }
    pousser(&mut out, &mut dernier_item, courant.take());
    out
}

// ── Synthèse des contraintes ────────────────────────────────────────────────

/// Une contrainte du programme, extraite avec son contexte.
#[derive(Clone, Serialize)]
pub struct Contrainte {
    /// `hors` · `limite` · `non_exigible`.
    pub genre: String,
    /// Chapitre et sous-section d'où elle provient.
    pub section: String,
    /// Résultat officiel visé. `None` quand la contrainte vaut pour toute la
    /// section (bandeau).
    pub porte_sur: Option<String>,
    /// `item` ou `section`.
    pub portee: String,
    pub texte: String,
}

/// Toutes les contraintes d'un programme, dans l'ordre du document.
///
/// **CALCULÉE, jamais recopiée dans le fichier.** Une synthèse écrite à la main
/// serait une seconde source de vérité : corrigée d'un côté et pas de l'autre,
/// le document finirait par se contredire. Ici elle dérive des mêmes étiquettes
/// que le verdict — les deux ne peuvent pas diverger.
pub fn contraintes(p: &Programme) -> Vec<Contrainte> {
    fragments(&p.contenu)
        .into_iter()
        .filter_map(|f| {
            let genre = match f.etiquette {
                Etiquette::HorsProgramme => "hors",
                Etiquette::Limite => "limite",
                Etiquette::NonExigible => "non_exigible",
                // Un commentaire ne restreint rien : il n'est pas une contrainte.
                Etiquette::Commentaire | Etiquette::Aucune => return None,
            };
            Some(Contrainte {
                genre: genre.to_string(),
                section: f.section,
                portee: if f.bandeau { "section".into() } else { "item".into() },
                porte_sur: f.porte_sur,
                texte: f.texte,
            })
        })
        .collect()
}

/// En-tête lisible, placé EN TÊTE du programme chargé.
///
/// Les mentions limitatives sont dispersées dans des milliers de lignes : les
/// rassembler en tête garantit que le modèle voit le périmètre limitatif
/// AVANT d'entrer dans le contenu, sans avoir à le parcourir.
pub fn synthese_contraintes(p: &Programme) -> String {
    let liste = contraintes(p);
    if liste.is_empty() {
        return String::new();
    }
    let mut out = format!(
        "> CONTRAINTES DU PROGRAMME ({}) — synthèse calculée, à lire avant le contenu.\n\
         > `hors` = exclu, ne peut être évalué · `limite` = portée restreinte · \
         `non_exigible` = au programme, non exigible.\n\n",
        liste.len()
    );
    for c in &liste {
        out.push_str(&format!("- **[{}]** {}\n", c.genre, c.section));
        match &c.porte_sur {
            Some(item) => out.push_str(&format!("  - porte sur : {item}\n")),
            None => out.push_str("  - portée : toute la section\n"),
        }
        out.push_str(&format!("  - {}\n", c.texte));
    }
    out.push_str("\n---\n\n");
    out
}

// ── Découpage en sections ───────────────────────────────────────────────────

/// Une section du document, adressable et bornée.
///
/// Le `numero` est une adresse **calculée par position**, pas la numérotation
/// du document : celle-ci est irrégulière d'une matière à l'autre (`4.4.2.` en
/// chimie, `B2.` en SI, `a)` en mathématiques) et parfois absente. Le modèle ne
/// la compose jamais lui-même — il la reçoit d'une recherche ou du plan et la
/// recopie.
#[derive(Clone, Serialize)]
pub struct SectionProgramme {
    /// Adresse positionnelle : `3` pour une section, `3.2` pour une
    /// sous-section.
    pub numero: String,
    /// Titre tel qu'il est écrit dans le document.
    pub titre: String,
    /// `Section › Sous-section`. **Même forme que `Contrainte::section`** —
    /// c'est ce qui permet de rapprocher une section de ses contraintes.
    pub chemin: String,
    /// Titre de niveau `#` qui englobe la section — « Premier semestre » en
    /// mathématiques. Informatif : seul `math-mpsi-mp2i.md` découpe ainsi, et
    /// ce titre ne participe donc PAS au chemin, qui doit rester comparable
    /// d'un document à l'autre.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contexte: Option<String>,
    /// 1 pour `##`, 2 pour `###`.
    pub niveau: u8,
    /// Décalage du début du titre, en octets.
    #[serde(skip)]
    pub debut: usize,
    /// Fin du corps PROPRE — avant la première sous-section. C'est ce corps que
    /// la recherche note : compter les sous-sections ferait ressortir toute
    /// section parente devant ses propres enfants.
    #[serde(skip)]
    pub fin_corps: usize,
    /// Fin de la section, sous-sections COMPRISES. C'est ce que rend
    /// `section()` : demander « 3 » veut dire demander le chapitre.
    #[serde(skip)]
    pub fin: usize,
}

/// Découpe un document en sections adressables.
///
/// Trois pièges, tous rencontrés par le parseur de contraintes avant celui-ci :
/// les blocs délimités (` ``` `) contiennent des lignes qui ressemblent à des
/// titres ; le front matter précède le corps ; et la légende du gabarit
/// (`SECTION_LEGENDE`) parle DES étiquettes sans en porter — elle est écartée
/// ici comme elle l'est de l'analyse, faute de quoi toute recherche sur une
/// mention limitative la ferait remonter en tête.
pub fn plan(p: &Programme) -> Vec<SectionProgramme> {
    plan_du_texte(&p.contenu)
}

fn plan_du_texte(contenu: &str) -> Vec<SectionProgramme> {
    let (_, premiere_ligne) = parse_front_matter(contenu);

    let mut out: Vec<SectionProgramme> = Vec::new();
    let mut contexte: Option<String> = None;
    let mut titre_document_vu = false;
    let mut section = String::new();
    let mut dans_legende = false;
    let mut dans_fence = false;
    let mut majeur = 0u32;
    let mut mineur = 0u32;

    let mut offset = 0usize;
    for (no, brut) in contenu.split_inclusive('\n').enumerate() {
        let debut_ligne = offset;
        offset += brut.len();
        if no < premiere_ligne {
            continue;
        }
        let t = brut.trim();

        if t.starts_with("```") {
            dans_fence = !dans_fence;
            continue;
        }
        if dans_fence {
            continue;
        }

        // Niveau du titre, ou rien. `#` vaut 0 : il clôt tout ce qui est
        // ouvert, sans jamais être une section adressable.
        let niveau = if let Some(x) = t.strip_prefix("### ") {
            Some((2u8, x))
        } else if let Some(x) = t.strip_prefix("## ") {
            Some((1u8, x))
        } else if let Some(x) = t.strip_prefix("# ") {
            Some((0u8, x))
        } else {
            None
        };
        let Some((niveau, titre)) = niveau else { continue };
        let titre = titre.trim();

        // Un titre ferme le corps propre de la section précédente, et la
        // section entière de toutes celles d'un niveau au moins aussi profond.
        if let Some(derniere) = out.last_mut() {
            if derniere.fin_corps == usize::MAX {
                derniere.fin_corps = debut_ligne;
            }
        }
        for s in out.iter_mut().rev() {
            if s.fin == usize::MAX && s.niveau >= niveau.max(1) {
                s.fin = debut_ligne;
            }
        }

        match niveau {
            0 => {
                // Le PREMIER `#` est le titre du document ; les suivants
                // découpent le corps (« Premier semestre »).
                if titre_document_vu {
                    contexte = Some(titre.to_string());
                } else {
                    titre_document_vu = true;
                }
                dans_legende = false;
            }
            1 => {
                section = titre.to_string();
                dans_legende = titre == SECTION_LEGENDE;
                if dans_legende {
                    continue;
                }
                majeur += 1;
                mineur = 0;
                out.push(SectionProgramme {
                    numero: majeur.to_string(),
                    titre: titre.to_string(),
                    chemin: chemin_section(&section, ""),
                    contexte: contexte.clone(),
                    niveau: 1,
                    debut: debut_ligne,
                    fin_corps: usize::MAX,
                    fin: usize::MAX,
                });
            }
            _ => {
                if dans_legende || majeur == 0 {
                    continue;
                }
                mineur += 1;
                out.push(SectionProgramme {
                    numero: format!("{majeur}.{mineur}"),
                    titre: titre.to_string(),
                    chemin: chemin_section(&section, titre),
                    contexte: contexte.clone(),
                    niveau: 2,
                    debut: debut_ligne,
                    fin_corps: usize::MAX,
                    fin: usize::MAX,
                });
            }
        }
    }

    for s in out.iter_mut() {
        if s.fin_corps == usize::MAX {
            s.fin_corps = contenu.len();
        }
        if s.fin == usize::MAX {
            s.fin = contenu.len();
        }
    }
    out
}

/// Texte d'une section, sous-sections comprises. `None` si l'adresse est
/// inconnue — jamais un repli sur une section voisine.
pub fn section<'a>(p: &'a Programme, numero: &str) -> Option<&'a str> {
    let s = plan(p).into_iter().find(|s| s.numero == numero)?;
    Some(&p.contenu[s.debut..s.fin])
}

/// Vrai si une contrainte de portée `portee` s'applique à la section `chemin` :
/// c'est la sienne, celle d'une de ses parentes, ou une portée document
/// (chemin vide, pour ce qui précède la première section).
fn portee_couvre(portee: &str, chemin: &str) -> bool {
    portee.is_empty() || portee == chemin || chemin.starts_with(&format!("{portee} › "))
}

/// Contraintes qui s'appliquent à une section : les siennes, celles de ses
/// PARENTES, et celles de portée document.
///
/// Une contrainte ne veut rien dire sans ce qu'elle restreint — « Hors
/// programme : la définition des exceptions » ne s'interprète pas seul. Elle
/// voyage donc avec la section, au lieu d'être servie en liste séparée.
pub fn contraintes_de(p: &Programme, numero: &str) -> Vec<Contrainte> {
    let Some(s) = plan(p).into_iter().find(|s| s.numero == numero) else {
        return Vec::new();
    };
    contraintes(p)
        .into_iter()
        .filter(|c| portee_couvre(&c.section, &s.chemin))
        .collect()
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

// ── Diagnostic de préparation ───────────────────────────────────────────────

/// Vérifie un fichier indexé et rend la liste des anomalies, de la plus grave
/// à la plus bénigne. Sert l'outil `programme_check`, qui rend la préparation
/// d'un corpus **vérifiable** au lieu de reposer sur la seule vigilance.
///
/// L'anomalie la plus dangereuse est l'**intitulé mal orthographié** : il
/// redevient du texte ordinaire, la contrainte disparaît en silence, et le
/// document affirme alors qu'une notion exclue est au programme. Aucun test ne
/// l'attraperait — d'où cette détection dédiée.
pub fn diagnostiquer(contenu: &str) -> Vec<String> {
    let mut avis = Vec::new();
    let (champs, _) = parse_front_matter(contenu);
    let a = |clef: &str| champs.iter().any(|(k, v)| k == clef && !v.is_empty());

    if !a("filiere") {
        avis.push("GRAVE — `filiere:` absent : le document ne s'identifie pas, il sera IGNORÉ.".into());
    }
    for clef in ["id", "matiere", "niveau", "source"] {
        if !a(clef) {
            avis.push(format!("`{clef}:` absent du front matter."));
        }
    }

    // Intitulés mal orthographiés : tout gras en début de ligne qui ressemble à
    // une étiquette sans en être une.
    let connus = ["**Commentaire.**", "**Limite.**", "**Non exigible.**", "**Hors programme.**"];
    for (n, ligne) in contenu.lines().enumerate() {
        let t = ligne.trim().trim_start_matches('>').trim();
        if !t.starts_with("**") {
            continue;
        }
        let Some(fin) = t[2..].find("**") else { continue };
        let etiquette = &t[..fin + 4];
        if connus.contains(&etiquette) {
            continue;
        }
        // Un gras en début de ligne suivi d'un point est presque sûrement une
        // étiquette ratée ; sans point, c'est probablement de la mise en forme.
        if etiquette.trim_end_matches("**").ends_with('.') {
            avis.push(format!(
                "GRAVE — ligne {} : intitulé inconnu `{}`. La contrainte sera PERDUE. \
                 Attendus : {}.",
                n + 1,
                etiquette,
                connus.join(", ")
            ));
        }
    }

    let frags = fragments(contenu);
    if frags.is_empty() {
        avis.push("GRAVE — aucun contenu analysable : vérifier les titres `##` et les puces `- `.".into());
    }

    // Étiquette orpheline : hors bandeau et sans item avant elle. Le
    // rattachement « quel résultat est visé » sera vide.
    for f in &frags {
        if f.etiquette != Etiquette::Aucune && !f.bandeau && f.porte_sur.is_none() {
            avis.push(format!(
                "Intitulé sans item de rattachement dans « {} » : « {}… »",
                f.section,
                f.texte.chars().take(60).collect::<String>()
            ));
        }
    }

    // Cohérence de la couverture déclarée avec les sections réellement écrites.
    let declarees: Vec<String> = champs
        .iter()
        .find(|(k, _)| k == "couverture")
        .map(|(_, v)| v.clone())
        .unwrap_or_default();
    let ecrites: Vec<&str> = frags
        .iter()
        .map(|f| f.section.split(" › ").next().unwrap_or(""))
        .filter(|s| !s.is_empty())
        .collect();
    for d in &declarees {
        if !ecrites.iter().any(|s| s == d) {
            avis.push(format!("`couverture:` annonce « {d} », section absente du corps."));
        }
    }
    let statut = champs.iter().find(|(k, _)| k == "statut").map(|(_, v)| v.join(""));
    if declarees.is_empty() && statut.as_deref() == Some("specimen") {
        avis.push("`statut: specimen` sans `couverture:` — le lecteur ne saura pas ce qui manque.".into());
    }

    avis
}

// ── Commande Tauri (réglages) ───────────────────────────────────────────────

/// Programmes visibles, pour le panneau de réglages.
///
/// Doublon assumé du chemin MCP : l'UI ne passe pas par l'agent pour se
/// remplir — elle doit fonctionner que l'assistant soit démarré ou non.
/// L'analyse, elle, n'est pas dupliquée : les deux appellent `decouvrir`.
#[tauri::command]
pub fn programmes_lister(corpus_dir: Option<String>) -> Vec<Programme> {
    decouvrir(corpus_dir.as_deref().map(Path::new))
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
        vec![parse_programme(Path::new("/x/test-maths.md"), SPECIMEN).unwrap()]
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
        assert!(parse_programme(Path::new("/x/y.md"), "pas de front matter").is_none());
        assert!(parse_programme(Path::new("/x/y.md"), "---\nid: seul\n---\n").is_none());
    }

    #[test]
    fn contraintes_rattachees_au_resultat_officiel_vise() {
        let c = contraintes(&prog()[0]);
        // Trois contraintes : hors (bandeau), non exigible, hors, limite.
        assert_eq!(c.len(), 4, "contraintes trouvées : {:?}", c.iter().map(|x| &x.texte).collect::<Vec<_>>());

        // Le bandeau vaut pour TOUTE la section — il ne porte sur aucun item.
        let bandeau = c.iter().find(|x| x.texte.contains("hermitien")).unwrap();
        assert_eq!(bandeau.genre, "hors");
        assert_eq!(bandeau.portee, "section");
        assert!(bandeau.porte_sur.is_none());

        // Une étiquette d'item nomme le résultat officiel qu'elle vise — c'est
        // tout l'objet du rattachement.
        let alembert = c.iter().find(|x| x.texte.contains("Alembert")).unwrap();
        assert_eq!(alembert.genre, "hors");
        assert_eq!(alembert.portee, "item");
        assert_eq!(alembert.porte_sur.as_deref(), Some("Irréductibles de C[X]."));
        assert!(alembert.section.contains("Groupes"));

        // Deux contraintes de genres différents sur le MÊME résultat.
        let limite = c.iter().find(|x| x.genre == "limite").unwrap();
        assert_eq!(limite.porte_sur.as_deref(), Some("Irréductibles de C[X]."));
    }

    #[test]
    fn commentaire_nest_pas_une_contrainte() {
        let c = contraintes(&prog()[0]);
        assert!(
            !c.iter().any(|x| x.texte.contains("racines de l'unité")),
            "un commentaire ne restreint rien : il n'a pas sa place dans la synthèse",
        );
    }

    #[test]
    fn synthese_en_tete_annonce_le_nombre_et_la_legende() {
        let s = synthese_contraintes(&prog()[0]);
        assert!(s.contains("CONTRAINTES DU PROGRAMME (4)"));
        assert!(s.contains("porte sur : Irréductibles de C[X]."));
        assert!(s.contains("portée : toute la section"));
        // La légende des genres évite au modèle d'avoir à les deviner.
        assert!(s.contains("`hors` = exclu"));
    }

    #[test]
    fn item_multiligne_agrege_avant_rattachement() {
        // Un item s'étend souvent sur plusieurs lignes : la contrainte doit
        // viser l'item ENTIER, pas sa dernière ligne.
        const DOC: &str = "---\nfiliere: [TEST]\n---\n\n## S\n\n- Première partie de l'item\n  et sa suite sur une autre ligne.\n\n  **Hors programme.** La démonstration.\n";
        let p = parse_programme(Path::new("/x/m.md"), DOC).unwrap();
        let c = contraintes(&p);
        assert_eq!(c.len(), 1);
        assert_eq!(
            c[0].porte_sur.as_deref(),
            Some("Première partie de l'item et sa suite sur une autre ligne."),
        );
    }

    #[test]
    fn la_legende_du_gabarit_est_exclue_de_lanalyse() {
        // Le mode d'emploi emploie les mots des étiquettes : s'il était
        // analysé, toute recherche y trouverait de fausses occurrences.
        const DOC: &str = "---\nfiliere: [TEST]\n---\n\n## Comment lire ce document\n\n- `**Hors programme.**` signifie exclu.\n\n## Vraie section\n\n- Un contenu.\n";
        let p = parse_programme(Path::new("/x/l.md"), DOC).unwrap();
        assert!(contraintes(&p).is_empty(), "la légende ne doit produire aucune contrainte");
        let v = verifier_perimetre(&[p], "signifie exclu", "TEST", None, None);
        assert_eq!(v.statut, "indetermine");
    }

    #[test]
    fn un_seul_document_sert_plusieurs_filieres() {
        // Le cas réel : un même programme de mathématiques vaut pour MPSI et
        // MP2I. Un fichier, plusieurs filières — jamais de copies à maintenir.
        let p = prog();
        assert!(p[0].correspond("TEST", None, None));
        assert!(p[0].correspond("test2", None, None), "insensible à la casse");
        assert!(!p[0].correspond("PCSI", None, None));
    }

    #[test]
    fn niveau_absent_vaut_pour_toutes_les_annees() {
        // Le programme de sciences industrielles couvre six filières ET les
        // deux années : exiger une correspondance stricte le rendrait
        // introuvable dès qu'on précise l'année.
        const SANS_NIVEAU: &str = "---\nfiliere: [MPSI, MP]\nmatiere: si\n---\n\n## S\n\n- Un contenu.\n";
        let p = vec![parse_programme(Path::new("/x/si.md"), SANS_NIVEAU).unwrap()];
        assert!(p[0].correspond("MPSI", None, Some("1")));
        assert!(p[0].correspond("MP", None, Some("2")));
        assert!(p[0].correspond("MP", None, None));

        // À l'inverse, un document qui DÉCLARE son niveau reste discriminant.
        assert!(prog()[0].correspond("TEST", None, Some("2")));
        assert!(!prog()[0].correspond("TEST", None, Some("1")));
    }

    #[test]
    fn corpus_vide_est_un_succes() {
        let dir = tempfile::tempdir().unwrap();
        assert!(decouvrir(Some(dir.path())).is_empty());
        assert!(decouvrir(None).is_empty());
    }

    // ── Gabarit physique-chimie ─────────────────────────────────────────────
    // Disposition DIFFÉRENTE des mathématiques : la colonne de droite du BO
    // porte des « capacités exigibles » transcrites en puces INDENTÉES sous la
    // notion qu'elles accompagnent, et les contraintes vivent presque toutes
    // dans les bandeaux. Sans ces tests, rien ne protégerait ce gabarit.

    const SPECIMEN_PHYS: &str = r#"---
id: phys-test
filiere: [TEST]
matiere: physique
niveau: 2
---

# Programme de test

## 1. Optique

> Cadre de l'étude.
>
> **Limite.** On se limite au modèle scalaire.
>
> Ce paragraphe suit l'intitulé et ne doit pas être avalé par lui.

- Interférences à deux ondes.
  - Décrire un dispositif interférentiel.
  - **Mettre en œuvre un dispositif de mesure.**

  **Hors programme.** Le calcul du contraste.
"#;

    fn prog_phys() -> Vec<Programme> {
        vec![parse_programme(Path::new("/x/phys-test.md"), SPECIMEN_PHYS).unwrap()]
    }

    #[test]
    fn capacite_indentee_est_rattachee_a_sa_notion() {
        let frags = fragments(SPECIMEN_PHYS);
        let cap = frags
            .iter()
            .find(|f| f.texte.starts_with("Décrire un dispositif"))
            .expect("capacité absente");
        assert_eq!(cap.porte_sur.as_deref(), Some("Interférences à deux ondes."));
    }

    #[test]
    fn intitule_apres_des_capacites_vise_la_notion_pas_la_derniere_capacite() {
        // Le piège que l'indentation signifiante corrige : sans elle, la
        // dernière capacité devenait l'item courant et captait la contrainte.
        let c = contraintes(&prog_phys()[0]);
        let hors = c.iter().find(|c| c.genre == "hors").expect("contrainte absente");
        assert_eq!(hors.porte_sur.as_deref(), Some("Interférences à deux ondes."));
        assert_eq!(hors.portee, "item");
    }

    #[test]
    fn intitule_de_bandeau_ne_devore_pas_le_paragraphe_suivant() {
        let c = contraintes(&prog_phys()[0]);
        let limite = c.iter().find(|c| c.genre == "limite").expect("contrainte absente");
        assert_eq!(limite.texte, "On se limite au modèle scalaire.");
        assert_eq!(limite.portee, "section");
    }

    #[test]
    fn un_bloc_delimite_nest_pas_du_contenu_de_programme() {
        // Un diagramme (```mermaid) ecrit des lignes qui ressemblent a des items :
        // elles ne doivent jamais rejoindre le programme ni ses citations.
        const AVEC_DIAGRAMME: &str = "---\nfiliere: [TEST]\nmatiere: si\n---\n\n## Demarche\n\n```mermaid\nflowchart TB\n    A[Analyser] --- K\n```\n\n- Un vrai item.\n";
        let frags = fragments(AVEC_DIAGRAMME);
        assert!(frags.iter().all(|f| !f.texte.contains("flowchart")));
        assert!(frags.iter().all(|f| !f.texte.contains("Analyser]")));
        assert!(frags.iter().any(|f| f.texte.contains("Un vrai item")));
    }

    #[test]
    fn capacite_en_gras_reste_trouvable() {
        // Les thèmes de TP sont en gras dans la source ; le verdict doit rester
        // « dans » et la citation retrouvable malgré les astérisques.
        let v = verifier_perimetre(&prog_phys(), "dispositif de mesure", "TEST", None, None);
        assert_eq!(v.statut, "dans");
    }

    // ── Sélection d'un programme (transcription du 2026-08-19) ──────────────

    fn fiche(id: &str, filieres: &[&str], matiere: &str, niveau: &str) -> Programme {
        Programme {
            id: id.to_string(),
            filiere: filieres.iter().map(|s| s.to_string()).collect(),
            matiere: Some(matiere.to_string()),
            niveau: Some(niveau.to_string()),
            source: None,
            statut: None,
            couverture: vec![],
            chemin: PathBuf::from(format!("/corpus/{id}.md")),
            contenu: String::new(),
        }
    }

    fn corpus() -> Vec<Programme> {
        vec![
            fiche("inf-1", &["MPSI", "PCSI", "PTSI"], "informatique", "1"),
            fiche("mathematiques-mpsi-mp2i", &["MPSI", "MP2I"], "mathematiques", "1"),
            fiche("phys-mpsi", &["MPSI"], "physique", "1"),
        ]
    }

    #[test]
    fn accent_et_casse_sont_indifferents() {
        // Le modèle transmet ce que l'utilisateur a tapé : « mathématiques »
        // avec son accent, quand le corpus écrit « mathematiques ».
        assert!(meme_libelle("mathematiques", "Mathématiques"));
        assert!(meme_libelle("MPSI", "mpsi"));
        assert!(!meme_libelle("mathematiques", "physique"));
    }

    #[test]
    fn matiere_accentuee_selectionne_le_bon_programme() {
        let c = corpus();
        match selectionner(&c, None, Some("MPSI"), Some("mathématiques"), None) {
            Selection::Unique(p) => assert_eq!(p.id, "mathematiques-mpsi-mp2i"),
            _ => panic!("la matière accentuée doit désigner UN programme"),
        }
    }

    #[test]
    fn filiere_seule_est_ambigue_et_ne_choisit_pas() {
        // C'est le défaut observé : « MPSI » seul rendait le PREMIER de la
        // liste — l'informatique — à qui demandait les mathématiques.
        let c = corpus();
        match selectionner(&c, None, Some("MPSI"), None, None) {
            Selection::Plusieurs(candidats) => assert_eq!(candidats.len(), 3),
            _ => panic!("une filière seule doit être déclarée ambiguë"),
        }
    }

    #[test]
    fn id_l_emporte_et_suffit() {
        let c = corpus();
        match selectionner(&c, Some("mathematiques-mpsi-mp2i"), None, None, None) {
            Selection::Unique(p) => assert_eq!(p.id, "mathematiques-mpsi-mp2i"),
            _ => panic!("un id exact doit désigner UN programme"),
        }
    }

    #[test]
    fn id_inconnu_ne_retombe_pas_sur_la_filiere() {
        // Sinon un id mal orthographié rendrait un programme au hasard.
        let c = corpus();
        assert!(matches!(
            selectionner(&c, Some("inexistant"), Some("MPSI"), None, None),
            Selection::Aucun
        ));
    }

    #[test]
    fn sans_critere_aucun_programme() {
        let c = corpus();
        assert!(matches!(selectionner(&c, None, None, None, None), Selection::Aucun));
    }

    // ── Vocabulaire fermé des matières ─────────────────────────────────────

    #[test]
    fn les_codes_font_quatre_lettres_et_sont_ascii() {
        for (code, _, _) in MATIERES {
            assert_eq!(code.len(), 4, "code « {code} » : quatre lettres attendues");
            assert!(code.is_ascii(), "code « {code} » : pas d'accent dans le vocabulaire");
        }
    }

    #[test]
    fn un_code_exact_donne_le_libelle_du_corpus() {
        assert_eq!(matiere_depuis_code("math"), Some("mathematiques"));
        assert_eq!(matiere_depuis_code("scii"), Some("sciences industrielles"));
    }

    #[test]
    fn hors_vocabulaire_aucune_tolerance() {
        // Le principe du vocabulaire fermé : « mathématiques » n'est PAS un
        // code, même s'il désigne clairement la matière. Il sera suggéré, pas
        // accepté.
        assert_eq!(matiere_depuis_code("mathématiques"), None);
        assert_eq!(matiere_depuis_code("Math"), None);
        assert_eq!(matiere_depuis_code("maths"), None);
    }

    #[test]
    fn la_suggestion_rattrape_ce_que_l_utilisateur_a_tape() {
        assert_eq!(suggerer_matiere("mathématiques"), Some("math"));
        assert_eq!(suggerer_matiere("Maths"), Some("math"));
        assert_eq!(suggerer_matiere("physique"), Some("phys"));
        assert_eq!(suggerer_matiere("sciences industrielles"), Some("scii"));
        assert_eq!(suggerer_matiere("SI"), Some("scii"));
        assert_eq!(suggerer_matiere("informatique"), Some("info"));
    }

    #[test]
    fn une_saisie_sans_rapport_ne_suggere_rien() {
        // Suggérer au hasard serait pire que se taire : le modèle proposerait
        // une correction absurde à l'utilisateur.
        assert_eq!(suggerer_matiere("cuisine"), None);
        assert_eq!(suggerer_matiere(""), None);
    }

    #[test]
    fn chaque_libelle_du_vocabulaire_existe_dans_le_corpus() {
        // Garde-fou : un libellé mal orthographié ici ne sélectionnerait
        // jamais rien, en silence.
        let corpus_labels = ["mathematiques", "physique", "chimie", "informatique", "sciences industrielles"];
        for (_, libelle, _) in MATIERES {
            assert!(corpus_labels.contains(libelle), "libellé inconnu du corpus : {libelle}");
        }
    }
}

// ── Découpage en sections ───────────────────────────────────────────────────

#[cfg(test)]
mod tests_plan {
    use super::*;

    /// Reprend les particularités RÉELLES du corpus : légende en tête, titres
    /// de semestre en `#` (propres aux mathématiques), titres de sous-section
    /// non identifiants (« a) Généralités » se répète), et un bloc délimité
    /// contenant une ligne qui ressemble à un titre.
    const DOC: &str = r#"---
id: test-plan
filiere: [TEST]
matiere: mathematiques
niveau: 1
---

# Programme de test

## Comment lire ce document

- `**Hors programme.**` signifie exclu.

# Premier semestre

## Nombres complexes

> Cadre de la section.
>
> **Limite.** On se limite au cas réel.

### a) Généralités

- Module et argument.

  **Hors programme.** La construction axiomatique.

### b) Racines

- Racines n-ièmes de l'unité.

# Deuxième semestre

## Intégration

Corps propre du chapitre.

```python
## Ceci n'est pas un titre
```

### a) Généralités

- Sommes de Riemann.
"#;

    fn doc() -> Programme {
        parse_programme(Path::new("/x/test-plan.md"), DOC).unwrap()
    }

    #[test]
    fn numerote_par_position_et_ignore_la_legende() {
        // La légende est un mode d'emploi, pas du programme : elle ne consomme
        // pas d'adresse, sans quoi toutes les autres seraient décalées.
        let p = doc();
        let adresses: Vec<_> = plan(&p).iter().map(|s| (s.numero.clone(), s.titre.clone())).collect();
        assert_eq!(
            adresses,
            vec![
                ("1".into(), "Nombres complexes".to_string()),
                ("1.1".into(), "a) Généralités".to_string()),
                ("1.2".into(), "b) Racines".to_string()),
                ("2".into(), "Intégration".to_string()),
                ("2.1".into(), "a) Généralités".to_string()),
            ]
        );
    }

    #[test]
    fn un_titre_dans_un_bloc_de_code_n_est_pas_une_section() {
        // Le parseur de contraintes a déjà eu ce défaut : un diagramme ou un
        // extrait de code y écrit des lignes qui ressemblent à du programme.
        let p = doc();
        assert!(!plan(&p).iter().any(|s| s.titre.contains("Ceci n'est pas")));
    }

    #[test]
    fn le_semestre_accompagne_la_section_sans_entrer_dans_son_chemin() {
        // Seules les mathématiques découpent en semestres : le faire entrer
        // dans le chemin rendrait les chemins incomparables d'un document à
        // l'autre — et ce sont eux qui rapprochent section et contraintes.
        let p = doc();
        let plan = plan(&p);
        let complexes = plan.iter().find(|s| s.numero == "1").unwrap();
        let integration = plan.iter().find(|s| s.numero == "2").unwrap();
        assert_eq!(complexes.contexte.as_deref(), Some("Premier semestre"));
        assert_eq!(integration.contexte.as_deref(), Some("Deuxième semestre"));
        assert_eq!(complexes.chemin, "Nombres complexes");
        assert_eq!(plan.iter().find(|s| s.numero == "1.1").unwrap().chemin, "Nombres complexes › a) Généralités");
    }

    #[test]
    fn le_chemin_distingue_deux_titres_identiques() {
        // « a) Généralités » apparaît trois fois dans le programme de maths
        // MPSI : le titre seul ne peut pas servir d'adresse.
        let p = doc();
        let plan = plan(&p);
        let a = plan.iter().find(|s| s.numero == "1.1").unwrap();
        let b = plan.iter().find(|s| s.numero == "2.1").unwrap();
        assert_eq!(a.titre, b.titre);
        assert_ne!(a.chemin, b.chemin);
    }

    #[test]
    fn une_section_rend_ses_sous_sections() {
        // Demander « 1 » veut dire demander le chapitre entier.
        let p = doc();
        let chapitre = section(&p, "1").unwrap();
        assert!(chapitre.starts_with("## Nombres complexes"));
        assert!(chapitre.contains("Racines n-ièmes"));
        assert!(!chapitre.contains("Sommes de Riemann"));

        let feuille = section(&p, "1.2").unwrap();
        assert!(feuille.starts_with("### b) Racines"));
        assert!(!feuille.contains("Module et argument"));
    }

    #[test]
    fn le_corps_propre_s_arrete_a_la_premiere_sous_section() {
        // C'est ce corps que la recherche notera : compter les sous-sections
        // ferait ressortir toute parente devant ses propres enfants.
        let p = doc();
        let plan = plan(&p);
        let chapitre = plan.iter().find(|s| s.numero == "1").unwrap();
        let corps = &p.contenu[chapitre.debut..chapitre.fin_corps];
        assert!(corps.contains("Cadre de la section"));
        assert!(!corps.contains("Module et argument"));
    }

    #[test]
    fn une_adresse_inconnue_ne_rend_rien() {
        // Jamais de repli sur une section voisine : même règle que
        // `selectionner`, une réponse au hasard est pire que pas de réponse.
        let p = doc();
        assert!(section(&p, "9.9").is_none());
        assert!(section(&p, "").is_none());
        assert!(contraintes_de(&p, "9.9").is_empty());
    }

    #[test]
    fn une_sous_section_herite_des_contraintes_de_sa_parente() {
        // « Hors programme : la construction axiomatique » ne s'interprète que
        // sous la limite posée en tête de chapitre.
        let p = doc();
        let c = contraintes_de(&p, "1.1");
        let genres: Vec<_> = c.iter().map(|c| c.genre.as_str()).collect();
        assert!(genres.contains(&"limite"), "la limite du chapitre doit descendre");
        assert!(genres.contains(&"hors"), "la contrainte propre doit rester");

        // …mais elle ne remonte pas : une sœur n'en hérite pas.
        let soeur = contraintes_de(&p, "1.2");
        assert_eq!(soeur.len(), 1);
        assert_eq!(soeur[0].genre, "limite");
    }

    #[test]
    fn une_contrainte_ne_traverse_pas_les_chapitres() {
        let p = doc();
        assert!(contraintes_de(&p, "2.1").is_empty());
    }

    /// Le corpus livré, s'il est là. Absent d'un build empaqueté : le test se
    /// tait alors au lieu d'échouer.
    fn corpus_du_depot() -> Vec<Programme> {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/programmes");
        if dir.is_dir() { decouvrir(Some(&dir)) } else { Vec::new() }
    }

    #[test]
    fn le_corpus_livre_se_decoupe_entierement() {
        // Ces fichiers sont AUSSI la vue « programmes » de la fenêtre NAV :
        // l'utilisateur les lit et peut les retoucher. Un titre déplacé ne doit
        // pas casser l'adressage en silence — d'où ce garde-fou sur les
        // fichiers réels, et non sur un spécimen seul.
        for p in corpus_du_depot() {
            let plan = plan(&p);
            assert!(!plan.is_empty(), "{} : aucune section", p.id);

            for s in &plan {
                assert!(s.debut < s.fin, "{} § {} : bornes vides", p.id, s.numero);
                assert!(s.fin <= p.contenu.len(), "{} § {} : borne hors texte", p.id, s.numero);
                assert!(s.fin_corps <= s.fin, "{} § {} : corps propre débordant", p.id, s.numero);
                assert!(!s.titre.is_empty(), "{} § {} : titre vide", p.id, s.numero);
                // Le mode d'emploi n'est pas du programme : jamais adressable.
                assert_ne!(s.titre, SECTION_LEGENDE, "{} : légende adressable", p.id);
                // L'adresse doit rendre exactement la section annoncée.
                let texte = section(&p, &s.numero).expect("adresse rendue par le plan");
                assert!(texte.contains(&s.titre), "{} § {} : texte décalé", p.id, s.numero);
            }

            // Une adresse ne peut pas en désigner deux.
            let mut adresses: Vec<&str> = plan.iter().map(|s| s.numero.as_str()).collect();
            adresses.sort_unstable();
            let total = adresses.len();
            adresses.dedup();
            assert_eq!(adresses.len(), total, "{} : adresses en double", p.id);
        }
    }

    #[test]
    fn toute_contrainte_du_corpus_trouve_sa_section() {
        // Contrôle du RAPPROCHEMENT entre les deux analyses : elles découpent
        // le document séparément, et un chemin construit ici mais pas là
        // laisserait des contraintes orphelines — invisibles pour le modèle,
        // qui rédigerait sans les connaître.
        for p in corpus_du_depot() {
            let plan = plan(&p);
            let couvertes: usize = plan
                .iter()
                .map(|s| contraintes_de(&p, &s.numero).len())
                .sum();
            assert!(couvertes > 0 || contraintes(&p).is_empty(), "{} : contraintes toutes orphelines", p.id);

            for c in contraintes(&p) {
                assert!(
                    plan.iter().any(|s| portee_couvre(&c.section, &s.chemin)),
                    "{} : contrainte orpheline, portée « {} »",
                    p.id,
                    c.section
                );
            }
        }
    }
}
