// Serveur MCP INTÉGRÉ — expose les DONNÉES d'AZprose à l'agent sous forme
// d'outils typés, jamais en prose d'instructions (rectificatif §1 : « une
// donnée ne s'écrit jamais dans les instructions »).
//
// Pourquoi intégré et non externe : les outils lisent `.azprose/` — SQLite que
// l'application tient ouverte, `config.json` qu'elle met en cache. Un lecteur
// hébergé ailleurs travaillerait à côté de l'état réel.
//
// Transport : Streamable HTTP sur 127.0.0.1, port ÉPHÉMÈRE, jeton Bearer.
// Mesuré en R0 (OpenCode 1.18.11) : l'agent se connecte SEUL dès `session/new`
// — initialize → notifications/initialized → tools/list — en MCP 2025-11-25.
// Aucun prompt n'est nécessaire pour déclencher le handshake.

use std::sync::{Arc, Mutex};

use axum::{
    body::Body,
    extract::State as AxumState,
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::Response,
};
use rmcp::{
    ServerHandler,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router,
};
use rmcp::schemars::JsonSchema;
use serde::Deserialize;
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};
use serde::Serialize;
use tauri::{Manager, State};
use tokio_util::sync::CancellationToken;

use super::programmes;

/// Callout tel que l'application le connaît (builtins + personnalisés fusionnés).
#[derive(Clone, Serialize, Deserialize)]
pub struct CalloutInfo {
    pub nom: String,
    pub libelle: String,
    pub builtin: bool,
}

/// Ce que les outils servent. **Poussé par le front à chaque `mcp_start`**,
/// pas relu du disque — et c'est délibéré :
///
/// - les callouts **builtin** sont codés côté TypeScript puis fusionnés avec
///   `config.json` ; un lecteur Rust du seul fichier les manquerait ;
/// - le préambule vit dans un store (miroir localStorage de `config.json`) :
///   l'instantané reflète ce que l'utilisateur VOIT, `config.json` pouvant
///   être en retard d'une écriture.
///
/// La fraîcheur vaut celle des instructions qu'il remplace : recalculée à
/// chaque session, et la session est neuve à chaque ouverture (D10).
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFacts {
    pub root: Option<String>,
    pub preambule_math: Option<String>,
    /// Dossier du corpus livre (`app_data_dir()/programmes`), resolu par
    /// `mcp_start` : les outils Rust n'ont pas d'AppHandle.
    pub corpus_dir: Option<String>,
    #[serde(default)]
    pub callouts: Vec<CalloutInfo>,
}

/// Poignée partagée entre la commande Tauri et le serveur : l'utilisateur peut
/// changer de projet sans redémarrer, d'où le `Mutex` plutôt qu'une valeur
/// figée à la construction.
#[derive(Clone, Default)]
pub struct VaultRoot(Arc<Mutex<VaultFacts>>);

impl VaultRoot {
    fn facts(&self) -> VaultFacts {
        self.0.lock().ok().map(|g| g.clone()).unwrap_or_default()
    }
    fn root(&self) -> Option<String> {
        self.0.lock().ok().and_then(|g| g.root.clone())
    }
    pub fn set(&self, facts: VaultFacts) {
        if let Ok(mut g) = self.0.lock() {
            *g = facts;
        }
    }
}

// ── Les outils ──────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AzproseTools {
    tool_router: ToolRouter<AzproseTools>,
    root: VaultRoot,
}

#[tool_router(router = tool_router)]
impl AzproseTools {
    pub fn new(root: VaultRoot) -> Self {
        Self { tool_router: Self::tool_router(), root }
    }

