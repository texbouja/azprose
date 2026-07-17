// LSP bridge: spawn a language server (tinymist) via std::process::Command with
// piped stdin/stdout, and bridge I/O to the webview via Tauri events.
// This bypasses the tauri-plugin-shell which has a stdout delivery bug.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// Find the end of an LSP Content-Length header (double CRLF or double LF).
/// Returns the byte position *after* the double CRLF/LF, or None.
fn find_header_end(buf: &[u8]) -> Option<usize> {
    // Look for \r\n\r\n first, then \n\n.
    for i in 0..buf.len().saturating_sub(3) {
        if &buf[i..i + 4] == b"\r\n\r\n" {
            return Some(i + 4);
        }
    }
    for i in 0..buf.len().saturating_sub(1) {
        if &buf[i..i + 2] == b"\n\n" {
            return Some(i + 2);
        }
    }
    None
}

/// Parse the Content-Length value from an LSP header string.
fn parse_content_length(header: &str) -> Option<usize> {
    for line in header.lines() {
        if let Some(val) = line.strip_prefix("Content-Length:") {
            return val.trim().parse::<usize>().ok();
        }
    }
    None
}

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
    env: Option<HashMap<String, String>>,
) -> Result<(), String> {
    // Idempotent
    if state.sessions.lock().unwrap().contains_key(&id) {
        return Ok(());
    }

    let mut cmd = Command::new(&command);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Inject environment variables (e.g. TEXMFHOME for texlab)
    if let Some(env_map) = env {
        for (k, v) in &env_map {
            cmd.env(k, v);
        }
    }

    let mut child = cmd.spawn()
        .map_err(|e| format!("failed to spawn {command}: {e}"))?;

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let mut stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    // stdout reader thread — parse Content-Length framing and emit complete messages.
    // LSP Content-Length counts *bytes*, not characters. The JS side uses
    // string.slice which counts characters, so non-ASCII JSON would be
    // extracted incorrectly. We parse the framing here in Rust to avoid that.
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
                    // Try to extract complete LSP messages from the buffer.
                    loop {
                        // Look for "Content-Length: N\r\n\r\n" in the raw bytes.
                        // We search for the double CRLF that ends the header.
                        let header_end = find_header_end(&raw_buf);
                        let Some(header_end_pos) = header_end else { break };

                        // Parse the Content-Length value from the header bytes.
                        let header_str = String::from_utf8_lossy(&raw_buf[..header_end_pos]);
                        let content_length = match parse_content_length(&header_str) {
                            Some(v) => v,
                            None => {
                                // Malformed header — skip to next double-CRLF or clear.
                                raw_buf.drain(..header_end_pos);
                                break;
                            }
                        };

                        // Check if we have the full body.
                        let body_start = header_end_pos;
                        let body_end = body_start + content_length;
                        if raw_buf.len() < body_end {
                            break; // Wait for more data.
                        }

                        // Extract the JSON body (valid UTF-8 from LSP server).
                        let body = raw_buf[body_start..body_end].to_vec();
                        raw_buf.drain(..body_end);

                        // Convert body to string and emit as complete message.
                        let msg = String::from_utf8_lossy(&body).to_string();
                        let _ = app_out.emit("lsp://output", LspOutput { id: id_out.clone(), data: msg });
                    }
                }
            }
        }
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
        let _ = session.child.wait();
    }
    Ok(())
}
