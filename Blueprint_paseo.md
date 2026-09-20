# Paseo Blueprint

The shared context map for agents working in this repo. Read this once at the start of any
non-trivial task, then go to the specific doc, file, or package it points you at. It exists so
multiple agents (parallel, sequential, or handed off) build the same mental model and use the same
words for the same things. If two agents disagree about where something lives or how something works,
this file — and the docs it links — is the arbiter. Prefer it over cached knowledge from earlier
sessions; the code and docs change, and this map should be updated when they do.

**Not a replacement for CLAUDE.md or `docs/`.** This is the index. CLAUDE.md is the rules file every
agent must follow (and `AGENTS.md` points there). `docs/` is the source of truth for system and
process knowledge. When this file and a doc disagree, the doc wins for technical facts and CLAUDE.md
wins for process rules. If a change would make a new agent click the wrong thing, it belongs here.

---

## 1. What this is

Paseo is an open-source (Apache-2.0) mobile + desktop + web + CLI app for monitoring and controlling
local AI coding agents (Claude Code, Codex, GitHub Copilot, OpenCode, Pi) from anywhere. A local
Node.js **daemon** (`packages/server`) spawns and supervises agent processes and streams their output
over WebSocket. Clients connect to it: the Expo app (`packages/app`), the Electron desktop wrapper
(`packages/desktop`), the CLI (`packages/cli`), and the marketing/docs site (`packages/website`). An
optional E2E-encrypted relay (`packages/relay`) bridges remote connections. Local-first — user code
never leaves their machine. Current version: `0.9.0-beta.2`.

### Conceptual model (the parts that trip up new agents)

- **Daemon** is the server process, identified by opaque `serverId`. One per machine (plus one per
  checkout in dev). It is not the client.
- **Host** is a *client-side* connection profile (`HostProfile`) — never say "Connection".
- **Project** (opaque `prj_<hex>` id, exact normalized root) vs **Workspace** (opaque `workspaceId`,
  one concrete `cwd`, git state). **Workspace kind** (`directory|local_checkout|worktree`) is
  git-derived and persisted; **isolation** (`local|worktree`) is create-time UI intent. Never confuse
  the two.
- **Agent session** is the canonical term for a running agent (not "Agent"). **Session** alone means
  either the per-client WebSocket connection (internal) or a user-facing agent session.
- One WebSocket carries JSON text frames and binary terminal frames interleaved. Handshake:
  `hello` -> `status.server_info`; liveness is a 10 s JSON `ping`/`pong` ownership lease.
- Agent lifecycle: `initializing -> idle <-> running -> error -> closed`.
- **Steer** = a follow-up admitted into a running turn; **fork** = new agent seeded with curated chat
  history; **change request** = forge-neutral PR/MR; **composer** = the whole prompt surface.

---

## 2. Docs atlas — read the right doc first

`docs/` is the source of truth. "The docs" always means this directory, not the website. List
`docs/` and skim anything relevant at the start of non-trivial work. Docs-writing rules (integrate
don't-append, one fact one doc, one subject per doc, don't document logic, plain doc voice) are in
`CLAUDE.md`.

