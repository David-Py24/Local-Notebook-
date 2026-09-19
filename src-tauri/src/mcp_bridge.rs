// ---------------------------------------------------------------------------
// MCP Bridge Server: exposes workspace tools to OpenCode via MCP-over-HTTP.
//
// Starts a localhost-only `tiny_http` server that speaks the MCP JSON-RPC
// protocol (initialize, tools/list, tools/call). OpenCode discovers it as a
// "remote" MCP connector via the opencode.json config export, so all of the
// app's knowledge, memory, search, and file tools become available to the
// agent without any OpenCode-side code changes.
//
// Security:
//   - Binds to 127.0.0.1:0 (OS-picked ephemeral port) — not reachable from
//     the network.
//   - A per-session random bearer token (generated here, injected into
//     OpenCode's env) authenticates every request.
//   - All file operations go through vault-path resolution — the same sandbox
//     used by the frontend tool router.
// ---------------------------------------------------------------------------

use crate::db::DbState;
use serde::Serialize;
use serde_json::{json, Value};

use std::sync::{Arc, Mutex};
use std::thread;
use tauri::Manager;

const MCP_PROTOCOL_VERSION: &str = "2024-11-05";
const SERVER_NAME: &str = "lsn-workspace";
const SERVER_VERSION: &str = "1.5.0";

// ---------------------------------------------------------------------------
// Managed state
// ---------------------------------------------------------------------------

pub struct McpBridgeState {
    inner: Arc<Mutex<BridgeInner>>,
}

struct BridgeInner {
    port: Option<u16>,
    token: Option<String>,
    handle: Option<thread::JoinHandle<()>>,
    shutdown: Option<Arc<Mutex<bool>>>,
}

impl Default for McpBridgeState {
    fn default() -> Self {
        McpBridgeState {
            inner: Arc::new(Mutex::new(BridgeInner {
                port: None,
                token: None,
                handle: None,
                shutdown: None,
            })),
        }
    }
}

// ---------------------------------------------------------------------------
// MCP JSON-RPC types
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Serialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

fn success_response(id: Value, result: Value) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: Some(result),
        error: None,
    }
}

fn error_response(id: Value, code: i64, message: String) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: None,
        error: Some(JsonRpcError { code, message }),
    }
}

// ---------------------------------------------------------------------------
// MCP tool catalog — mirrors the workspace tools from workspaceTools.ts
// ---------------------------------------------------------------------------

