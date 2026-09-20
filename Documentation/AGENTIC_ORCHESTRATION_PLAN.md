# Forging the ADE: Agentic Orchestration Layer for Local Study Notebook

A forward plan for welding the **missing orchestration piece** between the app's existing
AI surfaces (Study Assistant, Micro Agent, OpenCode sidecar, MCP host, Memory-RAG) so they
cohere into a real *agentic system* instead of five disconnected subsystems.

**DNA source:** OpenChamber (the agentic development environment running alongside this
repo). OpenChamber is the orchestration/review layer around the OpenCode agent server —
goals, auditing, scheduling, multi-run/fusion, walkthroughs, worktrees, meta tooling.
This plan translates that DNA into a **study notebook** context: the goal ring that runs
our agents, the scheduling clock, the session memory, and the review surfaces.

---

## 1. Situation & the missing piece

### 1.1 What already exists (do not rebuild)

| Layer | Where | State |
|---|---|---|
| OpenCode sidecar (`opencode serve`, per-vault) | `opencodeClient.ts` + `spawn_opencode_server` | working; SSE tool parts, idle detection |
| BYOK streaming + n-round tool loop | `aiProvider.ts` (`streamAIResponse`) | working; 429 retries, tool pigments, tool-incompat detection |
| Workspace tool router + approval gate | `workspaceTools.ts` (`executeWorkspaceTool`) | working; `resolveVaultPath` sandbox |
| MCP connector host + bridge | `mcp.rs`, `mcp_bridge.rs` | working; stdio + streamable-http |
| Memory-RAG (chunks, embeddings, memory) | `agentKnowledge.ts` + `chunks.rs`/`db.rs` | working; hybrid FTS5+cosine |
| Micro Agent panel | `AgentPanel.tsx` + `runAgentTask` | **buggy**: no `onToolCall` → writes hang |

The graph of capabilities is wide but **flat**. Each surface is independent: the Assistant
doesn't remember across restart unless a thread exists in localStorage, no background loop
exists that keeps auditing progress toward a goal, nothing runs on a schedule, there is no
way to fan out one question into parallel explorations and fuse the results, and nothing
reviews a diff on behalf of the learner.

### 1.2 What OpenChamber contributes (the gap)

| ADE capability (OpenChamber) | Study Notebook analog | Gap today |
|---|---|---|
| Server-persistent, resumable sessions | Study-agent sessions that survive restart and are pick-up-able | threads are `lsn_assistant_threads` localStorage only |
| Goal mode + independent auditor | Autonomous *study goal*: e.g. "Research X and produce a note" — with a cheap auditor judging done/stuck/keep-going | no loop, no auditor, no budget/strike caps |
| Scheduled tasks (cron/daily/weekly, run-as-goal) | Recurring reviews (spaced repetition), daily/weekly synthesis | none |
| Worktrees → parallel isolation | **Perspectives**: one question run through N models/prompts in isolated draft notes | none |
| Multi-run + Fusion | Fusion: assemble N drafts into a synthesis note | none |
| Changes Walkthrough | AI-guided tour of a note's / the vault's recent change set (diff stops) | WorkTreePanel renders diffs, no narration |
| Agent Control Tool | Meta tools in `WORKSPACE_TOOLS`: create/fork sessions, set goal, schedule tasks from chat | none |
| Small-model service | Dedicated cheap model for auditor, walkthrough, memory-dedup scoring | only main model surfaces |
| Extensions/guest panels | Lighter: config-driven *study tool* registry (flashcard/citation/etc.) | none |

### 1.3 The piece to forge

One **Agent Orchestration Layer (AOL)** — persistent state (SQLite) + a run-loop service
(frontend) + Rust clock commands (scheduled tasks) + a small set of new workspace tools —
that all four AI surfaces funnel through. Five pillars:

1. **Session memory** — agent sessions survive restart, are resumable, forkable, organizable.
2. **Goal mode** — a state machine that runs a study goal to completion with an auditor,
   token budget, and 3-strike blocked semantics.
3. **Scheduling** — recurring/one-shot study tasks that fire while the app is open.
4. **Perspectives + Fusion** — parallel exploration then synthesis-by-fusion.
5. **Review** — AI walkthrough of diffs and generated output.

Pillar 0 is **harden the base** (fix the Micro Agent approval hang and friends) — you
cannot safely forge on a cracked foundation.

---

## 2. Architectural invariants (respect the existing contract)

These are load-bearing and stay true:

