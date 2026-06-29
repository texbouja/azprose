use std::fs;

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

struct RenderWorld {
    library: LazyHash<Library>,
    font_store: FontStore,
    source: Source,
}

impl RenderWorld {
    fn new(source_text: String) -> Self {
        let vpath = VirtualPath::new("main.typ").expect("valid virtual path");
        let rooted = RootedPath::new(VirtualRoot::Project, vpath);
        let source = Source::new(rooted.intern(), source_text);

        let mut font_store = FontStore::new();
        font_store.extend(embedded());
        font_store.extend(system());

        Self {
            library: LazyHash::new(Library::default()),
            font_store,
            source,
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
            Ok(self.source.clone())
        } else {
            Err(FileError::AccessDenied)
        }
    }

    fn file(&self, _id: FileId) -> FileResult<Bytes> {
        Err(FileError::AccessDenied)
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.font_store.font(index)
    }

    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        None
    }
}

fn compile(source: String) -> Result<(PagedDocument, Warned<()>), String> {
    let world = RenderWorld::new(source);
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
pub fn typst_render(source: String) -> Result<String, String> {
    let (doc, _) = compile(source)?;
    let svg = svg_merged(&doc, &SvgOptions::default(), Abs::zero());
    Ok(svg)
}

#[tauri::command]
pub fn typst_export_pdf(source: String, path: String) -> Result<(), String> {
    let (doc, _) = compile(source)?;
    let bytes = typst_pdf::pdf(&doc, &PdfOptions::default())
        .map_err(|errors| {
            errors
                .into_iter()
                .map(|d| d.message.to_string())
                .collect::<Vec<_>>()
                .join("\n")
        })?;
    fs::write(&path, bytes).map_err(|e| format!("failed to write PDF: {e}"))?;
    Ok(())
}
