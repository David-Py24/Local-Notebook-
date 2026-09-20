# OpenCode HTTP 500 Connection-Improvement Plan

**Session:** 2026-09-20 · Symptom: `OpenCode Agent error: (Error: OpenCode rejected the message (HTTP 500).)`, plus a misleading "Confirm the OpenCode CLI is installed" hint — the CLI was installed.

The 500 fires on `POST /session/:id/message` (resp. `streamOpencodeReply`, `src/services/opencodeClient.ts:347`). The code discards the response body, so the real reason is unknown; the UI then blames the install unconditionally. This plan fixes the diagnosis, the UX, and the environment hygiene.

---

## Live findings (recorded this session)

| # | Finding | Relevance |
|---|---|---|
| 1 | `opencode --version` → `1.18.30`; `where.exe opencode` lists the **WinGet** binary first, then a second **OpenChamber-bundled** CLI (`...\@openchamberelectron\resources\opencode-cli\opencode.exe`). | Two CLIs share one PATH; both share `%USERPROFILE%\.local\share\opencode` (global state). |
| 2 | **Four `opencode serve` processes currently live on ports 4096–4099** (pids 56040/77072/77844/79476), *all* the OpenChamber-bundled binary, started 2:14–2:53 PM. | The configured port 4096 is owned by a foreign server, so the app's sidecar is bumped to 4097–4100+. Other processes also spawn servers frequently. |
| 3 | App spawns the sidecar with `Stdio::null()` on stdout/stderr (`src-tauri/src/commands.rs:1684-1685`). | Every server-side error (provider auth, bad model ref, config load, storage lock) is invisible. |
| 4 | `streamOpencodeReply` on `!res.ok` builds `OpenCode rejected the message (HTTP ${res.status})` and **never reads `res.body`** (`opencodeClient.ts:346-347`). | The 500's actual message lives in the body and is discarded. |
| 5 | Catch block in `sendAssistantMessage` routes **every** OpenCode error to the same install hint (`src/stores/useStore.ts:2585-2589`) even though `opencodeInstalled` is true. | The message you saw is a UI bug, not an install problem. |

### Ranked hypotheses for why `POST /session/:id/message` returns 500

