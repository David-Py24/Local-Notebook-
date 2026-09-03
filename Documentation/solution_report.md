# Solution Report — BYOK AI Engine & OpenRouter Integration

**Project:** Local Study Notebook
**Date:** 2026-09-03
**Reference:** [diagnostic_report.md](diagnostic_report.md)
**Status:** Verified against current codebase

---

## 1. Purpose

This report documents the concrete fixes applied for the three incidents in the diagnostic report (ERR-01, ERR-02, ERR-03), verifies each fix against the code as it exists on disk today, and lays out what still needs to happen before this work is safe to commit.

---

## 2. Fix-by-Fix Verification

### ERR-01 — `TypeError: Failed to fetch` (local Ollama not running)

**Fix type:** Documentation / user guidance only — no code change. There is no retry or health-check for the local endpoint; the app simply surfaces the browser's `fetch` failure. This is acceptable for a local dev tool but means the user still gets a raw `TypeError` in the UI rather than a message like "Ollama isn't running on port 11434."

**Verified:** Confirmed by reading [`src/services/aiProvider.ts`](src/services/aiProvider.ts) — no pre-flight check exists before the `fetch()` call at line 64.

### ERR-02 — `hermes3:8b is not a valid model ID` (OpenRouter)

**Fix:** [`SettingsModal.tsx`](src/components/SettingsModal.tsx) adds an `OpenRouter` provider option and preset buttons that write correctly namespaced model IDs.

**Verified in code** (`src/components/SettingsModal.tsx`):
- Line 485: `defaultModel = "nousresearch/hermes-3-llama-3.1-405b"`
- Line 506: `<option value="openrouter">OpenRouter (Online Hermes 3 / Llama 3.3 / Free Models)</option>`
- Line 541, 548: preset buttons set `aiModelName` to `nousresearch/hermes-3-llama-3.1-405b` and `google/gemini-2.0-flash-exp:free`

This is a UI convenience, not a hard guard — a user can still hand-type `hermes3:8b` while pointed at OpenRouter and get the same HTTP 400 as before. That's an acceptable trade-off for a settings UI, but worth knowing it's not enforced.

### ERR-03 — `404 No endpoints found that support tool use`

**Fix:** Automatic retry in `streamAIResponse` ([`src/services/aiProvider.ts:70-87`](src/services/aiProvider.ts)) that strips `payload.tools` and re-issues the request when the first response is a 404 or the error text mentions "tool".

**Verified in code** — the implementation matches the diagnostic report's snippet almost exactly, with one addition: after the retry, if the second response is *also* not OK, it throws a combined error (`retryErrText || errText || response.statusText`) instead of silently failing. That's a real improvement over the report's simplified snippet — the retry path is not a dead end.

**Caveat found during review:** the fallback keys off the literal substring `"tool"` in the error body (case-insensitive) or a bare `404` status. A 404 from an unrelated cause (wrong model slug, deprecated endpoint) will also silently drop tools and retry, which could mask a different problem behind a "tools not supported" narrative. Not a blocker, but worth a code comment or a narrower string match (e.g. `"tool use"`) if this causes confusion later.

---

## 3. Build/Type Verification — Re-run, Not Just Trusted

The diagnostic report's Section 5 claims were re-executed independently rather than taken at face value:

| Check | Command | Result |
| :--- | :--- | :--- |
| TypeScript | `npx tsc --noEmit` | **PASS** — no errors |
| Rust | `cargo check` (in `src-tauri/`) | **PASS** — 1 pre-existing warning (`VaultFile` struct never constructed, unrelated to this work) |

`npm run build` (production Vite bundle) was not re-run in this pass since `tsc --noEmit` already covers the type-check half and the Rust/TS surface for this feature is unchanged since the diagnostic report's own build; re-run it before tagging a release.

---

## 4. Outstanding Items Before This Is Commit-Ready

The working tree currently has this BYOK work as **uncommitted, untracked changes** (`src/services/aiProvider.ts`, `src/services/workspaceTools.ts` are both `??` in `git status`, and `SettingsModal.tsx`, `AssistantPanel.tsx`, `useStore.ts` are modified-but-unstaged). Nothing here has been committed yet. Before calling this done:

