# Data Layer Scaffolding Plan (pre-backup/recovery groundwork)

Companion to [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) and
[UI_IMPLEMENTATION_PLAN.md](UI_IMPLEMENTATION_PLAN.md) — same coordination protocol (claim
a ticket via `Owner`/`Status` here, verify with `npx tsc --noEmit` / `npm run build` /
`cargo check` before marking `done`).

**Supersedes TICKET-0 and TICKET-6 in IMPLEMENTATION_PLAN.md** — the SSOT decision is made
(see below), so update those two tickets' `Status` to `superseded — see
DATA_ARCHITECTURE_PLAN.md` when this file is adopted.

## Decision (resolves TICKET-0)

**Files remain the Single Source of Truth. No cloud sync is being designed yet — this plan
is purely local groundwork.**

Rationale, per the actual stated use case: the goal is disaster-recovery backup and
occasional continuity on another device (a laptop dying mid-blackout, later resuming on a
different device or a future web/mobile client) — **not** simultaneous multi-device
editing. There is only ever one active writer at a time. That means whole-file
last-write-wins is a perfectly adequate conflict model when cloud sync eventually arrives —
no CRDTs, no row-level merge, no rewrite of the editor/explorer to a database model
(Option 1, rejected for now — see prior conversation for the full comparison). This also
means the dead `Source`/`Note` SQLite tables and PDF/DOCX-extraction-into-DB pipeline
(`commands.rs`, `parsers.rs`) are not needed as a content store and should be repurposed,
not preserved as-is.

Cloud backup/retrieval itself (Supabase or otherwise) is explicitly **out of scope for this
plan** and deliberately not designed yet, per "no need for rush." DATA-5 below is a stub
placeholder only, to be turned into its own plan document when picked up.

---

## TICKET DATA-1 — Consolidate the two dead SQLite databases into one local vault index

**Priority:** high — this is the actual "secure and scaffold the database" work
**Owner:** — **Status:** todo
**Files:** `src-tauri/src/db.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`,
`src-tauri/src/parsers.rs` (remove), `src-tauri/Cargo.toml` (drop `pdf_extract`/`docx_rs` if
nothing else uses them)

Today `study_notes.db` (`sources` table) and `notes.db` (`notes` table) exist, are opened on
every launch, and are never read or written by the UI. Replace both with a single
`vault_index.db` holding one table:

```sql
CREATE TABLE files (
    path            TEXT PRIMARY KEY,   -- absolute path, canonicalized
    content_hash    TEXT NOT NULL,      -- e.g. blake3 or sha256 of file contents
    size_bytes      INTEGER NOT NULL,
    mtime           TEXT NOT NULL,      -- filesystem modified time, ISO 8601
    last_indexed_at TEXT NOT NULL,
    last_backed_up_at TEXT,             -- NULL until DATA-5 exists; unused for now
    sync_status     TEXT NOT NULL DEFAULT 'not_tracked'  -- reserved for DATA-5
);
```

Remove `add_source`, `get_sources`, `get_source`, `get_source_content`, `update_source`,
`delete_source`, `copy_source_to_note`, `add_note`, `get_notes`, `get_note`, `update_note`,
`pin_note`, `delete_note` from `commands.rs` and their registrations in `lib.rs` — none are
called from the frontend, confirmed by grepping every `invoke()` call in `src/`. If PDF/DOCX
import is wanted later, it becomes a much simpler feature on its own (extract text, write it
as a new `.md` file via the existing `create_local_file`/`write_local_file` commands) — note
that possibility here rather than losing the idea, but don't build it speculatively now.

**Acceptance:** app launches with one `vault_index.db` file (old two are no longer created
on fresh installs); `cargo check` passes with `parsers.rs` and the unused parsing deps
removed; no frontend behavior changes (nothing depended on the removed commands).

---

## TICKET DATA-2 — Keep the vault index in sync with the real filesystem

**Priority:** high, depends on DATA-1
**Owner:** — **Status:** todo
**Files:** `src-tauri/src/commands.rs` (new `index_file`/`remove_from_index` helpers), `src/stores/useStore.ts`

- On `openFolder`/`refreshExplorer`, walk the returned tree and upsert a row per file
  (hash + mtime) — full rescan is fine here, it's infrequent.
- On `write_local_file`, `create_local_file`, `rename_local_entry`, `delete_local_entry`,
  update the index incrementally in the same Rust command (compute the hash once, on write)
  instead of waiting for the next full rescan.
- Scope this ticket to the indexing plumbing only — do not build search/backlinks UI on top
  of it yet, even though this is exactly the data those features would need later.

**Acceptance:** after any file create/edit/rename/delete through the app, `vault_index.db`
reflects it without requiring a manual refresh; a full rescan and an incremental update
produce the same hash for an unchanged file (idempotent).

---

## TICKET DATA-3 — Local version history (the actual near-term "secure my data" win)

**Priority:** high — this is the one that pays off immediately, independent of any future
cloud phase, and directly answers "blackout, laptop dying, need to secure data now"
**Owner:** — **Status:** todo
**Files:** `src-tauri/src/commands.rs`, `src/stores/useStore.ts` (`saveFile`)

Before every successful `write_local_file` for a tracked note, copy the file's *previous*
content into a hidden history folder (e.g. `<app_data_dir>/history/<hash-of-path>/<timestamp>.md`,
keyed off the index from DATA-1/DATA-2 so lookups don't require parsing the vault tree).
Keep the last N versions per file (e.g. 20, or size-capped) and prune older ones on write.
This is pure local disk I/O — no network, no accounts — and gives an actual undo/recovery
path today: if a save goes wrong, a file gets corrupted, or the user wants to look at what a
note said yesterday, there's a real answer.

**Acceptance:** editing and saving a note several times leaves recoverable prior versions on
disk; a manual "restore this version" isn't required for this ticket (that's a small UI
follow-up) but the versions must exist and be inspectable.

---

## TICKET DATA-4 — SQLite durability settings on the new index DB

**Priority:** low, quick win, do alongside DATA-1
**Owner:** — **Status:** todo
**Files:** `src-tauri/src/db.rs`

Explicitly set `PRAGMA journal_mode=WAL;` and `PRAGMA synchronous=NORMAL;` when opening
`vault_index.db` (rusqlite doesn't enable WAL by default). This is a one-line correctness
fix, not a design change — "secure the database" should include the index itself being
crash-safe.

**Acceptance:** `PRAGMA journal_mode;` reports `wal` after connecting; app survives a
simulated crash mid-write in manual testing without corrupting the index (worst case, a
rescan via DATA-2 rebuilds it from disk, since it's a derived cache, not the SSOT).

---

## TICKET DATA-5 — Cloud backup/retrieval phase (placeholder only, not started)

**Priority:** deferred — explicitly not being designed yet
**Owner:** — **Status:** blocked (not started by request — "no need for rush")

Once DATA-1 through DATA-4 land, the `files` table's `sync_status`/`last_backed_up_at`
columns are already sitting there waiting to be used: a future sync worker would query
`WHERE sync_status != 'synced'`, upload changed files (by `content_hash`) to cloud storage,
and flip the flag — the outbox pattern from the earlier flowchart discussion, but at file
granularity instead of row granularity, consistent with the Option 2 decision above. The
web/mobile "read from another device" client would read from the cloud copy, not from this
local index. This gets its own plan document when picked up — don't start implementation
from this stub.

---

## Suggested order

1. DATA-1 (consolidate DBs, remove dead code) — do this first, everything else depends on
   the new schema existing.
2. DATA-4 alongside DATA-1 (same file, trivial addition).
3. DATA-2 (keep index live).
4. DATA-3 (version history) — can actually be built in parallel with DATA-2 once DATA-1
   lands, since it only needs the index to *exist*, not necessarily be perfectly live yet.
5. DATA-5 — leave alone until explicitly picked up later.
