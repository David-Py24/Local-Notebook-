//! Markdown -> PDF export for the Agent tools (AGENT_MEMORY_RAG_PLAN.md, Phase 2b).
//!
//! Uses `printpdf` 0.7 with its builtin Type1 (base-14) fonts so no font file has to
//! ship with the app. Only a pragmatic Markdown subset is rendered: headings, paragraphs,
//! lists, blockquotes, fenced/inline code, horizontal rules and tables-as-text. The whole
//! layout is measured in millimetres from the top of each A4 page; `printpdf` coordinates
//! are mm from the bottom-left, so `y_top` is converted when writing.

use printpdf::{
    BuiltinFont, Color, Greyscale, IndirectFontRef, Line, Mm, PdfDocument,
    PdfDocumentReference, PdfLayerIndex, PdfPageIndex, Point,
};

const PAGE_W_MM: f32 = 210.0;
const PAGE_H_MM: f32 = 297.0;
const MARGIN_MM: f32 = 16.0;
const BOTTOM_MARGIN_MM: f32 = 18.0;

const BODY_PT: f32 = 10.5;
const CODE_PT: f32 = 8.5;
const H1_PT: f32 = 20.0;
const H2_PT: f32 = 15.0;
const H3_PT: f32 = 12.0;

struct Fonts {
    regular: IndirectFontRef,
    bold: IndirectFontRef,
    italic: IndirectFontRef,
    mono: IndirectFontRef,
}

/// Converts a rust string into something the builtin fonts can encode (roughly
/// Windows-1252). Unsupported characters are dropped; common typographic characters
/// are transliterated so the output stays readable.
fn to_windows_1252(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '\u{20}'..='\u{7F}' | '\u{A0}'..='\u{FF}' => out.push(ch),
            '\u{2013}' | '\u{2014}' => out.push('-'),
            '\u{2018}' | '\u{2019}' | '\u{201A}' => out.push('\''),
            '\u{201C}' | '\u{201D}' | '\u{201E}' => out.push('"'),
            '\u{2026}' => out.push_str("..."),
            '\u{2022}' | '\u{2011}' | '\u{2010}' => out.push('-'),
            _ => {}
        }
    }
    out
}

fn find(chars: &[char], start: usize, needle: char) -> Option<usize> {
    chars[start..].iter().position(|c| *c == needle).map(|p| p + start)
}

/// Strips markdown inline syntax (links, images, emphasis, inline code, html) leaving
/// readable plain text.
fn inline_clean(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let n = chars.len();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < n {
        match chars[i] {
            '\\' => {
                if i + 1 < n {
                    out.push(chars[i + 1]);
                    i += 2;
                } else {
                    i += 1;
                }
            }
            '[' => {
                if let Some(close) = find(&chars, i + 1, ']') {
                    let label: String = chars[i + 1..close].iter().collect();
                    if close + 1 < n && chars[close + 1] == '(' {
                        if let Some(end) = find(&chars, close + 2, ')') {
                            let url: String = chars[close + 2..end].iter().collect();
                            out.push_str(&label);
                            if !url.is_empty()
                                && !url.starts_with('#')
                                && url != label
                                && !url.contains(' ')
                            {
                                let display = url
                                    .trim_start_matches("https://")
                                    .trim_start_matches("http://");
                                out.push_str(" (");
                                out.push_str(display);
                                out.push(')');
                            }
                            i = end + 1;
                            continue;
                        }
                    }
                    out.push_str(&label);
                    i = close + 1;
                    continue;
                }
                out.push('[');
                i += 1;
            }
            '*' | '_' | '~' => {
                let c = chars[i];
                let mut run = 0;
                while i + run < n && chars[i + run] == c {
                    run += 1;
                }
                i += run;
            }
            '`' => {
                let mut run = 0;
                while i + run < n && chars[i + run] == '`' {
                    run += 1;
                }
                let mut end = None;
                let mut j = i + run;
                while j + run <= n {
                    if (j..j + run).all(|k| chars[k] == '`') {
                        end = Some(j);
                        break;
                    }
                    j += 1;
                }
                match end {
                    Some(e) => {
                        for k in i + run..e {
                            out.push(chars[k]);
                        }
                        i = e + run;
                    }
                    None => i += run,
                }
            }
            '<' => {
                if let Some(close) = find(&chars, i + 1, '>') {
                    let inner: String = chars[i + 1..close].iter().collect();
                    let looks_like_tag = inner
                        .chars()
                        .next()
                        .map_or(false, |c| c.is_ascii_alphabetic() || c == '/');
                    if looks_like_tag {
                        i = close + 1;
                        continue;
                    }
                }
                out.push('<');
                i += 1;
            }
            _ => {
                out.push(chars[i]);
                i += 1;
            }
        }
    }
    out
}

