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
use serde::Deserialize;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::command;

/// Options d'impression transmises par le frontend (PrintOverlay — chantier 3
/// de next_level.md). Tous les champs sont OPTIONNELS : `None` = comportement
/// actuel (A4 portrait, fond imprimé, pas d'entête/pied).
///
/// Coordination marges CSS / CDP (décision documentée §3.1) : le frontend
/// écrit TOUJOURS les marges dans le `@page` CSS généré (c'est la source de
/// vérité — avec `prefer_css_page_size: true`, le CSS gagne sur les marges
/// CDP). Les champs `margin_*` ne sont transmis que dans le cas « marges
/// système » (phase 2, `prefer_css_page_size` désactivé). Les entêtes/pieds
/// sont des templates CDP (classes réservées `.title`, `.date`, `.url`,
/// `.pageNumber`, `.totalPages`) dessinés DANS la zone de marge CSS (le
/// frontend réserve ~10 mm quand ils sont activés).
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PrintOptions {
    pub landscape: Option<bool>,
    /// Échelle CDP 0.5–2.0 (défaut 1.0).
    pub scale: Option<f64>,
    /// Pouces — défaut 8.27 (A4).
    pub paper_width: Option<f64>,
    /// Pouces — défaut 11.69 (A4).
    pub paper_height: Option<f64>,
    pub margin_top: Option<f64>,
    pub margin_bottom: Option<f64>,
    pub margin_left: Option<f64>,
    pub margin_right: Option<f64>,
    pub display_header_footer: Option<bool>,
    pub header_template: Option<String>,
    pub footer_template: Option<String>,
    pub print_background: Option<bool>,
}

/// Mappe les options frontend vers les `PrintToPdfOptions` CDP. PUR (testable) :
/// `None`/champ absent → les défauts = comportement actuel (A4 portrait,
/// print_background, pas d'entête/pied, `prefer_css_page_size` — le CSS @page
/// de l'assembleur reste la source de vérité des marges).
fn print_to_cdp(options: Option<PrintOptions>) -> PrintToPdfOptions {
    let o = options.unwrap_or_default();
    let mut opts = PrintToPdfOptions::default();
    opts.print_background = o.print_background.or(Some(true));
    opts.prefer_css_page_size = Some(true);
    opts.display_header_footer = o.display_header_footer.or(Some(false));
    opts.landscape = o.landscape.or(Some(false));
    // A4 — letter est le défaut CDP, l'app est française.
    opts.paper_width = o.paper_width.or(Some(8.27));
    opts.paper_height = o.paper_height.or(Some(11.69));
    opts.scale = o.scale;
    opts.margin_top = o.margin_top;
    opts.margin_bottom = o.margin_bottom;
    opts.margin_left = o.margin_left;
    opts.margin_right = o.margin_right;
    opts.header_template = o.header_template;
    opts.footer_template = o.footer_template;
    opts
}

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

