use crate::db::{DbState, Note, Source};
use crate::parsers::parse_file;
use rusqlite::{params, OptionalExtension};
use tauri::State;

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn source_from_row(row: &rusqlite::Row) -> rusqlite::Result<Source> {
    Ok(Source {
        id: row.get(0)?,
        title: row.get(1)?,
        file_type: row.get(2)?,
        file_path: row.get(3)?,
        raw_content: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn note_from_row(row: &rusqlite::Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        source_id: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        pinned: row.get(4)?,
        tags: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

#[tauri::command]
pub fn add_source(state: State<DbState>, title: String, file_path: String) -> Result<Source, String> {
    let content = parse_file(&file_path)?;
    let file_type = file_path
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_lowercase();

    let conn = state.sources.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO sources (title, file_type, file_path, raw_content, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![title, file_type, file_path, content, now()],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    fetch_source(&conn, id)
}

fn fetch_source(conn: &rusqlite::Connection, id: i64) -> Result<Source, String> {
    conn.query_row(
        "SELECT * FROM sources WHERE id = ?1",
        params![id],
        source_from_row,
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Source {id} not found"))
}

#[tauri::command]
pub fn get_sources(state: State<DbState>) -> Result<Vec<Source>, String> {
    let conn = state.sources.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT * FROM sources ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], source_from_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_source(state: State<DbState>, id: i64) -> Result<Source, String> {
    let conn = state.sources.lock().map_err(|e| e.to_string())?;
    fetch_source(&conn, id)
}

#[tauri::command]
pub fn get_source_content(state: State<DbState>, id: i64) -> Result<String, String> {
    let conn = state.sources.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT raw_content FROM sources WHERE id = ?1",
        params![id],
        |r| r.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Source {id} not found"))
}

#[tauri::command]
pub fn update_source(state: State<DbState>, id: i64, title: Option<String>) -> Result<Source, String> {
    let conn = state.sources.lock().map_err(|e| e.to_string())?;
    if let Some(t) = title {
        conn.execute(
            "UPDATE sources SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![t, now(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    fetch_source(&conn, id)
}

#[tauri::command]
pub fn delete_source(state: State<DbState>, id: i64) -> Result<bool, String> {
    let sources = state.sources.lock().map_err(|e| e.to_string())?;
    sources
        .execute("DELETE FROM sources WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    // cascade delete notes referencing this source in notes.db
    let notes = state.notes.lock().map_err(|e| e.to_string())?;
    notes
        .execute("DELETE FROM notes WHERE source_id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
pub fn copy_source_to_note(state: State<DbState>, source_id: i64) -> Result<Note, String> {
    let content = {
        let conn = state.sources.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT raw_content FROM sources WHERE id = ?1",
            params![source_id],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Source {source_id} not found"))?
    };

    let title = first_heading(&content).unwrap_or_else(|| "Untitled note".to_string());

    let conn = state.notes.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO notes (source_id, title, content, pinned, tags, updated_at) VALUES (?1, ?2, ?3, 0, 'knowledge-base', ?4)",
        params![source_id, title, content, now()],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    fetch_note(&conn, id)
}

fn first_heading(content: &str) -> Option<String> {
    content
        .lines()
        .map(str::trim)
        .find(|l| l.starts_with('#'))
        .map(|l| l.trim_start_matches('#').trim().to_string())
}

// ---------- Notes ----------

#[tauri::command]
pub fn add_note(
    state: State<DbState>,
    source_id: Option<i64>,
    title: Option<String>,
    content: String,
    pinned: Option<bool>,
    tags: Option<String>,
) -> Result<Note, String> {
    let conn = state.notes.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO notes (source_id, title, content, pinned, tags, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            source_id,
            title.unwrap_or_else(|| first_heading(&content).unwrap_or_else(|| "Untitled".to_string())),
            content,
            pinned.unwrap_or(false) as i64,
            tags.unwrap_or_default(),
            now()
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    fetch_note(&conn, id)
}

fn fetch_note(conn: &rusqlite::Connection, id: i64) -> Result<Note, String> {
    conn.query_row(
        "SELECT * FROM notes WHERE id = ?1",
        params![id],
        note_from_row,
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Note {id} not found"))
}

#[tauri::command]
pub fn get_notes(state: State<DbState>, source_id: Option<i64>) -> Result<Vec<Note>, String> {
    let conn = state.notes.lock().map_err(|e| e.to_string())?;
    let sql = match source_id {
        Some(_) => "SELECT * FROM notes WHERE source_id = ?1 ORDER BY created_at DESC",
        None => "SELECT * FROM notes ORDER BY created_at DESC",
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = if let Some(sid) = source_id {
        stmt.query_map(params![sid], note_from_row)
            .map_err(|e| e.to_string())?
    } else {
        stmt.query_map([], note_from_row).map_err(|e| e.to_string())?
    };
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_note(state: State<DbState>, id: i64) -> Result<Note, String> {
    let conn = state.notes.lock().map_err(|e| e.to_string())?;
    fetch_note(&conn, id)
}

#[tauri::command]
pub fn update_note(
    state: State<DbState>,
    id: i64,
    title: Option<String>,
    content: Option<String>,
    pinned: Option<bool>,
    tags: Option<String>,
) -> Result<Note, String> {
    let conn = state.notes.lock().map_err(|e| e.to_string())?;
    if let Some(t) = title {
        conn.execute(
            "UPDATE notes SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![t, now(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(c) = content {
        let derived = first_heading(&c).unwrap_or_else(|| "Untitled".to_string());
        conn.execute(
            "UPDATE notes SET content = ?1, title = ?2, updated_at = ?3 WHERE id = ?4",
            params![c, derived, now(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(p) = pinned {
        conn.execute(
            "UPDATE notes SET pinned = ?1, updated_at = ?2 WHERE id = ?3",
            params![p as i64, now(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(t) = tags {
        conn.execute(
            "UPDATE notes SET tags = ?1, updated_at = ?2 WHERE id = ?3",
            params![t, now(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    fetch_note(&conn, id)
}

#[tauri::command]
pub fn pin_note(state: State<DbState>, id: i64, pinned: bool) -> Result<Note, String> {
    let conn = state.notes.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE notes SET pinned = ?1, updated_at = ?2 WHERE id = ?3",
        params![pinned as i64, now(), id],
    )
    .map_err(|e| e.to_string())?;
    fetch_note(&conn, id)
}

#[tauri::command]
pub fn delete_note(state: State<DbState>, id: i64) -> Result<bool, String> {
    let conn = state.notes.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(true)
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
pub fn write_local_file(path: String, content: String, vault_root: Option<String>) -> Result<(), String> {
    let valid_path = validate_vault_path(&path, vault_root.as_deref())?;
    std::fs::write(valid_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_local_file(dir_path: String, name: String, vault_root: Option<String>) -> Result<String, String> {
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
pub fn rename_local_entry(old_path: String, new_path: String, vault_root: Option<String>) -> Result<(), String> {
    let valid_old = validate_vault_path(&old_path, vault_root.as_deref())?;
    let valid_new = validate_vault_path(&new_path, vault_root.as_deref())?;

    if !valid_old.exists() {
        return Err("Target to rename does not exist".to_string());
    }

    std::fs::rename(valid_old, valid_new).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_local_entry(path: String, vault_root: Option<String>) -> Result<(), String> {
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

    if valid_path.is_dir() {
        std::fs::remove_dir_all(valid_path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(valid_path).map_err(|e| e.to_string())
    }
}
