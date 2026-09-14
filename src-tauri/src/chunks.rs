// Markdown chunking for the Memory-RAG index (AGENT_MEMORY_RAG_PLAN.md, M1).
// Splits note content into structurally aware ~MAX_TOKENS-token windows with a small
// overlap so retrieval candidates survive sentence/paragraph splits. Each chunk records
// the byte offset of its first character back into the source (used for snippet
// highlighting) and an estimated token count (chars / 4).

pub const MAX_TOKENS: usize = 512;
pub const OVERLAP_TOKENS: usize = 32;

#[derive(Debug, Clone, PartialEq)]
pub struct Chunk {
    pub text: String,
    /// Byte offset of the chunk's first character in the (frontmatter-stripped) source.
    pub char_offset: usize,
    pub token_count: usize,
}

struct Block {
    text: String,
    offset: usize,
}

/// Splits note content into chunks. Returns an empty vec for empty/whitespace-only input.
pub fn chunk_markdown(content: &str) -> Vec<Chunk> {
    let body = strip_frontmatter(content).unwrap_or(content);
    let blocks = split_blocks(body);

    let mut chunks: Vec<Chunk> = Vec::new();
    let mut current = String::new();
    let mut current_tokens = 0usize;
    let mut current_offset = 0usize;
    let mut overlap: Option<String> = None;

    for block in blocks {
        let block_tokens = est_tokens(&block.text);

        if !current.is_empty()
            && (block.text.starts_with('#') || current_tokens + block_tokens > MAX_TOKENS)
        {
            let tail = tail_tokens(&current, OVERLAP_TOKENS);
            chunks.push(Chunk {
                text: std::mem::take(&mut current),
                char_offset: current_offset,
                token_count: current_tokens,
            });
            current_tokens = 0;
            overlap = Some(tail);
        }

        // Oversized blocks (no natural paragraph boundary under the token budget) are
        // split into fixed windows of their own; they never mix with `current`.
        if block_tokens > MAX_TOKENS {
            if !current.is_empty() {
                chunks.push(Chunk {
                    text: std::mem::take(&mut current),
                    char_offset: current_offset,
                    token_count: current_tokens,
                });
                current_tokens = 0;
            }
            for window in split_long_block(&block) {
                chunks.push(window);
            }
            overlap = None;
            continue;
        }

        if current.is_empty() {
            current_offset = block.offset;
            if let Some(tail) = overlap.take() {
                current.push_str(tail.trim_end());
                if current.chars().next_back() != Some(' ') {
                    current.push(' ');
                }
                current_tokens = est_tokens(&current);
            }
        } else {
            current.push('\n');
        }

        current.push_str(&block.text);
        current_tokens += block_tokens;
    }

    if !current.is_empty() {
        chunks.push(Chunk {
            text: current,
            char_offset: current_offset,
            token_count: current_tokens,
        });
    }

    chunks
}

/// Removes a `---\n...\n---` YAML frontmatter block if present.
fn strip_frontmatter(content: &str) -> Option<&str> {
    let open = content.strip_prefix("---\n")?;
    let close_idx = open.find("\n---")?;
    let after_close = &open[close_idx + 4..];
    Some(after_close.strip_prefix('\n').unwrap_or(after_close))
}

/// Groups consecutive non-blank lines into blocks, recording each block's byte offset.
fn split_blocks(content: &str) -> Vec<Block> {
    let mut blocks = Vec::new();
    let mut buf = String::new();
    let mut buf_offset = 0usize;
    let mut cursor = 0usize;

    for line in content.split_inclusive('\n') {
        if line.trim().is_empty() {
            if !buf.is_empty() {
                blocks.push(Block {
                    text: std::mem::take(&mut buf),
                    offset: buf_offset,
                });
            }
            cursor += line.len();
            continue;
        }
        let line_text = line.strip_suffix('\n').unwrap_or(line);
        if buf.is_empty() {
            buf_offset = cursor;
        } else {
            buf.push('\n');
        }
        buf.push_str(line_text);
        cursor += line.len();
    }

    if !buf.is_empty() {
        blocks.push(Block {
            text: buf,
            offset: buf_offset,
        });
    }
    blocks
}

