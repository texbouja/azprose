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
    handler::server::router::tool::ToolRouter,
    model::{ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router,
};
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};
use serde::Serialize;
use tauri::State;
use tokio_util::sync::CancellationToken;

/// Racine du vault servie par les outils. Partagée avec le serveur : une
/// session agent = un projet (D13), mais l'utilisateur peut changer de projet
/// sans redémarrer, d'où le `Mutex` plutôt qu'une valeur figée à la
/// construction.
#[derive(Clone, Default)]
pub struct VaultRoot(Arc<Mutex<Option<String>>>);

impl VaultRoot {
    fn get(&self) -> Option<String> {
        self.0.lock().ok().and_then(|g| g.clone())
    }
    pub fn set(&self, root: Option<String>) {
        if let Ok(mut g) = self.0.lock() {
            *g = root;
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
        let preambule = self
            .root
            .get()
            .and_then(|root| crate::agent::mcp::read_math_preamble(&root));
        // Toujours un JSON de forme stable : l'absence de préambule est un
        // SUCCÈS (`null`), jamais une erreur — un outil qui échoue pousse
        // l'agent à renoncer au lieu de travailler.
        serde_json::json!({ "preambule": preambule }).to_string()
    }
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
pub async fn mcp_start(state: State<'_, McpState>, root: Option<String>) -> Result<McpEndpoint, String> {
    state.root.set(root);

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
    fn jeton_non_trivial_et_non_repete() {
        let a = make_token();
        let b = make_token();
        assert!(a.len() >= 16, "jeton trop court : {a}");
        assert_ne!(a, b, "deux jetons successifs doivent différer");
    }
}
