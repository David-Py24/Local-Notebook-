# OpenChamber Blueprint

How the OpenChamber monorepo fits together. This is the architecture read: what
the packages own, how a session moves through the stack, and where each feature
lives. It pairs with `AGENTS.md` (the working rules) and `AGENT.md` (how the
agent tools are wired). All counts are ballpark from the tree, good for sizing,
not for quoting.

## The core idea

OpenChamber is the workspace around OpenCode. OpenCode is the AI coding engine:
it owns sessions, messages, permissions, and the model calls, scoped to a
directory. OpenChamber is a React app and a small server layer that run that
engine, review its output, and keep the work available across desktop, web, VS
Code, and mobile.

One fact drives most of the architecture: **OpenChamber does not store the
conversation.** Sessions and messages live in OpenCode's own store, keyed by
directory. OpenChamber streams them, extends OpenCode with product features
through its APIs and proxy, and keeps its own state only for what OpenCode has
no concept of (projects, folders, queueing, scheduled runs, notes, goals,
settings).

## The main data flow

```
              packages/ui (shared React app)
        the same UI runs on every surface
              sessions, messages, parts,
              permissions stream over SSE/WS
                        |
                        v
        packages/web (the OpenChamber server)
        Express shell that owns the session
        with OpenCode: proxy /api, stream events,
        route OpenChamber features (goals, tasks,
        tunnels, guests, small model)
                        |
                        v
        OpenCode CLI (the engine, managed process)
        source of truth for sessions and messages
        per working directory
```

Three of the five runtimes embed this stack differently:

- **Web and desktop** run the full stack. Desktop runs `packages/web/server` in
  the Electron main process, no sidecar. The OpenCode CLI is the only managed
  child process.
- **VS Code** runs no OpenChamber server at all. The extension host spawns the
  OpenCode CLI itself and talks to the shared UI through a bridge instead of HTTP.
- **Mobile and hosted mobile** bundle only the UI. They connect to an existing
  OpenChamber server over LAN or the encrypted relay.

## Monorepo map

Bun workspace, Node 22+, bun 1.4.2. Roughly 5,000 files and 700k lines of
TypeScript, most of it in `ui`.

| Package | Size | Role |
| --- | --- | --- |
| `packages/ui` | ~2,900 files, ~430k lines | The shared React app. State, sync, runtime bridges, themes, settings; the only package that knows the product's screens |
| `packages/web` | ~650 files, ~130k lines | The server: OpenChamber's Express app, the CLI, and the OpenChamber-owned feature modules on top of OpenCode |
| `packages/vscode` | ~140 files, ~30k lines | Extension host, webview bridge, managed OpenCode process |
| `packages/sdk` | ~100 files, ~15k lines | The guest contract for third-party extension panels (manifest, postMessage protocol, `connectHost`) |
| `packages/electron` | ~130 files, ~12k lines | The native desktop shell, no UI of its own |
| `packages/mobile` | ~110 files | Capacitor shell, bundles the mobile web build |
| `packages/extensions` | 3 files | App-owned SDK extension registry, currently empty |
| `packages/docs` | ~580 files | MDX docs source, shipped as an artifact to a separate website repo |

Everything the UI needs to know about the engine goes through `@opencode-ai/sdk/v2`
(1.18.31, pinned). OpenChamber's own extensions use `@openchamber/sdk` from the
workspace. Types from the SDK are never copied into `ui`.

## packages/ui: the shared app

`src/` splits into a few layers, in rough data-flow order.

**Sync layer (`src/sync`, ~130 files).** The largest subsystem. Two session data
scopes, deliberately separate:

- Directory-scoped child stores, one per runtime and directory, backed by SSE
  plus directory-scoped polling and prioritized bootstrap scheduling
  (`sync-context.tsx`).
- A global sessions cache (`stores/useGlobalSessionsStore.ts`) for the cold,
  cross-directory lists the sidebar and retention need.

