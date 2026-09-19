# AGENTS.md

Cross-tool structural guide for AI coding agents (opencode, Claude Code, Cursor, Copilot, etc.) working in the Local Study Notebook repository. Read this before editing anything.

## What this project is

An Obsidian-style, local-first **study notebook** desktop app built with **Tauri v2 + React 19 + TypeScript + Vite + SQLite**. Users browse local folders as "vaults", read sources, take Markdown notes in a split/continuous CodeMirror editor, manage projects with templates, and customize appearance with persistent dark themes. Everything is local — there is no server.

On top of the notebook core, the app embeds several AI/agent subsystems (see "AI & agent layers" below), so the surface area is larger than a plain notes app:

- **Study Assistant** chat (OpenCode engine by default, BYOK OpenAI-compatible engine as fallback),
- **Micro Agent panel** (one-shot summarize/improve/custom tasks),
- **Memory-RAG** (chunked note embeddings + durable memory, hybrid retrieval),
- **MCP connector host** (stdio + streamable-http research connectors),
- **OpenCode Agent sidecar** (`opencode serve`) scoped to the vault,
- **Google Drive backup**, **git Work-Tree panel**, and **Markdown → PDF export**.

## Tech stack / key files

- **Frontend** (`src/`): React 19 + Zustand 5 + Tailwind CSS 4 (`@tailwindcss/vite`) + `react-markdown` + `remark-gfm` + CodeMirror 6 (editor, live preview).
- **Desktop shell** (`src-tauri/`): Tauri v2 (Rust). Plugins: `dialog`, `fs`, `shell`, `updater`, `process`.
- **Build tooling**: Vite 6 + TypeScript 5.8 (strict). Tests: Vitest (jsdom) on the frontend, `cargo test` on Rust.
- **State**: single Zustand store, `src/stores/useStore.ts` (~2050 lines; holds the `Settings` interface too).

### Frontend structure

- `src/main.tsx` — React entry point.
- `src/App.tsx` — root component; explorer refresh on mount, Google account restore, reduce-motion class toggle, window-close save flush.
- `src/components/` — UI components (see component map below).
- `src/stores/useStore.ts` — the single Zustand store: **all** app state and actions, `Settings`/`DEFAULT_SETTINGS`, persisted-localStorage keys, and helper `buildOpencodeMcpExport()`.
- `src/services/` — AI/agent logic (see "AI & agent layers"):
  - `aiProvider.ts` — BYOK chat streaming, tool loop, model discovery, embeddings HTTP, connection testing.
  - `opencodeClient.ts` — OpenCode HTTP/SSE transport (`streamOpencodeReply`, `reindexOpencodeVault`).
  - `agentKnowledge.ts` — Memory-RAG wrapper: context bundles, memory persistence, prompt composition (`buildPromptWithContext`), artifact export, micro-agent executor.
  - `workspaceTools.ts` — tool definitions (`WORKSPACE_TOOLS`, `FILE_WRITE_TOOLS`) + `executeWorkspaceTool` dispatcher with the approval gate and `resolveVaultPath` sandbox.
  - `providerPresets.ts` — BYOK provider presets (Ollama/OpenRouter/OpenAI/Anthropic/Gemini).
  - `*.test.ts` — Vitest unit/integration tests.
- `src/themes.ts` — dark theme definitions + `applyThemeToDocument()` (live CSS-var application).
- `src/types/index.ts` — shared TS types (`Source`, `Note`, `OpenTab`, `GitStatusEntry`, `Project`, `McpConnector`, ...).
- `src/utils/` — `remarkHighlight.ts` (markdown highlighting), `projectTemplates.ts` (vault scaffolding templates).
- `src/index.css` — Tailwind v4 entry + base theme CSS variables.
- `src/components/markdownLivePreview.ts`, `markdownListContinuation.ts` — CodeMirror live-preview and list-continuation extensions.

### Component map (`src/components/`)

