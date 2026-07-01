#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;
use serde::{Deserialize, Serialize};

use tauri::{Emitter, Manager};
#[cfg(target_os = "macos")]
use tauri::RunEvent;

mod opencode;
use opencode::OpenCodeWebview;

mod terminal;
use terminal::TerminalState;

#[cfg(feature = "typst")]
mod typst_engine;

mod latex_engine;

struct PendingOpenFiles(Mutex<Vec<String>>);
struct PendingProjectFolders(Mutex<HashMap<String, String>>);
struct OpenProjectWindows(Mutex<HashMap<String, String>>);

fn is_supported_ext(ext: &str) -> bool {
    matches!(
        ext,
        "md" | "markdown" | "mdx"
            | "csv" | "tsv"
            | "txt" | "text"
            | "html" | "htm" | "xhtml"
            | "css" | "scss" | "less"
            | "js" | "mjs" | "cjs" | "jsx"
            | "ts" | "tsx" | "mts" | "cts"
            | "json" | "jsonc"
            | "xml" | "svg"
            | "yaml" | "yml"
            | "toml"
            | "ini" | "cfg" | "conf"
            | "py" | "pyw"
            | "rs"
            | "rb"
            | "go"
            | "java"
            | "c" | "h" | "cpp" | "hpp" | "cxx" | "hxx" | "cc" | "hh"
            | "swift"
            | "kt" | "kts"
            | "sql"
            | "sh" | "bash" | "zsh"
            | "tex" | "sty" | "cls" | "ltx" | "bib"
            | "r" | "rda"
            | "pl" | "pm"
            | "lua"
            | "php"
            | "perl"
            | "dart"
            | "scala"
            | "elixir"
            | "clj" | "cljs" | "edn"
            | "graphql" | "gql"
            | "makefile" | "mk"
            | "dockerfile"
            | "env"
            | "gitignore"
            | "editorconfig"
            | "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "ico"
    )
}

#[cfg(target_os = "windows")]
fn initial_open_files_from_args() -> Vec<String> {
    std::env::args_os()
        .skip(1)
        .filter_map(|arg| {
            let path = std::path::PathBuf::from(arg);
            let ext = path.extension()?.to_str()?.to_ascii_lowercase();
            if path.is_file() && is_supported_ext(&ext) {
                Some(path.to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect()
}

#[tauri::command]
fn reveal_in_file_manager(path: String) {
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    let p = std::path::Path::new(&path);
    #[cfg(target_os = "windows")]
    {
        let target = if p.is_dir() {
            path.clone()
        } else {
            p.parent()
                .and_then(|d| d.to_str())
                .unwrap_or("")
                .to_string()
        };
        let _ = std::process::Command::new("explorer").arg(target).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").args(["-R", &path]).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let target = if p.is_dir() {
            p.to_str().unwrap_or("").to_string()
        } else {
            p.parent()
                .and_then(|d| d.to_str())
                .unwrap_or("")
                .to_string()
        };
        let _ = std::process::Command::new("xdg-open").arg(target).spawn();
    }
}

#[tauri::command]
fn log_perf(data: String) {
    eprintln!("[az:perf]\n{data}");
}

#[tauri::command]
fn export_pdf() -> bool {
    cfg!(target_os = "linux")
}

#[tauri::command]
fn take_pending_open_files(state: State<'_, PendingOpenFiles>) -> Vec<String> {
    let mut pending = state
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    std::mem::take(&mut *pending)
}

#[tauri::command]
fn store_project_folder(state: State<'_, PendingProjectFolders>, label: String, path: String) {
    let mut map = state
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    map.insert(label, path);
}

#[tauri::command]
fn take_project_folder(state: State<'_, PendingProjectFolders>, label: String) -> Option<String> {
    let mut map = state
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    map.remove(&label)
}

#[tauri::command]
fn register_project_window(
    state: State<'_, OpenProjectWindows>,
    label: String,
    path: String,
) {
    let mut map = state
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    map.insert(path, label);
}

#[tauri::command]
fn unregister_project_window(state: State<'_, OpenProjectWindows>, label: String) {
    let mut map = state
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    map.retain(|_, v| v != &label);
}

#[tauri::command]
fn find_project_window(state: State<'_, OpenProjectWindows>, path: String) -> Option<String> {
    let map = state
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    map.get(&path).cloned()
}

#[derive(Serialize, Deserialize)]
struct ProjectEntry {
    name: String,
    path: String,
}

#[derive(Serialize, Deserialize)]
struct CustomThemeEntry {
    name: String,
    css: String,
}

fn custom_themes_dir(app: &tauri::AppHandle) -> PathBuf {
    let mut dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    dir.push("themes");
    dir
}

// Crafted themes are per-project (vault model): <project>/.azprose/themes/<name>.css,
// hand-editable. The legacy global app-data dir (custom_themes_dir) is only read once,
// for the one-time migration into a project the first time its themes dir is created.
fn project_themes_dir(root: &str) -> PathBuf {
    Path::new(root).join(".azprose/themes")
}

fn read_themes_dir(dir: &Path) -> Vec<CustomThemeEntry> {
    let mut entries = Vec::new();
    if let Ok(read_dir) = fs::read_dir(dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("css") {
                if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                    if let Ok(css) = fs::read_to_string(&path) {
                        entries.push(CustomThemeEntry {
                            name: name.to_string(),
                            css,
                        });
                    }
                }
            }
        }
    }
    entries
}

#[tauri::command]
fn install_project_theme(root: String, name: String, css: String) -> Result<(), String> {
    let path = project_themes_dir(&root).join(format!("{name}.css"));
    atomic_write(&path, &css)
}

#[tauri::command]
fn remove_project_theme(root: String, name: String) -> Result<(), String> {
    let path = project_themes_dir(&root).join(format!("{name}.css"));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
fn list_project_themes(app: tauri::AppHandle, root: String) -> Vec<CustomThemeEntry> {
    let dir = project_themes_dir(&root);
    // First access for this project: create the dir and migrate legacy global themes
    // into it (one-time, non-destructive copy). Gated on the dir not existing yet, so
    // trashing a theme later never resurrects the legacy ones.
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
        if let Some(parent) = dir.parent() {
            set_hidden(parent);
        }
        let global = custom_themes_dir(&app);
        if let Ok(read_dir) = fs::read_dir(&global) {
            for entry in read_dir.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("css") {
                    if let Some(file_name) = path.file_name() {
                        let _ = fs::copy(&path, dir.join(file_name));
                    }
                }
            }
        }
    }
    read_themes_dir(&dir)
}

