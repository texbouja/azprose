use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, Webview, WindowEvent};
use tauri::webview::WebviewBuilder;
use tauri::{LogicalPosition, LogicalSize};
use tauri::utils::config::WebviewUrl;

const OPENCODE_PORT: u16 = 4096;
const OPENCODE_HOST: &str = "127.0.0.1";
const SIDEBAR_WIDTH: f64 = 420.0;

pub struct OpenCodeServer(pub Mutex<Option<Child>>);
pub struct OpenCodeWebview(pub Mutex<Option<Webview>>);

fn reposition_webview(
    window: &tauri::Window,
    webview: &Webview,
) -> Result<(), String> {
    let size = window.inner_size().map_err(|e| format!("inner_size: {e}"))?;
    let x = size.width.saturating_sub(SIDEBAR_WIDTH as u32) as f64;
    webview
        .set_position(LogicalPosition::new(x, 0.0))
        .map_err(|e| format!("set_position: {e}"))?;
    webview
        .set_size(LogicalSize::new(SIDEBAR_WIDTH, size.height as f64))
        .map_err(|e| format!("set_size: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn check_opencode_available() -> Result<String, String> {
    let output = Command::new("opencode")
        .arg("--version")
        .output()
        .map_err(|e| format!("opencode introuvable : {e}"))?;
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(version)
}

#[tauri::command]
pub fn start_opencode_server(state: State<'_, OpenCodeServer>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| format!("lock: {e}"))?;
    if guard.is_some() {
        return Ok(format!("http://{OPENCODE_HOST}:{OPENCODE_PORT}"));
    }
    let child = Command::new("opencode")
        .args(["web", "--port", &OPENCODE_PORT.to_string(), "--hostname", OPENCODE_HOST])
        .spawn()
        .map_err(|e| format!("impossible de lancer opencode : {e}"))?;
    *guard = Some(child);
    Ok(format!("http://{OPENCODE_HOST}:{OPENCODE_PORT}"))
}

#[tauri::command]
pub fn stop_opencode_server(state: State<'_, OpenCodeServer>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("lock: {e}"))?;
    if let Some(mut child) = guard.take() {
        child.kill().ok();
        child.wait().ok();
    }
    Ok(())
}

#[tauri::command]
pub fn get_opencode_server_url() -> String {
    format!("http://{OPENCODE_HOST}:{OPENCODE_PORT}")
}

#[tauri::command]
pub async fn open_opencode_sidebar(
    app: AppHandle,
    server_state: State<'_, OpenCodeServer>,
    webview_state: State<'_, OpenCodeWebview>,
) -> Result<(), String> {
    let wv_guard = webview_state.0.lock().map_err(|e| format!("lock: {e}"))?;

    if let Some(webview) = wv_guard.as_ref() {
        webview.show().map_err(|e| format!("show: {e}"))?;
        let window = app.get_window("main").ok_or("main window not found")?;
        reposition_webview(&window, webview)?;
        return Ok(());
    }
    drop(wv_guard);

    let mut srv_guard = server_state.0.lock().map_err(|e| format!("lock: {e}"))?;
    if srv_guard.is_none() {
        let child = Command::new("opencode")
            .args(["web", "--port", &OPENCODE_PORT.to_string(), "--hostname", OPENCODE_HOST])
            .spawn()
            .map_err(|e| format!("impossible de lancer opencode : {e}"))?;
        *srv_guard = Some(child);
    }
    drop(srv_guard);

    let window = app.get_window("main").ok_or("main window not found")?;
    let size = window.inner_size().map_err(|e| format!("inner_size: {e}"))?;

    let url = tauri::Url::parse(&format!("http://{OPENCODE_HOST}:{OPENCODE_PORT}"))
        .map_err(|e| format!("url parse: {e}"))?;

    let webview = window
        .add_child(
            WebviewBuilder::new("opencode-sidebar", WebviewUrl::External(url)),
            LogicalPosition::new(size.width.saturating_sub(SIDEBAR_WIDTH as u32) as f64, 0.0),
            LogicalSize::new(SIDEBAR_WIDTH, size.height as f64),
        )
        .map_err(|e| format!("add_child: {e}"))?;

    let wv = webview.clone();
    let win_for_closure = window.clone();
    let _ = window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Resized(_)) {
            if let Ok(size) = win_for_closure.inner_size() {
                let x = size.width.saturating_sub(SIDEBAR_WIDTH as u32) as f64;
                let _ = wv.set_position(LogicalPosition::new(x, 0.0));
                let _ = wv.set_size(LogicalSize::new(SIDEBAR_WIDTH, size.height as f64));
            }
        }
    });

    let mut wv_guard = webview_state.0.lock().map_err(|e| format!("lock: {e}"))?;
    *wv_guard = Some(webview);
    Ok(())
}

#[tauri::command]
pub async fn close_opencode_sidebar(
    webview_state: State<'_, OpenCodeWebview>,
    server_state: State<'_, OpenCodeServer>,
) -> Result<(), String> {
    let mut wv_guard = webview_state.0.lock().map_err(|e| format!("lock: {e}"))?;
    if let Some(webview) = wv_guard.take() {
        webview.close().map_err(|e| format!("close: {e}"))?;
    }
    drop(wv_guard);
    let mut srv_guard = server_state.0.lock().map_err(|e| format!("lock: {e}"))?;
    if let Some(mut child) = srv_guard.take() {
        child.kill().ok();
        child.wait().ok();
    }
    Ok(())
}