| Component | Role |
|---|---|
| `Layout.tsx` | Top-level flex layout: `Navbar` + side panels + `StudyBoard` + resizers + modals. |
| `Navbar.tsx` | Far-left icon rail (sources toggle, projects, new note, settings). |
| `SourcesPanel.tsx` | File/folder explorer (tree, filter, context menu, New File/Folder). |
| `StudyBoard.tsx` | Split Markdown editor/preview pane with tab strips (+`X more` overflow menu). |
| `TopBar.tsx` | Per-panel action bar + sessions + account. |
| `MarkdownEditor.tsx` | CodeMirror 6 editor wrapper. |
| `AssistantPanel.tsx` | Fused chat panel: OpenCode agent + BYOK Study Assistant, thread management. |
| `AgentPanel.tsx` | Micro Agent panel (summarize/improve/assess/custom tasks). |
| `ArtifactsPanel.tsx` | AI-generated artifact viewer/manager. |
| `WorkTreePanel.tsx` | Git status + diff (opens `DiffView`). |
| `DiffView.tsx` | Git diff rendering (tabs with `#diff` / `#diff-staged` suffixes). |
| `BacklinksPanel.tsx` | Backlink list for the active note. |
| `SettingsModal.tsx` | Tabbed settings (editor, AI & BYOK, OpenCode Agent, Connectors, Drive backup, About). |
| `ProjectsModal.tsx` | Project switcher (frontend/localStorage concept over vault folders). |
| `WorkspaceLauncherModal.tsx` | New-project/workspace launcher with template scaffolding. |
| `PanelLayoutModal.tsx` | Panel preset + custom layout management. |
| `WelcomeOnboarding.tsx` | First-run onboarding flow. |
| `EditorContextMenu.tsx` | Right-click formatting menu. |
| `MoveConfirmModal.tsx` | Confirmation when moving files. |
| `EdgeResizer.tsx`, `PanelDragHandle.tsx`, `Resizer.tsx` | Panel resizing/drag handles. |

### Rust backend (`src-tauri/src/`)

| Module | Role |
|---|---|
| `lib.rs` | Tauri setup, DB init, managed states (`DbState`, `DriveState`, `McpState`, `McpBridgeState`), `invoke_handler` registration (35+ commands). |
| `main.rs` | Entry point (calls `lib::run()`). |
| `commands.rs` | Notes/source/link commands, local file CRUD, vault search, Memory-RAG commands, local version history snapshots, OpenCode process spawn/kill, AI debug log, enhanced file ops (`replace_in_local_file`, `read_local_file_lines`, `get_local_file_info`), PDF export. |
| `db.rs` | `DbState`; `vault_index.db` schema (files, links, `note_chunks` + FTS5 + triggers, `memory_entries`, `context_log`). |
| `chunks.rs` | Markdown → chunk splitting. |
| `embeddings.rs` | f32 pack/unpack, cosine similarity, top-k scoring. |
| `git.rs` | Git status + file diff via libgit2 (`git2`, no network features). |
| `drive.rs` | Google Drive backup: OAuth 2.0 PKCE + Drive API (`reqwest`, `keyring` for token storage in OS Credential Manager). |
| `mcp.rs` | MCP connector host: stdio + streamable-http clients, `tools/list`/`tools/call`, health, teardown. |
| `mcp_bridge.rs` | MCP-over-HTTP bridge server (localhost, per-session bearer token) that exposes workspace tools to the OpenCode sidecar. |
| `pdf_export.rs` | Markdown → A4 PDF rendering (`printpdf`). |
| `capabilities/default.json` | Tauri v2 capability/permission grants for the main window. |
| `tauri.conf.json` | App version (`1.5.0`), bundle targets (nsis), updater endpoints, fs plugin config. |
| `Cargo.toml` | Rust deps: `rusqlite` (bundled), `git2` (vendored-libgit2, no network), `printpdf`, `reqwest` (rustls), `keyring` (windows-native), `tiny_http`, OAuth helpers. |

### Repo root miscellany