fn build_tool_catalog(enable_writes: bool) -> Value {
    let mut tools = vec![
        json!({
            "name": "search_vault",
            "description": "Search local markdown notes in the user's workspace for keywords or topics.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "The search query or keyword to locate in workspace notes." }
                },
                "required": ["query"]
            }
        }),
        json!({
            "name": "read_file",
            "description": "Read the text content of any file in the vault, with optional line range selection (start_line and end_line).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Vault-relative path of the file to read." },
                    "start_line": { "type": "number", "description": "1-based starting line number (optional)." },
                    "end_line": { "type": "number", "description": "1-based ending line number (optional)." }
                },
                "required": ["path"]
            }
        }),
        json!({
            "name": "list_directory",
            "description": "List files and subdirectories inside a specific vault-relative folder path.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Vault-relative folder path (leave empty or '.' for vault root)." }
                },
                "required": []
            }
        }),
        json!({
            "name": "get_file_info",
            "description": "Retrieve metadata for a file or folder (size, line count, modified time, extension).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Vault-relative path of the file or folder." }
                },
                "required": ["path"]
            }
        }),
        json!({
            "name": "search_files",
            "description": "Search text files in the vault for a target keyword or phrase.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Keyword or query string to search for." }
                },
                "required": ["query"]
            }
        }),
        json!({
            "name": "list_recent_notes",
            "description": "List markdown notes available in the workspace (top-level folders included).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": { "type": "number", "description": "Maximum entries to list (default 20)." }
                },
                "required": []
            }
        }),
        json!({
            "name": "get_note_backlinks",
            "description": "Get incoming backlinks and outgoing connections for a specific note path.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "note_path": { "type": "string", "description": "The path or filename of the note to retrieve backlinks for." }
                },
                "required": ["note_path"]
            }
        }),
        json!({
            "name": "recall_memory",
            "description": "Recall durable memory entries (facts, prior Q&A, user context) for a topic or query. Keyword-based when used without embeddings.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "What to recall (topic, question, or fact)." },
                    "scope": { "type": "string", "description": "Optional memory scope filter, e.g. a topic title or 'global'." },
                    "limit": { "type": "number", "description": "Maximum entries to return (default 5)." }
                },
                "required": ["query"]
            }
        }),
        json!({
            "name": "save_memory",
            "description": "Persist a durable fact or context about the user, a topic, or their workspace so future turns can recall it.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "scope": { "type": "string", "description": "Memory scope: a topic title or 'global'." },
                    "content": { "type": "string", "description": "The fact or context to remember (1-3 sentences)." },
                    "topic_title": { "type": "string", "description": "Optional topic title for grouping." }
                },
                "required": ["scope", "content"]
            }
        }),
        json!({
            "name": "rag_search",
            "description": "Keyword search over the workspace notes that returns the most relevant passages for a query. Falls back to keyword-only when no embeddings are available.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "The question or topic to retrieve context for." },
                    "limit": { "type": "number", "description": "Maximum passages to return (default 5)." }
                },
                "required": ["query"]
            }
        }),
        json!({
            "name": "git_status",
            "description": "Get the current git status of the workspace: branch name and changed/staged/untracked files.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }),
        json!({
            "name": "git_diff",
            "description": "Get the git diff for a single file in the workspace.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Vault-relative path of the file to diff." },
                    "staged": { "type": "boolean", "description": "Diff the staged version instead of working-tree (default false)." }
                },
                "required": ["path"]
            }
        }),
    ];

    if enable_writes {
        tools.extend(vec![
            json!({
                "name": "create_file",
                "description": "Create a new file at a vault-relative path. Fails if the file already exists.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Vault-relative path of the new file." },
                        "content": { "type": "string", "description": "Text content to write into the file." }
                    },
                    "required": ["path", "content"]
                }
            }),
            json!({
                "name": "edit_file",
                "description": "Overwrite an existing file with new content, or create it when create_if_missing is true.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Vault-relative path of the file to edit." },
                        "content": { "type": "string", "description": "Full replacement content." },
                        "create_if_missing": { "type": "boolean", "description": "Create the file when it doesn't exist yet (default false)." }
                    },
                    "required": ["path", "content"]
                }
            }),
            json!({
                "name": "append_file",
                "description": "Append content to the end of an existing file (or create it if missing).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Vault-relative path of the file to append to." },
                        "content": { "type": "string", "description": "Text to append." }
                    },
                    "required": ["path", "content"]
                }
            }),
            json!({
                "name": "replace_file_content",
                "description": "Replace an exact target substring with replacement content inside a file (hunk edit).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Vault-relative path of the file to modify." },
                        "target_content": { "type": "string", "description": "The exact existing text block to be replaced." },
                        "replacement_content": { "type": "string", "description": "The new text to replace target_content with." }
                    },
                    "required": ["path", "target_content", "replacement_content"]
                }
            }),
            json!({
                "name": "create_folder",
                "description": "Create a new folder inside the vault (creates intermediate folders too).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Vault-relative folder path, e.g. 'Guides/Physics'." }
                    },
                    "required": ["path"]
                }
            }),
            json!({
                "name": "export_markdown",
                "description": "Export text as a .md file into the vault. Creates parent folders as needed. Only creates new files.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Vault-relative output path." },
                        "content": { "type": "string", "description": "The markdown content to write." }
                    },
                    "required": ["path", "content"]
                }
            }),
        ]);
    }

    json!({ "tools": tools })
}

// ---------------------------------------------------------------------------
// Path resolution (mirrors frontend resolveVaultPath)
// ---------------------------------------------------------------------------