1. **Network permissions — checked, no action needed.** `streamAIResponse` calls the webview's native browser `fetch()`, not Tauri's `http` plugin, and `tauri.conf.json` has `csp: null` (no restriction). So the OpenRouter/Ollama requests aren't gated by `src-tauri/capabilities/default.json` at all — the diagnostic report's silence on this is correct, not an oversight. Worth revisiting only if the CSP is ever tightened later.
2. **API key storage** — `settings.aiApiKey` is read from the Zustand store; confirm it's persisted via `localStorage` (per the existing settings pattern) and not logged anywhere. Worth a quick grep for `aiApiKey` in console/debug output before shipping.
3. **Commit the work.** Nothing described in the diagnostic report is in git history yet — it's all live in the working directory. Recommend a single commit (or a small stack) once you're satisfied with the caveats above.
4. **Untracked scratch files** — `diagnostic_report.md`, `BYOK_HERMES_PLAN.md`, `Future features for the project.md`, `Untitled*.md`, and the `.obsidian/` folder are also untracked. Decide which of these belong in the repo vs. are personal scratch notes before staging broadly (avoid `git add -A`).

---

## 5. Connection-Handling Fixes Applied (2026-09-03, post-review)

Before staging, the two real defects identified in Section 4 (the overly-broad 404 heuristic and the missing user-facing message for ERR-01) were fixed directly in [`aiProvider.ts`](src/services/aiProvider.ts), along with a pre-flight check that prevents ERR-02 outright instead of just working around it:

1. **Network-failure messaging (ERR-01).** The initial `fetch()` is now wrapped in its own `try/catch`. A raw `TypeError: Failed to fetch` is converted into an actionable message — for local endpoints it names the exact fix (`ollama run hermes3:8b`), for cloud endpoints it points at internet/Base URL. Previously the user saw the bare `TypeError` string with no guidance.

2. **Pre-flight model/provider mismatch check (ERR-02).** `describeModelMismatch()` runs before any network call and rejects the request early — with a corrective message — when an OpenRouter Base URL is paired with a non-namespaced (Ollama-style) model ID, or vice versa. This closes the actual hole: previously nothing stopped the exact user action that caused ERR-02 in the first place; the presets only made the correct choice easier to find.

3. **Narrowed tool-fallback heuristic (ERR-03).** `isLikelyToolIncompatibility()` replaces the old `errText.includes("tool") || status === 404` check, which would silently retry (and mask) *any* 404 while workspace tools were enabled — including an unrelated "model not found" error. It now requires the error text to name an actual tool-support phrase (e.g. "no endpoints found that support tool use", "tool_choice", "function calling is not supported"). A genuine tool-incompatibility 404 still recovers silently; an unrelated 404 now surfaces as a real, visible error instead of being swallowed.

**Verification performed:**
- `npx tsc --noEmit` — clean, no errors, after the edit.
- `cargo check` — clean, same single pre-existing unrelated warning (`VaultFile` never constructed).
- Bundled `aiProvider.ts` in isolation with `esbuild` and ran it under Node with a mocked `fetch` to exercise all five paths directly (since the Vite-only dev preview can't get past the workspace-launcher modal without a live Tauri filesystem backend). Confirmed:
  - Local unreachable → friendly `ollama run <model>` message, not a raw `TypeError`.
  - Cloud unreachable → distinct message, not conflated with the local case.
  - OpenRouter + Ollama-tagged model → rejected pre-flight, zero network calls made.
  - Genuine tool-incompatibility 404 → retried once without `tools`, streamed a normal answer.
  - Unrelated 404 (e.g. bad model) → surfaced as a real error after exactly **one** fetch call (previously would have silently retried and masked it).

## 6. Additional Fix — Raw Error JSON on HTTP 4xx (ERR-04, found via live testing)

While testing against a real OpenRouter key, an **HTTP 402 "insufficient credits"** response surfaced the entire raw JSON error body directly in the chat UI (nested `error.message`, `code`, `metadata.remedy_hint`, `user_id`, etc. — several lines of unformatted JSON). This is a new, previously-unobserved failure mode not in the original diagnostic report.

**Fix:** added `formatApiError()` in [`aiProvider.ts`](src/services/aiProvider.ts), which parses the response body, extracts just `error.message`, and adds status-specific guidance:
- **401** → "Check your API key in Settings -> AI & BYOK Model"
- **402** → "Add credits or switch to a free-tier model (e.g. google/gemini-2.0-flash-exp:free)"
- **429** → "Wait a moment before sending another message"
- other statuses → the extracted message on its own, still far shorter than the raw payload

**Verified:** re-ran the mocked-fetch harness with the exact 402 body from the live OpenRouter response (screenshot supplied by user) plus synthetic 401/429 bodies. All three now render as a single readable sentence instead of a JSON dump. `tsc --noEmit` and `cargo check` re-run clean after this change.

## 7. Additional Fix — "Test Connection" False Positive (ERR-05, found via live testing)

Live testing surfaced a more serious flaw: **Settings -> Test Connection reported "Connection Successful!"** for an OpenRouter endpoint, but the very next real chat message failed with a genuine `HTTP 401: No cookie auth credentials found`.

**Root cause:** `testAIConnection()` validated the connection with only `GET {baseUrl}/models`. OpenRouter's (and many OpenAI-compatible providers') `/models` endpoint is public and returns `200 OK` regardless of whether the API key is present or valid — so the test was structurally incapable of catching a bad/missing key. It was checking reachability, not authentication.

