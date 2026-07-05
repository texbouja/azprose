use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use typst::diag::{FileError, FileResult, Severity, SourceDiagnostic, Warned};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::layout::FrameItem;
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, WorldExt};
use typst::World;

use typst_layout::PagedDocument;
use typst_kit::fonts::{FontStore, embedded, system};
use typst_pdf::PdfOptions;
use typst_svg::{svg, SvgOptions};

fn data_packages_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("typst").join("packages"))
}

fn cache_packages_dir() -> Option<PathBuf> {
    dirs::cache_dir().map(|d| d.join("typst").join("packages"))
}

struct RenderWorld {
    library: LazyHash<Library>,
    font_store: FontStore,
    source: Source,
    project_root: PathBuf,
    data_packages: Option<PathBuf>,
    cache_packages: Option<PathBuf>,
}

impl RenderWorld {
    fn new(file_path: &str, source_text: String) -> Result<Self, String> {
        let path = Path::new(file_path);
        let project_root =
            path.parent().ok_or_else(|| "invalid file path".to_string())?.to_path_buf();

        let vpath = VirtualPath::virtualize(&project_root, path)
            .map_err(|e| format!("failed to create virtual path: {e}"))?;
        let rooted = RootedPath::new(VirtualRoot::Project, vpath);
        let source = Source::new(rooted.intern(), source_text);

        let mut font_store = FontStore::new();
        font_store.extend(embedded());
        font_store.extend(system());

        Ok(Self {
            library: LazyHash::new(Library::default()),
            font_store,
            source,
            project_root,
            data_packages: data_packages_dir(),
            cache_packages: cache_packages_dir(),
        })
    }

    fn package_root(&self, spec: &typst::syntax::package::PackageSpec) -> Option<PathBuf> {
        let sub = format!("{}/{}/{}", spec.namespace, spec.name, spec.version);
        if let Some(d) = &self.data_packages {
            let p = d.join(&sub);
            if p.is_dir() {
                return Some(p);
            }
        }
        if let Some(d) = &self.cache_packages {
            let p = d.join(&sub);
            if p.is_dir() {
                return Some(p);
            }
        }
        None
    }

    fn resolve_path(&self, id: FileId) -> FileResult<PathBuf> {
        match id.root() {
            VirtualRoot::Project => id
                .vpath()
                .realize(&self.project_root)
                .map_err(|_| FileError::AccessDenied),
            VirtualRoot::Package(spec) => {
                let root =
                    self.package_root(spec).ok_or(FileError::AccessDenied)?;
                id.vpath().realize(&root).map_err(|_| FileError::AccessDenied)
            }
        }
    }
}

impl World for RenderWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        self.font_store.book()
    }

    fn main(&self) -> FileId {
        self.source.id()
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.source.id() {
            return Ok(self.source.clone());
        }
        let path = self.resolve_path(id)?;
        let text =
            fs::read_to_string(&path).map_err(|e| FileError::from_io(e, &path))?;
        Ok(Source::new(id, text))
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        let path = self.resolve_path(id)?;
        let data = fs::read(&path).map_err(|e| FileError::from_io(e, &path))?;
        Ok(Bytes::new(data))
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.font_store.font(index)
    }

    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        None
    }
}

#[derive(serde::Serialize)]
pub struct TypstDiagnostic {
    pub severity: String,
    pub message: String,
    pub line: Option<u32>,
    pub col: Option<u32>,
    pub hints: Vec<String>,
}

fn diag_loc(world: &RenderWorld, d: &SourceDiagnostic) -> (Option<u32>, Option<u32>) {
    let Some(range) = world.range(d.span) else { return (None, None); };
    let Some(id) = d.span.id() else { return (None, None); };
    let Ok(src) = world.source(id) else { return (None, None); };
    let Some((line, col)) = src.lines().byte_to_line_column(range.start) else {
        return (None, None);
    };
    (Some(line as u32 + 1), Some(col as u32 + 1))
}

fn to_diag(world: &RenderWorld, d: &SourceDiagnostic) -> TypstDiagnostic {
    let (line, col) = diag_loc(world, d);
    TypstDiagnostic {
        severity: match d.severity { Severity::Error => "error", Severity::Warning => "warning" }.to_string(),
        message: d.message.to_string(),
        line,
        col,
        hints: d.hints.iter().map(|h| h.v.to_string()).collect(),
    }
}