- `Documentation/` — planning docs, SOPs, and reports (index below). Many are stale relative to the code; treat them as history unless they match the current code.
- `MCP_CONNECTORS_PLAN.md`, `study_notes.session.sql` — root-level planning/schema scratch.
- `.github/workflows/release.yml` — tag-triggered (`v*`) signed Windows NSIS release build via `tauri-action@v1`.
- `.obsidian/` — an Obsidian vault used as the developer's own study notebook; NOT app data, do not treat as canonical.
- `.claude/launch.json`, `.vscode/`, `.git/`, `dist/`, `node_modules/`, `src-tauri/target/` — tool/config/artifact dirs.

## Architecture / data flow

### Persistence (two layers)

1. **SQLite `vault_index.db`** in `%APPDATA%\com.localstudynotebook.app` — managed by `DbState` in Rust. Tables: `files`, `links`, `note_chunks` (with FTS5 shadow table synced via triggers), `memory_entries`, `context_log`. Written only through `#[tauri::command]`s.
2. **localStorage** in the webview — settings (`lsn_settings`), pinned paths (`lsn_pinned`), last folder (`lsn_last_folder`), projects (`lsn_projects`), sessions (`lsn_sessions`), assistant threads (`lsn_assistant_threads`), active thread (`lsn_active_thread_id`), panel order (`lsn_panel_order`), custom layouts (`lsn_custom_layouts`), onboarding flag (`lsn_onboarding_complete`).

### Vault / note model

- The explorer reads/writes **real local files** through Rust commands (`read_local_dir`, `read_local_file`, `write_local_file`, `create_local_file`, `create_local_dir`, `rename_local_entry`, `delete_local_entry`).
- The Study Board editor auto-saves on debounce. The note title derives from the first heading (`# Title`).
- Editing a **source** creates an editable copy as a note (`copy_source_to_note` flow) — the original source is never modified.
- **Projects** are a frontend/localStorage concept mapping a named `Project` (id, name, path, pinned?, lastOpened) onto the vault-folder model; opening one calls the existing `openFolder` flow.

### AI & agent layers

Every AI surface funnels through a few chokepoints. Important invariants:

- **All AI HTTP callers live in the frontend services** (`aiProvider.ts`, `opencodeClient.ts`); Rust only *stores, scores, and retrieves* (embeddings, memory, chunks).
- **Tool calling**: `streamAIResponse` (BYOK, `aiProvider.ts`) and `streamOpencodeReply` (OpenCode, `opencodeClient.ts`) both loop tool calls → `executeWorkspaceTool` / the OpenCode sidecar.
- **Workspace tool router** (`workspaceTools.ts`): declares every tool schema (`WORKSPACE_TOOLS` + gated `FILE_WRITE_TOOLS`), resolves vault-relative paths through `resolveVaultPath` (refuses anything escaping the vault root), and funnels destructive writes through a **user approval gate** (`pendingToolApprovals`). File-write tools are only exposed when `settings.aiEnableFileWrite` is on.
- **MCP connectors**: enabled connectors' tools are merged into the BYOK tool list namespaced `<connectorName>/<toolName>`; the router strips the prefix and dispatches via `call_connector_tool`. Offline http connectors are excluded.
- **Engine routing**: `settings.assistantEngine` is `"opencode"` (default) with `opencodeFallbackToByok` auto-fallback. `sendAssistantMessage` (useStore.ts) tries OpenCode, falls back to BYOK, then memory-saves the turn.
- **OpenCode sidecar**: spawned by `spawn_opencode_server` (commands.rs) with a random in-memory password (`OPENCODE_SERVER_PASSWORD`), scoped to the vault, `opencode serve` on the configured port (default 4096). If that port is already taken by a stale/foreign `opencode serve`, Rust picks the next free port (`find_free_port`) and returns `{pid, port}` — the store tracks the actual bound port (`opencodeServerPort`) for readiness probing and streaming. Each `/session/:id/message` sends `model: { providerID, modelID }` derived from the user's BYOK settings (`resolveOpencodeModel` in opencodeClient.ts) so the sidecar uses the tool-capable model the user configured instead of OpenCode's own default (which can route to an OpenRouter endpoint with no tool support). A managed `opencode.json` is exported into the vault root (marked `_lsnManaged`, `bash: deny` permission) so the agent sees the app's MCP bridge and connectors; it is deleted on shutdown and skipped if the user has their own `opencode.json`.
- **Memory-RAG**: `reindex_vault` fills `note_chunks`; a lazy frontend pass (`rebuildEmbeddings`) batches un-embedded chunks to Ollama (`/api/embeddings`); retrieval is hybrid (FTS5 keyword + cosine over packed f32 blobs) via `search_rag` / `recall_memory` / `get_context_bundle`.
- **After writes**: write tools trigger `reindex_vault`, then a debounced embedding rebuild. Git panel refreshes on a separate debounce.