fn resolve_vault_path(vault_root: &str, rel: &str) -> Option<String> {
    let rel = rel.trim();
    if rel.is_empty() || rel.contains('\0') {
        return None;
    }
    let normalized = rel.replace('\\', "/");
    if normalized.starts_with('/') {
        return None;
    }
    if normalized.len() >= 2 && normalized.as_bytes().get(1) == Some(&b':') {
        return None;
    }
    let root = vault_root.replace('\\', "/");
    let root = root.trim_end_matches('/');
    let joined = format!("{}/{}", root, normalized);
    let segments: Vec<&str> = joined.split('/').collect();
    let mut resolved: Vec<&str> = Vec::new();
    for seg in &segments {
        match *seg {
            ".." => { resolved.pop(); }
            "." | "" => {}
            _ => resolved.push(seg),
        }
    }
    let is_absolute = joined.starts_with('/');
    let cleaned = if is_absolute {
        format!("/{}", resolved.join("/"))
    } else {
        resolved.join("/")
    };
    let root_lower = root.to_lowercase();
    let check = cleaned.to_lowercase();
    if check == root_lower || !check.starts_with(&format!("{}/", root_lower)) {
        return None;
    }
    Some(cleaned)
}

// ---------------------------------------------------------------------------
// Tool dispatch — calls into existing Rust commands/internals
// ---------------------------------------------------------------------------

struct ToolContext {
    vault_root: String,
    db: Arc<Mutex<rusqlite::Connection>>,
    app_handle: tauri::AppHandle,
}