| Doc | Owns | When to read it |
| --- | --- | --- |
| `docs/product.md` | What Paseo is, who it's for, decision philosophy | Before any product-level design |
| `docs/architecture.md` | System design, package layering, WS protocol, agent lifecycle, storage layout | Start of most work; before server or protocol changes |
| `docs/agent-lifecycle.md` | Agent states, parent/child, archive semantics, tabs vs archive, subagents | Agent lifecycle work |
| `docs/data-model.md` | File-based JSON persistence, Zod schemas, atomic writes, store surface rules | Anything touching persisted state |
| `docs/glossary.md` | Authoritative terminology — UI label wins, no synonyms | Naming UI copy or new concepts |
| `docs/coding-standards.md` | Type hygiene, error handling, state design, React patterns, file org | Every change |
| `docs/design.md` | Design tokens, buttons, hierarchy, density, what's forbidden | Any UI work |
| `docs/forms.md` | Non-React form model, load-state gating (schedule form is the golden example) | Form work |
| `docs/hover.md` | Canonical hover pattern + the three ways agents break it | Hover-reveal UI |
| `docs/unistyles.md` | Unistyles gotchas — `useUnistyles()` is forbidden | Styling |
| `docs/floating-panels.md` | Popovers: Portal/Modal escape, lifecycle gates, the flash | Panels/popovers |
| `docs/menus.md` | Menu engine: popover vs sheet, submenu pages, hover intent | Menu work |
| `docs/expo-router.md` | Route ownership, startup restore, blank-screen gotchas | **Before any route/startup-restore change** |
| `docs/file-icons.md` | Material icon theme integration | File explorer icons |
| `docs/providers.md` | Adding a new agent provider end-to-end | Provider work |
| `docs/forge-providers.md` | Adding a git forge: registry/manifest, drop-in checklist, self-host | Forge work |
| `docs/custom-providers.md` | Custom provider config: Z.AI, Qwen, ACP agents, profiles, binaries | Custom providers |
| `docs/plugins.md` | Local plugin manifest, directory sources, RPCs, native surfaces | Plugin host work |
| `docs/service-proxy.md` | Exposing workspace scripts at public URLs | Service proxy |
| `docs/development.md` | Dev server, build sync, ports, CLI reference, profiling | Setting up dev loops |
| `docs/rpc-namespacing.md` | Dotted RPC naming, `.request`/`.response` pairs | **New RPCs** |
| `docs/protocol-compatibility.md` | App/daemon drift, protocol vs feature contract, COMPAT tagging | **Before touching `packages/protocol`** |
| `docs/protocol-validation.md` | zod-aot generated inbound validation, schema-purity rules | Protocol validation |
| `docs/permissions.md` | Semantic permissions, principals, credentials, pairing | Auth/permissions |
| `docs/hub.md` | Hub opt-in relationship, enrollment, `hub.execute` scope | Hub work |
| `docs/i18n.md` | Locales, translation scope, batches, forge-variant copy | Any client copy |
| `docs/terminal-performance.md` | Latency pipeline, coalescing, benchmark + perf spec | Terminal perf |
| `docs/agent-stream-performance.md` | Assistant text pipeline, paced reveal | Message stream perf |
| `docs/timeline-sync.md` | Timeline sequence/epochs, subscriptions | Timeline work |
| `docs/file-observation.md` | Recursive watcher ownership, Linux constraints, teardown | File watching |
| `docs/testing.md` | TDD workflow, determinism, test routing | Before writing tests |
| `docs/qa.md` | QA evidence bar for PRs, platform matrix, real coverage | Before opening/closing PRs |
| `docs/mobile-testing.md` | Maestro + mobile test workflows | Mobile work |
| `docs/mobile-panels.md` | Compact left/center/right panels, gesture revisions, Fabric | Mobile panels |
| `docs/explorer-sidebar.md` | Explorer sidebar + side-pane host contracts, lifecycle | Sidebar work |
| `docs/ad-hoc-daemon-testing.md` | Isolated in-process daemon test harness | Daemon tests |
| `docs/browser-capture-harness.md` | Real-Electron screenshot harness, compositor-surface gotcha | Electron capture |
| `docs/android.md` | App variants, EAS, version codes, F-Droid | Android builds/store |
| `docs/docker.md` | Daemon in Docker, volumes, security | Docker |
| `docs/release.md` | Release playbook, draft releases, branch discipline (`next`) | Releases |
| `docs/terminal-activity.md` | Activity indicators, agent hook reporting | Terminal activity |
| `docs/refactors/session-decomposition-plan.md` | In-progress decomposition of `session.ts` (~9k lines) into `session/<domain>/` controllers | Anything touching `packages/server/src/server/session.ts` |
| `SECURITY.md` | Relay threat model, E2E, DNS rebinding | Security review |
| `public-docs/hub/security.md` | Public Hub guide: trust boundaries, untrusted triggers | Hub security |