- **All AI HTTP callers live in the frontend services.** Rust stores, scores, retrieves,
  and now *persists + tells the clock what is due*. The auditor is a frontend service too.
- **One dispatcher** for user-space tools (`executeWorkspaceTool`). Meta/control tools
  are new branches there.
- **SQLite `vault_index.db`** is the durable store for all new schema (sessions, runs,
  scheduled tasks, run logs). localStorage keeps doing what it does (per-widget UI state)
  but stops being the *only* memory for AI state.
- **Never log or persist secrets.** `scheduled_tasks` stores model + prompt, never keys.
- **Scheduler contract = "fires while the app is open".** OpenChamber's tasks only fire
  while its server runs; ours fire while the webview lives. Forward option: a background
  Tauri window (see §9) — out of initial scope.

---

## 3. Data model (new tables in `vault_index.db`, added in `db.rs`)

```sql
-- 1. Persistent agent sessions (pillar 1)
CREATE TABLE IF NOT EXISTS agent_sessions (
  id           TEXT PRIMARY KEY,           -- our UUID, canonical (NOT the opencode session id)
  title        TEXT,
  agent        TEXT,                       -- 'assistant' | 'micro' | 'opencode'
  engine       TEXT,                       -- 'opencode' | 'byok'
  model        TEXT,                       -- 'provider/model' when known
  status       TEXT NOT NULL DEFAULT 'idle', -- idle | working | waiting | finished | failed | blocked
  goal         TEXT,                       -- armed goal (pillar 2), NULL when none
  parent_id    TEXT REFERENCES agent_sessions(id), -- fork lineage
  project_path TEXT,                       -- vault root at fork time (display only)
  context      TEXT,                       -- JSON: active note, tabs, thread id mapping
  summary      TEXT,                       -- rolling summary for resume
  tokens       INTEGER DEFAULT 0,
  cost         REAL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- 2. Goal-mode runs (pillar 2): one row per active/archive run per session
CREATE TABLE IF NOT EXISTS agent_runs (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES agent_sessions(id),
  goal          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running', -- running | done | blocked | failed | stopped
  iterations    INTEGER DEFAULT 0,
  stuck_strikes INTEGER DEFAULT 0,
  token_budget  INTEGER DEFAULT 80000,
  auditor_model TEXT,
  result_summary TEXT,
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER
);

-- 3. Scheduled/recurring study tasks (pillar 3)
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,              -- 'once' | 'daily' | 'weekly' | 'cron'
  cron        TEXT,                       -- for 'cron'
  weekday     TEXT,                       -- for 'weekly'  (csv of 0-6)
  time        TEXT NOT NULL,              -- 'HH:mm'
  next_run    INTEGER,                    -- epoch ms
  enabled     INTEGER DEFAULT 0,          -- off by default (matches OpenChamber loops)
  run_as_goal INTEGER DEFAULT 0,
  prompt      TEXT NOT NULL,
  model       TEXT,                       -- 'provider/model' override
  created_at  INTEGER NOT NULL
);

-- 4. Execution log (pillar 3 + observability)
CREATE TABLE IF NOT EXISTS task_run_log (
  id             TEXT PRIMARY KEY,
  task_id        TEXT REFERENCES scheduled_tasks(id),
  session_id     TEXT,                    -- the agent session that executed it
  status         TEXT,
  result_summary TEXT,
  started_at     INTEGER NOT NULL,
  finished_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_session ON agent_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_task_next_run ON scheduled_tasks(next_run);
```

Schema versioning: add a `PRAGMA user_version` migration ladder in `db.rs` (see §9 risk).

---

## 4. Rust surface (new `#[tauri::command]`s)

All thin, stateless-per-call, registered in `lib.rs` `generate_handler!`. No AI HTTP here —
pure persist/query/clock.

| Command | Signature | Purpose |
|---|---|---|
| `create_agent_session` | `(title?, agent?, engine?, model?, parent_id?) → Session` | pillar 1 |
| `list_agent_sessions` | `()` → `Session[]` | resume/kill UI |
| `get_agent_session` | `(id)` → `Session` | refresh |
| `patch_agent_session` | `(id, fields)` → `Session` | title/goal/summary/status · tokens · cost |
| `archive_agent_session` | `(id)` | soft archive for UI |
| `start_agent_run` | `(session_id, goal, token_budget?)` → `Run` | pillar 2 arm |
| `record_run_turn` | `(run_id, iterations, stuck_strikes, status)` | loop heartbeat |
| `create_scheduled_task` | `(task)` → `Task` | pillar 3 |
| `list_scheduled_tasks` | `()` → `Task[]` | task settings UI |
| `patch_scheduled_task` | `(id, fields)` | enable/disable/reschedule |
| `delete_scheduled_task` | `(id)` | |
| `check_due_tasks` | `()` → `Task[]` | clock tick; frontend polls and dispatches |
| `log_task_run` | `(task_id, session_id, status, summary)` | audit trail |