fn projects_list_path(app: &tauri::AppHandle) -> PathBuf {
    let mut dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    dir.push("projects.json");
    dir
}

fn load_projects_list(app: &tauri::AppHandle) -> Vec<ProjectEntry> {
    let path = projects_list_path(app);
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_projects_list(app: &tauri::AppHandle, projects: &[ProjectEntry]) {
    let path = projects_list_path(app);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(raw) = serde_json::to_string_pretty(projects) {
        let _ = fs::write(&path, &raw);
    }
}

#[tauri::command]
fn get_projects_list(app: tauri::AppHandle) -> Vec<ProjectEntry> {
    load_projects_list(&app)
}

#[tauri::command]
fn add_project(app: tauri::AppHandle, name: String, path: String) {
    let mut projects = load_projects_list(&app);
    if !projects.iter().any(|p| p.path == path) {
        projects.push(ProjectEntry { name, path });
        save_projects_list(&app, &projects);
    }
}

#[tauri::command]
fn remove_project(app: tauri::AppHandle, path: String) {
    let mut projects = load_projects_list(&app);
    projects.retain(|p| p.path != path);
    save_projects_list(&app, &projects);
}

#[tauri::command]
fn set_external_change_alerts(app: tauri::AppHandle, on: bool) {
    let payload = if on { "on" } else { "off" };
    let _ = app.emit("azprose:set-alerts", payload);
}

// Mark a path hidden. On Windows the dot-prefix is not enough — set the HIDDEN
// attribute so `.azprose` doesn't show in Explorer (users must not delete it).
// On Unix the dot-prefix already hides it, so this is a no-op.
#[cfg(windows)]
fn set_hidden(path: &Path) {
    use std::os::windows::ffi::OsStrExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x0000_0002;
    extern "system" {
        fn SetFileAttributesW(lp_file_name: *const u16, dw_file_attributes: u32) -> i32;
    }
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    unsafe {
        SetFileAttributesW(wide.as_ptr(), FILE_ATTRIBUTE_HIDDEN);
    }
}

#[cfg(not(windows))]
fn set_hidden(_path: &Path) {}

// Atomic write: write a sibling .tmp then rename over the target. A crash mid-write
// leaves the previous file intact instead of a truncated/corrupt one — the basis of
// the `.azprose/` hot-exit durability (config + session).
fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        set_hidden(parent);
    }
    let file_name = path
        .file_name()
        .ok_or_else(|| "invalid path".to_string())?
        .to_string_lossy()
        .to_string();
    let tmp = path.with_file_name(format!("{file_name}.tmp"));
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_project_config(root: String) -> Result<String, String> {
    let path = Path::new(&root).join(".azprose/config.json");
    if !path.exists() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            set_hidden(parent);
        }
        fs::write(&path, "{}\n").map_err(|e| e.to_string())?;
        return Ok("{}\n".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_project_config(root: String, content: String) -> Result<(), String> {
    let path = Path::new(&root).join(".azprose/config.json");
    atomic_write(&path, &content)
}

// Portable per-project session (open tabs, active tab, last file). Mirrors the scoped
// localStorage so a moved/copied project restores its tabs on another path/machine.
// localStorage stays the synchronous primary; this is the best-effort portable copy.
#[tauri::command]
fn read_project_session(root: String) -> Result<Option<String>, String> {
    let path = Path::new(&root).join(".azprose/session.json");
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_project_session(root: String, content: String) -> Result<(), String> {
    let path = Path::new(&root).join(".azprose/session.json");
    atomic_write(&path, &content)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    let pending_open_files = initial_open_files_from_args();
    #[cfg(not(target_os = "windows"))]
    let pending_open_files = Vec::new();

    let app = tauri::Builder::default()
        .manage(PendingOpenFiles(Mutex::new(pending_open_files)))
        .manage(PendingProjectFolders(Mutex::new(HashMap::new())))
        .manage(OpenProjectWindows(Mutex::new(HashMap::new())))
        .manage(opencode::OpenCodeServer(Mutex::new(None)))
        .manage(OpenCodeWebview(Mutex::new(None)))
        .manage(TerminalState::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let paths: Vec<String> = args
                .iter()
                .skip(1)
                .filter_map(|arg| {
                    let path = std::path::PathBuf::from(arg);
                    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
                    if path.is_file() && is_supported_ext(&ext) {
                        Some(path.to_string_lossy().to_string())
                    } else {
                        None
                    }
                })
                .collect();
            for path in paths {
                let _ = app.emit("azprose:open-file", path);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            take_pending_open_files,
            store_project_folder,
            take_project_folder,
            register_project_window,
            unregister_project_window,
            find_project_window,
            set_external_change_alerts,
            reveal_in_file_manager,
            log_perf,
            export_pdf,
            read_project_config,
            write_project_config,
            read_project_session,
            write_project_session,
            get_projects_list,
            add_project,
            remove_project,
            list_project_themes,
            install_project_theme,
            remove_project_theme,
            opencode::start_opencode_server,
            opencode::stop_opencode_server,
            opencode::get_opencode_server_url,
            opencode::check_opencode_available,
            opencode::open_opencode_sidebar,
            opencode::close_opencode_sidebar,
            terminal::terminal_spawn,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_kill,
            #[cfg(feature = "typst")] typst_engine::typst_preview,
            #[cfg(feature = "typst")] typst_engine::typst_render,
            #[cfg(feature = "typst")] typst_engine::typst_export_pdf,
            #[cfg(feature = "typst")] typst_engine::typst_page_count,
            latex_engine::latex_build,
            latex_engine::check_latexmk,
            latex_engine::synctex_forward,
            latex_engine::synctex_inverse,
        ])
        .setup(|_app| {
            #[cfg(target_os = "macos")]
            {
                let window = _app.get_webview_window("main").expect("main window missing");
                if let Err(err) = apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::Sidebar,
                    Some(NSVisualEffectState::Active),
                    Some(12.0),
                ) {
                    eprintln!("azprose: apply_vibrancy failed: {err:?}");
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {
        #[cfg(target_os = "macos")]
        if let RunEvent::Opened { urls } = _event {
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    let path_str = path.to_string_lossy().to_string();
                    if let Some(state) = _app_handle.try_state::<PendingOpenFiles>() {
                        let mut pending = state
                            .0
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                        pending.push(path_str.clone());
                    }
                    if let Err(err) = _app_handle.emit("azprose:open-file", path_str.clone()) {
                        eprintln!("azprose: failed to emit open-file event: {err:?}");
                    } else {
                        eprintln!("azprose: open-file requested: {path_str}");
                    }
                }
            }
        }
    });
}
