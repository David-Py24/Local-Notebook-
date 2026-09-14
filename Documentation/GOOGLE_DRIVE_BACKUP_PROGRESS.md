# Google Drive Backup — Progress Log

Date-stamped log of the implementation work for [GOOGLE_DRIVE_BACKUP_PLAN.md](GOOGLE_DRIVE_BACKUP_PLAN.md).
Ticket states in the plan doc are updated here; this file records what was done, deviations from the plan,
verification results, and what is still blocked.

---

## 2026-09-05 — BACKUP-0 (OAuth skeleton): code complete

### Done

- **`src-tauri/src/drive.rs` (new)** — full OAuth 2.0 consent flow + token vault + Drive session state:
  - PKCE (S256) consent flow: 32-byte random verifier → b64url 43-char challenge, random `state`,
    `access_type=offline` + `prompt=consent`.
  - Loopback callback server on an ephemeral `127.0.0.1:<port>` (tiny_http); browser URI opened in the
    system default browser; `state` validated (CSRF) before exchanging the code.
  - Token exchange + refresh via `reqwest::blocking` against Google's token endpoint (public client,
    no client secret).
  - **Refresh token stored only in the OS Credential Manager** (`keyring`, Windows native) under
    service `com.localstudynotebook.app.drive`. Access token is in-memory only. No secrets in SQLite or
    localStorage.
  - Account identity (name/email) decoded from the `id_token`, falling back to the Google userinfo
    endpoint. Only `name`/`email` cross the command boundary.
  - `google_account` / `google_sign_in` / `google_sign_out` (sign-out also revokes the token server-side).
  - Unit tests: PKCE verifier is RFC-7636-valid (43 chars, correct charset); loopback URI is localhost-only.
- **`src-tauri/Cargo.toml`** — added `reqwest` (rustls-tls, json, multipart, blocking), `url`, `keyring`
  (windows-native), `rand`, `base64`, `sha2`, `tiny_http`.
- **`src-tauri/src/lib.rs`** — `mod drive;`, managed `drive::DriveState` (default) at setup, three commands
  registered in `invoke_handler`.
- **Frontend** (`src/stores/useStore.ts`, `src/components/SettingsModal.tsx`, `src/App.tsx`):
  - Store: `GoogleAccount`, `googleAccount`, `backupSigningIn`, and `refreshGoogleAccount` /
    `connectGoogle` / `signOutGoogle` actions (wrappers over the new commands).
  - Settings: new **"Backup & Drive"** tab (between Project and AI). Signed-out → "Connect Google Drive"
    button (disabled + hint while the browser consent is pending; inline error on failure). Signed-in →
    account chip (avatar letter, name, email) + Sign out.
  - App launch: `refreshGoogleAccount()` called once on mount so the signed-in state survives restarts
    (token is restored from the Credential Manager via `google_account`).

### Deviations from the plan (recorded for accuracy)

1. **No `oauth2` crate.** Hand-rolled the PKCE/token/refresh flow over `reqwest::blocking` instead. The
   `oauth2` crate's client is async-only for reqwest in 4.x; Tauri commands here are synchronous and the
   loopback listener (`tiny_http::recv`) is blocking anyway. Hand-rolling removed the runtime bridge.
2. **Commands are synchronous** (not `async`) — blocking calls run on Tauri's blocking thread pool,
   matching the rest of the repo's command style.
3. **`shell:allow-open` capability NOT added.** The plan listed it, but the consent URL is opened *from
   Rust* directly (`cmd /C start` on Windows, `open` on macOS, `xdg-open` on Linux), which bypasses the
   webview permission system. Not adding `shell:allow-open` keeps the webview from being able to invoke
   `shell.open` with arbitrary URLs.
4. **`drive_files` table and `BackupProvider` trait deferred to BACKUP-1** (engine ticket) — BACKUP-0 is
   account plumbing only, per the ticket scope.

### Verification (all green)

- `cargo check` — pass (one pre-existing `dead_code` warning on `db::VaultFile`, unrelated).
- `cargo test --lib drive` — 2/2 pass (PKCE verifier validity, loopback URI).
- `cargo test --lib` — 23/23 pass, including the DATA-5 `upsert_preserves_sync_status_on_update`
  protection and all pre-existing suites. (First two full-suite attempts hit transient
  `LNK1104`/`LNK1201` — Windows file-locks on the test `.exe`/`.pdb` in the OneDrive-synced
  `target\debug\deps`; cleared the stale artifacts and reran clean. Environmental, not code.)
- `npx tsc --noEmit` — pass.
- `npm run build` — pass (existing chunk-size/dynamic-import warnings only).

### Drive-by fix (pre-existing, unrelated)

- `src-tauri/src/commands.rs` — `let rows` → `let mut rows` in the uncommitted Memory-RAG `search_memory`
  function; this was a pre-existing compile error in the working tree that blocked `cargo check`.

### Blocked (next manual action required — cannot be done from code)

- **Real OAuth Client ID.** `GOOGLE_CLIENT_ID` in `drive.rs` is a placeholder. Someone must:
  1. Create/open a project in Google Cloud Console.
  2. Configure the OAuth consent screen (user-support email; scopes resolved at first consent).
  3. Create an OAuth Client ID of type **"Desktop app"**.
  4. Paste it into `GOOGLE_CLIENT_ID` in `src-tauri/src/drive.rs`.
- Then run an end-to-end smoke test (BACKUP-0 acceptance): sign in → browser consent → callback → account
  chip appears → app restart → account restored from Credential Manager → Sign out clears it.

### Notes for the implementer's smoke test

- The consent callback binds `127.0.0.1:<ephemeral-port>`; Windows Defender Firewall may prompt on first
  bind — allow it (loopback-only).
- A cancelled browser flow returns *after 5 minutes* (`CONSENT_TIMEOUT`) — the UI shows "Waiting for Google
  sign-in…" meanwhile.
- Known-incomplete edge: if the stored refresh token is revoked/expired, `google_account` treats the user as
  signed-out (silently ignores the refresh error). To be surfaced as a first-class error in BACKUP-1.
- `DefaultHasher` note from the plan still applies (no cross-machine hash comparison); not touched here.

---

## Next up — BACKUP-1 (backup engine)

Not started. Scope: `drive_files` table, `BackupProvider` trait + Drive upload impl, scan/diff/upload loop,
`drive_backup_start/status/cancel`, progress events, and the first real use of `files.sync_status` /
`last_backed_up_at`. Frontend vault selection + "Backup now" UI (BACKUP-2) follows.