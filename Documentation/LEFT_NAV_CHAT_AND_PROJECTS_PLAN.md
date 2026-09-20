# Left Nav → Chat + Projects Panel (PLAN)

Status: **In progress (implementing)**

Component: `src/components/Navbar.tsx` · State: `src/stores/useStore.ts` · Layout: `src/components/Layout.tsx`

## Goal

The left side of the app is currently a narrow 48px vertical "rail" (`w-12`) holding
toggle icons for Assistant / Explorer / Agent / Work-Tree, a divider, a New-Note button,
and a Settings gear pinned to the bottom. All navigation is icon-only.

We replace that rail with one **wider left panel** that reads as the app's home browser:

1. A **horizontal options toolbar** across the top holding every current option (panel
   toggles + new note + settings) — no more vertical icon stacking.
2. A **streamlined sectioned list** below the toolbar:
   - **Projects** (folder entries) — collapsible, **collapsed by default**
   - **Recents** (most recently touched chat threads) — collapsible, **collapsed by default**
   - **All Chats** (every assistant/agent thread) — collapsible, **expanded by default**

Clicking a **chat row auto-opens that chat's panel** (it does not just highlight the
row). Clicking a **project row opens the vault folder** for that project.

## Section order (final)

```
┌────────────────────────────┐
│ [toolbar: all options]    │  ← horizontal, top
├────────────────────────────┤
│ ▸ PROJECTS        (+)     │  collapsed by default
│ ▸ RECENTS                 │  collapsed by default
│ ▾ ALL CHATS  (search ▾)  │  expanded by default
└────────────────────────────┘
```

## Implementation

### 1. Store additions (`useStore.ts`)

- `leftNavWidth: number` (default ~220, persisted to localStorage `lsn_left_nav_width`) +
  `setLeftNavWidth(w)` — width of the new left panel, drag-resizable via `EdgeResizer`
  just like the other side panels.
- `leftNavSections: { projects: boolean; recents: boolean; allChats: boolean }`
  (defaults `{ projects: false, recents: false, allChats: true }`) + a
  `toggleLeftNavSection(which)` action. Persisted to localStorage
  (`lsn_left_nav_sections`) so collapse state survives restart.

### 2. `Layout.tsx` — render the panel like the others

- Replace the bare `<Navbar />` with the same pattern used for other panels:
  `<EdgeResizer onResize={handleLeftNavResize} />` + a `<div style={{ width: leftNavWidth }}>`
  wrapping `<Navbar />` so the width is drag-adjustable.

### 3. `Navbar.tsx` — rewrite

- Root `<nav>` becomes a wider horizontal-layout panel (`w-full` inside the width div,
  `flex-col`).
- **Top toolbar** (`flex-row`, `items-center`, `gap-2`, `justify-between`): Assistant
  toggle, Explorer toggle, Agent toggle, Work-Tree toggle, then a divider, then
  New-Note, and a pin-to-bottom Settings gear moved into the same row (or kept at the
  bottom when the panel is tall — see decision below).
- **Projects section**: header row ("Projects" + chevron + "+" add button). When
  expanded, list `projects` (name + `pinned` star). Row action: `openProject(id)`
  (also calls `toggleSourcesPanel(true)` so the vault becomes visible).
- **Recents section**: header "Recents". When expanded, list `agentSessions` sorted by
  `updatedAt` desc, take top 5. Row action: `setActiveAgentSession(id)` +
  `setShowAssistantPanel(true)`.
- **All Chats section**: header "All Chats" + a search input. When expanded, list all
  `agentSessions` (same click behavior as Recents). Filter rows by the search query.
  Stale/unused threads can be collapsed out of view but remain selectable.

### 4. Styling

- Reuse existing Tailwind tokens: `panel-rounded`, `border border-border`, `bg-card`,
  `text-muted`, `hover:bg-bg hover:text-white`, `bg-accent` for active states.
- Sections get a header row with a chevron that rotates when open; rows have a hover
  background and an active/highlight state matching the selected session.

## Open decisions (resolved with user)

- **Section order**: Projects → Recents → All Chats.
- **Collapsed by default**: Projects and Recents. All Chats is expanded by default.
- **Chat row click**: auto-opens that chat's panel (does not just highlight).
- **Collapsible**: all three sections use the same chevron header pattern.

## Implementation status

**Done (typecheck-verified, tsc --noEmit exit 0):**

- Store surgery in src/stores/useStore.ts:
  - \leftNavWidth\ + \setLeftNavWidth(w)\ (clamps 140..520)
  - \leftNavSections: { projects, recents, allChats }\ + \	oggleLeftNavSection(which)\
  - \loadLeftNavPrefs()\ — hydrates width + collapse state from localStorage (\lsn_left_nav_width\, \lsn_left_nav_sections\)
- src/components/Navbar.tsx — rewritten to a resizable left panel:
  - horizontal options toolbar across the top (assistant / explorer / agent / work-tree toggles, settings, new note)
  - collapsible sections: PROJECTS (expanded by default) then RECENTS then ALL CHATS
  - EdgeResizer drag sets leftNavWidth; section chevrons toggle leftNavSections
  - chat-row click opens that chat's record (openChat), project-row click opens the vault folder (openProject)

Layout.tsx renders \<Navbar />\ unchanged; the component manages its own width so no Layout edit was required.

**Validation:** npm run build passes. Manual smoke test still recommended before release.