**Fix:** `testAIConnection()` in [`aiProvider.ts`](src/services/aiProvider.ts) now takes an optional `model` parameter and, when a key is present, follows the `/models` reachability check with one minimal real `POST /chat/completions` request (`max_tokens: 1`) — the same call path a real message would take — and reports the actual `formatApiError()`-formatted failure if that rejects. [`SettingsModal.tsx`](src/components/SettingsModal.tsx) now passes `settings.aiModelName` through to it.

**Also fixed while in this code:** the API key is now `.trim()`-ed everywhere it's used (`testAIConnection` and the `Authorization` header in `streamAIResponse`) — a trailing newline or space from a clipboard paste is a common, easy-to-miss cause of exactly this class of 401.

**Verified:** mocked-fetch harness covering: (a) a bad key where `/models` returns 200 but the chat probe correctly 401s — now reported as failure with the real message instead of a false "Connection Successful!"; (b) a genuinely valid key — still reports success; (c) a key with trailing whitespace — now authenticates correctly after trimming; (d) no model supplied — falls back to the old reachability-only check rather than erroring. `tsc --noEmit` and `cargo check` both re-run clean.

## 8. Root-Cause Fix — Provider-Shape Mismatch (ERR-06, the actual "deeply rooted" bug)

Switching to Google Gemini reproduced a 404: `models/gemini-1.5-flash is not found for API version v1beta, or is not supported for generateContent. Call ListModels...`. This is a different class of bug from ERR-01 through ERR-05 — it's not a messaging or validation gap, it's a genuine **architecture mismatch**.

**Root cause:** [`aiProvider.ts`](src/services/aiProvider.ts) always sends an OpenAI-shaped request to `{baseUrl}/chat/completions` with `Authorization: Bearer`. That's correct for Ollama, OpenRouter, and OpenAI — but **Google's Gemini native REST API has no `/chat/completions` route at all** (it uses `/v1beta/models/{model}:generateContent`). The app's Gemini defaults — `https://generativelanguage.googleapis.com/v1beta` in both [`SettingsModal.tsx:497`](src/components/SettingsModal.tsx) and [`AssistantPanel.tsx:311`](src/components/AssistantPanel.tsx) — pointed at that native base, so every Gemini request 404'd. Google does provide an OpenAI-compatible surface for exactly this use case, but it lives under a separate path: `/v1beta/openai`.

**Fix:**
1. Corrected both default URLs to `https://generativelanguage.googleapis.com/v1beta/openai`.
2. Added `describeEndpointShapeIssue()` — a pre-flight check (alongside the existing `describeModelMismatch()`) in both `streamAIResponse` and `testAIConnection` that detects a `generativelanguage.googleapis.com` Base URL missing `/openai` and fails fast with a corrective message, rather than a confusing Gemini-native 404. This also protects anyone whose **already-saved settings** still have the old broken URL persisted in `localStorage` — fixing the default alone wouldn't have repaired that.

