# MCP Connectors & Online Research Plan

Design for scaffolding connectors into Local Study Notebook via **MCP (Model Context Protocol)**
servers, and expanding research so the agent can **search the web when the system is online**.

---

## 1. Context: what exists today

Before adding MCP, it's worth mapping what already powers the assistant, because the two
paths *converge* in a clean way:

| Layer | Today |
|---|---|
| **Study Assistant** | `src/services/aiProvider.ts` → `streamAIResponse()`. OpenAI-compatible SSE to a BYOK/local Ollama endpoint. |
| **Function calling** | `src/services/workspaceTools.ts` — hard-coded `WORKSPACE_TOOLS` array (search_vault, read_active_note, get_note_backlinks), executed by `executeWorkspaceTool()`. |
| **Agentic mode** | `OpenCodeView.tsx` + `commands.rs` spawns `opencode serve` (a local HTTP/SDK agent runtime) with workspace tools: file edit, git, shell, LSP. |
| **Data / sources** | SQLite (`db.rs`) for notes + vault index/backlinks; local vault files via `commands.rs`. |
| **Persistence** | Settings/projects/themes in `localStorage` (`lsn_*` keys). |

**Key observation:** the two assistant surfaces are effectively already "MCP-ish":
the Study Assistant exposes an OpenCode-style tool schema, and OpenCode itself
supports MCP. So the scaffold should make "connectors" a **first-class, user-managed
resource** shared by both surfaces, rather than a second parallel mechanism.

---

## 2. Goals & non-goals

### Goals
- **G1 — Connector manager**: let users register/enable/disable external MCP servers
  (local `stdio` servers and remote `streamable-http` servers) from a Settings tab.
- **G2 — Unified tool surface**: registered connectors surface as tools available to the
  Study Assistant (function calling) in addition to the built-in workspace tools.
- **G3 — Online research**: add a set of web-search / web-fetch connector presets so either
  the assistant or the agent can pull current information when online, and degrade
  gracefully when offline.
- **G4 — Offline-first integrity**: all connectors are opt-in; nothing phones home
  unless the user enables it and a network path is available.

### Non-goals (keep out of v1)
- Standalone MCP *server* hosting / serving our own vault to other apps.
- OAuth/credential-vault for arbitrary cloud connectors beyond the BYOK provider model.
- Auto-discovery of MCP servers on the network.

---

## 3. High-level architecture

```
┌───────────────────────────────────────────────────────────────┐
│ frontend (React/Zustand)                                       │
│                                                                │
│  StudyAssistant  ──► src/services/*                            │
│  OpenCodeView    ──► opencode serve (spawned sidecar, live)   │
│         │                    │                                 │
│         ▼                    ▼                                 │
│  ┌──────────────────────────────────────────┐                 │
│  │         Tool Router (new)                 │                 │
│  │  builtin workspace tools  ·  mcp tools   │                │
│  └───────────────┬──────────────────────────┘                 │
│                  │ invoke(...)                                 │
└──────────────────┼────────────────────────────────────────────┘
                   ▼
        ┌──────────────────────────┐
        │   Rust: tauri commands   │ commands.rs / new mcp.rs
        │    - list_connectors     │
        │    - start_connector     │ (spawn stdio child | connect http)
        │    - call_connector_tool │ (MCP initialize → tools/call)
        │    - stop_connector      │
        └──────────────────────────┘
                   │
        ┌──────────┼──────────┬──────────────────┐
        ▼          ▼          ▼                  ▼
   local stdio   remote    builtin vault      web research
   server        http       (search_vault,    connectors
   (filesystem,  connector  backlinks)        (tavily, brave,
    git, etc.)   (arxiv,                     wikipedia, arxiv,
                 fetch, etc.)                 serper)
```

### The three responsibilities
1. **Rust MCP host** (`mcp.rs`) — process/connection lifecycle + JSON-RPC framing.
2. **Frontend tool router** (`src/services/mcp.ts` + changes to `workspaceTools.ts`) —
   merges builtin tools with connector tools into one OpenAI-style `tools` payload.
3. **Connector registry** — persisted in `localStorage` (reusing the `lsn_*` pattern) as
   `lsn_connectors`.

---

## 4. Data model

Add to `src/types/index.ts`:

```ts
export type ConnectorKind = "stdio" | "http";

export interface McpConnector {
  id: string;                 // stable id (uuid)
  name: string;               // display name
  kind: ConnectorKind;
  // stdio server (local binary)
  command?: string;             // e.g. "npx"
  args?: string[];              // e.g. ["-y", "@modelcontextprotocol/server-filesystem", "/vault"]
  cwd?: string;
  // http (streamable-http) server
  url?: string;                 // e.g. "https://mcp.tavily.com/sse"
  headers?: Record<string, string>; // optional headers/API keys
  // common
  enabled: boolean;             // opt-in, default false
  env?: Record<string, string>; // scoped child env vars (never written to disk)
  tools?: string[];             // cached list of tool names exposed by this server
}
```

`Settings` gains:

```ts
connectors: McpConnector[];
```

Defaults ship with a few **preset** research connectors (disabled until the user enables
them and supplies a key where required) — see §7.

---

## 5. Rust host design (`src-tauri/src/mcp.rs`)

### Lifecycle model
- Connectors are **lazy-started**: `start` on first tool call / explicit enable, `stop` on
  disable, app critical-section flush on window close. This keeps the core offline-first —
  nothing runs by default.
- **stdio** connectors: spawn the child, speak MCP JSON-RPC over stdin/stdout (newline- or
  LSP-style content-length delimited — support both per the MCP transport spec).
- **http** connectors: `streamable-http` / SSE. `ureq`+`tts` on a background thread, or reuse
  the upcoming `reqwest` if added. Prefer an async command (`#[tauri::command] async`) so a
  slow/down cloud connector can't block the UI thread.

### MCP message flow (minimal subset)
```
initialize  →  initialized/notification  →  tools/list
   →  for each call: tools/call  →  resources/read (optional)
```
State tracked per connector: `NotStarted | Running(ClientId) | Failed(String)`.

### Commands (registered in `lib.rs`)
```rust
#[tauri::command] async fn list_connector_tools(cfg: ConnectorConfig) -> Result<Vec<ToolDef>, String>
#[tauri::command] async fn call_connector_tool(cfg: ConnectorConfig, name: String, args: Value) -> Result<McpCallResult, String>
#[tauri::command] async fn test_connector(cfg: ConnectorConfig) -> Result<ConnectorHealth, String>
#[tauri::command] async fn stop_connector(id: String, pid: Option<u32>) -> Result<(), String>
```

- The **pid** from stdio spawn is kept in a `HashMap<String, ChildHandle>` managed state
  (mirrors the existing `opencodeServerPid` pattern).
- `ConnectorConfig` is passed per-call (frontend-owned) rather than Rust-owned, so the config
  source of truth stays in the Zustand store — consistent with how `<default.json>` scope and
  the existing app already thread config.

### Security guardrails
- stdio servers run with a **restricted `env`** (only the user-provided map merged onto a
  minimal PATH), mirroring how `spawn_opencode_server` injects keys scoped to one child.
- http connectors: validate `https:` for remote URLs (allow `http://127.0.0.1:*` for local
  test servers).
- Tool/output is treated as untrusted text; rendered via `ReactMarkdown` (already used) —
  no `dangerouslySetInnerHTML`.

---

## 6. Frontend tool router

### 6.1 Merge builtin + connector tools
Modify `src/services/workspaceTools.ts` so the tool list isn't a constant exported for the AI
payload, but produced by a function:

```ts
export async function buildEffectiveTools(): Promise<ToolDefinition[]> {
  const builtin = WORKSPACE_TOOLS;                       // existing static array
  const connectors = await useStore.getState()
    .settings.connectors.filter((c) => c.enabled);
  const connTools: ToolDefinition[] = [];
  for (const c of connectors) {
    const found = await invoke("list_connector_tools", { cfg: connectorToConfig(c) });
    connTools.push(...found.filter((t) => c.tools?.includes(t.function.name) ?? true));
  }
  return [...builtin, ...connTools];
}
```

`streamAIResponse` in `aiProvider.ts` switches from using `WORKSPACE_TOOLS` directly to
calling `buildEffectiveTools()` (await it before composing `payload.tools`).

### 6.2 Dispatch tool calls
`executeWorkspaceTool(name, args)` gains a connector-aware branch:

```ts
// after builtin-name checks, before the "unknown tool" fallthrough:
const connector = connectors.find((c) => c.enabled && c.tools?.includes(name));
if (connector) {
  return invoke("call_connector_tool", { cfg: connectorToConfig(connector), name, args });
}
```

### 6.3 OpenCode Agent (agentic) reuse — free win
Because OpenCode *natively supports MCP*, the same connector registry can be exported to the
`opencode serve` child. In `spawn_opencode_server` (commands.rs), when building the child's
config, inject `--mcp-server <name>=<command/url>` flags (or an `opencode.json` written into
the vault `.opencode/` dir) for every enabled connector. This gives the **agent** the same web
research capability with zero new UI. Keys stay scoped to the child.

> **Verified implementation notes (live against opencode v1.18.16):**
> `opencode serve` has **no** `--mcp-server` flag; MCP servers are registered via project config
> only. Accepted schema (confirmed by writing a temp `opencode.json` and running `opencode mcp list`):
> - stdio: `{ "type": "local", "command": ["cmd", "arg..."], "enabled": true }`
> - http:   `{ "type": "remote", "url": "https://...", "headers": { "k": "{env:VAR}" } }`
> `{env:VAR}` substitution is real, so secrets go into the file as placeholders and their
> values are injected as child-scoped env vars — never written to disk.
>
> Shipped implementation (`buildOpencodeMcpExport` in `useStore.ts` + `spawn_opencode_server`
> in `commands.rs`):
> - Writes a project-local `opencode.json` into the vault **only when no opencode config exists**
>   there (`opencode.json(c)` at root or under `.opencode/`) — user config is never clobbered;
>   otherwise skipped with a warning.
> - Exports enabled connectors; offline `http` ones are skipped (mirrors the workspace router).
> - All headers/env → `{env:}` placeholders; real values scoped to the sidecar env on spawn.
> - `kill_opencode_server` removes the generated file (tracked via a static `Mutex<Option<PathBuf>>`).

---

## 7. Connector presets (research expansion)

Shipped as built-in registry entries (disabled by default). Enabling requires consent; remote
ones show a "🔌 requires internet" badge.

| Preset | Kind | What it unlocks | Key needed |
|---|---|---|---|
| **Brave Search** | http | web search API | yes (`api_key` header) |
| **Tavily** | http | research-aware web search | yes |
| **Wikipedia** | stdio/http | wikitext fetch | no |
| **Arxiv Search** | http | paper metadata/summaries | no |
| **Fetch / raw URLs** | stdio (`mcp-server-fetch`) | fetch + `fetch.ts` extraction | no |
| **Filesystem** | stdio (`mcp-server-filesystem`) | browse folders outside the vault | no |

### Web-search example flow (Study Assistant)
1. User: *"Summarize the current state of MCP in 2026"* (system online, connector enabled).
2. `buildEffectiveTools()` exposes `tavily_search`.
3. Model emits `tools` call `tavily_search {query}`.
4. Router → `invoke("call_connector_tool", ...)` → Rust → Tavily → JSON results.
5. Tool result returned to model; model synthesizes an answer with citations.

### Offline behavior
- A `navigator.onLine` + per-request guard: web connectors return the same
  **"⚠️ Not connected — enable this connector / go online"** message the AI layer already
  uses for a failed endpoint. The Study Assistant automatically drops web-only tools from
  `buildEffectiveTools()` when offline so the model never wastes a turn calling an
  unreachable tool.

---

## 8. Settings UI (new tab: "Connectors & Research")

Mirror the existing Settings sidebar (`SettingsModal.tsx`). Add a section id
`"connectors"` between `ai_byok` and `about`.

Contents:
- **Connector list** — each row: name, kind badge (`stdio`/`http`), status dot
  (off/starting/ready/error), enable toggle, "Test" button, "Configure" (expands inline to
  edit command/args/url/headers), "Remove".
- **"Add Connector"** menu: two options — *Add from preset* (dropdown of §7) and *Add custom*
  (blank form for `stdio` or `http`).
- **Offline indicator** at the top: `navigator.onLine ? "Online" : "Offline — web connectors unavailable"`.
- Store via `addConnector / updateConnector / removeConnector / testConnector` Zustand actions,
  persisted to `localStorage` (`lsn_connectors`) in `updateSettings`.

---

## 9. Store / state additions (`useStore.ts`)

Add actions maintaining the registry (all persisted through `updateSettings`):

```ts
addConnector: (c: Omit<McpConnector, "id" | "enabled" | "tools">) => void;
updateConnector: (id: string, patch: Partial<McpConnector>) => void;
removeConnector: (id: string) => void;
testConnector: (id: string) => Promise<ConnectorHealth>;
```

Rust command coupling stays thin — the store is still the single source of truth, exactly as
with `settings`, `projects`, `customLayouts`, etc.

---

## 10. Rust `Cargo.toml` additions

```toml
# MCP JSON-RPC + http transport. Prefer async for stdio/http to keep UI responsive.
tokio = { version = "1", features = ["full"] }      # already transitively present via tauri
ureq = { version = "2", features = ["json", "tls"] } # heartbeat/https, minimal deps
```
(If a shared `reqwest` is later needed for other features, prefer that over `ureq`.)

---

## 11. Build & verification plan

1. `npx tsc --noEmit` — new types/actions compile.
2. `cargo check` in `src-tauri` — new `mcp.rs` compiles.
3. `npm run build` — production bundle passes TS.
4. Manual smoke test (release exe):
   - Enable **Wikipedia** connector → assistant can cite a live article.
   - Enable **Tavily/Brave** → web search works when online.
   - Turn network off → web tools disappear from `buildEffectiveTools()`, assistant replies
     with the offline notice instead of failing a tool turn.
   - Confirm no connector process survives window close (check Task Manager).

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Cloud connector latency blocks UI | async Rust commands; per-call timeout (reuse `withTimeout` pattern) |
| Malicious/garbage stdio server | user opt-in, warning on "Add custom", minimal env, kill-on-close |
| API keys exposed | never persisted to disk; passed as scoped env/headers per call, mirroring OpenCode child |
| MCP protocol drift | support both newline + content-length framing; fail the connector, not the app |
| Tool-name collisions (builtin vs connector) | namespace connector tools `<server>/<tool>`; router disambiguates, strips prefix at call site |
| OpenCode feature parity | export registry to child via `--mcp-server`; keep both surfaces reading the same store |

---

## 13. Suggested implementation order

1. **Data + store**: `McpConnector` type, `Settings.connectors`, store actions, local persistence.
2. **Rust host**: `mcp.rs` with stdio + http transport, JSON-RPC init/list/call; register commands.
3. **Router**: `buildEffectiveTools()` + dispatch branch in `executeWorkspaceTool`; wire into `aiProvider.ts`.
4. **Presets**: ship the research connectors; offline-aware tool filtering.
5. **Settings UI**: Connectors tab.
6. **OpenCode export**: inject registry into `opencode serve` for agent-side parity.
7. **Verification** (per §11).