New managed state: none needed beyond `DbState`. Each command gets a unit test in the
`commands`/`db` test modules (existing pattern).

---

## 5. Frontend service layer

### 5.1 `src/services/agentOrchestrator.ts` (new)
The run-loop **state machine** — the heart of the piece.

```
            arm goal (start_agent_run)
                    │
        ┌───────────▼────────────┐
   ┌────┤   agent_runs.running  │◄──────────────┐
   │    └───────────┬────────────┘               │  not done & budget left
   │                ▼                            │
   │        execute turn                          │
   │        (BYOK streamAIResponse                │     opencode streamOpencodeReply
   │         OR sidecar streamOpencodeReply)      │
   │                │                             │
   │                ▼                             │
   │        collect turn output                   │
   │                ▼                             │
   │        AUDITOR verdicts                      │
   │        (small model; see 5.2)                │
   │       done? / keep-going? / stuck?           │
   │                │                             │
   │         keep-going ──────────────────────────┘
   │         stuck → strikes+1 → (3) → blocked
   │         done  → finished, write result_summary
   │         token budget hit → stopped
   │         user Stop → stopped
```

Loop driver: a capped async loop in the service; forces `onToolCall` through the SAME
approval gate path as the Assistant (fixes the micro-agent hang by construction). Every
write tool already triggers reindex — unchanged. Session/goal row updated via `record_run_turn`
each iteration.

Engines: both BYOK and OpenCode paths are reachable; the run stores `engine` so resume
uses the same transport.

### 5.2 `src/services/agentAuditor.ts` (new)
Lightweight judge. One `/chat/completions` call (no tools) returning a **JSON verdict**
`{ verdict: 'done'|'keep_going'|'stuck', reason }`. Uses `settings.smallModel` when set,
else the main model. Strict/minimal prompt, structured-output where the provider supports it.
Never stored raw — only the aggregated strikes/count.

### 5.3 Scheduling hook `useScheduler` (new, in `App.tsx`)
- On mount + every 60s: `invoke("check_due_tasks")`.
- For each due task → create/arm a session + run (goal mode when `run_as_goal`), `log_task_run`.
- Wait-for-idle policy: never overlap two runs on the same engine; queue beyond one is skipped
  and retried next tick.

### 5.4 Store slice (`useStore.ts`)
`AgentSession[]`, `activeAgentSessionId`, `agentRun` (live), `scheduledTasks[]`.
Actions mirror the Rust commands; UI state (panel open/closed, organizer folders) stays in
localStorage per existing convention.

---

## 6. Workspace tools (new branches in `executeWorkspaceTool`)

Meta/control tools — **no file writes**, always available (optionally gated behind
`aiEnableAgentControls`, new setting default `true`):

| Tool | Backs on | Notes |
|---|---|---|
| `create_session(title?, engine?)` | `startOpencodeSession` or store | returns session id |
| `list_sessions(scope?)` | `list_agent_sessions` | |
| `fork_session(session_id)` | store action | new child session (parent_id) |
| `set_goal(goal, session_id?)` | `start_agent_run` | arms goal mode |
| `stop_goal()` | store | hard stop wins |
| `create_scheduled_task(name, kind, time, prompt, run_as_goal?)` | `create_scheduled_task` | |
| `list_scheduled_tasks()` | `list_scheduled_tasks` | |

Send the resulting session id + task id back as tool result text so the model can report
them in chat. Keep the inventory table in `AGENT_TOOLS_PLAN.md` in sync when these land.

---

## 7. Phased implementation

### Phase 0 — Harden the base (0.5–1 sprint, no new schema)
1. **Micro Agent approval hang** (`AgentPanel.tsx` + `runAgentTask`): thread `onToolCall`
   through `runAgentTask` → `streamAIResponse`, render approval rows in `AgentPanel` so
   write tools stop polling forever. (Highest-priority existing bug — `T2.1` in
   `AGENT_TOOLS_PLAN.md` §9.)
