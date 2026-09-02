use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use rusqlite::Connection;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultFile {
    pub path: String,
    pub content_hash: String,
    pub size_bytes: i64,
    pub mtime: String,
    pub last_indexed_at: String,
    pub last_backed_up_at: Option<String>,
    pub sync_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkItem {
    pub id: Option<i64>,
    pub source_path: String,
    pub target_path: String,
    pub link_text: String,
    pub line_number: i64,
}

pub struct DbState {
    pub vault_index: Mutex<Connection>,
}

impl DbState {
    pub fn new(app_dir: &std::path::Path) -> Result<Self, String> {
        let vault_index_path = app_dir.join("vault_index.db");

        let conn = Connection::open(&vault_index_path)
            .map_err(|e| format!("Failed to open vault_index.db: {e}"))?;

        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA foreign_keys=ON;

             CREATE TABLE IF NOT EXISTS files (
                 path            TEXT PRIMARY KEY,
                 content_hash    TEXT NOT NULL,
                 size_bytes      INTEGER NOT NULL,
                 mtime           TEXT NOT NULL,
                 last_indexed_at TEXT NOT NULL,
                 last_backed_up_at TEXT,
                 sync_status     TEXT NOT NULL DEFAULT 'not_tracked'
             );

             CREATE TABLE IF NOT EXISTS links (
                 id            INTEGER PRIMARY KEY AUTOINCREMENT,
                 source_path   TEXT NOT NULL,
                 target_path   TEXT NOT NULL,
                 link_text     TEXT NOT NULL,
                 line_number   INTEGER NOT NULL DEFAULT 1
             );

             CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_path);
             CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path);",
        )
        .map_err(|e| format!("Failed to initialize vault_index tables: {e}"))?;

        Ok(Self {
            vault_index: Mutex::new(conn),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_vault_index_db() {
        let dir = std::env::temp_dir().join("lsn_test_vault_index");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let state = DbState::new(&dir).unwrap();

        // files & links tables usable
        {
            let conn = state.vault_index.lock().unwrap();
            conn.execute(
                "INSERT INTO files (path, content_hash, size_bytes, mtime, last_indexed_at) VALUES ('/test.md', 'hash123', 100, '2026-09-02T00:00:00Z', '2026-09-02T00:00:00Z')",
                [],
            ).unwrap();

            conn.execute(
                "INSERT INTO links (source_path, target_path, link_text, line_number) VALUES ('/test.md', '/target.md', 'Target Note', 5)",
                [],
            ).unwrap();
        }
        assert!(dir.join("vault_index.db").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