## Commands (build / run / test)

Run from the project root. **Shell is Windows PowerShell 5.1** — `grep`/`&&` are unavailable; use `Select-String` / backtick escapes / `;` + `$?`.

```powershell
npm run dev                     # Frontend dev server only (HMR, no Tauri window)
npm run tauri dev               # Full desktop dev app (spawns a Tauri window)
npm run build                   # tsc && vite build into dist/
npx tsc --noEmit                # Frontend type-check only (keep green)
npm test                        # Vitest run (src/**/*.test.ts, jsdom env)
cargo check                     # Inside src-tauri/ — Rust check
cargo test                      # Inside src-tauri/ — Rust unit tests (db, chunks, embeddings, drive, pdf_export, commands)
npm run tauri build             # Build installers (NSIS only) — slow
```

Vitest config lives in `vitest.config.ts` (jsdom, `include: ["src/**/*.test.ts"]`). Mock the Tauri IPC boundary (`@tauri-apps/api/core`) and the Zustand store in tests; the integration test in `workspaceTools.integration.test.ts` is the model for end-to-end dispatch tests.

## Requirements & conventions

- **Frontend build** must pass (`npm run build`) and `npx tsc --noEmit` must be green before committing.
- **Rust backend** must pass `cargo check` (and `cargo test` when touching core logic).
- **No comments in code unless requested.** Follow existing patterns: PascalCase React components, Zustand actions on the single store, `#[tauri::command] pub fn ... -> Result<T, String>`, snake_case invoke arguments, selector-based store reads (`useStore((s) => s.x)`).
- Never log or persist secrets (API keys, MCP tokens, Drive OAuth refresh tokens). Tokens live only in OS Credential Manager (`keyring`) or in-memory Rust state.
- Existing code contains many rich explanatory comments (security decisions, wire-shape facts, gotchas). Preserve them; they encode hard-won knowledge.

## How to extend

- **Add a Rust command**: implement `pub fn ... -> Result<T, String>` in `commands.rs` (or the owning module), register it in the `tauri::generate_handler![...]` list in `lib.rs` (and add managed state in `.setup()` if needed), then call it from the store/service via `invoke<T>("command_name", { args })`.
- **Add frontend state**: extend the `AppState` interface + initial state + an action in `useStore.ts`; persist via `localStorage.setItem(...)` where appropriate.
- **Add a workspace tool**: add a `ToolDefinition` to `WORKSPACE_TOOLS` (read-only) or `FILE_WRITE_TOOLS` (mutating, gated), implement dispatch in `executeWorkspaceTool`, and keep docs in `Documentation/AGENT_TOOLS_PLAN.md` in sync.
- **Add a UI component**: mirror an existing component's selector + action pattern; wire buttons through store actions, not direct state mutation.
- **Add a Tauri plugin/new permission**: update `src-tauri/capabilities/default.json` and rebuild. History: `requireLiteralLeadingDot` and fs-plugin scope have caused subtle permission bugs before — verify dialog/fs scopes when debugging related issues.

## Gotchas / rebuild traps

