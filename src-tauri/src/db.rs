use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use rusqlite::Connection;

const SCHEMA_VERSION: i32 = 3;

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
    pub vault_index: Arc<Mutex<Connection>>,
}

impl DbState {
    pub fn new(app_dir: &std::path::Path) -> Result<Self, String> {
        let vault_index_path = app_dir.join("vault_index.db");

        let conn = Connection::open(&vault_index_path)
            .map_err(|e| format!("Failed to open vault_index.db: {e}"))?;

        // Migration ladder using PRAGMA user_version
        let current_version: i32 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap_or(0);

        if current_version < 1 {
            // Split into multiple execute_batch calls to avoid parser issues with giant strings
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
                 CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path);"
            )
            .map_err(|e| format!("Failed to create base tables: {e}"))?;

            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS note_chunks (
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
                 END;"
            )
            .map_err(|e| format!("Failed to create chunks tables: {e}"))?;

            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS memory_entries (
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
                 );"
            )
            .map_err(|e| format!("Failed to create memory tables: {e}"))?;

            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS agent_sessions (
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

                 CREATE TABLE IF NOT EXISTS agent_runs (
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

                 CREATE INDEX IF NOT EXISTS idx_agent_runs_session ON agent_runs(session_id);

                 CREATE TABLE IF NOT EXISTS scheduled_tasks (
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

                 CREATE TABLE IF NOT EXISTS task_run_log (
                     id            TEXT PRIMARY KEY,
                     task_id       TEXT REFERENCES scheduled_tasks(id),
                     session_id    TEXT,
                     status        TEXT,
                     result_summary TEXT,
                     started_at    INTEGER NOT NULL,
                     finished_at   INTEGER
                 );

                 CREATE INDEX IF NOT EXISTS idx_task_next_run ON scheduled_tasks(next_run);
                 CREATE INDEX IF NOT EXISTS idx_task_log_task ON task_run_log(task_id);"
            )
            .map_err(|e| format!("Failed to create agent tables: {e}"))?;

            conn.execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION}"))
                .map_err(|e| format!("Failed to set user_version: {e}"))?;
        } else {
            // Schema already at target version; ensure PRAGMAs are applied
            conn.execute_batch(
                "PRAGMA journal_mode=WAL;
                 PRAGMA synchronous=NORMAL;
                 PRAGMA foreign_keys=ON;"
            )
            .map_err(|e| format!("Failed to apply PRAGMAs: {e}"))?;
        }

        // Migration to version 2: add per-run token/cost accounting to agent_runs.
        // Existing v1 databases reach this block via the `else` above; fresh databases
        // created in the v1 branch already have the columns (guarded so ALTER never
        // re-runs on them).
        if current_version < 2 {
            if !column_exists(&conn, "agent_runs", "token_estimate") {
                conn.execute(
                    "ALTER TABLE agent_runs ADD COLUMN token_estimate INTEGER DEFAULT 0",
                    [],
                )
                .map_err(|e| format!("Failed to add token_estimate column: {e}"))?;
            }
            if !column_exists(&conn, "agent_runs", "cost") {
                conn.execute(
                    "ALTER TABLE agent_runs ADD COLUMN cost REAL DEFAULT 0",
                    [],
                )
                .map_err(|e| format!("Failed to add cost column: {e}"))?;
            }
            conn.execute_batch("PRAGMA user_version = 2")
                .map_err(|e| format!("Failed to set user_version to 2: {e}"))?;
        }

        // Migration to version 3: record the OpenCode sidecar session id per agent
        // session so message history can be re-hydrated from the live server
        // (plan_openchamber_paseo_flaws.md workstream B). Fresh v1 databases already
        // have the column via the CREATE above; this guards the ALTER for existing DBs.
        if current_version < 3 {
            if !column_exists(&conn, "agent_sessions", "opencode_session_id") {
                conn.execute(
                    "ALTER TABLE agent_sessions ADD COLUMN opencode_session_id TEXT",
                    [],
                )
                .map_err(|e| format!("Failed to add opencode_session_id column: {e}"))?;
            }
            conn.execute_batch("PRAGMA user_version = 3")
                .map_err(|e| format!("Failed to set user_version to 3: {e}"))?;
        }

        Ok(Self {
            vault_index: Arc::new(Mutex::new(conn)),
        })
    }
}

/// Whether `table` has a column named `column` (used to guard idempotent ALTERs).
fn column_exists(conn: &rusqlite::Connection, table: &str, column: &str) -> bool {
    let Ok(mut stmt) = conn.prepare(&format!("PRAGMA table_info({table})")) else {
        return false;
    };
    let names: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .and_then(|iter| iter.collect())
        .unwrap_or_default();
    names.iter().any(|name| name == column)
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
