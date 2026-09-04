import { Settings } from "../stores/useStore";
import { WORKSPACE_TOOLS, executeWorkspaceTool } from "./workspaceTools";

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
    payload.tools = WORKSPACE_TOOLS;
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