// --- TypstPreview output (no more sync_spans) ---

#[derive(serde::Serialize)]
pub struct TypstPreview {
    pub pages_svg: Vec<String>,
    pub diagnostics: Vec<TypstDiagnostic>,
    pub pages: usize,
}

#[derive(serde::Serialize)]
pub struct SpanPosition {
    pub line: u32,
    pub col: u32,
}

#[derive(serde::Serialize)]
pub struct ForwardTarget {
    pub page: usize,
    pub x: f32,
    pub y: f32,
}

// --- Compilation cache ---

struct CompiledDoc {
    file_path: String,
    source: String,
    document: PagedDocument,
    world: RenderWorld,
}

static COMPILED_DOC: OnceLock<Mutex<Option<CompiledDoc>>> = OnceLock::new();

fn compiled_doc() -> &'static Mutex<Option<CompiledDoc>> {
    COMPILED_DOC.get_or_init(|| Mutex::new(None))
}

struct CompileResult {
    doc: Option<PagedDocument>,
    diagnostics: Vec<TypstDiagnostic>,
    pages_svg: Vec<String>,
    pages: usize,
}

fn compile_and_cache(
    file_path: &str,
    source: &str,
) -> (CompileResult, bool) {
    let world = match RenderWorld::new(file_path, source.to_string()) {
        Ok(w) => w,
        Err(e) => {
            return (CompileResult {
                doc: None,
                diagnostics: vec![TypstDiagnostic {
                    severity: "error".into(),
                    message: e,
                    line: None,
                    col: None,
                    hints: vec![],
                }],
                pages_svg: vec![],
                pages: 0,
            }, false);
        }
    };
    let Warned { output, warnings } = typst::compile::<PagedDocument>(&world);
    let warn_diags: Vec<TypstDiagnostic> = warnings.iter().map(|w| to_diag(&world, w)).collect();
    match output {
        Ok(doc) => {
            let num_pages = doc.pages().len();
            let opts = SvgOptions::default();
            let pages_svg: Vec<String> = doc.pages().iter().map(|p| svg(p, &opts)).collect();

            let mut cache = compiled_doc().lock().unwrap();
            *cache = Some(CompiledDoc {
                file_path: file_path.to_string(),
                source: source.to_string(),
                document: doc.clone(),
                world,
            });

            (CompileResult { doc: Some(doc), diagnostics: warn_diags, pages_svg, pages: num_pages }, true)
        }
        Err(errors) => {
            let mut diags = warn_diags;
            diags.extend(errors.iter().map(|e| to_diag(&world, e)));
            (CompileResult {
                doc: None,
                diagnostics: diags,
                pages_svg: vec![],
                pages: 0,
            }, false)
        }
    }
}

fn ensure_cached(file_path: &str, source: &str) -> bool {
    let needs_compile = {
        let cache = compiled_doc().lock().unwrap();
        match cache.as_ref() {
            Some(c) => c.file_path != file_path || c.source != source,
            None => true,
        }
    };
    if needs_compile {
        let world = match RenderWorld::new(file_path, source.to_string()) {
            Ok(w) => w,
            Err(_) => return false,
        };
        let Warned { output, .. } = typst::compile::<PagedDocument>(&world);
        match output {
            Ok(doc) => {
                let mut cache = compiled_doc().lock().unwrap();
                *cache = Some(CompiledDoc {
                    file_path: file_path.to_string(),
                    source: source.to_string(),
                    document: doc.clone(),
                    world,
                });
                true
            }
            Err(_) => false,
        }
    } else {
        true
    }
}

fn span_line_col(world: &RenderWorld, span: typst::syntax::Span) -> Option<(u32, u32)> {
    let range = world.range(span)?;
    let id = span.id()?;
    let src = world.source(id).ok()?;
    let (line, col) = src.lines().byte_to_line_column(range.start)?;
    Some((line as u32 + 1, col as u32 + 1))
}

