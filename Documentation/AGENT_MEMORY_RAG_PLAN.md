# Agent Tools · Memory/Context · Memory-RAG — Implementation Plan

A working plan for scaffolding a shared **Agent Knowledge Service** across all three
agent surfaces in Local Study Notebook:

1. **Study Assistant** (`AssistantPanel.tsx`, study mode)
2. **Micro Agent panel** (`AgentPanel.tsx`) — currently a stubbed scaffold
3. **OpenCode Agent** (`OpenCodeView.tsx`)

Design goals:

- **Local-first**: embeddings come from the configured local Ollama server
  (default `http://localhost:11434`, model `nomic-embed-text`). No cloud dependency
  for indexing or retrieval.
- **Offline-resilient**: a hybrid keyword (FTS5/BM25) + vector (cosine) ranker means
  note retrieval works even when no embedding server is running.
- **Shared service, thin surfaces**: one Rust command set + one frontend wrapper
  (`src/services/agentKnowledge.ts`) consumed by all three surfaces. No per-panel
  copy-paste of memory logic.
- **Capability-gated**: the model gains file **write** tools (create/update/delete)
  only behind an explicit setting, default **off**, with an approval gate for
  destructive operations.

---

## Current state (as of this plan)

| Surface | Read tools | Write tools | Memory | Persistence |
|---|---|---|---|---|
| Study Assistant | `search_vault`, `read_active_note`, `get_note_backlinks` (`workspaceTools.ts:17`) | none | last 10 in-session messages (`useStore.ts:1115`) | none (in-memory) |
| Micro Agent | — | — | — | stubbed `handleSend` (`AgentPanel.tsx:24`) |
| OpenCode Agent | file edit · git · shell · LSP (own toolset) | yes | none | opencode session only |

Existing infrastructure we build on:

- Full file CRUD already exists in Rust: `read_local_file` (`commands.rs:448`),
  `write_local_file` (`:454`), `create_local_file` (`:482`), `create_local_dir`
  (`:531`), `rename_local_entry` (`:554`), `delete_local_entry` (`:587`), plus
  `validate_vault_path` (`:408`).
- Tool-call execution loop already runs end-to-end in `streamAIResponse`
  (`aiProvider.ts:471-515`); adding a tool = one entry in `WORKSPACE_TOOLS`
  (`workspaceTools.ts:17`) + one branch in `executeWorkspaceTool` (`:65`).
- Vault indexing already exists: `reindex_vault` (`commands.rs:168`),
  `upsert_file_index` (`:78`), hash-gated change detection.
- OpenCode file edits already trigger reindexing (`OpenCodeView.tsx:207-219`).

---

## Architecture overview

```
                    ┌────────────────────────────────────────────────┐
                    │  FRONTEND  (React / Zustand store)             │
                    │                                                │
                    │  AssistantPanel      AgentPanel      OpenCode  │
                    │     └───────────────┬────────────────┘         │
                    │                     ▼                          │
                    │        src/services/agentKnowledge.ts         │
                    │              buildPromptWithContext           │
                    │              runAgentTask                     │
                    │              approveToolCall                  │
                    │                    │                          │
                    └────────────────────┼──────────────────────────┘
                                         ▼
                    ┌────────────────────────────────────────────────┐
                    │  Tauri commands (commands.rs / chunks.rs /     │
                    │  embeddings.rs)                                │
                    │  get_context_bundle · search_rag · add_memory │
                    │  recall_memory · rebuild_embeddings ·          │
                    │  create/edit/delete/rename_note tools          │
                    └────────────────────┼──────────────────────────┘
                                         ▼
                    ┌────────────────────────────────────────────────┐
                    │  vault_index.db (SQLite)                       │
                    │  files · links · note_chunks · chunks_fts ·    │
                    │  memory_entries · context_log                  │
                    └────────────────────────────────────────────────┘
                         ▲                          ▲
                   reindex_vault          POST {localhost:11434}
                   (file walk)            /api/embeddings (Ollama)
```

---

## Phase 0 — Schema & DB migration

**File:** `src-tauri/src/db.rs` (extend the `execute_batch` in `DbState::new`, db.rs:36)

All additions are `CREATE TABLE IF NOT EXISTS` — non-breaking for existing installs.

| Table | Columns | Purpose |
|---|---|---|
| `note_chunks` | `path TEXT, chunk_index INTEGER, chunk_text TEXT, char_offset INTEGER, token_count INTEGER, embedding BLOB, embed_model TEXT, indexed_at TEXT` | Markdown chunks of vault `.md` files; `path+chunk_index` PK; embedding is a packed `f32` LE array (no vector extension needed) |
| `chunks_fts` | FTS5 shadow table, `content='note_chunks'` | Keyword retrieval + BM25 pre-filter when Ollama is unreachable |
| `memory_entries` | `id INTEGER PK, scope TEXT, kind TEXT, role TEXT, content TEXT, source TEXT, topic_title TEXT, active INTEGER, access_count INTEGER, last_accessed_at TEXT, created_at TEXT, embedding BLOB` | Durable agent memory. `scope`: `vault`/`note`/`topic`/`global`; `kind`: `fact`/`context`/`message` |
| `context_log` | `id INTEGER PK, turn_hash TEXT, scope TEXT, bundle_json TEXT, created_at TEXT` | Append-only audit of what context was fed to each turn |

Indexes: `idx_chunks_path ON note_chunks(path)`, `idx_memory_scope ON memory_entries(scope)`,
`idx_memory_active ON memory_entries(active)`.

**Verification points (do first):**
- Confirm FTS5 is compiled into the bundled rusqlite SQLite (rusqlite `bundled` normally
  enables it). If not, add `features = ["bundled", "modern_sqlite"]` to `rusqlite` in
  `src-tauri/Cargo.toml:19`, or fall back to a `LIKE`-based pre-filter (hybrid path still
  works — embedding does the ranking when Ollama is up).