/// Rough token estimate: 4 chars per token.
fn est_tokens(s: &str) -> usize {
    let chars = s.chars().count();
    if chars == 0 {
        0
    } else {
        (chars + 3) / 4
    }
}

fn tail_tokens(s: &str, n: usize) -> String {
    let max_chars = n.saturating_mul(4);
    let count = s.chars().count();
    if count <= max_chars {
        return s.to_string();
    }
    s.chars().skip(count - max_chars).collect()
}

fn split_long_block(block: &Block) -> Vec<Chunk> {
    let window_chars = MAX_TOKENS.saturating_mul(4);
    let chars: Vec<char> = block.text.chars().collect();
    let mut out = Vec::new();
    let mut start = 0usize;
    let mut window_offset = block.offset; // byte offset of `start` within the source
    let mut prev_tail: Option<String> = None;

    while start < chars.len() {
        let end = (start + window_chars).min(chars.len());
        let raw: String = chars[start..end].iter().collect();

        let (text, char_offset) = match prev_tail.take() {
            Some(tail) => {
                let offset = window_offset.saturating_sub(tail.len());
                (format!("{} {}", tail.trim_end(), raw), offset)
            }
            None => (raw.clone(), window_offset),
        };

        out.push(Chunk {
            char_offset,
            token_count: est_tokens(&text),
            text: text.clone(),
        });

        prev_tail = Some(tail_tokens(&text, OVERLAP_TOKENS));
        window_offset += raw.len();
        start = end;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_and_whitespace_produce_no_chunks() {
        assert!(chunk_markdown("").is_empty());
        assert!(chunk_markdown("\n\n   \n").is_empty());
    }

    #[test]
    fn small_note_is_a_single_chunk() {
        let content = "The mitochondria is the powerhouse of the cell.";
        let chunks = chunk_markdown(content);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].char_offset, 0);
        assert_eq!(chunks[0].text, content);
        assert!(chunks[0].token_count > 0);
    }

    #[test]
    fn frontmatter_is_stripped_and_offsets_stay_in_source() {
        let content = "---\ntitle: Test\ntags: [physics]\n---\n# Energy\n\nE = hf.";
        let chunks = chunk_markdown(content);
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].text.starts_with("# Energy"));
        assert!(!chunks[0].text.contains("title:"));
    }

    #[test]
    fn heading_boundary_starts_a_new_chunk() {
        // Two sections under the budget; heading appears between them and must not merge.
        let content = format!(
            "# Section One\n\n{}\n\n# Section Two\n\n{}",
            "alpha ".repeat(300),
            "beta ".repeat(300)
        );
        let chunks = chunk_markdown(&content);
        assert_eq!(chunks.len(), 2);
        assert!(chunks[0].text.starts_with("# Section One"));
        // chunk 1 leads with the ~OVERLAP_TOKENS overlap tail, then the new heading.
        assert!(chunks[1].text.contains("# Section Two"));
        assert!(chunks[1].char_offset > chunks[0].char_offset);
    }

    #[test]
    fn large_paragraph_splits_with_overlap() {
        // ~30 * 300 == 9000 chars (~2250 tokens) — well over MAX_TOKENS.
        let content = "lorem ipsum dolor sit amet ".repeat(300);
        let chunks = chunk_markdown(&content);
        assert!(chunks.len() >= 4, "expected multiple chunks, got {}", chunks.len());
        assert_eq!(chunks[0].char_offset, 0);

        // Consecutive chunks carry ~OVERLAP_TOKENS of shared tail text.
        let tail = tail_tokens(&chunks[0].text, OVERLAP_TOKENS);
        assert!(
            chunks[1].text.starts_with(tail.trim_end()),
            "chunk 1 should lead with chunk 0's overlap tail"
        );

        // Offsets strictly increase and stay within the source bounds.
        for pair in chunks.windows(2) {
            assert!(pair[1].char_offset > pair[0].char_offset);
            assert!(pair[1].char_offset < content.len());
        }
    }
}