`````````````````````````````````````````````````````````
# ____Afterword / Appendix B. Full implementation file snapshot____

> This appendix embeds the **full current contents** of every source file created or modified by the
> connector/research work in this session (byte-faithful, concatenated from disk). New files are marked
> `(new)`; modified files are `(modified)` with a short note describing exactly what was added.
> Pre-existing code in the modified files is included for completeness — it is not part of the diff.
### 1. `src-tauri/src/mcp.rs` (new)

Full MCP host: stdio (Content-Length framed JSON-RPC with a persistent child + reader thread) and streamable-http (reqwest blocking, SSE parsing, Mcp-Session-Id reuse). Commands: list_connector_tools, call_connector_tool, test_connector, stop_connector.

````rust
// ---------------------------------------------------------------------------
// MCP (Model Context Protocol) connector host.
//
// Manages the lifecycle of registered MCP servers so the frontend can treat any
// connector (local stdio binary or remote streamable-http server) as a source of
// tools for the AI assistant / agent. Mirrors the design in MCP_CONNECTORS_PLAN.md:
//   - lazy: connectors only start on first tool call / explicit enable
//   - offline-first: nothing connects unless a connector is enabled by the user
//   - per-connector processes are tracked in the managed `McpState` map so they can
//     be killed cleanly on disable / window interactions
//
// Transport notes:
//   - stdio uses LSP-style Content-Length framed JSON-RPC (the MCP stdio spec)
//   - http uses streamable-http: POST per request, Accept json + event-stream,
//     Mcp-Session-Id reused when the server issues one
// ---------------------------------------------------------------------------

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const MCP_READ_TIMEOUT: Duration = Duration::from_secs(20);
const MCP_CONNECT_TIMEOUT: Duration = Duration::from_secs(12);
const MCP_PROTOCOL_VERSION: &str = "2024-11-05";

// ---------------------------------------------------------------------------
// Managed state
// ---------------------------------------------------------------------------

pub struct McpState(Arc<Mutex<HashMap<String, McpClient>>>);

impl Default for McpState {
    fn default() -> Self {
        McpState(Arc::new(Mutex::new(HashMap::new())))
    }
}

pub(crate) enum McpClient {
    Stdio(McpStdioClient),
    Http(McpHttpClient),
}

pub(crate) struct McpStdioClient {
    child: Child,
    stdin: Option<ChildStdin>,
    rx: mpsc::Receiver<Value>,
    seq: u64,
}

#[derive(Default, Clone)]
pub(crate) struct McpHttpClient {
    session_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Wire types (mirror the frontend `McpConnector` shape)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)] // `name`/`tools` are presentational/cache fields from the frontend contract
pub struct ConnectorConfig {
    pub id: String,
    pub name: Option<String>,
    pub kind: String, // "stdio" | "http"
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub cwd: Option<String>,
    pub url: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub env: Option<HashMap<String, String>>,
    pub tools: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Serialize)]
pub struct McpContent {
    #[serde(rename = "type")]
    pub kind: String,
    pub text: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct McpCallResult {
    pub content: Vec<McpContent>,
    pub is_error: bool,
}

#[derive(Debug, Serialize)]
pub struct ConnectorHealth {
    pub ok: bool,
    pub tool_count: usize,
    pub error: Option<String>,
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

fn jsonrpc_client_info() -> Value {
    json!({
        "protocolVersion": MCP_PROTOCOL_VERSION,
        "capabilities": {},
        "clientInfo": { "name": "local-study-notebook", "version": "1.4.0" }
    })
}

fn request(client: &mut McpStdioClient, method: &str, params: Value) -> Result<Value, String> {
    client.seq += 1;
    let id = client.seq;
    let req = json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params});

    let stdin = client
        .stdin
        .as_mut()
        .ok_or_else(|| format!("'{method}': connector stdin is closed"))?;
    write_frame(stdin, &req).map_err(|e| format!("Failed to write '{method}' request: {e}"))?;

    loop {
        let msg = client.rx.recv_timeout(MCP_READ_TIMEOUT).map_err(|_| {
            format!(
                "Timed out after {:.0}s waiting for '{method}' response (is the connector still running?)",
                MCP_READ_TIMEOUT.as_secs_f32()
            )
        })?;
        if msg.get("id").and_then(Value::as_u64) == Some(id) {
            if let Some(err) = msg.get("error") {
                return Err(format!("Connector returned an error for '{method}': {err}"));
            }
            return Ok(msg.get("result").cloned().unwrap_or_else(|| json!(null)));
        }
        // Notifications / unrelated responses are skipped
    }
}

fn notify(client: &mut McpStdioClient, method: &str) -> Result<(), String> {
    let n = json!({"jsonrpc": "2.0", "method": method});
    let stdin = client
        .stdin
        .as_mut()
        .ok_or_else(|| format!("'{method}': connector stdin is closed"))?;
    write_frame(stdin, &n).map_err(|e| format!("Failed to write '{method}' notification: {e}"))
}

fn stdio_initialize(client: &mut McpStdioClient) -> Result<Value, String> {
    let result = request(client, "initialize", jsonrpc_client_info())?;
    notify(client, "notifications/initialized")?;
    Ok(result)
}

// ---------------------------------------------------------------------------
// stdio transport
// ---------------------------------------------------------------------------

fn spawn_stdio_child(config: &ConnectorConfig) -> Result<Child, String> {
    let command = config
        .command
        .clone()
        .ok_or_else(|| "stdio connector is missing a command".to_string())?;
    let args: Vec<String> = config.args.clone().unwrap_or_default();
    let cwd = config.cwd.clone();
    let env = config.env.clone().unwrap_or_default();

    #[cfg(target_os = "windows")]
    let mut cmd = {
        // npx / python etc. are .cmd/.bat shims on Windows that need cmd /C.
        let mut c = Command::new("cmd");
        c.arg("/C").arg(&command).args(&args);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = Command::new(&command);
        c.args(&args);
        c
    };

    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.envs(env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null()) // draining stderr would risk deadlock; drop it
        .spawn()
        .map_err(|e| format!("Failed to spawn connector '{command}': {e}"))
}

/// Frames a JSON-RPC message using LSP-style Content-Length headers.
fn write_frame(stream: &mut impl Write, value: &Value) -> std::io::Result<()> {
    let body = serde_json::to_vec(value)?;
    write!(stream, "Content-Length: {}\r\n\r\n", body.len())?;
    stream.write_all(&body)?;
    stream.flush()
}

/// Reads one Content-Length framed message from the connector's stdout.
fn read_frame(reader: &mut impl BufRead) -> std::io::Result<Option<Value>> {
    let mut content_length: Option<usize> = None;
    let mut line_buf = Vec::new();
    loop {
        line_buf.clear();
        let n = reader.read_until(b'\n', &mut line_buf)?;
        if n == 0 {
            return Ok(None); // EOF — connector exited
        }
        let line = String::from_utf8_lossy(&line_buf).trim().to_string();
        if line.is_empty() {
            break; // end of headers
        }
        if let Some(rest) = line.strip_prefix("Content-Length:") {
            content_length = rest.trim().parse().ok();
        }
    }
    let len = content_length.ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "missing Content-Length in frame")
    })?;
    let mut body = vec![0u8; len];
    reader.read_exact(&mut body)?;
    serde_json::from_slice(&body)
        .map(Some)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

fn spawn_stdio_reader(stdout: std::process::ChildStdout) -> mpsc::Receiver<Value> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            match read_frame(&mut reader) {
                Ok(Some(msg)) => {
                    if tx.send(msg).is_err() {
                        break; // client dropped the receiver
                    }
                }
                _ => break, // EOF or framing error — connector is gone
            }
        }
    });
    rx
}

fn build_stdio_client(config: &ConnectorConfig) -> Result<McpStdioClient, String> {
    let mut child = spawn_stdio_child(config)?;
    let pid = child.id();
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "connector did not expose stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "connector did not expose stdout".to_string())?;
    let rx = spawn_stdio_reader(stdout);

    let mut client = McpStdioClient {
        child,
        stdin: Some(stdin),
        rx,
        seq: 0,
    };

    if let Err(e) = stdio_initialize(&mut client) {
        let _ = client.child.kill();
        let _ = client.child.wait();
        return Err(format!(
            "Failed to initialize stdio connector (pid {pid}): {e}"
        ));
    }
    Ok(client)
}

// ---------------------------------------------------------------------------
// http (streamable-http) transport
// ---------------------------------------------------------------------------

fn http_post(
    config: &ConnectorConfig,
    method: &str,
    params: Value,
    session_id: &mut Option<String>,
) -> Result<(Value, Option<String>), String> {
    let url = config
        .url
        .clone()
        .ok_or_else(|| "http connector is missing a URL".to_string())?;
    let req_id: u64 = rand_req_id();
    let payload = json!({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params});

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(MCP_READ_TIMEOUT.as_secs().max(
            MCP_CONNECT_TIMEOUT.as_secs(),
        )))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req_builder = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream");
    if let Some(sid) = session_id.as_ref() {
        req_builder = req_builder.header("Mcp-Session-Id", sid);
    }
    for (key, value) in config.headers.clone().unwrap_or_default() {
        req_builder = req_builder.header(key.as_str(), value.as_str());
    }

    let response = req_builder
        .body(payload.to_string())
        .send()
        .and_then(|res| res.error_for_status())
        .map_err(|e| e.to_string())?;

    let new_session_id = response
        .headers()
        .get("Mcp-Session-Id")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let body = response.text().map_err(|e| e.to_string())?;

    let value = if content_type.contains("text/event-stream") {
        parse_sse_response(&body, req_id)?
    } else {
        serde_json::from_str::<Value>(&body)
            .map_err(|e| format!("Connector '{method}' returned non-JSON: {e}"))?
    };

    if let Some(err) = value.get("error") {
        return Err(format!("Connector returned an error for '{method}': {err}"));
    }

    Ok((value, new_session_id))
}

fn rand_req_id() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64)
        .unwrap_or(1)
}

/// Some streamable-http servers answer every POST with a single SSE frame holding
/// the response (id-tagged). Collect `data:` payloads and return the matching one.
fn parse_sse_response(body: &str, req_id: u64) -> Result<Value, String> {
    for line in body.lines() {
        let line = line.trim();
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<Value>(data.trim()) else {
            continue;
        };
        if v.get("jsonrpc").is_some() {
            if let Some(mid) = v.get("id").and_then(Value::as_u64) {
                if mid == req_id {
                    return Ok(v);
                }
            }
        }
    }
    // Fall back to treating the whole body as JSON (mislabeled mime).
    serde_json::from_str(body)
        .map_err(|e| format!("Did not find a response for request {req_id} in SSE stream: {e}"))
}

/// Streamable-http: the `initialized` notification is a separate empty POST that
/// carries the session id so the server transitions the session to "ready".
fn http_send_initialized_notification(config: &ConnectorConfig, session_id: &str) {
    let Ok(client) = reqwest::blocking::Client::builder()
        .timeout(MCP_CONNECT_TIMEOUT)
        .build()
    else {
        return;
    };
    let Some(url) = config.url.clone() else {
        return;
    };
    let req = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Mcp-Session-Id", session_id);
    let _ = req.send();
}

fn http_ensure_ready(config: &ConnectorConfig, client: &mut McpHttpClient) -> Result<(), String> {
    if client.session_id.is_none() {
        let (_result, sid) = http_post(config, "initialize", jsonrpc_client_info(), &mut client.session_id)?;
        if let Some(s) = sid {
            client.session_id = Some(s);
        }
        if let Some(sid) = client.session_id.as_ref() {
            http_send_initialized_notification(config, sid);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Response extraction
// ---------------------------------------------------------------------------

fn extract_tools(v: &Value) -> Result<Vec<McpTool>, String> {
    let result = v.get("result").cloned().unwrap_or_default();
    let tools = result
        .get("tools")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(tools
        .into_iter()
        .map(|t| McpTool {
            name: t.get("name").and_then(Value::as_str).unwrap_or("").to_string(),
            description: t
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            input_schema: t.get("inputSchema").cloned().unwrap_or_else(|| json!({})),
        })
        .collect())
}

fn extract_call_result(v: &Value) -> McpCallResult {
    let result = v.get("result").cloned().unwrap_or_default();
    let content = result
        .get("content")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|c| McpContent {
            kind: c.get("type").and_then(Value::as_str).unwrap_or("text").to_string(),
            text: c.get("text").and_then(Value::as_str).map(str::to_string),
        })
        .collect();
    let is_error = result
        .get("isError")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    McpCallResult { content, is_error }
}

// ---------------------------------------------------------------------------
// Router helpers shared by the commands
// ---------------------------------------------------------------------------

fn ensure_client(
    map: &mut HashMap<String, McpClient>,
    config: &ConnectorConfig,
) -> Result<(), String> {
    if map.contains_key(&config.id) {
        return Ok(());
    }
    if config.kind == "http" {
        let mut client = McpHttpClient::default();
        http_ensure_ready(config, &mut client)?;
        map.insert(config.id.clone(), McpClient::Http(client));
    } else {
        let client = build_stdio_client(config)?;
        map.insert(config.id.clone(), McpClient::Stdio(client));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Returns the list of tools exposed by a connector (starting it if necessary).
/// Cached client state stays alive in `McpState` for subsequent calls.
#[tauri::command]
pub async fn list_connector_tools(
    state: tauri::State<'_, McpState>,
    config: ConnectorConfig,
) -> Result<Vec<McpTool>, String> {
    let arc = state.0.clone();
    let inner = tauri::async_runtime::spawn_blocking(move || {
        let mut map = arc.lock().map_err(|e| e.to_string())?;
        ensure_client(&mut map, &config)?;
        match map.get_mut(&config.id) {
            Some(McpClient::Stdio(client)) => {
                let v = request(client, "tools/list", json!({}))?;
                extract_tools(&v)
            }
            Some(McpClient::Http(client)) => {
                http_ensure_ready(&config, client)?;
                let (v, sid) = http_post(&config, "tools/list", json!({}), &mut client.session_id)?;
                if let Some(s) = sid {
                    client.session_id = Some(s);
                }
                extract_tools(&v)
            }
            None => Err("Connector was removed while starting".to_string()),
        }
    })
    .await
    .map_err(|e| format!("MCP tool listing task panicked: {e}"))?;
    inner
}

/// Invokes a tool on a connector and returns the rendered content blocks.
#[tauri::command]
pub async fn call_connector_tool(
    state: tauri::State<'_, McpState>,
    config: ConnectorConfig,
    name: String,
    args: Value,
) -> Result<McpCallResult, String> {
    let arc = state.0.clone();
    let inner = tauri::async_runtime::spawn_blocking(move || {
        let mut map = arc.lock().map_err(|e| e.to_string())?;
        ensure_client(&mut map, &config)?;
        match map.get_mut(&config.id) {
            Some(McpClient::Stdio(client)) => {
                let v = request(client, "tools/call", json!({"name": name, "arguments": args}))?;
                Ok(extract_call_result(&v))
            }
            Some(McpClient::Http(client)) => {
                http_ensure_ready(&config, client)?;
                let (v, sid) = http_post(
                    &config,
                    "tools/call",
                    json!({"name": name, "arguments": args}),
                    &mut client.session_id,
                )?;
                if let Some(s) = sid {
                    client.session_id = Some(s);
                }
                Ok(extract_call_result(&v))
            }
            None => Err("Connector was removed while starting".to_string()),
        }
    })
    .await
    .map_err(|e| format!("MCP tool call task panicked: {e}"))?;
    inner
}

/// Health check used by the Settings "Test" button: initialize + tools/list, then
/// tear the connector back down so the test never leaves a process running.
#[tauri::command]
pub async fn test_connector(
    state: tauri::State<'_, McpState>,
    config: ConnectorConfig,
) -> Result<ConnectorHealth, String> {
    let _arc = state.0.clone();
    let inner = tauri::async_runtime::spawn_blocking(move || {
        if config.kind == "http" {
            let mut client = McpHttpClient::default();
            http_ensure_ready(&config, &mut client)?;
            let (v, sid) = http_post(&config, "tools/list", json!({}), &mut client.session_id)?;
            if let Some(s) = sid {
                client.session_id = Some(s);
            }
            let tools = extract_tools(&v)?;
            return Ok(ConnectorHealth {
                ok: true,
                tool_count: tools.len(),
                error: None,
            });
        }

        let mut client = build_stdio_client(&config)?;
        let list = request(&mut client, "tools/list", json!({}));
        let tools = match list {
            Ok(v) => extract_tools(&v),
            Err(e) => {
                let _ = client.child.kill();
                let _ = client.child.wait();
                return Err(e);
            }
        };
        let _ = client.child.kill();
        let _ = client.child.wait();
        match tools {
            Ok(t) => Ok(ConnectorHealth {
                ok: true,
                tool_count: t.len(),
                error: None,
            }),
            Err(e) => Err(e),
        }
    })
    .await
    .map_err(|e| format!("Connector test task panicked: {e}"))?;
    inner
}

/// Stops a running connector by id (kills the stdio child if present).
#[tauri::command]
pub async fn stop_connector(
    state: tauri::State<'_, McpState>,
    id: String,
) -> Result<(), String> {
    let arc = state.0.clone();
    let inner = tauri::async_runtime::spawn_blocking(move || {
        let mut map = arc.lock().map_err(|e| e.to_string())?;
        if let Some(McpClient::Stdio(mut client)) = map.remove(&id) {
            let _ = client.child.kill();
            let _ = client.child.wait();
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Connector stop task panicked: {e}"))?;
    inner
}
````

### 2. `src/types/index.ts` (modified)

Added `ConnectorKind` and `McpConnector` (the rest of the file is pre-existing).

````ts
export interface Source {
  id: number;
  title: string;
  file_type: string;
  file_path: string | null;
  raw_content: string;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  source_id: number | null;
  title: string;
  content: string;
  pinned: boolean;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface OpenTab {
  id: number; // note id, -1 for a new blank note
  title: string;
  sourceId: number | null;
  pinned: boolean;
  dirty: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  pinned?: boolean;
  lastOpened: string; // ISO timestamp
}

export type ConnectorKind = "stdio" | "http";

export interface McpConnector {
  id: string;
  name: string;
  kind: ConnectorKind;
  // stdio server (local binary)
  command?: string;
  args?: string[];
  cwd?: string;
  // http (streamable-http) server
  url?: string;
  headers?: Record<string, string>;
  // common
  enabled: boolean;
  env?: Record<string, string>;   // scoped child env vars (never persisted secrets)
  tools?: string[];               // cached list of tool names exposed by this server
}

````

### 3. `src/stores/useStore.ts` (modified)

Added `settings.connectors`, `CONNECTOR_PRESETS`, seed logic, add/update/removeConnector actions, and `buildOpencodeMcpExport`. Full current file below.

````ts
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { getThemeById, applyThemeToDocument } from "../themes";
import type { Project, McpConnector } from "../types";
import { streamAIResponse, fetchAvailableModels } from "../services/aiProvider";

// Debounce window for the lazy Memory-RAG embedding pass that runs after vault reindex.
let pendingEmbedRebuildTimer: ReturnType<typeof setTimeout> | null = null;


// Built-in research connector presets (offline-first: shipped disabled). Users opt in
// per-connector in Settings -> Connectors & Research. Remote presets that need a key
// leave `headers` empty until the user supplies credentials.
export const CONNECTOR_PRESETS: McpConnector[] = [
  {
    id: "preset-wikipedia",
    name: "Wikipedia",
    kind: "http",
    url: "https://mcp-wikipedia.vdo.pub/sse",
    enabled: false,
    headers: {},
  },
  {
    id: "preset-arxiv",
    name: "Arxiv Research",
    kind: "http",
    url: "https://mcp-papers-api.arxiv.org/sse",
    enabled: false,
    headers: {},
  },
  {
    id: "preset-filesystem",
    name: "Filesystem",
    kind: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    enabled: false,
    env: {},
  },
  {
    id: "preset-fetch",
    name: "Fetch (raw URLs)",
    kind: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-fetch"],
    enabled: false,
    env: {},
  },
];


export type ViewMode = "source" | "live" | "preview";
export type SaveStatus = "saved" | "saving" | "unsaved";
export type SidePanelId = "assistant" | "sources" | "artifacts" | "agent";

export interface Artifact {
  id: string;
  title: string;
  type: "code" | "markdown" | "html";
  content: string;
  createdAt: number;
}

export interface AgentMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: number;
}

export type AgentTask = "summarize" | "improve" | "assess" | "custom";

export interface CustomLayout {
  id: string;
  name: string;
  panelOrder: SidePanelId[];
  showAssistantPanel: boolean;
  showSourcesPanel: boolean;
  showArtifactsPanel: boolean;
  showAgentPanel: boolean;
  assistantWidth: number;
  sourcePanelWidth: number;
  artifactsWidth: number;
  agentWidth: number;
  splitActive: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[] | null;
}

export interface Tab {
  id: string; // absolute file path
  title: string;
  pinned: boolean;
}

export interface SessionTab {
  id: string;
  title: string;
  active: boolean;
  openTabs: Tab[];
}

export interface UserAccount {
  name: string;
  email: string;
  avatarLetter: string;
  avatarColor: string;
}

export interface GoogleAccount {
  name: string;
  email: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// Pending destructive file-write tool approval (Phase 2b approval gate). A tool call
// suspends in `executeWorkspaceTool` until the user approves or rejects it.
export interface PendingToolApproval {
  id: string;
  tool: string;
  args: Record<string, any>;
  summary: string;
  status: "pending" | "approved" | "rejected";
}

const INITIAL_ASSISTANT_MESSAGES: AssistantMessage[] = [
  {
    id: "msg-1",
    role: "assistant",
    timestamp: "12:00 PM",
    content: "Welcome to Local Study Notebook! I am your offline study assistant. You can ask me for study tips, markdown help, or note-taking advice.",
  },
];

export interface Settings {
  fontSize: number;
  theme: string;
  accentColor: string;
  cornerRoundness: "sm" | "md" | "lg" | "none";
  lineWrap: boolean;
  tabSize: number;
  fontFamily: string;
  showLineNumbers: boolean;
  livePreviewEnabled: boolean;
  livePreviewTimeout: number; // in ms
  startupFolder: string;
  newNoteLocation: string;
  excludedFolders: string;
  attachmentsFolder: string;
  confirmBeforeDelete: boolean;
  reduceMotion: boolean;
  autoPairBrackets: boolean;
  showWordCount: boolean;

  // BYOK AI Engine Settings
  aiEnabled: boolean;
  aiProvider: string; // "ollama_hermes" | "openai" | "anthropic" | "gemini" | "custom"
  aiBaseUrl: string;
  aiApiKey: string;
  aiModelName: string;
  aiEnableWorkspaceTools: boolean;
  aiSystemPrompt: string;

  // Memory-RAG (Agent Knowledge) settings
  embedBaseUrl: string; // Ollama HTTP root, e.g. http://localhost:11434
  embedModel: string;   // embedding model tag, e.g. nomic-embed-text
  ragTopK: number;      // RAG passages injected into context per turn
  memoryAutoSave: boolean; // persist Q&A turns and extracted facts to memory_entries

  // File-mutation tools (create/update/delete) — off by default
  aiEnableFileWrite: boolean;

  // OpenCode Agent Settings
  opencodePort: number;       // default 4096 (OpenCode's own default for `opencode serve`)
  opencodeAutoStart: boolean; // auto-start server when switching to OpenCode Agent tab

  // MCP Connectors
  connectors: McpConnector[];
}

const DEFAULT_SETTINGS: Settings = {
  fontSize: 14,
  theme: "obsidian-dark",
  accentColor: "",
  cornerRoundness: "md",
  lineWrap: true,
  tabSize: 4,
  fontFamily: "system",
  showLineNumbers: false,
  livePreviewEnabled: true,
  livePreviewTimeout: 1000,
  startupFolder: "",
  newNoteLocation: "",
  excludedFolders: "node_modules, .git",
  attachmentsFolder: "_attachments",
  confirmBeforeDelete: true,
  reduceMotion: false,
  autoPairBrackets: true,
  showWordCount: true,

  // BYOK AI Defaults
  aiEnabled: true,
  aiProvider: "ollama_hermes",
  aiBaseUrl: "http://localhost:11434/v1",
  aiApiKey: "",
  aiModelName: "hermes3:8b",
  aiEnableWorkspaceTools: true,
  aiSystemPrompt: "You are an intelligent study assistant for Local Study Notebook. Use workspace tools and context to provide accurate study summaries.",

  // Memory-RAG defaults
  embedBaseUrl: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  ragTopK: 5,
  memoryAutoSave: true,

  // File-mutation tools (create/update/delete) are gated off by default
  aiEnableFileWrite: false,

  // OpenCode Agent defaults
  opencodePort: 4096,        // OpenCode's actual documented default port for `opencode serve`
  opencodeAutoStart: true,

  // MCP Connectors — all disabled by default (offline-first, opt-in). Ship with the
  // research presets below so the user can flip them on in Settings -> Connectors.
  connectors: [],
};

interface AppState {
  // Explorer States
  currentFolderPath: string | null;
  explorerEntries: FileEntry[];
  pinnedPaths: string[];
  showSourcesPanel: boolean; // Toggles the Sidebar Explorer panel
  sidebarTab: "sources" | "notes"; // "sources" represents Folder Explorer, "notes" is Pinned/Recent notes list

  // Panel ordering (left-to-right order of the two side panels, StudyBoard is always last/center)
  panelOrder: SidePanelId[];
  reorderPanels: (fromId: SidePanelId, toId: SidePanelId) => void;

  // Split-Screen Workspace States
  splitActive: boolean;
  activePanel: "left" | "right";
  leftTabs: Tab[];
  rightTabs: Tab[];
  activeLeftTabId: string | null;
  activeRightTabId: string | null;
  leftDraft: string;
  rightDraft: string;
  leftViewMode: ViewMode;
  rightViewMode: ViewMode;
  leftSaveStatus: SaveStatus;
  rightSaveStatus: SaveStatus;
  leftLivePreviewActive: boolean;
  rightLivePreviewActive: boolean;
  sourcePreviewHeight: number;
  sourcePanelWidth: number;
  splitLeftWidth: number;   // pixel width of the left split pane (right pane absorbs the rest)

  // Artifacts panel
  showArtifactsPanel: boolean;
  artifactsWidth: number;
  activeArtifact: Artifact | null;
  artifacts: Artifact[];

  // Agent panel
  showAgentPanel: boolean;
  agentWidth: number;
  agentMessages: AgentMessage[];
  agentContext: string | null;
  agentTask: AgentTask;

  // Settings
  showSettings: boolean;
  settings: Settings;

  // Projects
  projects: Project[];
  showProjectsPanel: boolean;
  addProject: (id: string, name: string, path: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  toggleProjectPinned: (id: string) => void;
  openProject: (id: string) => Promise<void>;
  setShowProjectsPanel: (show: boolean) => void;

  // Actions
  openFolder: (path: string) => Promise<void>;
  closeFolder: () => void;
  refreshExplorer: () => Promise<void>;
  createFile: (dirPath: string, name: string) => Promise<string>;
  createFolder: (parentPath: string, name: string) => Promise<string>;
  renameEntry: (oldPath: string, newPath: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;
  moveEntries: (entries: { oldPath: string; newPath: string }[]) => Promise<void>;

  openFile: (path: string, panel?: "left" | "right") => Promise<void>;
  openNewNote: () => Promise<void>;
  closeTab: (panel: "left" | "right", path: string) => Promise<void>;
  selectTab: (panel: "left" | "right", path: string) => Promise<void>;
  flushPendingSave: (panel?: "left" | "right") => Promise<void>;
  setDraftContent: (panel: "left" | "right", content: string) => void;
  saveFile: (panel: "left" | "right", path: string, content: string) => Promise<void>;
  togglePinPath: (path: string) => void;
  setPanelViewMode: (panel: "left" | "right", mode: ViewMode) => void;
  setPanelLivePreview: (panel: "left" | "right", active: boolean) => void;
  setActivePanel: (panel: "left" | "right") => void;
  splitScreen: () => void;
  closeSplit: () => void;
  moveTab: (fromPanel: "left" | "right", toPanel: "left" | "right", path: string) => Promise<void>;
  toggleSourcesPanel: () => void;
  setSidebarTab: (t: "sources" | "notes") => void;
  setSourcePreviewHeight: (h: number) => void;
  setSourcePanelWidth: (w: number) => void;
  setSplitLeftWidth: (w: number) => void;

  // Artifacts actions
  toggleArtifactsPanel: () => void;
  setArtifactsWidth: (w: number) => void;
  setActiveArtifact: (a: Artifact | null) => void;
  addArtifact: (a: Artifact) => void;

  // Agent actions
  toggleAgentPanel: () => void;
  setAgentWidth: (w: number) => void;
  setAgentMessages: (msgs: AgentMessage[]) => void;
  addAgentMessage: (msg: AgentMessage) => void;
  setAgentContext: (ctx: string | null) => void;
  setAgentTask: (task: AgentTask) => void;

  // Settings Actions
  setShowSettings: (show: boolean) => void;
  updateSettings: (s: Partial<Settings>) => void;

  // MCP Connector actions
  addConnector: (c: Omit<McpConnector, "id" | "enabled" | "tools">) => void;
  updateConnector: (id: string, patch: Partial<McpConnector>) => void;
  removeConnector: (id: string) => void;

  // Assistant / Co-pilot States & Actions
  showAssistantPanel: boolean;
  assistantWidth: number;
  assistantMessages: AssistantMessage[];
  selectedModel: string;
  assistantTopicTitle: string;
  filterQuery: string;
  isAssistantStreaming: boolean;
  assistantStatusText: string;
  availableModels: string[];                              // dynamically fetched from provider
  assistantAbortController: AbortController | null;       // never persisted to localStorage

  // OpenCode Agent runtime state (never persisted to localStorage)
  assistantMode: "study" | "opencode";                   // which tab is active
  opencodeInstalled: boolean;                            // result of check_opencode_installed
  opencodeServerPid: number | null;                      // PID of running opencode serve
  opencodeServerPassword: string | null;                 // in-memory only, never persisted

  // Destructive file-tool approval gate (Phase 2b)
  pendingToolApprovals: PendingToolApproval[];
  addPendingToolApproval: (approval: PendingToolApproval) => void;
  resolveToolApproval: (id: string, status: "approved" | "rejected") => void;
  clearToolApproval: (id: string) => void;

  sendAssistantMessage: (text: string) => Promise<void>;
  cancelAssistantMessage: () => void;
  clearAssistantMessages: () => void;
  setAssistantWidth: (w: number) => void;
  toggleAssistantPanel: () => void;
  setSelectedModel: (m: string) => void;
  setAssistantTopicTitle: (t: string) => void;
  setFilterQuery: (q: string) => void;
  fetchAndSetAvailableModels: () => Promise<void>;        // fetches live models from provider

  // OpenCode Agent actions
  setAssistantMode: (mode: "study" | "opencode") => void;
  checkOpencodeInstalled: () => Promise<void>;
  startOpencodeServer: () => Promise<void>;
  stopOpencodeServer: () => Promise<void>;

  // Google Drive backup (BACKUP-0): account + OAuth flow
  googleAccount: GoogleAccount | null;
  backupSigningIn: boolean;
  refreshGoogleAccount: () => Promise<void>;
  connectGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;

  // Session & Account States & Actions (TopBar)
  sessions: SessionTab[];
  activeSessionId: string;
  userAccount: UserAccount;
  showSearchModal: boolean;
  topbarViewMode: "grid" | "split" | "single";
  createSession: (title?: string) => void;
  closeSession: (id: string) => void;
  selectSession: (id: string) => void;
  setShowSearchModal: (show: boolean) => void;
  setTopbarViewMode: (mode: "grid" | "split" | "single") => void;

  // Onboarding
  onboardingComplete: boolean;
  completeOnboarding: () => void;

  // Launcher & Panel Arrangement States & Actions (Iteration 3)
  showLauncherModal: boolean;
  showPanelLayoutModal: boolean;
  panelPreset: "default" | "focus" | "assistant" | "explorer" | "custom";
  setShowLauncherModal: (show: boolean) => void;
  setShowPanelLayoutModal: (show: boolean) => void;
  applyPanelPreset: (preset: "default" | "focus" | "assistant" | "explorer") => void;
  scaffoldWorkspaceTemplate: (folderPath: string) => Promise<void>;

  // Custom saved layouts (TICKET-B4)
  customLayouts: CustomLayout[];
  saveCustomLayout: (name: string) => void;
  applyCustomLayout: (id: string) => void;
  deleteCustomLayout: (id: string) => void;
}

/**
 * Renders the enabled connector registry into the OpenCode config shape opencode actually
 * accepts (verified live on v1.18): "local" (stdio) and "remote" (streamable-http) entries.
 * Secrets (headers/env) become `{env:VAR}` placeholders and the real values are returned in
 * `env` so the Rust side can scope them to the sidecar child only — nothing secret is written
 * to disk. Offline http connectors are skipped, mirroring the workspace-tools router.
 */
export function buildOpencodeMcpExport(
  connectors: McpConnector[],
): { config: string | null; env: Record<string, string> } {
  const servers: Record<string, unknown> = {};
  const env: Record<string, string> = {};
  const used = new Set<string>();
  let envIdx = 0;

  const safeName = (raw: string, _id: string) => {
    let base = (raw || "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (!base) base = "connector";
    let name = base;
    let n = 2;
    while (used.has(name)) {
      name = `${base}-${n++}`;
    }
    used.add(name);
    return name;
  };
  const secretToPlaceholder = (value: string) => {
    const varName = `LSN_MCP_${++envIdx}`;
    env[varName] = value;
    return `{env:${varName}}`;
  };

  for (const c of connectors) {
    if (!c.enabled) continue;
    if (c.kind === "http" && (typeof navigator === "undefined" || !navigator.onLine)) continue;

    if (c.kind === "stdio") {
      const command = (c.command || "").trim();
      if (!command) continue;
      const args = (c.args ?? []).filter((a) => a.trim() !== "");
      const entry: Record<string, unknown> = {
        type: "local",
        command: [command, ...args],
        enabled: true,
      };
      const cEnv = c.env ?? {};
      const envKeys = Object.keys(cEnv).filter((k) => cEnv[k].trim() !== "");
      if (envKeys.length > 0) {
        const mapped: Record<string, string> = {};
        for (const k of envKeys) {
          mapped[k] = secretToPlaceholder(cEnv[k]);
        }
        entry.env = mapped;
      }
      servers[safeName(c.name, c.id)] = entry;
    } else {
      const url = (c.url || "").trim();
      if (!url) continue;
      const entry: Record<string, unknown> = { type: "remote", url };
      const h = c.headers ?? {};
      const headerKeys = Object.keys(h).filter((k) => h[k].trim() !== "");
      if (headerKeys.length > 0) {
        const mapped: Record<string, string> = {};
        for (const k of headerKeys) {
          mapped[k] = secretToPlaceholder(h[k]);
        }
        entry.headers = mapped;
      }
      servers[safeName(c.name, c.id)] = entry;
    }
  }

  const config = Object.keys(servers).length > 0 ? JSON.stringify({ mcp: servers }) : null;
  return { config, env };
}

export const useStore = create<AppState>((set, get) => {
  // Load initial settings and pinned paths from localStorage
  const localSettings = localStorage.getItem("lsn_settings");
  const parsedSettings = localSettings ? JSON.parse(localSettings) : {};
  // Merge persisted settings over defaults; seed the connector registry with presets only
  // on a true first run (no `connectors` key at all). Once the registry exists — even as an
  // empty array — the user's choice is respected.
  const existingConnectors: McpConnector[] | undefined = parsedSettings?.connectors;
  const initialConnectors: McpConnector[] =
    Array.isArray(existingConnectors) ? existingConnectors : CONNECTOR_PRESETS;
  const initialSettings = { ...DEFAULT_SETTINGS, ...parsedSettings, connectors: initialConnectors };
  const initialPinned = localStorage.getItem("lsn_pinned");
  const pinnedPaths = initialPinned ? JSON.parse(initialPinned) : [];
  const savedFolder = localStorage.getItem("lsn_last_folder");
  const localProjects = localStorage.getItem("lsn_projects");
  const initialProjects: Project[] = localProjects ? JSON.parse(localProjects) : [];
  const localPanelOrder = localStorage.getItem("lsn_panel_order");
  const parsedPanelOrder: SidePanelId[] | null = localPanelOrder ? JSON.parse(localPanelOrder) : null;
  const VALID_PANEL_IDS: SidePanelId[] = ["assistant", "sources", "artifacts", "agent"];
  const isValidPanelOrder =
    parsedPanelOrder &&
    Array.isArray(parsedPanelOrder) &&
    parsedPanelOrder.length >= 1 &&
    parsedPanelOrder.length <= 4 &&
    parsedPanelOrder.every((id) => VALID_PANEL_IDS.includes(id)) &&
    parsedPanelOrder.includes("assistant") &&
    parsedPanelOrder.includes("sources");
  const initialPanelOrder: SidePanelId[] = isValidPanelOrder ? parsedPanelOrder! : ["assistant", "sources"];
  const localCustomLayouts = localStorage.getItem("lsn_custom_layouts");
  const initialCustomLayouts: CustomLayout[] = localCustomLayouts ? JSON.parse(localCustomLayouts) : [];
  const onboardingComplete = localStorage.getItem("lsn_onboarding_complete") === "true";
  const localSessions = localStorage.getItem("lsn_sessions");
  const initialSessions: SessionTab[] = localSessions
    ? JSON.parse(localSessions)
    : [{ id: "sess-default", title: "Default Session", active: true, openTabs: [] }];
  const initialActiveSessionId = initialSessions.find((s) => s.active)?.id || initialSessions[0].id;

  // Apply the persisted theme immediately (live colors)
  const themeColors = getThemeById(initialSettings.theme).colors;
  applyThemeToDocument({
    ...themeColors,
    accent: initialSettings.accentColor || themeColors.accent,
    accentHover: initialSettings.accentColor || themeColors.accentHover,
  });

  // Local write timer refs managed inside store callbacks
  let leftSaveTimer: number | null = null;
  let rightSaveTimer: number | null = null;

  return {
    // Explorer States
    currentFolderPath: savedFolder || null,
    explorerEntries: [],
    pinnedPaths: pinnedPaths,
    showSourcesPanel: true,
    sidebarTab: "sources",
    sourcePanelWidth: 200,
    panelOrder: initialPanelOrder,

    // Projects
    projects: initialProjects,
    showProjectsPanel: false,

    // Split-Screen Workspace States
    splitActive: false,
    activePanel: "left",
    leftTabs: [],
    rightTabs: [],
    activeLeftTabId: null,
    activeRightTabId: null,
    leftDraft: "",
    rightDraft: "",
    leftViewMode: "live",
    rightViewMode: "live",
    leftSaveStatus: "saved",
    rightSaveStatus: "saved",
    leftLivePreviewActive: false,
    rightLivePreviewActive: false,
    sourcePreviewHeight: 250,
    splitLeftWidth: 0,

    // Artifacts
    showArtifactsPanel: false,
    artifactsWidth: 340,
    activeArtifact: null,
    artifacts: [],

    // Agent
    showAgentPanel: false,
    agentWidth: 340,
    agentMessages: [],
    agentContext: null,
    agentTask: "custom",

    // Assistant States
    showAssistantPanel: true,
    assistantWidth: 380,
    assistantMessages: INITIAL_ASSISTANT_MESSAGES,
    selectedModel: "Big Pickle",
    assistantTopicTitle: "Local Study Notebook implementation plan",
    filterQuery: "",

    // Session & Account States
    sessions: initialSessions,
    activeSessionId: initialActiveSessionId,
    userAccount: {
      name: "Developer Workspace",
      email: "developer@localnotebook.app",
      avatarLetter: "D",
      avatarColor: "#7c3aed"
    },
    googleAccount: null,
    backupSigningIn: false,
    showSearchModal: false,
    topbarViewMode: "split",

    // Launcher & Panel Arrangement States (Iteration 3)
    showLauncherModal: false,
    showPanelLayoutModal: false,
    panelPreset: "default",
    customLayouts: initialCustomLayouts,

    // Onboarding
    onboardingComplete: onboardingComplete,

    // Settings
    showSettings: false,
    settings: initialSettings,

    // Folder Actions
    openFolder: async (path) => {
      set({ currentFolderPath: path });
      localStorage.setItem("lsn_last_folder", path);
      await get().refreshExplorer();
      // Full vault-index rescan (DATA-2) — fire-and-forget so a large vault's content
      // hashing doesn't delay the folder actually opening; incremental updates from
      // individual file operations keep the index current the rest of the time.
      // Once the rescan lands, kick the lazy Memory-RAG embedding pass (debounced) so
      // chunk rows written by this rescan get vectors without blocking the open.
      invoke("reindex_vault", { vaultRoot: path })
        .then(() => {
          if (pendingEmbedRebuildTimer !== null) clearTimeout(pendingEmbedRebuildTimer);
          pendingEmbedRebuildTimer = setTimeout(() => {
            pendingEmbedRebuildTimer = null;
            const s = get().settings;
            if (!s.aiEnabled) return;
            import("../services/agentKnowledge").then(({ rebuildEmbeddings }) => {
              rebuildEmbeddings(path, s).catch(() => {});
            });
          }, 800);
        })
        .catch((err) => {
          console.error("Failed to reindex vault:", err);
        });
    },

    closeFolder: () => {
      set({ currentFolderPath: null, explorerEntries: [], leftTabs: [], rightTabs: [], activeLeftTabId: null, activeRightTabId: null });
      localStorage.removeItem("lsn_last_folder");
    },

    refreshExplorer: async () => {
      const folderPath = get().currentFolderPath;
      if (!folderPath) return;
      try {
        const excludedList = get()
          .settings.excludedFolders.split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        const entries = await invoke<FileEntry[]>("read_local_dir", {
          path: folderPath,
          excludedFolders: excludedList,
        });
        set({ explorerEntries: entries });
      } catch (err) {
        console.error("Failed to read local folder explorer directory:", err);
      }
    },

    createFile: async (dirPath, name) => {
      try {
        const path = await invoke<string>("create_local_file", {
          dirPath,
          name,
          vaultRoot: get().currentFolderPath || undefined,
        });
        await get().refreshExplorer();
        return path;
      } catch (err) {
        throw new Error(String(err));
      }
    },

    createFolder: async (parentPath, name) => {
      try {
        const path = await invoke<string>("create_local_dir", {
          parentPath,
          name,
          vaultRoot: get().currentFolderPath || undefined,
        });
        await get().refreshExplorer();
        return path;
      } catch (err) {
        throw new Error(String(err));
      }
    },

    renameEntry: async (oldPath, newPath) => {
      try {
        await invoke("rename_local_entry", {
          oldPath,
          newPath,
          vaultRoot: get().currentFolderPath || undefined,
        });
        
        // Update tabs referencing this path
        const updateTabs = (tabs: Tab[]) =>
          tabs.map((t) => {
            if (t.id === oldPath) {
              const name = newPath.split(/[\\/]/).pop() ?? newPath;
              return { ...t, id: newPath, title: name.replace(/\.md$/, "") };
            }
            return t;
          });

        const leftTabs = updateTabs(get().leftTabs);
        const rightTabs = updateTabs(get().rightTabs);
        const activeLeft = get().activeLeftTabId === oldPath ? newPath : get().activeLeftTabId;
        const activeRight = get().activeRightTabId === oldPath ? newPath : get().activeRightTabId;

        set({ leftTabs, rightTabs, activeLeftTabId: activeLeft, activeRightTabId: activeRight });
        await get().refreshExplorer();
      } catch (err) {
        throw new Error(String(err));
      }
    },

    moveEntries: async (entries) => {
      try {
        for (const entry of entries) {
          await invoke("rename_local_entry", {
            oldPath: entry.oldPath,
            newPath: entry.newPath,
            vaultRoot: get().currentFolderPath || undefined,
          });

          // Update open tabs that reference the old path
          const updateTabs = (tabs: Tab[]) =>
            tabs.map((t) => {
              if (t.id === entry.oldPath) {
                const name = entry.newPath.split(/[\\/]/).pop() ?? entry.newPath;
                return { ...t, id: entry.newPath, title: name.replace(/\.md$/, "") };
              }
              return t;
            });

          const leftTabs = updateTabs(get().leftTabs);
          const rightTabs = updateTabs(get().rightTabs);
          const activeLeft = get().activeLeftTabId === entry.oldPath ? entry.newPath : get().activeLeftTabId;
          const activeRight = get().activeRightTabId === entry.oldPath ? entry.newPath : get().activeRightTabId;

          set({ leftTabs, rightTabs, activeLeftTabId: activeLeft, activeRightTabId: activeRight });
        }
        await get().refreshExplorer();
      } catch (err) {
        throw new Error(String(err));
      }
    },

    deleteEntry: async (path) => {
      try {
        await invoke("delete_local_entry", {
          path,
          vaultRoot: get().currentFolderPath || undefined,
        });
        
        // Close tabs referencing this path
        get().closeTab("left", path);
        get().closeTab("right", path);
        
        await get().refreshExplorer();
      } catch (err) {
        throw new Error(String(err));
      }
    },

    // File Workspace Actions
    openFile: async (path, panel) => {
      const targetPanel = panel || get().activePanel;
      const isLeft = targetPanel === "left";
      const tabs = isLeft ? get().leftTabs : get().rightTabs;
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;

      if (activeId === path) return;

      await get().flushPendingSave(targetPanel);

      // Check if already open in this panel
      const existing = tabs.find((t) => t.id === path);
      if (existing) {
        if (isLeft) {
          set({ activeLeftTabId: path });
        } else {
          set({ activeRightTabId: path });
        }
        // Load contents into draft
        try {
          const content = await invoke<string>("read_local_file", {
            path,
            vaultRoot: get().currentFolderPath || undefined,
          });
          if (isLeft) set({ leftDraft: content, leftSaveStatus: "saved" }); else set({ rightDraft: content, rightSaveStatus: "saved" });
        } catch {}
        return;
      }

      // Read file content
      let content = "";
      try {
        content = await invoke<string>("read_local_file", {
          path,
          vaultRoot: get().currentFolderPath || undefined,
        });
      } catch (err) {
        console.error("Failed to read file", err);
        return;
      }

      const filename = path.split(/[\\/]/).pop() ?? "Note";
      const title = filename.replace(/\.md$/, "");
      const isPinned = get().pinnedPaths.includes(path);
      const newTab: Tab = { id: path, title, pinned: isPinned };

      const activeTab = tabs.find((t) => t.id === activeId);

      if (tabs.length === 0 || activeId === null || !activeTab || activeTab.pinned) {
        // Open in new tab
        const newTabs = [...tabs, newTab];
        if (isLeft) {
          set({ leftTabs: newTabs, activeLeftTabId: path, leftDraft: content, leftSaveStatus: "saved" });
        } else {
          set({ rightTabs: newTabs, activeRightTabId: path, rightDraft: content, rightSaveStatus: "saved" });
        }
      } else {
        // Reuse current active unpinned tab
        const newTabs = tabs.map((t) => (t.id === activeId ? newTab : t));
        if (isLeft) {
          set({ leftTabs: newTabs, activeLeftTabId: path, leftDraft: content, leftSaveStatus: "saved" });
        } else {
          set({ rightTabs: newTabs, activeRightTabId: path, rightDraft: content, rightSaveStatus: "saved" });
        }
      }
    },

    openNewNote: async () => {
      const folderPath = get().currentFolderPath;
      if (!folderPath) {
        alert("Please open a local workspace folder first to create notes!");
        return;
      }

      const subFolder = get().settings.newNoteLocation.trim();
      let targetDir = folderPath;
      if (subFolder) {
        targetDir = `${folderPath}/${subFolder}`.replace(/[\\/]+/g, "/");
        try {
          await get().createFolder(folderPath, subFolder);
        } catch {
          // Subfolder may already exist
        }
      }

      // Try "Untitled", "Untitled 1", "Untitled 2", ... letting the backend's actual
      // filesystem check decide what already exists, rather than predicting it here —
      // `explorerEntries` is a flat, top-level-only, possibly-stale list, and comparing
      // its paths against a JS-joined `${dir}/${name}` string breaks on Windows anyway
      // (backend paths use `\`, this join always uses `/`), so a real pre-existing
      // "Untitled.md" was never detected and every click hit the backend's own
      // "File already exists" rejection instead of picking the next available name.
      const MAX_ATTEMPTS = 200;
      let lastErr: unknown = null;
      for (let index = 0; index <= MAX_ATTEMPTS; index++) {
        const name = index === 0 ? "Untitled" : `Untitled ${index}`;
        try {
          const path = await get().createFile(targetDir, name);
          await get().openFile(path);
          return;
        } catch (err) {
          lastErr = err;
          if (!String(err).toLowerCase().includes("already exists")) break;
        }
      }
      alert("Failed to create new file: " + lastErr);
    },

    closeTab: async (panel, path) => {
      const isLeft = panel === "left";
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;

      if (activeId === path) {
        await get().flushPendingSave(panel);
      }

      const tabs = isLeft ? get().leftTabs : get().rightTabs;
      const newTabs = tabs.filter((t) => t.id !== path);
      let nextActive = activeId;

      if (activeId === path) {
        nextActive = newTabs.length ? newTabs[newTabs.length - 1].id : null;
      }

      if (isLeft) {
        set({ leftTabs: newTabs, activeLeftTabId: nextActive });
        if (nextActive) {
          try {
            const c = await invoke<string>("read_local_file", { path: nextActive });
            set({ leftDraft: c, leftSaveStatus: "saved" });
          } catch {}
        } else {
          set({ leftDraft: "", leftSaveStatus: "saved" });
        }
      } else {
        set({ rightTabs: newTabs, activeRightTabId: nextActive });
        if (nextActive) {
          try {
            const c = await invoke<string>("read_local_file", { path: nextActive });
            set({ rightDraft: c, rightSaveStatus: "saved" });
          } catch {}
        } else {
          set({ rightDraft: "", rightSaveStatus: "saved" });
        }
      }
    },

    selectTab: async (panel, path) => {
      const isLeft = panel === "left";
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;
      if (activeId === path) return;

      await get().flushPendingSave(panel);

      if (isLeft) {
        set({ activeLeftTabId: path });
        try {
          const c = await invoke<string>("read_local_file", { path });
          set({ leftDraft: c, leftSaveStatus: "saved" });
        } catch (e) {
          console.error("Failed to read file on selectTab", e);
        }
      } else {
        set({ activeRightTabId: path });
        try {
          const c = await invoke<string>("read_local_file", { path });
          set({ rightDraft: c, rightSaveStatus: "saved" });
        } catch (e) {
          console.error("Failed to read file on selectTab", e);
        }
      }
    },

    flushPendingSave: async (panel) => {
      if (!panel || panel === "left") {
        if (leftSaveTimer !== null) {
          window.clearTimeout(leftSaveTimer);
          leftSaveTimer = null;
        }
        const leftId = get().activeLeftTabId;
        if (leftId && get().leftSaveStatus === "unsaved") {
          await get().saveFile("left", leftId, get().leftDraft);
        }
      }
      if (!panel || panel === "right") {
        if (rightSaveTimer !== null) {
          window.clearTimeout(rightSaveTimer);
          rightSaveTimer = null;
        }
        const rightId = get().activeRightTabId;
        if (rightId && get().rightSaveStatus === "unsaved") {
          await get().saveFile("right", rightId, get().rightDraft);
        }
      }
    },

    setDraftContent: (panel, content) => {
      const isLeft = panel === "left";
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;
      if (!activeId) return;

      if (isLeft) {
        set({ leftDraft: content, leftSaveStatus: "unsaved" });
        if (leftSaveTimer !== null) window.clearTimeout(leftSaveTimer);
        leftSaveTimer = window.setTimeout(async () => {
          leftSaveTimer = null;
          if (get().activeLeftTabId === activeId && get().leftSaveStatus === "unsaved") {
            await get().saveFile("left", activeId, content);
          }
        }, get().settings.livePreviewTimeout);
      } else {
        set({ rightDraft: content, rightSaveStatus: "unsaved" });
        if (rightSaveTimer !== null) window.clearTimeout(rightSaveTimer);
        rightSaveTimer = window.setTimeout(async () => {
          rightSaveTimer = null;
          if (get().activeRightTabId === activeId && get().rightSaveStatus === "unsaved") {
            await get().saveFile("right", activeId, content);
          }
        }, get().settings.livePreviewTimeout);
      }
    },

    saveFile: async (panel, path, content) => {
      const isLeft = panel === "left";
      if (isLeft) set({ leftSaveStatus: "saving" }); else set({ rightSaveStatus: "saving" });

      try {
        await invoke("write_local_file", {
          path,
          content,
          vaultRoot: get().currentFolderPath || undefined,
        });
        if (isLeft) set({ leftSaveStatus: "saved" }); else set({ rightSaveStatus: "saved" });
        
        // Refresh filename if user updated the first header
        const filename = path.split(/[\\/]/).pop() ?? "Note";
        let displayTitle = filename.replace(/\.md$/, "");
        
        const firstHeading = content
          .split(/\r?\n/)
          .map((str: string) => str.trim())
          .find((l: string) => l.startsWith('#'));
        
        if (firstHeading) {
          displayTitle = firstHeading.replace(/^#+\s*/, "").trim();
        }

        const updateTabTitle = (tabs: Tab[]) =>
          tabs.map((t) => (t.id === path ? { ...t, title: displayTitle } : t));

        if (isLeft) {
          set({ leftTabs: updateTabTitle(get().leftTabs) });
        } else {
          set({ rightTabs: updateTabTitle(get().rightTabs) });
        }
      } catch (err) {
        if (isLeft) set({ leftSaveStatus: "unsaved" }); else set({ rightSaveStatus: "unsaved" });
        console.error("Autosave failed", err);
      }
    },

    togglePinPath: (path) => {
      const pinned = get().pinnedPaths;
      const isPinned = pinned.includes(path);
      const nextPinned = isPinned ? pinned.filter((p) => p !== path) : [...pinned, path];
      
      set({ pinnedPaths: nextPinned });
      localStorage.setItem("lsn_pinned", JSON.stringify(nextPinned));

      const updatePin = (tabs: Tab[]) =>
        tabs.map((t) => (t.id === path ? { ...t, pinned: !isPinned } : t));

      set({ leftTabs: updatePin(get().leftTabs), rightTabs: updatePin(get().rightTabs) });
    },

    setPanelViewMode: (panel, mode) => {
      if (panel === "left") set({ leftViewMode: mode }); else set({ rightViewMode: mode });
    },

    setPanelLivePreview: (panel, active) => {
      if (panel === "left") set({ leftLivePreviewActive: active }); else set({ rightLivePreviewActive: active });
    },

    setActivePanel: (panel) => set({ activePanel: panel }),

    splitScreen: () => {
      // Set split to active and copy left tab structure into right if right is empty
      const leftActiveId = get().activeLeftTabId;
      const rightTabs = get().rightTabs;
      
      if (rightTabs.length === 0 && leftActiveId) {
        const leftTab = get().leftTabs.find((t) => t.id === leftActiveId);
        if (leftTab) {
          set({
            rightTabs: [leftTab],
            activeRightTabId: leftActiveId,
            rightDraft: get().leftDraft,
            rightViewMode: get().leftViewMode,
            rightSaveStatus: "saved"
          });
        }
      }
      set({ splitActive: true, activePanel: "right" });
    },

    closeSplit: () => {
      set({ splitActive: false, rightTabs: [], activeRightTabId: null, activePanel: "left" });
    },

    moveTab: async (fromPanel, toPanel, path) => {
      if (fromPanel === toPanel) return;
      const fromIsLeft = fromPanel === "left";
      const toIsLeft = toPanel === "left";

      const fromTabs = fromIsLeft ? get().leftTabs : get().rightTabs;
      const tab = fromTabs.find((t) => t.id === path);
      if (!tab) return;

      const fromActiveId = fromIsLeft ? get().activeLeftTabId : get().activeRightTabId;
      const isActiveInSource = fromActiveId === path;

      // Reuse the already-loaded draft when moving the source panel's active tab;
      // otherwise (a background tab) there's no in-memory copy, so read it from disk.
      let content: string;
      if (isActiveInSource) {
        await get().flushPendingSave(fromPanel);
        content = fromIsLeft ? get().leftDraft : get().rightDraft;
      } else {
        try {
          content = await invoke<string>("read_local_file", { path });
        } catch (err) {
          console.error("Failed to read file for tab move", err);
          return;
        }
      }

      // Remove from source panel, promoting another tab to active there if needed
      const newFromTabs = fromTabs.filter((t) => t.id !== path);
      const nextFromActive = isActiveInSource
        ? newFromTabs.length
          ? newFromTabs[newFromTabs.length - 1].id
          : null
        : fromActiveId;

      if (fromIsLeft) {
        set({ leftTabs: newFromTabs, activeLeftTabId: nextFromActive });
      } else {
        set({ rightTabs: newFromTabs, activeRightTabId: nextFromActive });
      }

      if (isActiveInSource) {
        if (nextFromActive) {
          try {
            const c = await invoke<string>("read_local_file", { path: nextFromActive });
            if (fromIsLeft) set({ leftDraft: c, leftSaveStatus: "saved" });
            else set({ rightDraft: c, rightSaveStatus: "saved" });
          } catch {}
        } else {
          if (fromIsLeft) set({ leftDraft: "", leftSaveStatus: "saved" });
          else set({ rightDraft: "", rightSaveStatus: "saved" });
        }
      }

      // Ensure the destination panel exists (auto-split when dropping into an unsplit view)
      if (!get().splitActive) {
        set({ splitActive: true });
      }

      const toTabs = toIsLeft ? get().leftTabs : get().rightTabs;
      const newToTabs = toTabs.some((t) => t.id === path) ? toTabs : [...toTabs, tab];

      if (toIsLeft) {
        set({ leftTabs: newToTabs, activeLeftTabId: path, leftDraft: content, leftSaveStatus: "saved" });
      } else {
        set({ rightTabs: newToTabs, activeRightTabId: path, rightDraft: content, rightSaveStatus: "saved" });
      }

      set({ activePanel: toPanel });
    },

    toggleSourcesPanel: () => set((s) => ({ showSourcesPanel: !s.showSourcesPanel })),
    setSidebarTab: (t) => set({ sidebarTab: t }),
    setSourcePreviewHeight: (h) => set({ sourcePreviewHeight: h }),
    setSourcePanelWidth: (w) => set({ sourcePanelWidth: w }),
    setSplitLeftWidth: (w) => set({ splitLeftWidth: Math.max(w, 200) }),
    toggleArtifactsPanel: () => set((s) => ({ showArtifactsPanel: !s.showArtifactsPanel })),
    setArtifactsWidth: (w) => set({ artifactsWidth: w }),
    setActiveArtifact: (a) => set({ activeArtifact: a }),
    addArtifact: (a) => set((s) => ({ artifacts: [...s.artifacts, a], activeArtifact: a })),
    toggleAgentPanel: () => set((s) => ({ showAgentPanel: !s.showAgentPanel })),
    setAgentWidth: (w) => set({ agentWidth: w }),
    setAgentMessages: (msgs) => set({ agentMessages: msgs }),
    addAgentMessage: (msg) => set((s) => ({ agentMessages: [...s.agentMessages, msg] })),
    setAgentContext: (ctx) => set({ agentContext: ctx }),
    setAgentTask: (task) => set({ agentTask: task }),
    reorderPanels: (fromId, toId) => {
      const order = get().panelOrder;
      const fromIndex = order.indexOf(fromId);
      const toIndex = order.indexOf(toId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

      const nextOrder = [...order];
      nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, fromId);

      set({ panelOrder: nextOrder });
      localStorage.setItem("lsn_panel_order", JSON.stringify(nextOrder));
    },
// Settings
    setShowSettings: (show) => set({ showSettings: show }),
    updateSettings: (updated) => {
      const nextSettings = { ...get().settings, ...updated };
      set({ settings: nextSettings });
      localStorage.setItem("lsn_settings", JSON.stringify(nextSettings));

      if (updated.excludedFolders !== undefined) {
        setTimeout(() => get().refreshExplorer(), 0);
      }

      // Apply theme colors live
      const theme = getThemeById(nextSettings.theme).colors;
      const accent = nextSettings.accentColor || theme.accent;
      applyThemeToDocument({
        ...theme,
        accent,
        accentHover: nextSettings.accentColor || theme.accentHover,
      });
    },

    // MCP Connector actions
    addConnector: (c) => {
      const connector: McpConnector = { ...c, id: "conn-" + Date.now(), enabled: false, tools: [] };
      const { updateSettings } = get();
      updateSettings({ connectors: [...get().settings.connectors, connector] });
    },
    updateConnector: (id, patch) => {
      const connectors = get().settings.connectors.map((c) => (c.id === id ? { ...c, ...patch } : c));
      get().updateSettings({ connectors });
      if (patch.enabled === false) {
        // Tear the child process / http session down so a disabled connector never lingers.
        invoke("stop_connector", { id }).catch(() => {});
      }
    },
    removeConnector: (id) => {
      const connectors = get().settings.connectors.filter((c) => c.id !== id);
      get().updateSettings({ connectors });
    },

    // Project actions
    addProject: (id, name, path) => {
      const project: Project = { id, name, path, lastOpened: new Date().toISOString() };
      const exists = get().projects.some((p) => p.path === path || p.id === id);
      const projects = exists
        ? get().projects.map((p) => (p.path === path || p.id === id ? project : p))
        : [...get().projects, project];
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
      set({ showProjectsPanel: false });
    },
    renameProject: (id, name) => {
      const projects = get().projects.map((p) => (p.id === id ? { ...p, name } : p));
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
    },
    deleteProject: (id) => {
      const projects = get().projects.filter((p) => p.id !== id);
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
    },
    toggleProjectPinned: (id) => {
      const projects = get().projects.map((p) =>
        p.id === id ? { ...p, pinned: !p.pinned } : p
      );
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
    },
    openProject: async (id) => {
      const project = get().projects.find((p) => p.id === id);
      if (!project) return;
      await get().openFolder(project.path);
      const projects = get().projects.map((p) =>
        p.id === id ? { ...p, lastOpened: new Date().toISOString() } : p
      );
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
      set({ showProjectsPanel: false, currentFolderPath: project.path });
    },
    setShowProjectsPanel: (show) => set({ showProjectsPanel: show }),

    isAssistantStreaming: false,
    assistantStatusText: "",
    assistantAbortController: null,
    availableModels: [],

    // OpenCode Agent runtime state — never persisted (no localStorage)
    assistantMode: "study",
    opencodeInstalled: false,
    opencodeServerPid: null,
    opencodeServerPassword: null,

    // Destructive file-tool approval gate
    pendingToolApprovals: [],

    addPendingToolApproval: (approval) =>
      set((s) => ({ pendingToolApprovals: [...s.pendingToolApprovals, approval] })),

    resolveToolApproval: (id, status) =>
      set((s) => ({
        pendingToolApprovals: s.pendingToolApprovals.map((p) =>
          p.id === id && p.status === "pending" ? { ...p, status } : p
        ),
      })),

    clearToolApproval: (id) =>
      set((s) => ({ pendingToolApprovals: s.pendingToolApprovals.filter((p) => p.id !== id) })),


    sendAssistantMessage: async (text: string) => {
      if (!text.trim()) return;
      const store = get();

      const userMsg: AssistantMessage = {
        id: "msg-" + Date.now(),
        role: "user",
        content: text.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      const updatedMessages = [...store.assistantMessages, userMsg];
      set({ assistantMessages: updatedMessages, isAssistantStreaming: true, assistantStatusText: "Thinking..." });

      if (!store.settings.aiEnabled) {
        const disabledMsg: AssistantMessage = {
          id: "msg-" + (Date.now() + 1),
          role: "assistant",
          content: "AI Study Assistant is currently disabled. You can enable it in **Settings -> AI & BYOK Model**.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        set({ assistantMessages: [...updatedMessages, disabledMsg], isAssistantStreaming: false, assistantStatusText: "" });
        return;
      }

      // Build context attachments if present
      let contextPrefix = "";
      const activePath = store.activeLeftTabId || store.activeRightTabId;
      if (activePath && (text.includes("@") || text.includes("active"))) {
        const activeContent = store.activePanel === "left" ? store.leftDraft : store.rightDraft;
        const noteName = activePath.split(/[\\/]/).pop() || "Active Note";
        contextPrefix += `[Attached Context - Note: ${noteName}]\n${activeContent}\n\n`;
      }

      // Compose the AI payload from Memory-RAG context (memory digest + RAG passages +
      // backlinks fused into the system prompt) plus recent history and the attachment block.
      const scope = store.assistantTopicTitle || (store.currentFolderPath ? store.currentFolderPath.split(/[\\/]/).pop() || store.currentFolderPath : "global");
      const { buildPromptWithContext, persistConversationTurn } = await import("../services/agentKnowledge");
      const historyPayload = await buildPromptWithContext({
        messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        settings: store.settings,
        scope,
        vaultRoot: store.currentFolderPath || undefined,
        queryText: text,
        attachment: contextPrefix || undefined,
      });

      const assistantMsgId = "msg-" + (Date.now() + 1);
      const assistantMsg: AssistantMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      set({ assistantMessages: [...updatedMessages, assistantMsg] });

      const controller = new AbortController();
      set({ assistantAbortController: controller });

      try {
        const finalText = await streamAIResponse({
          messages: historyPayload,
          settings: store.settings,
          onChunk: (accumulatedText) => {
            set((state) => ({
              assistantMessages: state.assistantMessages.map((m) =>
                m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
              ),
            }));
          },
          onStatusChange: (status) => {
            set({ assistantStatusText: status });
          },
          signal: controller.signal,
        });

        // A successful request with no visible text usually means the provider blocked or
        // filtered the output (e.g. Gemini safety filters) rather than the app failing —
        // surface that instead of leaving a permanently blank chat bubble.
        if (!finalText.trim()) {
          set((state) => ({
            assistantMessages: state.assistantMessages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content:
                      "⚠️ The AI provider returned an empty response. This can happen when a safety/content filter blocks the output, or the model produced nothing for this prompt. Try rephrasing your message.",
                  }
                : m
            ),
          }));
        } else if (store.settings.memoryAutoSave !== false) {
          persistConversationTurn(
            { userText: text, assistantText: finalText, scope },
            store.settings
          ).catch(() => {});
        }
      } catch (err) {
        const wasCancelled = err instanceof DOMException && err.name === "AbortError";
        set((state) => ({
          assistantMessages: state.assistantMessages.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: wasCancelled
                    ? m.content || "_Cancelled._"
                    : m.content ||
                      `⚠️ Unable to connect to AI server at \`${store.settings.aiBaseUrl}\` (${String(err)}).\n\nCheck your endpoint configuration in **Settings -> AI & BYOK Model**.`,
                }
              : m
          ),
        }));
      } finally {
        set({ isAssistantStreaming: false, assistantStatusText: "", assistantAbortController: null });
      }
    },
    cancelAssistantMessage: () => {
      get().assistantAbortController?.abort();
    },
    clearAssistantMessages: () => set({ assistantMessages: [] }),
    setAssistantWidth: (w) => set({ assistantWidth: w }),
    toggleAssistantPanel: () => set((s) => ({ showAssistantPanel: !s.showAssistantPanel })),
    setSelectedModel: (m) => set({ selectedModel: m }),
    setAssistantTopicTitle: (t) => set({ assistantTopicTitle: t }),
    setFilterQuery: (q) => set({ filterQuery: q }),

    fetchAndSetAvailableModels: async () => {
      const { settings } = get();
      const baseUrl = (settings.aiBaseUrl || "").replace(/\/+$/, "");
      if (!baseUrl) return;
      const models = await fetchAvailableModels(baseUrl, settings.aiApiKey || "");
      if (models.length > 0) {
        set({ availableModels: models });
      }
    },

    // ---------------------------------------------------------------------------
    // OpenCode Agent actions
    // ---------------------------------------------------------------------------

    setAssistantMode: (mode) => set({ assistantMode: mode }),

    checkOpencodeInstalled: async () => {
      try {
        const installed = await invoke<boolean>("check_opencode_installed");
        set({ opencodeInstalled: installed });
      } catch {
        set({ opencodeInstalled: false });
      }
    },

    startOpencodeServer: async () => {
      const { settings, currentFolderPath, opencodeServerPid } = get();
      if (opencodeServerPid !== null) return; // already running

      const workspace = currentFolderPath || ".";
      // Generate a per-session random password (never persisted to disk).
      const password = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Build BYOK credential env-var map with correct OpenCode variable names.
      // (spec §"Corrected: Secrets Handling" — note GOOGLE_GENERATIVE_AI_API_KEY,
      // NOT GEMINI_API_KEY, per OpenCode's own documented env var name for Gemini)
      const providerEnv: Record<string, string> = {};
      if (settings.aiApiKey?.trim()) {
        if (settings.aiProvider === "openai") {
          providerEnv["OPENAI_API_KEY"] = settings.aiApiKey.trim();
        } else if (settings.aiProvider === "anthropic") {
          providerEnv["ANTHROPIC_API_KEY"] = settings.aiApiKey.trim();
        } else if (settings.aiProvider === "gemini") {
          providerEnv["GOOGLE_GENERATIVE_AI_API_KEY"] = settings.aiApiKey.trim();
        } else if (settings.aiProvider === "openrouter") {
          providerEnv["OPENROUTER_API_KEY"] = settings.aiApiKey.trim();
        }
        // ollama_hermes / custom: no API key env var needed
      }

      try {
        const { config: mcpOverride, env: mcpEnv } = buildOpencodeMcpExport(
          get().settings.connectors ?? [],
        );
        const pid = await invoke<number>("spawn_opencode_server", {
          port: settings.opencodePort,
          workspacePath: workspace,
          serverPassword: password,
          providerEnv,
          mcpOverride,
          mcpEnv,
        });
        set({ opencodeServerPid: pid, opencodeServerPassword: password });
      } catch (err) {
        console.error("[OpenCode] Failed to start server:", err);
      }
    },

    stopOpencodeServer: async () => {
      const { opencodeServerPid } = get();
      if (opencodeServerPid === null) return;
      try {
        await invoke("kill_opencode_server", { pid: opencodeServerPid });
      } catch (err) {
        console.error("[OpenCode] Failed to stop server:", err);
      } finally {
        set({ opencodeServerPid: null, opencodeServerPassword: null });
      }
    },

    // Google Drive backup (BACKUP-0)
    refreshGoogleAccount: async () => {
      try {
        const acct = await invoke<GoogleAccount | null>("google_account");
        set({ googleAccount: acct });
      } catch (err) {
        console.warn("Failed to check Google Drive account:", err);
      }
    },

    connectGoogle: async () => {
      set({ backupSigningIn: true });
      try {
        const acct = await invoke<GoogleAccount>("google_sign_in");
        set({ googleAccount: acct, backupSigningIn: false });
      } catch (err) {
        set({ backupSigningIn: false });
        throw err;
      }
    },

    signOutGoogle: async () => {
      try {
        await invoke("google_sign_out");
      } catch (err) {
        console.warn("Google sign-out failed:", err);
      } finally {
        set({ googleAccount: null });
      }
    },

    // Session Actions
    createSession: (title) => {
      const id = "sess-" + Date.now();
      const newTitle = title || `New session - ${new Date().toISOString().slice(0, 16)}`;
      const sessions = get().sessions.map((s) => ({ ...s, active: false }));
      sessions.push({ id, title: newTitle, active: true, openTabs: [] });
      set({ sessions, activeSessionId: id });
      localStorage.setItem("lsn_sessions", JSON.stringify(sessions));
    },
    closeSession: (id) => {
      const current = get().sessions;
      if (current.length <= 1) return;
      const filtered = current.filter((s) => s.id !== id);
      let activeId = get().activeSessionId;
      if (activeId === id) {
        activeId = filtered[filtered.length - 1].id;
      }
      const updated = filtered.map((s) => ({ ...s, active: s.id === activeId }));
      set({ sessions: updated, activeSessionId: activeId });
      localStorage.setItem("lsn_sessions", JSON.stringify(updated));
    },
    selectSession: (id) => {
      const updated = get().sessions.map((s) => ({ ...s, active: s.id === id }));
      set({ sessions: updated, activeSessionId: id });
      localStorage.setItem("lsn_sessions", JSON.stringify(updated));
    },
    setShowSearchModal: (show) => set({ showSearchModal: show }),
    setTopbarViewMode: (mode) => set({ topbarViewMode: mode }),

    // Launcher & Panel Arrangement Actions (Iteration 3)
    setShowLauncherModal: (show) => set({ showLauncherModal: show }),
    setShowPanelLayoutModal: (show) => set({ showPanelLayoutModal: show }),

    // Onboarding
    completeOnboarding: () => {
      set({ onboardingComplete: true });
      localStorage.setItem("lsn_onboarding_complete", "true");
    },

    applyPanelPreset: (preset) => {
      set({ panelPreset: preset });
      if (preset === "default") {
        set({ showAssistantPanel: true, showSourcesPanel: true, showArtifactsPanel: false, showAgentPanel: false, assistantWidth: 360, sourcePanelWidth: 200, splitActive: false });
      } else if (preset === "focus") {
        set({ showAssistantPanel: false, showSourcesPanel: false, showArtifactsPanel: false, showAgentPanel: false, splitActive: false });
      } else if (preset === "assistant") {
        set({ showAssistantPanel: true, showSourcesPanel: false, showArtifactsPanel: false, showAgentPanel: false, assistantWidth: 420, splitActive: false });
      } else if (preset === "explorer") {
        set({ showAssistantPanel: false, showSourcesPanel: true, showArtifactsPanel: false, showAgentPanel: false, sourcePanelWidth: 240, splitActive: false });
      }
    },

    saveCustomLayout: (name) => {
      const layout: CustomLayout = {
        id: "layout-" + Date.now(),
        name,
        panelOrder: get().panelOrder,
        showAssistantPanel: get().showAssistantPanel,
        showSourcesPanel: get().showSourcesPanel,
        showArtifactsPanel: get().showArtifactsPanel,
        showAgentPanel: get().showAgentPanel,
        assistantWidth: get().assistantWidth,
        sourcePanelWidth: get().sourcePanelWidth,
        artifactsWidth: get().artifactsWidth,
        agentWidth: get().agentWidth,
        splitActive: get().splitActive,
      };
      const customLayouts = [...get().customLayouts, layout];
      set({ customLayouts, panelPreset: "custom" });
      localStorage.setItem("lsn_custom_layouts", JSON.stringify(customLayouts));
    },

    applyCustomLayout: (id) => {
      const layout = get().customLayouts.find((l) => l.id === id);
      if (!layout) return;
      set({
        panelOrder: layout.panelOrder,
        showAssistantPanel: layout.showAssistantPanel,
        showSourcesPanel: layout.showSourcesPanel,
        showArtifactsPanel: layout.showArtifactsPanel,
        showAgentPanel: layout.showAgentPanel,
        assistantWidth: layout.assistantWidth,
        sourcePanelWidth: layout.sourcePanelWidth,
        artifactsWidth: layout.artifactsWidth,
        agentWidth: layout.agentWidth,
        splitActive: layout.splitActive,
        panelPreset: "custom",
      });
      localStorage.setItem("lsn_panel_order", JSON.stringify(layout.panelOrder));
    },

    deleteCustomLayout: (id) => {
      const customLayouts = get().customLayouts.filter((l) => l.id !== id);
      set({ customLayouts });
      localStorage.setItem("lsn_custom_layouts", JSON.stringify(customLayouts));
    },

    scaffoldWorkspaceTemplate: async (folderPath: string) => {
      try {
        // Create default template directories via Tauri commands
        await invoke("create_local_dir", { parentPath: folderPath, name: "Sources", vaultRoot: folderPath });
        await invoke("create_local_dir", { parentPath: folderPath, name: "Guides", vaultRoot: folderPath });
        await invoke("create_local_dir", { parentPath: folderPath, name: "_attachments", vaultRoot: folderPath });

        // Content for Welcome.md
        const welcomeContent = `# Welcome to Local Study Notebook 🚀

Welcome to your offline-first, local-first study workspace!

## 📁 Default Workspace Structure
- **Sources/**: Store raw study documents, research notes, and web captures.
- **Guides/**: Keep course outlines, exam prep summaries, and structured guides.
- **_attachments/**: Media files, figures, and diagrams.

## ⚡ Quick Guide
- **Smart Markdown Editor**: Raw markdown syntax renders automatically when hovering or editing lines!
- **Split-Screen Workspace**: Open notes side-by-side.
- **Local File Explorer**: Fast workspace tree view with right-click context menu.
- **AI Study Assistant**: Chat with your local study co-pilot.

---
*Start learning!*`;

        // Content for Study_Plan.md
        const planContent = `# 📚 Sample Study Plan

## Topic: Core Objectives
- [ ] Review Chapter 1: Foundations
- [ ] Create summary notes in \`Guides/\`
- [ ] Self-quiz on key concepts

## Notes & Hypotheses
Add your personal study observations here...`;

        // Write template files
        const welcomePath = await invoke<string>("create_local_file", { dirPath: folderPath, name: "Welcome.md", vaultRoot: folderPath });
        await invoke("write_local_file", { path: welcomePath, content: welcomeContent, vaultRoot: folderPath });

        const guidesDir = `${folderPath}/Guides`;
        const planPath = await invoke<string>("create_local_file", { dirPath: guidesDir, name: "Study_Plan.md", vaultRoot: folderPath });
        await invoke("write_local_file", { path: planPath, content: planContent, vaultRoot: folderPath });

        // Open newly created folder and open Welcome.md
        await get().openFolder(folderPath);
        await get().openFile(welcomePath);
      } catch (err) {
        console.error("Failed to scaffold workspace template:", err);
      }
    },
  };
});
````

