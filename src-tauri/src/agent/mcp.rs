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
        let CibleProgramme { filiere, matiere, niveau } = params.0;
        let programmes = self.programmes();
        let trouve = programmes.iter().find(|p| {
            p.correspond(&filiere, matiere.as_deref(), niveau.as_deref())
        });
        match trouve {
            Some(p) => serde_json::json!({
                "trouve": true,
                "id": p.id,
                // Synthèse des contraintes EN TÊTE : les mentions limitatives
                // sont dispersées dans des milliers de lignes, les rassembler
                // ici garantit qu'elles sont lues avant le contenu.
                "contenu": format!("{}{}", programmes::synthese_contraintes(p), p.contenu),
            })
            .to_string(),
            None => serde_json::json!({
                "trouve": false,
                "raison": format!("aucun programme disponible pour la filière « {filiere} »"),
            })
            .to_string(),
        }
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
        let CibleProgramme { filiere, matiere, niveau } = params.0;
        let liste = self.programmes();
        let trouve = liste
            .iter()
            .find(|p| p.correspond(&filiere, matiere.as_deref(), niveau.as_deref()));
        match trouve {
            Some(p) => serde_json::json!({
                "trouve": true, "id": p.id, "contraintes": programmes::contraintes(p),
            })
            .to_string(),
            None => serde_json::json!({
                "trouve": false,
                "raison": format!("aucun programme disponible pour la filière « {filiere} »"),
            })
            .to_string(),
        }
    }

    /// Corpus visible : programmes livrés + échappatoire du vault (§4.2).
    fn programmes(&self) -> Vec<programmes::Programme> {
        let facts = self.root.facts();
        programmes::decouvrir(facts.corpus_dir.as_deref().map(std::path::Path::new))
    }
}

/// Argument commun aux outils de programme : la filière est obligatoire, le
/// reste affine.
#[derive(Serialize, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct CibleProgramme {
    /// Filière visée (ex. « MP », « MPSI », « PCSI »).
    pub filiere: String,
    /// Matière (ex. « mathematiques »). Facultatif.
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
        let err = query_readonly(dir.path().to_str().unwrap(), "SELECT 1").unwrap_err();
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