- No new crate dependencies in this phase.

## Phase 1 — Rust backend

### 1a. `src-tauri/src/chunks.rs` (new)

Chunker for `.md` content (CLAUDE.md references a `parsers.rs` that does not exist —
this module is the real home):

- Strip YAML frontmatter.
- Split on structure: headings → paragraphs → code blocks → lists.
- ~512-token windows with ~32-token overlap; `char_offset` + `token_count` recorded.
- Public API: `chunk_markdown(content: &str) -> Vec<Chunk>` with `Chunk { text, char_offset, token_count }`.
- Unit tests (mirror the `#[cfg(test)]` style in `commands.rs`).

### 1b. `src-tauri/src/embeddings.rs` (new)

- `embed_texts(texts: &[String], config: EmbedConfig) -> Result<Vec<Vec<f32>>, String>`
  via `POST {embed_base_url}/api/embeddings` (Ollama shape:
  `{"model": "...", "input": [...]}` → `embeddings: number[][]`).
  - `embed_base_url` derived from `aiBaseUrl` host when unset: `http://localhost:11434`
    (strip the `/v1`). An OpenAI-compatible `/v1/embeddings` variant can be added later;
    detect by URL shape.
- `EmbedConfig { base_url, model, batch_size }` (batch default 16).
- `cosine(a, b) -> f32` + `top_k_scored(scores) -> Vec<(usize, f32)>` helpers.
- Timeouts + abort support mirroring `aiProvider.ts` patterns (`withTimeout`).

### 1c. Commands (`commands.rs`) + registration (`lib.rs:25`)

| Command | Behavior |
|---|---|
| `reindex_vault` (extend `:168`) | After `upsert_file_index`, diff `content_hash`; for changed/removed `.md` files, rebuild only that file's rows in `note_chunks` (delete stale, insert new). Reuse hash-gating already in place. |
| `rebuild_embeddings(vault_root)` | Idempotent, lazy: batch-embeds rows where `embedding IS NULL` via `embeddings.rs`; writes `f32` BLOBs + `embed_model`. No-op (fast) when server unreachable. |
| `search_rag(vault_root, query, limit)` | Hybrid: FTS5/BM25 top-k (e.g. 50) → embed query → cosine re-rank in Rust → return `{ path, title, snippet, score, line_number }` top-`limit`. When Ollama is down: return FTS5 BM25 results unchanged. |
| `add_memory(scope, kind, content, topic_title, source)` | Upsert `memory_entries`; embed content if server reachable. |
| `recall_memory(scope, query, limit)` | Embed query → cosine over `memory_entries` rows (scope-filtered, `active=1`); increment `access_count`/`last_accessed_at` on hits; fall back to keyword `LIKE` when offline. |
| `get_context_bundle(scope, vault_root, opts)` | Returns one `ContextBundle` struct: recent active memory digest, RAG top-k for topic, active-note excerpt, backlinks, optional file-tree hints. **Single source of truth for context** — frontend and Rust tools both consume it. |
| `export_markdown_to_pdf(title, content, target_path, vault_root)` | Phase 2b: renders `content` (markdown subset) to A4 PDF bytes via `pdf_export.rs` (printpdf 0.7, builtin Type1 fonts) and writes to `target_path` inside the vault root; creates missing parent folders (`.workspace` default `_attachments/exports/`). Returns the absolute written path. |

New `ContextBundle` struct in `commands.rs` (serde `Serialize`), assembled from
`recall_memory` + `search_rag` + `get_backlinks` (`:283`) + active-note content.

Register all new commands in `tauri::generate_handler![...]` (`lib.rs:25-41`).

### 1d. Trigger points

- `reindex_vault` continues to be called from `App.tsx` on vault open and from
  `OpenCodeView.tsx:217` after agent file edits.
- Frontend fires `rebuild_embeddings` (debounced) after reindex completes and when the
  app detects a local Ollama server is reachable.

## Phase 2 — Shared frontend service

**New:** `src/services/agentKnowledge.ts` (mirrors `workspaceTools.ts` / `aiProvider.ts`
patterns)

- `fetchContextBundle(scope, vaultRoot)` → `invoke("get_context_bundle", ...)`.
- `buildPromptWithContext({ messages, settings, scope })` → returns `ChatMessagePayload[]`
  composing: system prompt + memory digest + RAG passages + attachment block. Replaces the
  ad-hoc `contextPrefix` (`useStore.ts:1098-1105`) and the bare `slice(-10)` history
  (`useStore.ts:1113-1119`).
- `runAgentTask(task, context, settings)` → shared executor for the Micro Agent panel;
  calls `streamAIResponse` with the expanded tool set.
- `persistConversationTurn(userText, assistantText, scope)` → `add_memory(scope, "message", ...)`.
- `approveToolCall(req)` / `pendingToolApprovals` → approval gate for destructive writes
  (see Phase 2b).

### Tool expansion — `workspaceTools.ts`

Extend `WORKSPACE_TOOLS` (`:17`) with:

| Tool | Maps to | Read/write |
|---|---|---|
| `rag_search` | `search_rag(query)` | read |
| `recall_memory` | `recall_memory(scope, query)` | read |
| `save_memory` | `add_memory(scope, fact, content)` | memory-write (always allowed) |
| `get_note_context` | `get_context_bundle` for one note | read |
| `list_recent_notes` | `reindex_vault` index or dir walk | read |

All read/memory tools flow through the existing loop in `streamAIResponse`
(`aiProvider.ts:471-515`) with no changes to that file.

## Phase 2b — File-mutation tools (create / update / delete)