/// Word-based wrapping for prose. `max_chars` is an estimate of chars fitting the line.
fn wrap_words(text: &str, max_chars: usize) -> Vec<String> {
    let mut lines = Vec::new();
    for raw in text.split('\n') {
        let mut current = String::new();
        for word in raw.split_whitespace() {
            let word_len = word.chars().count();
            if word_len > max_chars {
                if !current.is_empty() {
                    lines.push(std::mem::take(&mut current));
                }
                let mut frag = String::new();
                for ch in word.chars() {
                    if frag.chars().count() == max_chars {
                        lines.push(std::mem::take(&mut frag));
                    }
                    frag.push(ch);
                }
                if !frag.is_empty() {
                    current = frag;
                }
                continue;
            }
            if current.is_empty() {
                current.push_str(word);
            } else if current.chars().count() + 1 + word_len <= max_chars {
                current.push(' ');
                current.push_str(word);
            } else {
                lines.push(std::mem::take(&mut current));
                current.push_str(word);
            }
        }
        if !current.is_empty() {
            lines.push(current);
        }
    }
    lines
}

/// Hard character-based wrapping for code lines (preserves blank lines).
fn wrap_hard(text: &str, max_chars: usize) -> Vec<String> {
    let mut lines = Vec::new();
    for raw in text.split('\n') {
        if raw.is_empty() {
            lines.push(String::new());
            continue;
        }
        let mut buf = String::new();
        for ch in raw.chars() {
            if buf.chars().count() == max_chars {
                lines.push(std::mem::take(&mut buf));
            }
            buf.push(ch);
        }
        lines.push(buf);
    }
    lines
}

fn chars_per_line(size_pt: f32, monospace: bool) -> usize {
    let width_pt = (PAGE_W_MM - 2.0 * MARGIN_MM) as f32 * 72.0 / 25.4;
    let avg = if monospace { 0.6 } else { 0.53 };
    ((width_pt / (avg * size_pt)) as usize).max(20)
}

fn line_h_mm(size_pt: f32) -> f32 {
    (size_pt * 1.4 * 25.4 / 72.0).max(4.0)
}

fn put_text(
    doc: &PdfDocumentReference,
    page: PdfPageIndex,
    layer_idx: PdfLayerIndex,
    font: &IndirectFontRef,
    text: &str,
    size_pt: f32,
    x_mm: f32,
    y_top_mm: f32,
) {
    let layer = doc.get_page(page).get_layer(layer_idx);
    layer.use_text(
        to_windows_1252(text),
        size_pt,
        Mm(x_mm),
        Mm(PAGE_H_MM - y_top_mm),
        font,
    );
}

/// Returns the next y-after-advance; starts a fresh page when there isn't enough room.
fn draw_lines(
    doc: &PdfDocumentReference,
    page: &mut PdfPageIndex,
    layer_idx: &mut PdfLayerIndex,
    font: &IndirectFontRef,
    size_pt: f32,
    x_mm: f32,
    y_top_mm: &mut f32,
    wrapped: Vec<String>,
) {
    let line_h = line_h_mm(size_pt);
    for line in wrapped {
        if *y_top_mm + line_h > PAGE_H_MM - BOTTOM_MARGIN_MM {
            let (p, l) = doc.add_page(Mm(PAGE_W_MM), Mm(PAGE_H_MM), "note");
            *page = p;
            *layer_idx = l;
            *y_top_mm = MARGIN_MM;
        }
        put_text(doc, *page, *layer_idx, font, &line, size_pt, x_mm, *y_top_mm);
        *y_top_mm += line_h;
    }
}

fn draw_rule(
    doc: &PdfDocumentReference,
    page: PdfPageIndex,
    layer_idx: PdfLayerIndex,
    y_top_mm: f32,
) {
    let layer = doc.get_page(page).get_layer(layer_idx);
    layer.set_outline_color(Color::Greyscale(Greyscale::new(0.55, None)));
    layer.set_outline_thickness(0.6);
    let y = PAGE_H_MM - (y_top_mm + 2.0);
    layer.add_line(Line {
        points: vec![
            (Point::new(Mm(MARGIN_MM), Mm(y)), false),
            (Point::new(Mm(PAGE_W_MM - MARGIN_MM), Mm(y)), false),
        ],
        is_closed: false,
    });
}

