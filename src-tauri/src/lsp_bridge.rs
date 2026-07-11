// LSP bridge: spawn a language server (tinymist) via std::process::Command with
// piped stdin/stdout, and bridge I/O to the webview via Tauri events.
// This bypasses the tauri-plugin-shell which has a stdout delivery bug.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

pub struct LspBridgeState {
    sessions: Mutex<HashMap<String, LspSession>>,
}

struct LspSession {
    child: Child,
    stdin: std::process::ChildStdin,
}

#[derive(Clone, Serialize)]
struct LspOutput {
    id: String,
    data: String,
}

impl Default for LspBridgeState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub fn lsp_spawn(
    app: AppHandle,
    state: State<'_, LspBridgeState>,
    id: String,
    command: String,
    args: Vec<String>,
) -> Result<(), String> {
    // Idempotent
    if state.sessions.lock().unwrap().contains_key(&id) {
        return Ok(());
    }

    eprintln!("azprose:lsp_bridge: spawning {command} {args:?} with id={id}");

    let mut child = Command::new(&command)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn {command}: {e}"))?;

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let mut stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    // stdout reader thread — raw bytes (LSP uses Content-Length framing, not newlines)
    let app_out = app.clone();
    let id_out = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match stdout.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    eprintln!("azprose:lsp_bridge: stdout chunk {n} bytes: {}", &chunk[..chunk.len().min(200)]);
                    let _ = app_out.emit("lsp://output", LspOutput { id: id_out.clone(), data: chunk });
                }
            }
        }
        eprintln!("azprose:lsp_bridge: stdout EOF for {id_out}");
        let _ = app_out.emit("lsp://exit", id_out.clone());
    });

    // stderr reader thread (log only)
    let app_err = app.clone();
    let id_err = id.clone();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    eprintln!("azprose:lsp_bridge: stderr [{id_err}]: {}", line.trim_end());
                    let _ = app_err.emit("lsp://stderr", LspOutput { id: id_err.clone(), data: line });
                }
            }
        }
    });

    state.sessions.lock().unwrap().insert(id, LspSession { child, stdin });
    Ok(())
}

/// Write raw JSON-RPC content to the LSP server's stdin.
/// The frontend sends the raw JSON-RPC payload (no Content-Length header).
/// We add the Content-Length framing here on the Rust side to avoid
/// Tauri IPC serialization issues with \r\n bytes.
#[tauri::command]
pub fn lsp_write(
    state: State<'_, LspBridgeState>,
    id: String,
    content: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.get_mut(&id).ok_or("session not found")?;

    let bytes = content.as_bytes();
    let header = format!("Content-Length: {}\r\n\r\n", bytes.len());
    eprintln!("azprose:lsp_bridge: write id={id} len={}", bytes.len());

    session.stdin.write_all(header.as_bytes()).map_err(|e| format!("write header: {e}"))?;
    session.stdin.write_all(bytes).map_err(|e| format!("write body: {e}"))?;
    session.stdin.flush().map_err(|e| format!("flush: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn lsp_kill(
    state: State<'_, LspBridgeState>,
    id: String,
) -> Result<(), String> {
    if let Some(mut session) = state.sessions.lock().unwrap().remove(&id) {
        let _ = session.child.kill();
        eprintln!("azprose:lsp_bridge: killed {id}");
    }
    Ok(())
}
