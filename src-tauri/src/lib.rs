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

mod terminal;
mod mailer;
use terminal::TerminalState;

mod latex_engine;

mod lsp_bridge;

mod mdprinter;

mod fonts;

mod spreadsheet_db;
mod calendar_db;
mod datagrid_db;
mod stack_rules_db;
mod db;
use db::Db;

use lsp_bridge::LspBridgeState;

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

fn parse_cli_args() -> (Vec<String>, Option<String>) {
    let mut files = Vec::new();
    let mut project_dir = None;
    for arg in std::env::args_os().skip(1) {
        let path = std::path::PathBuf::from(&arg);
        if path.is_dir() {
            project_dir = Some(path.to_string_lossy().to_string());
        } else if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext = ext.to_string_lossy().to_ascii_lowercase();
                if is_supported_ext(&ext) {
                    files.push(path.to_string_lossy().to_string());
                }
            }
        }
    }
    (files, project_dir)
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

// Préférences d'INTERFACE du projet (thème pour l'instant — vague 4, phase
// 4.2). Distinct de config.json (configuration DU DOCUMENT — LaTeX, styles
// d'impression, callouts) et de session.json (travail de l'utilisateur —
// onglets ouverts) : une préférence de présentation n'a ni la même nature ni
// la même durée de vie. Même forme que la session (fichier optionnel, pas de
// validation de schéma — ce n'est pas destiné à être édité à la main).
#[tauri::command]
fn read_project_ui(root: String) -> Result<Option<String>, String> {
    let path = Path::new(&root).join(".azprose/ui.json");
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_project_ui(root: String, content: String) -> Result<(), String> {
    let path = Path::new(&root).join(".azprose/ui.json");
    atomic_write(&path, &content)
}

/// Open a directory in the system file manager (bypasses opener plugin scope).
#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "windows")]
    { std::process::Command::new("cmd").args(["/C", "start", "", &path]).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "linux")]
    { std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?; }
    Ok(())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (pending_open_files, pending_project_dir) = parse_cli_args();

    let app = tauri::Builder::default()
        .manage(PendingOpenFiles(Mutex::new(pending_open_files)))
        .manage(PendingProjectFolders(Mutex::new({
            let mut map = HashMap::new();
            if let Some(dir) = pending_project_dir {
                map.insert("main".to_string(), dir);
            }
            map
        })))
        .manage(OpenProjectWindows(Mutex::new(HashMap::new())))
        .manage(TerminalState::default())
        .manage(LspBridgeState::default())
        .manage(Db(Mutex::new(None)))
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let mut project_dir = None;
            for arg in args.iter().skip(1) {
                let path = std::path::PathBuf::from(arg);
                if path.is_dir() {
                    project_dir = Some(path.to_string_lossy().to_string());
                } else if path.is_file() {
                    if let Some(ext) = path.extension() {
                        let ext = ext.to_string_lossy().to_ascii_lowercase();
                        if is_supported_ext(&ext) {
                            let _ = app.emit("azprose:open-file", path.to_string_lossy().to_string());
                        }
                    }
                }
            }
            if let Some(dir) = project_dir {
                let _ = app.emit("azprose:open-project", dir);
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
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            take_pending_open_files,
            store_project_folder,
            take_project_folder,
            register_project_window,
            unregister_project_window,
            find_project_window,
            set_external_change_alerts,
            reveal_in_file_manager,
            mdprinter::export_markdown_pdf,
            mdprinter::render_report_png,
            mdprinter::preview_print,
            read_project_config,
            write_project_config,
            read_project_session,
            write_project_session,
            read_project_ui,
            write_project_ui,
            get_projects_list,
            add_project,
            remove_project,
            terminal::terminal_spawn,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_kill,
            lsp_bridge::lsp_spawn,
            lsp_bridge::lsp_write,
            lsp_bridge::lsp_kill,
            open_folder,
            latex_engine::latex_build,
            latex_engine::latex_find_root,
            latex_engine::check_latexmk,
            latex_engine::latex_resolve_dirs,
            latex_engine::synctex_forward,
            latex_engine::synctex_inverse,
            latex_engine::latex_init_texmf,
            latex_engine::latex_rehash_texmf,
            fonts::list_system_fonts,
            spreadsheet_db::spreadsheet_create,
            spreadsheet_db::spreadsheet_delete,
            spreadsheet_db::spreadsheet_export_csv,
            spreadsheet_db::spreadsheet_get,
            spreadsheet_db::spreadsheet_init_db,
            spreadsheet_db::spreadsheet_list,
            spreadsheet_db::spreadsheet_rename,
            spreadsheet_db::spreadsheet_save_all,
            spreadsheet_db::spreadsheet_save_cells,
            spreadsheet_db::spreadsheet_save_structure,
            calendar_db::calendar_events_get,
            calendar_db::calendar_events_save,
            calendar_db::calendar_events_delete,
            calendar_db::calendar_events_clear,
            datagrid_db::datagrid_list,
            datagrid_db::datagrid_get,
            datagrid_db::datagrid_save,
            datagrid_db::datagrid_create_from_spreadsheet,
            datagrid_db::datagrid_find_by_source,
            datagrid_db::datagrid_save_cells,
            datagrid_db::datagrid_delete,
            datagrid_db::datagrid_rename,
            stack_rules_db::datagrid_stack_rules_get,
            stack_rules_db::datagrid_stack_rules_save,
            mailer::send_colle_emails,
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
                    let _ = _app_handle.emit("azprose:open-file", path_str.clone());
                }
            }
        }
    });
}
