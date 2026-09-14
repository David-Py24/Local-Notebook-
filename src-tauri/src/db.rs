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
             CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path);

             -- Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, Phase 0): chunked note text with
             -- lazy f32 embeddings, an FTS5 shadow table kept in sync via triggers, and
             -- durable agent memory + a context audit log. All additive / non-breaking.
             CREATE TABLE IF NOT EXISTS note_chunks (
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
             );

             CREATE INDEX IF NOT EXISTS idx_chunks_path ON note_chunks(path);

             CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                 chunk_text,
                 content='note_chunks',
                 content_rowid='rowid'
             );

             CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON note_chunks BEGIN
                 INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.rowid, new.chunk_text);
             END;
             CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON note_chunks BEGIN
                 INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES('delete', old.rowid, old.chunk_text);
             END;
             CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON note_chunks BEGIN
                 INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES('delete', old.rowid, old.chunk_text);
                 INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.rowid, new.chunk_text);
             END;

             CREATE TABLE IF NOT EXISTS memory_entries (
                 id               INTEGER PRIMARY KEY AUTOINCREMENT,
                 scope            TEXT NOT NULL,
                 kind             TEXT NOT NULL,
                 role             TEXT,
                 content          TEXT NOT NULL,
                 source           TEXT NOT NULL,
                 topic_title      TEXT,
                 active           INTEGER NOT NULL DEFAULT 1,
                 access_count     INTEGER NOT NULL DEFAULT 0,
                 last_accessed_at TEXT,
                 created_at       TEXT NOT NULL,
                 embedding        BLOB
             );

             CREATE INDEX IF NOT EXISTS idx_memory_scope  ON memory_entries(scope);
             CREATE INDEX IF NOT EXISTS idx_memory_active ON memory_entries(active);

             CREATE TABLE IF NOT EXISTS context_log (
                 id          INTEGER PRIMARY KEY AUTOINCREMENT,
                 turn_hash   TEXT NOT NULL,
                 scope       TEXT NOT NULL,
                 bundle_json TEXT NOT NULL,
                 created_at  TEXT NOT NULL
             );",
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

            // note_chunks rows auto-sync into the FTS5 shadow table via triggers
            conn.execute(
                "INSERT INTO note_chunks (path, chunk_index, chunk_text, char_offset, token_count, indexed_at)
                 VALUES ('/test.md', 0, 'Energy of a photon equals h times frequency.', 0, 10, '2026-09-05T00:00:00Z')",
                [],
            ).unwrap();
            let fts_count: i64 = conn
                .query_row("SELECT count(*) FROM chunks_fts", [], |r| r.get(0))
                .unwrap();
            assert_eq!(fts_count, 1);

            conn.execute("DELETE FROM note_chunks WHERE path = '/test.md'", []).unwrap();
            let fts_count_after_delete: i64 = conn
                .query_row("SELECT count(*) FROM chunks_fts", [], |r| r.get(0))
                .unwrap();
            assert_eq!(fts_count_after_delete, 0);
        }
        assert!(dir.join("vault_index.db").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
