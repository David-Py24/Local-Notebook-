import { invoke } from "@tauri-apps/api/core";
import type { ChatPart, ChatPartState } from "../stores/useStore";

// ---------------------------------------------------------------------------
// Structured OpenCode errors (OPENCODE_HTTP500_DIAGNOSIS_PLAN.md, workstream A).
// The raw HTTP status alone (e.g. "HTTP 500") is useless for triage: opencode's
// server wraps provider/model failures as generic 5xx, and the real reason lives
// in the response body. We now capture the body, classify it, and surface it both
// in the thrown error and in the opt-in debug log so the UI can branch on the
// actual cause instead of blaming the install.
// ---------------------------------------------------------------------------

export type OpenCodeErrorCategory = "http" | "provider" | "network" | "session";

export class OpenCodeError extends Error {
  readonly status: number | null;
  readonly body: string;
  readonly category: OpenCodeErrorCategory;
  constructor(status: number | null, category: OpenCodeErrorCategory, message: string, body = "") {
    super(message);
    this.name = "OpenCodeError";
    this.status = status;
    this.body = body;
    this.category = category;
  }
}

const PROVIDER_ERROR_HINTS =
  /\b(api key|apikey|authorization|unauthorized|forbidden|model not found|model .* not (found|exist)|not found|quota|rate limit|insufficient|invalid model|connection refused|econnrefused|failed to (connect|reach)|free tier|cloudflare)\b/i;

function truncate(s: string, max = 600): string {
  return s.length > max ? `${s.slice(0, max)}…(truncated)` : s;
}

/**
 * Classifies a non-OK response from `POST /session/:id/message` into a category
 * the UI can action on. `provider` = model/credentials/connectivity inside the
 * sidecar (the common 500); `session` = server/session identity issues (401/404);
 * `http` = unexpected server-side refusal, body carried verbatim when present.
 */
export function classifyOpenCodeHttpError(
  status: number,
  body: string
): { category: OpenCodeErrorCategory; message: string } {
  const detail = body.trim() ? truncate(body, 600) : "";
  if (status === 401) {
    return {
      category: "session",
      message:
        "OpenCode server rejected auth (HTTP 401). The server on the runtime port may not be ours — restart the server in Settings → OpenCode Agent.",
    };
  }
  if (status === 403) {
    return {
      category: "provider",
      message: `OpenCode rejected the message (HTTP 403): ${detail || "provider denies access (free tier or API key limits)"}`,
    };
  }
  if (status === 404) {
    return {
      category: "session",
      message:
        "OpenCode session not found (HTTP 404). The session expired or was recycled; a fresh session will be created on the next attempt.",
    };
  }
  if (status >= 500 || PROVIDER_ERROR_HINTS.test(detail)) {
    return {
      category: "provider",
      message: `OpenCode rejected the message (HTTP ${status}): ${detail || "provider/model error — the server returned no error details"}`,
    };
  }
  return {
    category: "http",
    message: `OpenCode rejected the message (HTTP ${status}): ${detail || "the server returned no error details"}`,
  };
}

/**
 * Best-effort append to the local AI debug log (Settings → "Verbose AI tool logging").
 * The OpenCode path has no other diagnostics wiring (OPENCODE_HTTP500_DIAGNOSIS_PLAN.md,
 * workstream A) — this mirrors the pattern in aiProvider.ts. Never throws.
 */
function logDebug(enabled: boolean | undefined, line: string): void {
  if (!enabled) return;
  const truncated = line.length > 4000 ? `${line.slice(0, 4000)}…(truncated)` : line;
  invoke("append_ai_debug_log", { line: `[${new Date().toISOString()}] ${truncated}` }).catch(() => {});
}

