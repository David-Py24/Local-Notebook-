# OpenRouter Integration Hardening Pass — Implementation Report

**Project:** Local Study Notebook
**Date:** 2026-09-04
**Scope:** Stabilize/harden the already-shipped BYOK OpenRouter integration (commit `cf314ee`) — no rewrite, no new providers.
**Related docs:** [diagnostic_report.md](diagnostic_report.md), [solution_report.md](solution_report.md), [AI_Provider_and_Agent_Wiring_SOP.md](AI_Provider_and_Agent_Wiring_SOP.md)

---

## 1. Executive Summary

The BYOK AI assistant (webview `fetch()` direct to OpenAI-compatible endpoints — Ollama, OpenRouter, OpenAI, Anthropic, Gemini) had already had eight OpenRouter-class bugs (ERR-01 through ERR-08) fixed and documented in `solution_report.md`. That work was stable and committed. This pass closed five remaining gaps that the solution report itself had explicitly flagged as future work, plus one recurring maintenance risk found on re-audit:

| # | Gap | Status |
|---|---|---|
| 1 | No way to cancel a stuck/long stream | **Fixed** — Stop button + `AbortController` |
| 2 | No client-side timeout on `fetch()` calls | **Fixed** — 15s probe / 30s connect timeout |
| 3 | No retry for `HTTP 429` (OpenRouter free-tier) | **Fixed** — bounded 2-retry backoff |
| 4 | Saved model ID can silently go stale | **Fixed** — amber warning banner in Settings |
| 5 | Duplicated per-provider default URL/model logic | **Fixed** — extracted to a shared module |

