// Harnais de développement — démarre le serveur MCP hors Tauri et imprime son
// point d'accès, pour l'exercer contre un agent réel sans lancer l'application.
//   cargo run --example mcp_serve -- /chemin/du/vault
use azprose_lib::agent::mcp::{spawn_mcp_server, VaultFacts, VaultRoot};

#[tokio::main]
async fn main() {
    let root = VaultRoot::default();
    root.set(VaultFacts { root: std::env::args().nth(1), ..Default::default() });
    let (ep, _cancel) = spawn_mcp_server(root).await.expect("démarrage");
    println!("{}", serde_json::json!({ "url": ep.url, "token": ep.token }));
    let mut s = String::new();
    std::io::stdin().read_line(&mut s).ok();
}
