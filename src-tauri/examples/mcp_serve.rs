// Harnais JETABLE de validation R1 — démarre le serveur MCP hors Tauri et
// imprime son point d'accès, pour vérifier qu'un agent réel voit l'outil.
use azprose_lib::agent::mcp::{spawn_mcp_server, VaultRoot};

#[tokio::main]
async fn main() {
    let root = VaultRoot::default();
    root.set(std::env::args().nth(1));
    let (ep, _cancel) = spawn_mcp_server(root).await.expect("démarrage");
    println!("{}", serde_json::json!({ "url": ep.url, "token": ep.token }));
    let mut s = String::new(); std::io::stdin().read_line(&mut s).ok();
}
