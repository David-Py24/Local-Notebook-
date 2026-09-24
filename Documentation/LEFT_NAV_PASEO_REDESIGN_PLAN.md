# Left Nav → Paseo-style Panel (Workspaces / Chats / Options) (PLAN + IMPLEMENTATION)

Status: **Implemented** (tsc + build + tests green)

Component: `src/components/Navbar.tsx` · State: `src/stores/useStore.ts` · Launcher: `src/components/WorkspaceLauncherModal.tsx`

## Goal

Rebuild the left navigation so it reads like Paseo's sidebar: an **options toolbar** across the
top, a **Workspaces** section (projects → chat sessions nested per project), **Chats** sections
(Recents + All Chats for unassigned sessions), and a **pinned bottom block** with the account
chip + settings gear.

Paseo's mental model: *projects contain workspaces, workspaces contain sessions.* We map that
onto existing app concepts:

| Paseo | This app |
|---|---|
| Project group (icon, title, status dot, chevron, `+` new workspace, `⋯`) | `Project` (`useStore.projects`) |
| Workspace row (status dot, title, `⋯` pin/rename/archive/copy path) | `AgentSession` scoped to that project via `AgentSession.projectPath` |
| Sessions open as tabs inside a workspace | Chat row click opens that session (`openChat`) |
| Pinned section / search | `Project.pinned` (pinned sort first), All Chats search box |
| Bottom Settings / account | Pinned bottom block: avatar + name/email + settings gear |

## Target layout

```
┌────────────────────────────┐
│ [OPTIONS TOOLBAR]          │  assistant/explorer/agent/worktree toggles · new note
├────────────────────────────┤
│ ▾ WORKSPACES               │  expanded by default
│   ▾ my-vault          ⋯ (+)│  project group: status dot, chevron, 📌, time-ago, ⋯, +
│     ● fix-login-notes      │  sessions where session.projectPath === vault path
│     ● redesign-settings    │
│     + New workspace        │  ghost row → launcher (project pre-selected)
│   ▸ other-vault        ⋯ (+)│
│   + Add project            │  → WorkspaceLauncherModal
├────────────────────────────┤
│ ▾ RECENTS                  │  unassigned sessions, top 5 by updatedAt
│ ▾ ALL CHATS  (search)      │  unassigned sessions, filterable
├────────────────────────────┤
│ (D) Developer Workspace ⚙ │  pinned bottom: avatar + name/email + settings
└────────────────────────────┘
```

Sessions are grouped under a project only when `session.projectPath` matches a known
`Project.path`. Sessions with a null/missing/unmatched `projectPath` are **unassigned** and land
in RECENTS / ALL CHATS.

## Implementation

### 1. Store (`useStore.ts`)

- `leftNavSections` shape changed from `{ projects, recents, allChats }` →
  `{ workspaces, recents, allChats }`; `toggleLeftNavSection` union updated to
  `"workspaces" | "recents" | "allChats"`.
- **Hydration bug fixed**: `loadLeftNavPrefs()` existed but was never called, so width +
  collapse state wrote to localStorage but never restored. Hydration now happens at store init
  (`parsedLeftNavWidth` / `parsedLeftNavSections`), with a migration from the old `projects`
  key to `workspaces`.
- New state/action: `workspaceDraftProjectId: string | null` + `setWorkspaceDraftProject(id)` —
  lets the "+ New workspace" ghost row open the launcher with a project highlighted.
- `userAccount` already in the store; reused for the bottom block.

### 2. `Navbar.tsx` — rewrite

- **Toolbar** (top): preserved assistant / explorer / agent / worktree toggles + new-note.
  Settings gear moved **out** to the pinned bottom block.
- **Workspaces section**: iterates `sortedProjects` (pinned first, then by `lastOpened`).
  Each project is a group with:
  - chevron toggle (local `collapsedProjects` state, in-memory),
  - status dot, folder icon, name (click → `openProject`), 📌 pin marker, time-ago,
  - `⋯` `RowKebab` menu: Open / Pin·Unpin / Rename (prompt) / Delete (2-step confirm),
  - `+` and a "New workspace" ghost row → `openWorkspaceLauncher(p.id)`.
  Nested rows list `grouped.byProject.get(p.id)` sessions with `openChat` + their own kebab
  (Open/Fork/Archive/Delete). "Add project" row → launcher un-scoped.
- **Session grouping**: `useMemo` builds `{ byProject, unassigned }` matching `projectPath`
  against `Project.path` with `norm()` (lowercase + backslash→slash) so Windows paths nest
  correctly (guards the path-separator gotcha in AGENTS.md).
- **Recents / All Chats**: now render **unassigned** sessions only (assigned ones live under
  their workspace). Recents = top 5; All Chats keeps the search box.
- **Pinned bottom block**: `userAccount` avatar + name/email + settings gear (was previously
  in the toolbar).
- **`RowKebab`**: small anchored `⋯` dropdown, rendered `fixed` so it survives
  `overflow-hidden` parents. Supports 2-step confirm for destructive items.
- `HoverDetailCard` retained for metadata-rich hover (engine/model/tokens/cost for chats,
  path/last-opened for projects).

### 3. `WorkspaceLauncherModal.tsx`

- Reads `workspaceDraftProjectId`; the pre-selected project row is highlighted with an accent
  border/background. Draft is cleared when a project is opened or an existing folder is opened.

## Verification

- `npx tsc --noEmit` — exit 0.
- `npm run build` — passes.
- `npm test` — 14 files / 127 tests pass (no Navbar-specific tests; store shape change covered
  implicitly by import/typecheck).
- Manual smoke recommended: sessions nest under their vault, unassigned chats in All Chats,
  collapse + width restored after restart, kebab confirm flow works.

## Notes / decisions

- **Workspaces default expanded**; Recents and All Chats retain their previous defaults but now
  list only unassigned sessions. Sessions whose projectPath no longer matches any project
  (deleted project, moved folder) surface in All Chats rather than disappearing.
- Per-project collapse state is **in-memory only** (resets each launch); section-level collapse
  is persisted. Persisting per-project collapse could be a follow-up.
- No Rust changes; no new persistence keys beyond the existing `lsn_left_nav_sections` /
  `lsn_left_nav_width` (with the `projects`→`workspaces` migration).
- Supersedes `LEFT_NAV_CHAT_AND_PROJECTS_PLAN.md` (implemented previously).