/// Renders a markdown doc to PDF bytes on A4. `title` becomes the PDF document title.
pub fn render_markdown_to_pdf_bytes(title: &str, content: &str) -> Result<Vec<u8>, String> {
    let (doc, page0, layer0) = PdfDocument::new(title, Mm(PAGE_W_MM), Mm(PAGE_H_MM), "note");
    let fonts = Fonts {
        regular: doc.add_builtin_font(BuiltinFont::Helvetica).map_err(|e| e.to_string())?,
        bold: doc.add_builtin_font(BuiltinFont::HelveticaBold).map_err(|e| e.to_string())?,
        italic: doc.add_builtin_font(BuiltinFont::HelveticaOblique).map_err(|e| e.to_string())?,
        mono: doc.add_builtin_font(BuiltinFont::Courier).map_err(|e| e.to_string())?,
    };

    let mut page = page0;
    let mut layer = layer0;
    let mut y_top = MARGIN_MM;

    let raw_lines: Vec<&str> = content.split('\n').collect();
    let mut i = 0;
    let mut in_code = false;
    while i < raw_lines.len() {
        let raw = raw_lines[i];
        let trimmed = raw.trim();

        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_code = !in_code;
            y_top += 1.5;
            i += 1;
            continue;
        }

        if in_code {
            draw_lines(
                &doc, &mut page, &mut layer, &fonts.mono, CODE_PT, MARGIN_MM, &mut y_top,
                wrap_hard(raw, chars_per_line(CODE_PT, true)),
            );
            i += 1;
            continue;
        }

        if trimmed.is_empty() {
            y_top += 2.0;
            i += 1;
            continue;
        }

        // Horizontal rule: ---, *** or ___
        if (trimmed.starts_with("---")
            || trimmed.starts_with("***")
            || trimmed.starts_with("___"))
            && trimmed.trim_matches(['-', '*', '_', ' ']).is_empty()
        {
            draw_rule(&doc, page, layer, y_top);
            y_top += 6.0;
            i += 1;
            continue;
        }

        // Table separator row (|-...-|) — skip.
        if trimmed.starts_with('|')
            && trimmed.trim_matches(['|', '-', ':', ' ', '\t']).is_empty()
        {
            i += 1;
            continue;
        }

        // Heading.
        let hashes = trimmed.chars().take_while(|c| *c == '#').count();
        if hashes >= 1 && hashes <= 4 {
            let size = match hashes {
                1 => H1_PT,
                2 => H2_PT,
                _ => H3_PT,
            };
            let title_text = inline_clean(trimmed[hashes..].trim());
            y_top += size * 0.35;
            draw_lines(
                &doc, &mut page, &mut layer, &fonts.bold, size, MARGIN_MM, &mut y_top,
                wrap_words(&title_text, chars_per_line(size, false)),
            );
            y_top += 2.0;
            i += 1;
            continue;
        }

        // Blockquote.
        if trimmed.starts_with('>') {
            let text = inline_clean(trimmed.trim_start_matches('>').trim());
            let content = format!("│ {text}");
            draw_lines(
                &doc, &mut page, &mut layer, &fonts.italic, BODY_PT, MARGIN_MM + 3.0, &mut y_top,
                wrap_words(&content, chars_per_line(BODY_PT, false)),
            );
            i += 1;
            continue;
        }

        // Bullet list item.
        if let Some(rest) = trimmed
            .strip_prefix("- ")
            .or_else(|| trimmed.strip_prefix("+ "))
            .or_else(|| trimmed.strip_prefix("* "))
        {
            let indent = (raw.len() - raw.trim_start().len()) as f32 * 3.0;
            let text = inline_clean(rest.trim());
            let content = format!("• {text}");
            draw_lines(
                &doc, &mut page, &mut layer, &fonts.regular, BODY_PT, MARGIN_MM + indent, &mut y_top,
                wrap_words(&content, chars_per_line(BODY_PT, false)),
            );
            i += 1;
            continue;
        }

        // Ordered list item.
        if let Some(idx) = raw.find(|c: char| c == ' ' || c == '\t') {
            let prefix = &raw[..idx];
            if !prefix.is_empty()
                && prefix.chars().all(|c| c.is_ascii_digit() || c == '.' || c == ')')
                && prefix.chars().any(|c| c.is_ascii_digit())
            {
                let text = inline_clean(raw[idx..].trim());
                let content = format!("{prefix} {text}");
                draw_lines(
                    &doc, &mut page, &mut layer, &fonts.regular, BODY_PT, MARGIN_MM, &mut y_top,
                    wrap_words(&content, chars_per_line(BODY_PT, false)),
                );
                i += 1;
                continue;
            }
        }

        // Plain paragraph (also handles table rows as text).
        let text = inline_clean(raw.trim());
        draw_lines(
            &doc, &mut page, &mut layer, &fonts.regular, BODY_PT, MARGIN_MM, &mut y_top,
            wrap_words(&text, chars_per_line(BODY_PT, false)),
        );
        i += 1;
    }

    doc.save_to_bytes().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_pdf_with_header_and_eof() {
        let bytes = render_markdown_to_pdf_bytes("Test", "# Hello\n\nWorld **bold** and `code`.")
            .expect("render should succeed");
        assert!(bytes.starts_with(b"%PDF-"));
        assert!(bytes.windows(5).any(|w| w == b"%%EOF"));
    }

    #[test]
    fn wraps_long_paragraph_without_panicking() {
        let long = format!("# Title\n\n{}", "word ".repeat(400));
        let bytes = render_markdown_to_pdf_bytes("Long", &long).expect("render succeeds");
        assert!(bytes.starts_with(b"%PDF-"));
    }

    #[test]
    fn transliterates_non_latin1_typography() {
        assert_eq!(to_windows_1252("a — b • c …"), "a - b - c ...");
        assert_eq!(to_windows_1252("“quote” `tick`"), "\"quote\" `tick`");
        assert!(to_windows_1252("\u{1F600} x").contains('x'));
    }

    #[test]
    fn wraps_words_respects_limit() {
        let lines = wrap_words("aaa bbb ccc ddd", 8);
        assert!(lines.iter().all(|l| l.chars().count() <= 8));
        assert!(lines.iter().any(|l| l.contains("aaa")));
    }
}