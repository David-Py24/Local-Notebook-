# Review — OpenChamber & Paseo Integration (walkthrough_integration.md)

Reviewed against the working tree at HEAD `4b35a8b` plus uncommitted changes. Verification re-run:
`npx tsc --noEmit` (exit 0), `npm test` (13 files / 108 tests, 3.25s), and a source walk of
`src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src/services/opencodeClient.ts`, `src/stores/useStore.ts`.

> **Status update (all resolutions landed in commits `5a36509`, `2217163`, `30bfe42`):**
> every flaw below is fixed and gated green — see `plan_openchamber_paseo_flaws.md`. Final state:
> frontend `npm test` 14 files / 127 tests, `npx tsc --noEmit` exit 0, `cargo test` 37 tests, `cargo check`
> clean. Both Phase 2 features are now live (model pre-check routes stream/byok/error; session history
> re-hydrates on resume from a persisted `opencode_session_id`), the PID lifecycle only ever signals a
> verified `opencode` process under a non-stale lock, and the exit cleanup is single-shot on a bounded thread.

## Bottom line

Phase 1 (PID lock, process-tree kill, exit hook) is real and wired, but has a **process-identity gap**
that can kill an unrelated process, and it is not actually "atomic" as claimed. Phase 2 is **only half
wired**: `EventPipeline` is live, but **`verifyOpencodeModelCapability` and `rehydrateOpencodeSession`
are dead code — exported but never called anywhere in `src/`** — so the walkthrough's claims that they
"prevent streaming sessions with invalid models" and "re-hydrate on resume" are not true in the running app.

The reported verification numbers are accurate. The whole upgrade was **uncommitted** — `HEAD` predates it,
so there was no commit-level traceability (now added: commits `5a36509`, `2217163`, `30bfe42`).

## What was verified as accurate

| Claim | Result |
|---|---|
| `npx tsc --noEmit` PASSED | Confirmed (exit 0). |
| `npm test` "13 files / 108 tests" | Confirmed (13/108). |
| EventPipeline wired into `streamOpencodeReply` | Confirmed at `opencodeClient.ts:570`. |
| `/F /T` tree kill on Windows | Confirmed at `commands.rs:1912-1916`. |
| Spawn-time orphan cleanup | Confirmed at `commands.rs:1724-1726`. |
| Exit hook on `ExitRequested` + `Exit` | Confirmed at `lib.rs:102-104`. |
| Model ref passed on `POST /session/:id/message` | Confirmed at `opencodeClient.ts:616-623`. |

## Flaws found

### 1. [HIGH] `verifyOpencodeModelCapability` is dead code — pre-validation does not run
`opencodeClient.ts:295` exports it; a full-tree search finds **no callers** in `src/` (only the definition
and its docstring). Nothing gates `streamOpencodeReply` or the store on it, so the walkthrough's claim
discussed above never executes. It is aspirational scaffolding, not a live feature.

### 2. [HIGH] `rehydrateOpencodeSession` is dead code — session re-hydration does not run
`opencodeClient.ts:324` also has **no callers**. `ensureOpencodeReady` (`useStore.ts:2798-2830`) recovers by
POSTing a brand-new `/session`, not by hydrating history. If this were wired it would still likely silently
no-op:

- It issues `GET /session/:id/message`, but that route is only ever used as a **POST** in the verified live
  code (`opencodeClient.ts:616`). A GET on it is not a shape any working code path uses and is expected to
  return 404 — the function maps any non-OK to `[]`, so recovery would be invisible.
- The response mapper assumes bare `{id, role, parts[]}` objects and never filters out the user's own echoed
  message (unlike the SSE pump, which filters by role), so re-hydrated text would include the user's prompts
  and the mapping shape is unverified against the real wire format.

### 3. [HIGH] PID lock is neither atomic nor a true lease — and cleanup trusts the PID blindly
The walkthrough's "Atomic opencode.pid File Lease" claim is not met:

- **Not atomic**: `write_opencode_pid_lock` (`commands.rs:1879`) is a plain `std::fs::write` of a JSON
  string — no temp-file + rename, no advisory file lock. Two app instances can interleave writes;
  last-writer-wins. The first instance's exit hook then kills the second instance's sidecar.
- **No process-identity check**: `cleanup_opencode_on_exit` (`commands.rs:1948`) and the spawn-time orphan
  sweep (`commands.rs:1724`) run `taskkill /F /T` on whatever PID the file holds, without verifying the
  process is actually `opencode` (exe name, command line containing `serve`, or port bind). If a crash left a
  stale lock and the OS later recycled that PID to an unrelated process — realistic — the app force-kills that
  process tree on next launch and on every exit.
