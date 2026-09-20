# Plan — Wire the OpenChamber/Paseo Scaffold & Fix Review Flaws

Derived from `review_openchamber_paseo_integration.md`. Objective: turn the two dead Phase 2 functions into
live, verified features, and harden the Phase 1 PID lifecycle so cleanup never touches a process we do not own.
Work lands in the current working tree; each workstream commits after passing its gate.

References: `src/services/opencodeClient.ts`, `src/stores/useStore.ts`, `src-tauri/src/commands.rs`,
`src-tauri/src/lib.rs`, `src/services/opencodeClient.test.ts`, plus a live `opencode serve` for wire-shape checks.

---

## Workstream A — Wire `verifyOpencodeModelCapability` (Flaw 1)

**A1. Fix the validation to match the real wire shape.** Confirm the `/provider` response shape against a live
`opencode serve` (per AGENTS.md: verify at runtime, record the shape in a comment). Current code
(`opencodeClient.ts:295-318`) assumes `models` is a `{modelID -> model}` map, which will false-negative if it is
an array of `{id, name, ...}` objects. Make the lookup tolerant of both:

```ts
function providerHasModel(provider: unknown, modelID: string): boolean | null {
  if (!provider || typeof provider !== "object") return null;
  const models = (provider as { models?: unknown }).models;
  if (Array.isArray(models)) {
    return models.some((m: { id?: string }) => (m && m.id) === modelID);
  }
  if (models && typeof models === "object") {
    const map = models as Record<string, unknown>;
    return modelID in map;
  }
  return null; // shape unknown -> "unknown", not "missing"
}
```

Return a tri-state `{ known: boolean; ok: boolean }`: `known:false` when the provider is absent from the list,
the list failed to parse, or the fetch errored. Never report a hard miss on an unverifiable state.

**A2. Wire it into `sendAssistantMessage`** (`useStore.ts:2495-2500`), between `resolveOpencodeModel` and the
`streamOpencodeReply` call:

- `ok === false` (confirmed missing) and `settings.opencodeFallbackToByok` -> route to the BYOK engine (reuse
  the existing `servedBy = "byok"` flow).
- `ok === false` and no fallback -> throw the existing actionable `FreeTierError`-style message ("model X not
  offered by provider Y on this sidecar - check AI & BYOK Model").
- `known === false` -> proceed (never block on an unverifiable state); emit a `logDebug` line so the case is
  visible in verbose logs.

**A3. Tests.** Mocked-fetch unit tests in `opencodeClient.test.ts`: array-of-models shape -> hard miss; dict
shape -> hard miss; provider absent -> `known:false`; fetch 500 -> `known:false`. Plus a store-level test
asserting the fallback routing when `ok === false`.

**Gate A:** `npm test`, `npx tsc --noEmit`.

---

## Workstream B — Wire `rehydrateOpencodeSession` (Flaw 2)

Re-hydration matters when the sidecar holds history the app never captured (crash mid-run, server-side runs via
scheduled tasks / mcp_bridge). It needs to know *which* opencode session backs *which* agent session — the app
persists the transcript but the opencode session id is in-memory only and recreated each launch.

**B1. Verify the read path (spike).** Check from a live `opencode serve` whether `GET /session/:id/message`
exists and its shape, or how history is otherwise exposed (a `GET /session` list, or `/event` replay). Record the
finding in `opencodeClient.ts`. If no reliable read path exists, keep the function but treat local persistence
as truth and re-hydration as best-effort (B4).

**B2. Persist the opencode session id.** Add `opencode_session_id` to the agent-session model: new `sessions`
column (`db.rs` migration) + `AgentSession` field (`commands.rs:2005-2023`) + store wiring. Populate it at
`ensureOpencodeReady` creation and in `onSessionRecycled` (`useStore.ts:2512`).

**B3. Wire into resume.** In the store's session-activation path (the `handleResumeSession` /
`setActiveAgentSession` flow), when a resumed agent session has a stored `opencode_session_id` and the local
thread copy is absent/empty, call `rehydrateOpencodeSession(port, password, id)` and rebuild `assistantMessages`.
Dedupe by message id, skipping anything already in the local mirror. Filter to `role === "assistant"` client-side
regardless of server shape.

**B4. Failure semantics.** On any network/404/parse error, fall back to the local mirror (current behavior) and
flag `opencodeStatus` so server history unavailability is visible. Never block message sending on re-hydration.

**B5. Tests.** Unit tests for the mapping/merge and assistant-role filter (extract a pure helper), plus an
integration-style test with mocked `fetch` for the round-trip.

**Gate B:** `npm test`, `npx tsc --noEmit`, `cargo test` (db migration + AgentSession serialization).

---

## Workstream C — Harden the PID lock (Flaw 3, plus the spawn-sweep subset of Flaw 5)

**C1. Atomic writes.** `write_opencode_pid_lock` (`commands.rs:1879`): serialize to `opencode.pid.<pid>.<n>.tmp`
in the same dir, `File::sync_all()`, then `std::fs::rename(tmp, pid_path)` (atomic on the same volume). Clean up
leftover `opencode.pid.*.tmp` files on read.

