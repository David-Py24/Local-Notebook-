# Agent Tools — Implementation & Inventory Plan (Local Study Notebook)

A **standalone** plan that explicitly covers the **agent tool system**: the tool loop,
the current inventory, gating/model-governance, approval UX, and the forward roadmap for
adding tools.

**Why separate from `AGENT_MEMORY_RAG_PLAN.md`:** that file owns the memory/RAG plumbing
(schema, chunker, embeddings, retrieval, context bundling) that *feeds* tool execution.
This file owns the **tools themselves** — what the model can call, how a call is
dispatched and gated, and what guardrails/approvals exist before any call touches the user's
vault. Where a tool needs Rust work that is memory/RAG-flavoured, this plan points at
`AGENT_MEMORY_RAG_PLAN.md` instead of duplicating it.

Surfaces that use the tool system:

1. **Study Assistant** (`AssistantPanel.tsx`, study mode) — tool loop enabled.
2. **Micro Agent panel** (`AgentPanel.tsx`) — runs through `runAgentTask`
   (`agentKnowledge.ts`) which also enters the tool loop (see Known gaps, §9).
3. **OpenCode Agent** (`OpenCodeView.tsx`) — **does NOT** use `executeWorkspaceTool`; it has
   its own native toolset (file edit, git, shell, LSP). It is included here only because
   OpenCode file edits post-trigger `reindex_vault` so the Assistant/RAG see the changes.

---

## 1. Tool-loop architecture

```
 model (Ollama / OpenAI / Gemini ...)
   │  streamAIResponse (aiProvider.ts)  — n-round tool loop
   │    payload.tools = await buildEffectiveTools()   (only if aiEnableWorkspaceTools)
   ▼
 tool_calls chunked in `toolCallsBuffer` (aiProvider.ts:369)
   │  per call: onToolCall(name,args) → executeWorkspaceTool(name, args) (workspaceTools.ts:501)
   ▼
 executeWorkspaceTool
   ├─ read/memory tools      → invoke(...) Rust commands / agentKnowledge helpers
   ├─ file-write tools       → gate(aiEnableFileWrite) → resolveVaultPath → [approval] → invoke
   └─ `<connector>/<tool>`   → call_connector_tool (MCP, src-tauri/src/mcp.rs)
   │  result appended as { role:"tool", content }  (aiProvider.ts:545)
   ▼
 follow-up completion ("Synthesizing results...") — loop repeats while model keeps calling tools
```

Key invariants:

- **One dispatcher.** Every builtin user-space tool resolves in `executeWorkspaceTool`
  (`workspaceTools.ts:501`). Adding a tool = one `ToolDefinition` + one branch.
- **Tools are assembled once per request** by `buildEffectiveTools()`
  (`workspaceTools.ts:70`): `WORKSPACE_TOOLS` (always) + `FILE_WRITE_TOOLS` (only when
  `aiEnableFileWrite`) + enabled MCP connectors' tools (namespaced) with offline-http
  connectors excluded.
- **Tool results are just message content.** The model never gets raw Rust structs.
- **Failure convention:** a tool returns a human-readable `Error: ...` string, never throws
  (the single `catch` at the end of `executeWorkspaceTool` stringifies the exception).

---

## 2. Tool inventory — read / memory (always exposed, `WORKSPACE_TOOLS`)

| Tool | Calls / backs on | Result shape | Notes |
|---|---|---|---|
| `search_vault(query)` | `invoke("search_vault")` | snippet rows | SQLite FTS/LIKE over the vault index |
| `read_active_note()` | `useStore` left/right draft | full active-note text + path | no Rust round-trip |
| `get_note_backlinks(note_path)` | `invoke("get_backlinks")` | `{source_path, link_text, line_number}` | |
| `rag_search(query, limit?)` | embed → `invoke("search_rag")` | `{path,title,snippet,score}` | semantic + keyword hybrid; offline → BM25 only |
| `recall_memory(query, scope?, limit?)` | embed → `invoke("recall_memory")` | `{kind,scope,content,...}` | keyword `LIKE` fallback offline |
| `save_memory(scope, content, topic_title?)` | `remember(...)` → `invoke("add_memory")` | created id / null | memory-write; **always allowed**, not part of file-write gate |
| `get_note_context(note_path?, query?)` | `fetchContextBundle` + `formatContextBundle` | rendered markdown bundle | single-note context: RAG + memory + backlinks + excerpt |
| `list_recent_notes(limit?)` | `invoke("read_local_dir")` at vault root | top-level `.md/.txt` names | |

All eight flow through the existing loop with **no changes** to `aiProvider.ts`
(`streamAIResponse` tool handling is surface-agnostic).

## 3. Tool inventory — file-write (gated, `FILE_WRITE_TOOLS`)

Omitted from the payload entirely unless `settings.aiEnableFileWrite === true`
(default **false**).