- **`start_time` and `port` are write-only**: `read_opencode_pid_lock` returns them but nothing reads them.
There is no staleness heuristic ("lock older than X -> ignore, don't kill"), so the record cannot
distinguish a live server we own from a recycled-PID orphan.

### 4. [MED] Exit hook fires twice and blocks the main thread during shutdown
`lib.rs:102` matches both `RunEvent::ExitRequested` and `RunEvent::Exit`, so `cleanup_opencode_on_exit`
runs twice (two `taskkill` spawns; idempotent in effect but wasteful). It also blocks the Tauri event loop
thread while `taskkill` completes synchronously; if that call ever hangs, app teardown hangs. Each event
should run it exactly once (e.g. run on `ExitRequested` only, or guard with an `AtomicBool`).

### 5. [MED] Spawn-time orphan sweep destroys the previous sidecar before the new spawn succeeds
If `spawn_opencode_server` reads a stale lock and kills the recorded PID, then the new spawn fails (port
band exhausted, `opencode` binary missing, config write error), the still-good previous server, its log, and
its managed `opencode.json` are already gone with no rollback path. Reorder: validate that the recorded PID
is actually ours and alive before killing, and only kill after the new spawn has proven the port/command
are viable.

### 6. [LOW] Kill-result is unchecked and the lock file is removed unconditionally
`kill_opencode_server_internal` ignores `taskkill`'s exit status and `remove_opencode_pid_lock` deletes the
record regardless. If `taskkill` fails (permission, elevated process, wrong-PID), the lock vanishes and the
orphan loss is silent. Consider only removing the lock when the kill actually succeeded.

### 7. [LOW] Non-Windows branch kills one process, not the tree
`commands.rs:1920-1924` uses `kill -TERM <pid>` (single process) while Windows uses `/T` (tree). In the
intended Windows-only NSIS build this is dead, but the asymmetry is a latent portability bug and
`kill -TERM` with no `-p` wait leaves the same identity gap.

### 8. [LOW] EventPipeline trade-offs and missing direct tests
- Adds up to ~400ms of latency to message completion (100ms batch flush + 300ms `settle()` timer in
  `opencodeClient.ts:469-472`), on every message, for every engine path using `streamOpencodeReply`.
- The queue is unbounded; a flood of SSE frames grows memory without backpressure (minor, but a fast
  tool loop can push many frames per interval).
- No unit test asserts coalescing semantics (batch ordering, flush-on-stop, timer teardown on empty queue).
  The stream tests cover it indirectly, but a dedicated `EventPipeline.test.ts` would catch regressions.

### 9. [INFO] No tests cover any Phase 1 / Phase 2 addition
`find_free_port` tests pre-exist; the PID-lock helpers, `cleanup_opencode_on_exit`, `verifyOpencodeModelCapability`,
`rehydrateOpencodeSession`, and `EventPipeline` all have zero direct coverage — hence the dead code and the
identity bugs below passing unnoticed.

## Recommended fixes (priority order)

1. Wire or delete the two dead Phase 2 functions. If kept, correct `rehydrateOpencodeSession` to use a
   verified read endpoint and filter to `role === "assistant"`; make `verifyOpencodeModelCapability` fail
   closed (return false on unverified responses) after confirming opencode's `/provider` `models` shape
   (it is likely an array of model objects, not a `{id -> model}` map — the current lookup would false-negative).
2. Harden the PID lock: verify process identity before killing (Windows: `taskkill /IM opencode.exe` or match
   the exe path via toolhelp; also reuse the recorded port for a liveness probe), add a staleness TTL on
   `start_time`, and make writes atomic (temp file + rename).
3. Run the exit hook once, off the event-loop thread (spawn and don't wait, or use a short-lived thread).
4. Move the orphan sweep after spawn validation so a failed spawn never destroys the previous good server.
5. Add tests: `EventPipeline` coalescing, PID-lock identity/staleness, and the two Phase 2 functions.

## Additional note (pre-existing, not this upgrade)

AGENTS.md flagged a version drift: `src-tauri/tauri.conf.json` said `1.5.0`, Settings About showed
`1.4.0`, and `package.json` is `1.0.0`. **Resolved** during this execution: Settings About now shows
`1.5.0` (matching `tauri.conf.json` and `CHANGELOG.md`); `package.json`'s `1.0.0` is intentionally not
the release version.