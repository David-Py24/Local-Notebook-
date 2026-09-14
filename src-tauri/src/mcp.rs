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