- **Running instance locks Rust build outputs** (`os error 32`). Terminate `local-study-notebook.exe` (`Stop-Process -Id <pid> -Force`) before `tauri build`.
- **Stale Vite/esbuild transform** can produce a phantom `Expected ')' but found end of file`; delete `dist/` and rebuild if it recurs.
- **Version sync**: keep `src-tauri/tauri.conf.json` `version`, the About section in `SettingsModal.tsx`, and `CHANGELOG.md` in sync. (Currently: config says `1.5.0`, About shows `1.4.0` — flag and fix drift on next bump.) The npm `package.json` version `1.0.0` is not the release version.
- **Path-separator bugs**: vault roots arrive with OS-native separators (backslashes on Windows). `resolveVaultPath` and Rust `validate_vault_path` normalize to forward slashes; regression tests in `workspaceTools.test.ts` / `workspaceTools.integration.test.ts` guard this. When changing path logic on either side, run those tests.
- **Updater/release chain**: `tauri.conf.json` points `updater.endpoints` at the GitHub release `latest.json`; `.github/workflows/release.yml` (tag `v*`, `tauri-action@v1`, force `--bundles nsis`, `TAURI_SIGNING_PRIVATE_KEY` secret) is what makes auto-update work. `bundle.createUpdaterArtifacts: true` is required for signed update manifests.
- **OpenCode facts to not "fix"**: Windows install is `winget install SST.opencode` (not `OpenCode.OpenCode`); SSE event is `message.part.updated`; Gemini BYOK base URL is `https://generativelanguage.googleapis.com/v1beta/openai`; OpenCode env var for Google is `GOOGLE_GENERATIVE_AI_API_KEY`. These are load-bearing, verified-at-runtime details — see `Documentation/AI_Provider_and_Agent_Wiring_SOP.md`.
- **First-run seeding**: MCP connector presets are only seeded when `connectors` is absent from stored settings; never clobber the user's registry. Connector names are namespaced with `/` in the tool list — do not collide builtin and connector tool names.
- **Paywall-style rate limits**: BYOK has built-in 429 retry + provider-specific error messages in `formatApiError`; preserve them when touching the request layer.

## Testing strategy

No CI test job exists — verification is manual + local:

1. `npx tsc --noEmit` and `npm run build` (frontend type-check + build).
2. `npm test` (Vitest: `aiProvider.test.ts`, `workspaceTools.test.ts`, `workspaceTools.integration.test.ts`).
3. `cargo test` and `cargo check` in `src-tauri`.
4. Manual smoke test: launch the release exe, verify it runs without panicking, initializes `vault_index.db`, and the AI/tool surfaces behave.

## Documentation index (`Documentation/`)

Historical plans/reports — cross-reference the code before trusting them:

- `AI_Provider_and_Agent_Wiring_SOP.md` — how providers/agents actually break; must-read before touching AI wiring.
- `OPENCODE_CONNECTION_FIX_SOP.md` — how the OpenCode ↔ app wiring was fixed (port collision, model ref, npm shim shadowing); diagnose by error text, not the banner.
- `AGENT_TOOLS_PLAN.md` — tool inventory, gating, approval UX, roadmap.
- `AGENT_MEMORY_RAG_PLAN.md` — chunking/embedding/memory schema and retrieval design.
- `MCP_CONNECTORS_PLAN.md` (repo root) — MCP connector design.
- `OpenCodeIntegration_implementation_plan`, `GeminiBYOK_implementation_plan` — feature plans with verified corrections.
- `GOOGLE_DRIVE_BACKUP_PLAN.md` / `GOOGLE_DRIVE_BACKUP_PROGRESS.md` — Drive backup (BACKUP-0).
- `DATA_ARCHITECTURE_PLAN.md`, `IMPLEMENTATION_PLAN.md`, `UI_IMPLEMENTATION_PLAN.md`, `EDITOR_FORMATTING_MENU_PLAN.md`, `MARKDOWN_TYPOGRAPHY_PLAN.md`, `Project_Tasks_00*.md`, `solution_report.md`, `diagnostic_report.md`, `openrouter_hardening_report.md`, `All_Written_Files.md`, `Future features for the project.md`.