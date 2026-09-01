use std::fs;

pub fn parse_file(path: &str) -> Result<String, String> {
    let ext = path
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "pdf" => parse_pdf(path),
        "docx" => parse_docx(path),
        "md" | "markdown" | "txt" => parse_text(path),
        other => Err(format!("Unsupported file type: .{}", other)),
    }
}

fn parse_pdf(path: &str) -> Result<String, String> {
    let content = pdf_extract::extract_text(path)
        .map_err(|e| format!("Failed to extract PDF text: {e}"))?;
    Ok(content)
}

fn parse_docx(path: &str) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read docx: {e}"))?;
    let docx = docx_rs::read_docx(&bytes)
        .map_err(|e| format!("Failed to parse docx: {e}"))?;

    let mut text = String::new();
    for (idx, child) in docx.document.children.iter().enumerate() {
        let _ = idx;
        if let docx_rs::DocumentChild::Paragraph(p) = child {
            let line: Vec<String> = p
                .children
                .iter()
                .filter_map(|c| match c {
                    docx_rs::ParagraphChild::Run(r) => {
                        let mut s = String::new();
                        for child in &r.children {
                            match child {
                                docx_rs::RunChild::Text(t) => s.push_str(t.text.as_str()),
                                _ => {}
                            }
                        }
                        Some(s)
                    }
                    _ => None,
                })
                .collect();
            text.push_str(&line.join(" "));
            text.push('\n');
        }
    }
    Ok(text)
}

fn parse_text(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("Failed to read file: {e}"))
}