All static gates (`tsc --noEmit`, `cargo check`, `npm run build`) pass clean. Live end-to-end verification against a real OpenRouter key was **not** performed in this session — see [§6 Verification](#6-verification) for why and what's still outstanding.

---

## 2. Files Touched

| File | Change |
|---|---|
| `src/services/providerPresets.ts` | **New.** Single source of truth for provider default URL/model. |
| `src/services/aiProvider.ts` | Timeout helper, abort-signal plumbing, 429 retry/backoff, clearer 429 error copy. |
| `src/stores/useStore.ts` | `assistantAbortController` state, `cancelAssistantMessage` action, abort-aware catch block. |
| `src/components/AssistantPanel.tsx` | Consumes shared presets; Send button becomes a Stop button while streaming. |
| `src/components/SettingsModal.tsx` | Consumes shared presets; renders stale-model warning banner. |

Files deliberately **not** touched (unrelated in-progress feature work at the time): `src-tauri/src/commands.rs`, `Layout.tsx`, `Navbar.tsx`, `PanelLayoutModal.tsx`, `SourcesPanel.tsx`, `StudyBoard.tsx`, `TopBar.tsx`, `WelcomeOnboarding.tsx`, `AgentPanel.tsx`, `ArtifactsPanel.tsx`, `EdgeResizer.tsx`, `EditorContextMenu.tsx`, `MoveConfirmModal.tsx`.

---

## 3. Implementation Detail

### 3.1 Shared provider-presets module

**New file:** [`src/services/providerPresets.ts`](../src/services/providerPresets.ts)

```ts
export interface ProviderPreset {
  id: string;
  name: string;
  icon: string;
  desc: string;
  defaultBaseUrl: string;
  defaultModel: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "ollama_hermes", ... defaultBaseUrl: "http://localhost:11434/v1", defaultModel: "hermes3:8b" },
  { id: "openrouter",    ... defaultBaseUrl: "https://openrouter.ai/api/v1", defaultModel: "nousresearch/hermes-3-llama-3.1-405b" },
  { id: "openai",        ... defaultBaseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" },
  { id: "anthropic",     ... defaultBaseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-sonnet-5" },
  { id: "gemini",        ... defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.0-flash" },
];

export function getProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}
```

`custom` is intentionally excluded — it has no fixed defaults, and both call sites already branch around it.

**Why:** `solution_report.md` documented two separate incidents (ERR-07, ERR-09) caused by a hardcoded default model/URL going stale in exactly one of the two places it was duplicated (`AssistantPanel.tsx` model-pill dropdown vs. `SettingsModal.tsx` provider `<select>`). A future fix to an OpenRouter/Gemini default now needs to change in exactly one file.

**Consumers:**
- [`AssistantPanel.tsx`](../src/components/AssistantPanel.tsx) — `modelsList` built from `PROVIDER_PRESETS.map(...)`; the model-pill dropdown's `onClick` handler looks up `getProviderPreset(m.id)?.defaultBaseUrl`.
- [`SettingsModal.tsx`](../src/components/SettingsModal.tsx) — the provider `<select>`'s `onChange` handler looks up both `defaultBaseUrl` and `defaultModel` from the same preset.

### 3.2 Client-side timeouts

**File:** [`src/services/aiProvider.ts`](../src/services/aiProvider.ts)

Added a `withTimeout(signal, timeoutMs)` helper that layers a `setTimeout`-based abort on top of an optional caller-supplied `AbortSignal`:

```ts
function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}
```

**Key design point:** `cleanup()` only clears the timeout timer — it does **not** detach the forwarded abort listener from the caller's `signal`. This is deliberate: for `streamAIResponse`, `cleanup()` runs as soon as the initial `fetch()` resolves (so a legitimate long SSE stream is never killed by the 30s *connect* timeout), but the external `signal` (from the Stop button, see §3.3) must stay wired for the entire life of the stream, not just the connect phase.

Applied to:
- `fetchAvailableModels()` — 15s timeout; failure falls through the existing `catch { return []; }` unchanged.
- `testAIConnection()` — 15s timeout on both the `/models` GET and the `/chat/completions` probe POST. A `TimeoutError` now produces a specific message instead of a raw stringified `DOMException`:
  > `Timed out waiting for {url} after 15s. The server may be slow, unreachable, or rate-limiting silently.`
- `streamAIResponse()` — 30s timeout on connection establishment only, via a new internal `postOnce()` helper (see §3.4) shared by the initial request, 429 retries, and the tool-incompatibility retry.

### 3.3 Cancel / Stop for in-flight requests

**`aiProvider.ts`:** `streamAIResponse(options)` gained `signal?: AbortSignal`. It's threaded into every `fetch()` via `postOnce()`, and forwarded into the recursive tool-call follow-up call (`return streamAIResponse({ ..., signal: externalSignal })`) so cancelling mid-tool-loop also cancels the follow-up request. An abort during the SSE `reader.read()` loop rejects naturally with `AbortError` and propagates uncaught — it is not recast as a connection-failure message.

**`useStore.ts`:**
- New state: `assistantAbortController: AbortController | null`.
- New action: `cancelAssistantMessage: () => get().assistantAbortController?.abort()`.
- `sendAssistantMessage` creates a fresh `AbortController` before each `streamAIResponse` call, passes `controller.signal`, and clears the controller in `finally`.
- The `catch` block now distinguishes user cancellation from a real failure:
  ```ts
  const wasCancelled = err instanceof DOMException && err.name === "AbortError";
  ```
  On cancellation, the chat bubble keeps whatever text had already streamed in (or shows `_Cancelled._` if empty) instead of the "Unable to connect" error message.

**`AssistantPanel.tsx`:** the Send button is swapped for a red/square Stop button whenever `isAssistantStreaming` is true, calling `cancelAssistantMessage()`. Implemented as two separate conditionally-rendered `<button>` blocks (not one button with branching internals) to keep the existing Send button's markup untouched.

This mirrors the `AbortController` pattern already used by `OpenCodeView.tsx`'s own SSE handling, so the codebase now has one consistent cancellation idiom.

### 3.4 Bounded retry on HTTP 429

**File:** `aiProvider.ts`

```ts
function getRetryDelayMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (!Number.isNaN(secs)) return Math.min(secs * 1000, 10_000);
  }
  return Math.min(1000 * 2 ** attempt, 8000); // 1s, 2s, capped at 8s
}
```

`streamAIResponse()` now has an internal `postOnce()` (used for the first attempt, every 429 retry, and the existing tool-incompatibility retry) plus a retry loop right after the first response:

```ts
let retryAttempt = 0;
while (response.status === 429 && retryAttempt < MAX_429_RETRIES) {
  const delay = getRetryDelayMs(response, retryAttempt);
  onStatusChange?.(`Rate limited — retrying in ${Math.round(delay / 1000)}s...`);
  await sleep(delay, externalSignal);
  retryAttempt++;
  response = await postOnce();
}
```

`MAX_429_RETRIES = 2` → up to 3 attempts total. `sleep()` rejects with `AbortError` immediately if `externalSignal` fires during the wait, so the Stop button still works mid-backoff. If still `429` (or a different failure) after retries, existing `formatApiError` handling takes over, now with updated copy:
> `Rate limited (HTTP 429) after automatic retries: {detail}. OpenRouter free-tier models are often rate-limited — wait longer, or switch models in Settings -> AI & BYOK Model.`

`testAIConnection()` and `fetchAvailableModels()` deliberately do **not** get retry logic — they're single-shot, user-triggered probes where immediate feedback (including "you're rate limited right now") is more useful than a delayed retry.

### 3.5 Stale/missing model warning

**File:** `SettingsModal.tsx`

Pure derived check, no new background fetch:

```ts
const savedModelMissing =
  availableModels.length > 0 &&
  !!settings.aiModelName &&
  !availableModels.includes(settings.aiModelName);
```

Rendered as an amber banner directly below the "Live models from your API key" pills, only once `availableModels` has been populated by a real `Test Connection` or `↻ Fetch Available Models` click — no polling added, matching the "lighter scheme" scope decision made against the heavier design `solution_report.md` had originally floated and deferred.

---

## 4. Commands Used

```bash
# Type-check (frontend)
npx tsc --noEmit

# Rust check (no Rust files touched this pass, run as insurance)
cd src-tauri && cargo check

# Full production frontend build
npm run build

# Dev server preview (Browser pane)
# — started via mcp Claude_Browser preview_start with name "dev" from .claude/launch.json
```

All three static gates passed with no new errors or warnings introduced (one pre-existing, unrelated `dead_code` warning on `VaultFile` in `db.rs`).

---

## 5. SOP Addendum — What to Do Next Time You Touch This Code

This extends the existing checklist in [`AI_Provider_and_Agent_Wiring_SOP.md`](AI_Provider_and_Agent_Wiring_SOP.md).

1. **Never hardcode a provider default in more than one place.** Add/edit entries in `src/services/providerPresets.ts` only. If you're tempted to write `if (provider === "openrouter") ...` anywhere else, import `getProviderPreset` instead.
2. **Every new `fetch()` call in `aiProvider.ts` should go through `withTimeout()`** (or reuse `postOnce()` inside `streamAIResponse`), unless it's an interactive single-shot probe with a good reason to skip it.
3. **Any new retry logic must respect the caller's `AbortSignal`.** Use `sleep(ms, signal)` — never a bare `setTimeout`-wrapped `Promise` for a backoff delay, or Stop won't work during that wait.
4. **Distinguish `AbortError` from real failures in every catch block that touches `streamAIResponse`.** A cancelled request is not a connection failure — don't show the user a scary error for something they asked for.
5. **`testAIConnection()` and `fetchAvailableModels()` stay single-shot, no retry.** They exist to give the user *immediate* ground truth (including "yes, this fails right now") — don't blur that by adding hidden retries to them.
6. **This is a Tauri app; the Vite-only dev preview cannot exercise the full BYOK flow.** The Workspace Launcher modal requires a live Tauri filesystem backend (`dialog` plugin) to open/create a vault — there's no way to dismiss it in a browser-only preview. Manual verification of chat/timeout/retry/cancel behavior must happen in `npm run tauri dev` or a built release, not the plain dev server.
7. **Keep `formatApiError()`'s per-status copy in sync with actual behavior.** If you change retry counts or timeout values, update the corresponding message strings (429, and the two `TimeoutError` messages) so they don't lie to the user about what already happened.

---

## 6. Verification

### 6.1 Static (completed this session)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Clean |
| `cargo check` (src-tauri) | ✅ Clean (1 pre-existing unrelated warning) |
| `npm run build` | ✅ Clean (pre-existing chunk-size warning, unrelated) |

### 6.2 Manual (attempted, blocked by environment — see below)

A Browser-pane smoke test was attempted against `npm run dev`. The app's `WorkspaceLauncherModal` opens automatically when no vault is open and has **no dismiss/skip path** — it calls into Tauri's `dialog` plugin (`tauri-plugin-dialog`) to pick a folder, which does not exist under a plain Vite dev server with no Tauri backend attached. This is a **pre-existing, already-documented limitation** (`solution_report.md` §5: *"the Vite-only dev preview can't get past the workspace-launcher modal without a live Tauri filesystem backend"*) — not a regression introduced by this pass.

**Still outstanding — run these against `npm run tauri dev` (or a built release) with a real OpenRouter key:**

1. Toggle provider dropdown away from OpenRouter and back — confirm Base URL/Model reset identically in both Settings and the AssistantPanel model pill.
2. Point Base URL at a non-routable address (e.g. `http://10.255.255.1:1/v1`) and send a message — confirm a timeout fires (~30s chat / ~15s Test Connection) instead of hanging.
3. Send a real message, click Stop mid-stream — confirm streaming halts, partial text is preserved (no error banner), input re-enables, and a subsequent message sends normally.
4. Rapidly hit a free-tier model (e.g. `google/gemini-2.0-flash-exp:free`) to trigger a real 429 — confirm the "Rate limited — retrying in Ns..." status appears, and either succeeds after backoff or shows the updated terminal 429 message. Confirm Stop works during the backoff sleep.
5. Set a bogus OpenRouter model ID, click "↻ Fetch Available Models" — confirm the amber stale-model banner appears and disappears once a valid model is picked.
6. Regression pass: confirm `describeModelMismatch()`, the tool-incompatibility fallback, and the real-POST `Test Connection` probe still behave as documented in `solution_report.md` (same functions were edited, not rewritten, but worth a fast re-check).
7. Switch to local Ollama provider, send a message — confirm the timeout/retry/abort changes are no-ops on the fast local path and Stop still works there too.

---

## 7. Open Items Not Addressed in This Pass

Carried forward from `solution_report.md`, still explicitly out of scope:

- Gemini multi-turn `thought_signature` protocol integration for tool calling (§10-11 of `solution_report.md`) — a deeper protocol change, deliberately not touched here.
- `aiApiKey` is stored plaintext in `localStorage` (masked in the UI via `type="password"` with a show/hide toggle) — acceptable for a local-first desktop app per prior review, not a target of this hardening pass.
- No OS-keychain integration for API keys — out of scope, would be a larger architectural change.