Between them sits `event-pipeline.ts`, which opens the WebSocket, coalesces
events, flushes in ordered batches every 100 ms, and hands each batch to pure
reducers. Live activity is always derived from live channels, never from
persisted history. `DOCUMENTATION.md` in that folder is the canonical owner of
these invariants and is dense on purpose; read it before touching sync.

**Stores (`src/stores`, ~130 files).** Zustand, three layers with different
performance contracts. Feature caches such as `useGitStore` and
`useGitHubPrStatusStore` are the most performance-sensitive: leaf selectors,
visible-driven refresh, no broad subscriptions, no hidden polling. UI state such
as `useUIStore` gates panels, dialogs, and persisted preferences. Project
coordination stores tie sessions, folders, and message queues together.

**Runtime layer (`src/lib`).** The decoupling layer that lets one app run on
every surface. `RuntimeAPIs` are injected into the app at boot
(`contexts/runtimeAPIContext.ts`), `runtimeFetch` resolves `/api`, `/auth`, and
`/health` against the active endpoint and rides the relay tunnel when active.
`lib/runtimeSurface.ts` decides surface from an explicit stamp, URL, Capacitor
shell, or phone heuristics. Every URL and every store key composes the runtime
key plus directory, because sessions in different runtimes or worktrees never
share state.

**Components.** The chat tree (`components/chat/`, ~320 files) is the biggest:
transcript, composer, message parts, work-status panel. `components/views/`
holds the full-surface views (diff, git, files, plan, settings, terminal).
`components/session/` holds the virtualized sidebar. Context-panel surfaces
rail, chat, and full-screen guest pages are declared in the registry at
`lib/surfaces/` and rendered by `components/layout/ContextPanel.tsx`.

**Entrypoints (`src/apps/`).** `WebApp`, `MobileApp`, `VSCodeApp`, and
`ElectronMiniChatApp` each mount the same shell with the right runtime APIs and
surface detection. The router keeps full URL sync on web and desktop, and
state-only sync in VS Code.

**Guests (`src/lib/guests/`, ~60 files).** The host side of the SDK extension
contract: frame URL, postMessage bridge, capabilities, OAuth, install, item
store. Types come from `@openchamber/sdk`, never re-declared here.

## packages/web: the server and CLI

The server (`server/index.js`, ~2,100 lines) is an assembly: it constructs
~30 runtimes from `server/lib/*` in dependency order, then wires them onto one
Express app. Ownership therefore follows the module directories.

**The gateway (`server/lib/opencode`, ~110 files).** The heart. It manages the
OpenCode process lifecycle, resolves its environment, restarts it, and exposes a
hand-rolled proxy that mounts under `/api`. Known routes are handled locally
(SSE forwarders with heartbeats, interactive OAuth callbacks); everything else
is forwarded to the managed OpenCode with header filtering. Theming, settings
normalization, provider/agent/command/MCP/snippet/plugin/skill routes, and the
feature-route registration all live here too.

**The OpenChamber features (`server/lib/*`, 43 modules).** Each is a focused
owner with its own `DOCUMENTATION.md`:

- Session concerns: `session-goal`, `session-assist` (recap and suggestion via
  the small model), `session-knowledge` (the one answer for what a session must
  be told), `context-obligatory` (pinned messages), `message-queue` (follow-up
  messages while a session is idle).
- Scheduling and orchestration: `scheduled-tasks` (daily/weekly/cron, with
  cross-instance occurrence locking), `openchamber-sessions`
  (directory-scoped dispatch), `openchamber-control` (the shared control
  contract behind the CLI and the `openchamber`-agent tool).
- Access: `ui-auth` (UI password, passkeys, trusted devices),
  `client-auth` (remote client bearer tokens and pairing),
  `security` (LAN exposure guard), `permission-auto-accept`.
- Transport: `relay` (host side of the private relay, E2EE, one host per
  machine), `tunnels` (Cloudflare, ngrok), `dev-tunnel`, `event-stream` (the
  global and per-directory WebSocket bridges with delta coalescing).
