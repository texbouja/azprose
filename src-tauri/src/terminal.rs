// Real PTY-backed terminal (Unix only for now; Windows is a no-op stub).
// Spawns the user's default login shell so ~/.profile & co are sourced, with the
// project folder as the working directory. I/O is streamed to the webview via
// the `terminal://output` event; input/resize/kill go through commands.

use std::collections::HashMap;
use std::sync::Mutex;

#[cfg(unix)]
use std::io::{Read, Write};

use tauri::State;
#[cfg(unix)]
use tauri::{AppHandle, Emitter};

#[cfg(unix)]
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

/// Live PTY sessions keyed by a frontend-chosen id (one per terminal view).
pub struct TerminalState(pub Mutex<HashMap<String, Session>>);

impl Default for TerminalState {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

#[cfg(unix)]
pub struct Session {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[cfg(not(unix))]
pub struct Session;

#[cfg(unix)]
#[derive(Clone, serde::Serialize)]
struct TermOutput {
    id: String,
    data: String,
}

#[cfg(unix)]
#[tauri::command]
pub fn terminal_spawn(
    app: AppHandle,
    state: State<TerminalState>,
    id: String,
    cwd: Option<String>,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    // Idempotent: reusing an existing id keeps the running shell.
    if state.0.lock().unwrap().contains_key(&id) {
        return Ok(());
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    // System default shell, launched as a login shell so ~/.profile is read.
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l");
    if let Some(dir) = cwd.filter(|d| !d.is_empty()) {
        cmd.cwd(dir);
    }
    cmd.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Reader thread: stream shell output to the webview until EOF.
    let app_out = app.clone();
    let id_out = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_out.emit("terminal://output", TermOutput { id: id_out.clone(), data });
                }
            }
        }
        let _ = app_out.emit("terminal://exit", id_out.clone());
    });

    state.0.lock().unwrap().insert(id, Session { master: pair.master, writer, child });
    Ok(())
}

#[cfg(unix)]
#[tauri::command]
pub fn terminal_write(state: State<TerminalState>, id: String, data: String) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    if let Some(s) = map.get_mut(&id) {
        s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        s.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(unix)]
#[tauri::command]
pub fn terminal_resize(state: State<TerminalState>, id: String, rows: u16, cols: u16) -> Result<(), String> {
    let map = state.0.lock().unwrap();
    if let Some(s) = map.get(&id) {
        s.master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(unix)]
#[tauri::command]
pub fn terminal_kill(state: State<TerminalState>, id: String) -> Result<(), String> {
    if let Some(mut s) = state.0.lock().unwrap().remove(&id) {
        let _ = s.child.kill();
    }
    Ok(())
}

// ---- Windows / non-unix: no-op stubs (terminal disabled for now) ----

#[cfg(not(unix))]
#[tauri::command]
pub fn terminal_spawn(
    _state: State<TerminalState>,
    _id: String,
    _cwd: Option<String>,
    _rows: u16,
    _cols: u16,
) -> Result<(), String> {
    Err("terminal not supported on this platform yet".into())
}

#[cfg(not(unix))]
#[tauri::command]
pub fn terminal_write(_state: State<TerminalState>, _id: String, _data: String) -> Result<(), String> {
    Ok(())
}

#[cfg(not(unix))]
#[tauri::command]
pub fn terminal_resize(_state: State<TerminalState>, _id: String, _rows: u16, _cols: u16) -> Result<(), String> {
    Ok(())
}

#[cfg(not(unix))]
#[tauri::command]
pub fn terminal_kill(_state: State<TerminalState>, _id: String) -> Result<(), String> {
    Ok(())
}