    /// Préambule de macros LaTeX en vigueur dans ce vault. Ces macros sont
    /// chargées avant chaque composition MathJax : elles sont utilisables
    /// directement dans les formules, et il ne faut pas réinventer une
    /// notation qui y figure déjà. Rend `null` si aucun préambule n'est défini.
    #[tool(
        name = "vault_preambule_math",
        description = "Préambule de macros LaTeX du vault, utilisable directement dans les formules.",
        annotations(read_only_hint = true)
    )]
    pub async fn vault_preambule_math(&self) -> String {
        let facts = self.root.facts();
        // Instantané poussé par le front en priorité ; repli sur le disque
        // quand personne n'a poussé (harnais `examples/mcp_serve.rs`).
        let preambule = facts
            .preambule_math
            .filter(|p| !p.trim().is_empty())
            .or_else(|| facts.root.as_deref().and_then(read_math_preamble));
        // Toujours un JSON de forme stable : l'absence de préambule est un
        // SUCCÈS (`null`), jamais une erreur — un outil qui échoue pousse
        // l'agent à renoncer au lieu de travailler.
        serde_json::json!({ "preambule": preambule }).to_string()
    }

    /// Types de callouts disponibles dans ce vault, builtin et personnalisés.
    /// Syntaxe : `> [!nom]` en tête d'un bloc de citation ; suffixe `+`/`-`
    /// pour un encadré pliable ; titre libre possible après le nom.
    #[tool(
        name = "vault_callouts",
        description = "Types de callouts (encadrés) disponibles dans ce vault, avec leur libellé.",
        annotations(read_only_hint = true)
    )]
    pub async fn vault_callouts(&self) -> String {
        let callouts = self.root.facts().callouts;
        serde_json::json!({ "callouts": callouts }).to_string()
    }

    /// Rôle de chaque fichier du dossier `.azprose/` — les DONNÉES d'AZprose
    /// pour ce vault. À interroger avant d'y toucher.
    #[tool(
        name = "vault_donnees_description",
        description = "Rôle, format et éditabilité de chaque fichier du dossier .azprose/.",
        annotations(read_only_hint = true)
    )]
    pub async fn vault_donnees_description(&self) -> String {
        // Description STATIQUE : c'est la structure d'AZprose, pas un état du
        // vault. Elle vit ici plutôt que dans les instructions parce qu'elle
        // est une donnée que l'agent consulte, pas un comportement à imposer.
        serde_json::json!({ "fichiers": [
            { "nom": "config.json", "role": "Réglages du projet (éditeur, thème, maths, callouts, favoris, latex).", "format": "JSON", "editable": "avec prudence" },
            { "nom": "ui.json", "role": "Préférences d'interface du projet.", "format": "JSON", "editable": "avec prudence" },
            { "nom": "session.json", "role": "Onglets ouverts et état de session ; réécrit par l'application.", "format": "JSON", "editable": "sur demande explicite seulement" },
            { "nom": "data.db", "role": "Base SQLite : calendrier, tableurs, grilles de données.", "format": "SQLite (BINAIRE)", "editable": "JAMAIS avec les outils texte — utiliser l'outil base_interroger" },
            { "nom": "csv-cache/", "role": "Cache régénérable.", "format": "dossier", "editable": "sans valeur, suppression sans risque" },
            { "nom": "pdf/rectangle/", "role": "Cache régénérable des régions PDF.", "format": "dossier", "editable": "sans valeur, suppression sans risque" },
        ]})
        .to_string()
    }

    /// Interroge la base SQLite du vault (`.azprose/data.db`) en LECTURE SEULE.
    /// C'est le SEUL accès légitime à ce fichier : l'ouvrir avec un outil texte
    /// le corromprait. Seules les requêtes `SELECT`, `WITH`, `EXPLAIN` et les
    /// `PRAGMA` de consultation sont acceptées.
    #[tool(
        name = "base_interroger",
        description = "Interroge la base SQLite du vault en lecture seule (SELECT/WITH/EXPLAIN/PRAGMA).",
        annotations(read_only_hint = true)
    )]
    pub async fn base_interroger(&self, params: Parameters<RequeteSql>) -> String {
        let Some(root) = self.root.root() else {
            return serde_json::json!({ "erreur": "aucun projet ouvert" }).to_string();
        };
        match query_readonly(&root, &params.0.sql) {
            Ok(v) => v.to_string(),
            Err(e) => serde_json::json!({ "erreur": e }).to_string(),
        }
    }

    // ── Programmes officiels (R3) — LECTURE SEULE ───────────────────────────

    /// Programmes officiels disponibles. Une liste **vide est un succès** :
    /// elle signifie simplement qu'aucun programme n'est installé, et l'agent
    /// travaille alors sans contrainte supplémentaire.
    #[tool(
        name = "programme_lister",
        description = "Programmes officiels disponibles (filière, matière, niveau, couverture).",
        annotations(read_only_hint = true)
    )]
    pub async fn programme_lister(&self) -> String {
        serde_json::json!({ "programmes": self.programmes() }).to_string()
    }

    /// Contenu intégral du programme d'une filière. À charger AVANT de rédiger
    /// un contenu pédagogique, pour connaître le périmètre exact : un
    /// programme se lit en entier, jamais par extraits.
    #[tool(
        name = "programme_charger",
        description = "Contenu intégral du programme officiel d'une filière.",
        annotations(read_only_hint = true)
    )]
    pub async fn programme_charger(&self, params: Parameters<CibleProgramme>) -> String {
        let liste = self.programmes();
        let p = match choisir(&liste, params.0) {
            Ok(p) => p,
            Err(refus) => return refus,
        };
        serde_json::json!({
            "trouve": true,
            "id": p.id,
            // Synthèse des contraintes EN TÊTE : les mentions limitatives sont
            // dispersées dans des milliers de lignes, les rassembler ici
            // garantit qu'elles sont lues avant le contenu.
            "contenu": format!("{}{}", programmes::synthese_contraintes(p), p.contenu),
        })
        .to_string()
    }

    /// Situe une notion vis-à-vis du programme officiel : `dans`, `hors`,
    /// `limitrophe` ou `indetermine`, avec les passages qui font foi.
    ///
    /// ⚠️ `indetermine` est un verdict de plein droit, pas un échec — et
    /// l'absence de mention n'est **jamais** une exclusion.
    #[tool(
        name = "verifier_perimetre",
        description = "Situe une notion vis-à-vis du programme officiel (dans/hors/limitrophe/indetermine) avec citations.",
        annotations(read_only_hint = true)
    )]
    pub async fn verifier_perimetre(&self, params: Parameters<CibleNotion>) -> String {
        let CibleNotion { notion, filiere, matiere, niveau } = params.0;
        let programmes = self.programmes();
        let verdict = programmes::verifier_perimetre(
            &programmes,
            &notion,
            &filiere,
            matiere.as_deref(),
            niveau.as_deref(),
        );
        serde_json::to_string(&verdict).unwrap_or_else(|_| "{}".into())
    }

    /// Les seules **contraintes** d'un programme — mentions « hors programme »,
    /// limites de portée, démonstrations non exigibles — avec le résultat
    /// officiel que chacune vise. À préférer au chargement complet pour une
    /// vérification rapide : c'est la partie limitative, extraite et située.
    #[tool(
        name = "programme_contraintes",
        description = "Contraintes d'un programme (hors programme, limites, non exigible) avec le résultat visé.",
        annotations(read_only_hint = true)
    )]
    pub async fn programme_contraintes(&self, params: Parameters<CibleProgramme>) -> String {
        let liste = self.programmes();
        let p = match choisir(&liste, params.0) {
            Ok(p) => p,
            Err(refus) => return refus,
        };
        serde_json::json!({
            "trouve": true, "id": p.id, "contraintes": programmes::contraintes(p),
        })
        .to_string()
    }

    /// Sections d'un ou plusieurs programmes qui traitent d'un sujet, avec
    /// leur texte et les contraintes qui les visent.
    ///
    /// **Porte d'entrée normale.** Un programme se lit désormais par la section
    /// qui traite du sujet, pas en entier : le programme de mathématiques MPSI
    /// pèse 94 Ko pour 140 sous-sections de 0,5 Ko de médiane, et un résultat
    /// d'outil est renvoyé au modèle à CHAQUE tour de la conversation.
    #[tool(
        name = "programme_chercher",
        description = "Sections des programmes officiels qui traitent d'un sujet, avec leur texte et leurs contraintes.",
        annotations(read_only_hint = true)
    )]
    pub async fn programme_chercher(&self, params: Parameters<CibleRecherche>) -> String {
        let CibleRecherche { requete, max, id, filiere, matiere, niveau } = params.0;
        let liste = self.programmes();
        let matiere = match code_matiere(matiere.as_deref()) {
            Ok(m) => m,
            Err(refus) => return refus,
        };
        // Pas de sélection UNIQUE ici : chercher dans plusieurs programmes à la
        // fois est le cas normal — l'utilisateur en déclare souvent trois.
        let cibles = filtrer(&liste, id.as_deref(), filiere.as_deref(), matiere, niveau.as_deref());
        if cibles.is_empty() {
            return serde_json::json!({
                "trouve": false,
                "raison": "aucun programme ne correspond aux critères. Appelle `azprose_programme_lister`.",
            })
            .to_string();
        }

        let max = max.unwrap_or(3).clamp(1, 5);
        let mut resultats: Vec<(u32, serde_json::Value)> = Vec::new();
        for p in &cibles {
            for (s, note) in programmes::chercher(p, &requete, max) {
                resultats.push((
                    note,
                    serde_json::json!({
                        "programme": p.id,
                        "section": s.numero,
                        "chemin": s.chemin,
                        "contexte": s.contexte,
                        "texte": programmes::section(p, &s.numero).unwrap_or_default(),
                        // Les contraintes voyagent AVEC la section : une
                        // interdiction ne s'interprète pas sans ce qu'elle
                        // restreint.
                        "contraintes": programmes::contraintes_de(p, &s.numero),
                    }),
                ));
            }
        }
        resultats.sort_by(|a, b| b.0.cmp(&a.0));
        resultats.truncate(max);

        if resultats.is_empty() {
            // Rendre « le moins mauvais » résultat ferait rédiger sur une
            // section hors sujet, sous les contraintes d'une autre notion.
            return serde_json::json!({
                "trouve": false,
                "raison": "aucune section ne traite de cette requête. Reformule avec les termes du programme, ou appelle `azprose_programme_plan` pour voir le découpage.",
            })
            .to_string();
        }
        serde_json::json!({
            "trouve": true,
            "resultats": resultats.into_iter().map(|(_, v)| v).collect::<Vec<_>>(),
        })
        .to_string()
    }

    /// Découpage d'un programme : l'adresse, le titre et le nombre de
    /// contraintes de chaque section. La carte, pour se repérer — le contenu
    /// s'obtient ensuite par `programme_section`.
    #[tool(
        name = "programme_plan",
        description = "Découpage d'un programme officiel en sections adressables, avec le nombre de contraintes de chacune.",
        annotations(read_only_hint = true)
    )]
    pub async fn programme_plan(&self, params: Parameters<CibleProgramme>) -> String {
        let liste = self.programmes();
        let p = match choisir(&liste, params.0) {
            Ok(p) => p,
            Err(refus) => return refus,
        };
        serde_json::json!({
            "trouve": true,
            "id": p.id,
            "sections": programmes::plan_annote(p).into_iter().map(|(s, n)| serde_json::json!({
                "section": s.numero,
                "titre": s.titre,
                "contexte": s.contexte,
                "contraintes": n,
            })).collect::<Vec<_>>(),
        })
        .to_string()
    }

    /// Texte de sections désignées, avec les contraintes qui les visent.
    #[tool(
        name = "programme_section",
        description = "Texte de sections précises d'un programme officiel, avec leurs contraintes.",
        annotations(read_only_hint = true)
    )]
    pub async fn programme_section(&self, params: Parameters<CibleSection>) -> String {
        let CibleSection { sections, id, filiere, matiere, niveau } = params.0;
        let liste = self.programmes();
        let p = match choisir(&liste, CibleProgramme { id, filiere, matiere, niveau }) {
            Ok(p) => p,
            Err(refus) => return refus,
        };

        // Plafond : demander le document section par section reviendrait à le
        // charger en entier, en plus cher.
        if sections.len() > 8 {
            return serde_json::json!({
                "trouve": false,
                "raison": "trop de sections demandées (8 au plus). Si le document entier est nécessaire, appelle `azprose_programme_charger`.",
            })
            .to_string();
        }

        let mut trouvees = Vec::new();
        let mut inconnues = Vec::new();
        for numero in &sections {
            match programmes::section(p, numero) {
                Some(texte) => trouvees.push(serde_json::json!({
                    "section": numero,
                    "texte": texte,
                    "contraintes": programmes::contraintes_de(p, numero),
                })),
                // JAMAIS de repli sur une section voisine : le modèle
                // rédigerait sur autre chose que ce qui a été demandé.
                None => inconnues.push(numero.clone()),
            }
        }

        let mut sortie = serde_json::json!({
            "trouve": !trouvees.is_empty(),
            "id": p.id,
            "sections": trouvees,
        });
        if !inconnues.is_empty() {
            sortie["inconnues"] = serde_json::json!(inconnues);
            sortie["adresses_valides"] = serde_json::json!(
                programmes::plan(p).into_iter().map(|s| s.numero).collect::<Vec<_>>()
            );
        }
        sortie.to_string()
    }

    /// Corpus visible : programmes livrés + échappatoire du vault (§4.2).
    fn programmes(&self) -> Vec<programmes::Programme> {
        let facts = self.root.facts();
        programmes::decouvrir(facts.corpus_dir.as_deref().map(std::path::Path::new))
    }
}

