// mdprinter — Headless Chrome PDF export + PNG report capture.
//
// The HTML is assembled by the TypeScript frontend (pdf-export.ts /
// pdf-planches.ts / email.ts) and includes MathJax config, lifecycle script,
// and print CSS. Rust launches headless Chrome (headless-chrome crate), waits
// for the readiness marker set by the lifecycle script (MathJax finished
// typesetting), then:
//   - `export_markdown_pdf`: print_to_pdf, writes the bytes directly to the
//     output path chosen by the user in the frontend (tauri-plugin-dialog save).
//   - `render_report_png`: Page.capture_screenshot of the report page at
//     retina scale (2×), returns the PNG as base64 (the email flow needs the
//     bytes in JS — mailer.rs assembles the multipart/related attachment).
//
// DECISION UTILISATEUR : headless Chrome replaces html-to-image for the colle
// report images (round 19) and the --app + native print dialog flow for PDFs
// (round 18). The page layout (A4, margins, landscape) is controlled by the
// app through PrintToPdfOptions + @page CSS; the native print dialog no longer
// appears.
//
// The headless-chrome `fetch` feature auto-downloads a known-good Chromium
// binary when no Chrome/Chromium is found on the system — the old manual
// `find_chrome` discovery and its install hints are gone.

use headless_chrome::protocol::cdp::Emulation::SetDeviceMetricsOverride;
use headless_chrome::protocol::cdp::Page::CaptureScreenshotFormatOption;
use headless_chrome::types::PrintToPdfOptions;
use headless_chrome::{Browser, LaunchOptions};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::command;

/// Title set by the assembled lifecycle scripts once rendering finished
/// (pdf-export.ts / pdf-planches.ts use `azprose-print-ready`, email.ts
/// `azprose-report-ready` — each waits on its own marker).
const PRINT_READY_TITLE: &str = "azprose-print-ready";
const REPORT_READY_TITLE: &str = "azprose-report-ready";
const READY_TIMEOUT: Duration = Duration::from_secs(90);
const POLL_INTERVAL: Duration = Duration::from_millis(300);

/// Dossier des fichiers temporaires de rendu (HTML jetable).
///
/// DÉCISION UTILISATEUR : ne pas polluer /tmp — quand le chemin racine du
/// vault est connu, les fichiers vivent dans le cache du vault
/// (`.azprose/tmp/`, ignoré par le watcher FS et nettoyé à chaque rendu) ;
/// sinon repli sur le temp système.
fn temp_html_dir(root_path: Option<&str>) -> PathBuf {
    match root_path.map(str::trim).filter(|r| !r.is_empty()) {
        Some(root) => PathBuf::from(root).join(".azprose").join("tmp"),
        None => std::env::temp_dir(),
    }
}

/// Chemin unique pour un rendu (horodatage nanoseconde — jamais deux rendus
/// simultanés n'écrasent le fichier de l'autre). Crée le dossier parent.
fn temp_html_path(root_path: Option<&str>, name: &str) -> Result<PathBuf, String> {
    let dir = temp_html_dir(root_path);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("create temp dir {}: {e}", dir.display()))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    Ok(dir.join(format!("{name}-{stamp}.html")))
}

/// `#[command(async)]` : la commande s'exécute sur le runtime async (tokio),
/// PAS sur le thread principal — un rendu headless (lancement Chrome +
/// navigation + capture) dure plusieurs secondes et gèlerait l'UI sinon
/// (symptôme rapporté : « l'application est indisponible pendant l'archivage »).
/// Le corps reste bloquant (headless_chrome n'est pas async) — sur un worker
/// tokio, le thread principal (UI) reste libre : bouton Annuler cliquable,
/// progression affichée.
#[command(async)]
pub fn export_markdown_pdf(
    html: String,
    output_path: String,
    landscape: Option<bool>,
    root_path: Option<String>,
) -> Result<String, String> {
    let temp_path = temp_html_path(root_path.as_deref(), "azprose-print")?;
    std::fs::write(&temp_path, &html)
        .map_err(|e| format!("write temp html: {e}"))?;

    eprintln!(
        "mdprinter: wrote {} ({} bytes)",
        temp_path.display(),
        html.len()
    );

    let (_browser, tab) = launch_and_navigate(&temp_path)?;
    // `_browser` reste LIÉ jusqu'à la fin du flux (son drop fermerait la
    // connexion WebSocket avant print_to_pdf) — ne pas le transformer en `_`
    // pur, qui le dropperait immédiatement.

    if let Err(e) = wait_for_title(&tab, PRINT_READY_TITLE) {
        let _ = std::fs::remove_file(&temp_path);
        return Err(e);
    }

    let mut opts = PrintToPdfOptions::default();
    opts.print_background = Some(true);
    opts.prefer_css_page_size = Some(true); // @page margins of the assembled CSS win
    opts.display_header_footer = Some(false);
    opts.landscape = Some(landscape.unwrap_or(false));
    // A4 — letter is the CDP default, the app is French.
    opts.paper_width = Some(8.27);
    opts.paper_height = Some(11.69);

    let data = tab
        .print_to_pdf(Some(opts))
        .map_err(|e| format!("print_to_pdf: {e}"))?;

    let _ = std::fs::remove_file(&temp_path);
    std::fs::write(&output_path, &data).map_err(|e| format!("write pdf: {e}"))?;

    eprintln!("mdprinter: wrote {} ({} bytes)", output_path, data.len());
    Ok(output_path)
}

