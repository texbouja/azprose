use std::path::Path;
use std::process::Command;
use serde::Serialize;

#[derive(Serialize)]
pub struct SynctexForwardResult {
    pub page: u32,
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize)]
pub struct SynctexInverseResult {
    pub file: String,
    pub line: u32,
}

fn parse_synctex_output(output: &str) -> Result<(f64, f64, u32), String> {
    let mut page: Option<u32> = None;
    let mut x: Option<f64> = None;
    let mut y: Option<f64> = None;
    let mut in_result = false;

    for line in output.lines() {
        if line.contains("SyncTeX result begin") {
            in_result = true;
            continue;
        }
        if line.contains("SyncTeX result end") {
            break;
        }
        if !in_result { continue; }

        let pos = line.find(':').ok_or_else(|| "malformed synctex output".to_string())?;
        let key = &line[..pos];
        let value = line[pos + 1..].trim();
        match key {
            "Page" => page = value.parse::<u32>().ok(),
            "x" => x = value.parse::<f64>().ok(),
            "y" => y = value.parse::<f64>().ok(),
            _ => {}
        }
    }

    match (page, x, y) {
        (Some(p), Some(xv), Some(yv)) => Ok((xv, yv, p)),
        _ => Err("incomplete synctex result".to_string()),
    }
}

#[tauri::command]
pub async fn synctex_forward(
    tex_path: String,
    pdf_path: String,
    line: u32,
    col: u32,
) -> Result<SynctexForwardResult, String> {
    let pdf_dir = Path::new(&pdf_path)
        .parent()
        .ok_or_else(|| "invalid PDF path".to_string())?;

    let args = [
        "view",
        "-i",
        &format!("{line}:{col}:{tex_path}"),
        "-o",
        &pdf_path,
    ];

    let output = Command::new("synctex")
        .args(&args)
        .current_dir(pdf_dir)
        .output()
        .map_err(|e| format!("failed to run synctex: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("synctex failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let (x, y, page) = parse_synctex_output(&stdout)?;

    Ok(SynctexForwardResult { page, x, y })
}

#[tauri::command]
pub async fn synctex_inverse(
    pdf_path: String,
    page: u32,
    x: f64,
    y: f64,
) -> Result<SynctexInverseResult, String> {
    let pdf_dir = Path::new(&pdf_path)
        .parent()
        .ok_or_else(|| "invalid PDF path".to_string())?;

    let args = [
        "edit",
        "-o",
        &format!("{page}:{x}:{y}:{pdf_path}"),
    ];

    eprintln!("[synctex] synctex edit -o {page}:{x}:{y}:{pdf_path}");
    let output = Command::new("synctex")
        .args(&args)
        .current_dir(pdf_dir)
        .output()
        .map_err(|e| format!("failed to run synctex: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("[synctex] stderr: {stderr}");
        return Err(format!("synctex failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    eprintln!("[synctex] stdout:\n{stdout}");
    
    let mut in_result = false;
    let mut file: Option<String> = None;
    let mut line_num: Option<u32> = None;

    for line_str in stdout.lines() {
        if line_str.contains("SyncTeX result begin") {
            in_result = true;
            continue;
        }
        if line_str.contains("SyncTeX result end") {
            break;
        }
        if !in_result { continue; }

        let pos = line_str.find(':').ok_or_else(|| "malformed synctex output".to_string())?;
        let key = &line_str[..pos];
        let value = line_str[pos + 1..].trim();
        
        match key {
            "Input" => {
                let normalized = value.replace('\\', "/");
                let clean: String = normalized.split('/')
                    .filter(|s| !s.is_empty() && *s != ".")
                    .collect::<Vec<_>>()
                    .join("/");
                let clean = if value.starts_with('/') { format!("/{clean}") } else { clean };
                file = Some(clean.clone());
                eprintln!("[synctex] Input: {clean}");
            },
            "Line" => {
                line_num = value.parse::<u32>().ok();
                eprintln!("[synctex] Line: {:?}", line_num);
            },
            _ => {},
        }
    }

    match (file.clone(), line_num) {
        (Some(f), Some(l)) => {
            eprintln!("[synctex] Result: file={f} line={l}");
            Ok(SynctexInverseResult { file: f, line: l })
        },
        _ => {
            eprintln!("[synctex] Incomplete result: file={:?} line={:?}", file, line_num);
            Err("incomplete synctex result".to_string())
        },
    }
}
