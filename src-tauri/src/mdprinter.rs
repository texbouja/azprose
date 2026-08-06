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
// PROCESS PARTAGÉ (décision utilisateur) : un SEUL process Chromium headless
// est lancé une fois et réutilisé pour TOUS les rendus — le lancement
// (~175 ms à chaud) n'a lieu qu'au premier rendu, et le cache HTTP du process
// est partagé entre les pages (le CDN MathJax n'est chargé qu'une seule fois
// pour toutes les planches). UN SEUL onglet est réutilisé (navigué à chaque
// rendu — PAS de new_tab par planche : chaque onglet Chrome consomme de la
// mémoire). Le process peut mourir entre deux utilisations (idle_browser_timeout
// 300 s, kill externe, crash) : `with_browser` détecte l'erreur de connexion
// (« underlying connection is closed ») et relance une fois.
//
// DÉCISION UTILISATEUR : headless Chrome remplace html-to-image pour la colle
// report images (round 19) et le --app + native print dialog flow pour les
// PDF (round 18). The page layout (A4, margins, landscape) is controlled by
// the app through PrintToPdfOptions + @page CSS; the native print dialog no
// longer appears.
//
// The headless-chrome `fetch` feature auto-downloads a known-good Chromium
// binary when no Chrome/Chromium is found on the system — the old manual
// `find_chrome` discovery and its install hints are gone.

use headless_chrome::browser::tab::Tab;
use headless_chrome::protocol::cdp::Emulation::SetDeviceMetricsOverride;
use headless_chrome::protocol::cdp::Page::CaptureScreenshotFormatOption;
use headless_chrome::types::PrintToPdfOptions;
use headless_chrome::{Browser, LaunchOptions};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::command;

/// Title set by the assembled lifecycle scripts once rendering finished
/// (pdf-export.ts / pdf-planches.ts use `azprose-print-ready`, email.ts
/// `azprose-report-ready` — each waits on its own marker).
const PRINT_READY_TITLE: &str = "azprose-print-ready";
const REPORT_READY_TITLE: &str = "azprose-report-ready";
const READY_TIMEOUT: Duration = Duration::from_secs(90);
const POLL_INTERVAL: Duration = Duration::from_millis(300);

/// Browser headless PARTAGÉ + son onglet unique (décision utilisateur — un
/// seul process, un seul onglet, navigué à chaque rendu). Conservé entre les
/// invocations : le cache HTTP (MathJax CDN) survit d'une planche à l'autre.
static SHARED_BROWSER: Mutex<Option<(Browser, Arc<Tab>)>> = Mutex::new(None);

/// Sérialise les opérations de rendu : le navigateur ET l'onglet sont
/// partagés, deux commandes simultanées (ex. ⌘P pendant un archivage)
/// navigueraient le même onglet en parallèle. Pris pour TOUTE la durée d'une
/// opération — le corps est bloquant, pas d'await sous le lock → pas de
/// deadlock (sur un runtime multi-worker, la seconde commande attend sur un
/// autre worker ; mono-worker, elle attend dans la file).
static RENDER_LOCK: Mutex<()> = Mutex::new(());

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

/// Lance un NOUVEAU process Chromium headless (options partagées PDF + PNG).
fn launch_browser() -> Result<Browser, String> {
    // headless(true) is the crate default; explicit for clarity. Sandbox stays
    // at the crate default (enabled) — Chrome's standard sandbox works on a
    // desktop Linux user session.
    let options = LaunchOptions::default_builder()
        .headless(true)
        .window_size(Some((1024, 768)))
        .idle_browser_timeout(Duration::from_secs(300)) // CDN lent — jamais idle-kill pendant le chargement
        .build()
        .map_err(|e| format!("launch options: {e}"))?;

    Browser::new(options).map_err(|e| format!("launch chrome: {e}"))
}