### 4. `src/services/workspaceTools.ts` (modified)

Added `buildEffectiveTools()` (merges builtin + namespaced connector tools, offline http skip) and the connector dispatch branch in `executeWorkspaceTool`. Full current file below.

````ts
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../stores/useStore";
import type { McpConnector } from "../types";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// Wire shapes returned by the Rust MCP host (src-tauri/src/mcp.rs).
interface McpTool {
  name: string;
  description: string;
  input_schema: ToolDefinition["function"]["parameters"];
}

interface McpContent {
  type: string;
  text?: string;
}

interface McpCallResult {
  content: McpContent[];
  is_error: boolean;
}

/** Maps a frontend connector to the Rust `ConnectorConfig` wire shape (snake_case keys). */
function connectorToConfig(c: McpConnector): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    command: c.command,
    args: c.args,
    cwd: c.cwd,
    url: c.url,
    headers: c.headers,
    env: c.env,
    tools: c.tools,
  };
}

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : !!navigator.onLine;
}

function mcpResultToString(result: McpCallResult): string {
  const parts = result.content
    .map((c) => (c.type === "text" && c.text ? c.text : `[${c.type} content not renderable as text]`))
    .filter(Boolean);
  if (parts.length === 0) return "(connector returned no content)";
  return parts.join("\n\n");
}

