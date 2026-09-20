use crate::chunks;
use crate::db::{DbState, LinkItem};
use rusqlite::params;
use std::sync::{Mutex, OnceLock};
use tauri::{Manager, State};

/// Tracks the project-local `opencode.json` we write for a connector export, so
/// `kill_opencode_server` can remove it when the sidecar stops. This keeps the
/// export non-destructive and leaves no artifact behind in the user's vault.
static OPENCODE_MCP_CONFIG: OnceLock<Mutex<Option<std::path::PathBuf>>> = OnceLock::new();
// Path of the sidecar's stdout/stderr capture (`opencode-server.<port>.log`). Mirrors
// OPENCODE_MCP_CONFIG: tracked so `kill_opencode_server` can clean it up on a clean
// stop; on an unclean exit the file lingers in the app-data dir and is simply
// truncated on the next spawn for the same port.
static OPENCODE_SERVER_LOG: OnceLock<Mutex<Option<std::path::PathBuf>>> = OnceLock::new();

// Local version history (DATA-3): before overwriting a tracked file, the previous content
// is copied into <app_data_dir>/history/<hash-of-path>/<timestamp>.<ext>, capped at the
// last MAX_HISTORY_VERSIONS per file. This is deliberately keyed off a hash of the path
// itself rather than the vault_index `files` table (DATA-2), so it doesn't depend on that
// still-unfinished ticket — a save works the same whether or not the index is in sync.
const MAX_HISTORY_VERSIONS: usize = 20;

