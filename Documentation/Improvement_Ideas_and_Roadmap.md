# Improvement Ideas — Local Study Notebook

A maintained inbox of concrete, wiring-able improvements for the app **as it exists today**
(vault-first, Tauri v2 + React 19 + CodeMirror 6 + Rust/SQLite, WITH the AI/agent layers:
Study Assistant, Micro Agent, OpenCode sidecar, Memory-RAG, MCP connectors, Drive backup).

Read this before proposing "new" features: anything already shipped lives in `CHANGELOG.md`,
already-planned work lives in `AGENT_TOOLS_PLAN.md` (T1–T3), `AGENT_MEMORY_RAG_PLAN.md`
(M1–M4 / T1.1–T2.4), `MCP_CONNECTORS_PLAN.md`, and `GOOGLE_DRIVE_BACKUP_PLAN.md`. Ideas here
are deliberately ordered by **value-to-effort** (small/cheap first) and grouped by surface.

---

## 1. Cheap, high-value ("wire it this week")

### 1.1 Explorer / Sources UX
- **Explorer refresh debounce is one-way** — Rust commands that the agent touches (file
  write, git) already trigger `reindex_vault`, but a *plain* `write_local_file` from the UI
  doesn't always bump the explorer if the watcher is off. Add a single `vault_changed` event
  from Rust that every mutation command emits, and let `SourcesPanel` subscribe to it. One
  event bus kills the whole class of "I edited a file and the tree didn't refresh" bugs.
- **Drag-and-drop files into a folder** (move by drag), not just right-click → Move. CodeMirror
  `drop` handler already exists for dropping text; extend to file tokens dropped from the
  explorer.
- **File watch / out-of-band edits**: if the vault is edited by another program, currently only
  an explicit refresh catches it. A cheap `fs::watcher` (notify crate) fallback in the Sources
  command layer would make the app feel like a real vault (Obsidian parity).

### 1.2 Editor / Study Board
- **`append_note` tool** (listed in `AGENT_TOOLS_PLAN.md` T1.2 as a gap). Highest-value agent
  gap: long assistant outputs currently risk clobbering via full-overwrite `edit_note`. Add
  `append_note(path, append)` behind approval-if-exists. Cheap, removes a real footgun.
- **`read_note(path)` read tool** (T1.1 in the same plan) so the model can read *arbitrary*
  files, not just the active note. Model currently must open a tab to read anything else.
- **Live preview "hide syntax until touched"** is done and shipped (`markdownLivePreview.ts`).
  Next cheap iteration: **backlink pill** rendering in the preview for `[[wiki-links]]` that
  are already indexed — click-through from preview without opening the source tab.
- **Word count in Study Board status bar** — the setting exists; a live per-note count in the
  top bar would surface it without opening Settings.

### 1.3 Assistant / Agents
- **Embed memoization per turn** (T2.3): the query text is re-embedded on every tool call
  (`embedTexts` in the loop). Cache the turn's query embedding once and reuse it → cuts tool
  latency on RAG/recall calls meaningfully.
- **T2.1 approval rows in AgentPanel** — the Micro Agent panel does not pass `onToolCall`, so a
  file-write call from the micro agent would **hang the agent turn forever**. This is the single
  most important correctness fix; it is already scoped in `AGENT_TOOLS_PLAN.md` §10/T2.1.
- **`list_artifacts` / `delete_artifact` tools** (T1.3): no way to inventory or clean the
  artifact store via agent. Cheap add.
- **`onToolCall` status streaming into the Assistant chat** (latency + visibility) — T2.3.

---

## 2. Medium value — feature work that fits the existing architecture

### 2.1 Project / workspace
- **Custom panel-layout saving is already built** (`PanelLayoutModal`, named layouts). Wire the
  remaining half of that idea: **per-project layouts** — store the saved layout id on the
  `Project` record so switching projects restores each project's own panel arrangement. Persist
  via the existing `lsn_custom_layouts` + `lsn_projects` localStorage.
- **Template vaults** already exist as `projectTemplates.ts` + launcher. Extend with
  **user-defined templates**: "Save current vault as template" → writes the vault's structure
  into the project templates listholon so future `New Project` can pick it.
- **Recent vaults / "Open vault" home screen**: the first-run onboarding exists; a lightweight
  "recently opened" row (from `lsn_last_folder` + `lsn_projects`) on the launcher would erase
  friction for a multi-vault user.