/// PNG du rapport de colle capturé par headless Chrome (round 19 — remplace
/// html-to-image). Le frontend assemble le document HTML auto-suffisant
/// (`assembleReportImageHtml` dans email.ts — MathJax CDN + CSS embarqué +
/// lifecycle script) et reçoit ici le PNG en base64 (l'envoi email a besoin
/// des octets en JS pour le multipart/related ; l'archivage réutilise le même
/// base64 pour écrire sur disque).
///
/// Capture : la page du rapport est à largeur fixe (640px CSS — `.rp` /
/// `--rp-w`) et la hauteur varie avec le contenu. On mesure la hauteur du
/// document APRÈS le signal de fin de rendu (MathJax peut changer la mise en
/// page), on redimensionne le viewport à la taille exacte du rapport via
/// `Emulation.setDeviceMetricsOverride` (sans lui, Page.captureScreenshot est
/// borné au viewport initial — captureBeyondViewport vaut false par défaut),
/// et on capture à l'échelle rétine 2× (deviceScaleFactor 2 → sortie
/// 1280 × 2·hauteur).
#[command(async)]
pub fn render_report_png(html: String, root_path: Option<String>) -> Result<ReportPng, String> {
    let temp_path = temp_html_path(root_path.as_deref(), "azprose-report")?;
    std::fs::write(&temp_path, &html)
        .map_err(|e| format!("write temp html: {e}"))?;

    let (_browser, tab) = launch_and_navigate(&temp_path)?;
    // `_browser` reste LIÉ jusqu'à la fin du flux (son drop fermerait la
    // connexion WebSocket avant la capture).

    let result = (|| -> Result<ReportPng, String> {
        wait_for_title(&tab, REPORT_READY_TITLE)?;

        // Hauteur réelle du document (mesurée APRÈS le typeset MathJax — il
        // peut changer la hauteur). Le rapport est un div `.rp` unique à
        // largeur fixe 640px : scrollHeight = sa hauteur.
        let measured = tab
            .evaluate(
                "Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)",
                false,
            )
            .map_err(|e| format!("measure height: {e}"))?
            .value
            .and_then(|v| v.as_f64())
            .ok_or_else(|| "measure height: not a number".to_string())?;
        let width = REPORT_CSS_WIDTH;
        let height = measured.ceil().max(1.0) as u32;

        // Viewport exactement = taille du rapport (largeur fixe 640px), sinon
        // la capture serait bornée au viewport initial 1024×768 et une page
        // plus haute que 768px serait tronquée (fond noir).
        let _ = tab.call_method(SetDeviceMetricsOverride {
            width,
            height,
            device_scale_factor: PIXEL_RATIO,
            mobile: false,
            scale: None,
            screen_width: None,
            screen_height: None,
            position_x: None,
            position_y: None,
            dont_set_visible_size: None,
            screen_orientation: None,
            viewport: None,
            display_feature: None,
            device_posture: None,
        })
        .map_err(|e| format!("set device metrics: {e}"))?;

        let png = tab
            .capture_screenshot(CaptureScreenshotFormatOption::Png, None, None, true)
            .map_err(|e| format!("capture_screenshot: {e}"))?;

        use base64::Engine as _;
        let base64 = base64::engine::general_purpose::STANDARD.encode(&png);
        eprintln!(
            "mdprinter: report png {}x{} ({} bytes, base64 {})",
            width * PIXEL_RATIO as u32,
            height * PIXEL_RATIO as u32,
            png.len(),
            base64.len()
        );
        Ok(ReportPng {
            base64,
            width: width * PIXEL_RATIO as u32,
            height: height * PIXEL_RATIO as u32,
        })
    })();

    let _ = std::fs::remove_file(&temp_path);
    result
}