/**
 * Builds the full tool list sent to the AI model: builtin workspace tools merged with
 * every enabled connector's tools. Connector names are namespaced as `<connector>/<tool>`
 * so builtin vs connector tools can never collide; the dispatch path strips the prefix.
 * Offline http connectors are excluded so the model never wastes a turn on an
 * unreachable cloud server.
 */
export async function buildEffectiveTools(): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [...WORKSPACE_TOOLS];
  const settings = useStore.getState().settings;
  // File-mutation tools are gated off entirely unless aiEnableFileWrite is on (Phase 2b).
  if (settings.aiEnableFileWrite) {
    tools.push(...FILE_WRITE_TOOLS);
  }
  const connectors = useStore.getState().settings.connectors.filter((c) => c.enabled);
  for (const connector of connectors) {
    if (connector.kind === "http" && !isOnline()) continue;
    try {
      const mcpTools = await invoke<McpTool[]>("list_connector_tools", {
        config: connectorToConfig(connector),
      });
      for (const t of mcpTools) {
        tools.push({
          type: "function",
          function: {
            name: `${connector.name}/${t.name}`,
            description: t.description,
            parameters: t.input_schema,
          },
        });
      }
    } catch (err) {
      console.warn(`[MCP] Skipping connector "${connector.name}":`, err);
    }
  }
  return tools;
}

export const WORKSPACE_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_vault",
      description: "Search local markdown notes in the user's workspace for keywords or topics.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query or keyword to locate in workspace notes.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_active_note",
      description: "Read the full contents of the currently active note open in the editor.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_note_backlinks",
      description: "Get incoming backlinks and outgoing connections for a specific note path.",
      parameters: {
        type: "object",
        properties: {
          note_path: {
            type: "string",
            description: "The path or filename of the note to retrieve backlinks for.",
          },
        },
        required: ["note_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rag_search",
      description:
        "Semantic + keyword search over the workspace notes (Memory-RAG) that returns the most relevant passages for a query, even when wording differs.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The question or topic to retrieve context for.",
          },
          limit: {
            type: "number",
            description: "Maximum passages to return (default 5).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_memory",
      description:
        "Recall durable memory entries (facts, prior Q&A, user context) for a topic or query, semantically by default, keyword fallback offline.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to recall (topic, question, or fact).",
          },
          scope: {
            type: "string",
            description: 'Optional memory scope filter, e.g. a topic title or "global".',
          },
          limit: {
            type: "number",
            description: "Maximum entries to return (default 5).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "Persist a durable fact or context about the user, a topic, or their workspace so future turns can recall it.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            description: 'Memory scope: a topic title or "global".',
          },
          content: {
            type: "string",
            description: "The fact or context to remember (1-3 sentences).",
          },
          topic_title: {
            type: "string",
            description: "Optional topic title for grouping.",
          },
        },
        required: ["scope", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_note_context",
      description:
        "Get the full context bundle for a single note: related passages (RAG), prior memory, backlinks, and the note's contents.",
      parameters: {
        type: "object",
        properties: {
          note_path: {
            type: "string",
            description: "Path of the note to build context for (defaults to the active note).",
          },
          query: {
            type: "string",
            description: "Optional question/topic to rank context against.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_notes",
      description: "List markdown notes available in the workspace (top-level folders included).",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum entries to list (default 20).",
          },
        },
        required: [],
      },
    },
  },
];

// File-mutation tools (Phase 2b) — only exposed to the model when
// `settings.aiEnableFileWrite` is enabled (default off). delete/rename/overwrite still
// pass through the user approval gate in `executeWorkspaceTool`.
export const FILE_WRITE_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_note",
      description:
        "Create a new markdown note at a vault-relative path (e.g. 'Guides/Chemistry.md'). Fails if a file already exists at that path. Use for creating new study notes and guides.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path of the new note, e.g. 'Guides/Organic Chemistry.md'.",
          },
          content: {
            type: "string",
            description: "Full markdown content (start with a `# Title` heading).",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_note",
      description:
        "Overwrite an existing note with new content, or create it when create_if_missing is true. Overwriting a non-empty file requires user approval.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path of the note to edit.",
          },
          content: {
            type: "string",
            description: "Full replacement markdown content.",
          },
          create_if_missing: {
            type: "boolean",
            description: "Create the file when it doesn't exist yet (default false).",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_note",
      description:
        "Permanently delete a note (or folder) from the vault. DANGEROUS — requires explicit user approval before it runs.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path of the note or folder to delete.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_note",
      description:
        "Rename or move a note within the vault. Requires user approval before it runs.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative current path.",
          },
          new_name: {
            type: "string",
            description: "New vault-relative path.",
          },
        },
        required: ["path", "new_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_folder",
      description: "Create a new folder inside the vault (creates intermediate folders too).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative folder path, e.g. 'Guides/Physics'.",
          },
        },
        required: ["path"],
      },
    },
  },
];

/** Whether a possible file-mutation tool name is one of the gated write tools. */
export function isFileWriteTool(name: string): boolean {
  return FILE_WRITE_TOOLS.some((t) => t.function.name === name);
}

/**
 * Resolves a vault-relative path to an absolute one, refusing anything that escapes the
 * vault root (`..`, absolute paths, drive letters). Mirrors Rust `validate_vault_path`.
 */
function resolveVaultPath(vaultRoot: string, rel: string): string | null {
  if (!vaultRoot || typeof rel !== "string" || !rel.trim()) return null;
  if (rel.includes("\0")) return null;
  const normalized = rel.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return null;
  const joined = vaultRoot.replace(/[\\/]+$/, "") + "/" + normalized;
  const cleaned = joined
    .split("/")
    .reduce<string[]>((acc, seg) => {
      if (seg === "..") acc.pop();
      else if (seg !== "." && seg !== "") acc.push(seg);
      return acc;
    }, [])
    .join("/");
  const rootNorm = vaultRoot.replace(/[\\/]+$/, "").replace(/\\/g, "/");
  const rootLower = rootNorm.toLowerCase();
  const check = cleaned.toLowerCase();
  if (check === rootLower) return null;
  if (!check.startsWith(rootLower + "/")) return null;
  return cleaned;
}

/** Polls the approval gate until the user resolves the request. */
function awaitApproval(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    const poll = setInterval(() => {
      const item = useStore.getState().pendingToolApprovals.find((p) => p.id === id);
      if (!item || item.status !== "pending") {
        clearInterval(poll);
        resolve(item?.status === "approved");
      }
    }, 150);
  });
}

/** Adds an approval request and waits for the user; auto-denies when the store entry is gone. */
async function requireApproval(opts: {
  tool: string;
  args: Record<string, any>;
  summary: string;
}): Promise<boolean> {
  const id = "tool-approval-" + Date.now() + "-" + Math.round(Math.random() * 1e6);
  useStore.getState().addPendingToolApproval({
    id,
    tool: opts.tool,
    args: opts.args,
    summary: opts.summary,
    status: "pending",
  });
  return awaitApproval(id);
}

let postWriteTimer: ReturnType<typeof setTimeout> | null = null;

/** Reindexes the vault after a write tool succeeds, then lazily re-embeds (Phase 2b). */
function triggerPostWriteReindex(vaultRoot: string): void {
  invoke("reindex_vault", { vaultRoot })
    .then(() => {
      if (postWriteTimer !== null) clearTimeout(postWriteTimer);
      postWriteTimer = setTimeout(() => {
        postWriteTimer = null;
        const settings = useStore.getState().settings;
        if (!settings.aiEnabled) return;
        import("./agentKnowledge").then(({ rebuildEmbeddings }) => {
          rebuildEmbeddings(vaultRoot, settings).catch(() => {});
        });
      }, 500);
    })
    .catch(() => {});
}

export async function executeWorkspaceTool(name: string, args: Record<string, any>): Promise<string> {
  const store = useStore.getState();
  const vaultRoot = store.currentFolderPath;

  try {
    if (name === "search_vault") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const results = await invoke<Array<{ path: string; title: string; snippet: string; line_number: number }>>("search_vault", {
        vaultRoot,
        query: args.query || "",
      });

      if (!results || results.length === 0) {
        return `No matching note snippets found for query "${args.query}".`;
      }

      return results
        .map((r) => `- [${r.title}] (Line ${r.line_number}): ${r.snippet}`)
        .join("\n");
    }

    if (name === "read_active_note") {
      const activePath = store.activeLeftTabId || store.activeRightTabId;
      if (!activePath) return "No active tab open in the editor.";

      const content = store.activePanel === "left" ? store.leftDraft : store.rightDraft;
      const title = activePath.split(/[\\/]/).pop();
      return `### Active Note: ${title}\nPath: ${activePath}\n\n${content}`;
    }

    if (name === "get_note_backlinks") {
      const notePath = args.note_path || store.activeLeftTabId || "";
      if (!notePath) return "No note path specified.";

      const backlinks = await invoke<Array<{ source_path: string; link_text: string; line_number: number }>>("get_backlinks", {
        targetPath: notePath,
      });

      if (!backlinks || backlinks.length === 0) {
        return `No incoming backlinks found for "${notePath}".`;
      }

      return backlinks
        .map((b) => `- Linked from [${b.source_path.split(/[\\/]/).pop()}] (Line ${b.line_number}): "${b.link_text}"`)
        .join("\n");
    }

    if (name === "rag_search") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const settings = useStore.getState().settings;
      const { embedTexts } = await import("./aiProvider");
      const embedding = (await embedTexts([String(args.query || "")], settings))[0] ?? [];
      const results = await invoke<Array<{ path: string; title: string; snippet: string; score: number }>>("search_rag", {
        vaultRoot,
        queryText: String(args.query || ""),
        queryEmbedding: embedding,
        limit: Math.max(1, Number(args.limit) || settings.ragTopK || 5),
      });
      if (!results || results.length === 0) {
        return `No relevant passages found for "${args.query}".`;
      }
      return results
        .map((r) => `- [${r.title}] (score ${r.score.toFixed(3)}): ${r.snippet}`)
        .join("\n");
    }

    if (name === "recall_memory") {
      const settings = useStore.getState().settings;
      const { embedTexts } = await import("./aiProvider");
      const query = String(args.query || "");
      const embedding = (await embedTexts([query], settings))[0] ?? [];
      const results = await invoke<Array<{ id: number; scope: string; kind: string; content: string; created_at: string; score: number }>>("recall_memory", {
        scope: String(args.scope || "global"),
        queryText: query,
        queryEmbedding: embedding,
        limit: Math.max(1, Number(args.limit) || settings.ragTopK || 5),
      });
      if (!results || results.length === 0) return `No recalled memory for "${query}".`;
      return results
        .map((m) => `- [${m.kind}/${m.scope}] ${m.content}`)
        .join("\n");
    }

    if (name === "save_memory") {
      const { remember } = await import("./agentKnowledge");
      const content = String(args.content || "").trim();
      if (!content) return "Error: save_memory requires a non-empty content.";
      const settings = useStore.getState().settings;
      await remember(
        {
          scope: String(args.scope || "global"),
          kind: "fact",
          content,
          source: "ai-assistant",
          topicTitle: args.topic_title ? String(args.topic_title) : undefined,
        },
        settings
      );
      return `Remembered: ${content.slice(0, 300)}`;
    }

    if (name === "get_note_context") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const { fetchContextBundle, formatContextBundle } = await import("./agentKnowledge");
      const notePath = args.note_path || store.activeLeftTabId || store.activeRightTabId || null;
      const bundle = await fetchContextBundle({
        vaultRoot,
        scope: notePath ? notePath.split(/[\\/]/).pop() || "note" : "global",
        queryText: args.query ? String(args.query) : undefined,
        activeNotePath: notePath,
      });
      if (!bundle) return "Could not build context for that note.";
      return formatContextBundle(bundle);
    }

    if (name === "list_recent_notes") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const excludedList = store.settings.excludedFolders
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const entries = await invoke<Array<{ name: string; path: string; is_dir: boolean }>>("read_local_dir", {
        path: vaultRoot,
        excludedFolders: excludedList,
      });
      const limit = Math.max(1, Number(args.limit) || 20);
      const notes = entries
        .filter((e) => !e.is_dir && /\.(md|markdown|txt)$/i.test(e.name))
        .slice(0, limit);
      if (!notes.length) return "No markdown/plain-text notes found in the workspace root.";
      return notes.map((n) => `- ${n.name}`).join("\n");
    }

    // ---- Phase 2b: file-mutation tools (gated + approval-required) ----

    if (name === "create_note" || name === "create_folder") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const rel = String(args.path || "").trim();
      const target = resolveVaultPath(vaultRoot, rel);
      if (!target) return `Error: Refusing path "${rel}" — must stay inside the vault root and be non-empty.`;
      if (name === "create_folder") {
        await invoke("create_local_dir", { parentPath: vaultRoot, name: rel, vaultRoot });
        triggerPostWriteReindex(vaultRoot);
        return `Created folder "${rel}".`;
      }
      const dirName = target.split("/").pop() || "note.md";
      const dirPath = target.slice(0, target.length - dirName.length).replace(/\/$/, "") || vaultRoot;
      await invoke("create_local_file", {
        dirPath,
        name: dirName,
        vaultRoot,
      });
      await invoke("write_local_file", {
        path: target,
        content: String(args.content || ""),
        vaultRoot,
      });
      triggerPostWriteReindex(vaultRoot);
      return `Created note "${rel}".`;
    }

    if (name === "edit_note") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const rel = String(args.path || "");
      const target = resolveVaultPath(vaultRoot, rel);
      if (!target) return `Error: Refusing path "${rel}" — must stay inside the vault root and be non-empty.`;

      let existing = "";
      try {
        existing = await invoke<string>("read_local_file", { path: target });
      } catch {
        existing = "___NOT_FOUND___";
      }

      if (existing === "___NOT_FOUND___" && args.create_if_missing !== true) {
        return `Error: No file exists at "${rel}" (create_if_missing is false).`;
      }
      if (existing !== "___NOT_FOUND___" && existing.replace(/\s+/g, "").length > 0) {
        const approved = await requireApproval({
          tool: name,
          args,
          summary: `Overwrite note "${rel}" (${existing.length} chars) with new AI-provided content?`,
        });
        if (!approved) return "User declined the overwrite — no changes made.";
      }
      await invoke("write_local_file", { path: target, content: String(args.content || ""), vaultRoot });
      triggerPostWriteReindex(vaultRoot);
      return `Updated note "${rel}".`;
    }

    if (name === "delete_note") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const rel = String(args.path || "");
      const target = resolveVaultPath(vaultRoot, rel);
      if (!target) return `Error: Refusing path "${rel}" — must stay inside the vault root and be non-empty.`;
      const approved = await requireApproval({
        tool: name,
        args,
        summary: `Delete "${rel}"? This cannot be undone.`,
      });
      if (!approved) return "User declined the delete — nothing was removed.";
      await invoke("delete_local_entry", { path: target, vaultRoot });
      useStore.getState().closeTab("left", target);
      useStore.getState().closeTab("right", target);
      triggerPostWriteReindex(vaultRoot);
      return `Deleted "${rel}".`;
    }

    if (name === "rename_note") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const relOld = String(args.path || "");
      const relNew = String(args.new_name || "");
      const oldTarget = resolveVaultPath(vaultRoot, relOld);
      const newTarget = resolveVaultPath(vaultRoot, relNew);
      if (!oldTarget || !newTarget) return `Error: Refusing path — must stay inside the vault root.`;
      const approved = await requireApproval({
        tool: name,
        args,
        summary: `Rename/move "${relOld}" to "${relNew}"?`,
      });
      if (!approved) return "User declined the rename — nothing changed.";
      await invoke("rename_local_entry", { oldPath: oldTarget, newPath: newTarget, vaultRoot });
      triggerPostWriteReindex(vaultRoot);
      return `Renamed "${relOld}" to "${relNew}".`;
    }

    // Namespaced connector tools: "<connectorName>/<toolName>".
    const slashIndex = name.indexOf("/");
    if (slashIndex > 0 && slashIndex < name.length - 1) {
      const connectorName = name.slice(0, slashIndex);
      const toolName = name.slice(slashIndex + 1);
      const connector = store.settings.connectors.find(
        (c) => c.enabled && c.name === connectorName
      );
      if (connector) {
        if (connector.kind === "http" && !isOnline()) {
          return "⚠️ Not connected — this connector requires internet access.";
        }
        const result = await invoke<McpCallResult>("call_connector_tool", {
          config: connectorToConfig(connector),
          name: toolName,
          args,
        });
        return mcpResultToString(result);
      }
    }

    return `Error: Unknown tool "${name}".`;
  } catch (err) {
    return `Error executing tool "${name}": ${String(err)}`;
  }
}
````

### 5. `src/services/aiProvider.ts` (modified)

Replaced static `WORKSPACE_TOOLS` with `await buildEffectiveTools()`. Full current file below.

````ts
import { Settings } from "../stores/useStore";
import { buildEffectiveTools, executeWorkspaceTool } from "./workspaceTools";

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 15_000;
const MAX_429_RETRIES = 2;

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  // The abort listener deliberately stays attached after cleanup() — cleanup only cancels
  // the connect-phase timer. Keeping the forward from `signal` to `controller` alive for the
  // life of the request lets a user-triggered abort (e.g. a Stop button) still cut off an
  // in-progress SSE stream, not just the initial connection.
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "TimeoutError";
}

function getRetryDelayMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (!Number.isNaN(secs)) return Math.min(secs * 1000, 10_000);
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Cancelled", "AbortError"));
      },
      { once: true }
    );
  });
}

// ---------------------------------------------------------------------------
// Dynamic Model Discovery
// ---------------------------------------------------------------------------

/**
 * Fetches the list of available model IDs from an OpenAI-compatible /models
 * endpoint. For Google Gemini, this populates a dynamic selector with every
 * current, non-deprecated chat completion model accessible by the user's key.
 * Returns an empty array on any failure so callers can fall back gracefully.
 */