Goal: let the model **generate, update, and delete vault files through the same
tool-call loop**, reusing the existing Rust CRUD commands. Deliberately gated.

### New tools (`WORKSPACE_TOOLS`)

| Tool | Parameters | Backs on | Guardrails |
|---|---|---|---|
| `create_note` | `path` (relative to vault root), `content` | `create_local_file` (`commands.rs:482`) | requires `aiEnableFileWrite` |
| `edit_note` | `path`, `content`, `create_if_missing: bool` | `write_local_file` (`:454`) | requires `aiEnableFileWrite`; reject paths outside vault root via `validate_vault_path` (`:408`); read-only if file doesn't exist and `create_if_missing=false` |
| `delete_note` | `path` | `delete_local_entry` (`:587`) | requires `aiEnableFileWrite` **and** approval gate below |
| `rename_note` | `path`, `new_name` | `rename_local_entry` (`:554`) | requires `aiEnableFileWrite` **and** approval gate |
| `create_folder` | `path` | `create_local_dir` (`:531`) | requires `aiEnableFileWrite` |
| `export_markdown` | `path`, `content` | `write_local_file` (`:454`) into `_attachments/exports/` default sink | requires `aiEnableFileWrite`; creates new files only (no approval) |
| `export_pdf` | `path`, `title`, `content` | `export_markdown_to_pdf` (see 1c) into `_attachments/exports/` default sink | requires `aiEnableFileWrite`; creates new files only (no approval) |

### Approval gate (frontend)

- `executeWorkspaceTool` (`workspaceTools.ts:102`) gains an `await` on
  `useStore` `pendingToolApprovals`: for `delete_note`/`rename_note` (and overwrite of a
  non-empty file for `edit_note`), the tool suspends, the UI
  (`AssistantPanel.tsx` / `AgentPanel.tsx`) renders an inline confirm row from
  `agentKnowledge.ts`'s `approveToolCall`, and execution continues only after the user
  clicks **Approve** (or aborts with `cancelled`).
- `settings.confirmBeforeDelete` (`useStore.ts:104`) is reused as the default for approve-vs-reject.
- An `aiEnableFileWrite: boolean` setting gates the whole tool group (`useStore.ts:113`
  area + `SettingsModal.tsx`); default **false** — the tools are omitted from the payload
  entirely when disabled (same pattern as `aiEnableWorkspaceTools`, `aiProvider.ts:335`).

### Post-write reindex

- After a successful **write** tool, call `reindex_vault` (same trigger as
  `OpenCodeView.tsx:217`) then debounce `rebuild_embeddings` so retrieval catches the
  change. Failures are non-fatal (index catches up on next vault open).

## Phase 3 — Wire the three surfaces

1. **Study Assistant** — `sendAssistantMessage` (`useStore.ts:1073`):
   - Replace the bare prompt/history with `buildPromptWithContext` (scope =
     `assistantTopicTitle` falling back to vault path).
   - After a successful turn, call `persistConversationTurn`.
   - Render pending file-write approval rows in `AssistantPanel.tsx`.
2. **Micro Agent panel** — implement the stubbed `handleSend` (`AgentPanel.tsx:24`):
   route through `runAgentTask(task, agentContext ?? activeNote, settings)` where
   `agentContext` (highlighted text) supplies scope; persist each turn to memory.
3. **OpenCode Agent** — in `OpenCodeView.handleSend` (`OpenCodeView.tsx:260`), prefix the
   first message of a new session with a context bootstrap (memory digest + RAG for the
   workspace) as a leading text part. Verify the exact wire shape against a live
   `opencode serve` instance (same discipline as the existing SSE comments,
   `OpenCodeView.tsx:5-18`).

## Phase 4 — Settings & UX

**Settings (`useStore.ts` `Settings`, `:87`) + `SettingsModal.tsx`:**

| Key | Default | Notes |
|---|---|---|
| `embedBaseUrl` | `http://localhost:11434` (derived from `aiBaseUrl` host if empty) | Ollama HTTP endpoint |
| `embedModel` | `nomic-embed-text` | embedding model tag |
| `ragTopK` | `5` | passages injected per turn |
| `memoryAutoSave` | `true` | persist Q&A turns + extracted facts |
| `aiEnableFileWrite` | `false` | enables create/update/delete tools |
| `embedIndexStatus` (runtime only, not persisted) | — | index progress / "rebuilt" / "offline" shown in UI |

**UX:**
- Settings → AI: Memory-RAG section with index status + "Re-index embeddings" button.
- Assistant panel header: small memory/RAG status dot (mirrors the existing online dot,
  `AssistantPanel.tsx:173`).
- Micro Agent panel: respect `agentContext` chip when present (`AgentPanel.tsx:74-87`).

## Verification checklist

Per milestone, in order (mirrors `CLAUDE.md` testing):
1. `npx tsc --noEmit` — frontend types.
2. `cargo check` (in `src-tauri/`) — Rust.
3. `cargo test` — new chunker / cosine / reindex unit tests (existing test style in
   `commands.rs` / `db.rs`).
4. `npm run build` — production frontend build.
5. Manual smoke: open vault → index → ask Study Assistant a question referencing a note;
   run a Micro Agent task on highlighted text; watch pending write-approval row; confirm
   tools can create/update/delete a file with `aiEnableFileWrite` on and refuse when off.
6. If tagging a release: bump `src-tauri/tauri.conf.json` `"version"`, About section in
   `SettingsModal.tsx`, and `CHANGELOG.md` together.

## Milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M1** | Phase 0 schema + `chunks.rs` + `embeddings.rs` + `reindex_vault` grafting | `cargo check` + chunker unit tests green; DB migrates on existing install — **DONE 2026-09-05** |
| **M2** | `search_rag` (hybrid) + `add_memory`/`recall_memory`/`get_context_bundle` + `agentKnowledge.ts` + embed loop | `cargo check`/`test` green; `tsc --noEmit` + `npm run build` green — **DONE 2026-09-05** |
| **M2** | `search_rag` (hybrid) + `add_memory`/`recall_memory`/`get_context_bundle` | `cargo check` + cosine/FTS-fallback tests green |
| **M3** | `agentKnowledge.ts` + read/memory tool expansion + Study Assistant wiring | `tsc --noEmit`; assistant answers from vault content + persists memory — **DONE 2026-09-05** |
| **M4** | **Phase 2b file tools** + approval gate + reindex-after-write | Approve/deny flow works; write tools off by default; OpenCode-style reindex fires — **DONE 2026-09-05** |
| **M5** | Micro Agent + OpenCode bootstrap | All three surfaces share the service — **DONE 2026-09-05** |
| **M6** | Settings UI + index status UX | `npm run build` + release-exe smoke; docs bump if released — **DONE 2026-09-05** (settings UI + RAG status dot; release-exe smoke deferred to next device/lunch run) |
| **M7** | Phase 2b **artifact export** — `export_markdown` + `export_pdf` tools (Rust `export_markdown_to_pdf` via new `pdf_export.rs`), Artifacts panel `.md`/`.pdf` buttons, plan-doc update | `cargo test` green (incl. `pdf_export` `%PDF`/wrap/transliteration tests) · `npx tsc --noEmit` + `npm run build` green — **DONE 2026-09-11** |

Ordering note: M4 (file tools) is independent and can be picked up before M3 if a
write-capable agent matters more than memory first.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| FTS5 not compiled in bundled SQLite | Confirm first (Phase 0); fall back to pre-filter on `LIKE`, embeddings still rank |
| Embedding a whole vault is slow | Lazy `rebuild_embeddings`, batch size 16, hash-gated chunk diffing, debounced triggers |
| Model's write tool abusing paths | `validate_vault_path` enforcement, `aiEnableFileWrite` off by default, approve-gate on delete/rename/overwrite |
| OpenCode `serve` wire shape differs for system parts | Follow the existing pattern at `OpenCodeView.tsx:5-18`: verify against a live instance before committing |
| Destructive tool call while model loops | Approval promise can reject → tool result `"User cancelled"`; configurable via `confirmBeforeDelete` |
| Build locks from running exe | Kill `local-study-notebook.exe` before `tauri build` (see CLAUDE.md) |

## Out of scope (future)

- Chunk-insertion of **images / PDFs / DOCX** into RAG (existing pipeline was archived per
  `DATA_ARCHITECTURE_PLAN.md`; text/markdown only here).
- Alternative memory backends (Notion, filesystem markdown memory vault) — `memory_entries`
  table is the single store.
- `sqlite-vec0` extension / ANN indexes — cosine over FTS pre-filtered candidates is
  sufficient at study-notebook scale; revisit if vaults exceed ~50k chunks.
- Cloud embedding endpoints — local Ollama only; `embeddings.rs` keeps the OpenAI-compat
  shape possible as a follow-up.

---

## Progress log

### 2026-09-05 — M1 done (Agent Tools memory/context/RAG scaffold, backend layer)

**Status:** `cargo check` green · `cargo test` 21/21 green (chunker, embeddings, existing
index/history/backlink suites, and a new FTS5 trigger-sync assertion in
`db::tests::creates_vault_index_db`). Frontend untouched (still `npx tsc --noEmit` green by
definition).

**Delivered:**
- `db.rs` — additive schema: `note_chunks`, `chunks_fts` (external-content FTS5 over
  `chunks_fts.content='note_chunks'`), `chunks_ai`/`chunks_ad`/`chunks_au` triggers
  (FTS shadow kept in sync automatically), `memory_entries`, `context_log`. Verified FTS5
  **is** compiled into the bundled SQLite — no Cargo.toml change needed.
- `chunks.rs` (new) — markdown chunker: YAML frontmatter strip, blank-line blocks,
  heading-boundary flushes, ~512-token windows, ~32-token overlap (in the normal path **and**
  across oversized-block windows via `split_long_block`), byte-offset bookkeeping, token
  estimate (chars/4). 5 unit tests.
- `embeddings.rs` (new) — `pack_f32s`/`unpack_f32s` (f32 LE BLOB), `cosine`, `top_k_scored`
  with unit tests. **No HTTP client** (see decision below).
- `commands.rs` — `reindex_vault` now rebuilds `note_chunks` for every reindexed `.md`
  (`sync_chunks_for_file`; embeddings left NULL); delete/rename bookkeeping extended to
  `note_chunks`; new `get_unembedded_chunks` + `store_chunk_embeddings` commands.
- `lib.rs` — registered `chunks`/`embeddings` modules and the two new commands.

**Architecture decision (deviation from Phase 1b text):** embeddings HTTP moved to the
**frontend** (an `aiProvider.ts`-style fetch to `{embedBaseUrl}/api/embeddings`), with Rust
exposing only vector storage (`store_chunk_embeddings`) and, next milestone, retrieval.
Rationale: all AI HTTP in this app already lives in `aiProvider.ts`; keeping it there avoids
a new Rust HTTP-client dependency and any main-thread blocking concerns, and matches the
existing timeout/abort patterns. Cosine/top-k stay in Rust.

**Next: M2** — `search_rag` (FTS5 pre-filter + `embedding` cosine re-rank), `add_memory` /
`recall_memory` / `get_context_bundle`, plus the frontend `agentKnowledge.ts` wrapper and
embedding-rebuild loop (frontend side of Phase 1d).

### 2026-09-05 — M2 + M3 done (Memory-RAG commands, shared frontend service, Study Assistant wiring)