The website renders `public-docs/`; the maintained plugin quickstart/reference that ships with this
checkout is `public-docs/plugins/reference.md`. `docs/plugins.md` is the maintainer guidance.

---

## 3. Monorepo layout and dependency flow

npm workspaces monorepo. Build order matters: packages resolve each other through compiled `dist/`,
**not** sibling `src/`. Stale `dist` declarations cause cross-package type errors — rebuild the
owning stack first (`npm run build:client`, then `npm run build:server`).

### Layer graph

```
@getpaseo/protocol             wire schemas + zod types only            deps: zod, semver
@getpaseo/relay                E2E-encrypted relay transport           deps: protocol
@getpaseo/highlight            Lezer/CodeMirror syntax highlighting    deps: none (standalone)
@getpaseo/expo-two-way-audio   native Expo module, PCM two-way audio   deps: none (standalone)
@getpaseo/client               daemon WS driver + PaseoClient + Api    deps: protocol, relay
@getpaseo/plugin               plugin SDK (shared/server/client)       deps: client, protocol
@getpaseo/server               the daemon                              deps: client, highlight, plugin, protocol, relay
@getpaseo/cli                  commander CLI                           deps: client, protocol, server (subpaths)
@getpaseo/app                  Expo app (iOS/Android/web)              deps: client, protocol, plugin, highlight, expo-two-way-audio
@getpaseo/desktop              Electron wrapper on the app web export  deps: cli, server (subpaths)
@getpaseo/website              marketing/docs site (Vite+TanStack)     deps: none (standalone)
```

**Server export caution:** `@getpaseo/server`'s root export eagerly loads daemon bootstrap.
`desktop` and `cli` must import explicit subpaths (`/daemon-control`, `/configuration`, `/process`).
A tree-shaking-disabled export test guards this.

### Root scripts you will actually use

| Command | Purpose |
| --- | --- |
| `npm run dev` / `dev:server` | Dev daemon on `127.0.0.1:6768` (production uses `6767`) |
| `npm run dev:app` | Expo app on `localhost:8081` |
| `npm run dev:desktop` | Electron dev on first free port 8082-8089 |
| `npm run cli -- ls -a -g` | CLI against the dev daemon |
| `npm run build:client` | Rebuild protocol -> client `dist` (after wire changes) |
| `npm run build:server` | Rebuild highlight/relay/protocol/client/server/cli |
| `npm run build:app-deps` | Rebuild app prerequisites (highlight, client, plugin, expo-two-way-audio) |
| `npm run typecheck` | Repo-wide; run after every change |
| `npm run lint` | oxlint; run after every change |
| `npm run format` | oxfmt formatting; run before committing |
| `npm run format:files -- <paths>` | Format specific files |
| `npm run lint -- <paths>` | Lint specific files |
| `npx vitest run <file> --bail=1` | Run only the changed test file (never the whole suite) |

Dev state is checkout-local: `PASEO_HOME` resolves to `.dev/paseo-home`. Keep `127.0.0.1:6767` for
the packaged app and production-style `~/.paseo`. Full matrix in `docs/development.md`.

---

## 4. Package deep map — where things live

### `packages/server` — the daemon

- `src/server/bootstrap.ts` — daemon wiring: HTTP/Express + MCP streamable-HTTP, `createPaseoDaemon()`.
- `src/server/session.ts` — **~9k-line connection/dispatch shell**, 128 handlers, mid-refactor into
  `session/<domain>/`. Read `docs/refactors/session-decomposition-plan.md` before touching it.
  Carved so far: `session/voice/`, `session/checkout/` (read side), `session/schedule/`.
- `src/server/websocket-server.ts`, `auth.ts`, `pairing-offer.ts`, `daemon-instance.ts`,
  `daemon-worker.ts`, `messages.ts`.