/// Argument commun aux outils de programme : la filière est obligatoire, le
/// reste affine.
/// Traduit un code de matière en libellé du corpus.
///
/// `Ok(None)` = aucune matière demandée (toutes). `Err(json)` = code hors
/// vocabulaire : la réponse porte la liste des codes valides et la correction
/// la plus plausible, à SOUMETTRE à l'utilisateur.
fn code_matiere(saisi: Option<&str>) -> Result<Option<&'static str>, String> {
    let Some(code) = saisi.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    if let Some(libelle) = programmes::matiere_depuis_code(code) {
        return Ok(Some(libelle));
    }
    let suggestion = programmes::suggerer_matiere(code);
    Err(serde_json::json!({
        "trouve": false,
        "raison": match suggestion {
            Some(c) => format!(
                "« {code} » n'est pas un code de matière. Voulais-tu dire « {c} » ? \
Demande confirmation à l'utilisateur avant de rappeler l'outil."
            ),
            None => format!("« {code} » n'est pas un code de matière."),
        },
        "suggestion": suggestion,
        "matieres_valides": programmes::MATIERES.iter()
            .map(|(code, libelle, _)| serde_json::json!({ "code": code, "matiere": libelle }))
            .collect::<Vec<_>>(),
    })
    .to_string())
}