**C2. Process-identity guard.** New helper:

```rust
/// Windows: `tasklist /FI "PID eq {pid}" /FO CSV /NH`, exe-name field "opencode(.exe)",
/// matched case-insensitively. False if the row is absent or the name differs.
fn pid_is_opencode(pid: u32) -> bool
```

**Kill only when `pid_is_opencode` returns true.** When the recorded PID is not ours (recycled / foreign / gone),
call `remove_opencode_pid_lock` only — never `taskkill`. `cleanup_opencode_on_exit` (`commands.rs:1948`), the
spawn-time sweep (`commands.rs:1724`), and `kill_opencode_server_internal` (`commands.rs:1909`) all consult it
before issuing the kill.

**C3. Staleness TTL.** Parse `lock.start_time` (ISO from `now_iso()`); if unparsable or older than a TTL const
(`OPENCODE_PID_TTL`, 6h), treat as stale: delete the lock, do not kill. Covers PID-reuse windows and long-crashed
runs.

**C4. Verified removal.** Capture `taskkill`'s exit status; remove the pid lock only when the kill succeeded. On
failure keep the lock and write a line to the opencode server log so the orphan stays traceable. `kill_opencode_server_internal`
currently ignores status and deletes unconditionally (`commands.rs:1927-1929`).

**C5. Unix parity.** Non-Windows branch sends plain `kill -TERM <pid>` (single process, no tree). Either walk
`/proc/<pid>/task` children for a tree signal, or document the asymmetry with a comment (build is Windows-only).

**Gate C:** `cargo check`, `cargo test` (new helpers: pid-is-opencode parser, TTL predicate, atomic write
round-trip with tmp leftovers).

---

## Workstream D — Exit-hook ordering & spawn-time sweep (Flaws 4 and 5)

**D1. Single-shot cleanup.** `lib.rs:102` runs cleanup on both `ExitRequested` and `Exit`. Add
`static OPENCODE_CLEANUP_DONE: AtomicBool` and run the body once (compare_exchange). Idempotent and safe for both
events, no duplicated `taskkill`.

**D2. No blocking the event loop.** `cleanup_opencode_on_exit` runs `taskkill` synchronously on the main thread
during teardown. Spawn a detached thread for the kill + lock removal and join with a short timeout (or fire the
guard first so `Exit` re-entry is a no-op).

**D3. Spawn-time sweep reorder.** Before spawning, only kill the recorded PID when *both* `pid_is_opencode` is
true *and* the TTL is not exceeded. Otherwise just remove the stale lock and continue — `pick_sidecar_port`
(`commands.rs:1684`) already dodges occupied ports, so a foreign server is skipped, never killed. This keeps the
"free our leftover port first" behavior without the destructive risk, and a failed new spawn no longer destroys
a still-good previous sidecar.

**D4. Keep cleanup ownership.** The pid lock, managed `opencode.json` export and server log removal stay inside
`kill_opencode_server_internal` so every kill path (exit, stop, restart, sweep) behaves identically.

**Gate D:** `cargo check`, `cargo test`, manual smoke: close the app with a live sidecar -> no orphan process;
spawn with a stale lock pointing at a non-opencode PID -> nothing killed, new server starts.

---

## Workstream E — EventPipeline & test coverage (Flaws 8 and 9)

**E1. Direct `EventPipeline` tests** (new `opencodeClient` file or `eventPipeline.test.ts`): ordered batch flush,
flush-on-stop drains the queue, timer teardown when the queue empties, re-arm after new push.

**E2. Bound the queue.** Cap at ~500 frames with a sync drain of the oldest slice on overflow (defensive; avoids
unbounded memory under an SSE flood). Keep the 100ms cadence.

**E3. Latency check.** `settle()` waits 300ms after idle (`opencodeClient.ts:469-472`), so every message resolves
~400ms late. Shorten to 150ms if the stream tests still pass green.

**E4. Coverage for the rest of this plan.** PID-lock helpers (C), `verifyOpencodeModelCapability` (A3),
`rehydrateOpencodeSession` (B5), and the identity/staleness predicates are all new tests — the original review
flagged that no Phase 1/2 code had direct coverage.

**Gate E:** `npm test`, `npx tsc --noEmit`.

---

## Execution order & gates

| Order | Workstream | Gate |
|---|---|---|
| 1 | A (wire pre-validation) | npm test + tsc |
| 2 | B (wire re-hydration) | npm test + tsc + cargo test |
| 3 | C (PID lock) | cargo check + cargo test |
| 4 | D (exit hook + sweep) | cargo check + manual smoke |
| 5 | E (pipeline tests) | npm test + tsc |

Commit after each gate. After 1-5, re-run the full verification suite from `walkthrough_integration.md` and
update that doc (plus the review file's status) to reflect that the two Phase 2 features are now live and the
PID lifecycle is hardened. Also resolve the known version drift (`tauri.conf.json` 1.5.0 vs About 1.4.0) while
touching config-affecting code.