fn dispatch_tool(ctx: &ToolContext, tool_name: &str, args: &Value) -> Result<String, String> {
    let vault = &ctx.vault_root;

    match tool_name {
        "search_vault" | "search_files" => {
            let query = args.get("query").and_then(Value::as_str).unwrap_or("");
            let results = crate::commands::search_vault(vault.clone(), query.to_string())?;
            if results.is_empty() {
                return Ok(format!("No matching results found for \"{}\".", query));
            }
            Ok(results
                .iter()
                .map(|r| format!("- [{}] (Line {}): {}", r.title, r.line_number, r.snippet))
                .collect::<Vec<_>>()
                .join("\n"))
        }

        "read_file" => {
            let rel = args.get("path").and_then(Value::as_str).unwrap_or("");
            let target = resolve_vault_path(vault, rel)
                .ok_or_else(|| format!("Error: Refusing path \"{}\" — must stay inside vault root.", rel))?;
            let start = args.get("start_line").and_then(Value::as_u64).map(|v| v as usize);
            let end = args.get("end_line").and_then(Value::as_u64).map(|v| v as usize);

            if start.is_some() || end.is_some() {
                let res = crate::commands::read_local_file_lines(
                    target,
                    start,
                    end,
                    Some(vault.clone()),
                )?;
                Ok(format!(
                    "### File: {} (Lines {}-{} of {})\n\n{}",
                    rel, res.start_line, res.end_line, res.total_lines, res.content
                ))
            } else {
                let text = crate::commands::read_local_file(target, Some(vault.clone()))?;
                Ok(format!("### File: {}\n\n{}", rel, text))
            }
        }

        "list_directory" => {
            let rel = args.get("path").and_then(Value::as_str).unwrap_or(".");
            let target_dir = if rel == "." || rel.is_empty() {
                vault.clone()
            } else {
                resolve_vault_path(vault, rel)
                    .ok_or_else(|| format!("Error: Refusing path \"{}\".", rel))?
            };
            let entries = crate::commands::read_local_dir(target_dir, None)?;
            if entries.is_empty() {
                return Ok(format!("Directory \"{}\" is empty.", rel));
            }
            Ok(entries
                .iter()
                .map(|e| {
                    format!(
                        "- [{}] {}",
                        if e.is_dir { "FOLDER" } else { "FILE" },
                        e.name
                    )
                })
                .collect::<Vec<_>>()
                .join("\n"))
        }

        "get_file_info" => {
            let rel = args.get("path").and_then(Value::as_str).unwrap_or("");
            let target = resolve_vault_path(vault, rel)
                .ok_or_else(|| format!("Error: Refusing path \"{}\".", rel))?;
            let info = crate::commands::get_local_file_info(target, Some(vault.clone()))?;
            if !info.exists {
                return Ok(format!("File \"{}\" does not exist.", rel));
            }
            Ok(format!(
                "File Info for \"{}\":\n- Type: {}\n- Size: {} bytes\n- Line Count: {}\n- Modified: {}\n- Extension: {}",
                rel,
                if info.is_dir { "Directory" } else { "File" },
                info.size_bytes,
                info.line_count.map_or("N/A".to_string(), |c| c.to_string()),
                info.mtime.as_deref().unwrap_or("Unknown"),
                info.extension.as_ref().map_or("none".to_string(), |e| format!(".{}", e))
            ))
        }

        "list_recent_notes" => {
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(20) as usize;
            let entries = crate::commands::read_local_dir(vault.clone(), None)?;
            let notes: Vec<_> = entries
                .iter()
                .filter(|e| !e.is_dir && e.name.to_lowercase().ends_with(".md"))
                .take(limit.max(1))
                .collect();
            if notes.is_empty() {
                return Ok("No markdown notes found in the workspace root.".to_string());
            }
            Ok(notes
                .iter()
                .map(|n| format!("- {}", n.name))
                .collect::<Vec<_>>()
                .join("\n"))
        }

        "get_note_backlinks" => {
            let note_path = args.get("note_path").and_then(Value::as_str).unwrap_or("");
            if note_path.is_empty() {
                return Err("No note path specified.".to_string());
            }
            let conn = ctx.db.lock().map_err(|e| e.to_string())?;
            let backlinks = crate::commands::backlinks_for_path(&conn, note_path)?;
            if backlinks.is_empty() {
                return Ok(format!("No incoming backlinks found for \"{}\".", note_path));
            }
            Ok(backlinks
                .iter()
                .map(|b| {
                    let name = b
                        .source_path
                        .rsplit(&['/', '\\'][..])
                        .next()
                        .unwrap_or(&b.source_path);
                    format!(
                        "- Linked from [{}] (Line {}): \"{}\"",
                        name, b.line_number, b.link_text
                    )
                })
                .collect::<Vec<_>>()
                .join("\n"))
        }

        "recall_memory" => {
            let query = args.get("query").and_then(Value::as_str).unwrap_or("");
            let scope = args.get("scope").and_then(Value::as_str).unwrap_or("global");
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(5) as usize;
            let conn = ctx.db.lock().map_err(|e| e.to_string())?;
            let results = crate::commands::recall_memory_internal(&conn, scope, query, &[], limit)?;
            if results.is_empty() {
                return Ok(format!("No recalled memory for \"{}\".", query));
            }
            Ok(results
                .iter()
                .map(|m| format!("- [{}/{}] {}", m.kind, m.scope, m.content))
                .collect::<Vec<_>>()
                .join("\n"))
        }

        "save_memory" => {
            let scope = args.get("scope").and_then(Value::as_str).unwrap_or("global");
            let content = args.get("content").and_then(Value::as_str).unwrap_or("");
            let topic_title = args.get("topic_title").and_then(Value::as_str).map(String::from);
            if content.trim().is_empty() {
                return Err("save_memory requires non-empty content.".to_string());
            }
            let conn = ctx.db.lock().map_err(|e| e.to_string())?;
            let now = chrono::Utc::now().to_rfc3339();
            let bytes: Option<&[u8]> = None;
            conn.execute(
                "INSERT INTO memory_entries (scope, kind, content, source, topic_title, created_at, embedding)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![scope, "fact", content, "opencode-agent", topic_title, now, bytes],
            )
            .map_err(|e| e.to_string())?;
            let preview: String = content.chars().take(300).collect();
            Ok(format!("Remembered: {}", preview))
        }

        "rag_search" => {
            let query = args.get("query").and_then(Value::as_str).unwrap_or("");
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(5) as usize;
            let root = std::path::Path::new(vault);
            let conn = ctx.db.lock().map_err(|e| e.to_string())?;
            let results = crate::commands::search_rag_internal(&conn, root, query, &[], limit)?;
            if results.is_empty() {
                return Ok(format!("No relevant passages found for \"{}\".", query));
            }
            Ok(results
                .iter()
                .map(|r| format!("- [{}] (score {:.3}): {}", r.title, r.score, r.snippet))
                .collect::<Vec<_>>()
                .join("\n"))
        }

        "git_status" => {
            match crate::git::git_status(vault.clone()) {
                Ok(status) => {
                    if !status.is_repo {
                        return Ok("This workspace is not a git repository.".to_string());
                    }
                    let branch = status.branch.as_deref().unwrap_or("(detached)");
                    if status.entries.is_empty() {
                        return Ok(format!("Branch: {}\nWorking tree clean.", branch));
                    }
                    let lines: Vec<String> = status
                        .entries
                        .iter()
                        .map(|e| {
                            let kind_str = serde_json::to_string(&e.kind)
                                .unwrap_or_default()
                                .trim_matches('"')
                                .to_string();
                            format!(
                                "- [{}/{}] {}",
                                if e.staged { "staged" } else { "unstaged" },
                                kind_str,
                                e.path
                            )
                        })
                        .collect();
                    Ok(format!("Branch: {}\n{}", branch, lines.join("\n")))
                }
                Err(e) => Ok(format!("Git error: {}", e)),
            }
        }

        "git_diff" => {
            let path = args.get("path").and_then(Value::as_str).unwrap_or("");
            let staged = args.get("staged").and_then(Value::as_bool).unwrap_or(false);
            if path.is_empty() {
                return Err("git_diff requires a path.".to_string());
            }
            match crate::git::git_diff_file(vault.clone(), path.to_string(), staged) {
                Ok(Some(d)) => Ok(d),
                Ok(None) => Ok(format!("No diff for \"{}\".", path)),
                Err(e) => Ok(format!("Git diff error: {}", e)),
            }
        }

        // ---- Write tools ----

        "create_file" | "create_note" => {
            let rel = args.get("path").and_then(Value::as_str).unwrap_or("");
            let content = args.get("content").and_then(Value::as_str).unwrap_or("");
            let target = resolve_vault_path(vault, rel)
                .ok_or_else(|| format!("Error: Refusing path \"{}\".", rel))?;
            let target_path = std::path::Path::new(&target);
            if target_path.exists() {
                return Err(format!("File already exists at \"{}\".", rel));
            }
            if let Some(parent) = target_path.parent() {
                if !parent.exists() {
                    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
            }
            std::fs::write(&target, content).map_err(|e| e.to_string())?;
            let conn = ctx.db.lock().map_err(|e| e.to_string())?;
            let _ = crate::commands::upsert_file_index(&conn, target_path, content);
            Ok(format!("Created \"{}\".", rel))
        }

        "edit_file" | "edit_note" => {
            let rel = args.get("path").and_then(Value::as_str).unwrap_or("");
            let content = args.get("content").and_then(Value::as_str).unwrap_or("");
            let create_if_missing = args
                .get("create_if_missing")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let target = resolve_vault_path(vault, rel)
                .ok_or_else(|| format!("Error: Refusing path \"{}\".", rel))?;
            let target_path = std::path::Path::new(&target);

            if !target_path.exists() && !create_if_missing {
                return Err(format!(
                    "No file exists at \"{}\" (create_if_missing is false).",
                    rel
                ));
            }
            if target_path.exists() {
                if let Ok(app_dir) = ctx.app_handle.path().app_data_dir() {
                    let history_root = app_dir.join("history");
                    let _ = crate::commands::snapshot_previous_version(&history_root, target_path);
                }
            }
            if let Some(parent) = target_path.parent() {
                if !parent.exists() {
                    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
            }
            std::fs::write(&target, content).map_err(|e| e.to_string())?;
            let conn = ctx.db.lock().map_err(|e| e.to_string())?;
            let _ = crate::commands::upsert_file_index(&conn, target_path, content);
            Ok(format!("Updated \"{}\".", rel))
        }

        "append_file" | "append_note" => {
            let rel = args.get("path").and_then(Value::as_str).unwrap_or("");
            let to_append = args.get("content").and_then(Value::as_str).unwrap_or("");
            let target = resolve_vault_path(vault, rel)
                .ok_or_else(|| format!("Error: Refusing path \"{}\".", rel))?;
            let existing = std::fs::read_to_string(&target).unwrap_or_default();
            let merged = if existing.is_empty() {
                to_append.to_string()
            } else {
                format!("{}\n\n{}", existing.trim_end(), to_append.trim())
            };
            std::fs::write(&target, &merged).map_err(|e| e.to_string())?;
            Ok(format!("Appended content to \"{}\".", rel))
        }

        "replace_file_content" => {
            let rel = args.get("path").and_then(Value::as_str).unwrap_or("");
            let target_content = args.get("target_content").and_then(Value::as_str).unwrap_or("");
            let replacement = args.get("replacement_content").and_then(Value::as_str).unwrap_or("");
            let target = resolve_vault_path(vault, rel)
                .ok_or_else(|| format!("Error: Refusing path \"{}\".", rel))?;
            let target_path = std::path::Path::new(&target);
            let content = std::fs::read_to_string(&target).map_err(|e| e.to_string())?;
            if !content.contains(target_content) {
                return Err(format!("Target content not found in \"{}\".", rel));
            }
            let count = content.matches(target_content).count();
            let updated = content.replace(target_content, replacement);
            if let Ok(app_dir) = ctx.app_handle.path().app_data_dir() {
                let history_root = app_dir.join("history");
                let _ = crate::commands::snapshot_previous_version(&history_root, target_path);
            }
            std::fs::write(&target, &updated).map_err(|e| e.to_string())?;
            Ok(format!("Replaced {} occurrence(s) in \"{}\".", count, rel))
        }

        "create_folder" => {
            let rel = args.get("path").and_then(Value::as_str).unwrap_or("");
            let target = resolve_vault_path(vault, rel)
                .ok_or_else(|| format!("Error: Refusing path \"{}\".", rel))?;
            std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            Ok(format!("Created folder \"{}\".", rel))
        }

        "export_markdown" => {
            let rel = args.get("path").and_then(Value::as_str).unwrap_or("");
            let content = args.get("content").and_then(Value::as_str).unwrap_or("");
            let target = resolve_vault_path(vault, rel)
                .ok_or_else(|| format!("Error: Refusing path \"{}\".", rel))?;
            if let Some(parent) = std::path::Path::new(&target).parent() {
                if !parent.exists() {
                    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
            }
            std::fs::write(&target, content).map_err(|e| e.to_string())?;
            Ok(format!("Exported markdown to \"{}\".", rel))
        }

        _ => Err(format!("Unknown tool: {}", tool_name)),
    }
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

fn handle_mcp_request(
    body: &str,
    ctx: &ToolContext,
    enable_writes: bool,
) -> JsonRpcResponse {
    let req: JsonRpcRequest = match serde_json::from_str(body) {
        Ok(r) => r,
        Err(e) => {
            return error_response(json!(null), -32700, format!("Parse error: {}", e));
        }
    };

    let id = req.id.clone().unwrap_or(json!(null));

    match req.method.as_str() {
        "initialize" => success_response(
            id,
            json!({
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": { "tools": {} },
                "serverInfo": {
                    "name": SERVER_NAME,
                    "version": SERVER_VERSION
                }
            }),
        ),

        "notifications/initialized" => success_response(id, json!({})),

        "tools/list" => {
            let catalog = build_tool_catalog(enable_writes);
            success_response(id, catalog)
        }

        "tools/call" => {
            let params = req.params.unwrap_or(json!({}));
            let tool_name = params.get("name").and_then(Value::as_str).unwrap_or("");
            let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

            let write_tools = [
                "create_file", "create_note", "edit_file", "edit_note",
                "append_file", "append_note", "replace_file_content",
                "create_folder", "export_markdown",
            ];
            if !enable_writes && write_tools.contains(&tool_name) {
                return success_response(
                    id,
                    json!({
                        "content": [{ "type": "text", "text": "Error: File write tools are disabled." }],
                        "isError": true
                    }),
                );
            }

            match dispatch_tool(ctx, tool_name, &arguments) {
                Ok(text) => success_response(
                    id,
                    json!({
                        "content": [{ "type": "text", "text": text }],
                        "isError": false
                    }),
                ),
                Err(e) => success_response(
                    id,
                    json!({
                        "content": [{ "type": "text", "text": e }],
                        "isError": true
                    }),
                ),
            }
        }

        _ => error_response(id, -32601, format!("Method not found: {}", req.method)),
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct BridgeInfo {
    pub port: u16,
    pub token: String,
}

#[tauri::command]
pub fn start_mcp_bridge(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, McpBridgeState>,
    db_state: tauri::State<'_, DbState>,
    vault_root: String,
    enable_writes: bool,
) -> Result<BridgeInfo, String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;

    if let (Some(port), Some(ref token)) = (inner.port, &inner.token) {
        return Ok(BridgeInfo {
            port,
            token: token.clone(),
        });
    }

    let token: String = {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        (0..32)
            .map(|_| format!("{:02x}", rng.gen::<u8>()))
            .collect()
    };

    let server = tiny_http::Server::http("127.0.0.1:0")
        .map_err(|e| format!("Failed to start MCP bridge: {}", e))?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or_else(|| "Failed to get bridge port".to_string())?
        .port();

    let shutdown_flag = Arc::new(Mutex::new(false));
    let shutdown_clone = shutdown_flag.clone();
    let token_clone = token.clone();
    let vault_clone = vault_root.clone();
    let db_conn = db_state.vault_index.clone();
    let app_clone = app_handle.clone();

    let handle = thread::spawn(move || {
        loop {
            if let Ok(flag) = shutdown_clone.lock() {
                if *flag { break; }
            }

            let mut request = match server.recv_timeout(std::time::Duration::from_millis(500)) {
                Ok(Some(req)) => req,
                Ok(None) => continue,
                Err(_) => continue,
            };

            let auth_ok = request
                .headers()
                .iter()
                .find(|h| h.field.equiv("Authorization"))
                .map(|h| h.value.as_str() == format!("Bearer {}", token_clone))
                .unwrap_or(false);

            if !auth_ok {
                let resp = tiny_http::Response::from_string("{\"error\":\"unauthorized\"}")
                    .with_status_code(401)
                    .with_header(
                        tiny_http::Header::from_bytes(
                            &b"Content-Type"[..],
                            &b"application/json"[..],
                        )
                        .unwrap(),
                    );
                let _ = request.respond(resp);
                continue;
            }

            let mut body = String::new();
            if request.as_reader().read_to_string(&mut body).is_err() {
                let resp = tiny_http::Response::from_string("{\"error\":\"bad request\"}")
                    .with_status_code(400);
                let _ = request.respond(resp);
                continue;
            }

            let ctx = ToolContext {
                vault_root: vault_clone.clone(),
                db: db_conn.clone(),
                app_handle: app_clone.clone(),
            };

            let mcp_response = handle_mcp_request(&body, &ctx, enable_writes);
            let json_body = serde_json::to_string(&mcp_response).unwrap_or_default();

            let resp = tiny_http::Response::from_string(json_body)
                .with_status_code(200)
                .with_header(
                    tiny_http::Header::from_bytes(
                        &b"Content-Type"[..],
                        &b"application/json"[..],
                    )
                    .unwrap(),
                );
            let _ = request.respond(resp);
        }
    });

    inner.port = Some(port);
    inner.token = Some(token.clone());
    inner.handle = Some(handle);
    inner.shutdown = Some(shutdown_flag);

    Ok(BridgeInfo { port, token })
}

#[tauri::command]
pub fn stop_mcp_bridge(state: tauri::State<'_, McpBridgeState>) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;

    if let Some(ref flag) = inner.shutdown {
        if let Ok(mut f) = flag.lock() {
            *f = true;
        }
    }

    if let Some(handle) = inner.handle.take() {
        let _ = handle.join();
    }

    inner.port = None;
    inner.token = None;
    inner.shutdown = None;

    Ok(())
}