export async function fetchAvailableModels(
  baseUrl: string,
  apiKey: string
): Promise<string[]> {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (apiKey?.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }
  const { signal, cleanup } = withTimeout(undefined, PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${cleanUrl}/models`, { method: "GET", headers, signal });
    if (!res.ok) return [];
    const data = await res.json();
    // Standard OpenAI-compat shape: { data: [ { id, object }, ... ] }
    const items: Array<{ id: string; object?: string }> = data?.data ?? [];
    return items
      .map((m) => m.id)
      .filter((id) => {
        // For Google endpoints, exclude embedding / AQA / vision-only models
        // so the selector only surfaces chat-capable models.
        if (cleanUrl.includes("generativelanguage.googleapis.com")) {
          return (
            id.startsWith("gemini") &&
            !id.includes("embedding") &&
            !id.includes("aqa") &&
            !id.includes("-vision")
          );
        }
        return true;
      })
      .sort();
  } catch {
    return [];
  } finally {
    cleanup();
  }
}

export interface ChatMessagePayload {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

// ---------------------------------------------------------------------------
// Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M2): Ollama embeddings for the front end.
// All embed HTTP stays here (consistent with the chat streaming path), while Rust
// owns vector storage (`store_chunk_embeddings`, `add_memory`) and retrieval math.
// ---------------------------------------------------------------------------

const EMBED_TIMEOUT_MS = 60_000;

/** Maps an OpenAI-compat Base URL (e.g. http://localhost:11434/v1) to the Ollama HTTP root. */
export function deriveEmbedBaseUrl(aiBaseUrl?: string): string {
  const clean = (aiBaseUrl || "").trim().replace(/\/+$/, "");
  if (!clean) return "http://localhost:11434";
  return clean.replace(/\/v1$/i, "");
}

/**
 * Embeds `texts` in one batch against Ollama's /api/embeddings. Returns a parallel array
 * of vectors (empty inner array for any failed/failed-text slot), or [] on transport or
 * shape failure so callers can degrade to keyword-only retrieval without crashing.
 */
export async function embedTexts(texts: string[], settings: Settings): Promise<number[][]> {
  if (!texts.length) return [];
  const baseUrl = deriveEmbedBaseUrl(settings.aiBaseUrl || settings.embedBaseUrl);
  const model = settings.embedModel || "nomic-embed-text";
  try {
    const res = await fetch(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const embeddings = data?.embeddings;
    if (!Array.isArray(embeddings)) return [];
    return embeddings.map((vec) =>
      Array.isArray(vec) ? vec.map((v) => Number(v) || 0) : []
    );
  } catch {
    return [];
  }
}

export async function testAIConnection(
  baseUrl: string,
  apiKey: string,
  model?: string
): Promise<{ ok: boolean; message: string }> {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  const key = apiKey?.trim();

  const shapeIssue = describeEndpointShapeIssue(cleanUrl);
  if (shapeIssue) {
    return { ok: false, message: shapeIssue };
  }

  {
    const { signal, cleanup } = withTimeout(undefined, PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${cleanUrl}/models`, {
        method: "GET",
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { ok: false, message: formatApiError(res.status, res.statusText, errText) };
      }
    } catch (err) {
      if (isTimeoutError(err)) {
        return {
          ok: false,
          message: `Timed out waiting for ${cleanUrl} after ${PROBE_TIMEOUT_MS / 1000}s. The server may be slow, unreachable, or rate-limiting silently.`,
        };
      }
      return { ok: false, message: `Could not reach ${cleanUrl}: ${String(err)}` };
    } finally {
      cleanup();
    }
  }

  // Many OpenAI-compatible providers (OpenRouter included) expose GET /models publicly —
  // it returns 200 even with a missing or invalid key. That alone doesn't prove the key
  // works, so run one minimal authenticated chat request to actually validate it here,
  // instead of the user finding out on their first real message.
  if (key && model) {
    const { signal, cleanup } = withTimeout(undefined, PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${cleanUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1, stream: false }),
        signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { ok: false, message: formatApiError(res.status, res.statusText, errText) };
      }
    } catch (err) {
      if (isTimeoutError(err)) {
        return {
          ok: false,
          message: `Timed out waiting for ${cleanUrl} after ${PROBE_TIMEOUT_MS / 1000}s. The server may be slow, unreachable, or rate-limiting silently.`,
        };
      }
      return { ok: false, message: `Could not reach ${cleanUrl}: ${String(err)}` };
    } finally {
      cleanup();
    }
  }

  return { ok: true, message: "Connection Successful!" };
}

function isLikelyToolIncompatibility(status: number, errText: string): boolean {
  // Only treat this as a tool-support problem when the error text actually says so.
  // A bare 404/400 can just as easily mean "wrong model ID" or "route not found" —
  // silently stripping `tools` and retrying on any 404 would mask those as if they were
  // tool-support issues, so require the message to name the actual cause.
  const text = errText.toLowerCase();
  const toolPhrases = [
    "no endpoints found that support tool use",
    "does not support tool",
    "does not support tools",
    "tool use",
    "tool calling",
    "tool_choice",
    "function calling is not supported",
    // Gemini: rejects function-call parts lacking its "thought_signature" metadata.
    "thought_signature",
    // Gemini strict JSON schema enforcement on tool parameters
    "schema validation failed",
    "invalid_function_call",
    "invalid function declaration",
    // Gemini experimental/preview model endpoints may not support tools yet
    "functioncalling is not enabled",
    "does not support functioncalling",
  ];
  return (status === 404 || status === 400) && toolPhrases.some((p) => text.includes(p));
}

function stripToolArtifactsFromHistory(messages: ChatMessagePayload[]): ChatMessagePayload[] {
  // When we fall back to a no-tools retry, the conversation history can still contain an
  // earlier assistant tool-call turn (and its paired "tool" role reply) from before the
  // fallback kicked in. A provider that rejects our tool-call shape outright (e.g. Gemini
  // without thought_signature) will reject that same shape sitting in history just as hard —
  // deleting payload.tools alone doesn't help if the poisoned turn is still in messages[].
  return messages
    .filter((m) => m.role !== "tool")
    .map((m) => (m.tool_calls ? { ...m, tool_calls: undefined } : m));
}

function formatApiError(status: number, statusText: string, errText: string): string {
  let detail = errText;
  try {
    const parsed = JSON.parse(errText);
    detail = parsed?.error?.message || parsed?.message || errText;
  } catch {
    // errText wasn't JSON — use it as-is (already assigned above)
  }
  detail = detail || statusText || "Unknown error";

  switch (status) {
    case 401:
      return `Authentication failed (HTTP 401): ${detail}. Check that your API key in Settings -> AI & BYOK Model is correct and hasn't expired.`;
    case 402:
      return `Out of credits (HTTP 402): ${detail}. Add credits or switch to a free-tier model (e.g. "google/gemini-2.0-flash-exp:free") in Settings -> AI & BYOK Model.`;
    case 429:
      return `Rate limited (HTTP 429) after automatic retries: ${detail}. OpenRouter free-tier models are often rate-limited — wait longer, or switch models in Settings -> AI & BYOK Model.`;
    default:
      return `AI request failed (HTTP ${status}): ${detail}`;
  }
}

function describeModelMismatch(baseUrl: string, model: string): string | null {
  const isOpenRouter = baseUrl.includes("openrouter.ai");
  const isGeminiDirect = baseUrl.includes("generativelanguage.googleapis.com");
  const looksNamespaced = model.includes("/");

  if (isOpenRouter && !looksNamespaced) {
    return `Model ID "${model}" doesn't look like an OpenRouter model — OpenRouter expects a namespaced ID like "nousresearch/hermes-3-llama-3.1-405b" or "google/gemini-2.0-flash-exp:free". If you meant to use a local Ollama model, switch the Base URL back to "http://localhost:11434/v1".`;
  }
  if (!isOpenRouter && looksNamespaced && (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1"))) {
    return `Model ID "${model}" looks like a cloud/OpenRouter model, but the Base URL points at a local endpoint (${baseUrl}). Local Ollama models use plain tags like "hermes3:8b".`;
  }
  // Warn if the user has entered an OpenRouter-namespaced ID against Google's direct endpoint
  if (isGeminiDirect && looksNamespaced) {
    return `Model ID "${model}" looks like an OpenRouter namespaced model, but the Base URL points at Google's direct Gemini endpoint. Use a plain Gemini model ID like "gemini-2.0-flash" or "gemini-1.5-pro" for the direct endpoint.`;
  }
  return null;
}

function describeEndpointShapeIssue(baseUrl: string): string | null {
  // Gemini's native REST API (generativelanguage.googleapis.com/v1beta) has no
  // /chat/completions route — that shape only exists under Google's separate
  // OpenAI-compatibility path, /v1beta/openai. A Base URL saved before that fix
  // (or typed by hand) will 404 in a confusing, Gemini-native-shaped error.
  if (baseUrl.includes("generativelanguage.googleapis.com") && !baseUrl.includes("/openai")) {
    return `Base URL "${baseUrl}" points at Gemini's native API, which doesn't have a /chat/completions route. ` +
      `Use Google's OpenAI-compatibility endpoint instead: "https://generativelanguage.googleapis.com/v1beta/openai". ` +
      `Update the Base URL in Settings → AI & BYOK Model.`;
  }
  return null;
}

/**
 * Maps a Gemini SSE finish_reason or promptFeedback blockReason to a
 * human-readable explanation surfaced in the chat UI.
 */
function describeGeminiBlock(finishReason?: string, blockReason?: string): string | null {
  const reason = (finishReason || blockReason || "").toUpperCase();
  if (!reason || reason === "STOP" || reason === "MAX_TOKENS") {
    // MAX_TOKENS is a normal completion stop — no block message needed
    return null;
  }
  switch (reason) {
    case "SAFETY":
      return "⚠️ **Gemini Safety Filter**: This response was blocked by Google's safety filters. Try rephrasing your message or disabling 'Workspace Tool Calling' in Settings if the tool output triggered the filter.";
    case "RECITATION":
      return "⚠️ **Gemini Recitation Filter**: The response was blocked because it may reproduce copyrighted content. Try asking in a different way.";
    case "OTHER":
      return "⚠️ **Gemini blocked this response** for an unspecified reason. Try rephrasing your message.";
    default:
      return `⚠️ **Gemini stopped early** (reason: ${reason}). The response may be incomplete.`;
  }
}

export async function streamAIResponse(options: {
  messages: ChatMessagePayload[];
  settings: Settings;
  onChunk: (text: string) => void;
  onToolCall?: (toolName: string, args: Record<string, any>) => void;
  onStatusChange?: (status: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { settings, onChunk, onToolCall, onStatusChange, signal: externalSignal } = options;
  const baseUrl = (settings.aiBaseUrl || "http://localhost:11434/v1").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const model = settings.aiModelName || "hermes3:8b";

  const shapeIssue = describeEndpointShapeIssue(baseUrl);
  if (shapeIssue) {
    throw new Error(shapeIssue);
  }

  const mismatch = describeModelMismatch(baseUrl, model);
  if (mismatch) {
    throw new Error(mismatch);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.aiApiKey?.trim()) {
    headers["Authorization"] = `Bearer ${settings.aiApiKey.trim()}`;
  }

  const currentMessages = [...options.messages];
  let accumulatedText = "";
  let toolCallsBuffer: Array<{ id: string; name: string; arguments: string }> = [];

  const payload: Record<string, any> = {
    model,
    messages: currentMessages,
    stream: true,
    temperature: 0.7,
  };

  if (settings.aiEnableWorkspaceTools) {
    try {
      // Builtin workspace tools + enabled MCP connector tools (offline-aware).
      payload.tools = await buildEffectiveTools();
    } catch (err) {
      console.warn("[AI] Failed to load effective tools:", err);
    }
  }

  onStatusChange?.("Connecting...");

  async function postOnce(): Promise<Response> {
    const { signal, cleanup } = withTimeout(externalSignal, DEFAULT_CONNECT_TIMEOUT_MS);
    try {
      return await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal,
      });
    } finally {
      cleanup();
    }
  }

  let response: Response;
  try {
    response = await postOnce();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError" && externalSignal?.aborted) {
      throw err;
    }
    const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
    if (isTimeoutError(err)) {
      throw new Error(
        `Timed out connecting to ${endpoint} after ${DEFAULT_CONNECT_TIMEOUT_MS / 1000}s. The server may be slow, unreachable, or rate-limiting silently.`
      );
    }
    if (isLocal) {
      throw new Error(
        `Could not reach ${endpoint}. Make sure your local model server (e.g. Ollama) is installed and running — try "ollama run ${model}" in a terminal, then send your message again.`
      );
    }
    throw new Error(
      `Could not reach ${endpoint}. Check your internet connection and that the Base URL is correct (${String(err)}).`
    );
  }

  let retryAttempt = 0;
  while (response.status === 429 && retryAttempt < MAX_429_RETRIES) {
    const delay = getRetryDelayMs(response, retryAttempt);
    onStatusChange?.(`Rate limited — retrying in ${Math.round(delay / 1000)}s...`);
    await sleep(delay, externalSignal);
    retryAttempt++;
    response = await postOnce();
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");

    if (payload.tools && isLikelyToolIncompatibility(response.status, errText)) {
      delete payload.tools;
      payload.messages = stripToolArtifactsFromHistory(currentMessages);
      response = await postOnce();
    }

    if (!response.ok) {
      const retryErrText = await response.text().catch(() => "");
      throw new Error(formatApiError(response.status, response.statusText, retryErrText || errText));
    }
  }

  if (!response.body) {
    throw new Error("No response body received from AI endpoint.");
  }

  onStatusChange?.("Streaming...");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const choice = json.choices?.[0];
        const delta = choice?.delta;

        // Capture Gemini finish_reason and promptFeedback for safety/recitation blocks
        const finishReason: string | undefined = choice?.finish_reason;
        const blockReason: string | undefined = json.promptFeedback?.blockReason;
        const geminiBlock = describeGeminiBlock(finishReason, blockReason);
        if (geminiBlock && !accumulatedText) {
          // Only override if we haven't accumulated real text yet (a mid-stream
          // safety block on a nearly-complete response shouldn't clobber the text).
          accumulatedText = geminiBlock;
          onChunk(accumulatedText);
          continue;
        }

        if (!delta) continue;

        if (delta.content) {
          accumulatedText += delta.content;
          onChunk(accumulatedText);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallsBuffer[idx]) {
              toolCallsBuffer[idx] = {
                id: tc.id || `call_${Date.now()}`,
                name: tc.function?.name || "",
                arguments: tc.function?.arguments || "",
              };
            } else {
              if (tc.function?.name) toolCallsBuffer[idx].name += tc.function.name;
              if (tc.function?.arguments) toolCallsBuffer[idx].arguments += tc.function.arguments;
            }
          }
        }
      } catch {
        // Skip malformed SSE json lines
      }
    }
  }

  // Handle tool calls execution loop if model invoked tools
  if (toolCallsBuffer.length > 0) {
    onStatusChange?.("Executing workspace tools...");
    
    // Add assistant tool calls message to conversation history
    const assistantToolMsg: ChatMessagePayload = {
      role: "assistant",
      content: accumulatedText || "",
      tool_calls: toolCallsBuffer.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
    currentMessages.push(assistantToolMsg);

    for (const tc of toolCallsBuffer) {
      let parsedArgs: Record<string, any> = {};
      try {
        parsedArgs = JSON.parse(tc.arguments || "{}");
      } catch {}

      onToolCall?.(tc.name, parsedArgs);
      onStatusChange?.(`Running tool: ${tc.name}...`);
      
      const result = await executeWorkspaceTool(tc.name, parsedArgs);

      currentMessages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.name,
        content: result,
      });
    }

    // Follow-up request for model to synthesize tool execution results
    onStatusChange?.("Synthesizing results...");
    return streamAIResponse({
      messages: currentMessages,
      settings,
      onChunk,
      onToolCall,
      onStatusChange,
      signal: externalSignal,
    });
  }

  onStatusChange?.("");
  return accumulatedText;
}
````

### 6. `src/components/SettingsModal.tsx` (modified)

Added the `connectors` section (`SettingSection` union, nav entry, full Connectors & Research UI). Full current file below.

````tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore, CONNECTOR_PRESETS } from "../stores/useStore";
import type { McpConnector, ConnectorKind } from "../types";
import { THEMES } from "../themes";
import { check as checkForUpdate, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { testAIConnection } from "../services/aiProvider";
import { getProviderPreset } from "../services/providerPresets";

type SettingSection = "general" | "appearance" | "editor" | "files" | "project" | "backup" | "ai_byok" | "connectors" | "about";
type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error";

export default function SettingsModal() {
  const showSettings = useStore((s) => s.showSettings);
  const setShowSettings = useStore((s) => s.setShowSettings);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const availableModels = useStore((s) => s.availableModels);
  const fetchAndSetAvailableModels = useStore((s) => s.fetchAndSetAvailableModels);

  const [activeSection, setActiveSection] = useState<SettingSection>("general");
  const [showApiKey, setShowApiKey] = useState(false);
  const [testConnectionStatus, setTestConnectionStatus] = useState<string | null>(null);
  const [fetchModelsStatus, setFetchModelsStatus] = useState<"idle" | "fetching" | "done" | "empty">("idle");
  const [reindexStatus, setReindexStatus] = useState<string | null>(null);
  const currentFolderPath = useStore((s) => s.currentFolderPath);


  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const googleAccount = useStore((s) => s.googleAccount);
  const backupSigningIn = useStore((s) => s.backupSigningIn);
  const connectGoogle = useStore((s) => s.connectGoogle);
  const signOutGoogle = useStore((s) => s.signOutGoogle);
  const [backupError, setBackupError] = useState<string | null>(null);

  // ── MCP Connectors ────────────────────────────────────────────
  const connectors = useStore((s) => s.settings.connectors);
  const addConnector = useStore((s) => s.addConnector);
  const updateConnector = useStore((s) => s.updateConnector);
  const removeConnector = useStore((s) => s.removeConnector);

  const [online, setOnline] = useState(() => typeof navigator !== "undefined" && navigator.onLine);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<McpConnector | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});
  const [addMode, setAddMode] = useState<"closed" | "menu" | "custom">("closed");
  const [headersText, setHeadersText] = useState("");

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const connectorConfig = (c: McpConnector) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    command: c.command,
    args: c.args,
    cwd: c.cwd,
    url: c.url,
    headers: c.headers,
    env: c.env,
    tools: c.tools,
  });

  const handleTestConnector = async (c: McpConnector) => {
    setTestStatus((s) => ({ ...s, [c.id]: "Testing…" }));
    try {
      const health = await invoke<{ ok: boolean; tool_count: number; error: string | null }>(
        "test_connector",
        { config: connectorConfig(c) }
      );
      setTestStatus((s) => ({
        ...s,
        [c.id]: health.ok ? `✓ ${health.tool_count} tools available` : `✗ ${health.error ?? "failed"}`,
      }));
    } catch (err) {
      setTestStatus((s) => ({ ...s, [c.id]: `✗ ${String(err)}` }));
    }
  };

  const startEditor = (c: McpConnector) => {
    setDraft({ ...c });
    setHeadersText(Object.entries(c.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"));
    setExpandedId(c.id);
  };

  const startCustomAdd = () => {
    setDraft({
      id: "",
      name: "",
      kind: "stdio",
      command: "",
      args: [],
      cwd: "",
      url: "",
      headers: {},
      env: {},
      enabled: false,
      tools: [],
    });
    setHeadersText("");
    setExpandedId("__new__");
    setAddMode("closed");
  };

  const closeEditor = () => {
    setExpandedId(null);
    setDraft(null);
  };

  const saveDraft = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return;
    if (draft.kind === "stdio" && !draft.command?.trim()) return;
    if (draft.kind === "http" && !draft.url?.trim()) return;

    let parsedHeaders: Record<string, string> = {};
    for (const line of headersText.split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) parsedHeaders[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }

    const cleanedFields = {
      name,
      kind: draft.kind,
      command: draft.kind === "stdio" ? draft.command?.trim() : undefined,
      args: draft.kind === "stdio" ? draft.args?.filter((a) => a.trim()) ?? [] : undefined,
      cwd: draft.kind === "stdio" ? draft.cwd?.trim() || undefined : undefined,
      url: draft.kind === "http" ? draft.url?.trim() : undefined,
      headers: parsedHeaders,
      env: draft.env ?? {},
    };

    if (expandedId === "__new__") {
      addConnector(cleanedFields);
    } else if (expandedId) {
      updateConnector(expandedId, cleanedFields);
    }
    closeEditor();
  };

  const availablePresets = CONNECTOR_PRESETS.filter(
    (p) => !connectors.some((c) => c.name === p.name)
  );

  const handleCheckForUpdates = async () => {
    setUpdateStatus("checking");
    setUpdateError(null);
    try {
      const update = await checkForUpdate();
      if (update?.available) {
        setPendingUpdate(update);
        setUpdateStatus("available");
      } else {
        setPendingUpdate(null);
        setUpdateStatus("up-to-date");
      }
    } catch (err) {
      setUpdateError(String(err));
      setUpdateStatus("error");
    }
  };

  const handleTestConnection = async () => {
    setTestConnectionStatus("testing");
    const result = await testAIConnection(
      settings.aiBaseUrl || "http://localhost:11434/v1",
      settings.aiApiKey,
      settings.aiModelName
    );
    if (result.ok) {
      setTestConnectionStatus("success");
      // Auto-fetch models on a successful connection for Gemini / OpenRouter
      if (settings.aiProvider === "gemini" || settings.aiProvider === "openrouter") {
        await fetchAndSetAvailableModels();
      }
    } else {
      setTestConnectionStatus(result.message);
    }
  };

  const handleFetchModels = async () => {
    setFetchModelsStatus("fetching");
    await fetchAndSetAvailableModels();
    const models = useStore.getState().availableModels;
    setFetchModelsStatus(models.length > 0 ? "done" : "empty");
  };


  const handleInstallUpdate = async () => {
    if (!pendingUpdate) return;
    setUpdateStatus("downloading");
    setUpdateError(null);
    try {
      await pendingUpdate.downloadAndInstall();
      await relaunch();
    } catch (err) {
      setUpdateError(String(err));
      setUpdateStatus("error");
    }
  };

  const handleConnectGoogle = async () => {
    setBackupError(null);
    try {
      await connectGoogle();
    } catch (err) {
      setBackupError(String(err));
    }
  };

  if (!showSettings) return null;

  const sections: { id: SettingSection; label: string }[] = [
    { id: "general", label: "General" },
    { id: "appearance", label: "Appearance" },
    { id: "editor", label: "Editor" },
    { id: "files", label: "Files & Links" },
    { id: "project", label: "Project" },
    { id: "backup", label: "Backup & Drive" },
    { id: "ai_byok", label: "AI & BYOK Model" },
    { id: "connectors", label: "Connectors & Research" },
    { id: "about", label: "About" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* Modal Container: exactly 800x600 */}
      <div className="relative flex w-[820px] h-[620px] overflow-hidden rounded-md border border-border bg-card text-text shadow-2xl animate-in fade-in zoom-in duration-200">

        {/* Close Button */}
        <button
          onClick={() => setShowSettings(false)}
          className="absolute top-4 right-4 z-10 rounded p-1 text-muted hover:bg-bg hover:text-text cursor-pointer transition-colors"
          title="Close Settings"
        >
          <svg className="w-5 h-5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Sidebar Nav */}
        <div className="w-48 shrink-0 border-r border-border bg-bg/50 p-4 pt-12 flex flex-col gap-1">
          <h2 className="px-3 mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Settings</h2>
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-2 rounded px-3 py-2 text-left text-xs font-medium cursor-pointer transition-colors ${
                activeSection === s.id ? "bg-accent text-white" : "text-muted hover:bg-card hover:text-text"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Contents Area */}
        <div className="flex-1 overflow-y-auto p-8 pt-12">
          {activeSection === "general" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">General Settings</h3>
                <p className="text-xs text-muted">Core workspace behavior preferences.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Default Startup Folder Path</label>
                <input
                  type="text"
                  value={settings.startupFolder}
                  onChange={(e) => updateSettings({ startupFolder: e.target.value })}
                  placeholder="e.g. C:/Users/Documents/Vault"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                />
                <span className="text-[10px] text-muted">Folder path to automatically load upon application initialization.</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Confirm before deleting files</label>
                <div className="flex items-center justify-between py-1">
                  <span className="text-[10px] text-muted">Ask for confirmation before permanently deleting an entry.</span>
                  <input
                    type="checkbox"
                    checked={settings.confirmBeforeDelete}
                    onChange={(e) => updateSettings({ confirmBeforeDelete: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === "appearance" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Appearance Settings</h3>
                <p className="text-xs text-muted">Configure themes and visual preferences. Applied live.</p>
              </div>

              {/* Dark theme preset grid */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Color Theme (Presets)</label>
                <div className="grid grid-cols-2 gap-2">
                  {THEMES.map((t) => {
                    const active = settings.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => updateSettings({ theme: t.id })}
                        className={`flex items-center gap-2 rounded border p-2 text-left transition-colors cursor-pointer ${
                          active ? "border-accent bg-accent/10" : "border-border hover:border-accent/50"
                        }`}
                      >
                        {/* Mini swatch */}
                        <span className="flex h-8 w-8 shrink-0 flex-col overflow-hidden rounded border border-border"
                          style={{ background: t.colors.bg }}>
                          <span className="h-2" style={{ background: t.colors.accent }} />
                          <span className="flex-1" style={{ background: t.colors.card }} />
                          <span className="h-1.5" style={{ background: t.colors.text }} />
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-xs font-medium ${active ? "text-accent" : "text-text"}`}>{t.name}</span>
                          <span className="block truncate text-[10px] text-muted">{t.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Accent color */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Accent Color (Optional Override)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.accentColor || "#3b82f6"}
                    onChange={(e) => updateSettings({ accentColor: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                  />
                  <button
                    onClick={() => updateSettings({ accentColor: "" })}
                    className="rounded border border-border px-2 py-1 text-[10px] text-muted hover:bg-bg hover:text-white cursor-pointer"
                  >
                    Reset to theme
                  </button>
                </div>
              </div>

              {/* Font Size */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Editor Font Size: {settings.fontSize}px</label>
                <input
                  type="range"
                  min="12"
                  max="24"
                  step="1"
                  value={settings.fontSize}
                  onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) })}
                  className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
                />
              </div>

              {/* Corner Roundness */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Panel Corner Roundness</label>
                <select
                  value={settings.cornerRoundness}
                  onChange={(e) => updateSettings({ cornerRoundness: e.target.value as any })}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                >
                  <option value="none">Sharp Corners (Obsidian-Style)</option>
                  <option value="sm">Small (2px)</option>
                  <option value="md">Medium (6px)</option>
                  <option value="lg">Large (12px)</option>
                </select>
              </div>

              {/* Reduce motion */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Reduce Motion</label>
                  <span className="text-[10px] text-muted">Minimize animations throughout the interface.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.reduceMotion}
                  onChange={(e) => updateSettings({ reduceMotion: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeSection === "editor" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Editor Settings</h3>
                <p className="text-xs text-muted">Customize the markdown editing environment.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Font Family</label>
                <select
                  value={settings.fontFamily}
                  onChange={(e) => updateSettings({ fontFamily: e.target.value })}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                >
                  <option value="system">System UI</option>
                  <option value="mono">Monospace</option>
                  <option value="serif">Serif</option>
                </select>
              </div>

              {/* Line Wrap */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Editor Line Wrapping</label>
                  <span className="text-[10px] text-muted">Wrap long lines to fit page bounds.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.lineWrap}
                  onChange={(e) => updateSettings({ lineWrap: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Tab Size */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Indent Tab Size</label>
                <select
                  value={settings.tabSize}
                  onChange={(e) => updateSettings({ tabSize: parseInt(e.target.value) })}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                >
                  <option value="2">2 Spaces</option>
                  <option value="4">4 Spaces</option>
                  <option value="8">8 Spaces</option>
                </select>
              </div>

              {/* Show line numbers */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Show Line Numbers</label>
                  <span className="text-[10px] text-muted">Display gutter line numbers in the editor.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showLineNumbers}
                  onChange={(e) => updateSettings({ showLineNumbers: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Auto-pair brackets */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Auto-pair Brackets</label>
                  <span className="text-[10px] text-muted">Automatically close (), [], and {} while typing.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoPairBrackets}
                  onChange={(e) => updateSettings({ autoPairBrackets: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Word count */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Show Word Count</label>
                  <span className="text-[10px] text-muted">Display character/word count in the status bar.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showWordCount}
                  onChange={(e) => updateSettings({ showWordCount: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Live Preview Timeout */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Live Preview Idle Delay: {settings.livePreviewTimeout}ms</label>
                <input
                  type="range"
                  min="500"
                  max="3000"
                  step="100"
                  value={settings.livePreviewTimeout}
                  onChange={(e) => updateSettings({ livePreviewTimeout: parseInt(e.target.value) })}
                  className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <span className="text-[10px] text-muted">Time idle in edit mode before automatically formatting preview content.</span>
              </div>
            </div>
          )}

          {activeSection === "files" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Files & Links Settings</h3>
                <p className="text-xs text-muted">Control default file configurations and filter views.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Default Location for New Notes</label>
                <input
                  type="text"
                  value={settings.newNoteLocation}
                  onChange={(e) => updateSettings({ newNoteLocation: e.target.value })}
                  placeholder="e.g. /notes"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                />
                <span className="text-[10px] text-muted">Sub-folder inside opened workspace where new notes are created.</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Attachments Folder</label>
                <input
                  type="text"
                  value={settings.attachmentsFolder}
                  onChange={(e) => updateSettings({ attachmentsFolder: e.target.value })}
                  placeholder="e.g. _attachments"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                />
                <span className="text-[10px] text-muted">Default folder for pasted/dropped attachments.</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Exclude Folders (comma-separated)</label>
                <input
                  type="text"
                  value={settings.excludedFolders}
                  onChange={(e) => updateSettings({ excludedFolders: e.target.value })}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                />
                <span className="text-[10px] text-muted">Directories that should be hidden from explorer lists (e.g. node_modules).</span>
              </div>
            </div>
          )}

          {activeSection === "project" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Project Management</h3>
                <p className="text-xs text-muted">Control how projects and vaults behave.</p>
              </div>

              <div className="rounded-md border border-border bg-bg/40 p-4">
                <h4 className="text-xs font-semibold text-text mb-2">Quick Actions</h4>
                <p className="text-[10px] text-muted mb-3">
                  Use the folders icon in the left navigation bar to open the Projects dialog. There you can add a
                  folder as a project, rename, pin, or delete projects. Switching projects opens the vault instantly.
                </p>
                <p className="text-[10px] text-muted">
                  Project data (name, path, last opened) is stored locally on this device.
                </p>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Reopen last project on launch</label>
                  <span className="text-[10px] text-muted">Remember and reopen the most recent vault automatically.</span>
                </div>
                <input
                  type="checkbox"
                  checked={!!settings.startupFolder}
                  onChange={(e) => updateSettings({})}
                  disabled
                  className="w-4 h-4 rounded border-border bg-bg/50 cursor-not-allowed"
                />
              </div>
            </div>
          )}

          {activeSection === "backup" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Google Drive Backup</h3>
                <p className="text-xs text-muted">
                  Connect a Google account to back up your vault notes to your own Google Drive.
                </p>
              </div>

              {!googleAccount ? (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    disabled={backupSigningIn}
                    className="flex items-center gap-2.5 rounded border border-border bg-bg/60 px-3 py-2.5 text-xs font-medium text-white hover:bg-card cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-wait"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
                      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 35.5 44 38 44 24c0-1.3-.1-2.6-.4-3.9z"/>
                    </svg>
                    {backupSigningIn ? "Waiting for Google sign-in in your browser…" : "Connect Google Drive"}
                  </button>
                  <span className="text-[10px] text-muted">
                    {backupSigningIn
                      ? "A browser window has opened. Complete the consent screen there and return here."
                      : "Sign in with Google to choose which folders to back up to your Drive."}
                  </span>
                  {backupError && <span className="text-[11px] text-red-400">Sign-in failed: {backupError}</span>}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="rounded-md border border-border bg-bg/40 p-3 flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-accent text-sm font-semibold text-white uppercase"
                    >
                      {googleAccount.email.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-white">{googleAccount.name}</p>
                      <p className="truncate text-[11px] text-muted">{googleAccount.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => signOutGoogle()}
                      className="ml-auto shrink-0 rounded border border-border bg-bg/60 px-2.5 py-1 text-[11px] font-medium text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                  <span className="text-[10px] text-muted">
                    Connected. Vault selection and the "Backup now" button arrive in the next milestone.
                  </span>
                </div>
              )}
            </div>
          )}

          {activeSection === "ai_byok" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">AI & BYOK Model Server</h3>
                <p className="text-xs text-muted">
                  Bring Your Own Key (BYOK) or connect a local Hermes / Ollama server endpoint.
                </p>
              </div>

              {/* Architecture Plan Banner */}
              <div className="rounded-md border border-accent/40 bg-accent/10 p-3.5 flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-accent">BYOK & Hermes Architecture Plan</span>
                    <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold text-accent uppercase">Architected</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Local plan document saved to <code className="text-text font-mono bg-bg/60 px-1 py-0.5 rounded">BYOK_HERMES_PLAN.md</code>. Integrates Hermes 3 function calling, local SQLite knowledge graph RAG, and multi-provider keys.
                  </p>
                </div>
              </div>

              {/* Enable AI Assistant Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium text-white">Enable AI Study Assistant</label>
                  <span className="text-[10px] text-muted">Toggle AI chat, note context attachments, and workspace reasoning.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.aiEnabled}
                  onChange={(e) => updateSettings({ aiEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Provider Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">AI Model Provider</label>
                <select
                  value={settings.aiProvider}
                  onChange={(e) => {
                    const provider = e.target.value;
                    const preset = getProviderPreset(provider);
                    const defaultUrl = preset?.defaultBaseUrl ?? settings.aiBaseUrl;
                    const defaultModel = preset?.defaultModel ?? settings.aiModelName;

                    updateSettings({
                      aiProvider: provider,
                      aiBaseUrl: defaultUrl,
                      aiModelName: defaultModel,
                    });
                  }}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                >
                  <option value="ollama_hermes">Local Nous Hermes / Ollama (Offline / Local Proxy)</option>
                  <option value="openrouter">OpenRouter (Online Hermes 3 / Llama 3.3 / Free Models)</option>
                  <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
                  <option value="anthropic">Anthropic (Claude 3.5 Sonnet / Haiku)</option>
                  <option value="gemini">Google Gemini (2.0 Flash / 1.5 Pro / Latest)</option>
                  <option value="custom">Custom OpenAI-Compatible Server (vLLM / LM Studio)</option>
                </select>
              </div>

              {/* Base URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">Server Base URL</label>
                <input
                  type="text"
                  value={settings.aiBaseUrl}
                  onChange={(e) => updateSettings({ aiBaseUrl: e.target.value })}
                  placeholder="e.g. http://localhost:11434/v1 or https://openrouter.ai/api/v1"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent font-mono"
                />
                <span className="text-[10px] text-muted">API endpoint base URL.</span>
              </div>

              {/* Model Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">Model Identifier</label>
                <input
                  type="text"
                  value={settings.aiModelName}
                  onChange={(e) => updateSettings({ aiModelName: e.target.value })}
                  placeholder="e.g. nousresearch/hermes-3-llama-3.1-405b or hermes3:8b"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent font-mono"
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-muted">Presets:</span>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "nousresearch/hermes-3-llama-3.1-405b" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-accent hover:border-accent font-mono cursor-pointer"
                  >
                    hermes-3-405b (OpenRouter)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "google/gemini-2.0-flash-exp:free" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-emerald-400 hover:border-emerald-400 font-mono cursor-pointer"
                  >
                    gemini-2.0-flash:free
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "gemini-2.0-flash" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-sky-400 hover:border-sky-400 font-mono cursor-pointer"
                  >
                    gemini-2.0-flash (Direct)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "gemini-1.5-pro" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-sky-400 hover:border-sky-400 font-mono cursor-pointer"
                  >
                    gemini-1.5-pro (Direct)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "hermes3:8b" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-muted hover:text-white font-mono cursor-pointer"
                  >
                    hermes3:8b (Local Ollama)
                  </button>
                </div>
                {/* Dynamic model pills — populated after "Fetch Models" or Test Connection */}
                {availableModels.length > 0 && (
                  <div className="flex flex-col gap-1 pt-1">
                    <span className="text-[10px] text-muted">Live models from your API key:</span>
                    <div className="flex flex-wrap gap-1">
                      {availableModels.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => updateSettings({ aiModelName: m })}
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-mono cursor-pointer transition-colors ${
                            settings.aiModelName === m
                              ? "border-accent bg-accent/20 text-white"
                              : "border-border/60 bg-bg/40 text-muted hover:border-accent hover:text-white"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {availableModels.length > 0 &&
                  !!settings.aiModelName &&
                  !availableModels.includes(settings.aiModelName) && (
                    <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
                      ⚠️ "{settings.aiModelName}" was not found in the live model list for this API key. It may have
                      been deprecated or renamed. Pick one from the list above, or click "Fetch Available Models"
                      again.
                    </div>
                  )}

              </div>

              {/* API Key */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">API Key (BYOK)</label>
                <div className="relative flex items-center">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={settings.aiApiKey}
                    onChange={(e) => updateSettings({ aiApiKey: e.target.value })}
                    placeholder={settings.aiProvider === "ollama_hermes" ? "Not required for local Ollama" : "sk-..."}
                    className="w-full rounded border border-border bg-bg/50 px-3 py-2 pr-16 text-xs text-text outline-none focus:border-accent font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 text-[10px] text-muted hover:text-white px-1.5 py-0.5 rounded bg-bg/80 cursor-pointer"
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {/* Test Connection + Fetch Models Buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  className="rounded border border-border bg-bg/60 px-3 py-1.5 text-xs font-medium text-text hover:bg-card hover:text-white cursor-pointer transition-colors"
                >
                  Test Connection
                </button>
                {(settings.aiProvider === "gemini" || settings.aiProvider === "openrouter") && (
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={fetchModelsStatus === "fetching"}
                    className="rounded border border-border bg-bg/60 px-3 py-1.5 text-xs font-medium text-sky-400 hover:bg-card hover:text-sky-300 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {fetchModelsStatus === "fetching" ? "Fetching..." : "↻ Fetch Available Models"}
                  </button>
                )}
                {fetchModelsStatus === "done" && (
                  <span className="text-xs text-sky-400">{availableModels.length} models loaded ✓</span>
                )}
                {fetchModelsStatus === "empty" && (
                  <span className="text-xs text-amber-400">No models returned. Check your API key and Base URL.</span>
                )}
                {testConnectionStatus && (
                  <span className={`text-xs ${testConnectionStatus === "success" ? "text-emerald-400" : "text-accent"}`}>
                    {testConnectionStatus === "testing" ? "Testing connection..." : testConnectionStatus === "success" ? "Connection Successful!" : testConnectionStatus}
                  </span>
                )}
              </div>

              {/* Enable Hermes Tool Calling & RAG Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium text-white">Workspace Tool Calling & RAG</label>
                  <span className="text-[10px] text-muted">Allow Hermes to query vault index (FTS5 search, backlinks graph) via function tools.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.aiEnableWorkspaceTools}
                  onChange={(e) => updateSettings({ aiEnableWorkspaceTools: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* System Prompt Override */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">System Instructions</label>
                <textarea
                  rows={3}
                  value={settings.aiSystemPrompt}
                  onChange={(e) => updateSettings({ aiSystemPrompt: e.target.value })}
                  className="w-full rounded border border-border bg-bg/50 p-2.5 text-xs text-text outline-none focus:border-accent resize-none leading-relaxed"
                />
              </div>

              {/* ─── Memory-RAG (Agent Knowledge) ─────────────────── */}
              <div className="pt-4 border-t border-border/40 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">🧠 Memory-RAG (Agent Knowledge)</h4>
                  <p className="text-[10px] text-muted mt-0.5">
                    Semantic memory + retrieval over your vault. Embeddings run against a local Ollama server; when it is offline, tools fall back to keyword search.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">Embedding Base URL</label>
                    <input
                      type="text"
                      value={settings.embedBaseUrl}
                      onChange={(e) => updateSettings({ embedBaseUrl: e.target.value })}
                      placeholder="http://localhost:11434"
                      className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">Embedding Model</label>
                    <input
                      type="text"
                      value={settings.embedModel}
                      onChange={(e) => updateSettings({ embedModel: e.target.value })}
                      placeholder="nomic-embed-text"
                      className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">RAG Top-K</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={settings.ragTopK}
                      onChange={(e) => updateSettings({ ragTopK: parseInt(e.target.value) || 5 })}
                      className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!currentFolderPath) {
                          setReindexStatus("Open a vault first.");
                          return;
                        }
                        setReindexStatus("Embedding chunks...");
                        try {
                          const { rebuildEmbeddings } = await import("../services/agentKnowledge");
                          const n = await rebuildEmbeddings(currentFolderPath, settings);
                          setReindexStatus(n === 0 ? "Embeddings up to date" : `Embedded ${n} chunks`);
                        } catch (err) {
                          setReindexStatus(`Failed: ${String(err)}`);
                        }
                      }}
                      className="rounded border border-border bg-bg/60 px-3 py-1.5 text-xs font-medium text-sky-400 hover:bg-card hover:text-sky-300 cursor-pointer transition-colors"
                    >
                      ↻ Re-index Embeddings
                    </button>
                    {reindexStatus && (
                      <span className="text-[10px] text-muted">{reindexStatus}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Auto-save conversation memory</label>
                    <span className="text-[10px] text-muted">Persist Q&A turns so future sessions recall them.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.memoryAutoSave !== false}
                    onChange={(e) => updateSettings({ memoryAutoSave: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>

                {/* File-write tools gate */}
                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Allow AI file writes</label>
                    <span className="text-[10px] text-muted">
                      Lets the AI create, edit, rename and delete notes (destructive actions still need your approval). Off by default.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.aiEnableFileWrite === true}
                    onChange={(e) => updateSettings({ aiEnableFileWrite: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>
              </div>

              {/* ─── OpenCode Agent ──────────────────────────────── */}
              <div className="pt-4 border-t border-border/40 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">🤖 OpenCode Agent</h4>
                  <p className="text-[10px] text-muted mt-0.5">
                    Settings for the OpenCode Agent tab. BYOK keys are injected from above at launch — no separate key configuration needed.
                  </p>
                </div>

                {/* Install status */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-text">OpenCode Status</label>
                    <span className="text-[10px] text-muted">
                      {(() => {
                        // Detect platform for the correct install command
                        const isWin = navigator.userAgent.toLowerCase().includes("windows");
                        return isWin ? "Install: winget install SST.opencode" : "Install: curl -fsSL https://opencode.ai/install | bash";
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-medium ${settings.opencodePort > 0 ? "text-muted" : "text-red-400"}`}>
                      port {settings.opencodePort}
                    </span>
                  </div>
                </div>

                {/* Server port */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-text">Server Port</label>
                  <input
                    type="number"
                    min={1024}
                    max={65535}
                    value={settings.opencodePort}
                    onChange={(e) => updateSettings({ opencodePort: parseInt(e.target.value) || 4096 })}
                    className="w-full rounded border border-border bg-bg/50 p-2 text-xs text-text outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-muted">
                    OpenCode's default is 4096. Change only if that port conflicts with another service.
                  </span>
                </div>

                {/* Auto-start toggle */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Auto-start on Agent Tab Switch</label>
                    <span className="text-[10px] text-muted">Automatically start opencode serve when you switch to the Agent tab.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.opencodeAutoStart}
                    onChange={(e) => updateSettings({ opencodeAutoStart: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === "connectors" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-white">Connectors & Research</h3>
                <p className="text-xs text-muted">
                  MCP servers expose tools to the AI assistant. Offline-first: every connector is opt-in and stays off until you enable it.
                </p>
              </div>

              {/* Online state */}
              <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${online ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-amber-400"}`} />
                {online ? "Online — web connectors (🔌) are available." : "Offline — web connectors will be skipped until you reconnect."}
              </div>

              {/* Add Connector */}
              <div className="relative">
                <button
                  onClick={() => setAddMode(addMode === "menu" ? "closed" : "menu")}
                  className="rounded border border-border bg-bg/60 px-3 py-1.5 text-xs font-medium text-text hover:bg-card hover:text-white cursor-pointer transition-colors"
                >
                  {addMode === "menu" ? "Close" : "+ Add Connector"}
                </button>

                {addMode === "menu" && (
                  <div className="absolute left-0 top-9 z-30 w-64 rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl">
                    {availablePresets.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">From preset</div>
                        {availablePresets.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              addConnector({
                                name: p.name,
                                kind: p.kind,
                                command: p.command,
                                args: p.args,
                                cwd: p.cwd,
                                url: p.url,
                                headers: p.headers,
                                env: p.env,
                              });
                              setAddMode("closed");
                            }}
                            className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                          >
                            <span>{p.name}</span>
                            <span className={`rounded px-1.5 py-px text-[9px] font-semibold uppercase ${p.kind === "http" ? "bg-sky-500/15 text-sky-400" : "bg-violet-500/15 text-violet-400"}`}>
                              {p.kind}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                    <div className="h-px bg-border/60 my-0.5" />
                    <button
                      onClick={startCustomAdd}
                      className="w-full rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                    >
                      Custom connector…
                    </button>
                  </div>
                )}
              </div>

              {/* Registry list */}
              <div className="space-y-2">
                {connectors.length === 0 && (
                  <div className="rounded-md border border-dashed border-border bg-bg/30 px-4 py-6 text-center text-[11px] text-muted">
                    No connectors registered. Add one above, or rerun to restore the built-in presets.
                  </div>
                )}

                {connectors.map((c) => {
                  const isExpanded = expandedId === c.id;
                  const status = testStatus[c.id];
                  return (
                    <div key={c.id} className="rounded-md border border-border bg-bg/40 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.enabled ? "bg-emerald-400" : "bg-border"}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-medium text-text">{c.name}</span>
                              <span className={`rounded px-1.5 py-px text-[9px] font-semibold uppercase ${c.kind === "http" ? "bg-sky-500/15 text-sky-400" : "bg-violet-500/15 text-violet-400"}`}>{c.kind}</span>
                              {c.kind === "http" && <span className="rounded px-1.5 py-px text-[9px] uppercase text-muted bg-border/40">🔌 web</span>}
                            </div>
                            <div className="truncate text-[10px] text-muted">
                              {c.kind === "stdio" ? `${c.command ?? ""} ${(c.args ?? []).join(" ")}`.trim() : c.url}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={c.enabled}
                            onChange={(e) => updateConnector(c.id, { enabled: e.target.checked })}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-border bg-bg/50 text-accent focus:ring-accent"
                            title={c.enabled ? "Disable connector" : "Enable connector"}
                          />
                          <button
                            onClick={() => handleTestConnector(c)}
                            className="cursor-pointer rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted hover:text-white transition-colors"
                          >
                            Test
                          </button>
                          <button
                            onClick={() => (isExpanded ? closeEditor() : startEditor(c))}
                            className="cursor-pointer rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted hover:text-white transition-colors"
                          >
                            {isExpanded ? "Close" : "Configure"}
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Remove connector "${c.name}"?`)) removeConnector(c.id);
                            }}
                            className="cursor-pointer rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-300 transition-colors"
                            title="Remove connector"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {status && (
                        <p className={`mt-1.5 text-[10px] ${status.startsWith("✓") ? "text-emerald-400" : status.startsWith("✗") ? "text-red-400" : "text-muted"}`}>
                          {status}
                        </p>
                      )}

                      {isExpanded && draft && (
                        <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            placeholder="Connector name"
                            className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
                          />
                          <select
                            value={draft.kind}
                            onChange={(e) => setDraft({ ...draft, kind: e.target.value as ConnectorKind })}
                            className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent cursor-pointer"
                          >
                            <option value="stdio">stdio (local binary)</option>
                            <option value="http">http (remote streamable-http)</option>
                          </select>

                          {draft.kind === "stdio" ? (
                            <>
                              <input
                                type="text"
                                value={draft.command ?? ""}
                                onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                                placeholder="e.g. npx, python -m, or a binary path"
                                className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                              />
                              <input
                                type="text"
                                value={draft.args?.join(", ") ?? ""}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    args: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                                  })
                                }
                                placeholder="Arguments, comma-separated — e.g. -y, @modelcontextprotocol/server-filesystem, /vault"
                                className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                              />
                              <input
                                type="text"
                                value={draft.cwd ?? ""}
                                onChange={(e) => setDraft({ ...draft, cwd: e.target.value })}
                                placeholder="Working directory (optional)"
                                className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                              />
                            </>
                          ) : (
                            <>
                              <input
                                type="text"
                                value={draft.url ?? ""}
                                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                                placeholder="https://mcp.example.com/sse"
                                className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                              />
                              <textarea
                                rows={3}
                                value={headersText}
                                onChange={(e) => setHeadersText(e.target.value)}
                                placeholder={'Headers (one per line), e.g.\nauthorization: Bearer sk-...'}
                                className="w-full resize-none rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono leading-relaxed"
                              />
                            </>
                          )}

                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={closeEditor}
                              className="cursor-pointer rounded border border-border/60 px-2.5 py-1 text-[10px] text-muted hover:text-white transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveDraft}
                              className="cursor-pointer rounded bg-accent px-2.5 py-1 text-[10px] font-medium text-white hover:bg-accent-hover transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Editor for a brand-new custom connector (no row yet) */}
              {expandedId === "__new__" && draft && (
                <div className="space-y-2 border-t border-border/40 pt-3">
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Connector name"
                    className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
                  />
                  <select
                    value={draft.kind}
                    onChange={(e) => setDraft({ ...draft, kind: e.target.value as ConnectorKind })}
                    className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="stdio">stdio (local binary)</option>
                    <option value="http">http (remote streamable-http)</option>
                  </select>

                  {draft.kind === "stdio" ? (
                    <>
                      <input
                        type="text"
                        value={draft.command ?? ""}
                        onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                        placeholder="e.g. npx, python -m, or a binary path"
                        className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                      />
                      <input
                        type="text"
                        value={draft.args?.join(", ") ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            args: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                          })
                        }
                        placeholder="Arguments, comma-separated — e.g. -y, @modelcontextprotocol/server-filesystem"
                        className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                      />
                      <input
                        type="text"
                        value={draft.cwd ?? ""}
                        onChange={(e) => setDraft({ ...draft, cwd: e.target.value })}
                        placeholder="Working directory (optional)"
                        className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                      />
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={draft.url ?? ""}
                        onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                        placeholder="https://mcp.example.com/sse"
                        className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                      />
                      <textarea
                        rows={3}
                        value={headersText}
                        onChange={(e) => setHeadersText(e.target.value)}
                        placeholder={"Headers (one per line), e.g.\nauthorization: Bearer sk-..."}
                        className="w-full resize-none rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono leading-relaxed"
                      />
                    </>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={closeEditor}
                      className="cursor-pointer rounded border border-border/60 px-2.5 py-1 text-[10px] text-muted hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveDraft}
                      className="cursor-pointer rounded bg-accent px-2.5 py-1 text-[10px] font-medium text-white hover:bg-accent-hover transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === "about" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">About</h3>
                <p className="text-xs text-muted">Local Study Notebook.</p>
              </div>

              <div className="rounded-md border border-border bg-bg/40 p-4 space-y-1.5 text-xs">
                <p><span className="text-muted">Name:</span> <span className="text-text">Local Study Notebook</span></p>
                <p><span className="text-muted">Version:</span> <span className="text-text">1.4.0</span></p>
                <p><span className="text-muted">Framework:</span> <span className="text-text">Tauri v2 · React · TypeScript</span></p>
                <p><span className="text-muted">Data:</span> <span className="text-text">Stored locally in the app data directory.</span></p>
              </div>

              <div className="rounded-md border border-border bg-bg/40 p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text">Software Updates</span>
                  {updateStatus !== "available" && (
                    <button
                      onClick={handleCheckForUpdates}
                      disabled={updateStatus === "checking"}
                      className="rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
                    >
                      {updateStatus === "checking" ? "Checking…" : "Check for Updates"}
                    </button>
                  )}
                </div>

                {updateStatus === "up-to-date" && (
                  <p className="text-muted">You're on the latest version.</p>
                )}

                {updateStatus === "available" && pendingUpdate && (
                  <div className="space-y-2">
                    <p className="text-text">
                      Version <span className="font-semibold text-accent">{pendingUpdate.version}</span> is available.
                    </p>
                    {pendingUpdate.body && (
                      <p className="text-muted whitespace-pre-line max-h-20 overflow-y-auto">{pendingUpdate.body}</p>
                    )}
                    <button
                      onClick={handleInstallUpdate}
                      disabled={updateStatus !== "available"}
                      className="rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-hover cursor-pointer transition-colors"
                    >
                      Download &amp; Restart to Install
                    </button>
                  </div>
                )}

                {updateStatus === "downloading" && (
                  <p className="text-muted">Downloading update, the app will restart automatically…</p>
                )}

                {updateStatus === "error" && (
                  <p className="text-red-400">Update check failed: {updateError}</p>
                )}
              </div>

              <p className="text-[10px] text-muted">
                An Obsidian-style local-first study notebook with sources, notes, and project vaults.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
````

### 7. `src/services/agentKnowledge.ts` (modified)

One-line fix: `ragLimit` -> `limit` when calling `fetchContextBundle`. Full current file below.

````ts
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../stores/useStore";
import { embedTexts, streamAIResponse, ChatMessagePayload } from "./aiProvider";

// ---------------------------------------------------------------------------
// Agent Knowledge Service (AGENT_MEMORY_RAG_PLAN.md, Phase 2).
// Single frontend wrapper over the Memory-RAG commands consumed by every surface
// (Study Assistant, Micro Agent panel, OpenCode bootstrap). Mirrors the tool-loop
// pattern in aiProvider.ts: all AI HTTP lives here/in aiProvider, Rust stores + ranks.
// ---------------------------------------------------------------------------

export interface RagHit {
  path: string;
  title: string;
  snippet: string;
  score: number;
  char_offset: number;
}

export interface MemoryItem {
  id: number;
  scope: string;
  kind: string;
  content: string;
  source: string;
  topic_title: string | null;
  created_at: string;
  score: number;
}

export interface ActiveNoteContext {
  path: string;
  title: string;
  excerpt: string;
}

export interface Backlink {
  id?: number;
  source_path: string;
  target_path: string;
  link_text: string;
  line_number: number;
}

export interface ContextBundle {
  scope: string;
  memory: MemoryItem[];
  rag: RagHit[];
  active_note: ActiveNoteContext | null;
  backlinks: Backlink[];
}

/** Embeds one query text; returns [] when the embed server is unreachable. */
async function embedQuery(text: string, settings: Settings): Promise<number[]> {
  try {
    const [vec] = await embedTexts([text], settings);
    return vec ?? [];
  } catch {
    return [];
  }
}

/**
 * Lazy, idempotent embedding rebuild: pulls chunks whose embedding is still NULL and
 * batches them to the Ollama server until none remain. Returns how many rows gained a
 * vector; stops early (returns accumulated count) if the server goes away mid-loop.
 */
export async function rebuildEmbeddings(vaultRoot: string, settings: Settings, batchSize = 16): Promise<number> {
  let total = 0;
  for (;;) {
    const chunks = await invoke<Array<{ rowid: number; path: string; chunk_index: number; text: string }>>(
      "get_unembedded_chunks",
      { vaultRoot, limit: batchSize }
    );
    if (!chunks.length) break;

    const embeddings = await embedTexts(chunks.map((c) => c.text), settings);
    const items: Array<{ rowid: number; embedding: number[] }> = [];
    chunks.forEach((c, i) => {
      const vec = embeddings[i];
      if (vec && vec.length) items.push({ rowid: c.rowid, embedding: vec });
    });
    if (!items.length) break; // embed server unavailable — keep what we have

    const updated = await invoke<number>("store_chunk_embeddings", {
      items,
      embedModel: settings.embedModel || "nomic-embed-text",
    });
    total += updated;
  }
  return total;
}

/**
 * Fetches the single ContextBundle a turn needs: recent related memory, RAG passages,
 * active-note excerpt, and backlinks. `queryText` defaults to the scope (topic title).
 */
export async function fetchContextBundle(opts: {
  vaultRoot: string;
  scope: string;
  queryText?: string;
  activeNotePath?: string | null;
  limit?: number;
}): Promise<ContextBundle | null> {
  const state = await import("../stores/useStore");
  const settings = state.useStore.getState().settings;
  if (!opts.vaultRoot || !opts.scope) return null;

  const queryText = opts.queryText || opts.scope;
  const queryEmbedding = await embedQuery(queryText, settings);

  return invoke<ContextBundle>("get_context_bundle", {
    vaultRoot: opts.vaultRoot,
    scope: opts.scope,
    queryText,
    queryEmbedding,
    activeNotePath: opts.activeNotePath ?? null,
    ragLimit: opts.limit ?? settings.ragTopK ?? 5,
  });
}

/** Persists a durable memory entry (kind: fact | context | message) with an embedding. */
export async function remember(opts: {
  scope: string;
  kind: "fact" | "context" | "message";
  content: string;
  source: string;
  topicTitle?: string;
}, settings?: Settings): Promise<number | null> {
  if (!opts.content.trim()) return null;
  const s = settings ?? (await import("../stores/useStore")).useStore.getState().settings;
  const embedding = await embedQuery(opts.content, s);
  try {
    return await invoke<number>("add_memory", {
      scope: opts.scope,
      kind: opts.kind,
      content: opts.content,
      source: opts.source,
      topicTitle: opts.topicTitle ?? null,
      embedding,
    });
  } catch {
    return null;
  }
}

/** Semantic recall over durable memory; degrades to keyword (created_at desc) offline. */
export async function recall(opts: {
  query: string;
  scope?: string;
  limit?: number;
}): Promise<MemoryItem[]> {
  const s = (await import("../stores/useStore")).useStore.getState().settings;
  const embedding = await embedQuery(opts.query, s);
  try {
    return await invoke<MemoryItem[]>("recall_memory", {
      scope: opts.scope ?? "global",
      queryText: opts.query,
      queryEmbedding: embedding,
      limit: opts.limit ?? s.ragTopK ?? 5,
    });
  } catch {
    return [];
  }
}

/** Renders a ContextBundle into prompt-injectable markdown. */
export function formatContextBundle(bundle: ContextBundle): string {
  const parts: string[] = [];

  if (bundle.active_note) {
    parts.push(
      `### Active Note: ${bundle.active_note.title}\nPath: \`${bundle.active_note.path}\`\n\n${bundle.active_note.excerpt.slice(0, 2000)}`
    );
  }

  if (bundle.rag.length) {
    const passages = bundle.rag
      .map((r) => `- **[${r.title}]** (score ${r.score.toFixed(3)}): ${r.snippet}`)
      .join("\n");
    parts.push(`### Related notes (retrieved)\n${passages}`);
  }

  if (bundle.memory.length) {
    const mem = bundle.memory
      .map((m) => `- [${m.kind}/${m.scope}] ${m.content}`)
      .join("\n");
    parts.push(`### Prior memory\n${mem}`);
  }

  if (bundle.backlinks.length) {
    const links = bundle.backlinks
      .map((b) => `- Linked from \`${b.source_path}\` (line ${b.line_number}): "${b.link_text}"`)
      .join("\n");
    parts.push(`### Backlinks\n${links}`);
  }

  return parts.join("\n\n");
}

/**
 * Composes the ChatMessagePayload[] the Study Assistant (and other surfaces) send to the
 * model: a system prompt fused with the Memory-RAG context bundle (memory digest, RAG
 * passages, backlinks), recent history, and an optional attachment block appended to the
 * latest user message. Replaces the ad-hoc `contextPrefix` + bare `slice(-10)` in
 * `sendAssistantMessage`. Degrades gracefully: offline/embed-server errors fall back to
 * the plain prompt + history.
 */
export async function buildPromptWithContext(opts: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  settings: Settings;
  scope: string;
  vaultRoot?: string;
  queryText?: string;
  attachment?: string;
  ragLimit?: number;
}): Promise<ChatMessagePayload[]> {
  const { settings, messages, scope, vaultRoot } = opts;
  const systemBase = settings.aiSystemPrompt || "You are an intelligent study assistant for Local Study Notebook.";

  let bundle: ContextBundle | null = null;
  if (vaultRoot) {
    try {
      bundle = await fetchContextBundle({
        vaultRoot,
        scope,
        queryText: opts.queryText || scope,
        limit: opts.ragLimit ?? settings.ragTopK ?? 5,
      });
    } catch {
      bundle = null;
    }
  }

  const contextBlock = bundle ? formatContextBundle(bundle) : "";
  const system = contextBlock
    ? `${systemBase}\n\nUse this retrieved context. Do not claim facts beyond it:\n\n${contextBlock}`
    : systemBase;

  const history = messages.slice(-10).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const historyPayload: ChatMessagePayload[] = [
    { role: "system", content: system },
    ...history,
  ];

  // Attach context (active-note excerpt, etc.) to the newest user turn explicitly.
  if (opts.attachment && historyPayload.length > 1) {
    const last = historyPayload[historyPayload.length - 1];
    historyPayload[historyPayload.length - 1] = {
      ...last,
      content: `${opts.attachment}${last.content}`,
    };
  }

  return historyPayload;
}

/** Persists a Q&A turn to durable memory when `memoryAutoSave` is enabled. */
export async function persistConversationTurn(opts: {
  userText: string;
  assistantText: string;
  scope: string;
}, settings?: Settings): Promise<number | null> {
  const s = settings ?? (await import("../stores/useStore")).useStore.getState().settings;
  if (s.memoryAutoSave === false) return null;
  if (!opts.assistantText.trim()) return null;
  return remember(
    {
      scope: opts.scope,
      kind: "message",
      content: `Q: ${opts.userText}\nA: ${opts.assistantText.slice(0, 2000)}`,
      source: "study-assistant",
      topicTitle: opts.scope,
    },
    s
  );
}

/**
 * Micro-agent executor used by the Agent panel (summarize/improve/assess/custom) and
 * reuseable anywhere a one-shot task needs memory + RAG context. Streams the completion
 * through `onChunk` and returns the final text.
 */
export async function runAgentTask(opts: {
  task: string;
  context: string;
  scope: string;
  vaultRoot: string;
  onChunk?: (text: string) => void;
  onStatusChange?: (status: string) => void;
}): Promise<string> {
  const { useStore } = await import("../stores/useStore");
  const store = useStore.getState();
  const settings = store.settings;

  const bundle = await fetchContextBundle({
    vaultRoot: opts.vaultRoot,
    scope: opts.scope,
    queryText: opts.context || opts.scope,
    activeNotePath: store.activeLeftTabId || store.activeRightTabId,
  });

  const contextBlock = bundle ? formatContextBundle(bundle) : "";
  const system = [
    "You are the Local Study Notebook micro-agent. Perform the requested task using only the provided context and your own knowledge.",
    "Do not invent facts not supported by the context. Keep the answer concise and well-structured.",
  ].join(" ");

  const messages: ChatMessagePayload[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: `[TASK]\n${opts.task}\n\n[CONTEXT]\n${contextBlock || opts.context}\n[TARGET TEXT]\n${opts.context}`,
    },
  ];

  let out = "";
  await streamAIResponse({
    messages,
    settings,
    onChunk: (t) => {
      out = t;
      opts.onChunk?.(t);
    },
    onStatusChange: opts.onStatusChange,
  });
  return out;
}
````

### 8. `src-tauri/src/lib.rs` (modified)

Added `mod mcp;`, `app.manage(McpState::default())`, and registered the four MCP commands. Full current file below.

````rust
mod chunks;
mod commands;
mod db;
mod drive;
mod embeddings;
mod mcp;

use db::DbState;
use mcp::McpState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");
            std::fs::create_dir_all(&app_dir)?;
            let db_state = DbState::new(&app_dir)?;
            app.manage(db_state);
            app.manage(drive::DriveState::default());
            app.manage(McpState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_backlinks,
            commands::get_outgoing_links,
            commands::reindex_vault,
            commands::read_local_dir,
            commands::read_local_file,
            commands::write_local_file,
            commands::create_local_file,
            commands::create_local_dir,
            commands::rename_local_entry,
            commands::delete_local_entry,
            commands::search_vault,
            // Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M1)
            commands::get_unembedded_chunks,
            commands::store_chunk_embeddings,
            // Memory-RAG (M2): hybrid retrieval + durable memory
            commands::search_rag,
            commands::add_memory,
            commands::recall_memory,
            commands::get_context_bundle,
            // OpenCode Agent process management
            commands::check_opencode_installed,
            commands::spawn_opencode_server,
            commands::kill_opencode_server,
            // Google Drive backup (BACKUP-0): OAuth sign-in/account/sign-out
            drive::google_account,
            drive::google_sign_in,
            drive::google_sign_out,
            // MCP connectors (MCP_CONNECTORS_PLAN.md): tool listing, calls, health, teardown
            mcp::list_connector_tools,
            mcp::call_connector_tool,
            mcp::test_connector,
            mcp::stop_connector
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

````

### 9. `src-tauri/src/commands.rs` (modified)

Added the OpenCode MCP export: `mcp_override`/`mcp_env` params on `spawn_opencode_server`, the `OPENCODE_MCP_CONFIG` static, and config cleanup in `kill_opencode_server`. Full current file below.

````rust
use crate::chunks;
use crate::db::{DbState, LinkItem};
use rusqlite::params;
use std::sync::{Mutex, OnceLock};
use tauri::{Manager, State};

/// Tracks the project-local `opencode.json` we write for a connector export, so
/// `kill_opencode_server` can remove it when the sidecar stops. This keeps the
/// export non-destructive and leaves no artifact behind in the user's vault.
static OPENCODE_MCP_CONFIG: OnceLock<Mutex<Option<std::path::PathBuf>>> = OnceLock::new();

// Local version history (DATA-3): before overwriting a tracked file, the previous content
// is copied into <app_data_dir>/history/<hash-of-path>/<timestamp>.<ext>, capped at the
// last MAX_HISTORY_VERSIONS per file. This is deliberately keyed off a hash of the path
// itself rather than the vault_index `files` table (DATA-2), so it doesn't depend on that
// still-unfinished ticket — a save works the same whether or not the index is in sync.
const MAX_HISTORY_VERSIONS: usize = 20;

fn path_history_key(path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn prune_history(history_dir: &std::path::Path) -> Result<(), String> {
    let mut entries: Vec<_> = std::fs::read_dir(history_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();
    // Filenames are fixed-width zero-padded timestamps, so lexical sort == chronological.
    entries.sort_by_key(|e| e.file_name());
    if entries.len() > MAX_HISTORY_VERSIONS {
        let excess = entries.len() - MAX_HISTORY_VERSIONS;
        for entry in entries.into_iter().take(excess) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    Ok(())
}

fn snapshot_previous_version(history_root: &std::path::Path, valid_path: &std::path::Path) -> Result<(), String> {
    if !valid_path.exists() {
        return Ok(()); // brand-new file — nothing to snapshot yet
    }
    let previous_content = std::fs::read(valid_path).map_err(|e| e.to_string())?;

    let key = path_history_key(&valid_path.to_string_lossy());
    let history_dir = history_root.join(key);
    std::fs::create_dir_all(&history_dir).map_err(|e| e.to_string())?;

    let timestamp = chrono::Local::now().format("%Y%m%d%H%M%S%3f");
    let ext = valid_path.extension().and_then(|e| e.to_str()).unwrap_or("md");
    let snapshot_path = history_dir.join(format!("{timestamp}.{ext}"));
    std::fs::write(&snapshot_path, &previous_content).map_err(|e| e.to_string())?;

    prune_history(&history_dir)
}

// Vault index sync (DATA-2): keeps the `files` table's content_hash/size/mtime current
// incrementally on every create/write/rename/delete, plus a full rescan (`reindex_vault`)
// triggered once when a vault is opened. `refreshExplorer` (called far more often — after
// every file op already, and on every folder-path change) deliberately does NOT trigger a
// rescan itself, since those exact operations already get incremental updates below; a full
// re-hash on every refresh would be redundant work, not just "infrequent" background cost.

fn content_hash(content: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn format_system_time(time: std::time::SystemTime) -> String {
    let datetime: chrono::DateTime<chrono::Local> = time.into();
    datetime.format("%Y-%m-%dT%H:%M:%S%.3f").to_string()
}

fn now_iso() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f").to_string()
}

fn upsert_file_index(conn: &rusqlite::Connection, path: &std::path::Path, content: &str) -> Result<(), String> {
    let path_str = path.to_string_lossy();
    let hash = content_hash(content);
    let size = content.len() as i64;
    let mtime = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map(format_system_time)
        .unwrap_or_else(|_| now_iso());

    conn.execute(
        "INSERT INTO files (path, content_hash, size_bytes, mtime, last_indexed_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(path) DO UPDATE SET
             content_hash = excluded.content_hash,
             size_bytes = excluded.size_bytes,
             mtime = excluded.mtime,
             last_indexed_at = excluded.last_indexed_at",
        params![path_str.as_ref(), hash, size, mtime, now_iso()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn remove_from_index_recursive(conn: &rusqlite::Connection, path_str: &str) -> Result<(), String> {
    // Covers both a single file (exact match) and a directory (prefix match on everything
    // nested under it) with one statement, rather than needing the caller to know which.
    let prefix_pattern = format!("{}{}%", path_str, std::path::MAIN_SEPARATOR);
    conn.execute(
        "DELETE FROM files WHERE path = ?1 OR path LIKE ?2",
        params![path_str, prefix_pattern],
    )
    .map_err(|e| e.to_string())?;
    // Memory-RAG: drop this file's (or subtree's) chunks too; chunks_fts syncs itself.
    conn.execute(
        "DELETE FROM note_chunks WHERE path = ?1 OR path LIKE ?2",
        params![path_str, prefix_pattern],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn reindex_after_rename(conn: &rusqlite::Connection, old_str: &str, new_str: &str) -> Result<(), String> {
    // A rename can be a single file or an entire directory (rewriting every nested path's
    // prefix) — resolved in Rust rather than raw SQL string surgery so OS path separators
    // are handled correctly instead of assuming '/'.
    let prefix_pattern = format!("{}{}%", old_str, std::path::MAIN_SEPARATOR);
    let mut stmt = conn
        .prepare("SELECT path FROM files WHERE path = ?1 OR path LIKE ?2")
        .map_err(|e| e.to_string())?;
    let matching_paths: Vec<String> = stmt
        .query_map(params![old_str, prefix_pattern], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    drop(stmt);

    for old_file_path in matching_paths {
        let new_file_path = if old_file_path == old_str {
            new_str.to_string()
        } else {
            format!("{}{}", new_str, &old_file_path[old_str.len()..])
        };
        conn.execute(
            "UPDATE files SET path = ?1 WHERE path = ?2",
            params![new_file_path, old_file_path],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE note_chunks SET path = ?1 WHERE path = ?2",
            params![new_file_path, old_file_path],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn reindex_dir_recursive(conn: &rusqlite::Connection, dir: &std::path::Path, depth: usize) -> Result<usize, String> {
    if depth > 8 {
        return Ok(0);
    }
    let mut count = 0;
    let read_entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in read_entries.filter_map(Result::ok) {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            count += reindex_dir_recursive(conn, &path, depth + 1)?;
        } else if let Ok(content) = std::fs::read_to_string(&path) {
            // Binary/non-UTF8 files are silently skipped — this index is for note content.
            if upsert_file_index(conn, &path, &content).is_ok() {
                if path.extension().and_then(|e| e.to_str()) == Some("md") {
                    // Memory-RAG: rebuild this file's text chunks. Embeddings stay NULL here;
                    // they're filled lazily by rebuild_embeddings once an embed server is up.
                    let _ = sync_chunks_for_file(conn, &path, &content);
                }
                count += 1;
            }
        }
    }
    Ok(count)
}

// Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M1): replace every stored chunk for a note with
// fresh chunks. The chunks_fts shadow table stays in sync automatically via the triggers
// declared in db.rs, so this function only touches note_chunks.
fn sync_chunks_for_file(conn: &rusqlite::Connection, path: &std::path::Path, content: &str) -> Result<(), String> {
    let path_str = path.to_string_lossy().into_owned();
    conn.execute("DELETE FROM note_chunks WHERE path = ?1", params![&path_str])
        .map_err(|e| e.to_string())?;

    for (i, chunk) in chunks::chunk_markdown(content).iter().enumerate() {
        conn.execute(
            "INSERT INTO note_chunks (path, chunk_index, chunk_text, char_offset, token_count, embed_model, embedding, indexed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, ?6)",
            params![&path_str, i as i64, &chunk.text, chunk.char_offset as i64, chunk.token_count as i64, now_iso()],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn reindex_vault(state: State<DbState>, vault_root: String) -> Result<usize, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    reindex_dir_recursive(&conn, root, 0)
}

pub fn extract_links(source_path: &str, content: &str) -> Vec<LinkItem> {
    let mut links = Vec::new();
    for (line_idx, line) in content.lines().enumerate() {
        let line_num = (line_idx + 1) as i64;

        // 1. Match [[WikiLink]] or [[WikiLink|Alias]]
        let mut start_search = 0;
        while let Some(start) = line[start_search..].find("[[") {
            let abs_start = start_search + start + 2;
            if let Some(end) = line[abs_start..].find("]]") {
                let inner = &line[abs_start..abs_start + end];
                let (target, alias) = if let Some(pipe_idx) = inner.find('|') {
                    (&inner[..pipe_idx], &inner[pipe_idx + 1..])
                } else {
                    (inner, inner)
                };
                let target_trimmed = target.trim();
                let alias_trimmed = alias.trim();
                if !target_trimmed.is_empty() {
                    links.push(LinkItem {
                        id: None,
                        source_path: source_path.to_string(),
                        target_path: target_trimmed.to_string(),
                        link_text: alias_trimmed.to_string(),
                        line_number: line_num,
                    });
                }
                start_search = abs_start + end + 2;
            } else {
                break;
            }
        }

        // 2. Match standard markdown links [text](target.md)
        let bytes = line.as_bytes();
        let mut idx = 0;
        while idx < bytes.len() {
            if bytes[idx] == b'[' {
                if let Some(close_bracket) = line[idx + 1..].find(']') {
                    let bracket_end = idx + 1 + close_bracket;
                    if bracket_end + 1 < bytes.len() && bytes[bracket_end + 1] == b'(' {
                        if let Some(close_paren) = line[bracket_end + 2..].find(')') {
                            let paren_end = bracket_end + 2 + close_paren;
                            let link_text = &line[idx + 1..bracket_end];
                            let target = &line[bracket_end + 2..paren_end];

                            let target_trimmed = target.trim();
                            if !target_trimmed.starts_with("http://")
                                && !target_trimmed.starts_with("https://")
                                && !target_trimmed.starts_with('#')
                                && !target_trimmed.is_empty()
                            {
                                links.push(LinkItem {
                                    id: None,
                                    source_path: source_path.to_string(),
                                    target_path: target_trimmed.to_string(),
                                    link_text: link_text.trim().to_string(),
                                    line_number: line_num,
                                });
                            }
                            idx = paren_end + 1;
                            continue;
                        }
                    }
                }
            }
            idx += 1;
        }
    }
    links
}

fn sync_links_internal(conn: &rusqlite::Connection, source_path: &str, content: &str) -> Result<(), String> {
    let parsed_links = extract_links(source_path, content);

    conn.execute(
        "DELETE FROM links WHERE source_path = ?1",
        params![source_path],
    )
    .map_err(|e| e.to_string())?;

    for link in parsed_links {
        conn.execute(
            "INSERT INTO links (source_path, target_path, link_text, line_number) VALUES (?1, ?2, ?3, ?4)",
            params![link.source_path, link.target_path, link.link_text, link.line_number],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// A wiki-link `[[Foo]]` or markdown link `[text](Foo.md)` stores a short, user-authored
// target string in `links.target_path` — not a resolved filesystem path. A real caller of
// get_backlinks passes the currently-open note's full canonical path, which is never a
// suffix of that short string (the previous `target_path LIKE '%' || ?1` query had the
// comparison backwards, so it could never match anything). Resolved instead by comparing
// basenames without extension, case-insensitively — matching Obsidian's own default
// wiki-link resolution (by filename/title anywhere in the vault, not by exact path).
fn link_target_basename(raw: &str) -> String {
    let trimmed = raw.trim();
    let last_segment = trimmed.rsplit(['/', '\\']).next().unwrap_or(trimmed);
    let without_ext = last_segment.strip_suffix(".md").unwrap_or(last_segment);
    without_ext.to_lowercase()
}

#[tauri::command]
pub fn get_backlinks(state: State<DbState>, target_path: String) -> Result<Vec<LinkItem>, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let normalized_target = link_target_basename(&target_path);

    let mut stmt = conn
        .prepare("SELECT id, source_path, target_path, link_text, line_number FROM links ORDER BY source_path, line_number")
        .map_err(|e| e.to_string())?;

    let rows: Vec<LinkItem> = stmt
        .query_map([], |row| {
            Ok(LinkItem {
                id: Some(row.get(0)?),
                source_path: row.get(1)?,
                target_path: row.get(2)?,
                link_text: row.get(3)?,
                line_number: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|link| link_target_basename(&link.target_path) == normalized_target)
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_outgoing_links(state: State<DbState>, source_path: String) -> Result<Vec<LinkItem>, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, source_path, target_path, link_text, line_number FROM links WHERE source_path = ?1 ORDER BY line_number")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![source_path], |row| {
            Ok(LinkItem {
                id: Some(row.get(0)?),
                source_path: row.get(1)?,
                target_path: row.get(2)?,
                link_text: row.get(3)?,
                line_number: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

#[tauri::command]
pub fn read_local_dir(path: String, excluded_folders: Option<Vec<String>>) -> Result<Vec<FileEntry>, String> {
    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let exclusions: Vec<String> = excluded_folders
        .unwrap_or_default()
        .into_iter()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();

    read_local_dir_internal(root, 0, &exclusions)
}

fn read_local_dir_internal(path: &std::path::Path, depth: usize, exclusions: &[String]) -> Result<Vec<FileEntry>, String> {
    if depth > 4 {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let read_entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in read_entries {
        if let Ok(entry) = entry {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            
            // Skip hidden directories/files (e.g. .git, .vscode)
            if name.starts_with('.') {
                continue;
            }

            let name_lower = name.to_lowercase();
            if exclusions.iter().any(|ex| ex == &name_lower) {
                continue;
            }

            let is_dir = entry_path.is_dir();
            let children = if is_dir {
                Some(read_local_dir_internal(&entry_path, depth + 1, exclusions)?)
            } else {
                None
            };

            entries.push(FileEntry {
                name,
                path: entry_path.to_string_lossy().into_owned(),
                is_dir,
                children,
            });
        }
    }

    // Sort: directories first, then files alphabetically (case-insensitive)
    entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

fn validate_vault_path(path_str: &str, vault_root_str: Option<&str>) -> Result<std::path::PathBuf, String> {
    let raw_path = std::path::Path::new(path_str);

    let vault_root_path = match vault_root_str {
        Some(v) if !v.trim().is_empty() => {
            let p = std::path::Path::new(v);
            if p.exists() {
                std::fs::canonicalize(p).map_err(|e| format!("Invalid vault root path: {}", e))?
            } else {
                p.to_path_buf()
            }
        }
        _ => return Ok(raw_path.to_path_buf()),
    };

    let canonical_target = if raw_path.exists() {
        std::fs::canonicalize(raw_path).map_err(|e| format!("Invalid path: {}", e))?
    } else if let Some(parent) = raw_path.parent() {
        if parent.exists() {
            let canonical_parent = std::fs::canonicalize(parent).map_err(|e| format!("Invalid parent path: {}", e))?;
            let file_name = raw_path.file_name().ok_or_else(|| "Invalid file name".to_string())?;
            canonical_parent.join(file_name)
        } else {
            return Err("Target parent directory does not exist".to_string());
        }
    } else {
        return Err("Invalid path structure".to_string());
    };

    if !canonical_target.starts_with(&vault_root_path) {
        return Err(format!(
            "Security Violation: Target path '{:?}' lies outside vault root '{:?}'",
            canonical_target, vault_root_path
        ));
    }

    Ok(canonical_target)
}

#[tauri::command]
pub fn read_local_file(path: String, vault_root: Option<String>) -> Result<String, String> {
    let valid_path = validate_vault_path(&path, vault_root.as_deref())?;
    std::fs::read_to_string(valid_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_local_file(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
    path: String,
    content: String,
    vault_root: Option<String>,
) -> Result<(), String> {
    let valid_path = validate_vault_path(&path, vault_root.as_deref())?;

    if let Ok(app_dir) = app_handle.path().app_data_dir() {
        let history_root = app_dir.join("history");
        if let Err(e) = snapshot_previous_version(&history_root, &valid_path) {
            // Never let a history-snapshot failure block the actual save.
            eprintln!("Failed to snapshot previous version of {:?}: {e}", valid_path);
        }
    }

    std::fs::write(&valid_path, &content).map_err(|e| e.to_string())?;

    let canon_str = valid_path.to_string_lossy();
    if let Ok(conn) = state.vault_index.lock() {
        let _ = sync_links_internal(&conn, &canon_str, &content);
        let _ = upsert_file_index(&conn, &valid_path, &content);
    }
    Ok(())
}

#[tauri::command]
pub fn create_local_file(
    state: State<DbState>,
    dir_path: String,
    name: String,
    vault_root: Option<String>,
) -> Result<String, String> {
    // Trim and guard against empty names
    let base = name.trim();
    if base.is_empty() {
        return Err("File name cannot be empty".to_string());
    }

    // Build the final file name. If the user did not include an extension,
    // default to .md; otherwise keep their extension exactly as given.
    let file_name = if base.contains('.') {
        base.to_string()
    } else {
        format!("{}.md", base)
    };

    let target_dir = validate_vault_path(&dir_path, vault_root.as_deref())?;
    if !target_dir.is_dir() {
        return Err("Target parent is not a directory".to_string());
    }

    let file_path = target_dir.join(&file_name);
    let valid_file_path = validate_vault_path(&file_path.to_string_lossy(), vault_root.as_deref())?;

    if valid_file_path.exists() {
        return Err("File already exists".to_string());
    }

    let initial_content = if file_name.ends_with(".md") || file_name.ends_with(".markdown") {
        let title = file_name.trim_end_matches(".md").trim_end_matches(".markdown");
        format!("# {}\n", title)
    } else {
        String::new()
    };

    std::fs::write(&valid_file_path, &initial_content).map_err(|e| e.to_string())?;

    if let Ok(conn) = state.vault_index.lock() {
        let _ = upsert_file_index(&conn, &valid_file_path, &initial_content);
    }

    Ok(valid_file_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn create_local_dir(parent_path: String, name: String, vault_root: Option<String>) -> Result<String, String> {
    let folder_name = name.trim();
    if folder_name.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }

    let parent_dir = validate_vault_path(&parent_path, vault_root.as_deref())?;
    if !parent_dir.is_dir() {
        return Err("Parent path is not a directory".to_string());
    }

    let new_dir_path = parent_dir.join(folder_name);
    let valid_dir_path = validate_vault_path(&new_dir_path.to_string_lossy(), vault_root.as_deref())?;

    if valid_dir_path.exists() {
        return Err("Directory already exists".to_string());
    }

    std::fs::create_dir_all(&valid_dir_path).map_err(|e| e.to_string())?;
    Ok(valid_dir_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn rename_local_entry(
    state: State<DbState>,
    old_path: String,
    new_path: String,
    vault_root: Option<String>,
) -> Result<(), String> {
    let valid_old = validate_vault_path(&old_path, vault_root.as_deref())?;
    let valid_new = validate_vault_path(&new_path, vault_root.as_deref())?;

    if !valid_old.exists() {
        return Err("Target to rename does not exist".to_string());
    }

    let old_str = valid_old.to_string_lossy();
    let new_str = valid_new.to_string_lossy();

    std::fs::rename(&valid_old, &valid_new).map_err(|e| e.to_string())?;

    if let Ok(conn) = state.vault_index.lock() {
        let _ = conn.execute(
            "UPDATE links SET source_path = ?1 WHERE source_path = ?2",
            params![new_str.as_ref(), old_str.as_ref()],
        );
        let _ = conn.execute(
            "UPDATE links SET target_path = ?1 WHERE target_path = ?2",
            params![new_str.as_ref(), old_str.as_ref()],
        );
        let _ = reindex_after_rename(&conn, old_str.as_ref(), new_str.as_ref());
    }
    Ok(())
}

#[tauri::command]
pub fn delete_local_entry(
    state: State<DbState>,
    path: String,
    vault_root: Option<String>,
) -> Result<(), String> {
    let valid_path = validate_vault_path(&path, vault_root.as_deref())?;
    if !valid_path.exists() {
        return Err("Path to delete does not exist".to_string());
    }

    // Safety guard: Never allow deleting the vault root itself!
    if let Some(vr) = vault_root.as_deref() {
        if let Ok(vr_canon) = std::fs::canonicalize(vr) {
            if valid_path == vr_canon {
                return Err("Refusing to delete the root vault directory".to_string());
            }
        }
    }

    let path_str = valid_path.to_string_lossy();

    if valid_path.is_dir() {
        std::fs::remove_dir_all(&valid_path).map_err(|e| e.to_string())?;
    } else {
        std::fs::remove_file(&valid_path).map_err(|e| e.to_string())?;
    }

    if let Ok(conn) = state.vault_index.lock() {
        let _ = conn.execute(
            "DELETE FROM links WHERE source_path = ?1 OR target_path = ?2",
            params![path_str.as_ref(), path_str.as_ref()],
        );
        let _ = remove_from_index_recursive(&conn, path_str.as_ref());
    }
    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct SearchResultItem {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub line_number: usize,
}

#[tauri::command]
pub fn search_vault(vault_root: String, query: String) -> Result<Vec<SearchResultItem>, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Vault root is not a directory".to_string());
    }
    let query_lower = query.trim().to_lowercase();
    if query_lower.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    let mut stack = vec![root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }

            if path.is_dir() {
                stack.push(path);
            } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    let title = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| name.clone());
                    for (idx, line) in content.lines().enumerate() {
                        if line.to_lowercase().contains(&query_lower) {
                            results.push(SearchResultItem {
                                path: path.to_string_lossy().to_string(),
                                title: title.clone(),
                                snippet: line.trim().to_string(),
                                line_number: idx + 1,
                            });
                            if results.len() >= 30 {
                                break;
                            }
                        }
                    }
                }
            }
            if results.len() >= 30 {
                break;
            }
        }
        if results.len() >= 30 {
            break;
        }
    }

    Ok(results)
}

// Memory-RAG (M1): lazy embedding sync. The frontend pulls chunks whose embedding is
// still NULL, batches them to the embed server, then writes the vectors back here. This
// split keeps ALL AI HTTP in the frontend (consistent with aiProvider.ts) while the
// vectors and retrieval stay in SQLite.

#[derive(serde::Serialize)]
pub struct UnembeddedChunk {
    pub rowid: i64,
    pub path: String,
    pub chunk_index: i64,
    pub text: String,
}

#[tauri::command]
pub fn get_unembedded_chunks(state: State<DbState>, vault_root: String, limit: usize) -> Result<Vec<UnembeddedChunk>, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let root_str = root.to_string_lossy();
    let prefix = format!(
        "{}{}%",
        root_str.trim_end_matches(std::path::MAIN_SEPARATOR),
        std::path::MAIN_SEPARATOR
    );

    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT rowid, path, chunk_index, chunk_text
             FROM note_chunks
             WHERE embedding IS NULL AND path LIKE ?1
             ORDER BY rowid
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![prefix, limit.max(0) as i64], |row| {
            Ok(UnembeddedChunk {
                rowid: row.get(0)?,
                path: row.get(1)?,
                chunk_index: row.get(2)?,
                text: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[derive(serde::Deserialize)]
pub struct EmbeddedChunk {
    pub rowid: i64,
    pub embedding: Vec<f32>,
}

#[tauri::command]
pub fn store_chunk_embeddings(state: State<DbState>, items: Vec<EmbeddedChunk>, embed_model: String) -> Result<usize, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let mut updated = 0usize;
    for item in items.iter() {
        let bytes = crate::embeddings::pack_f32s(&item.embedding);
        updated += conn
            .execute(
                "UPDATE note_chunks SET embedding = ?1, embed_model = ?2 WHERE rowid = ?3",
                params![bytes.as_slice(), &embed_model, item.rowid],
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(updated)
}

// ---------------------------------------------------------------------------
// Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M2): hybrid retrieval + durable memory.
//
// Ranking model: FTS5 pre-filters candidates to a small set, then an optional query
// embedding re-ranks them by cosine similarity when the embed server was reachable.
// When no vectors exist (server down / index not built yet), results degrade gracefully
// to pure keyword ranking. All AI HTTP stays in the frontend; Rust owns storage + math.
// ---------------------------------------------------------------------------

fn vault_path_prefix(root: &std::path::Path) -> String {
    let root_str = root.to_string_lossy();
    format!(
        "{}{}%",
        root_str.trim_end_matches(std::path::MAIN_SEPARATOR),
        std::path::MAIN_SEPARATOR
    )
}

/// Splits a free-text query into sanitized FTS5 terms (alphanumeric only, lowercased).
/// Quoting each term neutralizes FTS5 operator syntax in user input.
fn fts_terms(query: &str) -> Vec<String> {
    query
        .split(|c: char| !c.is_alphanumeric())
        .map(|t| t.trim().to_lowercase())
        .filter(|t| !t.is_empty())
        .collect()
}

fn fts_match_query(query: &str) -> Option<String> {
    let terms = fts_terms(query);
    if terms.is_empty() {
        return None;
    }
    let quoted: Vec<String> = terms.into_iter().map(|t| format!("\"{t}\"")).collect();
    Some(quoted.join(" "))
}

#[derive(serde::Serialize)]
pub struct RagHit {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub score: f32,
    pub char_offset: i64,
}

fn title_from_path(path: &std::path::Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Untitled".to_string())
}

fn search_rag_internal(
    conn: &rusqlite::Connection,
    vault_root: &std::path::Path,
    query_text: &str,
    query_embedding: &[f32],
    limit: usize,
) -> Result<Vec<RagHit>, String> {
    if limit == 0 {
        return Ok(Vec::new());
    }
    let match_query = match fts_match_query(query_text) {
        Some(q) => q,
        None => return Ok(Vec::new()),
    };
    let prefix = vault_path_prefix(vault_root);
    const CANDIDATES: i64 = 50;

    // 1. Keyword pre-filter (works fully offline).
    let mut stmt = conn
        .prepare(
            "SELECT rowid, rank FROM chunks_fts
             WHERE chunks_fts MATCH ?1
               AND rowid IN (SELECT rowid FROM note_chunks WHERE path LIKE ?2)
             ORDER BY rank
             LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;
    let candidates: Vec<(i64, f32)> = stmt
        .query_map(params![match_query, prefix, CANDIDATES], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    drop(stmt);
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    // 2. Load chunk metadata + optional stored vector for each candidate.
    struct CandidateRow {
        chunk: RagHit,
        embedding: Option<Vec<f32>>,
    }
    let mut rows: Vec<CandidateRow> = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT path, chunk_index, chunk_text, char_offset, embedding
                 FROM note_chunks WHERE rowid = ?1",
            )
            .map_err(|e| e.to_string())?;
        for (rowid, rank) in candidates.iter() {
            let fetched = stmt
                .query_row(params![rowid], |row| {
                    let path: String = row.get(0)?;
                    let _chunk_index: i64 = row.get(1)?;
                    let chunk_text: String = row.get(2)?;
                    let char_offset: i64 = row.get(3)?;
                    let embedding: Option<Vec<u8>> = row.get(4)?;
                    Ok((
                        path,
                        chunk_text,
                        char_offset,
                        embedding.map(|b| crate::embeddings::unpack_f32s(&b)),
                    ))
                })
                .map_err(|e| e.to_string());
            if let Ok((path, text, char_offset, embedding)) = fetched {
                let snippet: String = text.chars().take(600).collect();
                rows.push(CandidateRow {
                    chunk: RagHit {
                        title: title_from_path(std::path::Path::new(&path)),
                        snippet,
                        path: path.clone(),
                        char_offset,
                        score: *rank,
                    },
                    embedding,
                });
            }
        }
    }

    // 3. Re-rank by cosine when possible; otherwise keep keyword (rank) order.
    if !query_embedding.is_empty() {
        for row in rows.iter_mut() {
            if let Some(vec) = &row.embedding {
                row.chunk.score = crate::embeddings::cosine(query_embedding, vec);
            } else {
                row.chunk.score = 0.0;
            }
        }
        // Embedded hits first (cosine desc), then unembedded in keyword order.
        rows.sort_by(|a, b| {
            b.chunk
                .score
                .partial_cmp(&a.chunk.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        // Recover stable keyword order for the unembedded tail.
        rows.sort_by(|a, b| {
            let a_embedded = a.embedding.is_some();
            let b_embedded = b.embedding.is_some();
            match (a_embedded, b_embedded) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                (true, true) => b
                    .chunk
                    .score
                    .partial_cmp(&a.chunk.score)
                    .unwrap_or(std::cmp::Ordering::Equal),
                (false, false) => a
                    .chunk
                    .score
                    .partial_cmp(&b.chunk.score)
                    .unwrap_or(std::cmp::Ordering::Equal),
            }
        });
    }

    Ok(rows
        .into_iter()
        .take(limit)
        .map(|r| r.chunk)
        .collect())
}

#[tauri::command]
pub fn search_rag(
    state: State<DbState>,
    vault_root: String,
    query_text: String,
    query_embedding: Vec<f32>,
    limit: usize,
) -> Result<Vec<RagHit>, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    search_rag_internal(&conn, root, &query_text, &query_embedding, limit)
}

#[derive(serde::Serialize)]
pub struct MemoryItem {
    pub id: i64,
    pub scope: String,
    pub kind: String,
    pub content: String,
    pub source: String,
    pub topic_title: Option<String>,
    pub created_at: String,
    pub score: f32,
}

#[tauri::command]
pub fn add_memory(
    state: State<DbState>,
    scope: String,
    kind: String,
    content: String,
    source: String,
    topic_title: Option<String>,
    embedding: Vec<f32>,
) -> Result<i64, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let bytes = if embedding.is_empty() {
        None
    } else {
        Some(crate::embeddings::pack_f32s(&embedding))
    };
    conn.execute(
        "INSERT INTO memory_entries (scope, kind, content, source, topic_title, created_at, embedding)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![scope, kind, content, source, topic_title, now_iso(), bytes.as_deref()],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn recall_memory_internal(
    conn: &rusqlite::Connection,
    scope: &str,
    query_text: &str,
    query_embedding: &[f32],
    limit: usize,
) -> Result<Vec<MemoryItem>, String> {
    if limit == 0 {
        return Ok(Vec::new());
    }
    let like = query_text.trim();
    let scope_filter = if scope.trim().is_empty() {
        "%".to_string()
    } else {
        scope.to_string()
    };

    struct Row {
        item: MemoryItem,
        embedding: Option<Vec<f32>>,
    }
    let mut rows: Vec<Row> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, scope, kind, content, source, topic_title, created_at, embedding
                 FROM memory_entries
                 WHERE active = 1
                   AND scope LIKE ?1
                   AND (?2 = '' OR content LIKE '%' || ?2 || '%')
                 ORDER BY created_at DESC
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let collected = stmt
            .query_map(params![scope_filter, like, limit as i64], |row| {
                let id: i64 = row.get(0)?;
                let scope: String = row.get(1)?;
                let kind: String = row.get(2)?;
                let content: String = row.get(3)?;
                let source: String = row.get(4)?;
                let topic_title: Option<String> = row.get(5)?;
                let created_at: String = row.get(6)?;
                let embedding: Option<Vec<u8>> = row.get(7)?;
                Ok(Row {
                    item: MemoryItem {
                        id,
                        scope,
                        kind,
                        content,
                        source,
                        topic_title,
                        created_at,
                        score: 0.0,
                    },
                    embedding: embedding.map(|b| crate::embeddings::unpack_f32s(&b)),
                })
            })
            .map_err(|e| e.to_string())?;

        collected
            .filter_map(Result::ok)
            .take(limit)
            .collect()
    };

    if !query_embedding.is_empty() {
        for row in rows.iter_mut() {
            if let Some(vec) = &row.embedding {
                row.item.score = crate::embeddings::cosine(query_embedding, vec);
            }
        }
        rows.sort_by(|a, b| {
            b.item
                .score
                .partial_cmp(&a.item.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    Ok(rows.into_iter().take(limit).map(|r| r.item).collect())
}

#[tauri::command]
pub fn recall_memory(
    state: State<DbState>,
    scope: String,
    query_text: String,
    query_embedding: Vec<f32>,
    limit: usize,
) -> Result<Vec<MemoryItem>, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    recall_memory_internal(&conn, &scope, &query_text, &query_embedding, limit)
}

fn backlinks_for_path(conn: &rusqlite::Connection, target_path: &str) -> Result<Vec<LinkItem>, String> {
    let normalized_target = link_target_basename(target_path);
    let mut stmt = conn
        .prepare("SELECT id, source_path, target_path, link_text, line_number FROM links ORDER BY source_path, line_number")
        .map_err(|e| e.to_string())?;
    let rows: Vec<LinkItem> = stmt
        .query_map([], |row| {
            Ok(LinkItem {
                id: Some(row.get(0)?),
                source_path: row.get(1)?,
                target_path: row.get(2)?,
                link_text: row.get(3)?,
                line_number: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|link| link_target_basename(&link.target_path) == normalized_target)
        .collect();
    Ok(rows)
}

#[derive(serde::Serialize)]
pub struct ActiveNoteContext {
    pub path: String,
    pub title: String,
    pub excerpt: String,
}

#[derive(serde::Serialize)]
pub struct ContextBundle {
    pub scope: String,
    pub memory: Vec<MemoryItem>,
    pub rag: Vec<RagHit>,
    pub active_note: Option<ActiveNoteContext>,
    pub backlinks: Vec<LinkItem>,
}

#[tauri::command]
pub fn get_context_bundle(
    state: State<DbState>,
    vault_root: String,
    scope: String,
    query_text: String,
    query_embedding: Vec<f32>,
    active_note_path: Option<String>,
    rag_limit: usize,
) -> Result<ContextBundle, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;

    let memory = recall_memory_internal(&conn, "", &scope, &query_embedding, rag_limit)?;
    let rag = search_rag_internal(&conn, root, &query_text, &query_embedding, rag_limit)?;

    let active_note = match &active_note_path {
        Some(path_str) if !path_str.trim().is_empty() => {
            std::fs::read_to_string(path_str).ok().map(|content| {
                let title = title_from_path(std::path::Path::new(path_str));
                let excerpt: String = content.chars().take(2500).collect();
                ActiveNoteContext {
                    path: path_str.clone(),
                    title,
                    excerpt,
                }
            })
        }
        _ => None,
    };

    let backlinks = match &active_note_path {
        Some(path_str) => backlinks_for_path(&conn, path_str)?,
        None => Vec::new(),
    };

    Ok(ContextBundle {
        scope,
        memory,
        rag,
        active_note,
        backlinks,
    })
}

#[cfg(test)]
mod backlink_tests {
    use super::*;

    #[test]
    fn matches_bare_wikilink_target_against_full_path() {
        let sep = std::path::MAIN_SEPARATOR;
        let full_path = format!("C:{sep}vault{sep}Notes{sep}Foo.md");
        // [[Foo]] stores target_path = "Foo"
        assert_eq!(link_target_basename("Foo"), link_target_basename(&full_path));
    }

    #[test]
    fn matches_markdown_link_target_with_extension_and_relative_prefix() {
        let sep = std::path::MAIN_SEPARATOR;
        let full_path = format!("C:{sep}vault{sep}Notes{sep}Foo.md");
        // [text](../Foo.md) stores target_path = "../Foo.md"
        assert_eq!(link_target_basename("../Foo.md"), link_target_basename(&full_path));
    }

    #[test]
    fn is_case_insensitive() {
        assert_eq!(link_target_basename("FOO"), link_target_basename("foo.md"));
    }

    #[test]
    fn distinguishes_different_notes() {
        assert_ne!(link_target_basename("Foo"), link_target_basename("Bar.md"));
    }
}

#[cfg(test)]
mod index_tests {
    use super::*;
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE files (
                path            TEXT PRIMARY KEY,
                content_hash    TEXT NOT NULL,
                size_bytes      INTEGER NOT NULL,
                mtime           TEXT NOT NULL,
                last_indexed_at TEXT NOT NULL,
                last_backed_up_at TEXT,
                sync_status     TEXT NOT NULL DEFAULT 'not_tracked'
            );
            CREATE TABLE note_chunks (
                rowid       INTEGER PRIMARY KEY AUTOINCREMENT,
                path        TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                chunk_text  TEXT NOT NULL,
                char_offset INTEGER NOT NULL,
                token_count INTEGER NOT NULL,
                embed_model TEXT,
                embedding   BLOB,
                indexed_at  TEXT NOT NULL,
                UNIQUE(path, chunk_index)
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn upsert_is_idempotent_for_unchanged_content() {
        let dir = std::env::temp_dir().join("lsn_test_index_idempotent");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file_path = dir.join("note.md");
        std::fs::write(&file_path, "unchanged content").unwrap();

        let conn = test_conn();
        // Simulates a full rescan followed by an incremental update for the same file
        // with the same content — the acceptance criterion this ticket specifies.
        upsert_file_index(&conn, &file_path, "unchanged content").unwrap();
        let hash_after_rescan: String = conn
            .query_row("SELECT content_hash FROM files WHERE path = ?1", params![file_path.to_string_lossy().as_ref()], |r| r.get(0))
            .unwrap();

        upsert_file_index(&conn, &file_path, "unchanged content").unwrap();
        let hash_after_incremental: String = conn
            .query_row("SELECT content_hash FROM files WHERE path = ?1", params![file_path.to_string_lossy().as_ref()], |r| r.get(0))
            .unwrap();

        assert_eq!(hash_after_rescan, hash_after_incremental, "hash must be identical for unchanged content");

        // Also confirms the ON CONFLICT path really is an update, not a duplicate row.
        let row_count: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0)).unwrap();
        assert_eq!(row_count, 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn upsert_preserves_sync_status_on_update() {
        let dir = std::env::temp_dir().join("lsn_test_index_sync_status");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file_path = dir.join("note.md");
        std::fs::write(&file_path, "v1").unwrap();

        let conn = test_conn();
        upsert_file_index(&conn, &file_path, "v1").unwrap();
        conn.execute(
            "UPDATE files SET sync_status = 'synced' WHERE path = ?1",
            params![file_path.to_string_lossy().as_ref()],
        )
        .unwrap();

        std::fs::write(&file_path, "v2").unwrap();
        upsert_file_index(&conn, &file_path, "v2").unwrap();

        let sync_status: String = conn
            .query_row("SELECT sync_status FROM files WHERE path = ?1", params![file_path.to_string_lossy().as_ref()], |r| r.get(0))
            .unwrap();
        assert_eq!(sync_status, "synced", "an unrelated content update must not reset sync_status");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rename_updates_exact_and_nested_paths() {
        let sep = std::path::MAIN_SEPARATOR;
        let conn = test_conn();
        let old_dir = format!("C:{sep}vault{sep}Notes");
        let new_dir = format!("C:{sep}vault{sep}Renamed");
        let nested_old = format!("{old_dir}{sep}inner.md");
        let unrelated = format!("C:{sep}vault{sep}NotesButNotReally{sep}other.md");

        for p in [&old_dir, &nested_old, &unrelated] {
            conn.execute(
                "INSERT INTO files (path, content_hash, size_bytes, mtime, last_indexed_at) VALUES (?1, 'h', 0, 't', 't')",
                params![p],
            )
            .unwrap();
        }

        reindex_after_rename(&conn, &old_dir, &new_dir).unwrap();

        let remaining_old: i64 = conn
            .query_row("SELECT COUNT(*) FROM files WHERE path = ?1", params![old_dir], |r| r.get(0))
            .unwrap();
        assert_eq!(remaining_old, 0, "old directory path must no longer exist");

        let nested_new = format!("{new_dir}{sep}inner.md");
        let nested_moved: i64 = conn
            .query_row("SELECT COUNT(*) FROM files WHERE path = ?1", params![nested_new], |r| r.get(0))
            .unwrap();
        assert_eq!(nested_moved, 1, "nested file must have its path prefix rewritten");

        let unrelated_untouched: i64 = conn
            .query_row("SELECT COUNT(*) FROM files WHERE path = ?1", params![unrelated], |r| r.get(0))
            .unwrap();
        assert_eq!(unrelated_untouched, 1, "a similarly-named but distinct directory must not be affected");
    }

    #[test]
    fn remove_from_index_recursive_removes_nested_but_not_unrelated() {
        let sep = std::path::MAIN_SEPARATOR;
        let conn = test_conn();
        let dir_path = format!("C:{sep}vault{sep}ToDelete");
        let nested = format!("{dir_path}{sep}child.md");
        let unrelated = format!("C:{sep}vault{sep}ToDeleteButNotReally{sep}other.md");

        for p in [&dir_path, &nested, &unrelated] {
            conn.execute(
                "INSERT INTO files (path, content_hash, size_bytes, mtime, last_indexed_at) VALUES (?1, 'h', 0, 't', 't')",
                params![p],
            )
            .unwrap();
        }

        remove_from_index_recursive(&conn, &dir_path).unwrap();

        let remaining: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0)).unwrap();
        assert_eq!(remaining, 1, "only the unrelated path should survive");

        let unrelated_survives: i64 = conn
            .query_row("SELECT COUNT(*) FROM files WHERE path = ?1", params![unrelated], |r| r.get(0))
            .unwrap();
        assert_eq!(unrelated_survives, 1);
    }
}

#[cfg(test)]
mod history_tests {
    use super::*;

    #[test]
    fn snapshots_previous_content_before_overwrite() {
        let dir = std::env::temp_dir().join("lsn_test_history_basic");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let history_root = dir.join("history");
        let file_path = dir.join("note.md");

        std::fs::write(&file_path, "version one").unwrap();
        snapshot_previous_version(&history_root, &file_path).unwrap();
        std::fs::write(&file_path, "version two").unwrap();

        let key = path_history_key(&file_path.to_string_lossy());
        let versions_dir = history_root.join(&key);
        let entries: Vec<_> = std::fs::read_dir(&versions_dir).unwrap().collect();
        assert_eq!(entries.len(), 1, "expected exactly one snapshot after one overwrite");

        let snapshot_content = std::fs::read_to_string(entries[0].as_ref().unwrap().path()).unwrap();
        assert_eq!(snapshot_content, "version one", "snapshot must hold the PREVIOUS content, not the new one");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn new_file_produces_no_snapshot() {
        let dir = std::env::temp_dir().join("lsn_test_history_newfile");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let history_root = dir.join("history");
        let file_path = dir.join("brand-new.md");

        // File doesn't exist yet — nothing to snapshot.
        snapshot_previous_version(&history_root, &file_path).unwrap();
        assert!(!history_root.exists(), "no history directory should be created for a file that never existed");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prunes_to_max_history_versions() {
        let dir = std::env::temp_dir().join("lsn_test_history_prune");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let history_root = dir.join("history");
        let file_path = dir.join("note.md");

        std::fs::write(&file_path, "v0").unwrap();
        for i in 1..=(MAX_HISTORY_VERSIONS + 5) {
            snapshot_previous_version(&history_root, &file_path).unwrap();
            std::fs::write(&file_path, format!("v{i}")).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(5));
        }

        let key = path_history_key(&file_path.to_string_lossy());
        let versions_dir = history_root.join(&key);
        let count = std::fs::read_dir(&versions_dir).unwrap().count();
        assert_eq!(count, MAX_HISTORY_VERSIONS, "history must be capped at MAX_HISTORY_VERSIONS");

        let _ = std::fs::remove_dir_all(&dir);
    }
}

// ---------------------------------------------------------------------------
// OpenCode Agent: process management commands
//
// These commands manage the lifecycle of an `opencode serve` sidecar process
// that powers the OpenCode Agent tab in the AI Assistant Panel.
//
// Security notes (spec §"Corrected: Secrets Handling"):
// - BYOK API keys are injected as env vars scoped to the child process only.
// - They are NEVER written to disk (no ~/.config/opencode/config.json writes).
// - A per-session random password (OPENCODE_SERVER_PASSWORD) is generated by the
//   frontend and passed here; held only in Zustand state (never localStorage).
// - Ollama/local provider needs no API key env var at all.
// ---------------------------------------------------------------------------

/// Checks whether the `opencode` binary is on PATH by running `opencode --version`.
/// Returns true if the exit code is 0 (installed + accessible), false otherwise.
#[tauri::command]
pub fn check_opencode_installed() -> bool {
    std::process::Command::new("opencode")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Spawns `opencode serve --port <port>` in the given workspace directory.
///
/// `provider_env` is a map of env var → value for the user's BYOK credentials
/// (e.g. {"OPENAI_API_KEY": "sk-...", "GOOGLE_GENERATIVE_AI_API_KEY": "AIza..."}).
/// `server_password` is injected as OPENCODE_SERVER_PASSWORD so the local HTTP
/// endpoint is authenticated even though it only binds to localhost.
/// Returns the child PID on success, or an error string on failure.
#[tauri::command]
pub fn spawn_opencode_server(
    port: u16,
    workspace_path: String,
    server_password: String,
    provider_env: std::collections::HashMap<String, String>,
    mcp_override: Option<String>,
    mcp_env: Option<std::collections::HashMap<String, String>>,
) -> Result<u32, String> {
    let workspace = std::path::Path::new(&workspace_path);
    if !workspace.exists() {
        return Err(format!(
            "Workspace path does not exist: {}",
            workspace_path
        ));
    }

    let mut cmd = std::process::Command::new("opencode");
    cmd.arg("serve")
        .arg("--port")
        .arg(port.to_string())
        // Scope OpenCode's file tools to the user's vault.
        .current_dir(workspace)
        // Authenticate the local HTTP endpoint per spec §"Corrected: Local Server Authentication"
        .env("OPENCODE_SERVER_PASSWORD", &server_password)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    // Inject BYOK credentials scoped to this child process only — never written to disk.
    for (key, value) in &provider_env {
        if !value.is_empty() {
            cmd.env(key, value);
        }
    }

    // OpenCode MCP export (§ MCP_CONNECTORS_PLAN 6.3): OpenCode has no CLI flag to
    // register MCP servers for `serve` (verified: v1.18 accepts only project/global
    // config), so we write a project-local `opencode.json` — but ONLY when the vault
    // has no existing opencode config, so a user's own config is never clobbered.
    // Secrets (headers/env) are exported as `{env:VAR}` placeholders; the real values
    // are injected into this child's environment only, so nothing secret hits disk.
    if let Some(override_str) = mcp_override.filter(|s| !s.trim().is_empty()) {
        let dot_opencode = workspace.join(".opencode");
        let candidates = [
            workspace.join("opencode.json"),
            workspace.join("opencode.jsonc"),
            dot_opencode.join("opencode.json"),
            dot_opencode.join("opencode.jsonc"),
        ];
        let has_existing = candidates.iter().any(|p| p.exists());
        if has_existing {
            eprintln!("[OpenCode] existing opencode config found; skipping connector export");
        } else {
            let config_file = workspace.join("opencode.json");
            std::fs::write(&config_file, &override_str).map_err(|e| {
                format!("Failed to write connector config for opencode serve: {e}")
            })?;
            if let Some(env) = mcp_env {
                for (key, value) in env {
                    if !value.is_empty() {
                        cmd.env(key, value);
                    }
                }
            }
            if let Some(lock) = OPENCODE_MCP_CONFIG.get() {
                lock.lock().map_err(|e| e.to_string())?.replace(config_file);
            } else {
                let _ = OPENCODE_MCP_CONFIG
                    .set(Mutex::new(Some(config_file)));
            }
        }
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn opencode serve: {e}"))?;

    Ok(child.id())
}

/// Kills a running OpenCode server process by PID.
/// Uses taskkill on Windows, SIGTERM on Unix for a clean shutdown.
#[tauri::command]
pub fn kill_opencode_server(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| format!("taskkill failed: {e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| format!("kill failed: {e}"))?;
    }

    // Remove the connector-export config we wrote into the vault (if any).
    let Ok(mut lock) = OPENCODE_MCP_CONFIG.get_or_init(Default::default).lock() else {
        return Ok(());
    };
    if let Some(path) = lock.take() {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

````

