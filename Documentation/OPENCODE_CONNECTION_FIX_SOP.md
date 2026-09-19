# Fixing the OpenCode ↔ App Connection: Post-Mortem & Reusable Playbook

**Session:** 2026-09-19 (all fixes landed in one working session; uncommitted at
writing time alongside the Agentic Orchestration work). The OpenCode integration
itself shipped earlier in commit `78e0376` (2026-09-14).

This doc records **what actually broke**, in what order, and the exact mechanism
of each fix, so a future project can either avoid the same three traps or fix
them in minutes instead of hours. The three bugs are independent failure modes
that can all present as the same generic UI error.

---

## Symptom history (diagnose by the error text, not the banner)

| Order | UI error you saw | Real root cause |
|---|---|---|
| 1 | *"OpenCode server is not responding"* | A **foreign/stale `opencode serve`** already owned the configured port (4096); our child silently failed to bind, and our readiness probe was 401-ing against the *other* server. |
| 2 | tool loop works but model replies "I can't use tools" | The sidecar was launched with **no `model` ref**, so OpenCode used its own default model, which routes to an OpenRouter endpoint **without tool support** (tool-compatibility filter → zero tools). |
| 3 | `opencode --version` fails **in a terminal** (cmd/PowerShell) | A broken global **npm shim** (`opencode-ai`, postinstall never run → 479-byte stub `opencode.exe`) shadowed the real WinGet binary **for shell resolution only**. |

> **Critical nuance:** Bug 3 is *not* a bug in the app. The app resolves
> `opencode` through `std::process::Command::new("opencode")` (Rust → Win32
> **CreateProcess**), which only resolves real executables (`.exe`) — it ignores
> `.cmd`/`.ps1`/extension-less shims, and the npm dir had no `opencode.exe`. So
> the app was already calling the real WinGet binary. The npm shim only breaks
> interactive shells and any tooling that goes through `cmd.exe`. Do **not** go
> "fixing" the app because a terminal says `opencode` is broken.

Proof collected that session, in order:
- `where.exe opencode` → npm shims listed **before** the WinGet path (shadowing confirmed for shells).
- `cmd /c opencode --version` → error *"not compatible with this version of Windows"* (the stub).
- `Process.Start("opencode")` with `UseShellExecute=$false` (same CreateProcess semantics as Rust) → exit `0`, printed `1.18.21` (the real binary). **This is why app detection never failed.**

---

## Fix 1 — Port collision (Rust, `src-tauri/src/commands.rs`)

**Problem:** `opencode serve --port 4096` was spawned, but if 4096 was already
taken by a stale/foreign server the child bound nothing and the probe would 401
against the *other* server instead of failing clearly.

**Fix:**
- New `find_free_port(start: u16)` — probe-binds `127.0.0.1` at `start` and walks
  up +50 until one binds (`commands.rs:1637`). TcpListener::bind succeeding means
  nothing is listening there.
- `spawn_opencode_server` now returns **`OpenCodeSpawn { pid, port }`** — the port
  actually bound, which may differ from the requested one.
- The frontend store keeps the runtime port as `opencodeServerPort` (Zustand, not
  localStorage). **Every** consumer uses `opencodeServerPort ?? settings.opencodePort`:
  readiness probing, SSE streaming, and the orchestrator (`agentOrchestrator.ts:104-111`).
- Unit test `find_free_port_skips_occupied_ports` (`commands.rs:2789`).

**Rule for future projects:** never let a *configured* port be authoritative for
a sidecar that can collide. Bind, detect the real port, and plumb it through the
whole component tree — config value is only the fallback.

---

## Fix 2 — Model routing to a tool-capable model (TS, `src/services/opencodeClient.ts`)

**Problem:** our managed `opencode.json` exported into the vault set no `model`.
OpenCode's own default resolved to an OpenRouter endpoint whose model has **no
tool support**, so the sidecar reported zero usable tools while the UI looked
healthy.