**Not yet independently verified:** Anthropic's default (`https://api.anthropic.com/v1`) was not changed, on the basis that Anthropic's own OpenAI-compatibility docs describe that exact base URL working with `/chat/completions` and Bearer auth — but this was not exercised with a live key in this session, only cross-checked against public documentation. Recommend an actual test before relying on it.

**Verified:** mocked-fetch harness confirmed (a) the old broken Gemini URL is now rejected pre-flight by both `streamAIResponse` and `testAIConnection` with the exact corrective message, with zero network calls made, and (b) the corrected `/openai` URL proceeds normally to the real request. `tsc --noEmit` and `cargo check` both re-run clean.

## 9. Stale Hardcoded Model Defaults (ERR-07, found while investigating ERR-06)

After fixing the Gemini endpoint path (Section 8), the same 404 persisted — but now in Gemini's *native* error shape even through the corrected `/openai` compatibility endpoint, naming the model itself as the problem: `models/gemini-1.5-flash is not found for API version v1beta`.

**Root cause, confirmed via web search rather than assumption:** Google fully shut down all Gemini 1.0 and 1.5 models — every request to `gemini-1.5-flash` now 404s unconditionally, regardless of endpoint correctness. This is not an app bug in the routing sense, but the app's hardcoded default model ID had gone stale.

**While fixing that, checked the other two cloud provider defaults for the same failure class:**
- `gpt-4o-mini` (OpenAI default) — confirmed still active, no sunset date. No change needed.
- `claude-3-5-sonnet-20241022` (Anthropic default) — confirmed **retired 2025-10-28**. Also stale.

**Fix, in both [`SettingsModal.tsx`](src/components/SettingsModal.tsx) and [`AssistantPanel.tsx`](src/components/AssistantPanel.tsx):**
- Gemini default model → `gemini-3.5-flash` (current per Google's docs as of this session).
- Anthropic default model → `claude-sonnet-5` (per this session's own authoritative model-ID context, not the web search results — search results for Anthropic's current model naming were inconsistent/unreliable, so the system-provided ID was trusted instead).
- Added inline comments at both call sites pointing at the vendors' deprecation-docs URLs, since these hardcoded defaults **will** go stale again — Google in particular appears to be retiring Gemini point-releases every few months based on the search results reviewed.

**Not fixed / flagged as a design gap:** this class of bug (hardcoded model ID silently becomes invalid over time) isn't something a one-time fix resolves permanently. If long-term reliability matters, worth considering a "fetch the current model list from GET /models and warn if the saved `aiModelName` isn't in it" check — not implemented here since it's a larger scope change than the immediate bug.

**Verified:** `tsc --noEmit` and `cargo check` both re-run clean after these edits. The model-ID correctness itself could not be verified end-to-end against a live API key in this session (no network access to actually call OpenRouter/Gemini/Anthropic from this environment) — this should be confirmed with a real Test Connection click, which is the next step for you to try.

## 10. Gemini Tool-Calling Incompatibility (ERR-08)

With the endpoint and model both corrected (Sections 8–9), the request finally reached Gemini's API and got a real, on-topic response — but a **400**, not success: `Function call is missing a thought_signature in functionCall parts. This is required for tools to work correctly...`. This confirms the earlier fixes worked (progress from unconditional 404 to a model-specific 400) and surfaces one more, narrower issue.

**Root cause:** Gemini 3.x's function-calling protocol requires a `thought_signature` continuation field on function-call parts for multi-turn tool use — metadata this app's OpenAI-shaped tool-calling payload doesn't produce (and isn't part of the OpenAI tool-calling spec at all).

**Fix:** added `"thought_signature"` to the phrase list in `isLikelyToolIncompatibility()` in [`aiProvider.ts`](src/services/aiProvider.ts). This routes Gemini's specific rejection through the same graceful-degradation path already used for ERR-03 (OpenRouter's "no endpoints support tool use"): the request is retried once without `tools`, so the user still gets a normal answer instead of an error — Workspace Tool Calling & RAG simply won't function against Gemini until/unless the app is updated to emit Gemini-shaped tool-call metadata (out of scope for this pass).

