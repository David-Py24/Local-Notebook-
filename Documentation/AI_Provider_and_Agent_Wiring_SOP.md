# Wiring AI Providers & Agent Sidecars: What Actually Breaks, and How to Verify It

This document exists because almost every bug fixed in this session had the same
shape: **a plausible-looking name, URL, or field that was subtly wrong**, and no
amount of reading documentation or generated code caught it — only actually
running the request against the real server did. That failure mode is exactly
what makes multi-provider AI integration hard for a solo dev or a "vibe coder"
working from docs/memory/LLM-generated code: everything *looks* right, compiles
clean, and still doesn't work, because the bug isn't a syntax error — it's a
one-character mismatch against an external system you don't control.

This is a reference for **how to wire a new AI provider or agent backend into
this app without getting burned the same way**, plus the exact CLI commands
used to diagnose and fix each class of bug this session.

---

## Part 1 — The core lesson

> **Never trust that an endpoint, model ID, env var name, or CLI package ID is
> correct just because it reads correctly. Verify it by actually calling it.**

Every bug below was "obviously right" until tested:
- `https://generativelanguage.googleapis.com/v1beta` *looks* like a valid Gemini
  base URL. It is — but it's the **native** API, not the OpenAI-compatible one
  this app's request shape needs. The compatible one has `/openai` appended.
- `GEMINI_API_KEY` *looks* like the right env var for OpenCode to authenticate
  with Google. It's actually `GOOGLE_GENERATIVE_AI_API_KEY`.
- `winget install OpenCode.OpenCode` *looks* like a valid package ID (it matches
  the app's own name). The real published ID is `SST.opencode`.
- `part.updated` *looks* like the SSE event name for a tool call, going by the
  API's own vocabulary. It's actually `message.part.updated`.
- `gemini-1.5-flash` *looks* like a safe default model. Google retired it.

None of these are the kind of bug `tsc` or `cargo check` will ever catch — they
are all runtime, external-system-contract bugs. The only fix is testing against
the real thing before trusting the code.

---

## Part 2 — SOP: Adding or debugging a BYOK AI provider

Applies to `src/services/aiProvider.ts`, `useStore.ts` (`fetchAvailableModels`,
`streamAIResponse`), and any provider dropdown default in `SettingsModal.tsx` /
`AssistantPanel.tsx`.

### Step 1 — Confirm the provider's OpenAI-compatibility endpoint shape

This app's whole BYOK architecture assumes every provider speaks the OpenAI
`/chat/completions` shape. Not every provider's *default* URL does — some (like
Gemini) have a separate compatibility path.

```bash
# Reachability + shape check — do this BEFORE wiring UI defaults.
# A 404 here almost always means the URL points at a provider's *native*
# API instead of its OpenAI-compatible one.
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "<BASE_URL>/chat/completions" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"<MODEL_ID>","messages":[{"role":"user","content":"hi"}],"max_tokens":1}'
```

- `200` → shape confirmed, safe to hardcode as the default Base URL.
- `404` with an "not found for API version" style body → wrong path; look for
  a `/openai`-suffixed or "compatibility" variant in that provider's docs.
- `401` → URL shape is right, key is wrong/expired — different bug class,
  don't misdiagnose this as an endpoint problem.

### Step 2 — Confirm the model ID isn't retired

Providers retire models on their own schedule, independent of this app's
release cycle. A hardcoded default model is a ticking bug.

```bash
curl -s "<BASE_URL>/models" -H "Authorization: Bearer <API_KEY>" | \
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{ \
    const j=JSON.parse(d); console.log((j.data||j.models||[]).map(m=>m.id||m.name).join('\n')); })"
```

If the model you're about to hardcode as a default isn't in this list, don't
ship it as a default — pick one that is.

### Step 3 — Don't trust "Test Connection" against a public endpoint alone