fn nearest_source_position(
    world: &RenderWorld,
    frame: &typst::layout::Frame,
    click_x: f32,
    click_y: f32,
) -> Option<(u32, u32)> {
    let mut best: Option<(f32, u32, u32)> = None;

    for (point, item) in frame.items() {
        let ix = point.x.to_pt() as f32;
        let iy = point.y.to_pt() as f32;

        match item {
            FrameItem::Text(text) => {
                let mut cx = ix;
                for glyph in &text.glyphs {
                    let gx = cx + (glyph.x_offset.at(text.size).to_pt() as f32);
                    let gy = iy + (glyph.y_offset.at(text.size).to_pt() as f32);
                    let dx = gx - click_x;
                    let dy = gy - click_y;
                    let dist_sq = dx * dx + dy * dy;

                    if best.map_or(true, |(bd, _, _)| dist_sq < bd) {
                        if let Some(rc) = span_line_col(world, glyph.span.0) {
                            best = Some((dist_sq, rc.0, rc.1));
                        }
                    }

                    cx += glyph.x_advance.at(text.size).to_pt() as f32;
                }
            }
            FrameItem::Shape(_, span) | FrameItem::Image(_, _, span) => {
                let dx = ix - click_x;
                let dy = iy - click_y;
                let dist_sq = dx * dx + dy * dy;
                if best.map_or(true, |(bd, _, _)| dist_sq < bd) {
                    if let Some(rc) = span_line_col(world, *span) {
                        best = Some((dist_sq, rc.0, rc.1));
                    }
                }
            }
            FrameItem::Group(group) => {
                if let Some((line, col)) =
                    nearest_source_position(world, &group.frame, click_x - ix, click_y - iy)
                {
                    if best.is_none() {
                        best = Some((0.0, line, col));
                    }
                }
            }
            _ => {}
        }
    }

    best.map(|(_, line, col)| (line, col))
}

fn find_forward_target(
    world: &RenderWorld,
    document: &PagedDocument,
    target_line: u32,
) -> Option<ForwardTarget> {
    for (page_idx, page) in document.pages().iter().enumerate() {
        let result = find_forward_in_frame(world, &page.frame, target_line, page_idx);
        if let Some(target) = result {
            return Some(target);
        }
    }
    None
}

fn find_forward_in_frame(
    world: &RenderWorld,
    frame: &typst::layout::Frame,
    target_line: u32,
    page_idx: usize,
) -> Option<ForwardTarget> {
    for (point, item) in frame.items() {
        let ix = point.x.to_pt() as f32;
        let iy = point.y.to_pt() as f32;

        match item {
            FrameItem::Text(text) => {
                let mut cx = ix;
                for glyph in &text.glyphs {
                    if let Some((line, _)) = span_line_col(world, glyph.span.0) {
                        if line == target_line {
                            let gx = cx + (glyph.x_offset.at(text.size).to_pt() as f32);
                            let gy = iy + (glyph.y_offset.at(text.size).to_pt() as f32);
                            return Some(ForwardTarget { page: page_idx, x: gx, y: gy });
                        }
                    }
                    cx += glyph.x_advance.at(text.size).to_pt() as f32;
                }
            }
            FrameItem::Shape(_, span) | FrameItem::Image(_, _, span) => {
                if let Some((line, _)) = span_line_col(world, *span) {
                    if line == target_line {
                        return Some(ForwardTarget { page: page_idx, x: ix, y: iy });
                    }
                }
            }
            FrameItem::Group(group) => {
                let child = find_forward_in_frame(world, &group.frame, target_line, page_idx);
                if child.is_some() {
                    return child;
                }
            }
            _ => {}
        }
    }
    None
}

// --- Commands ---

#[tauri::command]
pub async fn typst_preview(file_path: String, source: String) -> Result<TypstPreview, String> {
    let (result, _) = compile_and_cache(&file_path, &source);
    Ok(TypstPreview { pages_svg: result.pages_svg, diagnostics: result.diagnostics, pages: result.pages })
}