**Fix:**
- `PROVIDER_ID_MAP`: app BYOK labels → OpenCode provider IDs
  (`openai→openai`, `anthropic→anthropic`, `gemini→google`,
  `openrouter→openrouter`, `ollama_hermes→ollama`, `ollama→ollama`).
  `gemini→google` is load-bearing — OpenCode's provider key for Google is `google`,
  not `gemini`.
- `resolveOpencodeModel(settings)` → `{ providerID, modelID } | null`
  (`opencodeClient.ts:86`). Returns `null` if the provider is unmapped or the
  model name is blank/whitespace — caller must keep the previous behavior.
- `streamOpencodeReply` accepts an optional `model` and includes
  `...(model ? { model } : {})` in the `POST /session/:id/message` body, matching
  `PromptInput`'s `ModelRef` shape (`providerID`, `modelID` at the **top level**,
  not under `auth`/`provider`).
- Wired into both OpenCode paths: `sendAssistantMessage` (store) and
  `agentOrchestrator.ts:104-111` (session send with per-message model override).
- Covered by `opencodeClient.test.ts` (provider mapping, trimming, `null` cases).

**Rule:** when you bridge two AI stacks, the sidecar's *default* model is
whatever its own config picks — never assume it matches your BYOK model or that
a provider is tool-capable. Push the model explicitly per message, and map
provider **names** (they are case-insensitive labels) to provider **IDs** (they
are opaque keys of the target system).

---

## Fix 3 — Broken npm shim shadowing (no code change; CLI hygiene)

**Problem:** `npm i -g opencode-ai` left a stub `bin\opencode.exe` (479 bytes)
that only echoes *"opencode-ai's postinstall script was not run"* and exits 1.
npm created `opencode`, `opencode.cmd`, `opencode.ps1` shims that shadowed the
real `SST.opencode` WinGet binary in **shells** (cmd/PowerShell resolve
`.cmd`/`.ps1`).

**Why the app never cared:** CreateProcess resolves `.exe` only; the npm dir had
no `opencode.exe` in PATH position before WinGet's. Verified live with
`Process.Start`.

**Fix (system level, one-time):**
```powershell
npm uninstall -g opencode-ai
Remove-Item "C:\Users\Ghing\AppData\Roaming\npm\node_modules\.opencode-ai-*" -Recurse -Force
# verify:
opencode --version        # -> 1.18.21, exit 0
where.exe opencode        # -> WinGet path first, no AppData\Roaming\npm entry
```
Do **not** reinstall via npm; OpenCode's Windows install is `winget install SST.opencode`.

---

## Reusable verification checklist

```powershell
# 1. Real binary resolves in shell (no shim shadowing)
where.exe opencode
opencode --version

# 2. CreateProcess semantics (what the app actually does)
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "opencode"; $psi.Arguments = "--version"; $psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
$p = [System.Diagnostics.Process]::Start($psi); $p.WaitForExit(15000) | Out-Null
"exit=$($p.ExitCode) out=$($p.StandardOutput.ReadToEnd().Trim())"

# 3. Sidecar spawn + model override (manual smoke test in app)
#    - Settings → OpenCode Agent → set port 4097, start, watch readiness use the
#      reported port, not the config value.
#    - Ask a question that must call a tool; confirm the tool call fires, proving
#      the model ref carried tool support.
```

---

## Memory anchors (facts to not "fix" later)

- Windows OpenCode install: `winget install SST.opencode` (package id is NOT `OpenCode.OpenCode`).
- OpenCode provider key for Google is `google`; env var is `GOOGLE_GENERATIVE_AI_API_KEY`.
- SSE streaming event: `message.part.updated`.
- `resolveOpencodeModel` maps BYOK **labels** → OpenCode **IDs**; the POST body
  uses top-level `model: { providerID, modelID }`.
- Sidecar env auth: `OPENCODE_SERVER_PASSWORD`, user `opencode`, Basic auth over localhost.
- The npm `opencode-ai` shim affects **shells only** — never "fix" the app's
  CreateProcess path for it.
- Runtime port truth lives in Zustand (`opencodeServerPort`), not settings.