- `src/server/agent/` — lifecycle: `agent-manager.ts`, `provider-registry.ts`, `mcp-server.ts`,
  `agent-storage.ts`, `agent-response-loop.ts`, `activity-curator.ts`, subfolders `tools/`,
  `providers/`, `create-agent/`, `rewind/`, `chat-search/`, `provider-subagents/`.
- `src/server/plugins/` — plugin host: `compiler.ts`, `runtime.ts`, `manifest.ts`, `daemon-transport.ts`.
- `src/server/speech/` — STT/TTS: `providers/local/` (sherpa-onnx + bundled `silero_vad.onnx`),
  `providers/openai/`.
- `src/server/hub/` — Hub execution: `execution-controller.ts`, `relationship-controller.ts`.
- `src/server/workspace-*` — `workspace-registry.ts`, `workspace-git-service.ts`,
  `workspace-reconciliation-service.ts`, `worktree-core.ts`, `worktree-bootstrap.ts`.
- `src/terminal/` — PTY management, `terminal-manager.ts`, node-pty workers, shell-integration,
  `agent-hooks/` (claude/codex/opencode hook installers).
- `src/services/` — forges: `github/gitlab/gitea/forge-*`, plus `quota-fetcher/` per-provider usage.
- `src/tasks/`, `src/schedule/`, `src/utils/`, `src/executable-resolution/` (find provider binaries).
- Entry `src/server/exports.ts` — `createPaseoDaemon`, `loadConfig`, `resolvePaseoHome`, etc.
  Supervisor entry: `scripts/supervisor-entrypoint.ts`.

### `packages/protocol` — the wire (source of truth, depends on nothing)

- `src/messages.ts` (~7.5k lines) — canonical session/WS wire schemas, the de-facto core. `*.test.ts`
  files pin wire compatibility.
- Flat modules: `agent-types`, `agent-lifecycle`, `agent-labels`, `terminal-*`, `timeline-identity`,
  `workspace-labels`, `branch-slug`; subdirs `chat/`, `loop/`, `schedule/`, `browser-automation/`.
- `binary-frames/` — `demux.ts`, `file-transfer.ts`, `terminal.ts` (binary frame protocol).
- `validation/` + `generated/validation/` — zod-aot generated inbound validation.
- `provider-manifest.ts` — `AGENT_PROVIDER_DEFINITIONS`, `BUILTIN_PROVIDER_IDS`; provider modes.
- `paseo-config-schema.ts`, `connection-offer.ts`, `daemon-endpoints.ts`, `host-connection-schema.ts`.
- Consumers import subpaths (e.g. `@getpaseo/protocol/messages`); there is **no index barrel**.

### `packages/client` — the SDK

- `src/index.ts` — `createPaseoClient`, `createPaseoApi`, workspaces/agents handle factories.
- `src/daemon-client.ts` (~6.7k lines) — low-level typed RPC driver.
- Transports: `daemon-client-websocket-transport.ts`, `daemon-client-relay-e2ee-transport.ts`.
- `src/terminal-stream-router.ts`; `src/connection/`, `src/terminals/`, `src/timeline-subscription/`,
  `src/compat/normalize-provider-models.ts`.

### `packages/app` — the Expo client (iOS, Android, web)

- **Routes:** `src/app/` (expo-router). Two-level stacks: static root routes then dynamic
  `h/[serverId]/workspace/[workspaceId]/...` and `h/[serverId]/agent/[agentId]`. See
  `docs/expo-router.md`.
- **State:** Zustand in `src/stores/` (`session-store`, `panel-store`, `workspace-layout-store`,
  etc.); pattern is `store.ts` + sibling `store.test.ts`. Server data via React Query in `src/data/`.
- **UI primitives:** `src/components/ui/` (button, combobox, context-menu, tooltip, switch, modal).
  Feature components are co-located in the feature folder.