#[tauri::command]
pub async fn typst_resolve_span(
    file_path: String,
    source: String,
    page: usize,
    x: f32,
    y: f32,
) -> Result<Option<SpanPosition>, String> {
    ensure_cached(&file_path, &source);
    let cache = compiled_doc().lock().unwrap();
    let Some(ref cached) = *cache else { return Ok(None); };
    let frame = match cached.document.pages().get(page) {
        Some(p) => &p.frame,
        None => return Ok(None),
    };
    let result = nearest_source_position(&cached.world, frame, x, y);
    Ok(result.map(|(line, col)| SpanPosition { line, col }))
}

#[tauri::command]
pub async fn typst_forward_line(
    file_path: String,
    source: String,
    line: u32,
) -> Result<Option<ForwardTarget>, String> {
    ensure_cached(&file_path, &source);
    let cache = compiled_doc().lock().unwrap();
    let Some(ref cached) = *cache else { return Ok(None); };
    Ok(find_forward_target(&cached.world, &cached.document, line))
}

#[tauri::command]
pub async fn typst_export_pdf(
    file_path: String,
    source: String,
    path: String,
) -> Result<(), String> {
    let (result, ok) = compile_and_cache(&file_path, &source);
    if !ok {
        return Err(result.diagnostics.into_iter().map(|d| d.message).collect::<Vec<_>>().join("; "));
    }
    let doc = result.doc.unwrap();
    let bytes = typst_pdf::pdf(&doc, &PdfOptions::default()).map_err(|errors| {
        errors
            .into_iter()
            .map(|d| d.message.to_string())
            .collect::<Vec<_>>()
            .join("\n")
    })?;
    fs::write(&path, bytes).map_err(|e| format!("failed to write PDF: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_ok_returns_svg() {
        let path = std::env::temp_dir().join("az_typst_ok.typ");
        let res = futures::executor::block_on(typst_preview(
            path.to_string_lossy().into_owned(),
            "Hello world\n".into(),
        ))
        .expect("command should not hard-error");
        assert!(!res.pages_svg.is_empty(), "valid source must yield SVGs");
        assert!(res.pages >= 1, "valid source must have at least one page");
    }

    #[test]
    fn preview_error_is_structured_with_location() {
        let path = std::env::temp_dir().join("az_typst_err.typ");
        let res = futures::executor::block_on(typst_preview(
            path.to_string_lossy().into_owned(),
            "ok line\n#undefined_var\n".into(),
        ))
        .expect("command should not hard-error");
        assert!(res.pages_svg.is_empty(), "compile failure must yield no SVGs");
        assert!(!res.diagnostics.is_empty(), "must report at least one diagnostic");
        let d = &res.diagnostics[0];
        assert_eq!(d.severity, "error");
        assert_eq!(d.line, Some(2), "error is on line 2 (1-indexed)");
        assert!(d.col.is_some(), "must report a column");
    }

    #[test]
    fn resolve_span_returns_line_col() {
        let path = std::env::temp_dir().join("az_typst_resolve.typ");
        let source = "Hello\nWorld\n".to_string();

        let _preview = futures::executor::block_on(typst_preview(
            path.to_string_lossy().into_owned(),
            source.clone(),
        ))
        .expect("preview should succeed");

        let result = futures::executor::block_on(typst_resolve_span(
            path.to_string_lossy().into_owned(),
            source,
            0,
            10.0,
            10.0,
        ))
        .expect("resolve should not hard-error");
        assert!(result.is_some(), "should find a span near (10, 10)");
        let pos = result.unwrap();
        assert!(pos.line >= 1, "line must be 1-indexed");
        assert!(pos.col >= 1, "col must be 1-indexed");
    }

    #[test]
    fn forward_line_returns_target() {
        let path = std::env::temp_dir().join("az_typst_forward.typ");
        let source = "First line\nSecond line\nThird line\n".to_string();

        let _preview = futures::executor::block_on(typst_preview(
            path.to_string_lossy().into_owned(),
            source.clone(),
        ))
        .expect("preview should succeed");

        let result = futures::executor::block_on(typst_forward_line(
            path.to_string_lossy().into_owned(),
            source,
            2,
        ))
        .expect("forward should not hard-error");
        assert!(result.is_some(), "should find line 2");
        let target = result.unwrap();
        assert_eq!(target.page, 0, "should be on first page");
        assert!(target.x >= 0.0, "x should be non-negative");
        assert!(target.y >= 0.0, "y should be non-negative");
    }
}