2. **Persist artifacts** to `<vault>/.lsn_artifacts/`, load on boot (`artifacts` is
   in-memory only today; a restart wipes AI output the user asked to keep).
3. **Cache connector tools** — TTL on `list_connector_tools` so `buildEffectiveTools()`
   stops round-tripping Rust every turn.
4. **Version drift** — sync `tauri.conf.json` 1.5.0 ↔ About 1.4.0 ↔ CHANGELOG.
5. Landing `npm run build`/`tsc`/`npm test`/`cargo test` green at the end of the phase.

### Phase 1 — Persistent agent sessions (pillar 1)
- `db.rs`: `agent_sessions` table + `PRAGMA user_version` ladder + migrations.
- Rust commands (§4 rows 1–6) + unit tests.
- Store slice + a Sessions panel / resume affordance in `AssistantPanel`.
- Port the Study Assistant's `lsn_assistant_threads` into `agent_sessions` where sensible
  (keep the localStorage state reading both during a transition window).
- Forks: `fork_session` + `parent_id` lineage shown in the panel.

### Phase 2 — Goal mode (pillar 2)
- `agent_runs` table + `start_agent_run`/`record_run_turn`.
- `agentAuditor.ts` + `settings.smallModel`/`smallModelBaseUrl`.
- `agentOrchestrator.ts` loop wired to both engines.
- UI: arm-a-goal bar in `AssistantPanel`; live run indicator; Stop/pause/resume; budget show.
- Cap: 3 stuck strikes → blocked; token budget → stopped. **Stop button always wins.**

### Phase 3 — Scheduling (pillar 3)
- `scheduled_tasks` + `task_run_log` tables + commands.
- `useScheduler` hook in `App.tsx` (60s tick, fires while app is open — documented contract).
- Tasks settings UI (new modal or Settings tab): once/daily/weekly/cron, run-as-goal.
- Optional: loops-as-markdown (`<vault>/.agents/loops/*.md` frontmatter `schedule`,
  `enabled:false` default — mirrors OpenChamber portability), executed by the same hook.

### Phase 4 — Perspectives + Fusion (pillar 4)
- N isolated draft sessions (`fork_session` × N, one per model/engine) — parallel BYOK
  streams or N OpenCode sessions on the already-running sidecar.
- Compare view (drafts listed side-by-side, per-session token/cost from `agent_sessions`).
- **Fusion**: one more turn on a fresh session that reads all drafts (context bundle +
  raw drafts) and produces the synthesis note via `create_note` (already a gated write tool).

**Status (Milestone C — shipped):** `src/services/perspectives.ts` +
`assistant runPerspectives()` (useStore `runGoalOnSession`). Scope decision: **same model,
N framings run sequentially** — one goal loop at a time (the `goalRunning` wait-for-idle
invariant) instead of parallel BYOK/OpenCode streams, to avoid a concurrency refactor of
the orchestrator. Drafts are stored as artifacts (`addArtifact`) then forked once more into
a fusion session whose goal asks for a "balanced view" note; the expected output path is
`<attachments>/orchestration/<topic>-balanced-view.md`, verified by re-reading the file —
if the write did not land, the fusion text is stored as an artifact instead. The 5 framings
(technical / exam / debate / beginner / outlook) live in `PERSPECTIVE_FRAMINGS`.

### Phase 5 — Changes Walkthrough (pillar 5)
- Diff-hunk grouping service (`src/services/walkthroughDiff.ts`) on top of existing
  `git_diff` (`git.rs`); small-model narration; stops anchored to real lines.
- UI in `WorkTreePanel`/`DiffView`: "Walkthrough" button beside the diff tabs.
- Cache per diff+model+lang in localStorage keyed by diff hash.

**Status (Milestone C — shipped):** `walkthroughDiff.ts` (per-hunk narration via the small
model, localStorage cache `lsn_walkthrough_*` keyed by SHA-256 of the patch, capped at 50
entries), `DiffView.tsx` "Walkthrough" toggle + narration list. Hunk-model fix: narrate the
**individual unified diff hunks**, not the whole-file diff (whole-file diffs blow the small
model's context).

### Phase 6 — Agent Control Tool + study-tool registry
- Meta tools (§6) through the existing router + approval gate.
- Config-driven **study tool registry**: a JSON "plugin" manifest (id, name, tools,
  settings URL) that maps to MCP connector endpoints — reuse the MCP host rather than a
  novel extension API. (This is deliberately lighter than OpenChamber's sandboxed guest
  iframes; a study app does not need untrusted third-party panels.)

**Status (Milestone C — shipped):**
- **P6a meta tools:** `CONTROL_TOOLS` in `src/services/workspaceTools.ts` (7 schemas:
  `create_session`, `list_sessions`, `fork_session`, `set_goal`, `stop_goal`,
  `create_scheduled_task`, `list_scheduled_tasks`), guarded by `settings.aiEnableAgentControls`
  in `buildEffectiveTools` — they are never exposed when the control toggle is off.
  `set_goal` fires the store's `startGoalRun` (fire-and-forget, respects the single-loop
  invariant). Tests: `workspaceTools.control.test.ts`.
