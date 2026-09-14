# Google Drive Backup Plan (accounts + one-way note backup)

Companion to [DATA_ARCHITECTURE_PLAN.md](DATA_ARCHITECTURE_PLAN.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), and
[UI_IMPLEMENTATION_PLAN.md](UI_IMPLEMENTATION_PLAN.md) — same coordination protocol (claim a ticket via
`Owner`/`Status` here, verify with `npx tsc --noEmit` / `npm run build` / `cargo check` before marking `done`).

**Resolves the DATA-5 stub** in DATA_ARCHITECTURE_PLAN.md: this plan turns that placeholder into the
Google-Drive backup design and, for the first time, actually uses the reserved `files.last_backed_up_at` and
`files.sync_status` columns.

---

## Decision (resolves "should we use Supabase?")

**Connect directly to Google Drive with OAuth 2.0 (PKCE) from the Tauri backend. No Supabase.**

Grounding this in the current architecture (`Documentation/DATA_ARCHITECTURE_PLAN.md:12-30`):

- **The backup destination is the user's own Google Drive.** There is no server-side feature the Drive API
  can't already do here. A Supabase layer (accounts, Postgres, storage, realtime) would sit between the app
  and Drive, adding a hosted dependency, billing, a second set of credentials, E2E-encryption decisions on
  blobs, and a new failure/attack surface — for zero user-visible benefit in this feature. It also breaks the
  core product promise ("local-first, no server").
- **Cloud was already scoped out of the SSOT decision** (`DATA_ARCHITECTURE_PLAN.md:14-28`) because the use
  case is disaster-recovery backup + occasional continuity on another device — one active writer at a time.
  Whole-file last-write-wins is the conflict model; no CRDT/row-merge problem exists that would justify a
  backend.
- **Revisit Supabase only** when the requirement becomes: cross-device sync *not* via Drive, server-managed
  accounts, file sharing/collaboration, or a future web/mobile client with a shared metadata store. Those are
  the cases where Postgres + Storage + realtime earn their keep.
- **Hedge (do this now, cheaply):** implement the remote store behind a small Rust `trait BackupProvider`
  (`upload`/`download`/`delete`/`list`/`find_by_path`). Drive is the v1 implementation. If we later go
  Supabase-first, it becomes a second implementation of the same trait; the backup engine, progress model, and
  DB columns don't change. This keeps "no Supabase" a postponement, not a dead end.

---

## Goal / non-goals

**Goal:** a signed-in Google account can (a) pick which vault(s) to back up and (b) one-way copy those vaults'
`.md` files + attachments into a folder on their own Drive, incrementally (only changed files re-upload),
on demand, with visible progress and last-backup time.

**Non-goals (v1):**
- Two-way sync / editing on Drive. Drive copies are a backup, not a workspace.
- Auto-remote-delete. Backups never delete from Drive (see policy below).
- Restore UI — the download plumbing lands behind the same trait, but no UI this pass.
- Multi-account, per-file granular restore, scheduling beyond "on demand", encryling backups before upload.

---

## Data impacts (what changes where)

| Layer | Today | After this plan |
|---|---|---|
| **Files on disk** (vaults) | SSOT for note content | Unchanged — still SSOT. Backup is derived. |
| **SQLite `files`** | `last_backed_up_at` unused (NULL), `sync_status` always `'not_tracked'` | New states `'pending' / 'synced' / 'error'`; `last_backed_up_at` set on success. The existing Rust test that preserves `sync_status` (commands.rs:774-799) stays valid. |
| **SQLite (new table)** | — | `drive_files` (path → remote mapping, see schema below) |
| **localStorage** | `lsn_settings`, `lsn_pinned`, `lsn_projects`... | New `lsn_backup` — { selected vault paths, last backup ISO time, "last errored path" }. Account + tokens never in localStorage. |
| **Windows Credential Manager** | — | Google refresh token (via `keyring` crate). Only place tokens live. |
| **OpenCode / AI keys** | BYOK in-memory only | Unchanged — no interaction. |

New table (in `src-tauri/src/db.rs`, created idempotently like the others):

```sql
CREATE TABLE drive_files (
    path          TEXT PRIMARY KEY,   -- absolute local path, canonicalized
    rel_path      TEXT NOT NULL,      -- vault-relative path, e.g. "Sources/Math/Trig.md"
    vault_root    TEXT NOT NULL,      -- which vault (root folder) it belongs to
    content_hash  TEXT NOT NULL,      -- our hash at upload time (content_hash column)
    drive_file_id TEXT NOT NULL,      -- Google Drive file id
    drive_md5     TEXT,               -- Drive's md5Checksum at upload time, for cheap drift checks
    updated_at    TEXT NOT NULL
);
```

Note: `files.content_hash` uses `DefaultHasher` (commands.rs:61-67). It is deterministic within a build but is
not a stable/portable hash. Keep using it for *local* change detection, but drive drift-checks compare our
stored `content_hash` against `drive_files.content_hash` + `md5Checksum`, never across machines. If restore
needs hash cross-checks later, migrate to SHA-256 with a one-time reindex.

