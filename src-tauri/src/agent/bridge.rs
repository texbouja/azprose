// Pont ACP : lance un agent (ex. `opencode acp`) en sous-processus stdio et
// relaie les messages vers la webview par événements Tauri.
//
// Calque de `lsp_bridge.rs`, avec UN changement qui compte : le cadrage.
// LSP parle en `Content-Length`, ACP parle en **NDJSON** — un objet JSON par
// ligne, terminé par `\n`. Ne pas mutualiser les deux modules : deux cadrages
// dans un pont « générique » coûteraient plus cher que ces quelques lignes.
//
// Le découpage en lignes est fait ICI, en Rust, jamais en JS : `\n` (0x0A)
// n'apparaît jamais dans une séquence UTF-8 multi-octets (les octets de
// continuation sont >= 0x80), donc couper sur `\n` ne peut pas casser un
// caractère — alors qu'un `String.slice` côté front compterait des
// caractères, pas des octets.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

pub struct AcpBridgeState {
    sessions: Mutex<HashMap<String, AcpSession>>,
}

struct AcpSession {
    child: Child,
    stdin: std::process::ChildStdin,
}

#[derive(Clone, Serialize)]
struct AcpOutput {
    id: String,
    data: String,
}

impl Default for AcpBridgeState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

/// Extrait du tampon toutes les lignes COMPLÈTES (terminées par `\n`).
/// Le reliquat éventuel (ligne tronquée par une lecture partielle) reste
/// dans le tampon pour la prochaine itération. Les lignes vides sont
/// ignorées : NDJSON n'en prévoit pas, et elles ne portent aucun message.
fn extract_lines(buf: &mut Vec<u8>) -> Vec<String> {
    let mut lines = Vec::new();
    let mut consumed = 0;
    for (i, &b) in buf.iter().enumerate() {
        if b == b'\n' {
            let line = String::from_utf8_lossy(&buf[consumed..i]).to_string();
            if !line.trim().is_empty() {
                lines.push(line);
            }
            consumed = i + 1;
        }
    }
    if consumed > 0 {
        buf.drain(..consumed);
    }
    lines
}

#[tauri::command]
pub fn acp_spawn(
    app: AppHandle,
    state: State<'_, AcpBridgeState>,
    id: String,
    command: String,
    args: Vec<String>,
    env: Option<HashMap<String, String>>,
) -> Result<(), String> {
    // Idempotent : un même id ne lance jamais deux processus.
    if state.sessions.lock().unwrap().contains_key(&id) {
        return Ok(());
    }

    let mut cmd = Command::new(&command);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(env_map) = env {
        for (k, v) in &env_map {
            cmd.env(k, v);
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn {command}: {e}"))?;

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let mut stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    // Fil lecteur stdout : découpe le NDJSON en Rust (voir l'en-tête du
    // fichier pour le pourquoi) et émet un événement par ligne complète.
    let app_out = app.clone();
    let id_out = id.clone();
    std::thread::spawn(move || {
        let mut raw_buf: Vec<u8> = Vec::with_capacity(8192);
        let mut tmp = [0u8; 8192];
        loop {
            match stdout.read(&mut tmp) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    raw_buf.extend_from_slice(&tmp[..n]);
                    for line in extract_lines(&mut raw_buf) {
                        let _ = app_out.emit(
                            "acp://output",
                            AcpOutput {
                                id: id_out.clone(),
                                data: line,
                            },
                        );
                    }
                }
            }
        }
        let _ = app_out.emit("acp://exit", id_out.clone());
    });

    // Fil lecteur stderr (journalisation seulement).
    let app_err = app.clone();
    let id_err = id.clone();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let _ = app_err.emit(
                        "acp://stderr",
                        AcpOutput {
                            id: id_err.clone(),
                            data: line,
                        },
                    );
                }
            }
        }
    });

    state
        .sessions
        .lock()
        .unwrap()
        .insert(id, AcpSession { child, stdin });
    Ok(())
}

/// Écrit un message JSON-RPC nu vers l'agent. Le front envoie la charge
/// sérialisée (`JSON.stringify` — jamais de `\n` littéral dans le JSON,
/// NDJSON l'interdit), le cadrage `\n` final est ajouté ici.
#[tauri::command]
pub fn acp_write(
    state: State<'_, AcpBridgeState>,
    id: String,
    content: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.get_mut(&id).ok_or("session not found")?;

    session
        .stdin
        .write_all(content.as_bytes())
        .map_err(|e| format!("write body: {e}"))?;
    session
        .stdin
        .write_all(b"\n")
        .map_err(|e| format!("write newline: {e}"))?;
    session.stdin.flush().map_err(|e| format!("flush: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn acp_kill(state: State<'_, AcpBridgeState>, id: String) -> Result<(), String> {
    if let Some(mut session) = state.sessions.lock().unwrap().remove(&id) {
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::extract_lines;

    #[test]
    fn ligne_partielle_reste_dans_le_tampon() {
        let mut buf = b"{\"json".to_vec();
        assert!(extract_lines(&mut buf).is_empty());
        assert_eq!(buf, b"{\"json");
        buf.extend_from_slice(b"rpc\":\"2.0\"}\n");
        assert_eq!(extract_lines(&mut buf), vec!["{\"jsonrpc\":\"2.0\"}"]);
        assert!(buf.is_empty());
    }

    #[test]
    fn plusieurs_lignes_d_un_coup() {
        let mut buf = b"{\"a\":1}\n{\"b\":2}\n{\"c\":3}\n".to_vec();
        let lines = extract_lines(&mut buf);
        assert_eq!(lines, vec!["{\"a\":1}", "{\"b\":2}", "{\"c\":3}"]);
        assert!(buf.is_empty());
    }

    #[test]
    fn utf8_multioctets_a_cheval_sur_deux_lectures() {
        // « é » = 0xC3 0xA9 : simule une coupure entre les deux octets.
        // Le `\n` final ne peut pas faire partie d'une séquence multi-octets,
        // donc la ligne extraite est toujours de l'UTF-8 valide.
        let mut buf = vec![0x7b, 0x22, 0x74, 0x22, 0x3a, 0x22, 0xc3]; // {"t":" + 0xC3
        assert!(extract_lines(&mut buf).is_empty());
        buf.extend_from_slice(&[0xa9, 0x22, 0x7d, 0x0a]); // é"}\n
        assert_eq!(extract_lines(&mut buf), vec!["{\"t\":\"é\"}"]);
        assert!(buf.is_empty());
    }

    #[test]
    fn lignes_vides_ignorees() {
        let mut buf = b"\n{\"a\":1}\n\n\n{\"b\":2}\n".to_vec();
        let lines = extract_lines(&mut buf);
        assert_eq!(lines, vec!["{\"a\":1}", "{\"b\":2}"]);
        assert!(buf.is_empty());
    }
}
