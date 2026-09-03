# Local Study Notebook — Improvement Implementation Plan

This is a shared working document for coordinating fixes across the issues found in the
frontend/backend review (2026-09-01). It's meant to be used by both Claude Code and
Antigravity working in the same repo — see the coordination protocol below before picking
up a ticket.

## Coordination protocol

- Before starting a ticket, edit this file: set `Owner:` to your agent name and `Status:`
  to `in progress`, then commit that alone (`docs: claim TICKET-N`) so the other agent sees
  it on next pull/rebase.
  
- Work one ticket at a time per agent. Most tickets touch `src/stores/useStore.ts` — **do
    not have both agents editing that file concurrently**; check its ticket's status first.
  
- Prefer small, focused commits/PRs per ticket over one big change, so review and conflict
    resolution stay manageable.

  
- When done: run `npx tsc --noEmit`, `npm run build`, and `cargo check` (inside
  ` src-tauri/`) before marking a ticket `done`. Update Status here in the same PR.

  
- If a ticket turns out to require changes outside its listed files, note that in this doc
    instead of silently expanding scope — the other agent may be relying on the file list.

Status values: `todo` / `in progress` / `blocked` / `done`.

---

## TICKET-0 — Decision: fate of the SQLite Sources/Notes subsystem

**Status:** **SUPERSEDED — decision made, see [DATA_ARCHITECTURE_PLAN.md](DATA_ARCHITECTURE_PLAN.md)**

Decision: **(B)** — files remain the source of truth. The dead `Source`/`Note` SQLite tables
and PDF/DOCX-extraction pipeline are being removed and the DB repurposed as a local vault
index, not an "Import as Source" content store. See DATA-1 in
`DATA_ARCHITECTURE_PLAN.md` for the concrete removal/consolidation work. TICKET-6 below is
cancelled as a result.

---

## TICKET-1 — Wire up Settings that currently do nothing

**Priority:** high
**Owner:** Antigravity
**Status:** done
**Files:** `src/stores/useStore.ts`, `src/components/StudyBoard.tsx`,
`src/components/SourcesPanel.tsx`, `src-tauri/src/commands.rs`

Each sub-item is independently shippable; do them as separate commits within this ticket.

1. `confirmBeforeDelete` — in `SourcesPanel.tsx:139-150` (`handleActionDelete`), only call
   `confirm()` when `useStore(s => s.settings.confirmBeforeDelete)` is true; otherwise
   delete directly.
2. `startupFolder` — in `App.tsx`, on mount, if `settings.startupFolder` is set and no
   `currentFolderPath` is already restored from `lsn_last_folder`, call `openFolder`.
3. `newNoteLocation` — `openNewNote` in `useStore.ts:438` should create the new file under
   `settings.newNoteLocation` (resolved relative to the vault root) when non-empty, falling
    back to vault root otherwise.
4. `excludedFolders` — parse as a comma-separated list and pass to `read_local_dir` (add a
   parameter to the Rust command, or filter client-side in `refreshExplorer`); apply it in
   `read_local_dir_internal` (`commands.rs`) alongside the existing dotfile skip.
5. `fontFamily` — apply as a CSS `font-family` on the editor/preview container in
   `StudyBoard.tsx` (currently only `fontSize` is applied).
6. `tabSize` — handle `Tab` keydown in the line-editor input (`StudyBoard.tsx`) to insert
   `tabSize` spaces instead of moving focus.
7. `showLineNumbers` — render a line-number gutter column in the editor when true.
8. `autoPairBrackets` — on typing `(`, `[`, `{`, `"`, `'` in the active line input, insert
   the matching closer and place the cursor between them.
9. `showWordCount` — add a small word/character count readout in the editor status area,
   derived from `draft`.
10. `attachmentsFolder` — out of scope until there's an attachment-insert feature; leave a
    `// TODO(attachments)` at most, don't build the feature speculatively.

**Acceptance:** toggling each setting in `SettingsModal` visibly changes behavior without a
restart.

---

## TICKET-2 — Fix line-by-line editor gaps (data loss + missing basic editing)

**Priority:** high
**Owner:** Antigravity
**Status:** done

**Heads up:** [UI_IMPLEMENTATION_PLAN.md](UI_IMPLEMENTATION_PLAN.md)'s TICKET-A1 replaces
the entire per-line-input editor architecture with CodeMirror 6. This ticket's completed
work in `StudyBoard.tsx` (and the `tabSize`/`showLineNumbers`/`autoPairBrackets` bits of
TICKET-1 below) will be removed, not built on, once A1 starts — that's expected and already
accounted for in the UI plan, not a sign anything here was done wrong.
**Files:** `src/components/StudyBoard.tsx`

Current per-line `<input>` model (`StudyBoard.tsx:356-400`) is missing:

1. **Backspace-merge**: pressing Backspace at position 0 of a non-first line should merge
   its text into the end of the previous line and move focus/cursor there.
2. **Arrow Up/Down**: move the "active line" focus to the previous/next line, preserving
   column position where possible.
3. **Paste**: intercept `onPaste` on the active-line input; if the clipboard text contains
   `\n`, split it and splice the resulting lines into `lines` at the cursor position instead
   of letting the browser collapse it to one line (which silently drops content today).

Keep the existing one-`<input>`-per-line architecture — this is a targeted fix, not an
editor rewrite. Manually test: paste a multi-paragraph block copied from a PDF, and
Backspace-merge two lines, in the running app before marking done.

