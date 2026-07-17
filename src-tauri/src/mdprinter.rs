// mdprinter — Markdown → print/PDF via native browser.
//
// macOS / Windows: the system browser (Safari / Edge) handles MathJax
// and the native print dialog — no extra flags needed.
//
// Linux: WebKitGTK is too limited for complex math. We launch a real
// browser in --app mode (Chrome → Firefox → xdg-open fallback chain).

use std::path::Path;
use std::process::Command;
use tauri::command;

/// Lifecycle script injected at the end of the HTML document.
/// Waits for MathJax to finish typesetting, then opens the print dialog.
const LIFECYCLE_SCRIPT: &str = r#"
<script>
(function() {
    function triggerPrint() { window.print(); }
    if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
        window.MathJax.startup.promise.then(function() {
            setTimeout(triggerPrint, 600);
        }).catch(function() { triggerPrint(); });
    } else {
        window.addEventListener('load', function() {
            setTimeout(triggerPrint, 2000);
        });
    }
})();
</script>"#;

#[command]
pub fn export_markdown_pdf(html: String) -> Result<String, String> {
    let html_final = format!("{}{}", html, LIFECYCLE_SCRIPT);

    // Write to temp file
    let temp_path = std::env::temp_dir().join("azprose-print.html");
    std::fs::write(&temp_path, &html_final)
        .map_err(|e| format!("write temp html: {e}"))?;

    eprintln!("mdprinter: wrote {} ({} bytes)", temp_path.display(), html_final.len());

    // Platform dispatch
    #[cfg(target_os = "macos")]
    { return launch_macos(&temp_path); }

    #[cfg(target_os = "windows")]
    { return launch_windows(&temp_path); }

    #[cfg(target_os = "linux")]
    { return launch_linux(&temp_path); }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    { Err("unsupported platform".into()) }
}

// ── macOS ────────────────────────────────────────────────────────────────────
// `open` launches Safari (or the user's default browser). WebKit handles
// MathJax natively and the print dialog is the standard Cocoa one.

#[cfg(target_os = "macos")]
fn launch_macos(path: &Path) -> Result<String, String> {
    let file_url = format!("file://{}", path.display());
    eprintln!("mdprinter: macos — opening {file_url}");
    Command::new("open")
        .arg(&file_url)
        .spawn()
        .map_err(|e| format!("open: {e}"))?;
    Ok("ok".into())
}

// ── Windows ──────────────────────────────────────────────────────────────────
// `cmd /C start ""` opens the file in the default browser (Edge on most
// machines — Chromium-based, excellent MathJax + print support).

#[cfg(target_os = "windows")]
fn launch_windows(path: &Path) -> Result<String, String> {
    let file_url = format!("file:///{}", path.display().to_string_lossy());
    eprintln!("mdprinter: windows — opening {file_url}");
    Command::new("cmd")
        .args(["/C", "start", "", &file_url])
        .spawn()
        .map_err(|e| format!("start: {e}"))?;
    Ok("ok".into())
}

// ── Linux ────────────────────────────────────────────────────────────────────
// WebKitGTK is too limited for complex math.
// Fallback chain: Chrome → Chromium → Firefox → xdg-open → error.

#[cfg(target_os = "linux")]
fn launch_linux(path: &Path) -> Result<String, String> {
    let file_url = format!("file://{}", path.display());

    // 1. Google Chrome in --app mode
    if let Some(chrome) = find_binary(&["google-chrome-stable", "google-chrome"]) {
        eprintln!("mdprinter: linux — chrome: {chrome}");
        return Command::new(&chrome)
            .args([&format!("--app={file_url}"), "--window-size=1024,768"])
            .spawn()
            .map(|_| "ok".into())
            .map_err(|e| format!("chrome: {e}"));
    }

    // 2. Chromium
    if let Some(chromium) = find_binary(&["chromium", "chromium-browser"]) {
        eprintln!("mdprinter: linux — chromium: {chromium}");
        return Command::new(&chromium)
            .args([&format!("--app={file_url}"), "--window-size=1024,768"])
            .spawn()
            .map(|_| "ok".into())
            .map_err(|e| format!("chromium: {e}"));
    }

    // 3. Firefox — dedicated profile (no headers/footers, scale 100%, backgrounds)
    if let Some(firefox) = find_binary(&["firefox", "firefox-esr"]) {
        eprintln!("mdprinter: linux — firefox: {firefox}");
        let profile_dir = setup_firefox_profile()?;
        return Command::new(&firefox)
            .args([
                "--no-remote",
                "--profile", &profile_dir.to_string_lossy(),
                "--new-window", &file_url,
            ])
            .spawn()
            .map(|_| "ok".into())
            .map_err(|e| format!("firefox: {e}"));
    }

    // 4. Default browser
    if find_binary(&["xdg-open"]).is_some() {
        eprintln!("mdprinter: linux — xdg-open fallback");
        return Command::new("xdg-open")
            .arg(&file_url)
            .spawn()
            .map(|_| "ok".into())
            .map_err(|e| format!("xdg-open: {e}"));
    }

    // 5. Nothing found
    Err(
        "No supported browser found.\n\
         Install Google Chrome or Firefox for PDF export.\n\n\
         sudo pacman -S google-chrome    # Arch\n\
         sudo apt install google-chrome-stable    # Debian/Ubuntu\n\
         sudo dnf install firefox    # Fedora"
            .into(),
    )
}

fn find_binary(names: &[&str]) -> Option<String> {
    // Check hardcoded paths first (most reliable)
    let known_paths = [
        "/usr/bin",
        "/usr/local/bin",
        "/usr/bin/chromium",
        "/snap/bin",
        "/opt/google/chrome",
    ];
    for name in names {
        for dir in &known_paths {
            let p = std::path::PathBuf::from(dir).join(name);
            if p.is_file() {
                return Some(p.to_string_lossy().to_string());
            }
        }
    }
    // Fall back to `which`
    for name in names {
        if let Ok(out) = Command::new("which").arg(name).output() {
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(path);
                }
            }
        }
    }
    None
}

/// Create a temporary Firefox profile with print preferences:
/// headers/footers disabled, scale 100%, backgrounds printed.
fn setup_firefox_profile() -> Result<std::path::PathBuf, String> {
    let profile_dir = std::env::temp_dir().join("azprose-ff-profile");
    let _ = std::fs::create_dir_all(&profile_dir);

    let user_js = profile_dir.join("user.js");
    let prefs = r#"
user_pref("print.print_headerleft", "");
user_pref("print.print_headercenter", "");
user_pref("print.print_headerright", "");
user_pref("print.print_footerleft", "");
user_pref("print.print_footercenter", "");
user_pref("print.print_footerright", "");
user_pref("print.print_scale", 1.0);
user_pref("print.print_bgcolor", true);
user_pref("print.print_bgimages", true);
"#;
    std::fs::write(&user_js, prefs)
        .map_err(|e| format!("write user.js: {e}"))?;

    Ok(profile_dir)
}
