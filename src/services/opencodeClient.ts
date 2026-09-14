import { invoke } from "@tauri-apps/api/core";

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

const FILE_EDIT_TOOLS = ["write", "edit", "patch", "delete"];

function isFileEditTool(tool: string): boolean {
  return FILE_EDIT_TOOLS.some((t) => tool.toLowerCase().includes(t));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
  signal?: AbortSignal;
  onChunk: (text: string) => void;
  onStatusChange?: (status: string) => void;
  onToolCall?: (tool: string, status: string) => void;
  onFileEdit?: () => void;
}): Promise<string> {
  const { sessionId, port, password, text, signal } = options;
  const baseUrl = opencodeBaseUrl(port);
  const headers = opencodeAuthHeaders(password);
  const maxReconnects = 3;

  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });

  const roles = new Map<string, "user" | "assistant">();
  const partsByMessage = new Map<string, Map<string, { id: string; text: string }>>();
  let assistantBuffer = "";
  let resolved = false;
  let reconnectAttempts = 0;
  let settleTimer: number | null = null;

  const finish = (resolve: (v: string) => void, reject: (e: unknown) => void) => {
    if (resolved) return;
    resolved = true;
    controller.abort();
    signal?.removeEventListener("abort", forwardAbort);
    if (settleTimer !== null) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
    resolve(assistantBuffer);
  };

  const fail = (reject: (e: unknown) => void, err: unknown) => {
    if (resolved) return;
    resolved = true;
    controller.abort();
    signal?.removeEventListener("abort", forwardAbort);
    if (settleTimer !== null) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
    reject(err);
  };

  const recomputeText = (messageID: string): string => {
    const parts = partsByMessage.get(messageID);
    if (!parts) return "";
    let out = "";
    for (const p of parts.values()) out += p.text;
    return out;
  };

  return await new Promise<string>((resolve, reject) => {
    // Wait out the idle signal briefly so straggler text parts (which can arrive after
    // idle, cf. opencode issue #26924 for part ordering) land in the final message.
    const settle = () => {
      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => finish(resolve, reject), 300);
    };

    const handleEvent = (raw: string) => {
      try {
        const event: OpenCodeSSEEvent = JSON.parse(raw);
        const eventSession = event.properties?.sessionID;
        if (eventSession && eventSession !== sessionId) return;

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
          fail(reject, new Error(`OpenCode session error: ${detail}`));
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
    };

    const pump = async () => {
      try {
        const res = await fetch(`${baseUrl}/event`, {
          headers,
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE connect failed: ${res.status}`);
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
            if (line.startsWith("data:")) handleEvent(line.slice(5).trim());
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
          fail(reject, new Error(`Lost connection to the OpenCode server: ${String(err)}`));
        }
      }
    };

    const run = async () => {
      try {
        options.onStatusChange?.("OpenCode agent working...");
        void pump();
        const res = await fetch(`${baseUrl}/session/${sessionId}/message`, {
          method: "POST",
          headers,
          body: JSON.stringify({ parts: [{ type: "text", text }] }),
          signal: controller.signal,
        });
        if (!res.ok) {
          fail(reject, new Error(`OpenCode rejected the message (HTTP ${res.status})`));
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
}

/** Triggers a vault re-index after the agent edits files in the workspace. */
export async function reindexOpencodeVault(vaultRoot: string): Promise<void> {
  try {
    await invoke("reindex_vault", { vaultRoot });
  } catch {
    // index rebuild is best-effort
  }
}