1. **Provider/model failure inside the sidecar** (most likely): the `model: {providerID, modelID}` ref from `resolveOpencodeModel` points at a model the provider rejects, or the credential env var wasn't injected (e.g. model set but `aiApiKey` blank / provider mismatch in `startOpencodeServer`, `useStore.ts:2720-2732`). OpenCode's server wraps provider errors as HTTP 500.
2. **Picked-model routing**: a previous dirty `opencode.json` export or a foreign server on the runtime port. `find_free_port` probes then the child binds — a small TOCTOU race when several `opencode serve` (ours or the user's) are spawning near each other.
3. **Shared global-state corruption / lock**: both CLIs (WinGet + OpenChamber) write the same `~/.local/share/opencode`. If the OpenChamber servers hold/rewrite state while our sidecar runs, session persistence can 500.
4. **Stale/corrupt session**: a prior message left the session in a bad state; every subsequent POST to that session 500s until a fresh session is created.

---

## Workstream A — Surface the real failure reason (TS, `src/services/opencodeClient.ts`)

1. On `!res.ok`, read the body and embed it:
   - Wrap the `fetch` JSON/text body in the thrown `Error`, e.g. `OpenCode rejected the message (HTTP 500): {"error": {...}}` (truncate ~500 chars).
   - Keep the footer hint (session.error / SSE "Lost connection") but append `lastHttpStatus`/`lastHttpBody` to the available info for logging.
2. Log to the existing debug log (opt-in, `append_ai_debug_log` via `invoke`) with the pattern from `src/services/aiProvider.ts:14-18`: log the request (sessionId, port, model ref, message length) and the failure (status, body, elapsed ms). Currently the OpenCode path has **no** debug-log wiring at all.
3. Add a small helper `describeOpenCodeHttpError(status, body)` that maps common cases to a readable reason:
   - 400/422 → request-shape/body problem (surface body).
   - 500 with provider-looking body (auth / model not found / connection) → surface it verbatim and mark it "provider/model" so Workstream E can branch.
   - Connection refused/401 on probe → "server not reachable" (existing path).
4. Unit tests in `opencodeClient.test.ts`: body is included in the thrown error; long bodies truncated; classification output.

## Workstream B — Capture external diagnostics (Rust, `src-tauri/src/commands.rs`)

1. **Stop swallowing the child's stderr.** In `spawn_opencode_server`, redirect stdout+stderr to an append-only log in the app-data dir (`opencode-server.<pid>.log`, resolved via the same pattern as `ai_debug_log_path`, `commands.rs:1803-1810`). This is where OpenCode prints provider init failures and config-load errors — exactly what a 500's body may not contain.
2. Return/append the spawned binary's path and version in `OpenCodeSpawn` (`commands.rs:1625-1630`) so the frontend can detect WHICH opencode is serving and log a mismatch if PATH order changes.
3. On `kill_opencode_server`, also scrub orphaned log files older than N days (hygiene, non-blocking).
4. Extend `check_opencode_installed` (`commands.rs:1615-1623`) to also return the resolved `--version` string so the store knows the binary it is talking to (pairs with A.3's classification).

## Workstream C — Port & orphan hygiene (Rust + store)

Root cause of recurring port pressure: foreign/own `opencode serve` processes pile up (four live today), so every launch jumps to a higher port and the reserved range runs out over repeated dirty exits.

1. **Claim a random high port at spawn instead of always walking from 4096.** Start from a random base in `40000..45000`; keep `find_free_port` logic for safety. Avoids deterministic collisions with the user's/OpenChamber's servers on 4096-4099.
2. **Clean up own orphans on startup.** Before spawning, scan process list for `opencode` processes whose command line matches our spawn signature (`serve --port <our runtime port>`) with a pid NOT recorded as child — kill before starting. Leverage the new server log file names to fingerprint our own children.
3. **Make `stopOpencodeServer` robust on unclean app exit**: on `beforeunload`/window-close flush the store already runs; ensure it awaits `kill_opencode_server` (check existing flush path in `App.tsx` re: `useStore` window-close save flush) so a quit doesn't leak another sidecar.
4. (Optional) Add a Settings → OpenCode Agent action **"Restart server (new session + fresh port)"** that kills the child, wipes the managed `opencode.json` export, and re-spawns — a one-click recovery for the "corrupt session" case.

## Workstream D — Session self-healing on 5xx

500s are frequently transient (provider hiccup) or tied to a poisoned session (hypothesis 4). Before bailing to BYOK:

1. In `streamOpencodeReply`, treat a 5xx (500/502/503) as **retryable**: after the current SSE `pump` fails/rejects, retry the POST up to 1 time on a **fresh session** (`POST /session` → new id), reusing the same model ref and text. Only if the fresh session also 500s, propagate the error.
2. Add the new-session attempt count + outcome into the thrown error text and the debug log so the user sees "retried on a new session".

Trade-off: a full second provider round-trip costs time. Gate it behind `settings.opencodeAutoRetry !== false` (new settings key, persisted in `lsn_settings`). Document the knob in SettingsModal.

## Workstream E — Error UX: stop blaming the install (`src/stores/useStore.ts`)

1. Branch `fallbackMessage` (lines 2585-2589) on `get().opencodeInstalled` **and** the classified error from A.3:
   - `opencodeInstalled === false` → keep the winget install hint (only then is it truthful).
   - `opencodeInstalled === true` and provider/model-classified error → "The OpenCode sidecar failed to reach/use your model (`<reason>`). Check **Settings → AI & BYOK Model** credentials/model name, then Restart the server." plus "Open a fresh session".
   - Port/foreign-server errors → guidance to Settings → OpenCode Agent (Restart server / change port), matching `OPENCODE_CONNECTION_FIX_SOP.md`.
2. Add an inline "View server log" affordance (path from `get_ai_debug_log_path` + the new per-process server log) in the error banner or Settings → OpenCode Agent tab.
3. When the engine already fell back to BYOK, keep the engine badge truthful (already the case via `servedBy`).

## Verification checklist

```powershell
# environment hygiene (before re-testing)
where.exe opencode          # expect WinGet first; note the OpenChamber second entry
Get-NetTCPConnection -LocalPort 4096-4099 -State Listen   # confirm no foreign servers
# kill foreign opencode serve processes if the user doesn't need them:
# Get-Process opencode | Where Path -match 'openchamber' | Stop-Process -Force

# app-level smoke test
npm run build && npx tsc --noEmit && npm test            # frontend green
cargo check && cargo test                                 # rust green (find_free_port tests)
# Manual: ask a tool-requiring question with the process killed; then with a
# deliberately wrong model name and confirm the NEW error names the model, not the CLI.
```

## Re-verify in priority order

1. Reproduce the 500; read `ai-debug.log` + `opencode-server.<pid>.log` → confirm which hypothesis; if OpenChamber servers flood the port range, note whether their shared `~/.local/share/opencode` corrupts our session state (hypothesis 3) before coding Workstream C.
2. Land A → re-test (real reason surfaces).
3. Land E → re-test (no more install hint when binary present).
4. Land B → capture logs; then D (retry on fresh session) and C (port/orphan hygiene).

## Don't-fix anchors (carry-over from `OPENCODE_CONNECTION_FIX_SOP.md`)

- Never "fix" the app because *a shell* resolves `opencode` poorly; CreateProcess only resolves `.exe`, and the WinGet binary is first.
- Keep `opencodeServerPort` (Zustand runtime value) authoritative everywhere; configured `opencodePort` stays a fallback.
- Never write BYOK keys to disk; env-injection into the child only.
- Preserve `message.part.updated`, `properties.info`, top-level `model: {providerID, modelID}` wire facts.