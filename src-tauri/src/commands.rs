use crate::chunks;
use crate::db::{DbState, LinkItem};
use rusqlite::params;
use std::sync::{Mutex, OnceLock};
use tauri::{Manager, State};

/// Tracks the project-local `opencode.json` we write for a connector export, so
/// `kill_opencode_server` can remove it when the sidecar stops. This keeps the
/// export non-destructive and leaves no artifact behind in the user's vault.
static OPENCODE_MCP_CONFIG: OnceLock<Mutex<Option<std::path::PathBuf>>> = OnceLock::new();

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

fn snapshot_previous_version(history_root: &std::path::Path, valid_path: &std::path::Path) -> Result<(), String> {
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

fn upsert_file_index(conn: &rusqlite::Connection, path: &std::path::Path, content: &str) -> Result<(), String> {
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

fn search_rag_internal(
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

fn recall_memory_internal(
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

fn backlinks_for_path(conn: &rusqlite::Connection, target_path: &str) -> Result<Vec<LinkItem>, String> {
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

/// Checks whether the `opencode` binary is on PATH by running `opencode --version`.
/// Returns true if the exit code is 0 (installed + accessible), false otherwise.
#[tauri::command]
pub fn check_opencode_installed() -> bool {
    std::process::Command::new("opencode")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Spawns `opencode serve --port <port>` in the given workspace directory.
///
/// `provider_env` is a map of env var → value for the user's BYOK credentials
/// (e.g. {"OPENAI_API_KEY": "sk-...", "GOOGLE_GENERATIVE_AI_API_KEY": "AIza..."}).
/// `server_password` is injected as OPENCODE_SERVER_PASSWORD so the local HTTP
/// endpoint is authenticated even though it only binds to localhost.
/// Returns the child PID on success, or an error string on failure.
#[tauri::command]
pub fn spawn_opencode_server(
    port: u16,
    workspace_path: String,
    server_password: String,
    provider_env: std::collections::HashMap<String, String>,
    mcp_override: Option<String>,
    mcp_env: Option<std::collections::HashMap<String, String>>,
) -> Result<u32, String> {
    let workspace = std::path::Path::new(&workspace_path);
    if !workspace.exists() {
        return Err(format!(
            "Workspace path does not exist: {}",
            workspace_path
        ));
    }

    let mut cmd = std::process::Command::new("opencode");
    cmd.arg("serve")
        .arg("--port")
        .arg(port.to_string())
        // Scope OpenCode's file tools to the user's vault.
        .current_dir(workspace)
        // Authenticate the local HTTP endpoint per spec §"Corrected: Local Server Authentication"
        .env("OPENCODE_SERVER_PASSWORD", &server_password)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

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
                let _ = OPENCODE_MCP_CONFIG
                    .set(Mutex::new(Some(config_file)));
            }
        }
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn opencode serve: {e}"))?;

    Ok(child.id())
}

/// Kills a running OpenCode server process by PID.
/// Uses taskkill on Windows, SIGTERM on Unix for a clean shutdown.
#[tauri::command]
pub fn kill_opencode_server(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| format!("taskkill failed: {e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| format!("kill failed: {e}"))?;
    }

    // Remove the connector-export config we wrote into the vault (if any).
    let Ok(mut lock) = OPENCODE_MCP_CONFIG.get_or_init(Default::default).lock() else {
        return Ok(());
    };
    if let Some(path) = lock.take() {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
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

