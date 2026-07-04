use std::fs;
use std::path::{Path, PathBuf};

use typst::diag::{FileError, FileResult, Severity, SourceDiagnostic, Warned};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::layout::Abs;
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, WorldExt};
use typst::World;

use typst_layout::PagedDocument;
use typst_kit::fonts::{FontStore, embedded, system};
use typst_pdf::PdfOptions;
use typst_svg::{svg_merged, SvgOptions};

// Résolution cross-plateforme des dossiers de packages Typst via le crate `dirs`
// (condition essentielle Windows). data_dir : Linux ~/.local/share, macOS
// ~/Library/Application Support, Windows %APPDATA%. cache_dir : Linux ~/.cache,
// macOS ~/Library/Caches, Windows %LOCALAPPDATA%.
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

fn compile(file_path: &str, source: String) -> Result<(PagedDocument, Warned<()>), String> {
    let world = RenderWorld::new(file_path, source)?;
    let Warned { output, warnings } = typst::compile::<PagedDocument>(&world);
    let doc = output.map_err(|errors| {
        errors
            .into_iter()
            .map(|d| d.message.to_string())
            .collect::<Vec<_>>()
            .join("\n")
    })?;
    Ok((doc, Warned { output: (), warnings }))
}

#[derive(serde::Serialize)]
pub struct TypstDiagnostic {
    pub severity: String,
    pub message: String,
    pub line: Option<u32>,
    pub col: Option<u32>,
    pub hints: Vec<String>,
}

#[derive(serde::Serialize)]
pub struct TypstPreview {
    pub svg: Option<String>,
    pub diagnostics: Vec<TypstDiagnostic>,
    pub pages: usize,
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

#[tauri::command]
pub fn typst_preview(file_path: String, source: String) -> Result<TypstPreview, String> {
    let world = RenderWorld::new(&file_path, source)?;
    let Warned { output, warnings } = typst::compile::<PagedDocument>(&world);
    let warn_diags: Vec<TypstDiagnostic> = warnings.iter().map(|w| to_diag(&world, w)).collect();
    match output {
        Ok(doc) => {
            let pages = doc.pages().len();
            let svg = svg_merged(&doc, &SvgOptions::default(), Abs::zero());
            Ok(TypstPreview { svg: Some(svg), diagnostics: warn_diags, pages })
        }
        Err(errors) => {
            let mut diags = warn_diags;
            diags.extend(errors.iter().map(|e| to_diag(&world, e)));
            Ok(TypstPreview { svg: None, diagnostics: diags, pages: 0 })
        }
    }
}

#[tauri::command]
pub fn typst_render(file_path: String, source: String) -> Result<String, String> {
    let (doc, _) = compile(&file_path, source)?;
    let svg = svg_merged(&doc, &SvgOptions::default(), Abs::zero());
    Ok(svg)
}

#[tauri::command]
pub fn typst_export_pdf(
    file_path: String,
    source: String,
    path: String,
) -> Result<(), String> {
    let (doc, _) = compile(&file_path, source)?;
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

#[tauri::command]
pub fn typst_page_count(file_path: String, source: String) -> Result<usize, String> {
    let (doc, _) = compile(&file_path, source)?;
    Ok(doc.pages().len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_ok_returns_svg() {
        let path = std::env::temp_dir().join("az_typst_ok.typ");
        let res = typst_preview(path.to_string_lossy().into_owned(), "Hello world\n".into())
            .expect("command should not hard-error");
        assert!(res.svg.is_some(), "valid source must yield an SVG");
        assert!(res.pages >= 1, "valid source must have at least one page");
    }

    #[test]
    fn preview_error_is_structured_with_location() {
        let path = std::env::temp_dir().join("az_typst_err.typ");
        let res = typst_preview(path.to_string_lossy().into_owned(), "ok line\n#undefined_var\n".into())
            .expect("command should not hard-error");
        assert!(res.svg.is_none(), "compile failure must yield no SVG");
        assert!(!res.diagnostics.is_empty(), "must report at least one diagnostic");
        let d = &res.diagnostics[0];
        assert_eq!(d.severity, "error");
        assert_eq!(d.line, Some(2), "error is on line 2 (1-indexed)");
        assert!(d.col.is_some(), "must report a column");
    }
}