/// Programmes qui répondent à des critères — zéro, un ou plusieurs.
///
/// À distinguer de `choisir` : la recherche porte volontiers sur plusieurs
/// programmes à la fois (l'utilisateur en déclare souvent trois), là où charger
/// ou décrire un document exige d'en désigner UN.
fn filtrer<'a>(
    liste: &'a [programmes::Programme],
    id: Option<&str>,
    filiere: Option<&str>,
    matiere: Option<&str>,
    niveau: Option<&str>,
) -> Vec<&'a programmes::Programme> {
    liste
        .iter()
        .filter(|p| {
            id.is_none_or(|x| programmes::meme_libelle(&p.id, x))
                && filiere.is_none_or(|f| p.filiere.iter().any(|x| programmes::meme_libelle(x, f)))
                && matiere
                    .is_none_or(|m| p.matiere.as_deref().is_some_and(|x| programmes::meme_libelle(x, m)))
                // Niveau ABSENT du document = vaut pour toutes les années :
                // le programme de sciences industrielles couvre les deux.
                && niveau.is_none_or(|n| p.niveau.as_deref().is_none_or(|x| programmes::meme_libelle(x, n)))
        })
        .collect()
}

/// Désigne UN programme, ou explique pourquoi c'est impossible.
///
/// Un seul comportement pour tous les outils qui visent un document : le code
/// de matière est validé contre le vocabulaire fermé, et une demande ambiguë
/// est REFUSÉE avec ses candidats. Rendre le premier de la liste donnait le
/// programme d'informatique à qui demandait les mathématiques.
fn choisir<'a>(
    liste: &'a [programmes::Programme],
    cible: CibleProgramme,
) -> Result<&'a programmes::Programme, String> {
    let CibleProgramme { id, filiere, matiere, niveau } = cible;
    let matiere = code_matiere(matiere.as_deref())?;
    let apercu = |p: &programmes::Programme| {
        serde_json::json!({ "id": p.id, "matiere": p.matiere, "filiere": p.filiere, "niveau": p.niveau })
    };
    match programmes::selectionner(liste, id.as_deref(), filiere.as_deref(), matiere, niveau.as_deref()) {
        programmes::Selection::Unique(p) => Ok(p),
        programmes::Selection::Plusieurs(candidats) => Err(serde_json::json!({
            "trouve": false,
            "raison": "demande ambiguë : plusieurs programmes correspondent. Rappelle cet outil avec le champ `id` d'un des candidats ci-dessous.",
            "candidats": candidats.iter().copied().map(apercu).collect::<Vec<_>>(),
        })
        .to_string()),
        programmes::Selection::Aucun => Err(serde_json::json!({
            "trouve": false,
            "raison": "aucun programme ne correspond. Appelle `azprose_programme_lister` et rappelle cet outil avec le champ `id` voulu.",
            "disponibles": liste.iter().map(apercu).collect::<Vec<_>>(),
        })
        .to_string()),
    }
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct CibleProgramme {
    /// Identifiant exact rendu par `azprose_programme_lister` (ex.
    /// « mathematiques-mpsi-mp2i »). C'est la façon SÛRE de désigner un
    /// programme : sans accent, sans ambiguïté. Prioritaire sur les autres
    /// champs.
    pub id: Option<String>,
    /// Filière visée (ex. « MP », « MPSI »). Utilisée seulement sans `id`.
    /// Attention : une filière seule désigne souvent plusieurs programmes.
    pub filiere: Option<String>,
    /// Code de matière — EXACTEMENT l'un de : `math`, `phys`, `chim`, `info`,
    /// `scii`. Quatre lettres, sans accent. Tout autre texte est refusé, avec
    /// une suggestion. Omettre ce champ = toutes les matières.
    pub matiere: Option<String>,
    /// Niveau (« 1 » ou « 2 »). Facultatif.
    pub niveau: Option<String>,
}