- **Panels:** `src/panels/` (agent/file/terminal/new-tab panel registry/manifest).
- **Terminal:** `src/terminal/` (drop, find, native-renderer, runtime, webview).
- **Git/PR:** `src/git/` (diff, commits, forges, pull-request).
- **Plugins:** `src/plugins/` (+11 subfolders: attachments, buttons, themes, workspace-panels...).
- **Desktop glue:** `src/desktop/` (daemon, electron, browser, updates, permissions).
- **Voice:** `src/voice/`, `src/dictation/`, powered by `@getpaseo/expo-two-way-audio`.
- **i18n:** `src/i18n/resources/*.ts`; English source in `en.ts`; parity test in
  `src/i18n/resources.test.ts`. See `docs/i18n.md`.
- **Constants:** `src/constants/` — `platform.ts` (`isWeb`/`isNative`), `layout.ts`, `theme.ts`,
  `build-profile.ts`.
- **Tests:** co-located `*.test.ts(x)` + `*.browser.test.tsx`; e2e in `packages/app/e2e/browser/`
  (Playwright) and `e2e/mobile/` + `maestro/` (device flows); shared harness in `e2e/support/`.

### `packages/cli` — the command line

- `src/cli.ts` — Commander tree. `src/commands/<group>/` one folder per command group: `agent/`
  (ls, run, logs, attach, send, wait...), `daemon/`, `hub/`, `plugin/`, `provider/`, `schedule/`,
  `script/`, `speech/`, `terminal/`, `workspace/`, `worktree/`, `permit/`.
- `src/output/` — renderers (table, json, yaml, quiet). `src/ssh/ssh-tunnel.ts` for remote daemons.
- `src/utils/client.ts` — daemon wiring.

### `packages/desktop` — the Electron wrapper

- `src/main.ts` + `src/preload.ts` (sandboxed). `src/daemon/` — daemon manager/lifecycle.
- `src/window/` — window-manager, compositor-watchdog. `src/features/` — auto-updater,
  browser-automation (CDP), browser-webviews, editor-targets (20 IDE targets: vscode, cursor,
  zed, jetbrains...), notifications, dialogs.
- `src/integrations/cli-install/`, `src/settings/desktop-settings.ts`, `src/system/` (Rosetta
  checks), `src/diagnostics/`.

### `packages/relay` — encryption + transport

- `src/` flat: `crypto.ts` (tweetnacl Curve25519), `encrypted-channel.ts` (ECDH handshake),
  `e2ee.ts`, `cloudflare-adapter.ts` (Cloudflare Durable Object relay, protocol v1/v2),
  `cutover-proxy.ts`, `types.ts`.

### `packages/highlight` / `packages/plugin` / `packages/expo-two-way-audio`

- `highlight`: Lezer/CodeMirror highlighter. `parsers.ts` (extension -> parser registry),
  `themes.ts` (8 palettes), `syntax-roles.ts`, vendored grammar dirs (`csharp/`, `svelte/`, `nix/`,
  `astro/`). Guarded by a dependency-closure test (undeclared peer deps break the app.asar).
- `plugin`: plugin SDK. Root = shared (`defineRpc`, `defineSettings`, `defineAttachmentSource`);
  `/server` = server contributions/hooks; `/client` = React hooks (`usePaseo`, `useRpc`, ...).
  Peer deps matter — client bundles only get host-provided modules.
- `expo-two-way-audio`: native expo module; `src/core.ts` (playPCMData, recording), `events.ts`,
  `hooks.ts`; native code under `android/` and `ios/`; compiles to `build/` (not `dist/`).

### `packages/website` — marketing + docs (paseo.sh)

- TanStack Start + Vite on Cloudflare Workers. `src/routes/` (landing, docs via `docs/$.tsx`,
  blog, changelog, ~45 agent pages, alternatives), `src/server-entry.ts` (Worker fetch handler:
  `/llms.txt`, docs markdown endpoints, caching), docs pipeline renders `public-docs/`.

