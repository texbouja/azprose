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

use std::collections::hash_map::Entry;
use std::collections::HashMap;
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
    /// Identifiants des programmes COCHÉS dans les réglages.
    ///
    /// Sans eux, la recherche balayait les dix programmes livrés : une question
    /// sur la réduction matricielle rendait une section de chimie (« réactions
    /// d'oxydo-réduction ») alors que seules les mathématiques MP étaient
    /// cochées — observé en usage le 2026-08-19. Le réglage doit gouverner ce
    /// que l'assistant consulte, sinon il ne gouverne rien.
    #[serde(default)]
    pub programmes: Vec<String>,
    #[serde(default)]
    pub callouts: Vec<CalloutInfo>,
    /// Nom de colleur de l'utilisateur (`Réglages › Profil`), tel qu'il figure
    /// dans le colloscope importé.
    ///
    /// Sans lui, l'utilisateur devait se présenter à chaque conversation —
    /// « je suis le colleur M. Boujaida » — pour obtenir SES colles, alors que
    /// l'application le sait. Le nom SEUL : ni l'email, ni à plus forte raison
    /// le mot de passe d'application, n'ont rien à faire dans le contexte d'un
    /// modèle.
    #[serde(default)]
    pub colleur_name: Option<String>,
}

/// Poignée partagée entre la commande Tauri et le serveur.
///
/// Le `Mutex` sert à réactualiser l'instantané (préambule, programmes cochés,
/// nom de colleur) sans redémarrer le serveur. Il ne sert PAS à changer de
/// coffre : depuis le 2026-08-31, il y a une poignée — et un serveur — PAR
/// COFFRE, cf. `McpState`.
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

    /// Schéma de la base, ses vues de lecture, et **les pièges à connaître**.
    ///
    /// Un appel remplace la demi-douzaine de requêtes de découverte
    /// (`sqlite_master`, `PRAGMA table_info` × N, échantillons) que le modèle
    /// devait faire avant d'écrire sa vraie requête — chacune coûtant un tour
    /// complet, soit 3 à 4 secondes de latence mesurées.
    #[tool(
        name = "base_schema",
        description = "Schéma de la base du vault, vues de lecture disponibles, catalogue des tableaux et pièges à connaître. À appeler AVANT base_interroger.",
        annotations(read_only_hint = true)
    )]
    pub async fn base_schema(&self) -> String {
        let Some(root) = self.root.root() else {
            return serde_json::json!({ "erreur": "aucun projet ouvert" }).to_string();
        };
        match schema_base(&root, self.root.facts().colleur_name.as_deref()) {
            Ok(v) => v.to_string(),
            Err(e) => serde_json::json!({ "erreur": e }).to_string(),
        }
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
        // La sélection est rendue AVEC la liste : sans elle, le modèle ne peut
        // pas savoir que sa recherche est bornée, ni expliquer à l'utilisateur
        // pourquoi un programme non coché ne remonte pas.
        serde_json::json!({
            "programmes": self.programmes(),
            "retenus": self.root.facts().programmes,
        })
        .to_string()
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
        let p = match choisir(&liste, &self.root.facts().programmes, params.0) {
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
        let p = match choisir(&liste, &self.root.facts().programmes, params.0) {
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
        let CibleRecherche { requete, id, max } = params.0;
        let liste = self.programmes();
        // Pas de sélection UNIQUE ici : chercher dans plusieurs programmes à la
        // fois est le cas normal — l'utilisateur en déclare souvent trois.
        let mut cibles = filtrer(&liste, id.as_deref(), None, None, None);

        // Les réglages font autorité. `filiere` et `matiere` NARROWISSENT la
        // sélection, ils n'en sortent pas : le modèle passe `matiere: math`
        // parce que la question est mathématique, pas parce que l'utilisateur
        // réclame un autre programme. Seul un `id` explicite permet de sortir
        // du périmètre coché — c'est le seul signal non ambigu.
        let cochés = self.root.facts().programmes;
        if id.is_none() && !cochés.is_empty() {
            cibles.retain(|p| cochés.iter().any(|s| programmes::meme_libelle(s, &p.id)));
        }

        if cibles.is_empty() {
            return serde_json::json!({
                "trouve": false,
                "raison": "aucun programme retenu ne correspond aux critères. `azprose_programme_lister` donne les programmes disponibles et ceux que l'utilisateur a retenus ; pour en consulter un autre, rappelle cet outil avec son `id`.",
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
        let p = match choisir(&liste, &self.root.facts().programmes, params.0) {
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
        let p = match choisir(&liste, &self.root.facts().programmes, CibleProgramme { id, filiere, matiere, niveau }) {
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
    retenus: &[String],
    cible: CibleProgramme,
) -> Result<&'a programmes::Programme, String> {
    let CibleProgramme { id, filiere, matiere, niveau } = cible;
    let matiere = code_matiere(matiere.as_deref())?;

    // Aucun critère et UN SEUL programme retenu : il n'y a rien à désigner.
    // Exiger un argument dans ce cas obligeait à un appel préalable pour
    // récupérer un identifiant déjà déterminé — et chaque argument que le
    // modèle doit sérialiser est une occasion d'appel malformé (constaté).
    if id.is_none() && filiere.is_none() && matiere.is_none() && niveau.is_none() {
        let cochés: Vec<_> = liste
            .iter()
            .filter(|p| retenus.iter().any(|s| programmes::meme_libelle(s, &p.id)))
            .collect();
        if let [unique] = cochés[..] {
            return Ok(unique);
        }
    }
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

/// Argument de `programme_chercher` — **trois champs, un seul obligatoire**.
///
/// La surface a été réduite après deux échecs d'appel en usage (2026-08-19 et
/// 20) : sur six paramètres, le modèle produisait `"matiere": {}` — un objet
/// vide là où le schéma attend une chaîne — et l'appel entier était rejeté
/// (« JSON parsing failed »). Le schéma était pourtant correct ; c'est le
/// NOMBRE de champs facultatifs qui invitait à la faute.
///
/// Filière, matière et niveau ont disparu sans perte : les programmes cochés
/// dans les réglages bornent déjà la recherche, et le classement lexical écarte
/// de lui-même les sections d'une autre matière (elles notent zéro). Pour
/// atteindre un programme NON coché, il reste `id`.
#[derive(Serialize, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct CibleRecherche {
    /// Mots du sujet traité, tels qu'ils viennent de la question de
    /// l'utilisateur (ex. « nombres complexes module argument »). Sans accent.
    /// La casse et les pluriels n'ont pas d'importance.
    /// **Dans le cas normal, c'est le SEUL champ à fournir.**
    pub requete: String,
    /// Identifiant d'un programme NON retenu dans les réglages, pour l'y
    /// chercher exceptionnellement (rendu par `azprose_programme_lister`).
    /// Omettre pour chercher dans les programmes retenus — le cas normal.
    pub id: Option<String>,
    /// Nombre de sections à rendre — 3 par défaut, 5 au plus.
    pub max: Option<usize>,
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
        // Le schéma essentiel voyage ICI, avant tout appel d'outil : c'est ce
        // qui fait répondre au PREMIER appel plutôt qu'au troisième.
        let facts = self.root.facts();
        info.instructions = Some(instructions_serveur(
            facts.root.as_deref(),
            facts.colleur_name.as_deref(),
        ));
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

/// Vues de lecture posées avant CHAQUE requête du modèle.
///
/// Elles ne changent rien à la base : `CREATE TEMP VIEW` est accepté sur une
/// connexion `SQLITE_OPEN_READ_ONLY` parce que les objets `temp` vivent dans
/// une base à part, en mémoire. Vérifié avant d'écrire ce code.
///
/// POURQUOI. La donnée d'un tableur est en EAV — `spreadsheet_cells` porte
/// `(spreadsheet_id, row_index, col_index, value)` et les TITRES vivent dans
/// une autre table. Toute lecture lisible exigeait donc du modèle une jointure
/// plus un pivot, qu'il ne pouvait écrire qu'après trois ou quatre requêtes de
/// découverte. Ces vues lui donnent le schéma tel qu'on le PENSE, au lieu du
/// schéma tel qu'il est stocké.
const VUES_LECTURE: &str = "
CREATE TEMP VIEW v_cellules AS
  SELECT s.name AS tableur, c.row_index AS ligne, col.title AS colonne, c.value AS valeur
    FROM spreadsheet_cells c
    JOIN spreadsheets s ON s.id = c.spreadsheet_id
    LEFT JOIN spreadsheet_columns col
      ON col.spreadsheet_id = c.spreadsheet_id AND col.col_index = c.col_index;

CREATE TEMP VIEW v_tableurs AS
  SELECT s.name AS tableur,
         (SELECT COUNT(*) FROM spreadsheet_columns k WHERE k.spreadsheet_id = s.id) AS colonnes,
         (SELECT COUNT(DISTINCT x.row_index) FROM spreadsheet_cells x WHERE x.spreadsheet_id = s.id) AS lignes
    FROM spreadsheets s
   WHERE EXISTS (SELECT 1 FROM spreadsheet_cells c WHERE c.spreadsheet_id = s.id);

CREATE TEMP VIEW v_calendrier AS
  SELECT e.id, e.text AS texte, e.start AS debut, e.end AS fin,
         e.all_day AS journee, e.calendar_id AS calendrier,
         json_extract(e.data, '$.rrule') AS rrule
    FROM calendar_events e;
";

/// Identifiants des tableaux du colloscope, lus de `.azprose/config.json`.
///
/// Par la CONFIG et non par le nom des tableaux : « Colloscope — MP-2 » est
/// une convention d'affichage, la config porte la correspondance exacte
/// classe → identifiant. Même motif que `read_math_preamble`.
fn colloscope_ids(root: &str) -> Option<(String, Vec<(String, String)>)> {
    let path = std::path::Path::new(root).join(".azprose/config.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let co = json.get("colles")?.get("colloscope")?;
    let eleves = co.get("elevesSpreadsheetId")?.as_str()?.to_string();
    let classes = co.get("colloscopeSpreadsheetIds")?.as_object()?;
    let mut ids = Vec::new();
    for (classe, v) in classes {
        if let Some(sid) = v.as_str() {
            ids.push((classe.clone(), sid.to_string()));
        }
    }
    if eleves.is_empty() || ids.is_empty() { return None; }
    Some((eleves, ids))
}

/// Un identifiant est-il un UUID bien formé ?
///
/// Ces identifiants viennent de NOTRE config, mais ils finissent concaténés
/// dans du SQL : une chaîne bâtie par concaténation reste une chaîne bâtie par
/// concaténation. On ne laisse passer que la forme attendue.
fn est_uuid(s: &str) -> bool {
    s.len() == 36
        && s.as_bytes().iter().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => *b == b'-',
            _ => b.is_ascii_hexdigit(),
        })
}

/// Vues MÉTIER des colles. Posées seulement si un colloscope est importé —
/// une vue absente vaut mieux qu'une vue vide, qu'on prendrait pour
/// « aucune colle ».
///
/// ⚠️ `v_colle_eleves` REJOUE EN SQL la règle de `resoudreEleves`
/// (`src/colles/projection.ts`) : la cellule `Groupe` désigne soit un groupe
/// connu de la classe, soit une liste de codes élèves (un rattrapage). Les
/// deux implémentations DOIVENT rester d'accord — c'est l'objet du jeu de
/// fixtures partagé `tests/fixtures/colles-resolution.json`, consommé par
/// `tests/colles-projection.test.ts` ET par le test cargo de ce module. Une
/// divergence silencieuse entre deux implémentations d'une même règle a déjà
/// coûté des semaines d'échec muet sur les notes quotidiennes (2026-08-23).
fn poser_vues_colles(conn: &rusqlite::Connection, root: &str) {
    let Some((eleves_id, classes)) = colloscope_ids(root) else { return };
    if !est_uuid(&eleves_id) || !classes.iter().all(|(_, s)| est_uuid(s)) {
        eprintln!("[mcp] identifiants de colloscope inattendus, vues métier non posées");
        return;
    }
    let valeurs: Vec<String> = classes
        .iter()
        .map(|(classe, sid)| format!("('{}','{}')", classe.replace('\'', "''"), sid))
        .collect();

    let sql = format!(
        "
CREATE TEMP TABLE _colloscopes(classe TEXT, sid TEXT);
INSERT INTO _colloscopes VALUES {valeurs};

CREATE TEMP VIEW v_eleves AS
  SELECT MAX(CASE WHEN col.title='Code'   THEN c.value END) AS code,
         MAX(CASE WHEN col.title='Nom'    THEN c.value END) AS nom,
         MAX(CASE WHEN col.title='Prénom' THEN c.value END) AS prenom,
         MAX(CASE WHEN col.title='Classe' THEN c.value END) AS classe,
         MAX(CASE WHEN col.title='Groupe' THEN c.value END) AS groupe,
         MAX(CASE WHEN col.title='Email'  THEN c.value END) AS email
    FROM spreadsheet_cells c
    JOIN spreadsheet_columns col
      ON col.spreadsheet_id = c.spreadsheet_id AND col.col_index = c.col_index
   WHERE c.spreadsheet_id = '{eleves_id}'
   GROUP BY c.row_index
  HAVING code IS NOT NULL AND code <> '';

CREATE TEMP VIEW v_colles AS
  SELECT k.classe AS classe,
    MAX(CASE WHEN col.title='Date'    THEN c.value END) AS date,
    MAX(CASE WHEN col.title='Jour'    THEN c.value END) AS jour,
    MAX(CASE WHEN col.title='Horaire' THEN c.value END) AS horaire,
    MAX(CASE WHEN col.title='Groupe'  THEN c.value END) AS groupe,
    MAX(CASE WHEN col.title='Colleur' THEN c.value END) AS colleur,
    MAX(CASE WHEN col.title='Matière' THEN c.value END) AS matiere,
    MAX(CASE WHEN col.title='Salle'   THEN c.value END) AS salle,
    c.spreadsheet_id AS tableur, c.row_index AS ligne
  FROM spreadsheet_cells c
  JOIN _colloscopes k ON k.sid = c.spreadsheet_id
  LEFT JOIN spreadsheet_columns col
    ON col.spreadsheet_id = c.spreadsheet_id AND col.col_index = c.col_index
  GROUP BY c.spreadsheet_id, c.row_index
  HAVING date IS NOT NULL AND date <> '';

CREATE TEMP VIEW v_colle_jetons AS
  WITH RECURSIVE decoupe(tableur, ligne, reste, jeton) AS (
    SELECT tableur, ligne, replace(groupe, ';', ',') || ',', '' FROM v_colles
    UNION ALL
    SELECT tableur, ligne,
           substr(reste, instr(reste, ',') + 1),
           trim(substr(reste, 1, instr(reste, ',') - 1))
      FROM decoupe WHERE reste <> ''
  )
  SELECT tableur, ligne, jeton FROM decoupe WHERE jeton <> '';

-- SURENSEMBLE de v_colles : toutes ses colonnes, plus l'élève. Mesuré le
-- 2026-08-23 : la vue n'exposait ni `jour` ni `salle`, et le modèle a demandé
-- `salle` dès sa première requête — un tour perdu pour une omission sans
-- raison. Une vue doit porter ce qu'on lui demandera naturellement.
CREATE TEMP VIEW v_colle_eleves AS
  SELECT c.classe, c.date, c.jour, c.horaire, c.groupe, c.colleur, c.matiere, c.salle,
         e.code, e.nom, e.prenom, e.email,
         'groupe' AS designation, c.tableur, c.ligne
    FROM v_colles c
    JOIN v_eleves e
      ON lower(trim(e.classe)) = lower(trim(c.classe))
     AND lower(trim(e.groupe)) = lower(trim(c.groupe))
  UNION ALL
  SELECT c.classe, c.date, c.jour, c.horaire, c.groupe, c.colleur, c.matiere, c.salle,
         e.code, e.nom, e.prenom, e.email,
         'code' AS designation, c.tableur, c.ligne
    FROM v_colles c
    JOIN v_colle_jetons j ON j.tableur = c.tableur AND j.ligne = c.ligne
    JOIN v_eleves e
      ON lower(trim(e.classe)) = lower(trim(c.classe))
     AND lower(trim(e.code))   = lower(trim(j.jeton))
   WHERE NOT EXISTS (
     SELECT 1 FROM v_eleves g
      WHERE lower(trim(g.classe)) = lower(trim(c.classe))
        AND lower(trim(g.groupe)) = lower(trim(c.groupe)));
",
        valeurs = valeurs.join(",")
    );

    if let Err(e) = conn.execute_batch(&sql) {
        eprintln!("[mcp] vues des colles non posées : {e}");
    }
}

/// Ouvre la base en LECTURE SEULE et y pose les vues de lecture.
fn ouvrir_lecture(root: &str) -> Result<rusqlite::Connection, String> {
    let path = std::path::Path::new(root).join(".azprose/data.db");
    if !path.exists() {
        return Err("aucune base de données dans ce projet".into());
    }
    let conn = rusqlite::Connection::open_with_flags(
        &path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("ouverture impossible : {e}"))?;
    // Une vue qui échoue ne doit pas priver le modèle de la base : il lui
    // reste les tables réelles. On journalise et on continue.
    if let Err(e) = conn.execute_batch(VUES_LECTURE) {
        eprintln!("[mcp] vues de lecture non posées : {e}");
    }
    poser_vues_colles(&conn, root);
    Ok(conn)
}

/// Une vue existe-t-elle sur cette connexion ? (les `temp` ne figurent pas
/// dans `sqlite_master` de la base principale.)
fn vue_posee(conn: &rusqlite::Connection, nom: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM temp.sqlite_master WHERE type='view' AND name=?1",
        [nom],
        |_| Ok(()),
    )
    .is_ok()
}

/// Schéma, catalogue et pièges — la réponse de `base_schema`.
fn schema_base(root: &str, colleur: Option<&str>) -> Result<serde_json::Value, String> {
    let conn = ouvrir_lecture(root)?;

    // Tables réelles et leurs colonnes.
    let mut tables = serde_json::Map::new();
    {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .map_err(|e| e.to_string())?;
        let noms: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        for nom in noms {
            let mut c = conn
                .prepare(&format!("PRAGMA table_info({nom})"))
                .map_err(|e| e.to_string())?;
            let cols: Vec<String> = c
                .query_map([], |r| r.get::<_, String>(1))
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect();
            tables.insert(nom, serde_json::json!(cols));
        }
    }

    // Catalogue des tableaux NON VIDES, avec titres et un échantillon — c'est
    // l'échantillon qui donne le format des dates sans requête dédiée.
    let mut tableaux = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT tableur, colonnes, lignes FROM v_tableurs ORDER BY tableur")
            .map_err(|e| e.to_string())?;
        let entrees: Vec<(String, i64, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        for (nom, colonnes, lignes) in entrees {
            let mut t = conn
                .prepare(
                    "SELECT colonne, valeur FROM v_cellules
                      WHERE tableur = ?1 AND ligne = (SELECT MIN(ligne) FROM v_cellules WHERE tableur = ?1)",
                )
                .map_err(|e| e.to_string())?;
            let mut echantillon = serde_json::Map::new();
            let mut titres = Vec::new();
            for r in t
                .query_map([&nom], |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, Option<String>>(1)?)))
                .map_err(|e| e.to_string())?
                .flatten()
            {
                if let Some(titre) = r.0 {
                    titres.push(titre.clone());
                    echantillon.insert(titre, serde_json::json!(r.1.unwrap_or_default()));
                }
            }
            tableaux.push(serde_json::json!({
                "nom": nom, "colonnes": colonnes, "lignes": lignes,
                "titres": titres, "premiere_ligne": echantillon,
            }));
        }
    }

    let colles = vue_posee(&conn, "v_colles");

    // Résumé des colles. Mesuré le 2026-08-23 : sans la PÉRIODE, un modèle à
    // qui l'on demande « le 8 décembre » choisit l'année en devinant — il a
    // cherché 2025-12-08, n'a rien trouvé, et a dû sonder la base pour
    // découvrir que l'année scolaire courait sur 2026-2027. Un tour perdu
    // pour une borne que la base connaît.
    let resume_colles = if colles {
        conn.query_row(
            "SELECT MIN(date), MAX(date), COUNT(*),
                    (SELECT COUNT(DISTINCT colleur) FROM v_colles WHERE colleur <> ''),
                    (SELECT group_concat(DISTINCT classe) FROM v_colles)
               FROM v_colles",
            [],
            |r| {
                Ok(serde_json::json!({
                    "periode": format!("{} → {}",
                        r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                        r.get::<_, Option<String>>(1)?.unwrap_or_default()),
                    "seances": r.get::<_, i64>(2)?,
                    "colleurs_distincts": r.get::<_, i64>(3)?,
                    "classes": r.get::<_, Option<String>>(4)?.unwrap_or_default(),
                }))
            },
        )
        .ok()
    } else {
        None
    };

    // Les vues, avec leur rôle en une ligne.
    let mut vues = serde_json::Map::new();
    vues.insert("v_cellules".into(), serde_json::json!(
        "(tableur, ligne, colonne, valeur) — les cellules AVEC le titre de leur colonne. Pivoter avec MAX(CASE WHEN colonne='X' THEN valeur END) … GROUP BY tableur, ligne."));
    vues.insert("v_tableurs".into(), serde_json::json!(
        "(tableur, colonnes, lignes) — catalogue ; les tableaux sans aucune cellule en sont exclus."));
    vues.insert("v_calendrier".into(), serde_json::json!(
        "(id, texte, debut, fin, journee, calendrier, rrule) — les événements PROPRES du calendrier."));
    if colles {
        vues.insert("v_colles".into(), serde_json::json!(
            "(classe, date, jour, horaire, groupe, colleur, matiere, salle, tableur, ligne) — les colles, déjà pivotées. UNE ligne par séance."));
        vues.insert("v_colle_eleves".into(), serde_json::json!(
            "(classe, date, jour, horaire, groupe, colleur, matiere, salle, code, nom, prenom, email, designation, tableur, ligne) — SURENSEMBLE de v_colles, une ligne PAR ÉLÈVE. Groupes et rattrapages résolus. C'est la vue à utiliser pour toute question portant sur des élèves."));
    }

    // Les pièges. Sans eux, un modèle lit les tables et conclut faux.
    let mut pieges = vec![
        serde_json::json!("Les valeurs d'un tableau sont en EAV dans `spreadsheet_cells` (spreadsheet_id, row_index, col_index, value) et les TITRES de colonnes dans `spreadsheet_columns`. Ne pas les lire directement : passer par `v_cellules`, qui fait la jointure."),
        serde_json::json!("`base_interroger` s'arrête à 500 lignes. Un résultat tronqué le DIT (champ `tronque`) : ne jamais conclure d'un résultat tronqué, affiner ou agréger."),
    ];
    if colles {
        pieges.push(serde_json::json!("`calendar_events` ne contient PAS les colles — l'utilisateur les voit pourtant dans son calendrier, où elles sont PROJETÉES depuis le colloscope. Pour les colles, interroger `v_colles`, jamais `v_calendrier`."));
        pieges.push(serde_json::json!("La cellule `Groupe` d'une colle désigne SOIT un groupe, SOIT une liste de codes élèves séparés par une virgule (un rattrapage). Un `WHERE groupe='G6'` rate les rattrapages : passer par `v_colle_eleves`."));
        pieges.push(serde_json::json!("Les noms de colleur s'écrivent avec une civilité dans le colloscope (« M. BOUJAIDA ») : comparer avec LIKE sur le nom de famille, jamais par égalité stricte."));
        pieges.push(serde_json::json!("`horaire` est du TEXTE (« 13h-14h ») : il ne se trie ni ne se compare comme une heure. Trier sur `date`, pas sur `horaire`."));
    } else {
        pieges.push(serde_json::json!("Aucun colloscope n'est importé dans ce projet : les vues `v_colles` et `v_colle_eleves` n'existent pas."));
    }

    Ok(serde_json::json!({
        "tables": tables,
        "vues": vues,
        "tableaux": tableaux,
        "colles": resume_colles,
        "pieges": pieges,
        // Qui est l'utilisateur — pour qu'il n'ait pas à se présenter.
        "colleur": colleur.filter(|c| !c.trim().is_empty()),
    }))
}

/// Ce que le serveur annonce au modèle À L'OUVERTURE DE SESSION, avant tout
/// appel d'outil.
///
/// Mesuré le 2026-08-23 : une question simple coûtait CINQ appels, dont le
/// premier n'était que `base_schema`. Or l'essentiel de ce schéma tient en
/// quelques lignes, et le protocole offre un endroit pour les dire
/// gratuitement. Les mettre ici, c'est répondre au premier appel au lieu du
/// troisième. `base_schema` reste, pour le détail.
fn instructions_serveur(root: Option<&str>, colleur: Option<&str>) -> String {
    // La date du jour n'était fournie NULLE PART. « Le troisième mardi de
    // janvier », « la semaine prochaine », « depuis un mois » : toute question
    // temporelle en dépend, et le modèle s'en tirait en inférant l'année
    // depuis la période des colles — quand elle existe.
    let aujourdhui = chrono::Local::now();
    let jours = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
    let jour = jours[chrono::Datelike::weekday(&aujourdhui).num_days_from_monday() as usize];

    let mut t = format!(
        "Aujourd'hui : {jour} {}.\n\n",
        aujourdhui.format("%Y-%m-%d")
    );
    t.push_str(
        "Données du vault AZprose, en LECTURE SEULE (outil `base_interroger`, SQL SELECT/WITH/EXPLAIN). \
         Interroger ces outils plutôt que de deviner ou de lire les fichiers de configuration.\n\n\
         `base_interroger` accepte PLUSIEURS instructions séparées par « ; » en un seul appel, \
         et rend un résultat par instruction : explorer et répondre dans le MÊME appel plutôt \
         qu'en plusieurs tours.\n\n\
         VUES prêtes à l'emploi — les préférer TOUJOURS aux tables brutes :\n\
         · v_cellules(tableur, ligne, colonne, valeur) — n'importe quel tableau, titres de colonnes joints.\n\
         · v_tableurs(tableur, colonnes, lignes) — catalogue.\n\
         · v_calendrier(...) — les événements propres du calendrier.\n",
    );

    let resume = root.and_then(|r| ouvrir_lecture(r).ok()).and_then(|conn| {
        if !vue_posee(&conn, "v_colles") { return None; }
        conn.query_row(
            "SELECT MIN(date), MAX(date), COUNT(*) FROM v_colles",
            [],
            |r| Ok((
                r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                r.get::<_, i64>(2)?,
            )),
        ).ok()
    });

    if let Some((debut, fin, n)) = resume {
        t.push_str(
            "· v_colles(classe, date, jour, horaire, groupe, colleur, matiere, salle) — une ligne par SÉANCE.\n\
             · v_colle_eleves(… mêmes colonnes … + code, nom, prenom, email) — une ligne par ÉLÈVE de chaque colle,\n\
             \x20 groupes ET rattrapages résolus. C'est la vue de toute question portant sur des élèves.\n\n",
        );
        t.push_str(&format!(
            "COLLES : {n} séances, du {debut} au {fin}. Une date sans année désigne cette période — ne pas la deviner.\n"
        ));
        t.push_str(
            "Le colleur s'écrit avec sa civilité (« M. BOUJAIDA ») : comparer par LIKE sur le nom, jamais par égalité.\n\
             `horaire` est du TEXTE (« 13h-14h ») : trier sur `date`, jamais sur `horaire`.\n\
             `calendar_events` ne contient PAS les colles ; elles sont projetées depuis le colloscope.\n",
        );
        // Un exemple TRAVAILLÉ, et non une description de plus. Mesuré le
        // 2026-08-23 : le modèle interrogeait v_colle_eleves une PREMIÈRE fois
        // sans sélectionner nom/prenom — il obtenait donc chaque séance
        // répétée autant de fois qu'elle a d'élèves, jetait ce résultat, et
        // reposait la même question. Deux appels pour une seule réponse.
        let filtre = colleur
            .filter(|c| !c.trim().is_empty())
            .map(|c| format!("'%{}%'", c.trim().replace('\'', "''")))
            .unwrap_or_else(|| "'%NOM%'".to_string());
        t.push_str(&format!(
            "\nUNE SEULE requête suffit pour « quels élèves ai-je en colle tel jour ? » —\n\
             v_colle_eleves porte AUSSI les colonnes de la séance :\n\
             \x20 SELECT horaire, groupe, salle, nom, prenom FROM v_colle_eleves\n\
             \x20  WHERE date='{debut}' AND colleur LIKE {filtre} ORDER BY horaire, nom;\n\
             Attention : cette vue rend UNE LIGNE PAR ÉLÈVE. Omettre nom/prenom fait\n\
             apparaître chaque séance en autant d'exemplaires qu'elle a d'élèves.\n"
        ));
    } else {
        t.push_str("\nAucun colloscope importé : les vues v_colles et v_colle_eleves n'existent pas.\n");
    }

    if let Some(c) = colleur.filter(|c| !c.trim().is_empty()) {
        t.push_str(&format!("\nL'UTILISATEUR est le colleur « {c} » — « mes colles » le désigne.\n"));
    }
    t.push_str("\n`base_schema` donne le détail complet (toutes les tables, un échantillon par tableau).");
    t
}

/// Découpe une suite d'instructions, si et seulement si CHACUNE est une
/// instruction de consultation valide.
///
/// Pourquoi ce « si et seulement si ». Découper sur « ; » est naïf : un
/// point-virgule dans un littéral (`LIKE '%;%'`, réel — un rattrapage sépare
/// ses codes élèves ainsi) casserait la requête en fragments absurdes. Mais
/// alors ces fragments ne passent pas la liste blanche, on rend `None`, et
/// l'appelant refuse — comme avant. **Le pire cas est un refus, jamais une
/// exécution imprévue.**
fn decouper_instructions(sql: &str) -> Option<Vec<String>> {
    let morceaux: Vec<String> = sql
        .split(';')
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .collect();
    if morceaux.len() < 2 {
        return None;
    }
    if morceaux.iter().all(|m| is_readonly_sql(m).is_ok()) {
        Some(morceaux)
    } else {
        None
    }
}

/// Exécute une ou PLUSIEURS instructions de consultation.
///
/// Le modèle explorait en plusieurs tours — sonder, puis répondre — parce
/// qu'un appel ne portait qu'une requête. Or un tour coûte 3 à 4 secondes de
/// latence, là où un shell sqlite en enchaîne dix en trois. Une seule
/// connexion, un seul aller-retour : c'est ce qui rend l'exploration gratuite,
/// et cela vaut pour TOUTE question, pas pour une forme particulière.
///
/// Forme de la réponse : inchangée pour une instruction seule (rien à casser),
/// `{resultats: [...]}` pour une suite.
fn query_readonly(root: &str, sql: &str) -> Result<serde_json::Value, String> {
    if let Some(morceaux) = decouper_instructions(sql) {
        let conn = ouvrir_lecture(root)?;
        let mut resultats = Vec::with_capacity(morceaux.len());
        for m in &morceaux {
            match executer_une(&conn, m) {
                Ok(v) => resultats.push(v),
                // Une instruction fautive n'annule pas les précédentes : le
                // modèle voit ce qui a marché ET ce qui a échoué, en un tour.
                Err(e) => resultats.push(serde_json::json!({ "requete": m, "erreur": e })),
            }
        }
        return Ok(serde_json::json!({ "resultats": resultats }));
    }
    is_readonly_sql(sql)?;
    let conn = ouvrir_lecture(root)?;
    executer_une(&conn, sql)
}

/// Sur « no such column », dit QUELLES colonnes existent dans les tables et
/// vues que la requête mentionne.
///
/// Mesuré le 2026-08-23 : le modèle a demandé une colonne absente et a perdu
/// un tour entier à le découvrir. Une erreur qui se contente de refuser fait
/// payer un aller-retour ; une erreur qui enseigne n'en fait payer aucun.
fn aide_colonnes(conn: &rusqlite::Connection, sql: &str, erreur: &str) -> String {
    if !erreur.contains("no such column") {
        return String::new();
    }
    // Objets connus, vues temporaires comprises (elles ne figurent pas dans
    // le `sqlite_master` de la base principale).
    let mut noms: Vec<String> = Vec::new();
    for source in ["sqlite_master", "temp.sqlite_master"] {
        if let Ok(mut s) = conn.prepare(&format!(
            "SELECT name FROM {source} WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'"
        )) {
            if let Ok(it) = s.query_map([], |r| r.get::<_, String>(0)) {
                noms.extend(it.flatten());
            }
        }
    }
    let minuscule = sql.to_lowercase();
    let mut aide = String::new();
    for nom in noms {
        if !minuscule.contains(&nom.to_lowercase()) {
            continue;
        }
        let Ok(mut s) = conn.prepare(&format!("PRAGMA table_info({nom})")) else { continue };
        let Ok(it) = s.query_map([], |r| r.get::<_, String>(1)) else { continue };
        let cols: Vec<String> = it.flatten().collect();
        if !cols.is_empty() {
            aide.push_str(&format!("\n  colonnes de {nom} : {}", cols.join(", ")));
        }
    }
    aide
}

/// Une instruction, déjà validée, sur une connexion déjà ouverte.
fn executer_une(conn: &rusqlite::Connection, sql: &str) -> Result<serde_json::Value, String> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("requête invalide : {e}{}", aide_colonnes(conn, sql, &e.to_string())))?;
    let colonnes: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let n = colonnes.len();

    let mut lignes: Vec<Vec<serde_json::Value>> = Vec::new();
    let mut rows = stmt.query([]).map_err(|e| format!("exécution : {e}"))?;
    // Borne dure : une réponse d'outil part dans la fenêtre de contexte du
    // modèle.
    //
    // Le plafond ne bouge PAS. Le vrai danger n'est pas le contexte saturé,
    // c'est le modèle qui raisonne sur un résultat partiel EN LE CROYANT
    // COMPLET, et conclut faux — un plafond plus haut ne ferait que déplacer
    // le seuil auquel il se trompe. Ce qui change, c'est que la troncature se
    // DIT : combien de lignes rendues, combien il y en avait, et quoi faire.
    // Les requêtes qui atteignaient 500 étaient d'ailleurs celles que les
    // vues suppriment (3 136 cellules brutes d'un colloscope contre 448
    // lignes par `v_colles`).
    const MAX: usize = 500;
    let mut tronque = false;
    // On lit UNE ligne de plus que le plafond : c'est ce qui distingue « 500
    // pile » d'« au moins 501 », sans payer un COUNT(*) sur chaque requête.
    let mut total_au_moins = 0usize;
    while let Some(row) = rows.next().map_err(|e| format!("lecture : {e}"))? {
        total_au_moins += 1;
        if lignes.len() >= MAX {
            tronque = true;
            continue; // on continue de compter, sans accumuler
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
    let rendues = lignes.len();
    let mut sortie = serde_json::json!({
        "colonnes": colonnes,
        "lignes": lignes,
        "tronque": tronque,
        "rendues": rendues,
    });
    if tronque {
        sortie["total"] = serde_json::json!(total_au_moins);
        // La phrase compte autant que le chiffre : c'est elle qui empêche de
        // conclure d'un extrait pris pour un tout.
        sortie["avertissement"] = serde_json::json!(format!(
            "Résultat PARTIEL : {rendues} lignes rendues sur {total_au_moins} correspondantes. \
             Ne rien conclure de cet extrait — affiner le filtre, ou agréger \
             (COUNT, GROUP BY) plutôt que lister."
        ));
    }
    Ok(sortie)
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

/// Un serveur MCP **par coffre**, indexé par sa racine.
///
/// Auparavant : un serveur unique et une `VaultRoot` unique pour tout le
/// processus, que `mcp_start` réécrivait à chaque appel. Avec deux fenêtres
/// ouvertes sur deux projets, la dernière à démarrer une session gagnait — et
/// l'assistant de la première interrogeait le `data.db`, les colles et les
/// fichiers de la SECONDE. C'était la fuite inter-projets la plus silencieuse
/// de l'application : rien, dans l'interface, ne la trahissait.
///
/// Chaque serveur écoute sur son propre port éphémère et porte son propre
/// jeton : deux fenêtres ne peuvent plus se confondre, même par accident.
#[derive(Default)]
pub struct McpState {
    serveurs: Mutex<HashMap<String, Running>>,
}

struct Running {
    endpoint: McpEndpoint,
    cancel: CancellationToken,
    /// Poignée propre à CE coffre — réactualisée à chaque session de la fenêtre
    /// correspondante, jamais par une autre.
    root: VaultRoot,
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

/// Démarre le serveur DU COFFRE `facts.root`. Idempotent : le serveur de ce
/// coffre, s'il est déjà en vie, est réutilisé et son instantané réactualisé —
/// le front peut appeler à chaque session sans se soucier de l'état.
///
/// ⚠️ L'instantané n'est réactualisé QUE pour le coffre appelant. Une autre
/// fenêtre, sur un autre projet, a son propre serveur et sa propre poignée :
/// c'est l'invariant qui empêche l'assistant d'une fenêtre de lire le coffre
/// d'une autre.
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
    // Clé d'indexation : la racine du coffre. Une session SANS coffre (racine
    // absente) partage la clé vide — elle n'a accès à aucune donnée de vault,
    // il n'y a donc rien à cloisonner.
    let cle = facts.root.clone().unwrap_or_default();

    // Serveur déjà en vie POUR CE COFFRE : on réactualise son instantané et on
    // rend son point d'accès. Le verrou est relâché avant tout `await`.
    {
        let serveurs = state.serveurs.lock().unwrap();
        if let Some(running) = serveurs.get(&cle) {
            running.root.set(facts);
            return Ok(running.endpoint.clone());
        }
    }

    let root = VaultRoot::default();
    root.set(facts);
    let (endpoint, cancel) = spawn_mcp_server(root.clone()).await?;

    let mut serveurs = state.serveurs.lock().unwrap();
    match serveurs.entry(cle) {
        Entry::Occupied(occupe) => {
            // Une autre session du MÊME coffre nous a devancés pendant le
            // `await` du spawn. On arrête le serveur qu'on vient de créer —
            // sans quoi il resterait à écouter sans que personne ne connaisse
            // son port — et on rend celui qui est déjà enregistré.
            cancel.cancel();
            Ok(occupe.get().endpoint.clone())
        }
        Entry::Vacant(libre) => {
            libre.insert(Running { endpoint: endpoint.clone(), cancel, root });
            Ok(endpoint)
        }
    }
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

/// Arrête le serveur d'un coffre, ou TOUS si `root` est absent. Sans effet sur
/// un coffre qui n'en a pas.
#[tauri::command]
pub fn mcp_stop(state: State<'_, McpState>, root: Option<String>) {
    let mut serveurs = state.serveurs.lock().unwrap();
    match root {
        Some(r) => {
            if let Some(running) = serveurs.remove(&r) {
                running.cancel.cancel();
            }
        }
        None => {
            for (_, running) in serveurs.drain() {
                running.cancel.cancel();
            }
        }
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
        let p = choisir(&c, &[], cible(Some("inf-1"), None, None)).unwrap();
        assert_eq!(p.id, "inf-1");
    }

    #[test]
    fn choisir_refuse_l_ambiguite_avec_ses_candidats() {
        // Rendre le premier de la liste donnait le programme d'informatique à
        // qui demandait les mathématiques — avec `trouve: true`.
        let c = corpus();
        let refus = choisir(&c, &[], cible(None, Some("MPSI"), None)).err().expect("un refus etait attendu");
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
        let refus = choisir(&c, &[], cible(None, Some("MPSI"), Some("mathématiques"))).err().expect("un refus etait attendu");
        let v: serde_json::Value = serde_json::from_str(&refus).unwrap();
        assert_eq!(v["trouve"], false);
        assert_eq!(v["suggestion"], "math");
        assert!(v["matieres_valides"].as_array().unwrap().len() == 5);
    }

    #[test]
    fn un_seul_programme_retenu_se_designe_tout_seul() {
        // Chaque argument que le modèle doit sérialiser est une occasion
        // d'appel malformé — observé deux fois, sur le champ `matiere`. Quand
        // un seul programme est coché, il n'y a rien à désigner : exiger un
        // argument imposait un appel préalable pour un identifiant déjà connu.
        let c = corpus();
        let retenus = vec!["inf-1".to_string()];
        let p = choisir(&c, &retenus, cible(None, None, None)).unwrap();
        assert_eq!(p.id, "inf-1");
    }

    #[test]
    fn plusieurs_programmes_retenus_ne_se_devinent_pas() {
        // Le raccourci ne vaut QUE pour l'évidence : à deux programmes cochés,
        // on retombe sur le refus d'ambiguïté.
        let c = corpus();
        let retenus = vec!["inf-1".to_string(), "mathematiques-mp-mpi".to_string()];
        assert!(choisir(&c, &retenus, cible(None, None, None)).is_err());
    }

    #[test]
    fn un_critere_explicite_prime_sur_le_raccourci() {
        // Sinon on rendrait le programme coché à qui en désigne un autre.
        let c = corpus();
        let retenus = vec!["inf-1".to_string()];
        let p = choisir(&c, &retenus, cible(Some("mathematiques-mp-mpi"), None, None)).unwrap();
        assert_eq!(p.id, "mathematiques-mp-mpi");
    }

    #[test]
    fn choisir_sans_correspondance_liste_ce_qui_existe() {
        let c = corpus();
        let refus = choisir(&c, &[], cible(None, Some("PT"), None)).err().expect("un refus etait attendu");
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

    // ── Vues de lecture ─────────────────────────────────────────────────────

    /// Coffre jouable : la base, son schéma, un tableau « Élèves » et un
    /// colloscope — plus la config qui les désigne.
    fn vault_avec_colloscope(
        eleves: &[serde_json::Value],
        lignes_colles: &[[&str; 7]],
    ) -> tempfile::TempDir {
        vault_avec_colloscope_de("MP-2", eleves, lignes_colles)
    }

    /// `classe` : celle que la config déclare pour le tableau de colles. Les
    /// vues en tirent la classe de chaque ligne — c'est ce qui permet de
    /// tester le scope (un même libellé de groupe dans deux classes).
    fn vault_avec_colloscope_de(
        classe: &str,
        eleves: &[serde_json::Value],
        lignes_colles: &[[&str; 7]],
    ) -> tempfile::TempDir {
        const E: &str = "aaaaaaaa-0000-4000-8000-000000000001";
        const C: &str = "aaaaaaaa-0000-4000-8000-000000000002";
        let dir = vault_with_config(&format!(
            r#"{{"colles":{{"colloscope":{{"elevesSpreadsheetId":"{E}",
               "colloscopeSpreadsheetIds":{{"{classe}":"{C}"}}}}}}}}"#
        ));
        let conn = rusqlite::Connection::open(dir.path().join(".azprose/data.db")).unwrap();
        conn.execute_batch(
            "CREATE TABLE spreadsheets(id TEXT PRIMARY KEY, name TEXT);
             CREATE TABLE spreadsheet_columns(spreadsheet_id TEXT, col_index INT, title TEXT);
             CREATE TABLE spreadsheet_cells(spreadsheet_id TEXT, row_index INT, col_index INT, value TEXT);
             CREATE TABLE calendar_events(id TEXT, text TEXT, start TEXT, end TEXT,
                                          all_day INT, calendar_id TEXT, data TEXT);",
        )
        .unwrap();
        conn.execute("INSERT INTO spreadsheets VALUES (?1, 'Élèves')", [E]).unwrap();
        conn.execute("INSERT INTO spreadsheets VALUES (?1, 'Colloscope — MP-2')", [C]).unwrap();
        for (i, t) in ["Code", "Nom", "Prénom", "Classe", "Groupe", "Email"].iter().enumerate() {
            conn.execute("INSERT INTO spreadsheet_columns VALUES (?1, ?2, ?3)",
                rusqlite::params![E, i as i64, t]).unwrap();
        }
        for (i, t) in ["Date", "Groupe", "Matière", "Colleur", "Jour", "Horaire", "Salle"].iter().enumerate() {
            conn.execute("INSERT INTO spreadsheet_columns VALUES (?1, ?2, ?3)",
                rusqlite::params![C, i as i64, t]).unwrap();
        }
        for (r, e) in eleves.iter().enumerate() {
            for (i, k) in ["code", "nom", "prenom", "classe", "groupe", "email"].iter().enumerate() {
                conn.execute("INSERT INTO spreadsheet_cells VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![E, r as i64, i as i64, e[*k].as_str().unwrap_or("")]).unwrap();
            }
        }
        for (r, l) in lignes_colles.iter().enumerate() {
            for (i, v) in l.iter().enumerate() {
                conn.execute("INSERT INTO spreadsheet_cells VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![C, r as i64, i as i64, v]).unwrap();
            }
        }
        dir
    }

    fn colonne_texte(root: &str, sql: &str) -> Vec<String> {
        let v = query_readonly(root, sql).expect("requête refusée");
        v["lignes"].as_array().unwrap().iter()
            .map(|l| l[0].as_str().unwrap_or("").to_string())
            .collect()
    }

    #[test]
    fn vues_generiques_rendent_le_schema_tel_quon_le_pense() {
        let dir = vault_avec_colloscope(&[], &[["2026-11-20", "G6", "Maths", "M. B", "V", "15h-16h", "A"]]);
        let root = dir.path().to_str().unwrap();
        // v_cellules : la jointure EAV + titres, déjà faite.
        assert_eq!(
            colonne_texte(root, "SELECT valeur FROM v_cellules WHERE colonne='Horaire'"),
            vec!["15h-16h"]
        );
        // v_tableurs : les tableaux SANS cellule sont exclus (ici « Élèves »).
        assert_eq!(
            colonne_texte(root, "SELECT tableur FROM v_tableurs ORDER BY tableur"),
            vec!["Colloscope — MP-2"]
        );
    }

    #[test]
    fn les_vues_ne_desserrent_pas_la_lecture_seule() {
        // Poser des vues TEMP ne doit pas rendre la base inscriptible : c'est
        // toute la raison pour laquelle on s'autorise à en poser.
        let dir = vault_avec_colloscope(&[], &[["2026-11-20", "G6", "M", "C", "V", "9h-10h", ""]]);
        let root = dir.path().to_str().unwrap();
        // Refus en amont, par la liste blanche…
        assert!(query_readonly(root, "DELETE FROM spreadsheet_cells").is_err());
        // …et refus de SQLite lui-même si l'on contourne la liste blanche.
        let conn = ouvrir_lecture(root).unwrap();
        assert!(conn.execute("DELETE FROM spreadsheet_cells", []).is_err());
    }

    #[test]
    fn pas_de_colloscope_pas_de_vues_metier() {
        // Une vue absente vaut mieux qu'une vue vide, qu'on prendrait pour
        // « aucune colle ».
        let dir = vault_with_config("{}");
        rusqlite::Connection::open(dir.path().join(".azprose/data.db"))
            .unwrap()
            .execute_batch("CREATE TABLE spreadsheets(id TEXT, name TEXT);
                            CREATE TABLE spreadsheet_columns(spreadsheet_id TEXT, col_index INT, title TEXT);
                            CREATE TABLE spreadsheet_cells(spreadsheet_id TEXT, row_index INT, col_index INT, value TEXT);
                            CREATE TABLE calendar_events(id TEXT, text TEXT, start TEXT, end TEXT, all_day INT, calendar_id TEXT, data TEXT);")
            .unwrap();
        let root = dir.path().to_str().unwrap();
        assert!(query_readonly(root, "SELECT * FROM v_cellules").is_ok(), "les vues génériques restent");
        assert!(query_readonly(root, "SELECT * FROM v_colles").is_err(), "les vues métier ne doivent PAS exister");
    }

    #[test]
    fn identifiants_non_uuid_refuses() {
        // Ces identifiants finissent concaténés dans du SQL : on ne laisse
        // passer que la forme attendue.
        assert!(est_uuid("aaaaaaaa-0000-4000-8000-000000000001"));
        assert!(!est_uuid("'; DROP TABLE spreadsheets; --"));
        assert!(!est_uuid("aaaaaaaa-0000-4000-8000-00000000000"));
        assert!(!est_uuid("zzzzzzzz-0000-4000-8000-000000000001"));
    }

    /// LE test qui rend tenable la duplication de `resoudreEleves` en SQL :
    /// les mêmes fixtures que `tests/colles-projection.test.ts`, les mêmes
    /// résultats attendus. Si l'une des deux implémentations bouge sans
    /// l'autre, l'un des deux tests tombe.
    #[test]
    fn vues_colles_accordent_avec_le_typescript() {
        let brut = fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../tests/fixtures/colles-resolution.json"),
        )
        .expect("fixtures partagées introuvables");
        let fx: serde_json::Value = serde_json::from_str(&brut).unwrap();
        let eleves: Vec<serde_json::Value> = fx["eleves"].as_array().unwrap().clone();

        for cas in fx["cas"].as_array().unwrap() {
            // Le colloscope est déclaré POUR LA CLASSE du cas : c'est ainsi
            // que la ligne appartient vraiment à cette classe, et que le
            // scope se teste au lieu d'être supposé.
            let dir = vault_avec_colloscope_de(
                cas["classe"].as_str().unwrap(),
                &eleves,
                &[["2026-11-20", cas["groupe"].as_str().unwrap(), "Maths", "M. B", "Vendredi", "15h-16h", ""]],
            );
            let root = dir.path().to_str().unwrap();
            let mut obtenu = colonne_texte(root, "SELECT code FROM v_colle_eleves ORDER BY code");
            obtenu.sort();
            let mut attendu: Vec<String> = cas["attendu"].as_array().unwrap().iter()
                .map(|c| c.as_str().unwrap().to_string()).collect();
            attendu.sort();
            assert_eq!(obtenu, attendu, "cas « {} »", cas["nom"].as_str().unwrap());
        }
    }

    #[test]
    fn schema_annonce_les_vues_le_catalogue_et_les_pieges() {
        let eleves = vec![serde_json::json!({
            "code": "INS-A/2025", "nom": "BOUJAIDA", "prenom": "Yasmine",
            "classe": "MP-2", "groupe": "G6", "email": ""
        })];
        let dir = vault_avec_colloscope(
            &eleves,
            &[["2026-11-20", "G6", "Maths", "M. BOUJAIDA", "Vendredi", "15h-16h", "A"]],
        );
        let s = schema_base(dir.path().to_str().unwrap(), Some("Boujaida")).unwrap();

        // Les vues métier sont annoncées quand un colloscope existe.
        assert!(s["vues"]["v_colles"].is_string());
        assert!(s["vues"]["v_colle_eleves"].is_string());
        // Le catalogue porte les titres ET un échantillon : c'est lui qui
        // donne le format des dates sans requête dédiée.
        let colloscope = s["tableaux"].as_array().unwrap().iter()
            .find(|t| t["nom"].as_str() == Some("Colloscope — MP-2")).expect("tableau absent");
        assert_eq!(colloscope["premiere_ligne"]["Date"], "2026-11-20");
        assert!(colloscope["titres"].as_array().unwrap().iter().any(|t| t == "Horaire"));
        // Les pièges qui empêchent une réponse fausse.
        let pieges = s["pieges"].to_string();
        assert!(pieges.contains("calendar_events"), "le piège du calendrier manque");
        assert!(pieges.contains("rattrapage"), "le piège des codes élèves manque");
        // L'utilisateur n'a plus à se présenter.
        assert_eq!(s["colleur"], "Boujaida");
    }

    #[test]
    fn plusieurs_instructions_en_un_seul_appel() {
        // Le levier général : explorer ET répondre dans le même tour.
        let dir = vault_avec_colloscope(&[], &[["2026-12-08", "G6", "M", "M. B", "Mardi", "9h-10h", ""]]);
        let v = query_readonly(
            dir.path().to_str().unwrap(),
            "SELECT COUNT(*) FROM v_colles; SELECT date FROM v_colles",
        )
        .unwrap();
        let r = v["resultats"].as_array().expect("un résultat par instruction");
        assert_eq!(r.len(), 2);
        assert_eq!(r[0]["lignes"][0][0], 1);
        assert_eq!(r[1]["lignes"][0][0], "2026-12-08");
    }

    #[test]
    fn une_instruction_fautive_nannule_pas_les_autres() {
        // Le modèle doit voir ce qui a marché ET ce qui a échoué, en un tour.
        let dir = vault_avec_colloscope(&[], &[["2026-12-08", "G6", "M", "M. B", "Mardi", "9h-10h", ""]]);
        let v = query_readonly(
            dir.path().to_str().unwrap(),
            "SELECT date FROM v_colles; SELECT inexistante FROM v_colles",
        )
        .unwrap();
        let r = v["resultats"].as_array().unwrap();
        assert_eq!(r[0]["lignes"][0][0], "2026-12-08");
        assert!(r[1]["erreur"].as_str().unwrap().contains("no such column"));
    }

    #[test]
    fn une_instruction_seule_garde_sa_forme() {
        // Rien à casser pour l'immense majorité des appels.
        let dir = vault_avec_colloscope(&[], &[["2026-12-08", "G6", "M", "M. B", "Mardi", "9h-10h", ""]]);
        let v = query_readonly(dir.path().to_str().unwrap(), "SELECT 1").unwrap();
        assert!(v["resultats"].is_null());
        assert_eq!(v["rendues"], 1);
    }

    #[test]
    fn une_suite_contenant_une_ecriture_est_refusee_en_entier() {
        // La garde d'origine tient : « SELECT 1; DROP TABLE t » ne passe pas.
        let dir = vault_avec_colloscope(&[], &[["2026-12-08", "G6", "M", "M. B", "Mardi", "9h-10h", ""]]);
        let root = dir.path().to_str().unwrap();
        assert!(query_readonly(root, "SELECT 1; DROP TABLE spreadsheets").is_err());
        assert!(query_readonly(root, "SELECT 1; DELETE FROM spreadsheet_cells").is_err());
        // Le tableau est toujours là.
        assert!(query_readonly(root, "SELECT COUNT(*) FROM spreadsheets").is_ok());
    }

    #[test]
    fn lerreur_de_colonne_dit_lesquelles_existent() {
        // Une erreur qui refuse coûte un aller-retour ; une erreur qui
        // enseigne n'en coûte aucun.
        let dir = vault_avec_colloscope(&[], &[["2026-12-08", "G6", "M", "M. B", "Mardi", "9h-10h", "A"]]);
        let e = query_readonly(dir.path().to_str().unwrap(), "SELECT inexistante FROM v_colles")
            .err()
            .expect("un refus était attendu");
        assert!(e.contains("colonnes de v_colles"), "l'aide manque : {e}");
        assert!(e.contains("horaire"), "les colonnes réelles doivent être listées : {e}");
    }

    #[test]
    fn les_instructions_donnent_la_date_du_jour() {
        // Rien ne la fournissait : toute question temporelle en dépend.
        let t = instructions_serveur(None, None);
        let aujourdhui = chrono::Local::now().format("%Y-%m-%d").to_string();
        assert!(t.contains(&aujourdhui), "la date du jour manque");
        assert!(t.contains("PLUSIEURS instructions"), "le mode suite doit être annoncé");
    }

    #[test]
    fn v_colle_eleves_porte_tout_ce_que_porte_v_colles() {
        // Mesuré : le modèle a demandé `salle` dès sa première requête et a
        // perdu un tour parce que la vue ne l'exposait pas. Une vue doit
        // porter ce qu'on lui demandera naturellement.
        let eleves = vec![serde_json::json!({
            "code": "INS-A/2025", "nom": "BOUJAIDA", "prenom": "Yasmine",
            "classe": "MP-2", "groupe": "G6", "email": ""
        })];
        let dir = vault_avec_colloscope(
            &eleves,
            &[["2026-12-08", "G6", "Maths", "M. BOUJAIDA", "Mardi", "13h-14h", "MP*2"]],
        );
        let v = query_readonly(
            dir.path().to_str().unwrap(),
            "SELECT jour, salle, groupe, matiere FROM v_colle_eleves",
        )
        .expect("les colonnes de v_colles doivent exister sur v_colle_eleves");
        assert_eq!(v["lignes"][0][0], "Mardi");
        assert_eq!(v["lignes"][0][1], "MP*2");
        assert_eq!(v["lignes"][0][2], "G6");
    }

    #[test]
    fn le_schema_borne_la_periode_des_colles() {
        // Sans période, « le 8 décembre » fait deviner l'année : le modèle a
        // cherché 2025 puis sondé la base pour trouver 2026. Un tour perdu.
        let dir = vault_avec_colloscope(
            &[],
            &[
                ["2026-09-14", "G6", "M", "M. B", "Lundi", "9h-10h", ""],
                ["2027-04-16", "G6", "M", "M. B", "Vendredi", "9h-10h", ""],
            ],
        );
        let s = schema_base(dir.path().to_str().unwrap(), None).unwrap();
        assert_eq!(s["colles"]["periode"], "2026-09-14 → 2027-04-16");
        assert_eq!(s["colles"]["seances"], 2);
    }

    #[test]
    fn les_instructions_de_session_evitent_le_premier_appel() {
        // L'essentiel doit voyager AVANT tout appel d'outil : les vues, la
        // période, l'identité. C'est ce qui fait répondre au premier appel.
        let dir = vault_avec_colloscope(
            &[],
            &[["2026-12-08", "G6", "M", "M. BOUJAIDA", "Mardi", "13h-14h", ""]],
        );
        let t = instructions_serveur(dir.path().to_str(), Some("Boujaida"));
        assert!(t.contains("v_colle_eleves"), "les vues doivent être annoncées");
        assert!(t.contains("2026-12-08"), "la période doit être annoncée");
        assert!(t.contains("Boujaida"), "l'identité doit être annoncée");
        assert!(t.contains("LIKE"), "la règle de civilité doit être annoncée");
        // L'exemple travaillé : c'est lui qui fait tenir la réponse en UN
        // appel, la description seule n'y suffisait pas (mesuré).
        assert!(t.contains("SELECT horaire, groupe, salle, nom, prenom"), "l'exemple manque");
        assert!(t.contains("LIKE '%Boujaida%'"), "l'exemple doit porter le vrai nom");
        assert!(t.contains("UNE LIGNE PAR ÉLÈVE"), "l'avertissement de répétition manque");
    }

    #[test]
    fn les_instructions_sans_projet_ne_mentent_pas() {
        let t = instructions_serveur(None, None);
        assert!(t.contains("Aucun colloscope"));
        assert!(!t.contains("v_colles("), "ne pas annoncer une vue absente");
    }

    #[test]
    fn schema_sans_colloscope_le_dit_au_lieu_de_se_taire() {
        let dir = vault_avec_colloscope(&[], &[]);
        // Pas de config de colloscope : on réécrit une config vide.
        fs::write(dir.path().join(".azprose/config.json"), "{}").unwrap();
        let s = schema_base(dir.path().to_str().unwrap(), None).unwrap();
        assert!(s["vues"]["v_colles"].is_null(), "vue annoncée alors qu'elle n'existe pas");
        assert!(s["pieges"].to_string().contains("Aucun colloscope"));
        assert!(s["colleur"].is_null(), "pas de nom → pas de champ menteur");
    }

    #[test]
    fn un_nom_de_colleur_vide_ne_compte_pas() {
        let dir = vault_avec_colloscope(&[], &[["2026-11-20", "G6", "M", "C", "V", "9h-10h", ""]]);
        let s = schema_base(dir.path().to_str().unwrap(), Some("   ")).unwrap();
        assert!(s["colleur"].is_null());
    }

    #[test]
    fn la_troncature_dit_combien_il_manque() {
        // Le point : un résultat partiel ne doit pas pouvoir passer pour un
        // tout. On vérifie le compte ET la phrase.
        let dir = vault_avec_colloscope(&[], &[["2026-11-20", "G6", "M", "C", "V", "9h-10h", ""]]);
        let root = dir.path().to_str().unwrap();
        let v = query_readonly(
            root,
            "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 600) SELECT i FROM n",
        )
        .unwrap();
        assert_eq!(v["tronque"], true);
        assert_eq!(v["rendues"], 500);
        assert_eq!(v["total"], 600);
        assert!(v["avertissement"].as_str().unwrap().contains("PARTIEL"));
    }

    #[test]
    fn un_resultat_complet_ne_porte_pas_davertissement() {
        let dir = vault_avec_colloscope(&[], &[["2026-11-20", "G6", "M", "C", "V", "9h-10h", ""]]);
        let v = query_readonly(dir.path().to_str().unwrap(), "SELECT 1").unwrap();
        assert_eq!(v["tronque"], false);
        assert_eq!(v["rendues"], 1);
        assert!(v["avertissement"].is_null(), "pas d'alarme quand tout va bien");
        assert!(v["total"].is_null());
    }

    #[test]
    fn jeton_non_trivial_et_non_repete() {
        let a = make_token();
        let b = make_token();
        assert!(a.len() >= 16, "jeton trop court : {a}");
        assert_ne!(a, b, "deux jetons successifs doivent différer");
    }
}