| Tool | Parameters | Backs on (`commands.rs`) | Approval gate |
|---|---|---|---|
| `create_note` | `path`, `content` | `create_local_file` + `write_local_file` | none — refuses existing file |
| `edit_note` | `path`, `content`, `create_if_missing?` | `write_local_file` | **required** when overwriting a non-empty existing file; no-op otherwise |
| `delete_note` | `path` | `delete_local_entry` | **required** (destructive) |
| `rename_note` | `path`, `new_name` | `rename_local_entry` | **required** |
| `create_folder` | `path` | `create_local_dir` | none |
| `export_markdown` | `path`, `content` | `write_local_file` into `<vault>/_attachments/exports/` | none — creates new files only |
| `export_pdf` | `path`, `title?`, `content` | `export_markdown_to_pdf` (see §6, AGENT_MEMORY_RAG_PLAN.md 1c) | none — creates new files only |

Post-write behaviour: every successful write calls `triggerPostWriteReindex`
(`workspaceTools.ts:437`) → `reindex_vault` → debounced (500 ms) lazy
`rebuildEmbeddings` when AI is enabled. PDFs are binary and deliberately skip reindex.

## 4. Gating matrix (model-governance)

| Setting | Default | Effect |
|---|---|---|
| `aiEnabled` | `true` | master switch for AI (Assistant/Agent surfaces) |
| `aiEnableWorkspaceTools` | `true` | gates `payload.tools = buildEffectiveTools()` in `streamAIResponse` — when off, the model has **no tools at all** |
| `aiEnableFileWrite` | `false` | Gates the seven `FILE_WRITE_TOOLS` at assembly and at execution (belt-and-braces double check) |
| per-call approval | — | `delete_note`, `rename_note`, and `edit_note`-overwrite suspend until the user clicks Approve/Deny in the UI |

## 5. Approval gate (interactive)

- `requireApproval({tool, args, summary})` (`workspaceTools.ts:418`) pushes a
  `PendingToolApproval` into the Zustand store and **polls** `awaitApproval(id)` until the
  UI resolves it (150 ms interval). Non-pending/removed entries auto-reject.
- `AssistantPanel.tsx` renders amber inline rows (Approve / Deny) from
  `pendingToolApprovals`; Approve resolves + auto-cleans, Deny clears immediately.
- Store actions: `addPendingToolApproval` / `resolveToolApproval` / `clearToolApproval`.

## 6. Path safety (both layers)

- **Frontend** `resolveVaultPath(vaultRoot, rel)` (`workspaceTools.ts:382`) rejects
  absolute paths, drive letters, `..` escapes and `\0`; output must stay under the vault
  root (case-insensitive prefix on Windows).
- **Rust** `validate_vault_path` (`commands.rs:450`) canonicalizes and re-checks every
  command the write tools call, so a frontend bypass still cannot escape the vault.
- Export paths additionally create parents (`_attachments/exports/`) up front and validate
  the final absolute path before writing.

## 7. Export subsystem (M7 — built 2026-09-11)

- `src-tauri/src/pdf_export.rs` — markdown-subset → A4 PDF renderer on **printpdf 0.7**
  (builtin Type1 fonts Helvetica/Courier; **no shipped TTF / runtime font lookup**).
  Headings, lists, blockquotes, fenced+inline code, horizontal rules, table-rows-as-text;
  word-wrap + page-break layout; Windows-1252 transliteration. 4 unit tests.
- `export_markdown_to_pdf(title, content, target_path, vault_root)` registered in `lib.rs`.
- `exportArtifact({title, content, vaultRoot, format})` (`agentKnowledge.ts:299`) — shared
  sink for the Artifacts panel buttons **and** future cloud-drive sinks.
- `ArtifactsPanel.tsx` — `.md` / `.pdf` export buttons on the active artifact with inline
  result text + `refreshExplorer`.

## 8. MCP connectors (multi-agent; `src-tauri/src/mcp.rs`)

- Enabled connectors are listed via `list_connector_tools` and merged as
  `<connectorName>/<toolName>` so they can never collide with builtin names.
- `executeWorkspaceTool` strips the prefix and dispatches to `call_connector_tool`; offline
  http connectors are excluded up front in `buildEffectiveTools`.
- MCP tools are not part of the file-write gate (they are externals); their own auth/env
  config governs safety.

## 9. Known gaps & risks (as of 2026-09-11)