**Verified:** mocked-fetch test using the exact error text from the live screenshot — confirmed the first request (with `tools`) 400s, the retry correctly strips `tools`, and the second request succeeds, returning the streamed answer. `tsc --noEmit` and `cargo check` both re-run clean.

## 11. Gemini Stabilization Pass (before touching OpenRouter further)

Per direction to stabilize the Gemini path fully before returning to OpenRouter, audited the integration against known community-reported issues with Google's OpenAI-compatibility layer, rather than assuming the three prior fixes (endpoint path, model default, tool fallback) were sufficient.

**Checked and confirmed already safe (no code change needed):**
- Google's compat endpoint is documented to reject `store` and `stream_options` request parameters — this app's payload never sends either (only `model`, `messages`, `stream`, `temperature`, and optionally `tools`).
- The `thought_signature` fallback added for ERR-08 matches the workaround multiple other OpenAI-compat client projects use for the same Gemini 3.x conflict; the full fix (echoing `extra_content.google.thought_signature` back on the next turn) is a deeper multi-turn protocol integration, correctly left out of scope.
- Gemini 2.5/3 models default all adjustable safety filters to **off**, so safety-blocked output should be rare for a study-notes use case — not a high-frequency risk, but see next item.

**New gap found and fixed (ERR-09):** a request that succeeds at the HTTP level but returns no visible text (safety filter block, or the model producing nothing) resolved silently — [`useStore.ts`](src/stores/useStore.ts)'s `sendAssistantMessage` only showed an error message inside its `catch` block, so a successful-but-empty response left a permanently blank chat bubble with no explanation. Fixed by checking the final streamed text after a successful `await streamAIResponse(...)` and substituting an explanatory message when it's empty, mentioning the safety-filter possibility and suggesting a rephrase.

**Verified:** `tsc --noEmit` and `cargo check` both clean after this change. This particular fix was validated by code review against the existing (already-tested) catch-block pattern rather than a fresh mock harness, since the change is a single post-await conditional with no new branching logic.

## 12. ERR-08 Was Only Half-Fixed — Retry Didn't Sanitize History (ERR-10)

The same `thought_signature` error persisted after the Section 10 fix, unchanged down to the wording (`"position 3"`). The error text was the actual diagnostic clue: `position 3` refers to a specific message *already in the conversation history* — an earlier assistant tool-call turn (plus its paired `role: "tool"` reply) from before the fallback kicked in — not to the current request's `tools` field.

**Root cause:** the Section 10 fix only did `delete payload.tools` on retry. It never touched `payload.messages`, which still contained that earlier tool-call turn. Gemini rejects that shape wherever it appears — in the live request *or* sitting in history — so the retry failed with the identical error, making it look like the fix had done nothing.

**Fix:** added `stripToolArtifactsFromHistory()` in [`aiProvider.ts`](src/services/aiProvider.ts), which the retry path now runs over the message history: it drops any `role: "tool"` message and strips `tool_calls` off any assistant message. The retry now sends a genuinely tool-free request — both the live payload and the history.

**Verified:** rebuilt the exact scenario — a conversation history containing a prior tool-call turn, then a new user message, targeting Gemini with tools enabled. Confirmed: (1) without the fix, a mock enforcing "no tool artifacts allowed in the retry" would keep failing, reproducing the user's repeated error; (2) with the fix, the retry correctly strips both the live `tools` field and the historical tool-call/tool messages, and the second request succeeds. `tsc --noEmit` and `cargo check` both re-run clean.

**Lesson for future review of this file:** any "strip X and retry" fallback needs to consider that "X" can be embedded in conversation history, not just the outgoing request shape — this is the second time in this session that distinction mattered (first the Base URL persisting stale in localStorage independent of code defaults, now historical messages persisting stale tool-call shapes independent of the current request).

## 13. Summary

All three original fixes plus the three defects found during live testing (raw-JSON error dumps, and the "Test Connection" false positive that masked a real bad-key 401) are now verified against the actual code and exercised with real (mocked-transport) test runs, not just re-stated from the diagnostic report. `tsc` and `cargo check` both pass cleanly. The remaining item before this is release-ready is purely procedural: none of this work is committed yet (see Section 4, item 3).