---

## 5. Task -> location map (the context index)

Given a task, start here. These are the canonical homes — when asked "where does X live", come
here and stop digging.

| Task / question | Home |
| --- | --- |
| Agent states, archive, subagents, parent/child | `docs/agent-lifecycle.md` + `packages/server/src/server/agent/` |
| Add/gate a provider (Claude/Codex/Copilot/OpenCode/Pi, ACP) | `docs/providers.md`, `docs/custom-providers.md`, `packages/server/src/server/agent/providers/`, `packages/protocol/src/provider-manifest.ts` |
| Add a git forge (GitHub/GitLab/Gitea/Forgejo) | `docs/forge-providers.md`, `packages/server/src/services/forge-*.ts` |
| WebSocket RPC / wire schemas | `docs/rpc-namespacing.md`, `docs/protocol-compatibility.md`, `packages/protocol/src/messages.ts` |
| Persisted state (any JSON store) | `docs/data-model.md`, `$PASEO_HOME` layout, store surfaces behind `packages/server/src/server/` stores |
| Config (`paseo.json`, `config.json`) | `docs/data-model.md` (persisted config), `packages/protocol/src/paseo-config-schema.ts`, `packages/server/src/server/persisted-config.ts` |
| Plugin host / plugin SDK work | `docs/plugins.md`, `packages/server/src/server/plugins/`, `packages/plugin/`, `public-docs/plugins/reference.md` |
| App route / startup restore change | `docs/expo-router.md` (mandatory), `packages/app/src/app/`, `packages/app/src/navigation/` |
| UI hover / panels / menus / forms | `docs/hover.md`, `docs/floating-panels.md`, `docs/menus.md`, `docs/forms.md`, `packages/app/src/panels/` |
| Styling / theme | `docs/unistyles.md`, `docs/design.md`, `packages/app/src/styles/`, `packages/app/src/constants/theme.ts` |
| Terminal UI or terminal backend | `packages/app/src/terminal/`, `packages/server/src/terminal/`, `docs/terminal-performance.md` |
| Message stream / pacing | `docs/agent-stream-performance.md`, `packages/app/src/agent-stream/` |
| Timeline (sequence, epochs, subscriptions) | `docs/timeline-sync.md`, `packages/app/src/timeline/`, `packages/client/src/timeline-subscription/` |
| Voice / STT / TTS / dictation | `packages/server/src/server/speech/`, `packages/app/src/voice/`, `packages/app/src/dictation/`, `packages/expo-two-way-audio/` |
| Workspaces / worktrees / reconciliation | `packages/server/src/server/workspace-*`, `docs/data-model.md`, `packages/app/src/workspace-tabs/` |
| Schedules / heartbeats / scripts | `packages/server/src/schedule/`, `packages/protocol/src/schedule/`, `packages/app/src/schedules/` |
| Permissions / auth / pairing | `docs/permissions.md`, `packages/server/src/server/authorization/`, `auth.ts`, `pairing-offer.ts` |
| Hub | `docs/hub.md`, `packages/server/src/server/hub/`, `public-docs/hub/` |
| Service proxy (public script URLs) | `docs/service-proxy.md`, `packages/server/src/server/service-proxy*` |
| Relay / E2E encryption | `packages/relay/`, `SECURITY.md`, `docs/architecture.md` (deployment models) |
| Electron specifics (updater, CDP browser, IDE targets) | `packages/desktop/src/features/`, `docs/browser-capture-harness.md` |
| Desktop daemon lifecycle | `packages/desktop/src/daemon/`, `packages/server/src/server/daemon-instance.ts` |
| File observer (watch) | `docs/file-observation.md`, `packages/server/src/server/file-observer/` |
| i18n / translated copy | `docs/i18n.md`, `packages/app/src/i18n/` |
| CLI command work | `packages/cli/src/commands/<group>/`, `packages/cli/src/cli.ts` |
| Terminal activity indicators | `docs/terminal-activity.md`, `packages/server/src/terminal/agent-hooks/` |
| Syntax highlighting | `packages/highlight/` |
| Website / public docs copy | `packages/website/src/routes/`, `public-docs/` |
| The `session.ts` god file | `docs/refactors/session-decomposition-plan.md`, `packages/server/src/server/session.ts` |