### 2.2 Memory-RAG (built M1)
- **`search_rag`: FTS5 pre-filter + cosine re-rank is the designed M2**, but currently only
  keyword `search_vault` is wired into most surfaces. Wire `recall_memory`/`search_rag` into the
  **Study Assistant** context bundle (instead of the small keyword-only fetch) so memory recall
  actually shows up in study-mode answers. Highest-value RAG item.
- **Memory hygiene UI**: `memory_entries` accumulates per reindex. Add a "Memory" settings tab
  showing entries by scope with delete/clear — otherwise the durable store grows silently with
  no management surface.
- **Embedding locality**: currently per-turn query re-embed against local Ollama. If the user
  runs no `nomic-embed-text`, retrieval silently degrades to BM25-only. Surface a small
  **"embedding engine: offline (BM25-only)"** badge in the Agent settings so the degraded path
  is discoverable rather than mysterious.

### 2.3 Connectors (MCP) & Drive
- **MCP connector health panel**: `mcp.rs` already does `tools/list`/health/teardown. Add a
  small UI table (per-connector: status, enabled, tool count) instead of relying on the Settings
  list — makes a broken connector visible at a glance.
- **Drive: show sync state per note** in the file status area. Backup progress exists
  (`GOOGLE_DRIVE_BACKUP_PLAN`); per-file "synced/dirty" dots in the top-bar metadata would let
  users trust the backup without opening the Drive settings.
- **`export_artifact` to Drive sink** — listed as T3 stretch in the tools plan, but the Drive
  sink (`drive.rs`) already exists; pointing `exportArtifact`'s sink resolver at it is
  mostly wiring.

---

## 3. Larger / roadmap-worthy

- **`append_note` + file-write gate parity**: make sure the approval gate covers every write
  surface so the micro agent can't write silently if `aiEnableFileWrite` is off (§10 gap).
- **Per-vault settings**: some settings (theme is global; file-write gating, RAG on/off) are
  arguably vault-scoped. Add optional per-vault overrides scoped to the vault root, falling
  back to global — low risk since `resolveVaultPath` already keys everything to the vault root.
- **Local full-text search across *all* file types**, not just `.md`/`.txt` (chunks only ingest
  markdown today — documented in `AGENT_MEMORY_RAG_PLAN.md` out-of-scope). Start with PDF text
  extraction via an optional local tool; keep git/Drive sinks in mind.
- **Offline-first AI** already leans on Ollama; a next step is **bundled model management**
  (pull `nomic-embed-text` if missing, detect model presence) so embedding/RAG "just works"
  after install without a separate Ollama prompt.
- **`solution_report.md`-style hardening passes baked into CI**: the suite has no CI test job
  (documented). A low-effort GitHub Action that runs `tsc`, `npm test`, `cargo test` on PRs
  would catch the recurring class of regressions (path-separator, provider-wiring) before
  release instead of after.

---

## 4. Naming / priority keys (one-line each)

| # | Idea | Surface | Effort | Value |
|---|---|---|---|---|
| 1.1 | single `vault_changed` event → explorer auto-refresh | Explorer | S | High |
| 1.3 | AgentPanel `onToolCall` + approval rows (T2.1) | Micro Agent | M | **Critical** (prevents hang) |
| 1.3 | per-turn embed memoization (T2.3) | Assistant | S | Medium |
| 1.2 | `append_note` tool (T1.2) | Agent tools | S | High (anti-clobber) |
| 1.2 | `read_note` tool (T1.1) | Agent tools | S | Medium |
| 2.1 | per-project layouts | Panel mgmt | M | Medium |
| 2.1 | save-vault-as-template | Projects | M | Medium |
| 2.2 | wire `search_rag`/`recall_memory` into Study Assistant context | RAG | M | High |
| 2.2 | Memory hygiene tab (list/delete entries) | Settings | M | Medium |
| 2.3 | MCP connector health table | Settings/Connectors | S/M | Medium |
| 2.3 | per-note Drive sync dots | Top bar | M | Medium |
| 3 | CI gate on PRs (tsc/tests) | DevOps | S | High |
| 3 | per-vault settings override | Settings | M | Medium |
| 3 | PDF/DOCX text ingestion into RAG | RAG | L | Low/medium |

---

*Seed source: `Documentation/Future features for the project.md` (workflows, agent-oriented
editing), `Documentation/Project_Tasks_003.md` (tab/panel/launcher/explorer work), plus
roadmap gaps in `AGENT_TOOLS_PLAN.md`, `AGENT_MEMORY_RAG_PLAN.md`, `CHANGELOG.md`. Keep this
file in sync with the plans; do not treat it as canonical — the plan docs are.*