/// Largeur CSS du rapport (px) — DOIT rester synchrone avec `--rp-w` dans
/// REPORT_PAGE_CSS (report-layout.ts) : la page est à largeur fixe 640px et
/// le viewport de capture est redimensionné à cette taille.
const REPORT_CSS_WIDTH: u32 = 640;
/// Échelle de capture (rétine 2× — sortie 1280px de large).
const PIXEL_RATIO: f64 = 2.0;

/// PNG capturé retourné au frontend (serde camelCase → `{base64, width, height}`).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportPng {
    /// Octets PNG encodés base64 (alphabet standard, sans préfixe data:).
    pub base64: String,
    /// Largeur réelle de l'image en pixels (largeur CSS × 2).
    pub width: u32,
    /// Hauteur réelle de l'image en pixels (hauteur CSS × 2).
    pub height: u32,
}

/// Lance le navigateur headless (options partagées PDF + PNG), ouvre un onglet
/// et navigue vers le fichier HTML temp.
///
/// IMPORTANT : le `Browser` DOIT rester vivant tant qu'on pilote l'onglet —
/// son `drop` ferme la connexion WebSocket (`Browser::close`) et tout appel
/// CDP ultérieur échoue avec « underlying connection is closed ». C'est
/// pourquoi la fonction retourne `(Browser, Arc<Tab>)` et que les appelants
/// gardent le Browser dans une variable jusqu'à la fin du flux.
fn launch_and_navigate(
    temp_path: &std::path::Path,
) -> Result<(Browser, std::sync::Arc<headless_chrome::browser::tab::Tab>), String> {
    // headless(true) is the crate default; explicit for clarity. Sandbox stays
    // at the crate default (enabled) — Chrome's standard sandbox works on a
    // desktop Linux user session.
    let options = LaunchOptions::default_builder()
        .headless(true)
        .window_size(Some((1024, 768)))
        .idle_browser_timeout(Duration::from_secs(300)) // CDN lent — jamais idle-kill pendant le chargement
        .build()
        .map_err(|e| format!("launch options: {e}"))?;

    let browser = Browser::new(options).map_err(|e| format!("launch chrome: {e}"))?;
    let tab = browser.new_tab().map_err(|e| format!("new tab: {e}"))?;

    let file_url = url::Url::from_file_path(temp_path)
        .map_err(|_| format!("invalid file path: {}", temp_path.display()))?
        .to_string();
    tab.navigate_to(&file_url)
        .map_err(|e| format!("navigate: {e}"))?;
    tab.wait_until_navigated()
        .map_err(|e| format!("wait navigate: {e}"))?;
    Ok((browser, tab))
}

/// Poll the tab title until the lifecycle script signals the document is
/// ready to render (it sets `document.title = title` once MathJax finished
/// and the fallback paths fire on load/error — never hangs).
fn wait_for_title(tab: &headless_chrome::browser::tab::Tab, title: &str) -> Result<(), String> {
    let start = Instant::now();
    loop {
        if tab.get_title().map(|t| t == title).unwrap_or(false) {
            return Ok(());
        }
        if start.elapsed() > READY_TIMEOUT {
            let current = tab.get_title().unwrap_or_default();
            return Err(format!("timeout waiting for render (title was {current:?})"));
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temp_dir_with_root_is_vault_cache() {
        assert_eq!(
            temp_html_dir(Some("/vault/notes")),
            PathBuf::from("/vault/notes/.azprose/tmp")
        );
        // Racine nulle/vide → repli temp système (jamais de crash).
        assert_eq!(temp_html_dir(None), std::env::temp_dir());
        assert_eq!(temp_html_dir(Some("  ")), std::env::temp_dir());
    }

    #[test]
    fn temp_html_path_is_unique_and_created() {
        let a = temp_html_path(Some("/tmp/opencode/tmp-test"), "azprose-report").unwrap();
        let b = temp_html_path(Some("/tmp/opencode/tmp-test"), "azprose-report").unwrap();
        // Noms uniques (horodatage) + parent créé + fichier inscriptible.
        assert_ne!(a, b);
        assert!(a.starts_with("/tmp/opencode/tmp-test/.azprose/tmp"));
        assert!(a.file_name().unwrap().to_string_lossy().contains("azprose-report"));
        let dir = a.parent().unwrap();
        assert!(dir.is_dir());
        std::fs::write(&a, "x").unwrap();
        std::fs::write(&b, "y").unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }
}
