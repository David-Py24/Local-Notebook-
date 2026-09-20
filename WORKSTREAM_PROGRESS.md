# Execution Progress — `plan_openchamber_paseo_flaws.md`

Status ledger for the plan execution: workstreams A–E plus the status-doc cleanup. All workstreams
that have run so far are **complete and committed**. The only outstanding item is the **Gate D manual
smoke test** (launch the release exe with a live sidecar / stale foreign lock) — not yet run because it
needs a real GUI window.

Reference docs: `plan_openchamber_paseo_flaws.md` (execution plan), `review_openchamber_paseo_integration.md`
(review + resolution status), `walkthrough_integration.md` (verification results updated).

---

## Baseline

- Reviewed working tree at HEAD `4b35a8b` plus the uncommitted OpenChamber/Paseo upgrade.
- Review found 9 flaws; the two Phase 2 functions (`verifyOpencodeModelCapability`, `rehydrateOpencodeSession`)
  were dead code and the PID lifecycle could kill a recycled/foreign PID.
- `opencode` CLI installed: **1.18.30** (winget). Wire shapes verified against a live `opencode serve`
  on a spike server (PID 98372, killed after the spike):

### Spike-verified wire facts (recorded, do not "fix")
- `GET /provider` → **object** `{ providers: [...], default, connected }` — NOT a bare array. Each
  provider's `models` is a **dict keyed by model id**.
- `POST /session` with `{}` succeeds; **any body field** (`workspaceDir`, `directory`) → `{"_tag":"BadRequest"}`.
  The app previously sent `{ workspaceDir }` — a real bug against 1.18.30.
- `GET /session` → array of session summaries. `GET /session/:id` → session info (no messages).
- `GET /session/:id/message` → **exists, HTTP 200**, `[]` when empty (valid rehydrate read path).
- Bogus-model `POST /session/:id/message` → 500, no message recorded; the live message-object shape was
  **not** probed (avoids a cost-incurring real model call). Relied on documented `{ id, role, parts:[...] }`.

---

## Workstream A — Wire `verifyOpencodeModelCapability` (dead-model pre-check) ✅ GATE GREEN

**Status: completed** (commit `5a36509`).

- `opencodeClient.ts`: replaced the dead `verifyOpencodeModelCapability` with a tri-state
  `ModelPreCheck { known: boolean; ok: boolean }`. Added `providerHasModel(provider, modelID)` tolerant of
  both array-of-objects and dict `models` registries.