/// Récupère le (browser, onglet) PARTAGÉ ; en lance un premier exemplaire si
/// aucun n'est vivant. `Browser` est Clone (Arc interne) et `Tab` est un Arc :
/// les clones partagent la même connexion WebSocket et le même onglet.
fn acquire_shared() -> Result<(Browser, Arc<Tab>), String> {
    let mut guard = SHARED_BROWSER
        .lock()
        .map_err(|e| format!("mdprinter lock: {e}"))?;
    if let Some(pair) = guard.as_ref() {
        return Ok((pair.0.clone(), pair.1.clone()));
    }
    let browser = launch_browser()?;
    let tab = browser.new_tab().map_err(|e| format!("new tab: {e}"))?;
    guard.replace((browser.clone(), tab.clone()));
    Ok((browser, tab))
}

/// Détruit le browser partagé (drop → `Browser::close` → le process Chrome se
/// termine). Le prochain rendu en relance un.
fn reset_shared() {
    if let Ok(mut guard) = SHARED_BROWSER.lock() {
        guard.take();
    }
}

/// True si l'erreur est un TIMEOUT du marqueur de rendu (le process est sain,
/// c'est la page qui est en cause) — pas de relance dans ce cas.
fn is_title_timeout(e: &str) -> bool {
    e.starts_with("timeout waiting for render")
}

/// Exécute `f` avec le (browser, onglet) partagés. Si l'appel échoue pour une
/// raison autre qu'un timeout de titre (connexion fermée : process mort entre
/// deux utilisations — idle timeout, kill externe, crash), détruit le process
/// et relance une fois. `f` doit être idempotent (il navigue l'onglet au
/// début, donc re-jouable).
fn with_browser<T>(f: impl Fn(&Browser, &Tab) -> Result<T, String>) -> Result<T, String> {
    match attempt(&f) {
        Err(e) if !is_title_timeout(&e) => {
            eprintln!("mdprinter: {e}\n→ redémarrage du browser headless partagé");
            reset_shared();
            attempt(&f)
        }
        r => r,
    }
}

fn attempt<T>(f: &impl Fn(&Browser, &Tab) -> Result<T, String>) -> Result<T, String> {
    let (browser, tab) = acquire_shared()?;
    // Le browser/onglet partagés restent VIVANTS via le static + ces clones
    // locaux (valides pendant `f`) — rien n'est droppé ici.
    f(&browser, &tab)
}