- Small-model intelligence: `small-model`, `walkthrough` (the guided diff
  reading, hunks addressed by content hash), `routing` (Jev model routing,
  feature-flagged).
- Integrations: `github`, `linear` (session status comments),
  `notifications` (web push, APNs), `dictation` and `tts` (offline STT/TTS),
  `skills-catalog` (skill install), `guests` (SDK panel serving),
  `browser-control` (agent browser actions to the client that owns the view),
  `agent-memory`, `fs`, `git`, `terminal` (PTY over a snapshot-first binary WS
  protocol), `projects`, `project-context`, `quota`, `magic-prompts`,
  `markdown-image-grants`, `agent-tool`.
- Storage is filesystem-first: project config at
  `<userConfigRoot>/projects/<id>.json`, project notes at
  `<projectsDir>/<projectId>/`, scheduled tasks live in the project config,
  routing state in `routing.json` plus `routing-auth.json` (0600).

**The CLI (`bin/`).** Thin by rule; the domain logic lives in `server/lib`.
`cli.js` dispatches commands and owns signal/cleanup; `lib/cli-output.js` keeps
the interactive, non-TTY, `--quiet`, and `--json` shapes consistent. Commands:
`serve`, `stop`, `restart`, `status`, `logs`, `models`, `projects`, `schedule`,
`session`, `startup`, `update`, `tunnel`, `connect-url`.

**Web surfaces (`src/`).** Three Vite entries build from the shared UI:
`index.html`, `mobile.html` (Capacitor), `mini-chat.html`. The service worker
(PWA) is cache-first via Workbox. Dev proxies `/api` and `/auth` to a local
server on 3001.

## packages/electron: the native shell

No UI lives here. `main.mjs` (~5,500 lines) starts the web server in-process via
`startWebUiServer()`, owns windows, menus, deep links, IPC, updates, tray, and
SSH. The preload exposes `window.__OPENCHAMBER_DESKTOP__`; privileged commands
are checked in main, not in the UI. Packaged builds load staged assets over a
custom `openchamber-ui://` protocol while the loopback server stays the API
backend; dev loads the HMR server. Native modules and `@openchamber/web` stay
external in the bundle. Nothing OpenCode-feature-shaped belongs here; the rule
is to keep domain logic in `packages/web`.

## packages/vscode: the serverless runtime

The extension hosts the shared UI in three webviews (`ChatViewProvider` for the
sidebar, plus session editor and agent-manager panels) and renders exactly the
same `renderVSCodeApp` as the web build, loaded via Vite alias back into
`packages/ui/src`. There is no OpenChamber server: the extension host spawns the
OpenCode CLI as a child (or connects to an external one), and webviews reach it
only through a `postMessage` bridge that proxies HTTP, SSE (with a watchdog),
local filesystem, git, and config. Server-only features are stubbed
deterministically. The shared sync layer and message loader still run, since
OpenCode's SSE feeds them the same way.

## packages/mobile and hosted mobile

Capacitor 8 shells, iOS and Android, bundling the web build's `mobile.html` so
the native WebView always boots `MobileApp` (hosted `mobile.html` in a browser
keeps web behavior). The device owns no server: a connection screen pairs to an
existing OpenChamber server, and connections persist with a per-device client
token in the keystore. The terminal runs on the server, never the device.
There are no tests; validation is type-check, lint, and native builds.

## packages/sdk: the guest contract

Third-party panels are sandboxed iframes. `@openchamber/sdk` is the guest-side
contract (`connectHost`, manifest parse, helpers, and the plain-DOM UI kit),
`/schemas` is the zod parser the host uses on untrusted input, and inside the
repo Vite always resolves these to `src/` so `dist/` never goes stale. Messages
are a versioned postMessage envelope (`v: 1`) validated on both ends, with the
protocol compile-time-asserted against the schemas. The iframe gets
`allow-scripts` only, no same-origin, so no ESM; guests ship a classic IIFE,
bundled by `bundle-guest.ts`.

