//! Frontière unique avec l'agent externe (OpenCode aujourd'hui, Goose demain).
//!
//! Tout ce qui connaît l'agent vit ici et dans `src/lib/agent/` côté front :
//! le reste d'AZprose ne voit que des commandes/événements formulés en termes
//! métier. Changer d'agent doit coûter une commande de lancement, pas une
//! réécriture (décision D3 du chantier).

pub mod bridge;
pub mod mcp;

pub use bridge::AcpBridgeState;
pub use mcp::McpState;
