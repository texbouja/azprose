#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

use std::sync::Mutex;
use tauri::State;

use tauri::{Emitter, Manager};
#[cfg(target_os = "macos")]
use tauri::RunEvent;

struct PendingOpenFiles(Mutex<Vec<String>>);

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
fn take_pending_open_files(state: State<'_, PendingOpenFiles>) -> Vec<String> {
    let mut pending = state
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    std::mem::take(&mut *pending)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    let pending_open_files = initial_open_files_from_args();
    #[cfg(not(target_os = "windows"))]
    let pending_open_files = Vec::new();

    let app = tauri::Builder::default()
        .manage(PendingOpenFiles(Mutex::new(pending_open_files)))
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
        .invoke_handler(tauri::generate_handler![take_pending_open_files, reveal_in_file_manager])
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