/// Argument de `programme_chercher`.
#[derive(Serialize, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct CibleRecherche {
    /// Mots du sujet traité, tels qu'ils viennent de la question de
    /// l'utilisateur (ex. « nombres complexes module argument »). Les accents,
    /// la casse et les pluriels n'ont pas d'importance.
    pub requete: String,
    /// Nombre de sections à rendre — 3 par défaut, 5 au plus.
    pub max: Option<usize>,
    /// Restreint la recherche à ce programme. Omettre pour chercher dans tous
    /// ceux qui correspondent aux autres champs.
    pub id: Option<String>,
    /// Filière visée (ex. « MP », « MPSI »). Facultatif.
    pub filiere: Option<String>,
    /// Code de matière — EXACTEMENT l'un de : `math`, `phys`, `chim`, `info`,
    /// `scii`. Omettre ce champ = toutes les matières.
    pub matiere: Option<String>,
    /// Niveau (« 1 » ou « 2 »). Facultatif.
    pub niveau: Option<String>,
}

/// Argument de `programme_section`.
#[derive(Serialize, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct CibleSection {
    /// Adresses des sections voulues, telles que `azprose_programme_chercher`
    /// ou `azprose_programme_plan` les ont rendues (ex. « 3 », « 3.8 »). Ces
    /// adresses ne se devinent pas : elles ne suivent PAS la numérotation
    /// écrite dans le document. Huit au plus.
    pub sections: Vec<String>,
    /// Identifiant exact du programme, rendu par `azprose_programme_lister`.
    pub id: Option<String>,
    /// Filière visée. Utilisée seulement sans `id`.
    pub filiere: Option<String>,
    /// Code de matière — `math`, `phys`, `chim`, `info` ou `scii`.
    pub matiere: Option<String>,
    /// Niveau (« 1 » ou « 2 »). Facultatif.
    pub niveau: Option<String>,
}

/// Argument de `verifier_perimetre`.
#[derive(Serialize, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct CibleNotion {
    /// Notion à situer (ex. « suites adjacentes »).
    pub notion: String,
    /// Filière visée.
    pub filiere: String,
    pub matiere: Option<String>,
    pub niveau: Option<String>,
}

/// Argument de `base_interroger`.
///
/// `crate = "rmcp::schemars"` : le derive s'étend vers `schemars::…` à la
/// racine, or nous ne dépendons pas directement de ce crate — `rmcp` le
/// réexporte. Le pointer ici évite d'ajouter une dépendance dont la version
/// pourrait diverger de celle qu'attend `rmcp`.
#[derive(Serialize, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct RequeteSql {
    /// Requête SQL de consultation (SELECT, WITH, EXPLAIN ou PRAGMA).
    pub sql: String,
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for AzproseTools {
    fn get_info(&self) -> ServerInfo {
        // `ServerInfo` est `#[non_exhaustive]` : construction par mutation du
        // défaut, jamais par expression de structure.
        let mut info = ServerInfo::default();
        info.capabilities = ServerCapabilities::builder().enable_tools().build();
        info.instructions = Some(
            "Données du vault AZprose (lecture seule). Interroger ces outils \
             plutôt que de deviner ou de lire les fichiers de configuration."
                .into(),
        );
        info
    }
}

/// Lit `math.preamble` de `.azprose/config.json`. Toute anomalie (fichier
/// absent, JSON invalide, clé manquante) rend `None` — jamais d'erreur : ce
/// n'est pas une panne, c'est un vault sans préambule.
/// Une requête est-elle de CONSULTATION ? Validation par liste blanche, jamais
/// par liste noire — on ne devine pas ce qui écrit, on n'autorise que ce qui
/// lit. Le mode lecture seule de SQLite est posé en plus (défense en
/// profondeur), mais ne suffit pas : le plan exige que la requête soit validée.
fn is_readonly_sql(sql: &str) -> Result<(), String> {
    let trimmed = sql.trim().trim_end_matches(';').trim();
    if trimmed.is_empty() {
        return Err("requête vide".into());
    }
    // Plusieurs instructions : un `;` suivi de quoi que ce soit d'utile. Sans
    // cette garde, « SELECT 1; DROP TABLE t » passerait le test du premier mot.
    if trimmed.contains(';') {
        return Err("lecture seule : une seule instruction à la fois".into());
    }
    let head = trimmed
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();
    match head.as_str() {
        "SELECT" | "WITH" | "EXPLAIN" => Ok(()),
        // PRAGMA lit OU écrit selon la forme : `PRAGMA x` consulte,
        // `PRAGMA x = v` modifie. Seule la première est admise.
        "PRAGMA" if !trimmed.contains('=') => Ok(()),
        _ => Err("lecture seule : SELECT, WITH, EXPLAIN ou PRAGMA de consultation uniquement".into()),
    }
}

