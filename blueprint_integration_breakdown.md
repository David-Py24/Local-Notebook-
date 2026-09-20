# Blueprint Integration Breakdown: OpenChamber vs. Paseo

This document outlines the architectural weighting, percentage distribution, and specific module integration plan for building upon **OpenChamber** (`openchamber/openchamber`) and **Paseo** (`getpaseo/paseo`) blueprints within **Local Study Notebook**.

---

## 1. Percentage Split & Architectural Weighting

### **Final Ratio: 60% OpenChamber / 40% Paseo**

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      LOCAL STUDY NOTEBOOK CORE                         │
 │      (Tauri v2 + Rust + SQLite RAG + CodeMirror Markdown Editor)      │
 └────────────────────────────────────────────────────────────────────────┘
                    ▲                                  ▲
                    │ (60% Weighting)                  │ (40% Weighting)
 ┌──────────────────┴───────────────┐  ┌───────────────┴──────────────────┐
 │      OPENCHAMBER BLUEPRINT       │  │        PASEO BLUEPRINT           │
 │  • OpenCode SSE & Session Sync   │  │  • Multi-Agent Daemon & PTY      │
 │  • Visual Diff & Tool Modals     │  │  • Process Locking & Queues     │
 │  • Multi-Model Compare UI        │  │  • Non-OpenCode CLI Adapters     │
 └──────────────────────────────────┘  └──────────────────────────────────┘
```

### **Why 60% OpenChamber / 40% Paseo?**

1. **60% OpenChamber (Front-End & Session Supervision Layer)**:
   - Our app relies heavily on the `opencode serve` sidecar API. OpenChamber is purpose-built for OpenCode, making its session tree state, goal tracking, tool approval cards, and streaming SSE listeners an immediate 1:1 match for our React 19 UI stack.
2. **40% Paseo (Back-End & Process Orchestration Layer)**:
   - Paseo excels at wrapping raw CLI processes (Claude Code, Copilot, custom shell agents) and handling local terminal multiplexing (PTY). This blueprint provides the underlying daemon patterns when our notebook needs to orchestrate multi-agent background tasks or terminal sessions.

---

## 2. Integrated Components from OpenChamber (60%)

| Feature Area | OpenChamber Path / Component | Integration Target in Local Study Notebook |
| :--- | :--- | :--- |
| **Session Tree & SSE Sync** | `packages/ui/src/sync/`<br>`packages/ui/src/stores/useGlobalSessionsStore.ts` | Refine `src/services/opencodeClient.ts` & `useStore.ts` to support session tree branching, auto-reconnection, and session checkpointing. |
| **Tool Approval & Execution Cards** | `packages/ui/src/components/chat/` | Enhance tool invocation banners in `AssistantPanel.tsx` with inline permission gates, command previews, and visual diff triggers. |
| **Session Goals & Progress** | `packages/ui/src/components/session/` | Add session goal checklists and autonomous completion tracking inside `AssistantPanel.tsx`. |
| **Multi-Model Run & Comparison** | `packages/ui/src/components/model-compare/` | Enable side-by-side prompt execution across multiple OpenRouter/BYOK models within the Assistant panel. |
| **Workspace Path Resolver** | `packages/web/server/lib/fs/routes.js` | Cross-validate path traversal rules against our existing `workspaceTools.ts` `resolveVaultPath`. |

---

## 3. Integrated Components from Paseo (40%)

| Feature Area | Paseo Path / Component | Integration Target in Local Study Notebook |
| :--- | :--- | :--- |
| **PTY & Terminal Multiplexer** | `packages/server/src/terminal/` | Introduce an embedded interactive terminal panel in `src/components/` for interactive CLI agents. |
| **Process Locking & Daemon Control** | `packages/server/src/server/pid-lock.ts`<br>`bootstrap.ts` | Extend `src-tauri/src/commands.rs` to manage background sidecars with robust PID locking and clean signal teardowns. |
| **Multi-Agent CLI Adapters** | `packages/server/src/server/agent/` | Implement adapter interfaces to allow non-OpenCode CLI tools (e.g. Claude Code CLI, custom Python/Bash agents) to run in the background. |
| **Git Worktree Agent Queues** | `packages/cli/src/commands/worktree/` | Connect git worktree state (`WorkTreePanel.tsx`) with background agent task queues so agents can work on isolated git branches. |

---

## 4. What Remains 100% Native to Local Study Notebook

The core strengths of our notebook remain untouched and act as the host for both blueprints:

* **Tauri v2 Desktop Shell (`src-tauri/`)**: Native Window management, Rust IPC commands, file system permissions.
* **SQLite `vault_index.db`**: Rust-driven FTS5 keyword indexing, chunked note embeddings, hybrid vector search, and durable Memory-RAG.
* **Split Markdown Notebook Core**: CodeMirror 6 live preview editor, source copy workflow, and tab management.
* **Google Drive & PDF Export**: OS Credential Manager (`keyring`) token storage and native PDF generation (`printpdf`).

---

## 5. Summary Matrix

```
┌─────────────────────────┬──────────────────────────┬─────────────────────────┐
│ Module                  │ Source Blueprint         │ Weight                  │
├─────────────────────────┼──────────────────────────┼─────────────────────────┤
│ OpenCode SSE Sync & UI  │ OpenChamber              │ 35%                     │
│ Tool Cards & Diff UI    │ OpenChamber              │ 25%                     │
│ PTY & Terminal Server   │ Paseo                    │ 25%                     │
│ Multi-Agent CLI Adapters│ Paseo                    │ 15%                     │
└─────────────────────────┴──────────────────────────┴─────────────────────────┘
```
