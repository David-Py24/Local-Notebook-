use crate::db::{DbState, LinkItem};
use rusqlite::params;
use tauri::{Manager, State};

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
                count += 1;
            }
        }
    }
    Ok(count)
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

    let file_path = target_dir.join(file_name);
    let valid_file_path = validate_vault_path(&file_path.to_string_lossy(), vault_root.as_deref())?;

    if valid_file_path.exists() {
        return Err("File already exists".to_string());
    }

    std::fs::write(&valid_file_path, "").map_err(|e| e.to_string())?;

    if let Ok(conn) = state.vault_index.lock() {
        let _ = upsert_file_index(&conn, &valid_file_path, "");
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