/// Exécute une requête de consultation sur `.azprose/data.db`.
fn query_readonly(root: &str, sql: &str) -> Result<serde_json::Value, String> {
    is_readonly_sql(sql)?;
    let path = std::path::Path::new(root).join(".azprose/data.db");
    if !path.exists() {
        return Err("aucune base de données dans ce projet".into());
    }
    let conn = rusqlite::Connection::open_with_flags(
        &path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("ouverture impossible : {e}"))?;

    let mut stmt = conn.prepare(sql).map_err(|e| format!("requête invalide : {e}"))?;
    let colonnes: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let n = colonnes.len();

    let mut lignes: Vec<Vec<serde_json::Value>> = Vec::new();
    let mut rows = stmt.query([]).map_err(|e| format!("exécution : {e}"))?;
    // Borne dure : une réponse d'outil part dans la fenêtre de contexte du
    // modèle. Mieux vaut une troncature annoncée qu'un contexte saturé.
    const MAX: usize = 500;
    let mut tronque = false;
    while let Some(row) = rows.next().map_err(|e| format!("lecture : {e}"))? {
        if lignes.len() >= MAX {
            tronque = true;
            break;
        }
        let mut out = Vec::with_capacity(n);
        for i in 0..n {
            out.push(match row.get_ref(i) {
                Ok(rusqlite::types::ValueRef::Null) | Err(_) => serde_json::Value::Null,
                Ok(rusqlite::types::ValueRef::Integer(v)) => serde_json::json!(v),
                Ok(rusqlite::types::ValueRef::Real(v)) => serde_json::json!(v),
                Ok(rusqlite::types::ValueRef::Text(v)) => {
                    serde_json::json!(String::from_utf8_lossy(v))
                }
                Ok(rusqlite::types::ValueRef::Blob(v)) => {
                    serde_json::json!(format!("<blob {} octets>", v.len()))
                }
            });
        }
        lignes.push(out);
    }
    Ok(serde_json::json!({ "colonnes": colonnes, "lignes": lignes, "tronque": tronque }))
}

fn read_math_preamble(root: &str) -> Option<String> {
    let path = std::path::Path::new(root).join(".azprose/config.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let p = json.get("math")?.get("preamble")?.as_str()?.trim();
    if p.is_empty() { None } else { Some(p.to_string()) }
}

// ── Serveur HTTP ────────────────────────────────────────────────────────────

/// Ce que le front doit transmettre à l'agent dans `session/new`.
#[derive(Clone, Serialize)]
pub struct McpEndpoint {
    pub url: String,
    pub token: String,
}

pub struct McpState {
    inner: Mutex<Option<Running>>,
    root: VaultRoot,
}

struct Running {
    endpoint: McpEndpoint,
    cancel: CancellationToken,
}

impl Default for McpState {
    fn default() -> Self {
        Self { inner: Mutex::new(None), root: VaultRoot::default() }
    }
}

/// Jeton d'authentification — pas de dépendance supplémentaire : l'entropie
/// vient de l'horloge et de l'adresse d'une allocation, ce qui suffit pour un
/// service lié à 127.0.0.1 dont la durée de vie est celle du processus.
fn make_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let boxed = Box::new(0u8);
    let addr = &*boxed as *const u8 as usize;
    format!("{nanos:x}{addr:x}")
}

/// Refuse toute requête sans le bon `Authorization: Bearer …`. Le service est
/// pourtant lié à la boucle locale : c'est une défense en profondeur, tout
/// processus de la machine pouvant sinon appeler ces outils.
async fn require_token(
    AxumState(expected): AxumState<String>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let ok = req
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .is_some_and(|t| t == expected);
    if ok { Ok(next.run(req).await) } else { Err(StatusCode::UNAUTHORIZED) }
}

/// Démarre le serveur pour `root`. Idempotent : un serveur déjà en vie est
/// réutilisé, seule la racine est réactualisée — le front peut appeler à
/// chaque session sans se soucier de l'état.
#[tauri::command]
pub async fn mcp_start(
    app: tauri::AppHandle,
    state: State<'_, McpState>,
    facts: VaultFacts,
) -> Result<McpEndpoint, String> {
    // Le corpus livré est résolu ICI plutôt que côté front : c'est un
    // emplacement applicatif, `app_data_dir()` en est la seule source.
    let mut facts = facts;
    if facts.corpus_dir.is_none() {
        facts.corpus_dir = app
            .path()
            .app_data_dir()
            .ok()
            .map(|d| d.join("programmes").to_string_lossy().to_string());
    }
    // L'instantané est RÉACTUALISÉ à chaque appel, y compris quand le serveur
    // tourne déjà : le front redéclare à chaque session, l'agent voit donc
    // toujours l'état courant du vault.
    state.root.set(facts);

    if let Some(running) = state.inner.lock().unwrap().as_ref() {
        return Ok(running.endpoint.clone());
    }

    let (endpoint, cancel) = spawn_mcp_server(state.root.clone()).await?;
    *state.inner.lock().unwrap() = Some(Running { endpoint: endpoint.clone(), cancel });
    Ok(endpoint)
}

