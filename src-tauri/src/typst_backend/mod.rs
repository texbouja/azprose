//! Backend Typst : compilation PDF et SVG preview via `typst` CLI

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tokio::process::Command;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct TypstDiagnostic {
    pub severity: String,
    pub message: String,
    pub line: Option<usize>,
    pub col: Option<usize>,
    pub hints: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TypstPreview {
    pub pages_svg: Vec<String>,
    pub diagnostics: Vec<TypstDiagnostic>,
    pub pages: usize,
}

// ---------------------------------------------------------------------------
// Sidecar binary resolution
// ---------------------------------------------------------------------------

fn resolve_binary(name: &str) -> String {
    name.to_string()
}

// ---------------------------------------------------------------------------
// Temp file helpers
// ---------------------------------------------------------------------------

fn write_temp_source(source: &str) -> Result<(PathBuf, PathBuf), String> {
    let dir = std::env::temp_dir().join(format!("azprose-typst-{}", std::process::id()));
    fs::create_dir_all(&dir).map_err(|e| format!("temp dir: {e}"))?;
    let src = dir.join("input.typ");
    let mut f = fs::File::create(&src).map_err(|e| format!("create temp file: {e}"))?;
    f.write_all(source.as_bytes()).map_err(|e| format!("write temp file: {e}"))?;
    Ok((src, dir))
}

// ---------------------------------------------------------------------------
// Stderr → diagnostics
// ---------------------------------------------------------------------------

fn parse_stderr(stderr: &str) -> Vec<TypstDiagnostic> {
    let mut diags = Vec::new();
    for line in stderr.lines() {
        let t = line.trim();
        if t.is_empty() { continue; }
        let severity = if t.contains("error") { "error" }
                      else if t.contains("warning") { "warning" }
                      else { "info" };
        diags.push(TypstDiagnostic {
            severity: severity.to_string(),
            message: line.to_string(),
            line: None,
            col: None,
            hints: vec![],
        });
    }
    diags
}

// ---------------------------------------------------------------------------
// Compilation PDF via `typst compile`
// ---------------------------------------------------------------------------

async fn typst_compile(source_path: &str, output_path: &str) -> Result<(), String> {
    let bin = resolve_binary("typst");
    let output = Command::new(&bin)
        .args(["compile", source_path, output_path])
        .output()
        .await
        .map_err(|e| format!("failed to spawn typst: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("typst compile failed:\n{stderr}"))
    }
}

// ---------------------------------------------------------------------------
// SVG preview (compile to SVG, split pages)
// ---------------------------------------------------------------------------

async fn typst_compile_svg(source_path: &str, temp_dir: &Path) -> Result<(Vec<String>, Vec<TypstDiagnostic>), String> {
    let bin = resolve_binary("typst");
    let template = temp_dir.join("page-{p}.svg");
    let output = Command::new(&bin)
        .args(["compile", source_path, template.to_string_lossy().as_ref(), "--format", "svg"])
        .output()
        .await
        .map_err(|e| format!("failed to spawn typst: {e}"))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let diagnostics = parse_stderr(&stderr);

    if !output.status.success() {
        return Err(format!("typst compile svg failed:\n{stderr}"));
    }

    let mut pages = Vec::new();
    for i in 1.. {
        let page_path = temp_dir.join(format!("page-{i}.svg"));
        if !page_path.exists() { break; }
        let svg = fs::read_to_string(&page_path)
            .map_err(|e| format!("read page {i}: {e}"))?;
        pages.push(svg);
    }

    if pages.is_empty() {
        let fallback = fs::read_to_string(&template)
            .map_err(|e| format!("read single-page svg: {e}"))?;
        pages.push(fallback);
    }

    Ok((pages, diagnostics))
}

// ---------------------------------------------------------------------------
// Commandes Tauri
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn typst_sidecar_export_pdf(
    file_path: String,
    source: String,
    path: String,
) -> Result<(), String> {
    let src = if Path::new(&file_path).exists() {
        file_path
    } else {
        let (tmp, _dir) = write_temp_source(&source)?;
        tmp.to_string_lossy().to_string()
    };
    typst_compile(&src, &path).await
}

#[tauri::command]
pub async fn typst_sidecar_preview(
    file_path: String,
    source: String,
) -> Result<TypstPreview, String> {
    let temp_dir = std::env::temp_dir().join(format!("azprose-preview-{}", std::process::id()));
    fs::create_dir_all(&temp_dir).map_err(|e| format!("temp dir: {e}"))?;

    let src_path = if Path::new(&file_path).exists() {
        file_path
    } else {
        let (tmp, _dir) = write_temp_source(&source)?;
        tmp.to_string_lossy().to_string()
    };

    let (pages, diagnostics) = typst_compile_svg(&src_path, &temp_dir).await?;

    let count = pages.len();
    Ok(TypstPreview {
        pages_svg: pages,
        diagnostics,
        pages: count,
    })
}