**Status:** `cargo check` + `cargo test` **23/23 green** (2 new `drive.rs` tests from the
parallel Google Drive feature also pass now); `npx tsc --noEmit` green; `npm run build`
green.

**M2 — Rust commands + frontend service:**
- `commands.rs`: `search_rag` (FTS5/BM25 pre-filter → query-embedding cosine re-rank in
  Rust → top-`limit` `RagHit{path,title,snippet,score,char_offset}`), `add_memory`,
  `recall_memory` (`recall_memory_internal`: scope filter, keyword `LIKE` fallback when the
  query embedding is empty, `last_accessed_at` touch on hits), `get_context_bundle`
  (assembles `ContextBundle{scope, memory, rag, active_note, backlinks}`), plus helpers
  (`vault_path_prefix`, `fts_terms`, `fts_match_query`, `title_from_path`).
- `lib.rs`: all M2 commands registered (`search_rag`, `add_memory`, `recall_memory`,
  `get_context_bundle`, plus M1's `get_unembedded_chunks`/`store_chunk_embeddings`).
- `useStore.ts`: Settings + defaults for `embedBaseUrl` (`http://localhost:11434`),
  `embedModel` (`nomic-embed-text`), `ragTopK` (5), `memoryAutoSave` (true).
- `aiProvider.ts`: `deriveEmbedBaseUrl()` (strips `/v1`) + `embedTexts()` batch embedder
  against `{base}/api/embeddings` with a 60s timeout and graceful `[]` on failure.
- `agentKnowledge.ts` (new): types (`RagHit`, `MemoryItem`, `ActiveNoteContext`, `Backlink`,
  `ContextBundle`), `embedQuery`, `rebuildEmbeddings` (lazy idempotent batch loop through
  `get_unembedded_chunks` → embed → `store_chunk_embeddings`), `fetchContextBundle`,
  `remember`, `recall`, `formatContextBundle`, `runAgentTask`, `buildPromptWithContext`
  (M3), `persistConversationTurn` (M3).

**M3 — Study Assistant wiring + read/memory tool expansion:**
- `sendAssistantMessage` (`useStore.ts`) now composes its payload via
  `buildPromptWithContext` (scope = `assistantTopicTitle` → vault basename → `"global"`,
  query = the user's message), replacing the ad-hoc `contextPrefix` + bare `slice(-10)`;
  Memory-RAG context (memory digest + RAG passages + backlinks) is fused into the system
  prompt, degrading to plain prompt/history if the bundle fails.
- Auto-persists each completed turn via `persistConversationTurn` when
  `memoryAutoSave !== false` (fire-and-forget, fire on non-blank output only).
- Lazy indexing: `openFolder` now triggers a **debounced (800 ms) `rebuildEmbeddings`**
  pass after `reindex_vault` resolves (Phase 1d frontend side); no-op when AI disabled.
- `workspaceTools.ts` — 5 new tools (read/memory only, no file mutation yet): `rag_search`,
  `recall_memory`, `save_memory` (memory-write, always allowed), `get_note_context`
  (full bundle for one note), `list_recent_notes` (top-level dir walk). All flow through the
  existing `streamAIResponse` tool loop unchanged.

**Next: M4** — Phase 2b file-mutation tools (`create_note`/`edit_note`/`delete_note`/
`rename_note`/`create_folder`) gated behind `aiEnableFileWrite` (default off) + the inline
approval gate + reindex-after-write. M5 (Micro Agent + OpenCode bootstrap) after that.

### 2026-09-05 — M4 + M5 + M6 done (file tools, approval gate, all surfaces wired, UX)

**Status:** `cargo check` + `cargo test` **23/23 green** (incl. the parallel Drive feature's
tests) · `npx tsc --noEmit` green · `npm run build` green.

**M4 — Phase 2b file-mutation tools (gated):**
- `useStore.ts`: `aiEnableFileWrite` setting (default **false**) + `PendingToolApproval`
  type + `pendingToolApprovals` state with `addPendingToolApproval` /
  `resolveToolApproval` / `clearToolApproval` actions.
- `workspaceTools.ts`: `FILE_WRITE_TOOLS` (`create_note`, `edit_note`, `delete_note`,
  `rename_note`, `create_folder`) — only exposed to the model when `aiEnableFileWrite` is
  on (same pattern as `aiEnableWorkspaceTools`). Execute paths validate paths inside the
  vault root (`resolveVaultPath`, mirrors Rust `validate_vault_path`), route `delete_note`/
  `rename_note`/`edit_note`-overwrite through `requireApproval` (polls the store till the
  user responds), and call `triggerPostWriteReindex` (vault reindex → debounced lazy
  `rebuildEmbeddings`) after every successful write. `edit_note` reads the target first and
  refuses to touch a non-empty file without approval (or creates it via
  `create_if_missing`); `create_note` refuses to overwrite.
- `AssistantPanel.tsx`: inline amber approval rows (Approve / Deny + auto-cleanup).
- `SettingsModal.tsx`: Memory-RAG section — embedding Base URL / model, RAG Top-K,
  "Re-index embeddings" button (runs `rebuildEmbeddings` for the open vault,
  `embedIndexStatus`-style inline feedback), auto-save-memory toggle, and the
  **Allow AI file writes** toggle (with a warning that destructive actions still need user
  approval).

**M5 — all three surfaces share the service:**
- **Micro Agent** (`AgentPanel.tsx` `handleSend`): now runs through `runAgentTask`
  (`agentKnowledge.ts`) with per-task instructions, streamed chunks into the live bubble,
  and each turn persisted to durable memory (respects `memoryAutoSave`). Task prompts:
  summarize / improve / assess / custom.
- **OpenCode bootstrap** (`OpenCodeView.tsx` `handleSend`): the **first message of a new
  session** now fuses a Memory-RAG bootstrap (memory digest + RAG passages for the
  workspace) into a leading text part; degrades to the bare message when offline.
  Post-file-write `reindex_vault` firing (existing OpenCodeView.tsx:217) unchanged.

**M6 — Settings/UX polish:**
- Settings → AI gained the full Memory-RAG section (above) + "Re-index embeddings".
- Assistant header now shows a small **RAG status dot** (sky when `aiEnabled`, with the
  embed model + base URL in the tooltip) beside the existing online dot.
- Micro Agent context-chip UX (`AgentPanel.tsx:74-87`) already respected `agentContext`
  from the prior scaffold.

**Remaining/out of scope for now:** `embedIndexStatus` lives as component-local state in
Settings rather than the store (runtime-only per plan); the release-exe smoke test
(verification checklist item 5/6) is deferred until the next manual launch of the app.

### 2026-09-11 — M7 done (Phase 2b artifact export: markdown + PDF)

**Status:** `cargo check` + `cargo test` green (23 existing + **4 new `pdf_export` tests**
= 27) · `npx tsc --noEmit` green · `npm run build` green.

**Delivered (user asked whether PDF/markdown export was in the tool draft → it wasn't →
"proceed"):**
- `src-tauri/src/pdf_export.rs` (new) — markdown-subset → A4 PDF renderer on `printpdf`
  **0.7.0** using builtin Type1 fonts (Helvetica/HelveticaBold/HelveticaOblique/Courier),
  so **no font file ships / runtime system-font lookup needed**. Handles headings (H1–H4),
  paragraphs, bullet/ordered lists, blockquotes (italic), fenced + inline code (Courier,
  hard-wrapped), horizontal rules (drawn line), table-rows-as-text; strips
  links/images/emphasis/HTML; word-wraps with an advance-width estimate and auto page
  breaks. Text is transliterated to Windows-1252 (printpdf builtin-font limitation).
  Uses the classic `use_text(text, size_pt, Mm(x), Mm(y), &font)` API (mm, bottom-left
  origin) — **chosen 0.7 over 0.12** because 0.12's ops-based API has no builtin fonts
  (needs external TTF + manual glyph metrics/layout). 4 unit tests (`%PDF` header +
  `%%EOF`, long-content render, transliteration, word-wrap limits).
- `commands.rs` — new `#[tauri::command] export_markdown_to_pdf(title, content,
  target_path, vault_root)` (creates missing parent dirs, validates inside vault root via
  `validate_vault_path`, writes bytes). Registered in `lib.rs`.
- `workspaceTools.ts` — **two new Phase 2b tools** gated by `aiEnableFileWrite` (default
  off): `export_markdown` (writes `.md` via `write_local_file` → reindex) and `export_pdf`
  (invokes the Rust command; PDFs are binary → no reindex). Both create new files only, so
  **no approval gate**; default sink `<vault>/_attachments/exports/` (pre-created via
  `create_local_dir`).
- `agentKnowledge.ts` — shared `exportArtifact({ title, content, vaultRoot, format })`
  helper (slugifies the title, ensures the sink, returns the absolute written path).
- `ArtifactsPanel.tsx` — active-artifact header gained **`.md` / `.pdf`** export buttons
  with inline feedback + `refreshExplorer` after write (needs an open vault).

**Remaining:** only the deferred release-exe smoke test; export sinks on other planets
(future Phase 2c cloud drive) can reuse `exportArtifact` unchanged.

---

## Appendix — Full source of the new files created across M1–M6

The three files below are the brand-new source files authored for this plan (the rest are
edits to existing files). Keep them in sync if you change the plan text.

### `src-tauri/src/chunks.rs` (M1 — markdown chunker)

```rust
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
```

### `src-tauri/src/embeddings.rs` (M1 — vector pack/cosine/top-k)

```rust
// Vector helpers for Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M1).
// Embedding vectors are stored in SQLite as packed little-endian f32 BLOBs; cosine
// similarity and top-k are computed in Rust over candidate rows (FTS5 pre-filter +
// re-rank). The embedding HTTP calls run in the frontend (consistent with aiProvider.ts),
// which is why this module has no network client.

/// Packs f32 values into a contiguous little-endian byte blob for SQLite storage.
pub fn pack_f32s(values: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(values.len() * 4);
    for v in values {
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}

/// Unpacks a blob produced by [`pack_f32s`]. Trailing bytes that don't form a complete
/// f32 are ignored.
#[allow(dead_code)]
pub fn unpack_f32s(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

/// Cosine similarity between two vectors. Returns 0.0 if either vector has no magnitude
/// or the lengths differ (zip truncates).
#[allow(dead_code)]
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let mut dot = 0.0f64;
    let mut na = 0.0f64;
    let mut nb = 0.0f64;
    for (x, y) in a.iter().zip(b.iter()) {
        let x = *x as f64;
        let y = *y as f64;
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    (dot / (na.sqrt() * nb.sqrt())) as f32
}

/// Returns the indices of the highest-scoring `(index, score)` pairs, descending.
#[allow(dead_code)]
pub fn top_k_scored<I: Iterator<Item = (usize, f32)>>(scores: I, k: usize) -> Vec<usize> {
    let mut list: Vec<(usize, f32)> = scores.collect();
    list.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    list.into_iter().take(k).map(|(idx, _)| idx).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_unpack_roundtrip() {
        let values = vec![0.0f32, -1.5, 3.25, f32::MIN, f32::MAX];
        let blob = pack_f32s(&values);
        assert_eq!(blob.len(), values.len() * 4);
        assert_eq!(unpack_f32s(&blob), values);
    }

    #[test]
    fn unpack_ignores_padding_bytes() {
        let mut blob = pack_f32s(&[1.0, 2.0]);
        blob.push(0xAA);
        assert_eq!(unpack_f32s(&blob), vec![1.0, 2.0]);
    }

    #[test]
    fn cosine_known_values() {
        assert!((cosine(&[1.0, 0.0], &[1.0, 0.0]) - 1.0).abs() < 1e-6);
        assert!((cosine(&[1.0, 0.0], &[0.0, 1.0]) - 0.0).abs() < 1e-6);
        assert_eq!(cosine(&[0.0, 0.0], &[1.0, 1.0]), 0.0);
        assert_eq!(cosine(&[1.0, 1.0], &[]), 0.0);
    }

    #[test]
    fn top_k_returns_highest_first() {
        let idxs = top_k_scored([(0usize, 0.1f32), (1, 0.9), (2, 0.5)].into_iter(), 2);
        assert_eq!(idxs, vec![1, 2]);
        assert!(top_k_scored([(0, 0.1), (1, 0.9)].into_iter(), 0).is_empty());
    }
}
```

### `src/services/agentKnowledge.ts` (M2/M3 — shared Agent Knowledge service)

```ts
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../stores/useStore";
import { embedTexts, streamAIResponse, ChatMessagePayload } from "./aiProvider";

// ---------------------------------------------------------------------------
// Agent Knowledge Service (AGENT_MEMORY_RAG_PLAN.md, Phase 2).
// Single frontend wrapper over the Memory-RAG commands consumed by every surface
// (Study Assistant, Micro Agent panel, OpenCode bootstrap). Mirrors the tool-loop
// pattern in aiProvider.ts: all AI HTTP lives here/in aiProvider, Rust stores + ranks.
// ---------------------------------------------------------------------------

export interface RagHit {
  path: string;
  title: string;
  snippet: string;
  score: number;
  char_offset: number;
}

export interface MemoryItem {
  id: number;
  scope: string;
  kind: string;
  content: string;
  source: string;
  topic_title: string | null;
  created_at: string;
  score: number;
}

export interface ActiveNoteContext {
  path: string;
  title: string;
  excerpt: string;
}

export interface Backlink {
  id?: number;
  source_path: string;
  target_path: string;
  link_text: string;
  line_number: number;
}

export interface ContextBundle {
  scope: string;
  memory: MemoryItem[];
  rag: RagHit[];
  active_note: ActiveNoteContext | null;
  backlinks: Backlink[];
}

/** Embeds one query text; returns [] when the embed server is unreachable. */
async function embedQuery(text: string, settings: Settings): Promise<number[]> {
  try {
    const [vec] = await embedTexts([text], settings);
    return vec ?? [];
  } catch {
    return [];
  }
}

/**
 * Lazy, idempotent embedding rebuild: pulls chunks whose embedding is still NULL and
 * batches them to the Ollama server until none remain. Returns how many rows gained a
 * vector; stops early (returns accumulated count) if the server goes away mid-loop.
 */
export async function rebuildEmbeddings(vaultRoot: string, settings: Settings, batchSize = 16): Promise<number> {
  let total = 0;
  for (;;) {
    const chunks = await invoke<Array<{ rowid: number; path: string; chunk_index: number; text: string }>>(
      "get_unembedded_chunks",
      { vaultRoot, limit: batchSize }
    );
    if (!chunks.length) break;

    const embeddings = await embedTexts(chunks.map((c) => c.text), settings);
    const items: Array<{ rowid: number; embedding: number[] }> = [];
    chunks.forEach((c, i) => {
      const vec = embeddings[i];
      if (vec && vec.length) items.push({ rowid: c.rowid, embedding: vec });
    });
    if (!items.length) break; // embed server unavailable — keep what we have

    const updated = await invoke<number>("store_chunk_embeddings", {
      items,
      embedModel: settings.embedModel || "nomic-embed-text",
    });
    total += updated;
  }
  return total;
}

/**
 * Fetches the single ContextBundle a turn needs: recent related memory, RAG passages,
 * active-note excerpt, and backlinks. `queryText` defaults to the scope (topic title).
 */
export async function fetchContextBundle(opts: {
  vaultRoot: string;
  scope: string;
  queryText?: string;
  activeNotePath?: string | null;
  limit?: number;
}): Promise<ContextBundle | null> {
  const state = await import("../stores/useStore");
  const settings = state.useStore.getState().settings;
  if (!opts.vaultRoot || !opts.scope) return null;

  const queryText = opts.queryText || opts.scope;
  const queryEmbedding = await embedQuery(queryText, settings);

  return invoke<ContextBundle>("get_context_bundle", {
    vaultRoot: opts.vaultRoot,
    scope: opts.scope,
    queryText,
    queryEmbedding,
    activeNotePath: opts.activeNotePath ?? null,
    ragLimit: opts.limit ?? settings.ragTopK ?? 5,
  });
}

/** Persists a durable memory entry (kind: fact | context | message) with an embedding. */
export async function remember(opts: {
  scope: string;
  kind: "fact" | "context" | "message";
  content: string;
  source: string;
  topicTitle?: string;
}, settings?: Settings): Promise<number | null> {
  if (!opts.content.trim()) return null;
  const s = settings ?? (await import("../stores/useStore")).useStore.getState().settings;
  const embedding = await embedQuery(opts.content, s);
  try {
    return await invoke<number>("add_memory", {
      scope: opts.scope,
      kind: opts.kind,
      content: opts.content,
      source: opts.source,
      topicTitle: opts.topicTitle ?? null,
      embedding,
    });
  } catch {
    return null;
  }
}

/** Semantic recall over durable memory; degrades to keyword (created_at desc) offline. */
export async function recall(opts: {
  query: string;
  scope?: string;
  limit?: number;
}): Promise<MemoryItem[]> {
  const s = (await import("../stores/useStore")).useStore.getState().settings;
  const embedding = await embedQuery(opts.query, s);
  try {
    return await invoke<MemoryItem[]>("recall_memory", {
      scope: opts.scope ?? "global",
      queryText: opts.query,
      queryEmbedding: embedding,
      limit: opts.limit ?? s.ragTopK ?? 5,
    });
  } catch {
    return [];
  }
}

/** Renders a ContextBundle into prompt-injectable markdown. */
export function formatContextBundle(bundle: ContextBundle): string {
  const parts: string[] = [];

  if (bundle.active_note) {
    parts.push(
      `### Active Note: ${bundle.active_note.title}\nPath: \`${bundle.active_note.path}\`\n\n${bundle.active_note.excerpt.slice(0, 2000)}`
    );
  }

  if (bundle.rag.length) {
    const passages = bundle.rag
      .map((r) => `- **[${r.title}]** (score ${r.score.toFixed(3)}): ${r.snippet}`)
      .join("\n");
    parts.push(`### Related notes (retrieved)\n${passages}`);
  }

  if (bundle.memory.length) {
    const mem = bundle.memory
      .map((m) => `- [${m.kind}/${m.scope}] ${m.content}`)
      .join("\n");
    parts.push(`### Prior memory\n${mem}`);
  }

  if (bundle.backlinks.length) {
    const links = bundle.backlinks
      .map((b) => `- Linked from \`${b.source_path}\` (line ${b.line_number}): "${b.link_text}"`)
      .join("\n");
    parts.push(`### Backlinks\n${links}`);
  }

  return parts.join("\n\n");
}

