// PTY-backed terminal (ConPTY on Windows, native PTY on Unix).
// Spawns the user's default login shell (login shell on Unix via -l flag),
// with the project folder as the working directory.  I/O is streamed to
// the webview via a binary Channel (zero UTF-8 conversion in Rust);
// input/resize/kill go through commands.  Exit is signalled via a Tauri
// event.
//
// DA1/DA2 (Device Attributes) queries are responded to directly at the PTY
// level.  ghostty-web v0.4.0 doesn't handle these yet (fixed upstream in
// PR #102 but unreleased), and the JS round-trip would be too slow for fish
// shell's 10-second timeout anyway.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, State};

/// Live PTY sessions keyed by a frontend-chosen id (one per terminal view).
pub struct TerminalState(pub Mutex<HashMap<String, Session>>);

impl Default for TerminalState {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

pub struct Session {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

/// Returns `true` if `data` contains a DA1/DA2 query: ESC `[` … `c`.
/// Shells (especially fish) send these at startup to probe terminal capabilities.
fn has_device_attr_query(data: &[u8]) -> bool {
    let len = data.len();
    let mut i = 0;
    while i + 2 < len {
        if data[i] == 0x1b && data[i + 1] == b'[' {
            let mut j = i + 2;
            // optional prefix: `>` (DA2), `=` (DA3), `?` (private)
            if j < len && matches!(data[j], b'>' | b'=' | b'?') {
                j += 1;
            }
            while j < len && (data[j].is_ascii_digit() || data[j] == b';') {
                j += 1;
            }
            if j < len && data[j] == b'c' {
                return true;
            }
        }
        i += 1;
    }
    false
}

#[tauri::command]
pub fn terminal_spawn(
    app: AppHandle,
    state: State<TerminalState>,
    id: String,
    cwd: Option<String>,
    rows: u16,
    cols: u16,
    env: Option<HashMap<String, String>>,
    on_data: Channel<Vec<u8>>,
) -> Result<(), String> {
    // Idempotent: reusing an existing id keeps the running shell.
    if state.0.lock().unwrap().contains_key(&id) {
        return Ok(());
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    // Default shell: $SHELL (Unix) or $COMSPEC (Windows, typically cmd.exe).
    #[cfg(windows)]
    let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
    #[cfg(not(windows))]
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());

    let mut cmd = CommandBuilder::new(&shell);

    // Login shell on Unix only — Windows shells don't use -l.
    #[cfg(not(windows))]
    cmd.arg("-l");

    if let Some(dir) = cwd.filter(|d| !d.is_empty()) {
        cmd.cwd(dir);
    }

    // TERM is expected by most Unix shells; harmless on Windows.
    cmd.env("TERM", "xterm-256color");
    // LANG/LC_ALL are Unix-specific but harmless to set.
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");

    if let Some(extra) = env {
        for (k, v) in &extra {
            cmd.env(k, v);
        }
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = Arc::new(Mutex::new(
        pair.master.take_writer().map_err(|e| e.to_string())?,
    ));

    // Reader thread: stream raw PTY bytes to the frontend via a binary Channel.
    // Also responds to DA1/DA2 terminal queries directly at the PTY level
    // (ghostty-web v0.4.0 doesn't handle these, causing fish shell warnings).
    let writer_for_reader = Arc::clone(&writer);
    let id_out = id.clone();
    std::thread::spawn(move || {
        let mut raw = [0u8; 16384];

        loop {
            match reader.read(&mut raw) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = &raw[..n];

                    // Respond to DA1/DA2 queries immediately at the PTY level.
                    // Shells send these at startup and expect a response within
                    // seconds; the frontend round-trip would be too slow, and
                    // ghostty-web v0.4.0 doesn't handle them at all.
                    if has_device_attr_query(chunk) {
                        if let Ok(mut w) = writer_for_reader.lock() {
                            // VT220 with color support (matches ghostty-web's
                            // intended response from upstream PR #102).
                            let _ = w.write_all(b"\x1b[?62;22c");
                            let _ = w.flush();
                        }
                    }

                    if on_data.send(chunk.to_vec()).is_err() {
                        break; // frontend disconnected
                    }
                }
            }
        }

        let _ = app.emit("terminal://exit", id_out);
    });

    state.0.lock().unwrap().insert(id, Session { master: pair.master, writer, child });
    Ok(())
}

#[tauri::command]
pub fn terminal_write(state: State<TerminalState>, id: String, data: String) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    if let Some(s) = map.get_mut(&id) {
        let mut w = s.writer.lock().map_err(|e| e.to_string())?;
        w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        w.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

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

#[tauri::command]
pub fn terminal_kill(state: State<TerminalState>, id: String) -> Result<(), String> {
    if let Some(mut s) = state.0.lock().unwrap().remove(&id) {
        let _ = s.child.kill();
    }
    Ok(())
}