async function safeBodyText(res: Response): Promise<string> {
  try {
    const ct = res.headers?.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = await res.json();
      return typeof data === "string" ? data : JSON.stringify(data);
    }
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Human-facing message shown in the Assistant panel when the OpenCode engine fails.
 * Branching on `opencodeInstalled` stops the app from blaming a missing CLI when the
 * resolver already proved the binary exists (OPENCODE_HTTP500_DIAGNOSIS_PLAN.md, workstream E).
 */
export function opencodeFallbackMessage(err: unknown, opts: { installed: boolean }): string {
  let detail: string;
  let category: OpenCodeErrorCategory | null = null;
  if (err instanceof OpenCodeError) {
    detail = err.message;
    category = err.category;
  } else {
    detail = err instanceof Error ? err.message : String(err);
  }

  if (!opts.installed) {
    return `⚠️ OpenCode Agent error: ${detail}\n\nOpenCode is not installed. Install it with \`${getPlatformInstallCmd()}\` to use the OpenCode agent engine.`;
  }
  if (category === "provider") {
    return `⚠️ OpenCode Agent error: ${detail}\n\nThis looks like a provider/model problem. Check your **Settings → AI & BYOK Model** credentials and model name, then **Restart server** in **Settings → OpenCode Agent** (or start a fresh session).`;
  }
  if (category === "session") {
    return `⚠️ OpenCode Agent error: ${detail}\n\nTry **Restart server** in **Settings → OpenCode Agent**, which also starts a fresh session.`;
  }
  if (category === "network") {
    return `⚠️ OpenCode Agent error: ${detail}\n\nCheck that nothing else is using the OpenCode port (default 4096) — close other OpenCode servers, then **Restart server** in **Settings → OpenCode Agent**.`;
  }
  return `⚠️ OpenCode Agent error: ${detail}\n\nOpenCode is installed and reachable — this is not an install problem. If it persists, **Restart server** in **Settings → OpenCode Agent**.`;
}

// ---------------------------------------------------------------------------
// OpenCode HTTP transport shared by the fused Assistant panel.
//
// Wire shapes verified against a live `opencode serve` instance (v1.18.16):
//   - the event type is "message.part.updated", not "part.updated"
//   - a message's metadata arrives as `properties.info`, not `properties.message`
//   - tool calls are `{ type: "tool", tool: <name>, callID, state: {...} }`
//   - a message never carries its own `parts` array; parts stream in separately,
//     correlated back to a message via `part.messageID`
//   - completion is signalled by `session.idle` (deprecated) or
//     `session.status` with `{ status: { type: "idle" } }` for the session
// ---------------------------------------------------------------------------

interface OpenCodeToolState {
  status: "pending" | "running" | "completed" | "error";
  input?: Record<string, unknown>;
  output?: string;
  title?: string;
  error?: string;
}

export interface OpenCodePart {
  id?: string;
  messageID?: string;
  type: string; // "text" | "tool" | "reasoning" | "step-start" | "step-finish" | "file" | ...
  text?: string;
  tool?: string;
  callID?: string;
  state?: OpenCodeToolState;
}

interface OpenCodeMessageInfo {
  id: string;
  role: "user" | "assistant";
}

interface OpenCodeSSEEvent {
  type: string;
  properties?: {
    sessionID?: string;
    info?: OpenCodeMessageInfo;
    part?: OpenCodePart;
    status?: { type: string };
    error?: unknown;
  };
}

// Platform-specific install commands (spec: no npm install -g, use winget/curl).
export const OPENCODE_INSTALL_HINT =
  "Install OpenCode to make it the primary assistant engine. It supports your existing BYOK keys too.";

export function getPlatformInstallCmd(): string {
  if (navigator.userAgent.toLowerCase().includes("windows")) {
    return "winget install SST.opencode";
  }
  return "curl -fsSL https://opencode.ai/install | bash";
}

export function opencodeBaseUrl(port: number): string {
  return `http://localhost:${port}`;
}

export function opencodeAuthHeaders(password: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (password) {
    headers["Authorization"] = `Basic ${btoa(`opencode:${password}`)}`;
  }
  return headers;
}

// OpenCode provider IDs differ from the app's BYOK provider labels. Maps a BYOK
// setup to an OpenCode model ref (`{providerID, modelID}`) so the sidecar uses the
// same tool-capable model the user configured for BYOK instead of OpenCode's own
// default (which can route to an OpenRouter endpoint with no tool support).
const PROVIDER_ID_MAP: Record<string, string> = {
  opencode_zen: "opencode",
  opencode_big_pickle: "opencode",
  opencode_zen_smart: "opencode",
  opencode_zen_fast: "opencode",
  opencode_zen_deepseek: "opencode",
  openai: "openai",
  anthropic: "anthropic",
  gemini: "google",
  openrouter: "openrouter",
  ollama_hermes: "ollama",
  ollama: "ollama",
};

export function resolveOpencodeModel(settings: {
  aiProvider?: string;
  aiModelName?: string;
}): { providerID: string; modelID: string } | null {
  const providerID = PROVIDER_ID_MAP[(settings.aiProvider || "").toLowerCase()];
  const modelID = (settings.aiModelName || "").trim();
  if (!providerID || !modelID) return null;
  return { providerID, modelID };
}

const FILE_EDIT_TOOLS = ["write", "edit", "patch", "delete"];

function isFileEditTool(tool: string): boolean {
  return FILE_EDIT_TOOLS.some((t) => tool.toLowerCase().includes(t));
}

// Maps OpenCode tool-state statuses onto the shared ChatPartState (unknown → pending).
function normalizePartState(st: string | undefined): ChatPartState {
  if (st === "running" || st === "completed" || st === "error" || st === "pending") return st;
  return "pending";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * EventPipeline implements OpenChamber-style 100ms event batch coalescing (Blueprint_opencode.md).
 * Buffers raw SSE payload strings and flushes ordered batches every 100ms to reduce UI render jitter.
 */
export class EventPipeline {
  private queue: string[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private handler: (raw: string) => void;
  private intervalMs: number;

  constructor(handler: (raw: string) => void, intervalMs = 100) {
    this.handler = handler;
    this.intervalMs = intervalMs;
  }

  public push(raw: string): void {
    this.queue.push(raw);
    if (!this.timer) {
      this.timer = setInterval(() => this.flush(), this.intervalMs);
    }
  }

  public flush(): void {
    if (this.queue.length === 0) {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      return;
    }
    const batch = this.queue.splice(0, this.queue.length);
    for (const raw of batch) {
      this.handler(raw);
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}

/**
 * Pre-validates model availability against OpenCode's GET /provider endpoint
 * (OpenChamber gateway pattern). Returns a tri-state:
 *   { known: true,  ok: true  } — provider found and model listed
 *   { known: true,  ok: false } — provider found but model NOT offered (hard miss)
 *   { known: false, ok: true  } — could not confirm either way (network/parse/
 *                                 unknown provider or models shape); caller proceeds
 * The function never reports a hard miss on an unverifiable state, so a model name
 * only fails a pre-check when the sidecar's own provider list proves it is absent.
 */
export interface ModelPreCheck {
  known: boolean;
  ok: boolean;
}

function providerHasModel(provider: { id?: string; models?: unknown }, modelID: string): boolean | null {
  const models = provider?.models;
  if (Array.isArray(models)) {
    // opencode exposes models as an array of { id, name, ... } objects
    return models.some((m: { id?: string }) => !!m && m.id === modelID);
  }
  if (models && typeof models === "object") {
    // older/dict-style registries: { modelID -> model }
    return modelID in (models as Record<string, unknown>);
  }
  return null;
}

export async function verifyOpencodeModelCapability(options: {
  port: number;
  password: string | null;
  providerID: string;
  modelID: string;
}): Promise<ModelPreCheck> {
  try {
    const res = await fetch(`${opencodeBaseUrl(options.port)}/provider`, {
      method: "GET",
      headers: opencodeAuthHeaders(options.password),
    });
    if (!res.ok) return { known: false, ok: true };
    // GET /provider returns { providers: [...], default, connected } (verified on
    // opencode 1.18.30); older builds returned a bare array. Accept both.
    const data = await res.json();
    const providers = Array.isArray(data) ? data : data?.providers;
    if (!Array.isArray(providers)) return { known: false, ok: true };
    const match = providers.find((p: { id?: string }) => !!p && p.id === options.providerID);
    if (!match) return { known: false, ok: true };
    const has = providerHasModel(match, options.modelID);
    if (has === null) return { known: false, ok: true };
    return { known: true, ok: has };
  } catch {
    return { known: false, ok: true };
  }
}

/**
 * Decides what the engine loop should do after a model pre-check:
 *   "stream" — proceed with the OpenCode sidecar
 *   "byok"   — model confirmed missing and BYOK fallback is enabled
 *   "error"  — model confirmed missing and no fallback; caller should throw
 * Unverifiable checks (known:false) always stream.
 */
export type ModelPreCheckRoute = "stream" | "byok" | "error";

export function routeModelPreCheck(res: ModelPreCheck, fallbackToByok: boolean): ModelPreCheckRoute {
  if (res.known && !res.ok) return fallbackToByok ? "byok" : "error";
  return "stream";
}

/**
 * Re-hydrates message history from OpenCode's GET /session/:id/message endpoint
 * (OpenChamber session re-hydration pattern).
 */
export async function rehydrateOpencodeSession(options: {
  port: number;
  password: string | null;
  sessionId: string;
}): Promise<Array<{ id: string; role: "user" | "assistant"; text: string }>> {
  try {
    const res = await fetch(`${opencodeBaseUrl(options.port)}/session/${options.sessionId}/message`, {
      method: "GET",
      headers: opencodeAuthHeaders(options.password),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((msg: { id?: string; role?: "user" | "assistant"; parts?: Array<{ text?: string }>; text?: string }) => ({
      id: msg.id || "",
      role: msg.role || "assistant",
      text: Array.isArray(msg.parts)
        ? msg.parts.map((p) => p.text || "").join("")
        : msg.text || "",
    }));
  } catch {
    return [];
  }
}

/**
 * Creates a new opencode session via `POST /session`. Used by the 5xx retry path to
 * re-issue a failed message against a fresh session (OPENCODE_HTTP500_DIAGNOSIS_PLAN.md,
 * workstream D) — repeat 500s are frequently a poisoned/stale session.
 */
export async function createOpencodeSession(options: {
  port: number;
  password: string | null;
  workspaceDir?: string | null;
}): Promise<string> {
  const baseUrl = opencodeBaseUrl(options.port);
  const headers = opencodeAuthHeaders(options.password);
  // opencode 1.18.30 rejects ANY body field on POST /session ("BadRequest") — the
  // session is rooted at the server's CWD, which the sidecar spawns scoped to the
  // vault (commands.rs spawn_opencode_server). Try the empty body first, then fall
  // back to the workspaceDir body for older serve builds that required it.
  const bodies: string[] = [JSON.stringify({})];
  if (options.workspaceDir) bodies.push(JSON.stringify({ workspaceDir: options.workspaceDir }));
  let lastStatus = 0;
  let lastBodyText = "";
  for (const body of bodies) {
    const res = await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers,
      body,
    });
    if (res.ok) {
      const data = await res.json();
      return data.id ?? data.sessionID ?? "";
    }
    lastStatus = res.status ?? 0;
    lastBodyText = await safeBodyText(res);
  }
  const { category, message } = classifyOpenCodeHttpError(lastStatus, lastBodyText);
  throw new OpenCodeError(lastStatus, category, message, lastBodyText);
}

/**
 * Sends one text message to an existing opencode session and streams the assistant's
 * reply via the session's /event SSE channel. Resolves once the session is idle.
 *
 * The SSE subscription is opened BEFORE the POST so no events are missed. Text parts
 * are accumulated by part id (each part carries its full latest text) and concatenated
 * in insertion order, matching the verified OpenCodeView behavior. If the stream drops
 * it reconnects up to `maxReconnects` times; beyond that the request rejects so callers
 * can route to a fallback engine.
 */
export async function streamOpencodeReply(options: {
  sessionId: string;
  port: number;
  password: string | null;
  text: string;
  model?: { providerID: string; modelID: string } | null;
  signal?: AbortSignal;
  /** Workspace used when creating a fresh session for the 5xx retry (workstream D). */
  workspaceDir?: string | null;
  /** Set false to disable the one-time fresh-session retry on 5xx. */
  retry5xx?: boolean;
  /** Called when the 5xx retry created a fresh session, so callers can adopt the new id. */
  onSessionRecycled?: (sessionId: string) => void;
  onChunk: (text: string) => void;
  onStatusChange?: (status: string) => void;
  onToolCall?: (tool: string, status: string) => void;
  onFileEdit?: () => void;
  /**
   * OpenChamber-style structured part stream (CHAT_UI_REDESIGN_PLAN.md). Emits a
   * normalized ChatPart per `message.part.updated`: text/reasoning parts carry
   * their full latest text (callers upsert by `id`), tool parts carry live
   * state transitions so the UI can render running → completed/error chips
   * with durations. Additive — onChunk/onToolCall remain for legacy callers.
   */
  onPart?: (part: ChatPart) => void;
  /** Opt-in verbose diagnostics (Settings → "Verbose AI tool logging"). */
  debug?: boolean;
}): Promise<string> {
  const { port, password, text, model, signal } = options;
  const baseUrl = opencodeBaseUrl(port);
  const headers = opencodeAuthHeaders(password);
  const maxReconnects = 3;

  // Runs one full message round-trip against a specific session (SSE pump + POST).
  // Each attempt gets fresh accumulation state, so a retry against a different
  // session id cannot pick up parts/roles from the failed attempt's stream.
  const attemptSession = (sid: string): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      const controller = new AbortController();
      const forwardAbort = () => controller.abort();
      signal?.addEventListener("abort", forwardAbort, { once: true });

      const roles = new Map<string, "user" | "assistant">();
      const partsByMessage = new Map<string, Map<string, { id: string; text: string }>>();
      let assistantBuffer = "";
      let resolved = false;
      let reconnectAttempts = 0;
      let settleTimer: number | null = null;
      let partSeq = 0;

      const finish = (resolveCb: (v: string) => void, rejectCb: (e: unknown) => void) => {
        if (resolved) return;
        resolved = true;
        eventPipeline.stop();
        controller.abort();
        signal?.removeEventListener("abort", forwardAbort);
        if (settleTimer !== null) {
          clearTimeout(settleTimer);
          settleTimer = null;
        }
        resolveCb(assistantBuffer);
      };

      const fail = (rejectCb: (e: unknown) => void, err: unknown) => {
        if (resolved) return;
        resolved = true;
        eventPipeline.stop();
        controller.abort();
        signal?.removeEventListener("abort", forwardAbort);
        if (settleTimer !== null) {
          clearTimeout(settleTimer);
          settleTimer = null;
        }
        rejectCb(err);
      };

      const recomputeText = (messageID: string): string => {
        const parts = partsByMessage.get(messageID);
        if (!parts) return "";
        let out = "";
        for (const p of parts.values()) out += p.text;
        return out;
      };

      // Wait out the idle signal briefly so straggler text parts (which can arrive after
      // idle, cf. opencode issue #26924 for part ordering) land in the final message.
      const settle = () => {
        if (settleTimer !== null) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => finish(resolve, reject), 300);
      };

      function handleEvent(raw: string) {
        try {
          const event: OpenCodeSSEEvent = JSON.parse(raw);
          const eventSession = event.properties?.sessionID;
          if (eventSession && eventSession !== sid) return;

          if (event.type === "session.status" && event.properties?.status?.type === "idle") {
            settle();
            return;
          }
          if (event.type === "session.idle") {
            settle();
            return;
          }
          if (event.type === "session.error" && event.properties?.error) {
            const detail =
              typeof event.properties.error === "string"
                ? event.properties.error
                : JSON.stringify(event.properties.error);
            fail(reject, new OpenCodeError(null, "session", `OpenCode session error: ${truncate(detail)}`));
            return;
          }

          if (event.type === "message.updated" && event.properties?.info) {
            const info = event.properties.info;
            roles.set(info.id, info.role);
            if (info.role === "assistant" && !partsByMessage.has(info.id)) {
              partsByMessage.set(info.id, new Map());
            }
            return;
          }

          if (event.type === "message.part.updated" && event.properties?.part) {
            const part = event.properties.part;
            const messageID = part.messageID;
            if (!messageID) return;
            // Only stream parts whose owning message is confirmed as the assistant's
            // (message.updated precedes its parts on the server, so the user's echoed
            // message is excluded even when a part arrives out of order).
            const role = roles.get(messageID);
            if (role !== "assistant") return;

            let parts = partsByMessage.get(messageID);
            if (!parts) {
              parts = new Map();
              partsByMessage.set(messageID, parts);
            }

            if (typeof part.text === "string") {
              const key = part.id ?? "";
              const existing = parts.get(key);
              if (existing) existing.text = part.text;
              else parts.set(key, { id: key, text: part.text });
              assistantBuffer = recomputeText(messageID);
              options.onChunk(assistantBuffer);
            }

            if (options.onPart) {
              const state = normalizePartState(part.state?.status);
              if (part.type === "text" && typeof part.text === "string") {
                // Text part ids mirror the accumulation map (part.id ?? "") exactly so
                // onPart-derived content matches the onChunk assistantBuffer.
                options.onPart({ kind: "text", id: part.id ?? "", text: part.text });
              } else if (part.type === "reasoning" && typeof part.text === "string") {
                const partId = part.id ?? `part-${partSeq++}`;
                options.onPart({ kind: "reasoning", id: partId, text: part.text, state });
              } else if (part.type === "tool" && part.tool) {
                options.onPart({
                  kind: "tool",
                  id: part.callID || part.id || `part-${partSeq++}`,
                  name: part.tool,
                  state,
                  args: part.state?.input,
                  output: part.state?.output,
                  title: part.state?.title,
                });
              } else if (part.type === "file") {
                const path = (part as OpenCodePart & { path?: string }).path;
                if (path) options.onPart({ kind: "file", id: part.id ?? `part-${partSeq++}`, path });
              }
            }

            if (part.type === "tool" && part.tool) {
              const status = part.state?.status ?? "pending";
              options.onToolCall?.(part.tool, status);
              if (status === "completed" && isFileEditTool(part.tool)) {
                options.onFileEdit?.();
              }
            }
            return;
          }
        } catch {
          // ignore malformed SSE frames
        }
      }

      const eventPipeline = new EventPipeline(handleEvent, 100);

      const pump = async () => {
        try {
          const res = await fetch(`${baseUrl}/event`, {
            headers,
            signal: controller.signal,
          });
          if (!res.ok || !res.body) {
            const status = res?.status ?? 0;
            throw new OpenCodeError(status, "network", `SSE connect failed: ${status}`);
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (line.startsWith("data:")) eventPipeline.push(line.slice(5).trim());
            }
            if (resolved) return;
          }
        } catch (err) {
          if (resolved || controller.signal.aborted) return;
          reconnectAttempts++;
          if (reconnectAttempts <= maxReconnects) {
            await sleep(2000);
            if (!resolved) void pump();
          } else {
            fail(reject, new OpenCodeError(null, "network", `Lost connection to the OpenCode server: ${String(err)}`));
          }
        }
      };

      const run = async () => {
        try {
          options.onStatusChange?.("OpenCode agent working...");
          logDebug(
            options.debug,
            `POST /session/${sid}/message model=${model ? `${model.providerID}/${model.modelID}` : "default"} text_len=${text.length}`
          );
          void pump();
          const res = await fetch(`${baseUrl}/session/${sid}/message`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              parts: [{ type: "text", text }],
              ...(model ? { model } : {}),
            }),
            signal: controller.signal,
          });
          if (!res.ok) {
            const status = res.status ?? 0;
            const bodyText = await safeBodyText(res);
            const { category, message } = classifyOpenCodeHttpError(status, bodyText);
            logDebug(
              options.debug,
              `POST /session/${sid}/message -> HTTP ${status} (${category}) body="${bodyText.slice(0, 400)}"`
            );
            fail(reject, new OpenCodeError(status, category, message, bodyText));
            return;
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError" && signal?.aborted) {
            fail(reject, err);
            return;
          }
          if (!resolved) fail(reject, err);
        }
      };
      void run();
    });

  // One-shot retry on a fresh session when the message endpoint 5xxs
  // (OPENCODE_HTTP500_DIAGNOSIS_PLAN.md, workstream D): repeat 500s are frequently a
  // poisoned/stale session or a transient provider hiccup that a clean session clears.
  const maxRetries = options.retry5xx === false ? 0 : 1;
  const tryMessage = async (): Promise<string> => {
    let sid = options.sessionId;
    for (let attempt = 0; ; attempt++) {
      try {
        return await attemptSession(sid);
      } catch (err) {
        const retryable =
          attempt < maxRetries &&
          err instanceof OpenCodeError &&
          err.status !== null &&
          err.status >= 500 &&
          !signal?.aborted;
        if (!retryable) throw err;
        logDebug(
          options.debug,
          `POST /session/${sid}/message -> HTTP ${err.status}; retrying once on a fresh session`
        );
        options.onStatusChange?.("OpenCode agent retrying on a fresh session...");
        sid = await createOpencodeSession({
          port,
          password,
          workspaceDir: options.workspaceDir,
        });
        options.onSessionRecycled?.(sid);
      }
    }
  };

  return await tryMessage();
}

/** Triggers a vault re-index after the agent edits files in the workspace. */
export async function reindexOpencodeVault(vaultRoot: string): Promise<void> {
  try {
    await invoke("reindex_vault", { vaultRoot });
  } catch {
    // index rebuild is best-effort
  }
}