`GET /models` is public/keyless on some providers (confirmed: OpenRouter). A
"Test Connection" check that only hits `/models` will report success with an
**invalid API key**. Always pair it with a real, minimal `/chat/completions`
probe (see Step 1's curl) — that's what `testAIConnection()` in
`aiProvider.ts` does now, and why.

### Step 4 — Reproduce provider-specific error strings before writing a fallback

Don't guess at what error text a provider returns for an incompatibility (e.g.
"doesn't support tools"). Trigger it for real, copy the exact string, and match
on that in `isLikelyToolIncompatibility()` / `formatApiError()`. A guessed
substring match will silently fail to catch the real error and mask it instead
as a generic failure.

### Step 5 — When you retry after stripping tools, strip the *history* too

If a request fails because of a tool-calling incompatibility and you retry
without `tools`, also strip `tool_calls` / `role: "tool"` messages from the
**conversation history**, not just the current outgoing request. An earlier
poisoned turn will keep re-triggering the same error on every future request
in that conversation otherwise (`stripToolArtifactsFromHistory()`).

---

## Part 3 — SOP: Wiring an external agent server (the OpenCode pattern)

This generalizes beyond OpenCode to any case where this app spawns a local
HTTP server as a sidecar and talks to it — the mistakes are the same category
as Part 1: assumed API shapes that differ from the real ones.

### Step 1 — Never trust a written API doc's event/field names. Capture the real ones.

```bash
# 1. Start the real server standalone, with a known password, before writing
#    any frontend code against it.
OPENCODE_SERVER_PASSWORD=testpass123 opencode serve --port 4096

# 2. In another terminal, create a session and confirm auth + response shape.
curl -s -u opencode:testpass123 -X POST http://localhost:4096/session \
  -H "Content-Type: application/json" -d '{}'

# 3. Fetch the server's own OpenAPI schema — this is the authoritative
#    contract, not the marketing docs.
curl -s -u opencode:testpass123 http://localhost:4096/doc -o openapi.json
node -e "const d=require('./openapi.json'); \
  console.log(Object.keys(d.components.schemas).filter(k=>/tool|part/i.test(k)))"

# 4. Stream the real event feed while sending a message, and log RAW frames —
#    do not code against a guessed event shape.
curl -s -u opencode:testpass123 http://localhost:4096/event &
curl -s -u opencode:testpass123 -X POST \
  http://localhost:4096/session/<id>/message \
  -H "Content-Type: application/json" \
  -d '{"parts":[{"type":"text","text":"say hi"}]}'
```

This exact sequence caught three real bugs in one pass:
- The SSE endpoint needs **HTTP Basic Auth**, not a `?password=` query param —
  which also means the browser's native `EventSource` API (no custom headers
  allowed) can't be used at all; it has to be a manual `fetch` +
  `ReadableStream` reader instead.
- The tool-call event is `message.part.updated`, not `part.updated`.
- A message's metadata arrives as `properties.info`, and a message never
  carries its own `parts` — those stream in separately, correlated back by
  `part.messageID`.

### Step 2 — Verify credential env var names per provider, not by pattern-matching this app's own field names

```bash
# Don't assume <PROVIDER>_API_KEY. Check the target tool's own docs/source
# for its exact expected variable name, provider by provider.
```