## packages/extensions and the built-ins pipeline

`packages/extensions/registry.json` is the app-owned allowlist for built-in SDK
extensions. It is currently empty; the machinery around it is tested and ready.
`scripts/build-builtin-extensions.mjs` bundles each registry entry against
`packages/sdk/src`, stamps the app version, validates the result with the same
parser used for user installs, and swaps the built output atomically into
`packages/web/server/built-in-extensions`.

## Cross-cutting subsystems

**The state authority model.** OpenCode owns sessions and messages. OpenChamber
owns everything else and keeps three rules: authoritative state beats heuristics,
a failed fetch is never a successful empty result, and one failed entity never
erases unrelated entities. Read `sync/DOCUMENTATION.md` and `stores/DOCUMENTATION.md`
before working on either layer.

**Settings registry.** Settings are declared once in
`packages/ui/src/lib/settings/registry.ts` with one scope per key (instance vs
device), and the registry generates JSON snapshots consumed by the server and
the VS Code extension host (`bun run settings-registry:generate`).

**Themes.** The full theme engine (`packages/ui/src/lib/theme`) parses authored
JSON themes, derives syntax tokens, and generates CSS variables. Themes are
shared with the server's theming runtime which serves `/api/config/themes`.

**Small-model features.** `server/lib/small-model` makes direct LLM calls
reusing OpenCode's auth. It powers session goals, the walkthrough, and
session-assist recaps. All of them are server-owned, event-triggered, and never
modify the session transcript.

**Multi-run and fusion are UI-native.** Run groups are ordinary OpenCode
sessions whose titles encode `<group>/<run>/<model>`; fusion is a magic prompt
the UI composes that asks for the best combined answer. The server only persists
user overrides of those prompts. This is the pattern to remember when a feature
seems to straddle packages: ask who keeps state, and who just renders.

## Tooling and validation

- `bun run oc-dev` is the interactive dev menu (web, electron, mobile,
  release). `dev-web-hmr`, `dev-web-full`, `dev-vscode`, and the mobile
  `sim:*` scripts cover the rest.
- Profilers under `scripts/perf/` capture browser CPU, session load, animation,
  and switch metrics against a deterministic fixture provider. Measure a
  production build, always compare an identical-scenario before and after.
- `tools/oxlint/anti-slop` is a vendored oxlint plugin that rejects low-evidence
  typing (unjustified assertions, `unknown` contracts, ad hoc dictionaries,
  module mocking). `bun run deslop` and `bun run doctor` batch-fix findings in
  claimed disjoint batches.
- The changelog pipeline renders `changelog/*.md` into the VS Code changelog,
  `changelog/index.json`, and the legacy `CHANGELOG.md`; `unreleased.md` is the
  only file edited by hand.

## Where to start reading

| Question | Start here |
| --- | --- |
| Why does this session list look wrong? | `packages/ui/src/sync/DOCUMENTATION.md` |
| Must I add a store? | `packages/ui/src/stores/DOCUMENTATION.md` |
| How does the UI reach a server? | `packages/ui/src/lib/runtime-fetch.ts`, `ui-api-decoupling` skill |
| Where does a new server feature plug in? | `packages/web/server/lib/<module>/`, register routes in `server/lib/opencode/feature-routes-runtime.js` |
| How does the CLI stay consistent? | `packages/web/bin/lib/DOCUMENTATION.md` |
| What exactly does the bridge proxy? | `packages/vscode/src/DOCUMENTATION.md` |
| How do extension panels work? | `packages/sdk/DOCUMENTATION.md`, `packages/sdk/src/ui/DOCUMENTATION.md` |
| Terminal internals | `packages/ui/src/lib/ghostty/DOCUMENTATION.md` |
| Performance methodology | `scripts/perf/DOCUMENTATION.md` |