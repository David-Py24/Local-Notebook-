# OpenCode HTTP 500 Fix Report

**Session:** 2026-09-20 · Implements the remediation plan from
`OPENCODE_HTTP500_DIAGNOSIS_PLAN.md`. Symptom being fixed: the assistant panel replied
`OpenCode Agent error: (OpenCode rejected the message (HTTP 500).)` and then suggested
installing the OpenCode CLI — even though the CLI was already installed.

> **Claim:** All workstreams of the remediation plan (A–E) were implemented and every
> local verification gate passed on the day of this report.[^1]

---

## What was actually wrong

1. **The 500's cause was discarded.** `streamOpencodeReply` threw `OpenCode rejected the
   message (HTTP ${status})` and never read the response body, which is where opencode's
   server puts the real reason (provider/model/credential errors surface as generic 5xx).
2. **The UI blamed the install unconditionally.** The catch path in `sendAssistantMessage`
   appended "Confirm the OpenCode CLI is installed (winget install SST.opencode)" for
   *every* OpenCode failure, regardless of `opencodeInstalled`.
3. **The sidecar's stderr was swallowed.** `spawn_opencode_server` redirected stdout/stderr
   to `Stdio::null()`, so provider init failures and config-load errors were invisible.
4. **Port pressure.** Five `opencode serve` processes were live on the developer machine
   (ports 4096–4099 owned by the OpenChamber-bundled CLI, plus earlier app leftovers), so
   the sidecar was deterministically bumped into the same crowded low band every launch.

## What changed

### A — Surface the real failure reason (`src/services/opencodeClient.ts`)
- New `OpenCodeError` (carries `status`, `body`, `category`) and
  `classifyOpenCodeHttpError(status, body)` mapping 401/403/404/5xx + provider-hint regex
  onto `session` / `provider` / `http` categories, embedding the truncated response body.
- `streamOpencodeReply` reads the body on non-OK and throws the classified error.
- The OpenCode path now writes to the opt-in AI debug log (`settings.aiVerboseLogging`):

```text
POST /session/<id>/message -> HTTP 500 (provider) body="provider connection failed: ..."
```

### E — Stop blaming the CLI (`src/stores/useStore.ts`, `opencodeClient.ts`)
- Exported `opencodeFallbackMessage(err, { installed })`: install hint only when
  `opencodeInstalled` is false; provider failures direct to **Settings → AI & BYOK Model**;
  network/session failures direct to **Restart server**.
- Settings modal install line only advertises `winget install SST.opencode` when the CLI is
  actually missing.

### B — Sidecar logs + binary identity (`src-tauri/src/commands.rs`)
- Sidecar stdout/stderr captured to `opencode-server.<port>.log` in the app-data dir
  (removed on a clean kill, truncated on the next spawn of that port).
- `check_opencode_installed` now returns `{ installed, version }`; `OpenCodeSpawn` gains
  `version` — surfaced as `opencodeBinaryVersion` in settings and the start-time debug log.

### D — Fresh-session retry on 5xx (`src/services/opencodeClient.ts`)
- A 5xx on `POST /session/:id/message` is retried **once** against a brand-new session
  (`createOpencodeSession`), reusing model/text. The store adopts the new session id via
  `onSessionRecycled` so subsequent turns stay on the fresh session. Gated by the new
  `settings.opencodeAutoRetry` (default on) and disabled from the Settings toggle.

### C — Port & lifecycle hygiene
- `pick_sidecar_port` (Rust): honors the configured port when free; otherwise jumps to a
  random high band (40000–45000) instead of deterministically walking 4096–4100.
- Window-close now fire-and-forgets `stopOpencodeServer`, so dirty exits stop orphaning
  sidecars.
- New **Restart server** action + button in Settings → OpenCode Agent with a live
  status line (runtime port + binary version).

## Verification

Run from the project root (frontend) and `src-tauri/` (Rust):

```powershell
npx tsc --noEmit          # green
npm run build             # green
npm test                  # 108 passed (13 files), incl. new error-classification + retry tests
cargo check               # green (only pre-existing VaultFile dead_code warning)
cargo test                # 34 passed, incl. 2 new pick_sidecar_port tests
```

Manual smoke checks still recommended before release:
1. Reproduce a provider failure (wrong BYOK model) and confirm the error names the model,
   not the CLI, and that a fresh-session retry is attempted.
2. With a foreign `opencode serve` on 4096, confirm the sidecar lands on a 4xxxx port and
   that `opencode-server.<port>.log` exists in the app-data dir while running.

## Environment note (not app code)

Four `opencode serve` processes from the OpenChamber-bundled CLI
(`...\@openchamberelectron\resources\opencode-cli\opencode.exe`) were hogging ports
4096–4099 during diagnosis. Killing them when unused prevents port pressure:

```powershell
Get-Process opencode | Where-Object Path -match 'openchamber' | Stop-Process -Force
```

Never "fix" the app because a *shell* resolves `opencode` differently — CreateProcess (what
the app uses) only resolves `.exe`, and the WinGet binary resolves first on PATH
(see `OPENCODE_CONNECTION_FIX_SOP.md`).

---

[^1]: Verification evidence, as of 2026-09-20 local time: `npx tsc --noEmit` exited 0;
`npm run build` produced `dist/` with "built in 12.06s"; `npm test` reported
"13 passed (13), 108 passed (108)"; `cargo check` finished the dev profile with only the
pre-existing `VaultFile` dead-code warning; `cargo test` reported "34 passed; 0 failed",
including the two newly added `pick_sidecar_port` tests run in isolation.