---

## TICKET-3 — Flush pending autosave before it's lost

**Priority:** high
**Owner:** Antigravity
**Status:** done
**Files:** `src/stores/useStore.ts`, `src/components/StudyBoard.tsx` (or wherever the Tauri
window close hook is best registered — check `src/main.tsx`)

1. `closeTab` (`useStore.ts:465`) must flush the pending debounce timer for that panel
   (call `saveFile` immediately with current draft if a timer is pending) before removing
   the tab, not just clear it.
2. `selectTab` similarly should flush the outgoing tab's pending save before switching.
3. Register a Tauri `onCloseRequested` handler (via `getCurrentWindow()` from
   `@tauri-apps/api/window`) that flushes both panels' pending saves before allowing the
   window to close.

**Acceptance:** type into a note, close its tab (or the app window) within the debounce
window, reopen the file — the edit must be on disk.

---

## TICKET-4 — Path containment guard on local-file backend commands

**Priority:** medium (defense-in-depth, not currently exploitable)
**Owner:** Antigravity
**Status:** done
**Files:** `src-tauri/src/commands.rs`

Add a helper that canonicalizes a target path and rejects it if it does not fall under the
currently-open vault root (pass the vault root explicitly from the frontend, since Rust
state doesn't currently track "current folder"). Apply to `read_local_file`,
`write_local_file`, `create_local_file`, `create_local_dir`, `rename_local_entry` (both
paths), and especially `delete_local_entry` given it does a recursive `remove_dir_all`.
Return a clear `Err` string on rejection so the frontend can surface it.

**Acceptance:** a crafted path outside the vault root (e.g. via `..` traversal) is rejected
with an error, not executed.

---

## TICKET-5 — Clean up the Assistant panel default content

**Priority:** low, quick win
**Owner:** Antigravity
**Status:** done
**Files:** `src/stores/useStore.ts`

Replace `INITIAL_ASSISTANT_MESSAGES` (`useStore.ts:42-62`) — it currently contains what
reads like a leaked agent debugging transcript — with a short, genuine welcome message
appropriate for a placeholder assistant (e.g. explaining it's a local demo assistant, no
network calls). Leave `sendAssistantMessage`'s keyword-matching logic as-is unless the user
separately asks for a real model integration.

---

## TICKET-6 — CANCELLED

**Status:** CANCELLED — TICKET-0 was resolved as "(B) remove," so there is no Sources DB to
build an import UI for. If PDF/DOCX import is wanted later, see the note in DATA-1 of
`DATA_ARCHITECTURE_PLAN.md` for the much simpler shape that fits the files-as-SSOT decision
(extract text, write it as a plain new `.md` file — no database involved).

---

## Post-launch fix — "New Note" spuriously failing with "File already exists"

**Reported by:** user, screenshot of the real Tauri app showing the error dialog.
**Fixed by:** Claude

**Root cause:** `openNewNote` (`useStore.ts`) picked a unique filename by checking
`get().explorerEntries.some((e) => e.path === p)` against a hand-built path
`` `${targetDir}/${name}` ``. Two independent problems made this check useless: (1)
`explorerEntries` is only the current folder's flat, top-level listing — it doesn't see into
subfolders at all, so any `newNoteLocation` setting pointing at a subfolder meant the check
never looked in the right place; and (2) on Windows, backend-returned paths use `\`, but the
JS join always used `/`, so even a same-folder comparison was a string mismatch and never
matched a real existing file. Net effect: the app always attempted `Untitled.md` first no
matter what actually existed on disk, and once a real `Untitled.md` existed, the backend
(correctly) rejected the duplicate and the JS-side pre-check never caught it beforehand to
try `Untitled 1.md` instead.

**Fix:** stopped predicting filesystem state in JS entirely. `openNewNote` now just tries
`Untitled`, `Untitled 1`, `Untitled 2`, ... directly against the backend, stopping at the
first one that succeeds; it only keeps retrying while the backend's error specifically says
"already exists" (any other error — e.g. a permissions problem — surfaces immediately
instead of retrying 200 times pointlessly).

**Verification:** `npx tsc --noEmit` and `npm run build` pass. This sandbox has no real
Tauri filesystem, so the success/retry-on-collision path itself couldn't be exercised
end-to-end here — confirmed instead that the failure path is correct: `invoke()` rejects
immediately in this environment with an unrelated error (no Tauri runtime), the new code
correctly does *not* match it as "already exists" and stops after one attempt (not a
200-iteration spin), and surfaces that real error via the same `alert(...)` as before. The
actual duplicate-name scenario needs a real vault to confirm fully.

---

## Suggested order

1. ~~TICKET-0~~ — resolved, see `DATA_ARCHITECTURE_PLAN.md`.
2. TICKET-3 (data loss — highest user-visible risk)
3. TICKET-2 (editor correctness)
4. TICKET-1 (settings wiring — largest but low-risk, many small independent commits)
5. TICKET-5 (quick win, can slot in anytime)
6. TICKET-4 (hardening)
7. ~~TICKET-6~~ — cancelled

Note: DATA-1 through DATA-4 in `DATA_ARCHITECTURE_PLAN.md` should land before or alongside
TICKET-4 here, since both touch `src-tauri/src/commands.rs` — check that file's ticket
statuses before starting either to avoid overlapping edits.