/// Démarrage NU du serveur, sans état Tauri — la commande ci-dessus n'en est
/// qu'une enveloppe. Extrait pour être exerçable hors application (validation
/// de la chaîne complète contre l'agent réel).
pub async fn spawn_mcp_server(
    root: VaultRoot,
) -> Result<(McpEndpoint, CancellationToken), String> {
    let token = make_token();
    let cancel = CancellationToken::new();
    let tools_root = root;

    // `StreamableHttpServerConfig` est `#[non_exhaustive]` : mutation du défaut.
    let mut config = StreamableHttpServerConfig::default();
    // Réponse JSON simple : nos outils rendent une valeur et s'arrêtent, aucun
    // n'émet de notification intermédiaire qui exigerait du SSE.
    config.json_response = true;
    config.cancellation_token = cancel.clone();

    let service = StreamableHttpService::new(
        move || Ok(AzproseTools::new(tools_root.clone())),
        Arc::new(LocalSessionManager::default()),
        config,
    );

    let app = axum::Router::new()
        .nest_service("/mcp", service)
        .layer(middleware::from_fn_with_state(token.clone(), require_token));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("écoute impossible : {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let cancel_srv = cancel.clone();
    tokio::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async move { cancel_srv.cancelled().await })
            .await;
    });

    let endpoint = McpEndpoint { url: format!("http://127.0.0.1:{port}/mcp"), token };
    Ok((endpoint, cancel))
}