/**
 * Composes the ChatMessagePayload[] the Study Assistant (and other surfaces) send to the
 * model: a system prompt fused with the Memory-RAG context bundle (memory digest, RAG
 * passages, backlinks), recent history, and an optional attachment block appended to the
 * latest user message. Replaces the ad-hoc `contextPrefix` + bare `slice(-10)` in
 * `sendAssistantMessage`. Degrades gracefully: offline/embed-server errors fall back to
 * the plain prompt + history.
 */
export async function buildPromptWithContext(opts: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  settings: Settings;
  scope: string;
  vaultRoot?: string;
  queryText?: string;
  attachment?: string;
  ragLimit?: number;
}): Promise<ChatMessagePayload[]> {
  const { settings, messages, scope, vaultRoot } = opts;
  const systemBase = settings.aiSystemPrompt || "You are an intelligent study assistant for Local Study Notebook.";

  let bundle: ContextBundle | null = null;
  if (vaultRoot) {
    try {
      bundle = await fetchContextBundle({
        vaultRoot,
        scope,
        queryText: opts.queryText || scope,
        limit: opts.ragLimit ?? settings.ragTopK ?? 5,
      });
    } catch {
      bundle = null;
    }
  }

  const contextBlock = bundle ? formatContextBundle(bundle) : "";
  const system = contextBlock
    ? `${systemBase}\n\nUse this retrieved context. Do not claim facts beyond it:\n\n${contextBlock}`
    : systemBase;

  const history = messages.slice(-10).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const historyPayload: ChatMessagePayload[] = [
    { role: "system", content: system },
    ...history,
  ];

  // Attach context (active-note excerpt, etc.) to the newest user turn explicitly.
  if (opts.attachment && historyPayload.length > 1) {
    const last = historyPayload[historyPayload.length - 1];
    historyPayload[historyPayload.length - 1] = {
      ...last,
      content: `${opts.attachment}${last.content}`,
    };
  }

  return historyPayload;
}