---

## 6. Conventions and hard rules

Laws of the repo. The full text lives in `CLAUDE.md`; the abridged map is below.

### Mandatory commands

- Run `npm run typecheck` and `npm run lint` **after every change**.
- Run `npm run format` before committing (oxfmt/Biome). Never hand-fix formatting.
- **Never** run the full test suite or full Playwright suite locally — they freeze the machine.
  Run only the changed file with `npx vitest run <path> --bail=1`. Trust green results another
  agent already reported. For full confidence, push to CI.
- **Never run tools directly** with `npx eslint`, `npx oxlint`, `npx oxfmt`. Always through the npm
  script (pass file paths to `npm run lint -- <paths>` / `npm run format:files -- <paths>`).
- `npm run build:client` then `npm run build:server` to fix stale cross-package `dist` type errors.
  Don't patch inferred callback params or add duplicate types to silence stale declarations.
- Add tests to existing suites; reuse their npm scripts and CI jobs. Never create feature-specific
  test suites.

### Protocol rules (non-negotiable)

- **Protocol contract (always):** old client parses new daemon and vice-versa. New fields optional;
  never narrow, remove, or require. Wire schemas stay pure — no `.transform()`, `.catch()`,
  `.preprocess()`.
- **Feature contract (per-feature):** gate once on `server_info.features.*`, then run the feature or
  tell the user to update the host. No fallback paths, no defensive branches.
- Every shim tagged `// COMPAT(name): added in vX, remove after <date>`. `rg "COMPAT\\("` is the
  cleanup backlog.
- New RPCs use dotted namespaces + direction suffixes (`domain.provider.operation.request` /
  `.response`). See `docs/rpc-namespacing.md`.

### Critical rules (from CLAUDE.md)

- **NEVER restart the main Paseo daemon on port 6767 without permission** — it manages all running
  agents; if you are an agent, restarting it kills you. Timeouts are not a reason to restart.
- **NEVER add auth checks to tests** — providers handle their own auth.
- Read `docs/expo-router.md` before touching app routes, startup routing, remembered workspace
  restore, or active workspace selection.
- "This goes to next" -> retarget the PR to `next` (release branch discipline in `docs/release.md`).

### Platform gating

Default is cross-platform (iOS, Android, web, Electron). Gate only when necessary, importing from
`@/constants/platform`:

| Need | Use |
| --- | --- |
| DOM APIs (`document`, `window`, `<div>`) | `if (isWeb)` — exception, not default |
| Native-only APIs (Haptics, camera, push) | `if (isNative)` |
| Electron bridge | `getIsElectron()` |
| Layout between phone and tablet/desktop | `useIsCompactFormFactor()` |
| iOS/Android specifically | `Platform.OS === "ios"` / `"android"` (rare, inline) |

- Prefer Metro file extensions (`.web.tsx` / `.native.tsx` / `.electron.tsx`) over big `if (isWeb)`
  blocks. Reserve `if (isWeb)` for small inline checks. Never raw DOM without an `isWeb` guard.