| Gap | Impact | Proposed fix (roadmap) |
|---|---|---|
| **Micro Agent approval hang**: `runAgentTask` does not pass `onToolCall` and `AgentPanel.tsx` renders no approval rows — a file-write call from the Agent panel would poll forever | hangs the agent turn | plumb `onToolCall` + approval rows into `AgentPanel.tsx` (T2.1) |
| `read` tools have no `read_note_by_path` (reading is limited to the active note or search snippets) | model must open a tab to read arbitrary files | add `read_note(path)` tool → `read_local_file` (T1.1) |
| No way to list the artifact store or delete an artifact | artifact hygiene via agent impossible | `list_artifacts` / `delete_artifact` (T1.3) |
| Export is write-tool-gated; Artifacts-panel buttons require a vault but not `aiEnableFileWrite` | UI/agent asymmetry in "safe create" reasoning | document + keep (deliberate) |
| Tool payload re-embeds query each call (`embedTexts`) | latency | memoize embedded query within a turn (T2.3) |
| No `append_note` (edit is full overwrite) | long-assistant outputs risk clobbering | add `append_note` behind approval-if-exists (T1.2) |

## 10. Roadmap — forward plan for the tool system

### T1 — round out reads & artifact hygiene (no new gating surfaces)

| Tool | Backs on | Notes |
|---|---|---|
| `read_note(path)` | `read_local_file` (exists) | vault-relative path input |
| `append_note(path, append)` | new little Rust or read+merge+write | approval only when file non-empty |
| `list_artifacts()` / `delete_artifact(id)` | `useStore.artifacts` | in-memory artifact store |

### T2 — tool-loop hardening

| Item | Notes |
|---|---|
| T2.1 AgentPanel onToolCall + approval rows | fixes §9 hang; render amber rows in `AgentPanel.tsx` |
| T2.2 Strict tool schemas (`json_schema`/`strict`) for OpenAI-class providers; required-args list already present | reduces malformed `arguments` JSON |
| T2.3 per-turn embed memoization + `onToolCall` status streaming in AssistantPanel | latency + visibility |
| T2.4 tool-count caps + abort-on-user-stop during tool loop | trust/safety |

### T3 — future-capability tools (stretch)

- `reindex_workspace` (explicit), `get_vault_status` (index size, embed coverage).
- `export_artifact` accepted `format: "docx" | "txt" | "html"` (reuses `exportArtifact` sink;
  PDF already built).
- Cloud drive sink: point `exportArtifact`'s sink resolver at the Drive feature
  (`src-tauri/src/drive.rs`) reuse unchanged.
- `solve_math` / `flashcard_gen` structured tools.

## 11. Milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| **T0** | Scaffold: `WORKSPACE_TOOLS` (search/backlinks/active-note) + tool loop | assistant answers from vault via search tool — **DONE** (pre-M1 heritage, verified in AGENT_MEMORY_RAG_PLAN M1–M3) |
| **T1-read** | `rag_search` / `recall_memory` / `save_memory` / `get_note_context` / `list_recent_notes` | `tsc`+`cargo` green — **DONE 2026-09-05** (M3) |
| **T1-write** | `FILE_WRITE_TOOLS` (create/edit/delete/rename/folder) + approval gate + reindex-after-write | approval flow works; tools off by default — **DONE 2026-09-05** (M4) |
| **T1-export** | `export_markdown` + `export_pdf` + `exportArtifact` + Artifacts-panel buttons | `cargo test` 27/27, `tsc`, `npm run build` green — **DONE 2026-09-11** (M7) |
| **T2.1** | AgentPanel tool loop + approval rows | micro-agent file-write calls resolve via UI, no hang |
| **T2.2** | Strict schemas + embed memoization | `tsc` green; tool-call latency down |
| **T3** | Extended read/export/cloud-sink tools (§10) | per-item acceptance |

## 12. Verification checklist (per tools milestone)

1. `npx tsc --noEmit`
2. `cargo check` (in `src-tauri/`)
3. `cargo test` — existing suites; new tool logic keeps `Error:`-string convention
4. `npm run build`
5. Manual smoke: three tools matrix — read (ask a question); memory (recall after save);
   write (create a note with `aiEnableFileWrite` on, verify approval row for delete/rename/
   overwrite, verify refusal when off); export (`.md` + `.pdf` land in
   `_attachments/exports/`).
6. Release: bump `tauri.conf.json` `version` + About + `CHANGELOG.md` together; deferred
   release-exe smoke remains outstanding.

## 13. Progress log

- **2026-09-05 — T0 + T1-read/T1-write done.** Tool loop end-to-end; 8 read/memory tools;
  5 file-write tools behind `aiEnableFileWrite` with interactive approval. See
  AGENT_MEMORY_RAG_PLAN.md progress entries M1–M6.
- **2026-09-11 — T1-export done (M7).** `export_markdown`/`export_pdf` added to
  `FILE_WRITE_TOOLS`; `export_markdown_to_pdf` command + `pdf_export.rs` (printpdf 0.7);
  `exportArtifact` shared sink; Artifacts `.md`/`.pdf` buttons. `cargo test` 27/27, `tsc`
  green, `npm run build` green.
- **Next:** T2.1 (AgentPanel approval fix) is the highest-value gap (see §9).