/// Browser d'APERÇU NON-HEADLESS DÉDIÉ (décision §3.4 de next_level.md) —
/// STRICTEMENT séparé du `SHARED_BROWSER` (qui a un idle timeout 300 s et un
/// onglet réutilisé ; la fenêtre d'aperçu doit rester ouverte). Conservé ici
/// pour que la fenêtre survive au retour de la commande — leçon round 19 :
/// dropper le `Browser` ferme la connexion CDP et le process Chromium.
/// Remplacé (drop → fermeture propre) à la prochaine ouverture d'aperçu.
static PREVIEW_BROWSER: Mutex<Option<(Browser, Arc<Tab>)>> = Mutex::new(None);

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
    root_path: Option<String>,
    options: Option<PrintOptions>,
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
    // `temp_path`/`options` sont clonés : le retry de `with_browser` re-joue
    // `f` (un `move` qui consommerait les valeurs casserait le second passage)
    // et le nettoyage final a besoin de `temp_path` après le closure.
    let temp_for_closure = temp_path.clone();
    let result = with_browser(move |_browser, tab| {
        navigate_shared(tab, &temp_for_closure)?;

        if let Err(e) = wait_for_title(tab, PRINT_READY_TITLE) {
            return Err(e);
        }

        let print_opts = print_to_cdp(options.clone());
        let data = tab
            .print_to_pdf(Some(print_opts))
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

/// Aperçu avant impression (décision §3.4 de next_level.md) : affiche le
/// document HTML (celui qui sera exporté — le frontend assemble le même HTML
/// que l'export) dans une FENÊTRE Chromium VISIBLE (non-headless).
///
/// - Le HTML est écrit dans le CACHE du vault (`.azprose/tmp/print-preview-<ts>.html`,
///   décision utilisateur : pas de pollution /tmp) et **n'est PAS supprimé** —
///   l'aperçu reste consultable (chemin retourné au frontend).
/// - Browser NON-headless DÉDIÉ (PAS le `SHARED_BROWSER` — il a un idle
///   timeout 300 s et un onglet réutilisé ; la fenêtre d'aperçu doit rester
///   ouverte) : instance séparée, idle timeout long, fenêtre 1024×768, en
///   mode FENÊTRE D'APPLICATION (`--app=<url>` — pas de barre d'adresse, pas
///   d'onglets, pas de menus : « ne pas trahir sa nature de fenêtre d'un
///   browser », décision utilisateur).
/// - Nav + `wait_for_title("azprose-print-ready")` (même marqueur que
///   l'export) → la fenêtre AFFICHE le document avec le CSS print appliqué
///   (le navigateur applique les `@page`/media print au rendu).
/// - Cycle de vie : la fenêtre reste ouverte après le retour de la commande
///   (le Browser est conservé dans `PREVIEW_BROWSER`) ; sa fermeture par
///   l'utilisateur tue le process — la prochaine ouverture détecte la
///   connexion morte et relance.
/// - Repli documenté (risque Linux : X11/Wayland requis) : si l'aperçu
///   fenêtré échoue, le frontend peut ouvrir le PDF dans le viewer existant
///   (`transfer_mode: base64` — l'infra `viewerPdfPath` existe).
#[command(async)]
pub fn preview_print(html: String, root_path: Option<String>) -> Result<String, String> {
    let _guard = RENDER_LOCK
        .lock()
        .map_err(|e| format!("mdprinter lock: {e}"))?;

    // Le HTML d'aperçu vit dans le cache du vault et n'est PAS supprimé
    // (l'utilisateur peut le rouvrir / l'inspecter) — contrairement aux
    // fichiers jetables des rendus headless.
    let temp_path = temp_html_path(root_path.as_deref(), "print-preview")?;
    std::fs::write(&temp_path, &html)
        .map_err(|e| format!("write preview html: {e}"))?;
    eprintln!(
        "mdprinter: preview html written {} ({} bytes)",
        temp_path.display(),
        html.len()
    );

    // `temp_path` est cloné pour le retry : `with_preview_browser` re-joue le
    // closure en cas de connexion morte (fenêtre fermée entre deux aperçus).
    // L'URL file:// est aussi passée : au premier lancement, `--app=<url>`
    // ouvre DIRECTEMENT la fenêtre app sur ce document.
    let file_url = url::Url::from_file_path(&temp_path)
        .map_err(|_| format!("invalid file path: {}", temp_path.display()))?;
    let file_url_str = file_url.to_string();
    let temp_for_closure = temp_path.clone();
    let result = with_preview_browser(&file_url_str, move |_browser, tab| {
        // Re-navigation systématique (idempotente) : au premier lancement
        // c'est un simple reload de l'URL déjà chargée par `--app=` ; elle
        // couvre la réutilisation du browser (aperçu suivant) et le retry.
        navigate_shared(tab, &temp_for_closure)?;
        wait_for_title(tab, PRINT_READY_TITLE)?;
        // Aucun titre orphelin sur l'onglet d'aperçu : la page affiche le
        // document, le marqueur dans l'onglet ne gêne pas l'affichage.
        eprintln!(
            "mdprinter: preview ready — fenêtre app ouverte sur {}",
            temp_for_closure.display()
        );
        Ok(temp_for_closure.display().to_string())
    });

    // PAS de remove_file ici : le fichier d'aperçu reste consultable.
    result
}

/// Lance un NOUVEAU browser Chromium NON-headless en mode FENÊTRE
/// D'APPLICATION (`--app=<url>`) pour l'aperçu avant impression.
///
/// DÉCISION UTILISATEUR : la fenêtre d'aperçu ne doit avoir NI barre
/// d'adresse, NI onglets, NI menus — juste le contenu, pour ne pas trahir
/// sa nature de fenêtre d'un browser. `--app=<url>` est le mode app window
/// de Chrome (fenêtre sans chrome : pas d'URL, pas d'onglets, pas de menu).
///
/// Options dédiées, distinctes de `launch_browser()` (headless) : idle
/// timeout LONG (la fenêtre reste ouverte pendant la consultation), fenêtre
/// 1024×768. `--no-default-browser-check` évite le dialogue « Chrome n'est
/// pas votre navigateur par défaut » ; `--enable-automation` (DEFAULT_ARGS,
/// infobande jaune « contrôlé par un logiciel de test ») est IGNORÉ.
fn launch_preview_browser(url: &str) -> Result<Browser, String> {
    let app_flag = format!("--app={url}");
    let options = LaunchOptions::default_builder()
        .headless(false) // fenêtre visible — décision §3.4
        .window_size(Some((1024, 768)))
        .args(vec![
            OsStr::new(&app_flag),
            OsStr::new("--no-default-browser-check"),
        ])
        .ignore_default_args(vec![OsStr::new("--enable-automation")])
        // L'idle timeout du shared (300 s) tuerait la fenêtre d'aperçu
        // pendant une consultation longue — celui-ci est bien plus long.
        .idle_browser_timeout(Duration::from_secs(3600))
        .build()
        .map_err(|e| format!("preview launch options: {e}"))?;

    Browser::new(options).map_err(|e| format!("launch preview chrome: {e}"))
}

/// Attend le tab INITIAL du browser d'aperçu (créé au lancement avec
/// `--app=`) — polling de `get_tabs()`. On ne crée JAMAIS de nouveau tab
/// (`new_tab()` ouvrirait une fenêtre navigateur NORMALE à côté de la
/// fenêtre app ; `wait_for_initial_tab()` du crate replie justement sur
/// `new_tab()` — d'où ce poll maison).
fn wait_initial_tab(browser: &Browser) -> Result<Arc<Tab>, String> {
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        let tabs = browser
            .get_tabs()
            .lock()
            .map_err(|e| format!("mdprinter tabs lock: {e}"))?;
        if let Some(tab) = tabs.first().cloned() {
            return Ok(tab);
        }
        drop(tabs);
        std::thread::sleep(Duration::from_millis(50));
    }
    Err("preview: no initial tab after 10 s".into())
}

/// Récupère le browser d'aperçu DÉDIÉ (non-headless, mode app) ; en lance un
/// premier exemplaire si aucun n'est vivant. Une fenêtre fermée par
/// l'utilisateur tue le process → la connexion est morte → on détruit
/// l'ancien et on relance (le prochain aperçu ouvre une nouvelle fenêtre).
fn acquire_preview_browser(url: &str) -> Result<(Browser, Arc<Tab>), String> {
    let mut guard = PREVIEW_BROWSER
        .lock()
        .map_err(|e| format!("mdprinter preview lock: {e}"))?;
    if let Some(pair) = guard.as_ref() {
        return Ok((pair.0.clone(), pair.1.clone()));
    }
    let browser = launch_preview_browser(url)?;
    let tab = wait_initial_tab(&browser)?;
    guard.replace((browser.clone(), tab.clone()));
    Ok((browser, tab))
}

/// Détruit le browser d'aperçu (drop → `Browser::close` → ferme la fenêtre et
/// le process Chromium). Utilisé pour remplacer une fenêtre morte.
fn reset_preview_browser() {
    if let Ok(mut guard) = PREVIEW_BROWSER.lock() {
        guard.take();
    }
}

/// Exécute `f` avec le browser d'aperçu. Si la connexion est morte (fenêtre
/// fermée par l'utilisateur entre deux aperçus — erreur « connection is
/// closed »), détruit l'ancien et relance une fois.
fn with_preview_browser<T>(
    url: &str,
    f: impl Fn(&Browser, &Tab) -> Result<T, String>,
) -> Result<T, String> {
    match attempt_preview(url, &f) {
        Err(e) if !is_title_timeout(&e) => {
            eprintln!("mdprinter: {e}\n→ réouverture de la fenêtre d'aperçu");
            reset_preview_browser();
            attempt_preview(url, &f)
        }
        r => r,
    }
}

fn attempt_preview<T>(
    url: &str,
    f: &impl Fn(&Browser, &Tab) -> Result<T, String>,
) -> Result<T, String> {
    let (browser, tab) = acquire_preview_browser(url)?;
    f(&browser, &tab)
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

    #[test]
    fn print_options_none_keeps_current_defaults() {
        // `None` (appelant legacy) → comportement exact du flux actuel :
        // A4 portrait, fond imprimé, pas d'entête/pied, CSS @page prioritaire.
        let o = print_to_cdp(None);
        assert_eq!(o.landscape, Some(false));
        assert_eq!(o.print_background, Some(true));
        assert_eq!(o.display_header_footer, Some(false));
        assert_eq!(o.prefer_css_page_size, Some(true));
        assert_eq!(o.paper_width, Some(8.27));
        assert_eq!(o.paper_height, Some(11.69));
        assert_eq!(o.scale, None);
        assert_eq!(o.header_template, None);
        assert_eq!(o.footer_template, None);
        // Pas de marges CDP par défaut — le CSS @page est la source de vérité.
        assert_eq!(o.margin_top, None);
    }

    #[test]
    fn print_options_map_to_cdp() {
        let opts = PrintOptions {
            landscape: Some(true),
            scale: Some(1.2),
            paper_width: Some(5.83),  // A5 paysage (148 mm)
            paper_height: Some(8.27),
            margin_top: Some(0.4),
            margin_bottom: Some(0.4),
            margin_left: Some(0.5),
            margin_right: Some(0.5),
            display_header_footer: Some(true),
            header_template: Some("<div>{{title}}</div>".into()),
            footer_template: Some("<span class=\"pageNumber\"></span>".into()),
            print_background: Some(false),
        };
        let o = print_to_cdp(Some(opts));
        assert_eq!(o.landscape, Some(true));
        assert_eq!(o.scale, Some(1.2));
        assert_eq!(o.paper_width, Some(5.83));
        assert_eq!(o.paper_height, Some(8.27));
        assert_eq!(o.margin_top, Some(0.4));
        assert_eq!(o.margin_bottom, Some(0.4));
        assert_eq!(o.margin_left, Some(0.5));
        assert_eq!(o.margin_right, Some(0.5));
        assert_eq!(o.display_header_footer, Some(true));
        assert_eq!(o.header_template.as_deref(), Some("<div>{{title}}</div>"));
        assert_eq!(
            o.footer_template.as_deref(),
            Some("<span class=\"pageNumber\"></span>")
        );
        assert_eq!(o.print_background, Some(false));
        // Les valeurs explicites priment sur les défauts — JAMAIS l'inverse.
        let full = print_to_cdp(Some(PrintOptions {
            print_background: Some(false),
            ..PrintOptions::default()
        }));
        assert_eq!(full.print_background, Some(false));
    }

    #[test]
    fn print_options_partial_fields_default_back() {
        // Un champ absent (None) retombe sur le défaut, les autres sont
        // préservés — comportement attendu d'un formulaire partiellement rempli.
        let o = print_to_cdp(Some(PrintOptions {
            paper_width: Some(7.0),
            ..PrintOptions::default()
        }));
        assert_eq!(o.paper_width, Some(7.0));
        assert_eq!(o.paper_height, Some(11.69)); // défaut conservé
        assert_eq!(o.landscape, Some(false));
        assert_eq!(o.display_header_footer, Some(false));
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

    /// E2E manuel (lent — ouvre une VRAIE fenêtre Chromium sur l'écran) :
    /// `preview_print` écrit le HTML dans le cache du vault (`print-preview-*`),
    /// le laisse sur disque (consultable) et signale la fenêtre prête.
    /// Fermeture propre du browser d'aperçu à la fin (sinon la fenêtre reste).
    #[test]
    #[ignore = "lent : ouvre une fenêtre Chromium visible (validation manuelle)"]
    fn preview_print_writes_cache_html_and_opens_window() {
        let html = "<!doctype html><html><head><meta charset=\"utf-8\">\
                    <script>document.title = \"azprose-print-ready\";</script>\
                    </head><body><h1>Aperçu</h1><p>Le CSS print s'applique.</p></body></html>";
        let root = "/tmp/opencode/preview-e2e";
        let path = preview_print(html.into(), Some(root.into())).expect("aperçu");
        // Le fichier vit dans le cache du vault et n'est PAS supprimé.
        assert!(path.contains(".azprose/tmp/print-preview-"), "chemin cache: {path}");
        assert!(std::path::Path::new(&path).is_file(), "fichier présent: {path}");
        eprintln!("  → aperçu ouvert sur {path}");
        // Ferme la fenêtre proprement (le test ne doit pas laisser de process).
        reset_preview_browser();
        let _ = std::fs::remove_dir_all("/tmp/opencode/preview-e2e/.azprose");
    }
}