- NEVER use `onPointerEnter`/`onPointerLeave` (don't fire on native iOS). Hover only works on web;
  for hover-reveal use `isHovered || isNative || isCompact`.
- Don't use `Platform.OS` as a layout proxy; use breakpoints.

### Coding standards (condensed)

Zero complexity budget. `function` over arrow-assignment, `interface` over `type`, no `index.ts`
barrels, no `any`/`as` casts/`@ts-ignore`, `z.infer` when a Zod schema exists, one canonical type per
concept, object params at 3+ args, typed error classes with `instanceof`, no nested ternaries, max
3 nesting levels, no `-utils/-helpers/-manager` filename suffixes, delete comments that lose zero
information, `useEffect` only for external-system sync, server state through React Query, subscribe
narrowly (`useShallow`, pass `status` not `agent`). Full text in `docs/coding-standards.md`.

### Testing (condensed)

Exactly two categories, nothing in between:

1. **Unit** — colocated `*.test.ts`, injected interfaces + typed in-memory fakes. No `vi.mock`,
   `vi.spyOn` of own exports, JSDOM, `@testing-library` mounting, monkey-patched globals.
2. **Real E2E** — real daemon/browser/server. No env gates, no conditional skipping.

Suffix routing: `*.test.ts` (unit), `*.posix.test.ts`, `*.browser.test.ts`, `*.e2e.test.ts` (real
daemon), `*.real.e2e.test.ts` (real providers, creds in `packages/server/.env.test`),
`*.local.e2e.test.ts`. Fallible user actions expose Pending/Success/Failure UI (`Alert.alert` is a
no-op on web). Determinism first; flaky tests are a bug, never delete the test.

---

## 7. Data model quick reference

File-based JSON everywhere, validated at runtime by Zod, atomic writes (temp + rename), no
migration framework. Everything under `$PASEO_HOME` (default `~/.paseo`):

| Path | Contents |
| --- | --- |
| `agents/{cwd-with-dashes}/{agent-id}.json` | Agent records |
| `projects/projects.json`, `projects/workspaces.json` | Project + workspace registry |
| `config.json` | Persisted daemon config (`PersistedConfigSchema`) |
| `daemon-keypair.json` | Libsodium keypair (mode 0600) |
| `paseo.pid` | Supervisor-published ready-worker endpoint; CLI trusts only this live record |
| `schedules/{id}.json` | Schedules (8-hex ids; `cron` is canonical, `every` legacy) |
| `plugins/sources.json`, `push-tokens.json`, `server-id` | Misc state |
| `daemon.log` | Daemon logs |

Key invariants: `workspaceId` is the single source of agent ownership (stamped at create); runtime
never infers ownership/status from `cwd`. Project identity is exact (`path.resolve`, never
`realpath`). Client-side durable replica in IndexedDB / expo-sqlite keyed `(serverId, kind, id)`,
32 MiB cap, **not encrypted**. Full details: `docs/data-model.md`.

---

## 8. Agent skills and workflows

Skills shipped in this checkout (consumed by agents via the skill tool; `skills/paseo/` etc.):

| Skill | Purpose |
| --- | --- |
| `paseo` | Operate projects/workspaces/agents/schedules/heartbeats via MCP tools + CLI |
| `paseo-help` | Product/setup/config/troubleshooting questions; use current public docs, not memory |
| `paseo-advisor` | Spin up a single advisor agent (second opinion; analysis only, no edits) |
| `paseo-committee` | Two contrasting agents do root-cause analysis + plan in parallel |
| `paseo-handoff` | Hand work off between agents |
| `paseo-plugin` | Build/manage plugins (contribution matrix, SDK boundaries, lifecycle hooks) |
| `release-beta` / `release-stable` | Cut / promote releases (in `.agents/skills/` + `.claude/skills/`) |

Cross-agent handoff discipline: when you take over work, re-read `Blueprint.md`, the owning doc from
section 2, and the in-progress plan (`docs/refactors/session-decomposition-plan.md`); never trust
another agent's prose summary of a codebase fact that is checkable in two minutes from source.

---

## 9. Keeping this map current

This file is a living index. When you land a change that moves a subsystem, adds a doc, or renames a
canonical path, update the matching row here (and `CLAUDE.md`'s doc table if you added a doc). A
Blueprint row that points an agent to the wrong file fails the cross-agent contract faster than no
Blueprint at all.