# UI Overhaul Implementation Plan — Obsidian-style Editor & Panel System

Companion to [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — same coordination protocol
applies (claim a ticket by setting `Owner`/`Status` here before starting, one agent at a
time on any file both tracks touch, run `npx tsc --noEmit` / `npm run build` / `cargo check`
before marking `done`).

**Supersedes:** TICKET-2 (editor gaps) and items 6–8 of TICKET-1 (`tabSize`,
`showLineNumbers`, `autoPairBrackets`) from the main plan — CodeMirror provides all of these
natively, so don't hand-roll them there once TICKET-A1 lands. Everything else in the main
plan is unaffected.

## Current state (as found)

- **Editor**: `StudyBoard.tsx` renders one `<input>` per line — no real text-editing engine.
  No syntax highlighting, no cross-line cursor movement, multi-line paste is lossy.
- **Panels**: `Layout.tsx` hardcodes a fixed left-to-right order (Navbar → Assistant →
  Sources → StudyBoard) with drag-to-**resize** only (`EdgeResizer` in `Layout.tsx`, plus a
  near-identical but unused `Resizer.tsx` — dead code, can be deleted). There is no
  drag-to-**reorder**, no dragging tabs between the split panes, and no floating/detached
  panels.
- **"Panel Layout Manager" modal** (`PanelLayoutModal.tsx`) only toggles panels that already
  exist and calls the existing preset/resize actions — its "Save Layout Use Case" button
  (`PanelLayoutModal.tsx:53-57`) is a stub that just shows `alert(...)` and saves nothing.
- No drag-and-drop library, no code-editor library (CodeMirror/Monaco/ProseMirror) in
  `package.json` today — this is greenfield for both.

## Two decisions needed before starting

**DECISION-A — Editor engine.** Recommend **CodeMirror 6** (what Obsidian itself is built
on): mature markdown mode, built-in undo/redo, native multi-line editing/paste, an
extension API that can do Obsidian-style "Live Preview" decorations (hide `**`/`#`/`` ` ``
syntax markers except on the active line). Alternative is continuing to extend the
hand-rolled per-line-input editor — not recommended, it fights the browser rather than
using it.

**DECISION-B — Panel docking approach.** Recommend a **small custom
drag-to-reorder/drag-to-split implementation** (pointer events + drop-zone highlighting)
scoped to exactly the gestures Obsidian actually has (reorder side panels, drag a tab to
split or to the other pane) rather than adopting a generic docking library (`rc-dock`,
`dockview`, etc.). A generic library is faster to wire up but harder to theme to the
existing dark-theme tokens and brings a lot of unused flexibility (floating windows, grid
docking) that isn't part of the current design. Revisit this if the custom version turns
out to be a bigger lift than expected.

Both are marked "recommended" — override in this doc if you'd rather go the other way
before TICKET-A1/B1 start.

---

## Track A — Real markdown editor

### TICKET-A1 — Swap per-line inputs for a CodeMirror 6 editor (source mode)

**Priority:** high — foundation for the rest of Track A
**Owner:** Claude **Status:** done (pending manual in-app verification — see note)
**Files:** `package.json` (added `@codemirror/state`, `@codemirror/view`,
`@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-markdown`), new
`src/components/MarkdownEditor.tsx`, `src/components/StudyBoard.tsx`

Implemented as planned: one CodeMirror `EditorView` per panel, mounted once and kept alive
across re-renders; `setDraftContent(panel, content)` fires from `EditorView.updateListener`
on doc changes. Tab switching is handled by giving `<MarkdownEditor key={activeTabId} .../>`
a `key` — React remounts the editor with the new tab's content rather than diffing the doc
in place, which is simpler than reconfiguring an existing view and has the side benefit of
giving each tab its own fresh undo history instead of bleeding across documents.
`MarkdownEditor` also keeps a defensive external-value-sync effect (dispatches a full-doc
replace transaction if `value` changes without originating from its own `onChange`) in case
something other than a tab switch ever mutates `draft` externally in the future — not
currently exercised by anything, but cheap insurance per the ticket's original spec. All
per-line state (`activeLineIndex`, `cursorPos`, `activeInputRef`, `lines`,
`handleLineChange`) removed from `StudyBoard.tsx`.

**Known regression, intentional per this plan's own supersession note:** TICKET-1's
`tabSize`/`showLineNumbers`/`autoPairBrackets` wiring (all in the old per-line editor) is
now inert — those extensions don't exist on the new CodeMirror instance yet. That's exactly
what TICKET-A3 exists to fix; do that one next, not later, to close the gap quickly.
`fontFamily`/`fontSize` still work (applied as plain CSS on the editor's parent container,
unchanged from before).

**Bundle size aside:** `@codemirror/lang-markdown`'s default config pulls in HTML/JS/CSS
embedded-language support, adding roughly +170KB gzip to the single JS bundle (no code
splitting is configured). Left `@codemirror/language-data` (full per-language grammar list,
another ~30 packages) out of this ticket — that's TICKET-A4's fenced-code-highlighting
scope, not needed here, and installing it here would have made the size problem worse for
no reason yet. Not treated as a blocker: this is a Tauri desktop bundle loaded from local
disk on each launch, not shipped over a network on every page view, so the usual web
bundle-size urgency doesn't apply the same way — worth revisiting only if it demonstrably
affects app startup time.

**Verification:** `npx tsc --noEmit` and `npm run build` both pass. **Not yet manually
tested in the running app** — this environment's browser preview can't exercise Tauri's
`invoke()` calls (no real filesystem access outside the actual desktop shell), so typing/
undo/paste correctness in a real vault needs a manual pass via `npm run tauri dev` before
this is fully signed off. Acceptance criteria below are otherwise met by construction
(CodeMirror's default keymap + `history()` provide all of this natively).

**Acceptance:** typing, selection, arrow-key navigation, Backspace across line boundaries,
multi-line paste, and Ctrl+Z/Ctrl+Y all behave like a normal editor. Existing autosave debounce,
tab switching, and split-pane behavior still work unchanged from the outside.

### TICKET-A2 — Obsidian-style Live Preview mode

**Priority:** high
**Owner:** — **Status:** todo
**Files:** `MarkdownEditor.tsx`, `StudyBoard.tsx`, `src/stores/useStore.ts`

Add a CodeMirror decoration extension that renders markdown inline while editing: headings
sized up, `**bold**`/`*italic*` styled with the markers hidden, `` `code` `` styled, `- [ ]`
rendered as a clickable checkbox — but only on lines the cursor isn't currently in (the
active line shows raw syntax so it stays editable), matching Obsidian's Live Preview.

Extend `ViewMode` from `"edit" | "preview"` to `"source" | "live" | "preview"` (keep the
existing full-render `ReactMarkdown` mode as `"preview"` for a clean reading view; `"live"`
becomes the new default; `"source"` is raw CodeMirror with no decorations, for people who
want to see exact markdown).

**Acceptance:** headings/bold/italic/checkboxes/inline code render styled with markers
hidden, except on the line containing the cursor; toggling to "preview" still gives the
current full-document rendered view; toggling to "source" shows raw markdown everywhere.

### TICKET-A3 — Wire editor-affecting settings through CodeMirror

**Priority:** medium (replaces TICKET-1 items 6–8)
**Owner:** — **Status:** todo
**Files:** `MarkdownEditor.tsx`

- `tabSize` → `indentUnit.of(" ".repeat(tabSize))`
- `showLineNumbers` → conditionally include the `lineNumbers()` extension
- `autoPairBrackets` → conditionally include `closeBrackets()`
- `fontFamily`/`fontSize` → `EditorView.theme({...})`

**Acceptance:** each setting toggles the corresponding CodeMirror behavior live, no restart
needed (reconfigure via `Compartment`s so toggling doesn't recreate the whole editor/cursor
position).

### TICKET-A4 — Stretch: fenced-code language highlighting, table rendering, checkbox click-to-toggle

**Priority:** low / stretch, do only after A1–A3 are solid
**Owner:** — **Status:** todo
**Files:** `MarkdownEditor.tsx`

Don't build wiki-link (`[[note]]`) autocomplete or backlinks speculatively — that's a
bigger feature (needs a notes index) and should get its own ticket if/when the user asks
for cross-note linking specifically.

---

## Track B — Panel dragging & layout customization

### TICKET-B1 — Data-driven panel layout (prerequisite for dragging)

**Priority:** high — foundation for the rest of Track B
**Owner:** Claude **Status:** done
**Files:** `src/stores/useStore.ts`, `src/components/Layout.tsx`; deleted
`src/components/Resizer.tsx` (dead code, confirmed unused — removed)

**Implementation note (deviation from original scope, per this doc's own rule to record
scope changes):** rather than consolidating visibility/width into a single `layout: PanelSlot[]`
struct array, kept the existing `showAssistantPanel`/`showSourcesPanel`/`assistantWidth`/
`sourcePanelWidth` fields as-is (they're read by several other components — `Navbar.tsx`,
`AssistantPanel.tsx`, `TopBar.tsx`, `PanelLayoutModal.tsx`, `StudyBoard.tsx` — touching all
of those wasn't necessary for this ticket's goal). Instead added a standalone
`panelOrder: SidePanelId[]` array (`SidePanelId = "assistant" | "sources"`, persisted to
`localStorage` under `lsn_panel_order`) plus a `reorderPanels(fromId, toId)` action that
moves an id to another's position via splice. `Layout.tsx` now maps over `panelOrder`,
looking up each id's `{visible, width, onResize, Component}` from a small local
`panelConfig` record, instead of two separate hardcoded JSX blocks. `StudyBoard` stays the
fixed center pane, unaffected. Verified with `npx tsc --noEmit` and `npm run build` (both
clean).

**Acceptance:** met — visual order, resizing, and show/hide behavior are unchanged from
before, now driven by `panelOrder` state; `reorderPanels` is ready for TICKET-B2 to call
from a drag handler.

### TICKET-B2 — Drag-to-reorder side panels

**Priority:** medium
**Owner:** Claude **Status:** done (pending manual in-app verification)
**Files:** `Layout.tsx`, new `src/components/PanelDragHandle.tsx`

Implemented as a small grip strip (`PanelDragHandle`) absolutely positioned along the top
edge of each side panel's wrapper `div` in `Layout.tsx` — not the whole panel — specifically
so dragging text or clicking buttons inside the panels (explorer filenames, assistant chat
input, etc.) isn't hijacked by an accidental native-drag gesture. Uses native HTML5
drag-and-drop with a custom MIME type (`PANEL_DRAG_MIME`, exported from the handle
component) rather than plain `"text/plain"`, to avoid colliding with any future drag source
that also sets plain text. Each panel wrapper is both a drag source (via its handle) and a
drop target (`onDragOver`/`onDrop` on the wrapper itself, not just the handle, so dropping
anywhere on the target panel works, not only precisely on its handle) — on drop, calls
`reorderPanels(draggedId, targetId)` from TICKET-B1, which already persists to
`localStorage`.

**Verification:** `npx tsc --noEmit` and `npm run build` pass. **Not manually tested in the
running app** for the same reason as TICKET-A1 — this sandbox's browser preview can't drive
a real Tauri window's native drag-and-drop interaction convincingly; do a manual drag test
via `npm run tauri dev` to confirm the drop lands correctly and the order survives a reload.

**Acceptance:** dragging the Assistant panel's handle onto the Explorer panel swaps their
order; order persists across reload via existing localStorage settings persistence.

### TICKET-B3 — Drag tabs between/within the split editor panes

**Priority:** medium
**Owner:** Claude **Status:** done (pending manual in-app verification)
**Files:** `StudyBoard.tsx`, `src/stores/useStore.ts`

Implemented `moveTab(fromPanel, toPanel, path)` in the store: if the dragged tab is its
panel's currently active tab, its content is already in `leftDraft`/`rightDraft` and is
reused directly (after flushing any pending autosave first, so the moved copy is never
stale); if it's a background tab, there's no in-memory copy for it at all in this app's data
model (only the active tab per panel has loaded content), so it's read from disk once —
same as `selectTab` already does when switching to a background tab, not a new cost this
ticket introduces. The source panel promotes another tab to active (same pattern as
`closeTab`) if the moved tab was active there. Drop targets: each pane's tab bar
(`onDrop` on the `tabContainerRef` div in `StudyBoard.tsx`) via a custom
`TAB_DRAG_MIME` payload carrying `{panel, path}` as JSON — separate from `PANEL_DRAG_MIME`
from TICKET-B2 so the two drag systems can't misfire on each other's drop zones. When
unsplit, a thin drop zone on the left pane's right edge (visible/highlighted only while a
tab-drag is over it) calls `moveTab("left", "right", path)`, which itself flips
`splitActive` to true if needed — auto-split, without going through `splitScreen()` (whose
own semantics are "duplicate the current tab," different from "move this specific tab").
Only the up-to-3 visible tabs are draggable; the "+N more" overflow dropdown list wasn't
wired for drag source, out of scope for this pass.

**Verification:** `npx tsc --noEmit` and `npm run build` pass. **Not manually tested in the
running app**, same caveat as TICKET-A1/B2 — native HTML5 drag-and-drop across the two
split panes needs a real interactive pass via `npm run tauri dev` (dragging a tab left→right,
confirming content isn't lost or duplicated, and confirming the auto-split drop zone works
when starting unsplit).

**Acceptance:** drag a tab from left to right pane — it disappears from the left tab bar and
appears active in the right pane with its in-memory content intact (no flash of stale/empty
content); dragging to a non-split single pane creates the split automatically.

### TICKET-B4 — Real "Save Layout" persistence

**Priority:** low, quick win once B1 lands
**Owner:** — **Status:** todo
**Files:** `PanelLayoutModal.tsx`, `src/stores/useStore.ts`

Replace the `alert(...)` stub with actually saving the current `layout` (TICKET-B1) +
panel widths + `splitActive` as a named entry in `localStorage` (`lsn_custom_layouts`,
an array of `{ name, layout, assistantWidth, sourcePanelWidth, splitActive }`). Show saved
custom layouts alongside the four built-in presets in the same grid, with a delete affordance.

**Acceptance:** "Save Layout" prompts for a name, persists it, and it reappears (and is
selectable/applies correctly) after an app restart.

---

## Suggested order

1. Confirm/override DECISION-A and DECISION-B.
2. TICKET-A1 (biggest lift, unblocks A2–A4) — can run in parallel with TICKET-B1, they don't
   share files.
3. TICKET-B1 → TICKET-B2 and TICKET-B3 (can be split across two agents once B1 lands, since
   B2 only touches `Layout.tsx` and B3 only touches `StudyBoard.tsx`'s tab bar).
4. TICKET-A2, then TICKET-A3 (both depend only on A1).
5. TICKET-B4 (depends only on B1).
6. TICKET-A4 last, optional.

Track A and Track B are otherwise independent and safe to run on separate agents
concurrently once their respective foundation tickets (A1, B1) land — just watch for both
tracks eventually touching `StudyBoard.tsx` (A-track: the editor internals; B-track: the
tab-bar drag handlers) and `useStore.ts` (both add actions) — coordinate via this doc's
`Owner`/`Status` fields the same way as the main plan.