- Added `routeModelPreCheck(res, fallbackToByok): "stream" | "byok" | "error"`:
  - confirmed hard miss + fallback on → `"byok"` (routes the turn to the BYOK engine),
  - confirmed hard miss + fallback off → `"error"` (caller throws an actionable `OpenCodeError`),
  - confirmed-ok / unverifiable (`known:false`) → `"stream"` (never blocks on what we can't prove).
- `useStore.ts` `sendAssistantMessage` (OpenCode path): dynamic-imports the pre-check, runs it before
  streaming, applies `routeModelPreCheck`, writes a verbose `append_ai_debug_log` line when
  `aiVerboseLogging` is on, and throws `OpenCodeError(null, "provider", …)` on a confirmed miss.
- Tests: `opencodeClient.test.ts` — hard-miss / pass / dict-shape / unknown-provider / HTTP+network
  failure cases for the pre-check, plus routing decisions.

Gate A: `npm test` 116 passed (13 files), `npx tsc --noEmit` exit 0.

---

## Workstream B — Wire `rehydrateOpencodeSession` (session re-hydration) ✅ GATE GREEN

**Status: completed** (commit `5a36509`).

- **B1 spike** (see baseline): verified `/provider` envelope, `/session` empty-body requirement, and the
  rehydrate read path `GET /session/:id/message`.
- **B2 persistence**: new `agent_sessions.opencode_session_id` column.
  - `db.rs`: `SCHEMA_VERSION` 2 → 3; column in the fresh-CREATE schema and in a guarded
    `current_version < 3` ALTER migration (idempotent via `column_exists`).
  - `commands.rs`: `AgentSession.opencode_session_id`, `SessionPatch.opencode_session_id`, row mapper,
    all SELECT lists, both INSERTs (create/fork), and the test-local schema.
  - `useStore.ts`: `AgentSession.opencodeSessionId`, populated right after `ensureOpencodeReady` succeeds
    and again in `onSessionRecycled` so the id always tracks the live sidecar session.
- **B3 resume wiring**: `setActiveAgentSession` now kicks off `rehydrateActiveSessionFromOpencode()`
  when a session has a stored `opencodeSessionId`, the live sidecar is up, and the local thread mirror
  is empty. Restored history is written to the store, the DB `context` column, and the `lsn_assistant_threads`
  mirror.
- **B4 failure semantics**: re-hydration is best-effort — any network/404/parse error leaves the local
  (possibly empty) thread untouched; it never blocks sending.
- **Wire fixes discovered during B** (both in `5a36509`):
  - `createOpencodeSession` sends `JSON.stringify({})` first, falls back to the `{ workspaceDir }` body for
    older serve builds (the 1.18.30 BadRequest bug).
  - `ensureOpencodeReady` readiness POST sends `{}`.
  - `verifyOpencodeModelCapability` unwraps the `{ providers: [...] }` envelope (accepts bare array too).
- **B5 tests**: envelope-unwrap case, `{}`-first vs legacy-fallback session creation, rehydrate parts→
  transcript mapping + non-OK/network empty results, and a Rust round-trip assertion for the new column.

Gate B: `npm test` 122 passed, `npx tsc --noEmit` exit 0, `cargo test` 34 passed.

---

## Workstream C — Harden the PID lock (Flaw 3 + spawn-sweep subset of Flaw 5) ✅ GATE GREEN

**Status: completed** (commit `2217163`).

- **C1 atomic writes**: `write_opencode_pid_lock` now writes `opencode.pid.<pid>.<n>.tmp` in the app-data
  dir, `File::sync_all()`, then `std::fs::rename` into place. `read_opencode_pid_lock` sweeps leftover
  `opencode.pid.*.tmp` files from interrupted writes.
- **C2 process-identity guard**: `pid_is_opencode(pid)` — Windows `tasklist /FI "PID eq {pid}" /FO CSV /NH`
  with a quoted-CSV image-name parser (`pid_is_opencode_row`), case-insensitive opencode(.exe) match;
  Unix `ps -p <pid> -o comm=`. `kill_opencode_server_internal` refuses to signal any PID that does not
  currently belong to an `opencode` binary — foreign/recycled/exited PIDs get the lock removed, never a taskkill.
- **C3 staleness TTL**: `pid_lock_is_stale` parses `start_time` (`%Y-%m-%dT%H:%M:%S%.3f`, local);
  unparsable or older than `OPENCODE_PID_TTL_SECS = 6h` → stale → lock deleted, never signaled.
- **C4 verified removal**: `taskkill` exit status captured; pid lock removed only on success. On failure
  the lock is kept and an `opencode-server.orphan.<pid>.log` breadcrumb is written in app-data.
- **C5 Unix parity**: non-Windows branch sends single-process `kill -TERM`; the tree-kill asymmetry is
  documented (build is Windows-only per AGENTS.md); Unix identity check via `ps`.

Gate C: `cargo check` clean, `cargo test` 37 passed (new: tasklist-CSV parser, TTL/unparsable predicate,
atomic-write round-trip + tmp sweep).

---

## Workstream D — Exit-hook ordering & spawn-time sweep (Flaws 4 and 5) ✅ GATE GREEN (minus manual smoke)

**Status: completed** (commit `2217163`) except the **manual smoke test** (deferred — needs the GUI).

- **D1 single-shot**: `static OPENCODE_CLEANUP_DONE: AtomicBool` in `lib.rs`; `ExitRequested`/`Exit`
  re-entry is a no-op (`swap(true, SeqCst)` guard).
- **D2 no blocking the event loop**: `cleanup_opencode_on_exit` runs the kill + lock removal on a spawned
  thread and waits via `rx.recv_timeout(3s)` so teardown never hangs on taskkill.
- **D3 spawn-time sweep reorder**: the pre-spawn sweep kills only when `pid_is_opencode` is true **and**
  the lock is not stale; frame reorder is: stale → drop lock + continue; identity check inside
  `kill_opencode_server_internal`; `pick_sidecar_port` still dodges occupied ports, so a foreign server
  is skipped, never killed.
- **D4 ownership**: pid lock removal + managed `opencode.json` export + server-log removal all remain
  inside `kill_opencode_server_internal`, shared by every kill path (exit, stop, restart, sweep).

Gate D: `cargo check`, `cargo test` green. **Manual smoke pending** (see "Remaining work").

---

## Workstream E — EventPipeline & test coverage (Flaws 8 and 9) ✅ GATE GREEN

**Status: completed** (commit `30bfe42`).

- **E1 aims**: new `src/services/eventPipeline.test.ts` — ordered batch flush, flush-on-stop drains the
  queue synchronously, interval teardown when the queue empties, re-arm after a fresh push.
- **E2 bound the queue**: `EventPipeline.push` caps at 500 queued frames; on overflow the oldest slice is
  drained synchronously (SSE-flood defensive bound, keeps the 100ms cadence).
- **E3 latency**: `settle()` post-idle timeout shortened 300ms → 150ms; stream integration tests stay green.
- **E4 coverage**: PID-lock helpers (C), pre-check (A), rehydrate (B), and the EventPipeline suite cover
  the previously-untested Phase 1/2 code.

Gate E: `npm test` 127 passed (14 files), `npx tsc --noEmit` exit 0.

---

## Final cleanup  ✅ COMPLETE

- `walkthrough_integration.md`: Phase 1/2 entries updated with the hardened lifecycle + live wiring
  details; verification block refreshed (14 files / 127 tests, 37 Rust tests).
- `review_openchamber_paseo_integration.md`: added resolution status header naming the fix commits;
  noted the upgrade now has commit-level traceability; version-drift note marked resolved.
- **Version drift**: Settings About now shows `1.5.0`, matching `src-tauri/tauri.conf.json` and
  `CHANGELOG.md`. `package.json`'s `1.0.0` is intentionally not the release version.

---

## Gate D manual smoke test — COMPLETE

**Status: done** (debug binary `src-tauri/target/debug/local-study-notebook.exe`, live app-data in
`%APPDATA%\com.localstudynotebook.app`). All plan smoke items passed:

1. **Close app with a live sidecar → no orphan, `opencode.pid` removed.** Launched the app, sidecar came
   up (observed twice: PIDs 101664 and 96140), sent a clean `WM_CLOSE`, then verified the sidecar was
   taskkilled and the lock deleted both times. Pre-existing orphans (PIDs 93440/97988, foreign provenance)
   were left untouched, as required by the identity guard.
2. **Foreign/stale lock → nothing killed, new server starts.** Planted a foreign `opencode.pid` with a
   fresh timestamp pointing at (a) a dead PID — dropped, no kill; then (b) live PID 4 (`System`) — the
   sweep refused to kill it, spawned a fresh sidecar (PID 96140, port 4096), and rewrote the lock to the
   real server `{"pid":96140,"port":4096,...}`.
3. **Platform contract**: real `tasklist /FO CSV` output validated against `pid_is_opencode_row` —
   `opencode.exe` matches; `powershell.exe`/`System`/`INFO:` none-match rows are rejected.

### Fix found during smoke: App.tsx close-loop race (pre-existing)

`onCloseRequested` re-called `appWindow.close()` **without awaiting `unlisten()`** (`src/App.tsx:46-56`),
so the re-close re-fired the handler → `preventDefault` → infinite close loop → the process never exited
(reproduced twice; the sidecar was still killed by the fire-and-forget `stopOpencodeServer()`, so no
orphan — but the Rust-side exit cleanup could never actually run on exit). Fixed by awaiting the unlisten
before the re-close. Verified: `npm test` 127 passed, `npx tsc --noEmit` exit 0, `npm run build` ok,
exe rebuilt (`cargo clean -p local-study-notebook && cargo build`), and a final launch + `WM_CLOSE`
confirm the process now **exits cleanly**.

## Remaining work

| Item | What | Why deferred |
|---|---|---|
| Optional: kill the two pre-existing foreign `opencode serve` orphans (93440 / 97988) | They predate the PID lock's scope; the identity guard rightly never touches them. `taskkill /PID 93440 /T /F` and `taskkill /PID 97988 /T /F` will clear them. | They are the user's own stray servers; out of the app's ownership model by design. |
| Post-smoke PR/signing | If desired, cut a `v*` tag to trigger `.github/workflows/release.yml` (NSIS + signed update manifest). | Not requested. |

Exit condition for the plan: the Gate D smoke test is complete (all items pass + close-loop fix
verified), the full verification suite is green (`walkthrough_integration.md`: 14 files / 127 frontend
tests, `tsc`/`build` clean) — plan is exited.