fn path_history_key(path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn prune_history(history_dir: &std::path::Path) -> Result<(), String> {
    let mut entries: Vec<_> = std::fs::read_dir(history_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();
    // Filenames are fixed-width zero-padded timestamps, so lexical sort == chronological.
    entries.sort_by_key(|e| e.file_name());
    if entries.len() > MAX_HISTORY_VERSIONS {
        let excess = entries.len() - MAX_HISTORY_VERSIONS;
        for entry in entries.into_iter().take(excess) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    Ok(())
}

pub fn snapshot_previous_version(history_root: &std::path::Path, valid_path: &std::path::Path) -> Result<(), String> {
    if !valid_path.exists() {
        return Ok(()); // brand-new file — nothing to snapshot yet
    }
    let previous_content = std::fs::read(valid_path).map_err(|e| e.to_string())?;

    let key = path_history_key(&valid_path.to_string_lossy());
    let history_dir = history_root.join(key);
    std::fs::create_dir_all(&history_dir).map_err(|e| e.to_string())?;

    let timestamp = chrono::Local::now().format("%Y%m%d%H%M%S%3f");
    let ext = valid_path.extension().and_then(|e| e.to_str()).unwrap_or("md");
    let snapshot_path = history_dir.join(format!("{timestamp}.{ext}"));
    std::fs::write(&snapshot_path, &previous_content).map_err(|e| e.to_string())?;

    prune_history(&history_dir)
}

// Vault index sync (DATA-2): keeps the `files` table's content_hash/size/mtime current
// incrementally on every create/write/rename/delete, plus a full rescan (`reindex_vault`)
// triggered once when a vault is opened. `refreshExplorer` (called far more often — after
// every file op already, and on every folder-path change) deliberately does NOT trigger a
// rescan itself, since those exact operations already get incremental updates below; a full
// re-hash on every refresh would be redundant work, not just "infrequent" background cost.

fn content_hash(content: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn format_system_time(time: std::time::SystemTime) -> String {
    let datetime: chrono::DateTime<chrono::Local> = time.into();
    datetime.format("%Y-%m-%dT%H:%M:%S%.3f").to_string()
}

fn now_iso() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f").to_string()
}

pub fn upsert_file_index(conn: &rusqlite::Connection, path: &std::path::Path, content: &str) -> Result<(), String> {
    let path_str = path.to_string_lossy();
    let hash = content_hash(content);
    let size = content.len() as i64;
    let mtime = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map(format_system_time)
        .unwrap_or_else(|_| now_iso());

    conn.execute(
        "INSERT INTO files (path, content_hash, size_bytes, mtime, last_indexed_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(path) DO UPDATE SET
             content_hash = excluded.content_hash,
             size_bytes = excluded.size_bytes,
             mtime = excluded.mtime,
             last_indexed_at = excluded.last_indexed_at",
        params![path_str.as_ref(), hash, size, mtime, now_iso()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn remove_from_index_recursive(conn: &rusqlite::Connection, path_str: &str) -> Result<(), String> {
    // Covers both a single file (exact match) and a directory (prefix match on everything
    // nested under it) with one statement, rather than needing the caller to know which.
    let prefix_pattern = format!("{}{}%", path_str, std::path::MAIN_SEPARATOR);
    conn.execute(
        "DELETE FROM files WHERE path = ?1 OR path LIKE ?2",
        params![path_str, prefix_pattern],
    )
    .map_err(|e| e.to_string())?;
    // Memory-RAG: drop this file's (or subtree's) chunks too; chunks_fts syncs itself.
    conn.execute(
        "DELETE FROM note_chunks WHERE path = ?1 OR path LIKE ?2",
        params![path_str, prefix_pattern],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn reindex_after_rename(conn: &rusqlite::Connection, old_str: &str, new_str: &str) -> Result<(), String> {
    // A rename can be a single file or an entire directory (rewriting every nested path's
    // prefix) — resolved in Rust rather than raw SQL string surgery so OS path separators
    // are handled correctly instead of assuming '/'.
    let prefix_pattern = format!("{}{}%", old_str, std::path::MAIN_SEPARATOR);
    let mut stmt = conn
        .prepare("SELECT path FROM files WHERE path = ?1 OR path LIKE ?2")
        .map_err(|e| e.to_string())?;
    let matching_paths: Vec<String> = stmt
        .query_map(params![old_str, prefix_pattern], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    drop(stmt);

    for old_file_path in matching_paths {
        let new_file_path = if old_file_path == old_str {
            new_str.to_string()
        } else {
            format!("{}{}", new_str, &old_file_path[old_str.len()..])
        };
        conn.execute(
            "UPDATE files SET path = ?1 WHERE path = ?2",
            params![new_file_path, old_file_path],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE note_chunks SET path = ?1 WHERE path = ?2",
            params![new_file_path, old_file_path],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn reindex_dir_recursive(conn: &rusqlite::Connection, dir: &std::path::Path, depth: usize) -> Result<usize, String> {
    if depth > 8 {
        return Ok(0);
    }
    let mut count = 0;
    let read_entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in read_entries.filter_map(Result::ok) {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            count += reindex_dir_recursive(conn, &path, depth + 1)?;
        } else if let Ok(content) = std::fs::read_to_string(&path) {
            // Binary/non-UTF8 files are silently skipped — this index is for note content.
            if upsert_file_index(conn, &path, &content).is_ok() {
                if path.extension().and_then(|e| e.to_str()) == Some("md") {
                    // Memory-RAG: rebuild this file's text chunks. Embeddings stay NULL here;
                    // they're filled lazily by rebuild_embeddings once an embed server is up.
                    let _ = sync_chunks_for_file(conn, &path, &content);
                }
                count += 1;
            }
        }
    }
    Ok(count)
}

// Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M1): replace every stored chunk for a note with
// fresh chunks. The chunks_fts shadow table stays in sync automatically via the triggers
// declared in db.rs, so this function only touches note_chunks.
fn sync_chunks_for_file(conn: &rusqlite::Connection, path: &std::path::Path, content: &str) -> Result<(), String> {
    let path_str = path.to_string_lossy().into_owned();
    conn.execute("DELETE FROM note_chunks WHERE path = ?1", params![&path_str])
        .map_err(|e| e.to_string())?;

    for (i, chunk) in chunks::chunk_markdown(content).iter().enumerate() {
        conn.execute(
            "INSERT INTO note_chunks (path, chunk_index, chunk_text, char_offset, token_count, embed_model, embedding, indexed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, ?6)",
            params![&path_str, i as i64, &chunk.text, chunk.char_offset as i64, chunk.token_count as i64, now_iso()],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn reindex_vault(state: State<DbState>, vault_root: String) -> Result<usize, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    reindex_dir_recursive(&conn, root, 0)
}

pub fn extract_links(source_path: &str, content: &str) -> Vec<LinkItem> {
    let mut links = Vec::new();
    for (line_idx, line) in content.lines().enumerate() {
        let line_num = (line_idx + 1) as i64;

        // 1. Match [[WikiLink]] or [[WikiLink|Alias]]
        let mut start_search = 0;
        while let Some(start) = line[start_search..].find("[[") {
            let abs_start = start_search + start + 2;
            if let Some(end) = line[abs_start..].find("]]") {
                let inner = &line[abs_start..abs_start + end];
                let (target, alias) = if let Some(pipe_idx) = inner.find('|') {
                    (&inner[..pipe_idx], &inner[pipe_idx + 1..])
                } else {
                    (inner, inner)
                };
                let target_trimmed = target.trim();
                let alias_trimmed = alias.trim();
                if !target_trimmed.is_empty() {
                    links.push(LinkItem {
                        id: None,
                        source_path: source_path.to_string(),
                        target_path: target_trimmed.to_string(),
                        link_text: alias_trimmed.to_string(),
                        line_number: line_num,
                    });
                }
                start_search = abs_start + end + 2;
            } else {
                break;
            }
        }

        // 2. Match standard markdown links [text](target.md)
        let bytes = line.as_bytes();
        let mut idx = 0;
        while idx < bytes.len() {
            if bytes[idx] == b'[' {
                if let Some(close_bracket) = line[idx + 1..].find(']') {
                    let bracket_end = idx + 1 + close_bracket;
                    if bracket_end + 1 < bytes.len() && bytes[bracket_end + 1] == b'(' {
                        if let Some(close_paren) = line[bracket_end + 2..].find(')') {
                            let paren_end = bracket_end + 2 + close_paren;
                            let link_text = &line[idx + 1..bracket_end];
                            let target = &line[bracket_end + 2..paren_end];

                            let target_trimmed = target.trim();
                            if !target_trimmed.starts_with("http://")
                                && !target_trimmed.starts_with("https://")
                                && !target_trimmed.starts_with('#')
                                && !target_trimmed.is_empty()
                            {
                                links.push(LinkItem {
                                    id: None,
                                    source_path: source_path.to_string(),
                                    target_path: target_trimmed.to_string(),
                                    link_text: link_text.trim().to_string(),
                                    line_number: line_num,
                                });
                            }
                            idx = paren_end + 1;
                            continue;
                        }
                    }
                }
            }
            idx += 1;
        }
    }
    links
}

fn sync_links_internal(conn: &rusqlite::Connection, source_path: &str, content: &str) -> Result<(), String> {
    let parsed_links = extract_links(source_path, content);

    conn.execute(
        "DELETE FROM links WHERE source_path = ?1",
        params![source_path],
    )
    .map_err(|e| e.to_string())?;

    for link in parsed_links {
        conn.execute(
            "INSERT INTO links (source_path, target_path, link_text, line_number) VALUES (?1, ?2, ?3, ?4)",
            params![link.source_path, link.target_path, link.link_text, link.line_number],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// A wiki-link `[[Foo]]` or markdown link `[text](Foo.md)` stores a short, user-authored
// target string in `links.target_path` — not a resolved filesystem path. A real caller of
// get_backlinks passes the currently-open note's full canonical path, which is never a
// suffix of that short string (the previous `target_path LIKE '%' || ?1` query had the
// comparison backwards, so it could never match anything). Resolved instead by comparing
// basenames without extension, case-insensitively — matching Obsidian's own default
// wiki-link resolution (by filename/title anywhere in the vault, not by exact path).
fn link_target_basename(raw: &str) -> String {
    let trimmed = raw.trim();
    let last_segment = trimmed.rsplit(['/', '\\']).next().unwrap_or(trimmed);
    let without_ext = last_segment.strip_suffix(".md").unwrap_or(last_segment);
    without_ext.to_lowercase()
}

#[tauri::command]
pub fn get_backlinks(state: State<DbState>, target_path: String) -> Result<Vec<LinkItem>, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let normalized_target = link_target_basename(&target_path);

    let mut stmt = conn
        .prepare("SELECT id, source_path, target_path, link_text, line_number FROM links ORDER BY source_path, line_number")
        .map_err(|e| e.to_string())?;

    let rows: Vec<LinkItem> = stmt
        .query_map([], |row| {
            Ok(LinkItem {
                id: Some(row.get(0)?),
                source_path: row.get(1)?,
                target_path: row.get(2)?,
                link_text: row.get(3)?,
                line_number: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|link| link_target_basename(&link.target_path) == normalized_target)
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_outgoing_links(state: State<DbState>, source_path: String) -> Result<Vec<LinkItem>, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, source_path, target_path, link_text, line_number FROM links WHERE source_path = ?1 ORDER BY line_number")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![source_path], |row| {
            Ok(LinkItem {
                id: Some(row.get(0)?),
                source_path: row.get(1)?,
                target_path: row.get(2)?,
                link_text: row.get(3)?,
                line_number: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

#[tauri::command]
pub fn read_local_dir(path: String, excluded_folders: Option<Vec<String>>) -> Result<Vec<FileEntry>, String> {
    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let exclusions: Vec<String> = excluded_folders
        .unwrap_or_default()
        .into_iter()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();

    read_local_dir_internal(root, 0, &exclusions)
}

fn read_local_dir_internal(path: &std::path::Path, depth: usize, exclusions: &[String]) -> Result<Vec<FileEntry>, String> {
    if depth > 4 {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let read_entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in read_entries {
        if let Ok(entry) = entry {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            
            // Skip hidden directories/files (e.g. .git, .vscode)
            if name.starts_with('.') {
                continue;
            }

            let name_lower = name.to_lowercase();
            if exclusions.iter().any(|ex| ex == &name_lower) {
                continue;
            }

            let is_dir = entry_path.is_dir();
            let children = if is_dir {
                Some(read_local_dir_internal(&entry_path, depth + 1, exclusions)?)
            } else {
                None
            };

            entries.push(FileEntry {
                name,
                path: entry_path.to_string_lossy().into_owned(),
                is_dir,
                children,
            });
        }
    }

    // Sort: directories first, then files alphabetically (case-insensitive)
    entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

fn validate_vault_path(path_str: &str, vault_root_str: Option<&str>) -> Result<std::path::PathBuf, String> {
    let raw_path = std::path::Path::new(path_str);

    let vault_root_path = match vault_root_str {
        Some(v) if !v.trim().is_empty() => {
            let p = std::path::Path::new(v);
            if p.exists() {
                std::fs::canonicalize(p).map_err(|e| format!("Invalid vault root path: {}", e))?
            } else {
                p.to_path_buf()
            }
        }
        _ => return Ok(raw_path.to_path_buf()),
    };

    let canonical_target = if raw_path.exists() {
        std::fs::canonicalize(raw_path).map_err(|e| format!("Invalid path: {}", e))?
    } else if let Some(parent) = raw_path.parent() {
        if parent.exists() {
            let canonical_parent = std::fs::canonicalize(parent).map_err(|e| format!("Invalid parent path: {}", e))?;
            let file_name = raw_path.file_name().ok_or_else(|| "Invalid file name".to_string())?;
            canonical_parent.join(file_name)
        } else {
            return Err("Target parent directory does not exist".to_string());
        }
    } else {
        return Err("Invalid path structure".to_string());
    };

    if !canonical_target.starts_with(&vault_root_path) {
        return Err(format!(
            "Security Violation: Target path '{:?}' lies outside vault root '{:?}'",
            canonical_target, vault_root_path
        ));
    }

    Ok(canonical_target)
}

#[tauri::command]
pub fn read_local_file(path: String, vault_root: Option<String>) -> Result<String, String> {
    let valid_path = validate_vault_path(&path, vault_root.as_deref())?;
    std::fs::read_to_string(valid_path).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileLinesResult {
    pub path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub total_lines: usize,
    pub content: String,
    pub truncated: bool,
}

pub fn read_local_file_lines(
    path: String,
    start_line: Option<usize>,
    end_line: Option<usize>,
    vault_root: Option<String>,
) -> Result<FileLinesResult, String> {
    let valid_path = validate_vault_path(&path, vault_root.as_deref())?;
    let content = std::fs::read_to_string(&valid_path).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();

    let one_based_start = start_line.unwrap_or(1);
    let one_based_end = end_line.unwrap_or(total_lines);
    let safe_start = one_based_start.max(1);
    let safe_end = one_based_end.max(safe_start);

    let max_lines = 500;
    let truncated = safe_end - safe_start + 1 > max_lines;
    let slice_end = (safe_start + max_lines - 1).min(safe_end);

    let selected = lines
        .iter()
        .skip(safe_start - 1)
        .take(slice_end - safe_start + 1)
        .copied()
        .collect::<Vec<_>>()
        .join("\n");

    Ok(FileLinesResult {
        path: valid_path.to_string_lossy().into_owned(),
        start_line: safe_start,
        end_line: slice_end,
        total_lines,
        content: selected,
        truncated,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileInfo {
    pub path: String,
    pub exists: bool,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub line_count: Option<usize>,
    pub mtime: Option<String>,
    pub extension: Option<String>,
}

pub fn get_local_file_info(
    path: String,
    vault_root: Option<String>,
) -> Result<LocalFileInfo, String> {
    let valid_path = validate_vault_path(&path, vault_root.as_deref())?;
    let path_str = valid_path.to_string_lossy().into_owned();

    let metadata = std::fs::metadata(&valid_path);
    let metadata = match metadata {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(LocalFileInfo {
                path: path_str,
                exists: false,
                is_dir: false,
                size_bytes: 0,
                line_count: None,
                mtime: None,
                extension: None,
            });
        }
        Err(e) => return Err(e.to_string()),
    };

    let line_count = if metadata.is_file() {
        std::fs::read_to_string(&valid_path)
            .ok()
            .map(|s| s.lines().count())
    } else {
        None
    };

    Ok(LocalFileInfo {
        path: path_str,
        exists: true,
        is_dir: metadata.is_dir(),
        size_bytes: metadata.len(),
        line_count,
        mtime: metadata.modified().ok().map(format_system_time),
        extension: valid_path
            .extension()
            .and_then(|e| e.to_str())
            .map(String::from),
    })
}

#[tauri::command]
pub fn write_local_file(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
    path: String,
    content: String,
    vault_root: Option<String>,
) -> Result<(), String> {
    let valid_path = validate_vault_path(&path, vault_root.as_deref())?;

    if let Ok(app_dir) = app_handle.path().app_data_dir() {
        let history_root = app_dir.join("history");
        if let Err(e) = snapshot_previous_version(&history_root, &valid_path) {
            // Never let a history-snapshot failure block the actual save.
            eprintln!("Failed to snapshot previous version of {:?}: {e}", valid_path);
        }
    }

    std::fs::write(&valid_path, &content).map_err(|e| e.to_string())?;

    let canon_str = valid_path.to_string_lossy();
    if let Ok(conn) = state.vault_index.lock() {
        let _ = sync_links_internal(&conn, &canon_str, &content);
        let _ = upsert_file_index(&conn, &valid_path, &content);
    }
    Ok(())
}

#[tauri::command]
pub fn export_markdown_to_pdf(
    title: String,
    content: String,
    target_path: String,
    vault_root: Option<String>,
) -> Result<String, String> {
    // The target may sit inside a not-yet-created folder (default _attachments/exports/);
    // create parents up front so validate_vault_path can resolve, then re-validate.
    if let Some(parent) = std::path::Path::new(&target_path).parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let valid_path = validate_vault_path(&target_path, vault_root.as_deref())?;
    let bytes = crate::pdf_export::render_markdown_to_pdf_bytes(&title, &content)?;
    std::fs::write(&valid_path, &bytes).map_err(|e| e.to_string())?;
    Ok(valid_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn create_local_file(
    state: State<DbState>,
    dir_path: String,
    name: String,
    vault_root: Option<String>,
) -> Result<String, String> {
    // Trim and guard against empty names
    let base = name.trim();
    if base.is_empty() {
        return Err("File name cannot be empty".to_string());
    }

    // Build the final file name. If the user did not include an extension,
    // default to .md; otherwise keep their extension exactly as given.
    let file_name = if base.contains('.') {
        base.to_string()
    } else {
        format!("{}.md", base)
    };

    let target_dir = validate_vault_path(&dir_path, vault_root.as_deref())?;
    if !target_dir.is_dir() {
        return Err("Target parent is not a directory".to_string());
    }

    let file_path = target_dir.join(&file_name);
    let valid_file_path = validate_vault_path(&file_path.to_string_lossy(), vault_root.as_deref())?;

    if valid_file_path.exists() {
        return Err("File already exists".to_string());
    }

    let initial_content = if file_name.ends_with(".md") || file_name.ends_with(".markdown") {
        let title = file_name.trim_end_matches(".md").trim_end_matches(".markdown");
        format!("# {}\n", title)
    } else {
        String::new()
    };

    std::fs::write(&valid_file_path, &initial_content).map_err(|e| e.to_string())?;

    if let Ok(conn) = state.vault_index.lock() {
        let _ = upsert_file_index(&conn, &valid_file_path, &initial_content);
    }

    Ok(valid_file_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn create_local_dir(parent_path: String, name: String, vault_root: Option<String>) -> Result<String, String> {
    let folder_name = name.trim();
    if folder_name.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }

    let parent_dir = validate_vault_path(&parent_path, vault_root.as_deref())?;
    if !parent_dir.is_dir() {
        return Err("Parent path is not a directory".to_string());
    }

    let new_dir_path = parent_dir.join(folder_name);
    let valid_dir_path = validate_vault_path(&new_dir_path.to_string_lossy(), vault_root.as_deref())?;

    if valid_dir_path.exists() {
        return Err("Directory already exists".to_string());
    }

    std::fs::create_dir_all(&valid_dir_path).map_err(|e| e.to_string())?;
    Ok(valid_dir_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn rename_local_entry(
    state: State<DbState>,
    old_path: String,
    new_path: String,
    vault_root: Option<String>,
) -> Result<(), String> {
    let valid_old = validate_vault_path(&old_path, vault_root.as_deref())?;
    let valid_new = validate_vault_path(&new_path, vault_root.as_deref())?;

    if !valid_old.exists() {
        return Err("Target to rename does not exist".to_string());
    }

    let old_str = valid_old.to_string_lossy();
    let new_str = valid_new.to_string_lossy();

    std::fs::rename(&valid_old, &valid_new).map_err(|e| e.to_string())?;

    if let Ok(conn) = state.vault_index.lock() {
        let _ = conn.execute(
            "UPDATE links SET source_path = ?1 WHERE source_path = ?2",
            params![new_str.as_ref(), old_str.as_ref()],
        );
        let _ = conn.execute(
            "UPDATE links SET target_path = ?1 WHERE target_path = ?2",
            params![new_str.as_ref(), old_str.as_ref()],
        );
        let _ = reindex_after_rename(&conn, old_str.as_ref(), new_str.as_ref());
    }
    Ok(())
}

#[tauri::command]
pub fn delete_local_entry(
    state: State<DbState>,
    path: String,
    vault_root: Option<String>,
) -> Result<(), String> {
    let valid_path = validate_vault_path(&path, vault_root.as_deref())?;
    if !valid_path.exists() {
        return Err("Path to delete does not exist".to_string());
    }

    // Safety guard: Never allow deleting the vault root itself!
    if let Some(vr) = vault_root.as_deref() {
        if let Ok(vr_canon) = std::fs::canonicalize(vr) {
            if valid_path == vr_canon {
                return Err("Refusing to delete the root vault directory".to_string());
            }
        }
    }

    let path_str = valid_path.to_string_lossy();

    if valid_path.is_dir() {
        std::fs::remove_dir_all(&valid_path).map_err(|e| e.to_string())?;
    } else {
        std::fs::remove_file(&valid_path).map_err(|e| e.to_string())?;
    }

    if let Ok(conn) = state.vault_index.lock() {
        let _ = conn.execute(
            "DELETE FROM links WHERE source_path = ?1 OR target_path = ?2",
            params![path_str.as_ref(), path_str.as_ref()],
        );
        let _ = remove_from_index_recursive(&conn, path_str.as_ref());
    }
    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct SearchResultItem {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub line_number: usize,
}

#[tauri::command]
pub fn search_vault(vault_root: String, query: String) -> Result<Vec<SearchResultItem>, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Vault root is not a directory".to_string());
    }
    let query_lower = query.trim().to_lowercase();
    if query_lower.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    let mut stack = vec![root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }

            if path.is_dir() {
                stack.push(path);
            } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    let title = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| name.clone());
                    for (idx, line) in content.lines().enumerate() {
                        if line.to_lowercase().contains(&query_lower) {
                            results.push(SearchResultItem {
                                path: path.to_string_lossy().to_string(),
                                title: title.clone(),
                                snippet: line.trim().to_string(),
                                line_number: idx + 1,
                            });
                            if results.len() >= 30 {
                                break;
                            }
                        }
                    }
                }
            }
            if results.len() >= 30 {
                break;
            }
        }
        if results.len() >= 30 {
            break;
        }
    }

    Ok(results)
}

// Memory-RAG (M1): lazy embedding sync. The frontend pulls chunks whose embedding is
// still NULL, batches them to the embed server, then writes the vectors back here. This
// split keeps ALL AI HTTP in the frontend (consistent with aiProvider.ts) while the
// vectors and retrieval stay in SQLite.

#[derive(serde::Serialize)]
pub struct UnembeddedChunk {
    pub rowid: i64,
    pub path: String,
    pub chunk_index: i64,
    pub text: String,
}

#[tauri::command]
pub fn get_unembedded_chunks(state: State<DbState>, vault_root: String, limit: usize) -> Result<Vec<UnembeddedChunk>, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let root_str = root.to_string_lossy();
    let prefix = format!(
        "{}{}%",
        root_str.trim_end_matches(std::path::MAIN_SEPARATOR),
        std::path::MAIN_SEPARATOR
    );

    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT rowid, path, chunk_index, chunk_text
             FROM note_chunks
             WHERE embedding IS NULL AND path LIKE ?1
             ORDER BY rowid
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![prefix, limit.max(0) as i64], |row| {
            Ok(UnembeddedChunk {
                rowid: row.get(0)?,
                path: row.get(1)?,
                chunk_index: row.get(2)?,
                text: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[derive(serde::Deserialize)]
pub struct EmbeddedChunk {
    pub rowid: i64,
    pub embedding: Vec<f32>,
}

#[tauri::command]
pub fn store_chunk_embeddings(state: State<DbState>, items: Vec<EmbeddedChunk>, embed_model: String) -> Result<usize, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let mut updated = 0usize;
    for item in items.iter() {
        let bytes = crate::embeddings::pack_f32s(&item.embedding);
        updated += conn
            .execute(
                "UPDATE note_chunks SET embedding = ?1, embed_model = ?2 WHERE rowid = ?3",
                params![bytes.as_slice(), &embed_model, item.rowid],
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(updated)
}

// ---------------------------------------------------------------------------
// Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M2): hybrid retrieval + durable memory.
//
// Ranking model: FTS5 pre-filters candidates to a small set, then an optional query
// embedding re-ranks them by cosine similarity when the embed server was reachable.
// When no vectors exist (server down / index not built yet), results degrade gracefully
// to pure keyword ranking. All AI HTTP stays in the frontend; Rust owns storage + math.
// ---------------------------------------------------------------------------

fn vault_path_prefix(root: &std::path::Path) -> String {
    let root_str = root.to_string_lossy();
    format!(
        "{}{}%",
        root_str.trim_end_matches(std::path::MAIN_SEPARATOR),
        std::path::MAIN_SEPARATOR
    )
}

/// Splits a free-text query into sanitized FTS5 terms (alphanumeric only, lowercased).
/// Quoting each term neutralizes FTS5 operator syntax in user input.
fn fts_terms(query: &str) -> Vec<String> {
    query
        .split(|c: char| !c.is_alphanumeric())
        .map(|t| t.trim().to_lowercase())
        .filter(|t| !t.is_empty())
        .collect()
}

fn fts_match_query(query: &str) -> Option<String> {
    let terms = fts_terms(query);
    if terms.is_empty() {
        return None;
    }
    let quoted: Vec<String> = terms.into_iter().map(|t| format!("\"{t}\"")).collect();
    Some(quoted.join(" "))
}

#[derive(serde::Serialize)]
pub struct RagHit {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub score: f32,
    pub char_offset: i64,
}

fn title_from_path(path: &std::path::Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Untitled".to_string())
}

pub fn search_rag_internal(
    conn: &rusqlite::Connection,
    vault_root: &std::path::Path,
    query_text: &str,
    query_embedding: &[f32],
    limit: usize,
) -> Result<Vec<RagHit>, String> {
    if limit == 0 {
        return Ok(Vec::new());
    }
    let match_query = match fts_match_query(query_text) {
        Some(q) => q,
        None => return Ok(Vec::new()),
    };
    let prefix = vault_path_prefix(vault_root);
    const CANDIDATES: i64 = 50;

    // 1. Keyword pre-filter (works fully offline).
    let mut stmt = conn
        .prepare(
            "SELECT rowid, rank FROM chunks_fts
             WHERE chunks_fts MATCH ?1
               AND rowid IN (SELECT rowid FROM note_chunks WHERE path LIKE ?2)
             ORDER BY rank
             LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;
    let candidates: Vec<(i64, f32)> = stmt
        .query_map(params![match_query, prefix, CANDIDATES], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    drop(stmt);
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    // 2. Load chunk metadata + optional stored vector for each candidate.
    struct CandidateRow {
        chunk: RagHit,
        embedding: Option<Vec<f32>>,
    }
    let mut rows: Vec<CandidateRow> = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT path, chunk_index, chunk_text, char_offset, embedding
                 FROM note_chunks WHERE rowid = ?1",
            )
            .map_err(|e| e.to_string())?;
        for (rowid, rank) in candidates.iter() {
            let fetched = stmt
                .query_row(params![rowid], |row| {
                    let path: String = row.get(0)?;
                    let _chunk_index: i64 = row.get(1)?;
                    let chunk_text: String = row.get(2)?;
                    let char_offset: i64 = row.get(3)?;
                    let embedding: Option<Vec<u8>> = row.get(4)?;
                    Ok((
                        path,
                        chunk_text,
                        char_offset,
                        embedding.map(|b| crate::embeddings::unpack_f32s(&b)),
                    ))
                })
                .map_err(|e| e.to_string());
            if let Ok((path, text, char_offset, embedding)) = fetched {
                let snippet: String = text.chars().take(600).collect();
                rows.push(CandidateRow {
                    chunk: RagHit {
                        title: title_from_path(std::path::Path::new(&path)),
                        snippet,
                        path: path.clone(),
                        char_offset,
                        score: *rank,
                    },
                    embedding,
                });
            }
        }
    }

    // 3. Re-rank by cosine when possible; otherwise keep keyword (rank) order.
    if !query_embedding.is_empty() {
        for row in rows.iter_mut() {
            if let Some(vec) = &row.embedding {
                row.chunk.score = crate::embeddings::cosine(query_embedding, vec);
            } else {
                row.chunk.score = 0.0;
            }
        }
        // Embedded hits first (cosine desc), then unembedded in keyword order.
        rows.sort_by(|a, b| {
            b.chunk
                .score
                .partial_cmp(&a.chunk.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        // Recover stable keyword order for the unembedded tail.
        rows.sort_by(|a, b| {
            let a_embedded = a.embedding.is_some();
            let b_embedded = b.embedding.is_some();
            match (a_embedded, b_embedded) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                (true, true) => b
                    .chunk
                    .score
                    .partial_cmp(&a.chunk.score)
                    .unwrap_or(std::cmp::Ordering::Equal),
                (false, false) => a
                    .chunk
                    .score
                    .partial_cmp(&b.chunk.score)
                    .unwrap_or(std::cmp::Ordering::Equal),
            }
        });
    }

    Ok(rows
        .into_iter()
        .take(limit)
        .map(|r| r.chunk)
        .collect())
}

#[tauri::command]
pub fn search_rag(
    state: State<DbState>,
    vault_root: String,
    query_text: String,
    query_embedding: Vec<f32>,
    limit: usize,
) -> Result<Vec<RagHit>, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    search_rag_internal(&conn, root, &query_text, &query_embedding, limit)
}

#[derive(serde::Serialize)]
pub struct MemoryItem {
    pub id: i64,
    pub scope: String,
    pub kind: String,
    pub content: String,
    pub source: String,
    pub topic_title: Option<String>,
    pub created_at: String,
    pub score: f32,
}

#[tauri::command]
pub fn add_memory(
    state: State<DbState>,
    scope: String,
    kind: String,
    content: String,
    source: String,
    topic_title: Option<String>,
    embedding: Vec<f32>,
) -> Result<i64, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let bytes = if embedding.is_empty() {
        None
    } else {
        Some(crate::embeddings::pack_f32s(&embedding))
    };
    conn.execute(
        "INSERT INTO memory_entries (scope, kind, content, source, topic_title, created_at, embedding)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![scope, kind, content, source, topic_title, now_iso(), bytes.as_deref()],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

pub fn recall_memory_internal(
    conn: &rusqlite::Connection,
    scope: &str,
    query_text: &str,
    query_embedding: &[f32],
    limit: usize,
) -> Result<Vec<MemoryItem>, String> {
    if limit == 0 {
        return Ok(Vec::new());
    }
    let like = query_text.trim();
    let scope_filter = if scope.trim().is_empty() {
        "%".to_string()
    } else {
        scope.to_string()
    };

    struct Row {
        item: MemoryItem,
        embedding: Option<Vec<f32>>,
    }
    let mut rows: Vec<Row> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, scope, kind, content, source, topic_title, created_at, embedding
                 FROM memory_entries
                 WHERE active = 1
                   AND scope LIKE ?1
                   AND (?2 = '' OR content LIKE '%' || ?2 || '%')
                 ORDER BY created_at DESC
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let collected = stmt
            .query_map(params![scope_filter, like, limit as i64], |row| {
                let id: i64 = row.get(0)?;
                let scope: String = row.get(1)?;
                let kind: String = row.get(2)?;
                let content: String = row.get(3)?;
                let source: String = row.get(4)?;
                let topic_title: Option<String> = row.get(5)?;
                let created_at: String = row.get(6)?;
                let embedding: Option<Vec<u8>> = row.get(7)?;
                Ok(Row {
                    item: MemoryItem {
                        id,
                        scope,
                        kind,
                        content,
                        source,
                        topic_title,
                        created_at,
                        score: 0.0,
                    },
                    embedding: embedding.map(|b| crate::embeddings::unpack_f32s(&b)),
                })
            })
            .map_err(|e| e.to_string())?;

        collected
            .filter_map(Result::ok)
            .take(limit)
            .collect()
    };

    if !query_embedding.is_empty() {
        for row in rows.iter_mut() {
            if let Some(vec) = &row.embedding {
                row.item.score = crate::embeddings::cosine(query_embedding, vec);
            }
        }
        rows.sort_by(|a, b| {
            b.item
                .score
                .partial_cmp(&a.item.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    Ok(rows.into_iter().take(limit).map(|r| r.item).collect())
}

#[tauri::command]
pub fn recall_memory(
    state: State<DbState>,
    scope: String,
    query_text: String,
    query_embedding: Vec<f32>,
    limit: usize,
) -> Result<Vec<MemoryItem>, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    recall_memory_internal(&conn, &scope, &query_text, &query_embedding, limit)
}

pub fn backlinks_for_path(conn: &rusqlite::Connection, target_path: &str) -> Result<Vec<LinkItem>, String> {
    let normalized_target = link_target_basename(target_path);
    let mut stmt = conn
        .prepare("SELECT id, source_path, target_path, link_text, line_number FROM links ORDER BY source_path, line_number")
        .map_err(|e| e.to_string())?;
    let rows: Vec<LinkItem> = stmt
        .query_map([], |row| {
            Ok(LinkItem {
                id: Some(row.get(0)?),
                source_path: row.get(1)?,
                target_path: row.get(2)?,
                link_text: row.get(3)?,
                line_number: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|link| link_target_basename(&link.target_path) == normalized_target)
        .collect();
    Ok(rows)
}

#[derive(serde::Serialize)]
pub struct ActiveNoteContext {
    pub path: String,
    pub title: String,
    pub excerpt: String,
}

#[derive(serde::Serialize)]
pub struct ContextBundle {
    pub scope: String,
    pub memory: Vec<MemoryItem>,
    pub rag: Vec<RagHit>,
    pub active_note: Option<ActiveNoteContext>,
    pub backlinks: Vec<LinkItem>,
}

#[tauri::command]
pub fn get_context_bundle(
    state: State<DbState>,
    vault_root: String,
    scope: String,
    query_text: String,
    query_embedding: Vec<f32>,
    active_note_path: Option<String>,
    rag_limit: usize,
) -> Result<ContextBundle, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;

    let memory = recall_memory_internal(&conn, "", &scope, &query_embedding, rag_limit)?;
    let rag = search_rag_internal(&conn, root, &query_text, &query_embedding, rag_limit)?;

    let active_note = match &active_note_path {
        Some(path_str) if !path_str.trim().is_empty() => {
            std::fs::read_to_string(path_str).ok().map(|content| {
                let title = title_from_path(std::path::Path::new(path_str));
                let excerpt: String = content.chars().take(2500).collect();
                ActiveNoteContext {
                    path: path_str.clone(),
                    title,
                    excerpt,
                }
            })
        }
        _ => None,
    };

    let backlinks = match &active_note_path {
        Some(path_str) => backlinks_for_path(&conn, path_str)?,
        None => Vec::new(),
    };

    Ok(ContextBundle {
        scope,
        memory,
        rag,
        active_note,
        backlinks,
    })
}

#[cfg(test)]
mod backlink_tests {
    use super::*;

    #[test]
    fn matches_bare_wikilink_target_against_full_path() {
        let sep = std::path::MAIN_SEPARATOR;
        let full_path = format!("C:{sep}vault{sep}Notes{sep}Foo.md");
        // [[Foo]] stores target_path = "Foo"
        assert_eq!(link_target_basename("Foo"), link_target_basename(&full_path));
    }

    #[test]
    fn matches_markdown_link_target_with_extension_and_relative_prefix() {
        let sep = std::path::MAIN_SEPARATOR;
        let full_path = format!("C:{sep}vault{sep}Notes{sep}Foo.md");
        // [text](../Foo.md) stores target_path = "../Foo.md"
        assert_eq!(link_target_basename("../Foo.md"), link_target_basename(&full_path));
    }

    #[test]
    fn is_case_insensitive() {
        assert_eq!(link_target_basename("FOO"), link_target_basename("foo.md"));
    }

    #[test]
    fn distinguishes_different_notes() {
        assert_ne!(link_target_basename("Foo"), link_target_basename("Bar.md"));
    }
}

#[cfg(test)]
mod index_tests {
    use super::*;
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE files (
                path            TEXT PRIMARY KEY,
                content_hash    TEXT NOT NULL,
                size_bytes      INTEGER NOT NULL,
                mtime           TEXT NOT NULL,
                last_indexed_at TEXT NOT NULL,
                last_backed_up_at TEXT,
                sync_status     TEXT NOT NULL DEFAULT 'not_tracked'
            );
            CREATE TABLE note_chunks (
                rowid       INTEGER PRIMARY KEY AUTOINCREMENT,
                path        TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                chunk_text  TEXT NOT NULL,
                char_offset INTEGER NOT NULL,
                token_count INTEGER NOT NULL,
                embed_model TEXT,
                embedding   BLOB,
                indexed_at  TEXT NOT NULL,
                UNIQUE(path, chunk_index)
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn upsert_is_idempotent_for_unchanged_content() {
        let dir = std::env::temp_dir().join("lsn_test_index_idempotent");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file_path = dir.join("note.md");
        std::fs::write(&file_path, "unchanged content").unwrap();

        let conn = test_conn();
        // Simulates a full rescan followed by an incremental update for the same file
        // with the same content — the acceptance criterion this ticket specifies.
        upsert_file_index(&conn, &file_path, "unchanged content").unwrap();
        let hash_after_rescan: String = conn
            .query_row("SELECT content_hash FROM files WHERE path = ?1", params![file_path.to_string_lossy().as_ref()], |r| r.get(0))
            .unwrap();

        upsert_file_index(&conn, &file_path, "unchanged content").unwrap();
        let hash_after_incremental: String = conn
            .query_row("SELECT content_hash FROM files WHERE path = ?1", params![file_path.to_string_lossy().as_ref()], |r| r.get(0))
            .unwrap();

        assert_eq!(hash_after_rescan, hash_after_incremental, "hash must be identical for unchanged content");

        // Also confirms the ON CONFLICT path really is an update, not a duplicate row.
        let row_count: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0)).unwrap();
        assert_eq!(row_count, 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn upsert_preserves_sync_status_on_update() {
        let dir = std::env::temp_dir().join("lsn_test_index_sync_status");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file_path = dir.join("note.md");
        std::fs::write(&file_path, "v1").unwrap();

        let conn = test_conn();
        upsert_file_index(&conn, &file_path, "v1").unwrap();
        conn.execute(
            "UPDATE files SET sync_status = 'synced' WHERE path = ?1",
            params![file_path.to_string_lossy().as_ref()],
        )
        .unwrap();

        std::fs::write(&file_path, "v2").unwrap();
        upsert_file_index(&conn, &file_path, "v2").unwrap();

        let sync_status: String = conn
            .query_row("SELECT sync_status FROM files WHERE path = ?1", params![file_path.to_string_lossy().as_ref()], |r| r.get(0))
            .unwrap();
        assert_eq!(sync_status, "synced", "an unrelated content update must not reset sync_status");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rename_updates_exact_and_nested_paths() {
        let sep = std::path::MAIN_SEPARATOR;
        let conn = test_conn();
        let old_dir = format!("C:{sep}vault{sep}Notes");
        let new_dir = format!("C:{sep}vault{sep}Renamed");
        let nested_old = format!("{old_dir}{sep}inner.md");
        let unrelated = format!("C:{sep}vault{sep}NotesButNotReally{sep}other.md");

        for p in [&old_dir, &nested_old, &unrelated] {
            conn.execute(
                "INSERT INTO files (path, content_hash, size_bytes, mtime, last_indexed_at) VALUES (?1, 'h', 0, 't', 't')",
                params![p],
            )
            .unwrap();
        }

        reindex_after_rename(&conn, &old_dir, &new_dir).unwrap();

        let remaining_old: i64 = conn
            .query_row("SELECT COUNT(*) FROM files WHERE path = ?1", params![old_dir], |r| r.get(0))
            .unwrap();
        assert_eq!(remaining_old, 0, "old directory path must no longer exist");

        let nested_new = format!("{new_dir}{sep}inner.md");
        let nested_moved: i64 = conn
            .query_row("SELECT COUNT(*) FROM files WHERE path = ?1", params![nested_new], |r| r.get(0))
            .unwrap();
        assert_eq!(nested_moved, 1, "nested file must have its path prefix rewritten");

        let unrelated_untouched: i64 = conn
            .query_row("SELECT COUNT(*) FROM files WHERE path = ?1", params![unrelated], |r| r.get(0))
            .unwrap();
        assert_eq!(unrelated_untouched, 1, "a similarly-named but distinct directory must not be affected");
    }

    #[test]
    fn remove_from_index_recursive_removes_nested_but_not_unrelated() {
        let sep = std::path::MAIN_SEPARATOR;
        let conn = test_conn();
        let dir_path = format!("C:{sep}vault{sep}ToDelete");
        let nested = format!("{dir_path}{sep}child.md");
        let unrelated = format!("C:{sep}vault{sep}ToDeleteButNotReally{sep}other.md");

        for p in [&dir_path, &nested, &unrelated] {
            conn.execute(
                "INSERT INTO files (path, content_hash, size_bytes, mtime, last_indexed_at) VALUES (?1, 'h', 0, 't', 't')",
                params![p],
            )
            .unwrap();
        }

        remove_from_index_recursive(&conn, &dir_path).unwrap();

        let remaining: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0)).unwrap();
        assert_eq!(remaining, 1, "only the unrelated path should survive");

        let unrelated_survives: i64 = conn
            .query_row("SELECT COUNT(*) FROM files WHERE path = ?1", params![unrelated], |r| r.get(0))
            .unwrap();
        assert_eq!(unrelated_survives, 1);
    }
}

#[cfg(test)]
mod history_tests {
    use super::*;

    #[test]
    fn snapshots_previous_content_before_overwrite() {
        let dir = std::env::temp_dir().join("lsn_test_history_basic");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let history_root = dir.join("history");
        let file_path = dir.join("note.md");

        std::fs::write(&file_path, "version one").unwrap();
        snapshot_previous_version(&history_root, &file_path).unwrap();
        std::fs::write(&file_path, "version two").unwrap();

        let key = path_history_key(&file_path.to_string_lossy());
        let versions_dir = history_root.join(&key);
        let entries: Vec<_> = std::fs::read_dir(&versions_dir).unwrap().collect();
        assert_eq!(entries.len(), 1, "expected exactly one snapshot after one overwrite");

        let snapshot_content = std::fs::read_to_string(entries[0].as_ref().unwrap().path()).unwrap();
        assert_eq!(snapshot_content, "version one", "snapshot must hold the PREVIOUS content, not the new one");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn new_file_produces_no_snapshot() {
        let dir = std::env::temp_dir().join("lsn_test_history_newfile");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let history_root = dir.join("history");
        let file_path = dir.join("brand-new.md");

        // File doesn't exist yet — nothing to snapshot.
        snapshot_previous_version(&history_root, &file_path).unwrap();
        assert!(!history_root.exists(), "no history directory should be created for a file that never existed");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prunes_to_max_history_versions() {
        let dir = std::env::temp_dir().join("lsn_test_history_prune");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let history_root = dir.join("history");
        let file_path = dir.join("note.md");

        std::fs::write(&file_path, "v0").unwrap();
        for i in 1..=(MAX_HISTORY_VERSIONS + 5) {
            snapshot_previous_version(&history_root, &file_path).unwrap();
            std::fs::write(&file_path, format!("v{i}")).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(5));
        }

        let key = path_history_key(&file_path.to_string_lossy());
        let versions_dir = history_root.join(&key);
        let count = std::fs::read_dir(&versions_dir).unwrap().count();
        assert_eq!(count, MAX_HISTORY_VERSIONS, "history must be capped at MAX_HISTORY_VERSIONS");

        let _ = std::fs::remove_dir_all(&dir);
    }
}

// ---------------------------------------------------------------------------
// OpenCode Agent: process management commands
//
// These commands manage the lifecycle of an `opencode serve` sidecar process
// that powers the OpenCode Agent tab in the AI Assistant Panel.
//
// Security notes (spec §"Corrected: Secrets Handling"):
// - BYOK API keys are injected as env vars scoped to the child process only.
// - They are NEVER written to disk (no ~/.config/opencode/config.json writes).
// - A per-session random password (OPENCODE_SERVER_PASSWORD) is generated by the
//   frontend and passed here; held only in Zustand state (never localStorage).
// - Ollama/local provider needs no API key env var at all.
// ---------------------------------------------------------------------------

/// Resolves the `opencode` binary via the OS (*not* a shell, so npm `.cmd` shims are
/// ignored), returning whether it is runnable plus the version string for diagnostics
/// (OPENCODE_HTTP500_DIAGNOSIS_PLAN.md, workstream B — the UI needs to tell a stale
/// or foreign CLI apart from the one the sidecar actually runs).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeCheck {
    pub installed: bool,
    pub version: Option<String>,
}

#[tauri::command]
pub fn check_opencode_installed() -> OpenCodeCheck {
    match std::process::Command::new("opencode").arg("--version").output() {
        Ok(out) => {
            let installed = out.status.success();
            let version = if installed {
                let first = String::from_utf8_lossy(&out.stdout)
                    .trim()
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if first.is_empty() { None } else { Some(first) }
            } else {
                None
            };
            OpenCodeCheck { installed, version }
        }
        Err(_) => OpenCodeCheck { installed: false, version: None },
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeSpawn {
    pub pid: u32,
    pub port: u16,
    /// `opencode --version` output from the binary that was spawned, if resolvable.
    pub version: Option<String>,
}

/// Finds a free TCP port at or after `start` by probe-binding 127.0.0.1.
/// Used so the OpenCode sidecar can pick a free port when the configured one
/// is already taken by a stale/foreign `opencode serve` (a known failure mode:
/// the child silently fails to bind, and the readiness probe would otherwise
/// 401 against the *other* server on the same port).
fn find_free_port(start: u16) -> Result<u16, String> {
    for port in start..=(start.saturating_add(50)) {
        if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }
    Err(format!(
        "No free port found starting at {start} (ports {start}–{} all in use)",
        start.saturating_add(50)
    ))
}

/// Chooses the sidecar port: honors the user's configured port while it is free,
/// otherwise jumps to a RANDOM high port instead of deterministically walking the
/// 4096-4100 range (OPENCODE_HTTP500_DIAGNOSIS_PLAN.md, workstream C). Foreign/own
/// `opencode serve` processes pile up on the low range (four live on 4096-4099 on
/// the developer machine), so a fresh spawn must not be pushed onto the same 50-port
/// band every time. `find_free_port` then reserves a contiguous fallback band from
/// the randomized base.
fn pick_sidecar_port(configured: u16) -> Result<u16, String> {
    if std::net::TcpListener::bind(("127.0.0.1", configured)).is_ok() {
        return Ok(configured);
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0) as u64;
    let base = 40000 + ((nanos + u64::from(std::process::id())) % 5000) as u16;
    find_free_port(base)
}

/// Spawns `opencode serve --port <port>` in the given workspace directory.
///
/// `provider_env` is a map of env var → value for the user's BYOK credentials
/// (e.g. {"OPENAI_API_KEY": "sk-...", "GOOGLE_GENERATIVE_AI_API_KEY": "AIza..."}).
/// `server_password` is injected as OPENCODE_SERVER_PASSWORD so the local HTTP
/// endpoint is authenticated even though it only binds to localhost.
/// Returns the child PID **and the port actually bound** (which may differ from
/// `port` if that one is already in use) on success, or an error string on failure.
#[tauri::command]
pub fn spawn_opencode_server(
    app_handle: tauri::AppHandle,
    port: u16,
    workspace_path: String,
    server_password: String,
    provider_env: std::collections::HashMap<String, String>,
    mcp_override: Option<String>,
    mcp_env: Option<std::collections::HashMap<String, String>>,
) -> Result<OpenCodeSpawn, String> {
    let workspace = std::path::Path::new(&workspace_path);
    if !workspace.exists() {
        return Err(format!(
            "Workspace path does not exist: {}",
            workspace_path
        ));
    }

    // Paseo PID Lock check: before spawning a new sidecar, if an existing PID lock exists,
    // attempt to kill any orphaned sidecar from a prior run.
    if let Some(existing) = read_opencode_pid_lock(&app_handle) {
        let _ = kill_opencode_server_internal(Some(&app_handle), existing.pid);
    }

    let actual_port = pick_sidecar_port(port)?;

    // Capture the sidecar's stdout+stderr into the app-data dir instead of swallowing
    // it (OPENCODE_HTTP500_DIAGNOSIS_PLAN.md, workstream B). Provider/model init failures,
    // config-load errors and storage-lock problems all print here before the message
    // endpoint 500s — without this the HTTP body is the only evidence, and it is often empty.
    let server_log_path = {
        let dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Could not resolve app data dir: {e}"))?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        dir.join(format!("opencode-server.{actual_port}.log"))
    };
    let log_file = std::fs::File::create(&server_log_path)
        .map_err(|e| format!("Failed to create opencode server log: {e}"))?;
    let log_file_err = log_file
        .try_clone()
        .map_err(|e| format!("Failed to clone opencode server log handle: {e}"))?;

    let mut cmd = std::process::Command::new("opencode");
    cmd.arg("serve")
        .arg("--port")
        .arg(actual_port.to_string())
        // Scope OpenCode's file tools to the user's vault.
        .current_dir(workspace)
        // Authenticate the local HTTP endpoint per spec §"Corrected: Local Server Authentication"
        .env("OPENCODE_SERVER_PASSWORD", &server_password)
        .stdout(std::process::Stdio::from(log_file))
        .stderr(std::process::Stdio::from(log_file_err));

    // Inject BYOK credentials scoped to this child process only — never written to disk.
    for (key, value) in &provider_env {
        if !value.is_empty() {
            cmd.env(key, value);
        }
    }

    // OpenCode config export (§ MCP_CONNECTORS_PLAN 6.3): OpenCode has no CLI flag to
    // register MCP servers or permissions for `serve` (verified: v1.18 accepts only
    // project/global config), so we write a project-local `opencode.json` carrying the
    // MCP connector registry plus a default `permission` block (bash denied — "ask" has
    // no documented approval flow over `serve`'s HTTP/SSE API, only in OpenCode's own
    // TUI) — but ONLY when the vault has no existing opencode config, so a user's own
    // config (including their own permission choices) is never clobbered. Secrets
    // (headers/env) are exported as `{env:VAR}` placeholders; the real values are
    // injected into this child's environment only, so nothing secret hits disk.
    //
    // `kill_opencode_server` deletes this file on a clean stop, but an unclean exit
    // (crash, force-kill, OS shutdown) can orphan it in the vault — and on the next
    // launch `OPENCODE_MCP_CONFIG` starts empty, so this process has no memory of
    // having written it. Without a way to tell "our own leftover export" apart from
    // "a real user config", a mere `exists()` check would treat that orphan as sacred
    // and skip the export forever, silently keeping stale MCP servers/permissions.
    // So the file we write carries a `_lsnManaged: true` marker, and only a file at
    // the exact export path bearing that marker is treated as safely overwritable;
    // anything else that exists (marker-less, or one of the alternate config paths/
    // extensions) is assumed to be the user's own and is left untouched.
    if let Some(override_str) = mcp_override.filter(|s| !s.trim().is_empty()) {
        let dot_opencode = workspace.join(".opencode");
        let config_file = workspace.join("opencode.json");
        let other_user_config_paths = [
            workspace.join("opencode.jsonc"),
            dot_opencode.join("opencode.json"),
            dot_opencode.join("opencode.jsonc"),
        ];
        let is_our_own_export = std::fs::read_to_string(&config_file)
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| v.get("_lsnManaged").and_then(serde_json::Value::as_bool))
            .unwrap_or(false);
        let has_foreign_config = other_user_config_paths.iter().any(|p| p.exists())
            || (config_file.exists() && !is_our_own_export);
        if has_foreign_config {
            eprintln!("[OpenCode] existing user-authored opencode config found; skipping config export (including default permissions)");
        } else {
            std::fs::write(&config_file, &override_str).map_err(|e| {
                format!("Failed to write connector config for opencode serve: {e}")
            })?;
            if let Some(env) = mcp_env {
                for (key, value) in env {
                    if !value.is_empty() {
                        cmd.env(key, value);
                    }
                }
            }
            if let Some(lock) = OPENCODE_MCP_CONFIG.get() {
                lock.lock().map_err(|e| e.to_string())?.replace(config_file);
            } else {
                let _ = OPENCODE_MCP_CONFIG.set(Mutex::new(Some(config_file)));
            }
        }
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn opencode serve: {e}"))?;

    let child_pid = child.id();
    write_opencode_pid_lock(&app_handle, child_pid, actual_port);

    if let Some(lock) = OPENCODE_SERVER_LOG.get() {
        lock.lock()
            .map_err(|e| e.to_string())?
            .replace(server_log_path);
    } else {
        let _ = OPENCODE_SERVER_LOG.set(Mutex::new(Some(server_log_path)));
    }

    // Version of the binary we actually spawned — lets the UI/support tell a stale or
    // foreign CLI apart from ours when triaging HTTP 500s (workstream B).
    let version = std::process::Command::new("opencode")
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            let first = String::from_utf8_lossy(&o.stdout)
                .trim()
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            (!first.is_empty()).then_some(first)
        });

    Ok(OpenCodeSpawn {
        pid: child_pid,
        port: actual_port,
        version,
    })
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodePidLock {
    pub pid: u32,
    pub port: u16,
    pub start_time: String,
}

pub fn get_opencode_pid_file(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("opencode.pid"))
}

pub fn write_opencode_pid_lock(app_handle: &tauri::AppHandle, pid: u32, port: u16) {
    if let Ok(pid_path) = get_opencode_pid_file(app_handle) {
        let lock = OpenCodePidLock {
            pid,
            port,
            start_time: now_iso(),
        };
        if let Ok(content) = serde_json::to_string(&lock) {
            let _ = std::fs::write(pid_path, content);
        }
    }
}

pub fn remove_opencode_pid_lock(app_handle: &tauri::AppHandle) {
    if let Ok(pid_path) = get_opencode_pid_file(app_handle) {
        if pid_path.exists() {
            let _ = std::fs::remove_file(pid_path);
        }
    }
}

pub fn read_opencode_pid_lock(app_handle: &tauri::AppHandle) -> Option<OpenCodePidLock> {
    let pid_path = get_opencode_pid_file(app_handle).ok()?;
    if !pid_path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(pid_path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn kill_opencode_server_internal(app_handle: Option<&tauri::AppHandle>, pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }

    if let Some(app) = app_handle {
        remove_opencode_pid_lock(app);
    }

    // Remove the connector-export config we wrote into the vault (if any).
    if let Ok(mut lock) = OPENCODE_MCP_CONFIG.get_or_init(Default::default).lock() {
        if let Some(path) = lock.take() {
            let _ = std::fs::remove_file(path);
        }
    }

    // Remove the sidecar's stdout/stderr capture
    if let Ok(mut lock) = OPENCODE_SERVER_LOG.get_or_init(Default::default).lock() {
        if let Some(path) = lock.take() {
            let _ = std::fs::remove_file(path);
        }
    }
    Ok(())
}

/// App exit / shutdown hook: reads `opencode.pid` if present and terminates orphaned sidecar.
pub fn cleanup_opencode_on_exit(app_handle: &tauri::AppHandle) {
    if let Some(lock) = read_opencode_pid_lock(app_handle) {
        let _ = kill_opencode_server_internal(Some(app_handle), lock.pid);
    }
}

/// Kills a running OpenCode server process by PID (exposed as Tauri command).
#[tauri::command]
pub fn kill_opencode_server(app_handle: tauri::AppHandle, pid: u32) -> Result<(), String> {
    kill_opencode_server_internal(Some(&app_handle), pid)
}

// ---------------------------------------------------------------------------
// AI debug log (opt-in, "Verbose AI Tool Logging" in Settings)
//
// A single append-only plain-text file in the app-data dir. Written to only when
// the frontend explicitly enables the setting — this is for diagnosing tool-calling/
// agentic behavior (which tools were offered, which were called, what came back)
// without needing to reconstruct raw SSE payloads by hand through browser DevTools.
// ---------------------------------------------------------------------------

fn ai_debug_log_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("ai-debug.log"))
}

#[tauri::command]
pub fn append_ai_debug_log(app_handle: tauri::AppHandle, line: String) -> Result<(), String> {
    use std::io::Write;
    let path = ai_debug_log_path(&app_handle)?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{line}").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ai_debug_log_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    Ok(ai_debug_log_path(&app_handle)?.to_string_lossy().to_string())
}


// ---------------------------------------------------------------------------
// Agent Orchestration Layer (Phase 1-3): persistent agent sessions, goal runs,
// and scheduled tasks. Thin persist/query/clock commands — no AI HTTP here.
// ---------------------------------------------------------------------------

fn now_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub id: String,
    pub title: Option<String>,
    pub agent: Option<String>,
    pub engine: Option<String>,
    pub model: Option<String>,
    pub status: String,
    pub goal: Option<String>,
    pub parent_id: Option<String>,
    pub opencode_session_id: Option<String>,
    pub project_path: Option<String>,
    pub context: Option<String>,
    pub summary: Option<String>,
    pub tokens: i64,
    pub cost: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

fn session_from_row(row: &rusqlite::Row) -> rusqlite::Result<AgentSession> {
    Ok(AgentSession {
        id: row.get("id")?,
        title: row.get("title")?,
        agent: row.get("agent")?,
        engine: row.get("engine")?,
        model: row.get("model")?,
        status: row.get("status")?,
        goal: row.get("goal")?,
        parent_id: row.get("parent_id")?,
        opencode_session_id: row.get("opencode_session_id").unwrap_or(None),
        project_path: row.get("project_path")?,
        context: row.get("context")?,
        summary: row.get("summary")?,
        tokens: row.get("tokens").unwrap_or(0),
        cost: row.get("cost").unwrap_or(0.0),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn create_agent_session_internal(
    conn: &rusqlite::Connection,
    title: Option<String>,
    agent: Option<String>,
    engine: Option<String>,
    model: Option<String>,
    parent_id: Option<String>,
) -> Result<AgentSession, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();
    conn.execute(
        "INSERT INTO agent_sessions (id, title, agent, engine, model, status, goal, parent_id, opencode_session_id, context, summary, tokens, cost, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'idle', NULL, ?6, NULL, NULL, NULL, 0, 0, ?7, ?7)",
        rusqlite::params![id, title, agent, engine, model, parent_id, now],
    )
    .map_err(|e| format!("Failed to create agent session: {e}"))?;

    conn.query_row(
        "SELECT id, title, agent, engine, model, status, goal, parent_id, opencode_session_id, project_path, context, summary, tokens, cost, created_at, updated_at
         FROM agent_sessions WHERE id = ?1",
        [&id],
        session_from_row,
    )
    .map_err(|e| format!("Failed to read back agent session: {e}"))
}

fn list_agent_sessions_internal(conn: &rusqlite::Connection) -> Result<Vec<AgentSession>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, agent, engine, model, status, goal, parent_id, opencode_session_id, project_path, context, summary, tokens, cost, created_at, updated_at
             FROM agent_sessions WHERE status != 'archived' ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("Failed to prepare list_agent_sessions: {e}"))?;
    let rows = stmt
        .query_map([], session_from_row)
        .map_err(|e| format!("Failed to query agent sessions: {e}"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn get_agent_session_internal(
    conn: &rusqlite::Connection,
    id: String,
) -> Result<AgentSession, String> {
    conn.query_row(
        "SELECT id, title, agent, engine, model, status, goal, parent_id, opencode_session_id, project_path, context, summary, tokens, cost, created_at, updated_at
         FROM agent_sessions WHERE id = ?1",
        [&id],
        session_from_row,
    )
    .map_err(|e| format!("Agent session not found: {e}"))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPatch {
    pub title: Option<String>,
    pub goal: Option<String>,
    pub summary: Option<String>,
    pub status: Option<String>,
    pub context: Option<String>,
    pub opencode_session_id: Option<String>,
    pub tokens: Option<i64>,
    pub cost: Option<f64>,
}

fn patch_agent_session_internal(
    conn: &rusqlite::Connection,
    id: String,
    fields: SessionPatch,
) -> Result<AgentSession, String> {
    let now = now_millis();
    conn.execute(
        "UPDATE agent_sessions
         SET title = COALESCE(?2, title),
             goal = COALESCE(?3, goal),
             summary = COALESCE(?4, summary),
             status = COALESCE(?5, status),
             context = COALESCE(?6, context),
             tokens = COALESCE(?7, tokens),
             cost = COALESCE(?8, cost),
             opencode_session_id = COALESCE(?9, opencode_session_id),
             updated_at = ?10
         WHERE id = ?1",
        rusqlite::params![
            id,
            fields.title,
            fields.goal,
            fields.summary,
            fields.status,
            fields.context,
            fields.tokens,
            fields.cost,
            fields.opencode_session_id,
            now
        ],
    )
    .map_err(|e| format!("Failed to patch agent session: {e}"))?;

    conn.query_row(
        "SELECT id, title, agent, engine, model, status, goal, parent_id, opencode_session_id, project_path, context, summary, tokens, cost, created_at, updated_at
         FROM agent_sessions WHERE id = ?1",
        [&id],
        session_from_row,
    )
    .map_err(|e| format!("Failed to read back agent session: {e}"))
}

fn archive_agent_session_internal(conn: &rusqlite::Connection, id: String) -> Result<(), String> {
    conn.execute(
        "UPDATE agent_sessions SET status = 'archived', updated_at = ?2 WHERE id = ?1",
        rusqlite::params![id, now_millis()],
    )
    .map_err(|e| format!("Failed to archive agent session: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn create_agent_session(
    state: State<DbState>,
    title: Option<String>,
    agent: Option<String>,
    engine: Option<String>,
    model: Option<String>,
    parent_id: Option<String>,
) -> Result<AgentSession, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    create_agent_session_internal(&conn, title, agent, engine, model, parent_id)
}

#[tauri::command]
pub fn fork_agent_session(state: State<DbState>, session_id: String) -> Result<AgentSession, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    fork_agent_session_internal(&conn, session_id)
}

fn fork_agent_session_internal(
    conn: &rusqlite::Connection,
    session_id: String,
) -> Result<AgentSession, String> {
    let parent = get_agent_session_internal(conn, session_id.clone())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();
    let child_title = parent.title.as_ref().map(|t| format!("{t} (fork)"));
    conn.execute(
        "INSERT INTO agent_sessions (id, title, agent, engine, model, status, goal, parent_id, opencode_session_id, project_path, context, summary, tokens, cost, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'idle', ?6, ?7, NULL, ?8, ?9, NULL, 0, 0, ?10, ?10)",
        rusqlite::params![
            id,
            child_title,
            parent.agent,
            parent.engine,
            parent.model,
            parent.goal,
            Some(session_id.clone()), // child links to the source session it was forked from.
            parent.project_path,
            parent.context,
            now
        ],
    )
    .map_err(|e| format!("Failed to fork agent session: {e}"))?;

    conn.query_row(
        "SELECT id, title, agent, engine, model, status, goal, parent_id, opencode_session_id, project_path, context, summary, tokens, cost, created_at, updated_at
         FROM agent_sessions WHERE id = ?1",
        [&id],
        session_from_row,
    )
    .map_err(|e| format!("Failed to read back forked agent session: {e}"))
}

#[tauri::command]
pub fn list_agent_sessions(state: State<DbState>) -> Result<Vec<AgentSession>, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    list_agent_sessions_internal(&conn)
}

#[tauri::command]
pub fn get_agent_session(state: State<DbState>, id: String) -> Result<AgentSession, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    get_agent_session_internal(&conn, id)
}

#[tauri::command]
pub fn patch_agent_session(
    state: State<DbState>,
    id: String,
    fields: SessionPatch,
) -> Result<AgentSession, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    patch_agent_session_internal(&conn, id, fields)
}

#[tauri::command]
pub fn archive_agent_session(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    archive_agent_session_internal(&conn, id)
}

fn delete_agent_session_internal(conn: &rusqlite::Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM agent_sessions WHERE id = ?1", [id])
        .map_err(|e| format!("Failed to delete agent session: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_agent_session(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    delete_agent_session_internal(&conn, id)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRun {
    pub id: String,
    pub session_id: String,
    pub goal: String,
    pub status: String,
    pub iterations: i64,
    pub stuck_strikes: i64,
    pub token_budget: i64,
    pub auditor_model: Option<String>,
    pub result_summary: Option<String>,
    pub started_at: i64,
    pub finished_at: Option<i64>,
}

fn start_agent_run_internal(
    conn: &rusqlite::Connection,
    session_id: String,
    goal: String,
    token_budget: Option<i64>,
) -> Result<AgentRun, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();
    conn.execute(
        "INSERT INTO agent_runs (id, session_id, goal, status, iterations, stuck_strikes, token_budget, started_at)
         VALUES (?1, ?2, ?3, 'running', 0, 0, ?4, ?5)",
        rusqlite::params![id, session_id, goal, token_budget.unwrap_or(80000), now],
    )
    .map_err(|e| format!("Failed to start agent run: {e}"))?;

    let run = conn
        .query_row(
            "SELECT id, session_id, goal, status, iterations, stuck_strikes, token_budget, auditor_model, result_summary, started_at, finished_at
             FROM agent_runs WHERE id = ?1",
            [&id],
            |row| {
                Ok(AgentRun {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    goal: row.get(2)?,
                    status: row.get(3)?,
                    iterations: row.get(4)?,
                    stuck_strikes: row.get(5)?,
                    token_budget: row.get(6)?,
                    auditor_model: row.get(7)?,
                    result_summary: row.get(8)?,
                    started_at: row.get(9)?,
                    finished_at: row.get(10)?,
                })
            },
        )
        .map_err(|e| format!("Failed to read back agent run: {e}"))?;

    conn.execute(
        "UPDATE agent_sessions SET status = 'working', updated_at = ?2 WHERE id = ?1",
        rusqlite::params![session_id, now],
    )
    .map_err(|e| format!("Failed to mark session working: {e}"))?;

    Ok(run)
}

fn record_run_turn_internal(
    conn: &rusqlite::Connection,
    run_id: String,
    iterations: i64,
    stuck_strikes: i64,
    status: String,
    token_estimate: Option<i64>,
    cost: Option<f64>,
) -> Result<(), String> {
    let finished_at = if status == "done" || status == "blocked" || status == "failed" || status == "stopped" {
        Some(now_millis())
    } else {
        None
    };
    conn.execute(
        "UPDATE agent_runs
         SET iterations = ?2, stuck_strikes = ?3, status = ?4, finished_at = ?5,
             token_estimate = COALESCE(?6, token_estimate),
             cost = COALESCE(?7, cost)
         WHERE id = ?1",
        rusqlite::params![run_id, iterations, stuck_strikes, status, finished_at, token_estimate, cost],
    )
    .map_err(|e| format!("Failed to record run turn: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn start_agent_run(
    state: State<DbState>,
    session_id: String,
    goal: String,
    token_budget: Option<i64>,
) -> Result<AgentRun, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    start_agent_run_internal(&conn, session_id, goal, token_budget)
}

#[tauri::command]
pub fn record_run_turn(
    state: State<DbState>,
    run_id: String,
    iterations: i64,
    stuck_strikes: i64,
    status: String,
    token_estimate: Option<i64>,
    cost: Option<f64>,
) -> Result<(), String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    record_run_turn_internal(&conn, run_id, iterations, stuck_strikes, status, token_estimate, cost)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledTask {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub model: Option<String>,
    pub agent: Option<String>,
    pub scope: String,
    pub schedule_sel: String,
    pub cron: Option<String>,
    pub weekday: Option<String>,
    pub time: String,
    pub timezone: Option<String>,
    pub disabled: bool,
    pub last_run_at: Option<i64>,
    pub next_run: Option<i64>,
    pub created_at: i64,
}

fn task_from_row(row: &rusqlite::Row) -> rusqlite::Result<ScheduledTask> {
    Ok(ScheduledTask {
        id: row.get("id")?,
        name: row.get("name")?,
        prompt: row.get("prompt")?,
        model: row.get("model")?,
        agent: row.get("agent")?,
        scope: row.get("scope")?,
        schedule_sel: row.get("schedule_sel")?,
        cron: row.get("cron")?,
        weekday: row.get("weekday")?,
        time: row.get("time")?,
        timezone: row.get("timezone")?,
        disabled: row.get("disabled").map(|v: i64| v != 0).unwrap_or(false),
        last_run_at: row.get("last_run_at")?,
        next_run: row.get("next_run")?,
        created_at: row.get("created_at")?,
    })
}

fn create_scheduled_task_internal(
    conn: &rusqlite::Connection,
    name: String,
    prompt: String,
    model: Option<String>,
    agent: Option<String>,
    scope: Option<String>,
    schedule_sel: String,
    cron: Option<String>,
    weekday: Option<String>,
    time: String,
    timezone: Option<String>,
    disabled: Option<bool>,
) -> Result<ScheduledTask, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();
    let next_run = compute_next_run(&schedule_sel, &cron, &weekday, &time);
    conn.execute(
        "INSERT INTO scheduled_tasks (id, name, prompt, model, agent, scope, schedule_sel, cron, weekday, time, timezone, disabled, next_run, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            id, name, prompt, model, agent,
            scope.unwrap_or_else(|| "session".to_string()),
            schedule_sel, cron, weekday, time, timezone,
            if disabled.unwrap_or(false) { 1 } else { 0 },
            next_run, now
        ],
    )
    .map_err(|e| format!("Failed to create scheduled task: {e}"))?;

    conn.query_row(
        "SELECT id, name, prompt, model, agent, scope, schedule_sel, cron, weekday, time, timezone, disabled, last_run_at, next_run, created_at
         FROM scheduled_tasks WHERE id = ?1",
        [&id],
        task_from_row,
    )
    .map_err(|e| format!("Failed to read back scheduled task: {e}"))
}

fn list_scheduled_tasks_internal(conn: &rusqlite::Connection) -> Result<Vec<ScheduledTask>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, prompt, model, agent, scope, schedule_sel, cron, weekday, time, timezone, disabled, last_run_at, next_run, created_at
             FROM scheduled_tasks ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Failed to prepare list_scheduled_tasks: {e}"))?;
    let rows = stmt
        .query_map([], task_from_row)
        .map_err(|e| format!("Failed to query scheduled tasks: {e}"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPatch {
    pub name: Option<String>,
    pub prompt: Option<String>,
    pub model: Option<String>,
    pub agent: Option<String>,
    pub schedule_sel: Option<String>,
    pub cron: Option<String>,
    pub weekday: Option<String>,
    pub time: Option<String>,
    pub timezone: Option<String>,
    pub disabled: Option<bool>,
}

fn patch_scheduled_task_internal(
    conn: &rusqlite::Connection,
    id: String,
    fields: TaskPatch,
) -> Result<ScheduledTask, String> {
    let schedule_sel = fields.schedule_sel.clone().unwrap_or_else(|| "once".to_string());
    let cron = fields.cron.clone();
    let weekday = fields.weekday.clone();
    let time = fields.time.clone().unwrap_or_else(|| "09:00".to_string());
    let next_run = compute_next_run(&schedule_sel, &cron, &weekday, &time);
    conn.execute(
        "UPDATE scheduled_tasks
         SET name = COALESCE(?2, name),
             prompt = COALESCE(?3, prompt),
             model = COALESCE(?4, model),
             agent = COALESCE(?5, agent),
             schedule_sel = COALESCE(?6, schedule_sel),
             cron = COALESCE(?7, cron),
             weekday = COALESCE(?8, weekday),
             time = COALESCE(?9, time),
             timezone = COALESCE(?10, timezone),
             disabled = ?11,
             next_run = ?12
         WHERE id = ?1",
        rusqlite::params![
            id, fields.name, fields.prompt, fields.model, fields.agent,
            fields.schedule_sel, fields.cron, fields.weekday, fields.time, fields.timezone,
            if fields.disabled.unwrap_or(false) { 1 } else { 0 },
            next_run
        ],
    )
    .map_err(|e| format!("Failed to patch scheduled task: {e}"))?;

    conn.query_row(
        "SELECT id, name, prompt, model, agent, scope, schedule_sel, cron, weekday, time, timezone, disabled, last_run_at, next_run, created_at
         FROM scheduled_tasks WHERE id = ?1",
        [&id],
        task_from_row,
    )
    .map_err(|e| format!("Failed to read back scheduled task: {e}"))
}

fn delete_scheduled_task_internal(conn: &rusqlite::Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM task_run_log WHERE task_id = ?1", [&id])
        .map_err(|e| format!("Failed to delete task run log: {e}"))?;
    conn.execute("DELETE FROM scheduled_tasks WHERE id = ?1", [&id])
        .map_err(|e| format!("Failed to delete scheduled task: {e}"))?;
    Ok(())
}

fn check_due_tasks_internal(conn: &rusqlite::Connection) -> Result<Vec<ScheduledTask>, String> {
    let now = now_millis();
    let mut stmt = conn
        .prepare(
            "SELECT id, name, prompt, model, agent, scope, schedule_sel, cron, weekday, time, timezone, disabled, last_run_at, next_run, created_at
             FROM scheduled_tasks
             WHERE disabled = 0 AND next_run IS NOT NULL AND next_run <= ?1
             ORDER BY next_run ASC",
        )
        .map_err(|e| format!("Failed to prepare check_due_tasks: {e}"))?;
    let rows = stmt
        .query_map([now], task_from_row)
        .map_err(|e| format!("Failed to query due tasks: {e}"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn log_task_run_internal(
    conn: &rusqlite::Connection,
    task_id: String,
    session_id: Option<String>,
    status: String,
    summary: Option<String>,
) -> Result<(), String> {
    let now = now_millis();
    let log_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "UPDATE scheduled_tasks SET last_run_at = ?2 WHERE id = ?1",
        rusqlite::params![task_id, now],
    )
    .map_err(|e| format!("Failed to update task last_run_at: {e}"))?;
    conn.execute(
        "INSERT INTO task_run_log (id, task_id, session_id, status, result_summary, started_at, finished_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        rusqlite::params![log_id, task_id, session_id, status, summary, now],
    )
    .map_err(|e| format!("Failed to log task run: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn create_scheduled_task(
    state: State<DbState>,
    name: String,
    prompt: String,
    model: Option<String>,
    agent: Option<String>,
    scope: Option<String>,
    schedule_sel: String,
    cron: Option<String>,
    weekday: Option<String>,
    time: String,
    timezone: Option<String>,
    disabled: Option<bool>,
) -> Result<ScheduledTask, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    create_scheduled_task_internal(
        &conn, name, prompt, model, agent, scope, schedule_sel, cron, weekday, time, timezone, disabled,
    )
}

#[tauri::command]
pub fn list_scheduled_tasks(state: State<DbState>) -> Result<Vec<ScheduledTask>, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    list_scheduled_tasks_internal(&conn)
}

#[tauri::command]
pub fn patch_scheduled_task(
    state: State<DbState>,
    id: String,
    fields: TaskPatch,
) -> Result<ScheduledTask, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    patch_scheduled_task_internal(&conn, id, fields)
}

#[tauri::command]
pub fn delete_scheduled_task(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    delete_scheduled_task_internal(&conn, id)
}

#[tauri::command]
pub fn check_due_tasks(state: State<DbState>) -> Result<Vec<ScheduledTask>, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    check_due_tasks_internal(&conn)
}

#[tauri::command]
pub fn log_task_run(
    state: State<DbState>,
    task_id: String,
    session_id: Option<String>,
    status: String,
    summary: Option<String>,
) -> Result<(), String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    log_task_run_internal(&conn, task_id, session_id, status, summary)
}

/// Computes the next epoch-ms timestamp for a schedule selector.
/// 'once' → 24h from now; 'daily' → next occurrence of `time` today or tomorrow;
/// 'weekly' → next selected weekday at `time`; 'cron' → naive +24h (real cron parser
/// is out of scope); anything else → None (never auto-runs).
fn compute_next_run(
    kind: &str,
    cron: &Option<String>,
    weekday: &Option<String>,
    time: &str,
) -> Option<i64> {
    use chrono::{Datelike, Timelike};
    let now = chrono::Utc::now();
    let hm = time.split(':').collect::<Vec<_>>();
    let hour: u32 = hm.first().and_then(|h| h.parse().ok()).unwrap_or(9);
    let minute: u32 = hm.get(1).and_then(|m| m.parse().ok()).unwrap_or(0);

    match kind {
        "once" | "cron" => {
            let _ = cron;
            Some(
                (now + chrono::Duration::days(1))
                    .with_hour(hour.min(23))
                    .and_then(|d| d.with_minute(minute.min(59)))
                    .and_then(|d| d.with_second(0))
                    .unwrap_or(now + chrono::Duration::days(1))
                    .timestamp_millis(),
            )
        }
        "daily" => {
            let mut next = now
                .with_hour(hour.min(23))
                .and_then(|d| d.with_minute(minute.min(59)))
                .and_then(|d| d.with_second(0))
                .unwrap_or(now);
            if next <= now {
                next = next + chrono::Duration::days(1);
            }
            Some(next.timestamp_millis())
        }
"weekly" => {
            let weekday = weekday.as_deref().unwrap_or_default();
            let days = weekday
                .split(',')
                .filter_map(|d| d.trim().parse::<u32>().ok())
                .collect::<Vec<_>>();
            if days.is_empty() {
                return Some(
                    (now + chrono::Duration::days(7))
                        .with_hour(hour.min(23))
                        .and_then(|d| d.with_minute(minute.min(59)))
                        .and_then(|d| d.with_second(0))
                        .unwrap_or(now + chrono::Duration::days(7))
                        .timestamp_millis(),
                );
            }
            let today = now.weekday().num_days_from_monday() as u32;
            for offset in 0..=7u32 {
                let candidate_day = (today + offset) % 7;
                if days.contains(&candidate_day) {
                    let mut candidate = now
                        .with_hour(hour.min(23))
                        .and_then(|d| d.with_minute(minute.min(59)))
                        .and_then(|d| d.with_second(0))
                        .unwrap_or(now);
                    candidate = candidate + chrono::Duration::days(i64::from(offset));
                    if candidate <= now {
                        candidate = candidate + chrono::Duration::days(7);
                    }
                    return Some(candidate.timestamp_millis());
                }
            }
            None
        }
_ => None,
    }
}

#[cfg(test)]
mod agent_orchestration_tests {
    use super::*;
    use rusqlite::Connection;

    /// Minimal schema mirroring the agent tables created in db.rs, enough for the
    /// internal helpers to round-trip against.
    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE agent_sessions (
                 id            TEXT PRIMARY KEY,
                 title         TEXT,
                 agent         TEXT,
                 engine        TEXT,
                 model         TEXT,
                 status        TEXT NOT NULL DEFAULT 'idle',
                 goal          TEXT,
                 parent_id     TEXT REFERENCES agent_sessions(id),
                 opencode_session_id TEXT,
                 project_path  TEXT,
                 context       TEXT,
                 summary       TEXT,
                 tokens        INTEGER DEFAULT 0,
                 cost          REAL DEFAULT 0,
                 created_at    INTEGER NOT NULL,
                 updated_at    INTEGER NOT NULL
             );
             CREATE TABLE agent_runs (
                 id             TEXT PRIMARY KEY,
                 session_id     TEXT NOT NULL REFERENCES agent_sessions(id),
                 goal           TEXT NOT NULL,
                 status         TEXT NOT NULL DEFAULT 'running',
                 iterations     INTEGER DEFAULT 0,
                 stuck_strikes  INTEGER DEFAULT 0,
                 token_budget   INTEGER DEFAULT 80000,
                 token_estimate INTEGER DEFAULT 0,
                 cost           REAL DEFAULT 0,
                 auditor_model  TEXT,
                 result_summary TEXT,
                 started_at     INTEGER NOT NULL,
                 finished_at    INTEGER
             );
             CREATE TABLE scheduled_tasks (
                 id            TEXT PRIMARY KEY,
                 name          TEXT NOT NULL,
                 prompt        TEXT NOT NULL,
                 model         TEXT,
                 agent         TEXT,
                 scope         TEXT NOT NULL DEFAULT 'session',
                 schedule_sel  TEXT NOT NULL,
                 cron          TEXT,
                 weekday       TEXT,
                 time          TEXT,
                 timezone      TEXT,
                 disabled      INTEGER NOT NULL DEFAULT 0,
                 last_run_at   INTEGER,
                 next_run      INTEGER,
                 created_at    INTEGER NOT NULL
             );
             CREATE TABLE task_run_log (
                 id            TEXT PRIMARY KEY,
                 task_id       TEXT REFERENCES scheduled_tasks(id),
                 session_id    TEXT,
                 status        TEXT,
                 result_summary TEXT,
                 started_at    INTEGER NOT NULL,
                 finished_at   INTEGER
             );
             CREATE INDEX idx_agent_runs_session ON agent_runs(session_id);
             CREATE INDEX idx_task_next_run ON scheduled_tasks(next_run);
             CREATE INDEX idx_task_log_task ON task_run_log(task_id);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn create_list_patch_archive_session_round_trip() {
        let conn = test_conn();
        let created = create_agent_session_internal(
            &conn,
            Some("Review Physics".to_string()),
            Some("assistant".to_string()),
            Some("opencode".to_string()),
            Some("provider/model".to_string()),
            None,
        )
        .unwrap();
        assert_eq!(created.status, "idle");
        assert_eq!(created.title.as_deref(), Some("Review Physics"));

        let listed = list_agent_sessions_internal(&conn).unwrap();
        assert_eq!(listed.len(), 1);

        let patched = patch_agent_session_internal(
            &conn,
            created.id.clone(),
            SessionPatch {
                title: Some("Review Physics v2".to_string()),
                goal: Some("Summarize chapter 3".to_string()),
                summary: None,
                status: Some("working".to_string()),
                context: None,
                opencode_session_id: Some("sess-rehydrate-1".to_string()),
                tokens: Some(42),
                cost: None,
            },
        )
        .unwrap();
        assert_eq!(patched.title.as_deref(), Some("Review Physics v2"));
        assert_eq!(patched.goal.as_deref(), Some("Summarize chapter 3"));
        assert_eq!(patched.status, "working");
        assert_eq!(patched.tokens, 42);
        assert_eq!(patched.opencode_session_id.as_deref(), Some("sess-rehydrate-1"));

        let fetched = get_agent_session_internal(&conn, created.id).unwrap();
        assert_eq!(fetched.title.as_deref(), Some("Review Physics v2"));

        archive_agent_session_internal(&conn, fetched.id.clone()).unwrap();
        let listed_after_archive = list_agent_sessions_internal(&conn).unwrap();
        assert!(listed_after_archive.is_empty());

        conn.execute("DELETE FROM agent_sessions WHERE id = ?1", [&fetched.id]).unwrap();
        assert!(get_agent_session_internal(&conn, fetched.id).is_err());
    }

    #[test]
    fn fork_session_inherits_parent_and_links_lineage() {
        let conn = test_conn();
        let parent = create_agent_session_internal(
            &conn,
            Some("Parent chain".to_string()),
            Some("assistant".to_string()),
            Some("opencode".to_string()),
            Some("model-x".to_string()),
            None,
        )
        .unwrap();
        patch_agent_session_internal(
            &conn,
            parent.id.clone(),
            SessionPatch {
                title: None,
                goal: Some("Fork target goal".to_string()),
                summary: None,
                status: None,
                context: Some("[{\"role\":\"user\",\"content\":\"hi\"}]".to_string()),
                opencode_session_id: None,
                tokens: None,
                cost: None,
            },
        )
        .unwrap();

        let child = fork_agent_session_internal(&conn, parent.id.clone()).unwrap();
        assert_ne!(child.id, parent.id);
        assert_eq!(child.parent_id.as_deref(), Some(parent.id.as_str()));
        assert_eq!(child.goal.as_deref(), Some("Fork target goal"));
        assert_eq!(child.context.as_deref(), Some("[{\"role\":\"user\",\"content\":\"hi\"}]"));
        assert_eq!(child.engine.as_deref(), Some("opencode"));
        assert_eq!(child.status, "idle");
        // Fork title appends the (fork) marker.
        assert_eq!(child.title.as_deref(), Some("Parent chain (fork)"));

        // Forking the child keeps lineage chaining to the immediate source (the child).
        let grandchild = fork_agent_session_internal(&conn, child.id.clone()).unwrap();
        assert_eq!(grandchild.parent_id.as_deref(), Some(child.id.as_str()));
    }

    #[test]
    fn start_and_record_agent_run_with_session() {
        let conn = test_conn();
        let session =
            create_agent_session_internal(&conn, None, None, None, None, None).unwrap();

        let run = start_agent_run_internal(
            &conn,
            session.id.clone(),
            "Write notes for chapter 4".to_string(),
            Some(5000),
        )
        .unwrap();
        assert_eq!(run.status, "running");
        assert_eq!(run.token_budget, 5000);

        let session_after = get_agent_session_internal(&conn, session.id).unwrap();
        assert_eq!(session_after.status, "working");

        record_run_turn_internal(&conn, run.id.clone(), 3, 2, "done".to_string(), Some(1200), Some(0.0042)).unwrap();
        let finished: Option<i64> = conn
            .query_row(
                "SELECT finished_at FROM agent_runs WHERE id = ?1",
                [&run.id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(finished.is_some());
        let accounted: (i64, f64) = conn
            .query_row(
                "SELECT token_estimate, cost FROM agent_runs WHERE id = ?1",
                [&run.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(accounted, (1200, 0.0042));
    }

    #[test]
    fn scheduled_task_crud_and_due_check() {
        let conn = test_conn();
        let task = create_scheduled_task_internal(
            &conn,
            "Morning review".to_string(),
            "Summarize yesterday's notes".to_string(),
            None,
            None,
            None,
            "daily".to_string(),
            None,
            None,
            "09:00".to_string(),
            Some("local".to_string()),
            None,
        )
        .unwrap();
        assert_eq!(task.schedule_sel, "daily");
        assert!(task.next_run.is_some());

        let listed = list_scheduled_tasks_internal(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        let first = &listed[0];
        assert_eq!(first.id, task.id);

        patch_scheduled_task_internal(
            &conn,
            task.id.clone(),
            TaskPatch {
                name: Some("Morning review (new)".to_string()),
                prompt: None,
                model: None,
                agent: None,
                schedule_sel: None,
                cron: None,
                weekday: None,
                time: Some("10:30".to_string()),
                timezone: None,
                disabled: None,
            },
        )
        .unwrap();
        let patched = get_agent_session_internal(&conn, "nope".to_string());
        assert!(patched.is_err());

        let due = check_due_tasks_internal(&conn).unwrap();
        assert!(due.is_empty(), "daily task is not due yet");

        log_task_run_internal(
            &conn,
            task.id.clone(),
            Some("session-1".to_string()),
            "done".to_string(),
            Some("All good".to_string()),
        )
        .unwrap();
        let last_run: Option<i64> = conn
            .query_row(
                "SELECT last_run_at FROM scheduled_tasks WHERE id = ?1",
                [&task.id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(last_run.is_some());

        delete_scheduled_task_internal(&conn, task.id).unwrap();
        let listed_after = list_scheduled_tasks_internal(&conn).unwrap();
        assert!(listed_after.is_empty());
    }

    #[test]
    fn find_free_port_skips_occupied_ports() {
        // Occupy a port so the helper must skip it and pick a later one.
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let occupied = listener.local_addr().unwrap().port();
        let free = find_free_port(occupied).unwrap();
        assert!(free > occupied, "helper must skip the occupied port");
        // The picked port must actually be bindable.
        let probe = std::net::TcpListener::bind(("127.0.0.1", free));
        assert!(probe.is_ok(), "reported port {free} is still in use");
    }

    #[test]
    fn pick_sidecar_port_honors_a_free_configured_port() {
        let free = find_free_port(4110).unwrap();
        assert_eq!(pick_sidecar_port(free).unwrap(), free);
        drop(std::net::TcpListener::bind(("127.0.0.1", free)));
    }

    #[test]
    fn pick_sidecar_port_jumps_to_high_band_when_configured_is_taken() {
        // Occupy the configured port, then verify the picker lands in the random
        // high band (40000-45049) instead of deterministically walking 4xxx.
        let listener = std::net::TcpListener::bind(("127.0.0.1", 4199)).unwrap();
        let picked = pick_sidecar_port(4199).unwrap();
        assert_ne!(picked, 4199);
        assert!(
            (40000..=45049).contains(&picked),
            "picked {picked} not in the random high band"
        );
        drop(listener);
    }
}