/// Navigue l'onglet PARTAGÉ vers le fichier HTML temp (il est réutilisé d'un
/// rendu à l'autre — pas de new_tab, la mémoire des onglets est une
/// préoccupation utilisateur).
fn navigate_shared(tab: &Tab, temp_path: &Path) -> Result<(), String> {
    let file_url = url::Url::from_file_path(temp_path)
        .map_err(|_| format!("invalid file path: {}", temp_path.display()))?
        .to_string();
    tab.navigate_to(&file_url)
        .map_err(|e| format!("navigate: {e}"))?;
    tab.wait_until_navigated()
        .map_err(|e| format!("wait navigate: {e}"))?;
    Ok(())
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
    let _guard = RENDER_LOCK
        .lock()
        .map_err(|e| format!("mdprinter lock: {e}"))?;

    let temp_path = temp_html_path(root_path.as_deref(), "azprose-print")?;
    std::fs::write(&temp_path, &html)
        .map_err(|e| format!("write temp html: {e}"))?;

    eprintln!(
        "mdprinter: wrote {} ({} bytes)",
        temp_path.display(),
        html.len()
    );

    let result = with_browser(|_browser, tab| {
        navigate_shared(tab, &temp_path)?;

        if let Err(e) = wait_for_title(tab, PRINT_READY_TITLE) {
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

        // Ceinture + bretelles : la navigation de la planche suivante
        // remplacera de toute façon le document, mais on ne laisse pas un
        // marqueur orphelin traîner sur l'onglet réutilisé.
        let _ = tab.evaluate("document.title = ''", false);

        std::fs::write(&output_path, &data).map_err(|e| format!("write pdf: {e}"))?;

        eprintln!("mdprinter: wrote {} ({} bytes)", output_path, data.len());
        Ok(output_path.clone())
    });

    let _ = std::fs::remove_file(&temp_path);
    result
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
///
/// Le process Chromium est PARTAGÉ entre les planches (voir doc de tête) :
/// une seule planche à la fois, séquentiellement — le frontend boucle
/// `renderReportImages` planche par planche.
#[command(async)]
pub fn render_report_png(html: String, root_path: Option<String>) -> Result<ReportPng, String> {
    let _guard = RENDER_LOCK
        .lock()
        .map_err(|e| format!("mdprinter lock: {e}"))?;

    let temp_path = temp_html_path(root_path.as_deref(), "azprose-report")?;
    std::fs::write(&temp_path, &html)
        .map_err(|e| format!("write temp html: {e}"))?;

    let result = with_browser(|_browser, tab| {
        navigate_shared(tab, &temp_path)?;
        capture_report_png(tab)
    });

    let _ = std::fs::remove_file(&temp_path);
    result
}

/// Capture le PNG du rapport courant (le tab a été navigué) : poll du marqueur
/// `azprose-report-ready`, mesure de hauteur, redimensionnement du viewport,
/// capture rétine 2×, retour base64. Remet le titre à vide avant de rendre le
/// contrôle (l'onglet est réutilisé par la planche suivante).
fn capture_report_png(tab: &Tab) -> Result<ReportPng, String> {
    wait_for_title(tab, REPORT_READY_TITLE)?;

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

    // Ceinture + bretelles : la navigation de la planche suivante remplacera
    // de toute façon le document, mais on ne laisse pas un marqueur orphelin
    // traîner sur l'onglet réutilisé.
    let _ = tab.evaluate("document.title = ''", false);

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

/// Poll the tab title until the lifecycle script signals the document is
/// ready to render (it sets `document.title = title` once MathJax finished
/// and the fallback paths fire on load/error — never hangs).
///
/// Onglet RÉUTILISÉ : pas d'anti-écueil nécessaire sur un marqueur STALE —
/// la navigation (`navigate_to` + `wait_until_navigated`, le flag `navigating`
/// se libère sur `networkAlmostIdle`) remplace le document : l'ancien titre
/// ne peut pas survivre, et le script inline du nouveau document a DÉJÀ tourné
/// quand `networkAlmostIdle` arrive (les scripts inline s'exécutent pendant le
/// parsing). Donc au premier poll, titre == marqueur ⇒ c'est légitime, on rend.
fn wait_for_title(tab: &Tab, title: &str) -> Result<(), String> {
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

    #[test]
    fn title_timeout_detection() {
        // Le timeout du marqueur n'est PAS une raison de relancer le process
        // (il est sain) ; toute autre erreur (connexion fermée…) l'est.
        assert!(is_title_timeout("timeout waiting for render (title was \"azprose-report-ready\")"));
        assert!(!is_title_timeout("navigate: Unable to make method calls because underlying connection is closed"));
    }

    /// E2E manuel (lent — lance un vrai Chromium, `fetch` feature) : deux
    /// rendus PNG séquentiels sur le process PARTAGÉ. Vérifie les magics PNG
    /// et affiche les timings (le 2ᵉ rendu ne relance pas le process).
    #[test]
    #[ignore = "lent : lance un vrai Chromium (validation manuelle)"]
    fn shared_browser_reuses_process_across_renders() {
        let html = |tag: &str| {
            format!(
                "<!doctype html><html><head><meta charset=\"utf-8\">\
                 <script>document.title = \"azprose-report-ready\";</script>\
                 </head><body style=\"width:640px\"><h1>{tag}</h1></body></html>"
            )
        };
        let t0 = Instant::now();
        let a = render_report_png(html("Planche A"), None).expect("rendu A");
        let t1 = Instant::now();
        let b = render_report_png(html("Planche B"), None).expect("rendu B");
        let t2 = Instant::now();
        assert!(a.width > 0 && a.height > 0, "PNG A vide");
        assert!(b.width > 0 && b.height > 0, "PNG B vide");
        // Magic PNG en base64 standard : \x89PNG\r\n\x1a\n → "iVBORw0KGgo".
        assert!(a.base64.starts_with("iVBORw0KGgo"), "magic PNG A");
        assert!(b.base64.starts_with("iVBORw0KGgo"), "magic PNG B");
        eprintln!(
            "  → rendu A (lance le process) : {:.2}s  |  rendu B (process réutilisé) : {:.2}s",
            (t1 - t0).as_secs_f32(),
            (t2 - t1).as_secs_f32()
        );
        reset_shared();
    }
}