- **P6b study-tool registry:** `src/services/studyTools.ts` + Settings → **Study Tools**.
  Ships 4 disabled presets mirroring `CONNECTOR_PRESETS` (Wikipedia / Arxiv / Filesystem /
  Fetch) + custom tools (flashcards/citation templates). Persistence is localStorage
  (`lsn_study_tools`) — same seed-once, never-clobber rule as the connector presets. This is
  the "manifest" surface; tools map to their connector via the existing MCP host, no novel
  extension API. Tests: `studyTools.test.ts`.

---

## 8. Non-goals (scope discipline)

No, we are not building OpenChamber:

- **No cross-device / remote access / Private Relay** — the app is proudly local.
- **No persistent server model** — Rust persists; the webview drives; no always-on daemon.
- **No GitHub / Linear shipping** — the vault is not a code repo workflow (git panel stays read-oriented review).
- **No bundled browser panel** — the MCP `fetch` connector already covers web reading; note
  this data is scoped config, not a "browse the vault" surface.
- **No multi-user / server-scale persistence.**

---

## 9. Risks & gotchas

- **Scheduler fires only when the app is open.** Document as a deliberate contract (like
  OpenChamber's tasks-need-a-running-server). Forward fix if it matters: a hidden background
  Tauri window that stays alive on close-to-tray — do NOT fold in at launch.
- **Goal loops burn tokens.** Budget caps per run (default 80000), auditor on the small
  model, and the Stop button must preempt the loop. Log per-run cost in `agent_runs`.
- **SQLite migrations** are a new capability for `vault_index.db`. Start `PRAGMA user_version`
  today (even if 0) so Phase 1–5 rungs can land incrementally without rebuilds of users' dbs.
- **OpenCode session id ≠ our session id.** Keep `agent_sessions.id` as canonical; store the
  sidecar mapping in `context` JSON. Never assume a sidecar session survives forever —
  `fork_session` must re-call `ensureOpencodeReady`.
- **Two runs on one engine must not interleave.** The orchestrator serializes; `check_due_tasks`
  skips a task if an engine is busy rather than stacking.
- **Micro Agent fix must not regress the approval gate.** Route `runAgentTask` through the
  exact `executeWorkspaceTool` + `pendingToolApprovals` path, not a bespoke one.
- **Preserve the rich comments / wire-shape facts** in `aiProvider.ts`, `opencodeClient.ts`
  (`message.part.updated`, Gemini base URL, `GOOGLE_GENERATIVE_AI_API_KEY`, etc.) while
  adding the orchestrator — those are verified-at-runtime and cheap to break.
- **Keep `AGENT_TOOLS_PLAN.md`, `AGENT_MEMORY_RAG_PLAN.md`, and this file cross-linked.**
  This file owns orchestration; those still own tools and memory/RAG respectively.
- **Path sandbox.** Fusion writes synthesis notes through existing `create_note` /
  `resolveVaultPath`; do not add a second write path.

---

## 10. Suggested cut sequence

- **Milestone A (Phase 0 + 1):** crisply "the agent system remembers." Ship, verify, use.
- **Milestone B (Phase 2 + 3):** "the agent system runs itself." Goal mode + scheduler live.
- **Milestone C (Phase 4–6):** "the agent system thinks in parallel and reviews." Perspectives,
  fusion, walkthrough, meta tools, study-tool registry. **SHIPPED** — see the Status notes on
  Phases 4–6. Schema is now `user_version` 2 (`agent_runs.token_estimate` / `cost`, added by a
  guarded migration in `db.rs`); tests: 72 frontend (8 files) + 32 Rust.

Each milestone ends with: `npx tsc --noEmit`, `npm run build`, `npm test`, `cargo check`,
`cargo test`, and a manual smoke launch.