Confirmed mapping for OpenCode (differs from this app's own `aiProvider` enum):

| This app's `aiProvider` | OpenCode env var |
|---|---|
| `openai` | `OPENAI_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `gemini` | `GOOGLE_GENERATIVE_AI_API_KEY` (**not** `GEMINI_API_KEY`) |
| `openrouter` | `OPENROUTER_API_KEY` |

### Step 3 — Verify the install command actually resolves before shipping it as UI guidance

An install command embedded in a "not installed" UI card is untested code that
runs on a user's machine outside your control. Verify the package ID exists
before shipping it:

```bash
# Windows
winget search <tool-name>
winget install --id <exact-id-from-search> -e \
  --accept-package-agreements --accept-source-agreements

# macOS/Linux — run the install script yourself once in a scratch VM/container
# before trusting it in shipped UI copy.
curl -fsSL <install-script-url> | bash
```

`winget search opencode` is what caught `OpenCode.OpenCode` not existing, and
surfaced the real ID (`SST.opencode`) plus a decoy (`SST.OpenCodeDesktop`, a
different GUI app) that would have been an equally plausible wrong guess.

### Step 4 — Never let the sidecar's secrets touch disk

- Generate a random per-session password in the frontend
  (`crypto.getRandomValues`), pass it to the Rust spawn command as an argument,
  inject it as an env var on the child process only (`Command::env(...)`).
- Hold it only in in-memory Zustand state — never `localStorage`, never a
  config file.
- Inject BYOK provider keys the same way: env vars on the spawned child
  process, never written into the tool's own config file format.

### Step 5 — Reconcile side effects reactively, not by polling

If the sidecar can modify files/state outside this app's own save pipeline
(OpenCode's file-editing tools bypass `write_local_file`), subscribe to its
event stream and reconcile (`reindex_vault`) reactively when a relevant event
fires, rather than polling or guessing when a session ends.

---

## Part 4 — SOP: Cutting a release

Applies to Windows builds via `.github/workflows/release.yml` + Tauri's
updater.

### Step 1 — Bump the version in all three places

Keep these in sync (a mismatch doesn't break the build, but confuses users
comparing About-page version to what they downloaded):

1. `src-tauri/tauri.conf.json` → `"version"`
2. `src/components/SettingsModal.tsx` → the "About" section's hardcoded
   version string
3. `CHANGELOG.md` → new `## [X.Y.Z] - YYYY-MM-DD` section at the top

### Step 2 — Verify before tagging (a bad tag push wastes a full CI cycle)

```bash
npx tsc --noEmit
npm run build
cd src-tauri && cargo check
```

### Step 3 — Commit, tag, push

```bash
git add src-tauri/tauri.conf.json src/components/SettingsModal.tsx CHANGELOG.md
git commit -m "Bump version to X.Y.Z"
git push origin main

git tag -a vX.Y.Z -m "Local Study Notebook X.Y.Z"
git push origin vX.Y.Z    # this push is what triggers the release workflow
```

### Step 4 — Watch the build (don't assume it's fine just because the tag pushed)

```bash
gh run list --workflow=release.yml --limit 3
gh run watch <run-id> --exit-status
```

If `gh run watch` itself errors out (e.g. a dropped local network connection),
that is **not** the same as the build failing — re-check with:

```bash
gh run view <run-id> --json status,conclusion,jobs
```

before assuming anything broke.

### Step 5 — Set the release description from CHANGELOG.md, then review before publishing

The workflow creates the release as a **draft** with a generic body. Give it
real notes before publishing:

```bash
# Extract just the new version's section from CHANGELOG.md into a temp file,
# then:
gh release edit vX.Y.Z --notes-file <path-to-notes.md>

# Confirm it's still a draft, and what's attached, before telling anyone
# it's out:
gh release view vX.Y.Z --json isDraft,name,assets
```

Publishing (making it visible / live for the in-app updater to find) is a
separate, manual step on GitHub — treat it as deliberate, not automatic.

---

## Part 5 — Checklist: before wiring any new external system into this app

- [ ] Have I made at least one real network call against this exact endpoint,
      with this exact auth method, and read the raw response — not just the
      happy-path example from documentation?
- [ ] If there's a machine-readable schema (OpenAPI, `/doc`, TypeScript defs
      shipped with an SDK), have I read *that* instead of prose docs or
      inferred field names from partial API responses?
- [ ] If this spawns a local process, are credentials scoped to that process's
      environment only, never written to disk, never logged?
- [ ] If this streams events, have I captured and printed raw frames from a
      real session — including a tool-call / side-effect case, not just plain
      text — before writing the parser?
- [ ] If this involves an install command shown in the UI, have I actually run
      it once, verbatim, on a clean shell?
- [ ] Does `npx tsc --noEmit` / `cargo check` passing give me *any* real
      confidence here, or am I about to ship a runtime contract bug that only
      manifests when a real user with a real API key clicks the button?