---

## Google OAuth design

**Client setup (Google Cloud Console, done once by us):**
- OAuth consent screen: app name, user support email.
- Create OAuth **Client ID of type "Desktop app"** (installed-app flow). Scope `https://www.googleapis.com/auth/drive.file` (least privilege — only sees files *this app* created) + `openid email profile` to identify the account. No `drive` scope, no verification needed for `drive.file`.
- Register loopback redirect `http://127.0.0.1:<port>/` per-instance (Google allows loopback URIs for installed clients — Tauri's dev port 1420 is irrelevant; we use our own ephemeral port).

**Flow (all in Rust, new `src-tauri/src/drive.rs`):**
1. `google_sign_in(state)` command: generate PKCE `code_verifier`/`code_challenge` + random `state`, spin up a tiny HTTP listener on an ephemeral loopback port (`127.0.0.1:0`), build the consent URL, open it in the system browser via the **already-registered `shell` plugin** (needs `shell:allow-open` added to `capabilities/default.json`).
2. Google redirects the browser back to `http://127.0.0.1:<port>/?code=…&state=…`. The Rust handler captures `code`, validates `state`, exchanges it for access + refresh tokens (PKCE, `client_id` only — no client secret for installed apps).
3. Store the refresh token immediately in **Windows Credential Manager** via the `keyring` crate; keep the short-lived access token in memory only. Never persist tokens to the DB or localStorage.
4. `google_refresh_token()` refreshes automatically before an upload batch.
5. `google_sign_out(state)` — delete the keyring entry, reset `lsn_backup`, leave Drive copies untouched.

**Why PKCE + loopback, not a custom URI scheme:** no Windows registry/installer changes, works identically in
`npm run tauri dev` and release, no deep-link plugin dependency. (If the manual browser round-trip ever
becomes a UX problem, a `tauri-plugin-deep-link` scheme is a clean future upgrade.)

**Security:** `drive.file` scope only; tokens only in Credential Manager; `state` + PKCE verified; no token
logging; `reqwest` (rustls) for all API calls.

---

## Drive folder layout

```
My Drive /
└── Local Study Notebook /                 <- created by us (277 file-id "folder" kind)
    └── <vault-root-folder-name> /         <- one folder per selected vault (suffix "-N" if name collides)
        └── Sources/Math/Trig.md           <- vault-relative tree, `excluded_folders` honored; attachments too
```

On every file we store `appProperties`: `{ vault, rel_path, content_hash }` (Drive appProperties are cheap,
searchable, and invisible to the user). This is what lets a future sync find "which remote file is this local
path" without listing everything.

---

## Backup engine (v1 = on-demand)

Command surface (Rust, mirrored in the Zustand store as a `backup` slice):

- `drive_backup_start(vaults: Vec<String>) -> ()` — starts the worker (idempotent; error if already running)
- `drive_backup_status() -> BackupStatus` — running, progress `{done,total,current_path}`, last errored path, last backup time
- `drive_backup_cancel() -> ()`
- `google_sign_in / google_sign_out / google_account() -> Option<GoogleAccount>` (name + email from id_token)

Worker behavior:
1. For each selected vault: `reindex`-style walk (reuse `reindex_vault` scan logic) → list of `.md` + attachment files, honoring `excluded_folders`.
2. Diff against `drive_files`: skip rows where `content_hash` matches both tables (no change). Upload new/changed files.
3. Upload via Drive API multipart (`files.create`/`files.update` with `appProperties`). Inside the vault's Drive folder, keep the relative path structure.
4. On success: upsert `drive_files`, set `files.sync_status='synced'` + `last_backed_up_at=now`. On failure: `sync_status='error'`, record the path, continue the batch (no full aborts).
5. Emit progress to the frontend (Tauri event `backup://progress`, or a polled `drive_backup_status()` — polled keeps it simpler with the existing command style).
6. Deleted-local files: do **not** delete the Drive copy. Record them in `lsn_backup` as "remove from future runs" and leave them on Drive. (Optionally a later `.trash` cleanup.)

**Conflict policy on restore (future, same trait):** restore the requested folder's Drive subtree locally into a
new/chosen folder; on filename clashes write `name (restored).md`; never overwrite local files.

**Auto-trigger (future, v1.2):** after an auto-save debounce quiet period fires and there are pending
`content_hash` changes for a backed-up vault, start a quiet backup; plus a manual "Backup now" button. v1 ships
manual only.

---

## Frontend

- New **Backup tab** in `SettingsModal.tsx` (matches the existing tabbed-sidebar layout):
  - Signed out: "Connect Google Drive" button → launches `google_sign_in`, shows consent.
  - Signed in: account avatar/name/email (reuse `avatarLetter/avatarColor` pattern from `UserAccount`, useStore.ts:64-69), vault multi-select checkboxes, "Backup now" / progress bar (`done/total`, current file), last-backup timestamp, "Sign out".
- Store slice (`backup`: `googleAccount`, `backupStatus`, `backupRunning`, `lastBackupAt`, `vaultsToBackup`) + actions calling the new `invoke`s; persisted subset to `lsn_backup`.
- `Navbar.tsx`: optional small cloud icon as a glanceable "backed up / pending / error" indicator (v1.1).

---

## Cargo / capability changes

- `Cargo.toml`: add `reqwest` (rustls), `oauth2` (PKCE/exchange/refresh), `keyring` (Credential Manager), `rand`, `base64`. `serde`/`serde_json`/`url` already present.
- `capabilities/default.json`: add `shell:allow-open` (opening the Google consent URL in the system browser). No dialog changes needed for v1 (restore later adds `dialog:allow-save`/folder pick).
- Keep everything behind the existing Tauri `#[tauri::command]` pattern; register the ~5 new commands in `lib.rs`.

---

## Tickets

### BACKUP-0 — Google Cloud Console setup + OAuth skeleton
**Priority:** high — **Owner:** TBD — **Status:** code done — end-to-end smoke blocked on real OAuth Client ID (see progress log)
**Files:** `src-tauri/src/drive.rs`, `src-tauri/src/lib.rs`, `Cargo.toml`, `src/components/SettingsModal.tsx`, `src/stores/useStore.ts`, `src/App.tsx`

Create the OAuth client (Desktop app, `drive.file` + `openid` scopes, loopback redirect). Implement PKCE
consent → loopback callback → token exchange → `keyring` storage → `google_account()` / `google_sign_out()`.
Add `shell:allow-open`. Add `drive`, `oauth2`, `keyring`, `rand`, `base64` deps.
**Acceptance:** `cargo check` passes; signing in opens a browser, returns to the app, "Connect" becomes the
account row; account survives a full app restart (refresh token from Credential Manager); sign-out clears it.

### BACKUP-1 — Backup engine + `drive_files` table + sync columns
**Priority:** high, depends on BACKUP-0 — **Owner:** TBD — **Status:** not started
**Files:** `src-tauri/src/drive.rs`, `src-tauri/src/db.rs`, `src-tauri/src/commands.rs`

Schema for `drive_files`; scan/diff/upload loop (`BackupProvider` trait + Drive impl); progress events;
`drive_backup_start/status/cancel`; flip `files.sync_status`/`last_backed_up_at`.
**Acceptance:** `cargo check` + `npx tsc --noEmit` green; unit tests for path→rel_path mapping, hash-diff
skip, and a failure mid-batch leaving `sync_status='error'` with the rest `'synced'`.

### BACKUP-2 — Backup tab UI
**Priority:** medium, depends on BACKUP-1 — **Owner:** TBD — **Status:** not started
**Files:** `src/components/SettingsModal.tsx`, `src/stores/useStore.ts`, `src/types/index.ts`

Settings "Backup" tab: connect/sign-out, vault selection, Backup now + progress + last-backup; `lsn_backup`
persistence.
**Acceptance:** `npm run build` green; manual smoke — sign in, back up two vaults, verify tree +
`appProperties` in Drive UI, edit one file, re-run (only that file re-uploads), delete a local file, re-run
(no remote deletion).

### BACKUP-3 (future) — Auto-backup triggers + Navbar indicator
**Priority:** low — **Owner:** TBD — **Status:** blocked (not started)
Quiet-window auto-backup after autosave and on-close; cloud status dot. No schema change.

### BACKUP-4 (future) — Restore UI
**Priority:** low — **Owner:** TBD — **Status:** blocked (not started)
Folder picker + restore-into-new-folder with `(restored)` name clashes. Adds a `RestoreProvider` method and a
`dialog:allow-save`-style folder pick.

---

## Testing

- **Automated:** `cargo check`; unit tests per ticket acceptance (token refresh round-trip with a mocked
  Google endpoint via `httpmock`; hash-diff skip; path mapping; mid-batch failure status).
- **Manual smoke (release exe):** fresh sign-in; backup two vaults with `excluded_folders`; verify in
  drive.google.com that tree + appProperties are correct; edit → incremental re-upload; delete local → no
  remote delete; kill mid-backup → resumes cleanly on next run (no half-written `drive_files` rows left as
  'synced'); sign out → relaunch → verifies signed-out state.

## Risks / gotchas

- **Rebuild traps:** a running `local-study-notebook.exe` locks Rust build outputs (`os error 32`) — kill it
  before `cargo check`/`build`.
- **Dev vs release loopback:** the ephemeral port must be bound *and* the consent URL built in the same
  process; Windows Firewall may prompt on first bind — keep it loopback-only (`127.0.0.1`, not `0.0.0.0`).
- **`keyring` on headless/CI:** falls back to an in-memory store in tests; never treat "no keyring" as success
  in the shipped app.
- **Rate limits:** `drive.file` uploads are fine for note volumes; still, cap concurrent uploads and do not
  re-upload unchanged files (hash diff is the throttle).
- **`DefaultHasher` portability** — never compare hashes across machines (see Data impacts above).