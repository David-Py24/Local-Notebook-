use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use rusqlite::Connection;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Source {
    pub id: i64,
    pub title: String,
    pub file_type: String,
    pub file_path: Option<String>,
    pub raw_content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: i64,
    pub source_id: Option<i64>,
    pub title: String,
    pub content: String,
    pub pinned: bool,
    pub tags: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct DbState {
    pub sources: Mutex<Connection>,
    pub notes: Mutex<Connection>,
}

impl DbState {
    pub fn new(app_dir: &std::path::Path) -> Result<Self, String> {
        let sources_path = app_dir.join("study_notes.db");
        let notes_path = app_dir.join("notes.db");

        let sources = Connection::open(&sources_path)
            .map_err(|e| format!("Failed to open study_notes.db: {e}"))?;
        let notes = Connection::open(&notes_path)
            .map_err(|e| format!("Failed to open notes.db: {e}"))?;

        sources.execute_batch(
            "CREATE TABLE IF NOT EXISTS sources (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT NOT NULL,
                file_type   TEXT NOT NULL,
                file_path   TEXT,
                raw_content TEXT,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .map_err(|e| format!("Failed to create sources table: {e}"))?;

        notes.execute_batch(
            "CREATE TABLE IF NOT EXISTS notes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id   INTEGER,
                title       TEXT NOT NULL,
                content     TEXT NOT NULL,
                pinned      INTEGER NOT NULL DEFAULT 0,
                tags        TEXT NOT NULL DEFAULT '',
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .map_err(|e| format!("Failed to create notes table: {e}"))?;

        // migrate existing databases that predate the extra columns
        migrate_column(&notes, "notes", "pinned", "INTEGER NOT NULL DEFAULT 0")?;
        migrate_column(&notes, "notes", "tags", "TEXT NOT NULL DEFAULT ''")?;

        Ok(Self {
            sources: Mutex::new(sources),
            notes: Mutex::new(notes),
        })
    }
}

fn migrate_column(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let has_column: bool = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .any(|name| name == column);

    if !has_column {
        conn.execute_batch(&format!(
            "ALTER TABLE {table} ADD COLUMN {column} {definition};"
        ))
        .map_err(|e| format!("Failed to add column {table}.{column}: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_both_dbs() {
        let dir = std::env::temp_dir().join("lsn_test_dbs");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let state = DbState::new(&dir).unwrap();

        // sources table usable
        {
            let conn = state.sources.lock().unwrap();
            conn.execute("INSERT INTO sources (title, file_type, raw_content) VALUES ('Test', 'md', 'hello')", []).unwrap();
        }
        // notes table usable
        {
            let conn = state.notes.lock().unwrap();
            conn.execute("INSERT INTO notes (source_id, title, content) VALUES (1, 'N', 'content')", []).unwrap();
        }
        assert!(dir.join("study_notes.db").exists());
        assert!(dir.join("notes.db").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