/// Arrête le serveur. Sans effet s'il ne tourne pas.
#[tauri::command]
pub fn mcp_stop(state: State<'_, McpState>) {
    if let Some(running) = state.inner.lock().unwrap().take() {
        running.cancel.cancel();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn vault_with_config(json: &str) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join(".azprose")).unwrap();
        fs::write(dir.path().join(".azprose/config.json"), json).unwrap();
        dir
    }

    fn corpus() -> Vec<programmes::Programme> {
        let doc = |id: &str, filiere: &str, matiere: &str, niveau: &str| {
            let contenu = format!(
                "---\nid: {id}\nfiliere: [{filiere}]\nmatiere: {matiere}\n{niveau}---\n\n# T\n\n## S\n\n- Item.\n"
            );
            programmes::parse_programme(std::path::Path::new(&format!("/x/{id}.md")), &contenu).unwrap()
        };
        vec![
            doc("mathematiques-mpsi-mp2i", "MPSI, MP2I", "mathematiques", "niveau: 1\n"),
            doc("mathematiques-mp-mpi", "MP, MPI", "mathematiques", "niveau: 2\n"),
            doc("inf-1", "MPSI, PCSI", "informatique", "niveau: 1\n"),
            // Les sciences industrielles ne portent PAS de niveau : le
            // document couvre les deux années.
            doc("si-tout", "MPSI, MP", "sciences industrielles", ""),
        ]
    }

    fn ids(v: Vec<&programmes::Programme>) -> Vec<String> {
        v.into_iter().map(|p| p.id.clone()).collect()
    }

    #[test]
    fn sans_critere_la_recherche_porte_sur_tout_le_corpus() {
        // C'est le cas normal : l'utilisateur déclare plusieurs programmes et
        // pose une question sans préciser lequel.
        let c = corpus();
        assert_eq!(ids(filtrer(&c, None, None, None, None)).len(), 4);
    }

    #[test]
    fn la_recherche_se_restreint_sans_exiger_un_seul_programme() {
        // Différence avec `choisir` : deux programmes de mathématiques ne sont
        // pas une ambiguïté ici, ils sont deux terrains de recherche.
        let c = corpus();
        assert_eq!(
            ids(filtrer(&c, None, None, Some("mathematiques"), None)),
            vec!["mathematiques-mpsi-mp2i", "mathematiques-mp-mpi"]
        );
        assert_eq!(ids(filtrer(&c, Some("inf-1"), None, None, None)), vec!["inf-1"]);
    }

    #[test]
    fn un_document_sans_niveau_vaut_pour_les_deux_annees() {
        // Exiger une correspondance stricte rendait le programme de sciences
        // industrielles introuvable.
        let c = corpus();
        assert!(ids(filtrer(&c, None, None, None, Some("2"))).contains(&"si-tout".to_string()));
        assert!(ids(filtrer(&c, None, None, None, Some("1"))).contains(&"si-tout".to_string()));
    }

    #[test]
    fn un_critere_sans_correspondance_ne_rend_rien() {
        let c = corpus();
        assert!(filtrer(&c, None, Some("PT"), None, None).is_empty());
        assert!(filtrer(&c, Some("inexistant"), None, None, None).is_empty());
    }

    fn cible(id: Option<&str>, filiere: Option<&str>, matiere: Option<&str>) -> CibleProgramme {
        CibleProgramme {
            id: id.map(str::to_string),
            filiere: filiere.map(str::to_string),
            matiere: matiere.map(str::to_string),
            niveau: None,
        }
    }

    #[test]
    fn choisir_designe_un_programme_par_son_id() {
        let c = corpus();
        let p = choisir(&c, cible(Some("inf-1"), None, None)).unwrap();
        assert_eq!(p.id, "inf-1");
    }

    #[test]
    fn choisir_refuse_l_ambiguite_avec_ses_candidats() {
        // Rendre le premier de la liste donnait le programme d'informatique à
        // qui demandait les mathématiques — avec `trouve: true`.
        let c = corpus();
        let refus = choisir(&c, cible(None, Some("MPSI"), None)).err().expect("un refus etait attendu");
        let v: serde_json::Value = serde_json::from_str(&refus).unwrap();
        assert_eq!(v["trouve"], false);
        assert!(v["candidats"].as_array().unwrap().len() > 1);
    }

    #[test]
    fn choisir_refuse_un_code_de_matiere_hors_vocabulaire() {
        // Le code traverse l'appel d'outil en JSON, où l'accent se fait
        // tronquer : le vocabulaire est fermé, et la correction est SOUMISE à
        // l'utilisateur au lieu d'être devinée.
        let c = corpus();
        let refus = choisir(&c, cible(None, Some("MPSI"), Some("mathématiques"))).err().expect("un refus etait attendu");
        let v: serde_json::Value = serde_json::from_str(&refus).unwrap();
        assert_eq!(v["trouve"], false);
        assert_eq!(v["suggestion"], "math");
        assert!(v["matieres_valides"].as_array().unwrap().len() == 5);
    }

    #[test]
    fn choisir_sans_correspondance_liste_ce_qui_existe() {
        let c = corpus();
        let refus = choisir(&c, cible(None, Some("PT"), None)).err().expect("un refus etait attendu");
        let v: serde_json::Value = serde_json::from_str(&refus).unwrap();
        assert_eq!(v["disponibles"].as_array().unwrap().len(), 4);
    }

    #[test]
    fn preambule_lu_depuis_la_config() {
        let dir = vault_with_config(r#"{"math":{"preamble":"\\newcommand{\\R}{\\mathbb{R}}"}}"#);
        let p = read_math_preamble(dir.path().to_str().unwrap());
        assert_eq!(p.as_deref(), Some("\\newcommand{\\R}{\\mathbb{R}}"));
    }

    #[test]
    fn absence_de_preambule_nest_pas_une_erreur() {
        // Trois anomalies distinctes, un seul comportement attendu : None.
        let vide = vault_with_config(r#"{"math":{"preamble":"   "}}"#);
        assert_eq!(read_math_preamble(vide.path().to_str().unwrap()), None);

        let sans_cle = vault_with_config(r#"{"editor":{}}"#);
        assert_eq!(read_math_preamble(sans_cle.path().to_str().unwrap()), None);

        let invalide = vault_with_config("{ pas du json");
        assert_eq!(read_math_preamble(invalide.path().to_str().unwrap()), None);
    }

    #[test]
    fn vault_inexistant_rend_none() {
        assert_eq!(read_math_preamble("/chemin/qui/nexiste/pas"), None);
    }

    #[test]
    fn sql_de_consultation_accepte() {
        for sql in [
            "SELECT * FROM evenements",
            "  select 1  ",
            "WITH t AS (SELECT 1) SELECT * FROM t",
            "EXPLAIN SELECT 1",
            "PRAGMA table_info(evenements)",
            "SELECT 1;", // point-virgule final toléré
        ] {
            assert!(is_readonly_sql(sql).is_ok(), "devrait passer : {sql}");
        }
    }

    #[test]
    fn sql_decriture_refuse() {
        for sql in [
            "UPDATE evenements SET titre = 'x'",
            "DELETE FROM evenements",
            "INSERT INTO evenements VALUES (1)",
            "DROP TABLE evenements",
            "CREATE TABLE t (a)",
            "ALTER TABLE t ADD COLUMN b",
            "REPLACE INTO t VALUES (1)",
            "VACUUM",
            "ATTACH DATABASE 'x' AS y",
            // PRAGMA d'ASSIGNATION : écrit, donc refusé — la forme de
            // consultation du même mot-clé reste admise (test précédent).
            "PRAGMA writable_schema = ON",
            "",
            "   ",
        ] {
            assert!(is_readonly_sql(sql).is_err(), "devrait être refusé : {sql}");
        }
    }

    #[test]
    fn instructions_multiples_refusees() {
        // Sans cette garde, le premier mot suffirait à faire passer une
        // instruction destructrice cachée derrière un point-virgule.
        assert!(is_readonly_sql("SELECT 1; DROP TABLE evenements").is_err());
        assert!(is_readonly_sql("SELECT 1; SELECT 2").is_err());
    }

    #[test]
    fn base_absente_nest_pas_une_panne() {
        let dir = vault_with_config("{}");
        let err = query_readonly(dir.path().to_str().unwrap(), "SELECT 1").err().expect("un refus etait attendu");
        assert!(err.contains("aucune base"), "message inattendu : {err}");
    }

    #[test]
    fn jeton_non_trivial_et_non_repete() {
        let a = make_token();
        let b = make_token();
        assert!(a.len() >= 16, "jeton trop court : {a}");
        assert_ne!(a, b, "deux jetons successifs doivent différer");
    }
}