/** Persists a Q&A turn to durable memory when `memoryAutoSave` is enabled. */
export async function persistConversationTurn(opts: {
  userText: string;
  assistantText: string;
  scope: string;
}, settings?: Settings): Promise<number | null> {
  const s = settings ?? (await import("../stores/useStore")).useStore.getState().settings;
  if (s.memoryAutoSave === false) return null;
  if (!opts.assistantText.trim()) return null;
  return remember(
    {
      scope: opts.scope,
      kind: "message",
      content: `Q: ${opts.userText}\nA: ${opts.assistantText.slice(0, 2000)}`,
      source: "study-assistant",
      topicTitle: opts.scope,
    },
    s
  );
}

/**
 * Micro-agent executor used by the Agent panel (summarize/improve/assess/custom) and
 * reuseable anywhere a one-shot task needs memory + RAG context. Streams the completion
 * through `onChunk` and returns the final text.
 */
export async function runAgentTask(opts: {
  task: string;
  context: string;
  scope: string;
  vaultRoot: string;
  onChunk?: (text: string) => void;
  onStatusChange?: (status: string) => void;
}): Promise<string> {
  const { useStore } = await import("../stores/useStore");
  const store = useStore.getState();
  const settings = store.settings;

  const bundle = await fetchContextBundle({
    vaultRoot: opts.vaultRoot,
    scope: opts.scope,
    queryText: opts.context || opts.scope,
    activeNotePath: store.activeLeftTabId || store.activeRightTabId,
  });

  const contextBlock = bundle ? formatContextBundle(bundle) : "";
  const system = [
    "You are the Local Study Notebook micro-agent. Perform the requested task using only the provided context and your own knowledge.",
    "Do not invent facts not supported by the context. Keep the answer concise and well-structured.",
  ].join(" ");

  const messages: ChatMessagePayload[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: `[TASK]\n${opts.task}\n\n[CONTEXT]\n${contextBlock || opts.context}\n[TARGET TEXT]\n${opts.context}`,
    },
  ];

  let out = "";
  await streamAIResponse({
    messages,
    settings,
    onChunk: (t) => {
      out = t;
      opts.onChunk?.(t);
    },
    onStatusChange: opts.onStatusChange,
  });
  return out;
}
```