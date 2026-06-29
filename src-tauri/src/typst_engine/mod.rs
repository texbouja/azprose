use std::fs;
use std::path::{Path, PathBuf};

use typst::diag::{FileError, FileResult, Warned};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::layout::Abs;
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt};
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
