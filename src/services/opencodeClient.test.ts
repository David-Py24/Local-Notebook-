import { describe, it, expect, vi, afterEach } from "vitest";
import {
  streamOpencodeReply,
  classifyOpenCodeHttpError,
  opencodeFallbackMessage,
  OpenCodeError,
  verifyOpencodeModelCapability,
  routeModelPreCheck,
  createOpencodeSession,
  rehydrateOpencodeSession,
} from "./opencodeClient";

// Scripted SSE frames mimicking a live `opencode serve` stream: an assistant message
// with a text part (updated), a reasoning part (running → completed) and a tool part
// (running → completed), then session idle.
function frames() {
  return [
    { type: "message.updated", properties: { sessionID: "s", info: { id: "msg-1", role: "assistant" } } },
    { type: "message.part.updated", properties: { sessionID: "s", part: { id: "p1", messageID: "msg-1", type: "text", text: "Hello" } } },
    { type: "message.part.updated", properties: { sessionID: "s", part: { id: "p1", messageID: "msg-1", type: "text", text: "Hello world" } } },
    { type: "message.part.updated", properties: { sessionID: "s", part: { id: "r1", messageID: "msg-1", type: "reasoning", text: "Let me think", state: { status: "running" } } } },
    { type: "message.part.updated", properties: { sessionID: "s", part: { id: "r1", messageID: "msg-1", type: "reasoning", text: "Let me think", state: { status: "completed" } } } },
    { type: "message.part.updated", properties: { sessionID: "s", part: { id: "t1", messageID: "msg-1", callID: "call-1", type: "tool", tool: "read_file", state: { status: "running", input: { path: "a.md" } } } } },
    { type: "message.part.updated", properties: { sessionID: "s", part: { id: "t1", messageID: "msg-1", callID: "call-1", type: "tool", tool: "read_file", state: { status: "completed", input: { path: "a.md" }, output: "# note content" } } } },
    { type: "message.part.updated", properties: { sessionID: "s", part: { id: "f1", messageID: "msg-1", type: "file", path: "notes/a.md" } } },
    { type: "session.status", properties: { sessionID: "s", status: { type: "idle" } } },
  ];
}

function sseStream(data: object[]) {
  const encoder = new TextEncoder();
  const chunks = data.map((f) => encoder.encode(`data: ${JSON.stringify(f)}\n\n`));
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
      } else {
        controller.close();
      }
    },
  });
}

describe("streamOpencodeReply — OpenChamber part mapping (CHAT_UI_REDESIGN_PLAN.md)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps SSE text/reasoning/tool/file parts into normalized ChatParts and keeps onChunk working", async () => {
    const parts: any[] = [];
    const chunks: string[] = [];
    let fileEdit = false;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/event")) {
          return { ok: true, body: sseStream(frames()) };
        }
        return { ok: true, body: null };
      })
    );

    const resolved = await streamOpencodeReply({
      sessionId: "s",
      port: 4096,
      password: "pw",
      text: "hi",
      onChunk: (t) => chunks.push(t),
      onPart: (p) => parts.push(p),
      onFileEdit: () => {
        fileEdit = true;
      },
    });

    // onChunk still accumulates text parts (reasoning text folds into the legacy buffer).
    expect(chunks[chunks.length - 1]).toBe("Hello worldLet me think");
    expect(resolved).toContain("Hello world");
    expect(resolved).toContain("Let me think");

    // Text part upserts by id and carries final text.
    const textParts = parts.filter((p) => p.kind === "text");
    expect(textParts).toHaveLength(2);
    expect(textParts[0]).toMatchObject({ kind: "text", id: "p1", text: "Hello" });
    expect(textParts[1]).toMatchObject({ kind: "text", id: "p1", text: "Hello world" });

    // Reasoning part transitions running → completed with text.
    const reasoningParts = parts.filter((p) => p.kind === "reasoning");
    expect(reasoningParts).toHaveLength(2);
    expect(reasoningParts[0]).toMatchObject({ kind: "reasoning", id: "r1", text: "Let me think", state: "running" });
    expect(reasoningParts[1]).toMatchObject({ kind: "reasoning", id: "r1", text: "Let me think", state: "completed" });

    // Tool part carries name, callID-derived id, args and output.
    const toolParts = parts.filter((p) => p.kind === "tool");
    expect(toolParts).toHaveLength(2);
    expect(toolParts[0]).toMatchObject({
      kind: "tool",
      id: "call-1",
      name: "read_file",
      state: "running",
      args: { path: "a.md" },
    });
    expect(toolParts[1]).toMatchObject({
      kind: "tool",
      id: "call-1",
      name: "read_file",
      state: "completed",
      output: "# note content",
    });

    // File part surfaces the touched path.
    expect(parts.some((p) => p.kind === "file" && p.path === "notes/a.md")).toBe(true);

    // onFileEdit fired because read_file finished (mapped as completed non-edit tool):
    // read_file should NOT trigger reindex — only write/edit/patch/delete do.
    expect(fileEdit).toBe(false);
  });

  it("fires onFileEdit for completed file-write tools", async () => {
    const writeFrames = [
      { type: "message.updated", properties: { sessionID: "s", info: { id: "msg-1", role: "assistant" } } },
      { type: "message.part.updated", properties: { sessionID: "s", part: { id: "t1", messageID: "msg-1", callID: "c1", type: "tool", tool: "write_file", state: { status: "completed", input: { path: "a.md" } } } } },
      { type: "session.status", properties: { sessionID: "s", status: { type: "idle" } } },
    ];
    let fileEdit = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/event")) return { ok: true, body: sseStream(writeFrames) };
        return { ok: true, body: null };
      })
    );

    await streamOpencodeReply({
      sessionId: "s",
      port: 4096,
      password: "pw",
      text: "go",
      onChunk: () => {},
      onFileEdit: () => {
        fileEdit = true;
      },
    });

    expect(fileEdit).toBe(true);
  });
});

describe("classifyOpenCodeHttpError — surfaces the real failure reason", () => {
  it("classifies a bare 500 as a provider/model problem", () => {
    const r = classifyOpenCodeHttpError(500, "");
    expect(r.category).toBe("provider");
    expect(r.message).toContain("HTTP 500");
  });

  it("carries the server body verbatim (truncated) for 5xx", () => {
    const body = `{"error":{"message":"provider connection failed: unauthorized"}}`;
    const r = classifyOpenCodeHttpError(500, body);
    expect(r.category).toBe("provider");
    expect(r.message).toContain("unauthorized");
  });

  it("403 → provider (free tier / token limits)", () => {
    const r = classifyOpenCodeHttpError(403, "Not allowed to make this request");
    expect(r.category).toBe("provider");
  });

  it("401 and 404 → session identity problems, actionable restart hint", () => {
    expect(classifyOpenCodeHttpError(401, "").category).toBe("session");
    expect(classifyOpenCodeHttpError(404, "").category).toBe("session");
  });

  it("an unexpected 4xx without provider hints stays 'http'", () => {
    const r = classifyOpenCodeHttpError(400, "bad request");
    expect(r.category).toBe("http");
    expect(r.message).toContain("bad request");
  });
});

describe("opencodeFallbackMessage — never blames the install when the CLI exists", () => {
  it("keeps the install hint only when the CLI is actually missing", () => {
    const msg = opencodeFallbackMessage(new Error("boom"), { installed: false });
    // Platform-specific hint; jsdom's userAgent isn't Windows, so assert the intent.
    expect(msg).toContain("not installed");
    expect(msg).toContain("Install it with");
  });

  it("drops the install hint and directs to AI & BYOK settings for provider failures", () => {
    const err = new OpenCodeError(500, "provider", "OpenCode rejected the message (HTTP 500): provider connection failed");
    const msg = opencodeFallbackMessage(err, { installed: true });
    expect(msg).not.toContain("winget");
    expect(msg).not.toContain("not installed");
    expect(msg).toContain("provider/model problem");
    expect(msg).toContain("AI & BYOK Model");
  });

  it("directs network/session failures to Restart server", () => {
    const net = opencodeFallbackMessage(new OpenCodeError(null, "network", "Lost connection to the OpenCode server: x"), {
      installed: true,
    });
    expect(net).toContain("Restart server");

    const sess = opencodeFallbackMessage(new OpenCodeError(404, "session", "OpenCode session not found (HTTP 404)."), {
      installed: true,
    });
    expect(sess).toContain("Restart server");
  });
});

describe("streamOpencodeReply — HTTP error body capture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects with an OpenCodeError embedding the 500 response body", async () => {
    const messageBody = '{"error":{"message":"provider connection failed: invalid model hermes3:8b"}}';
    let postAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/event")) {
          return { ok: true, body: sseStream([{ type: "session.status", properties: { sessionID: "s", status: { type: "idle" } } }]) };
        }
        postAttempts++;
        return {
          ok: false,
          status: 500,
          headers: { get: () => "application/json" },
          json: async () => JSON.parse(messageBody),
          text: async () => messageBody,
        };
      })
    );

    await expect(
      streamOpencodeReply({ sessionId: "s", port: 4096, password: "pw", text: "hi", onChunk: () => {}, retry5xx: false })
    ).rejects.toMatchObject({
      name: "OpenCodeError",
      status: 500,
      category: "provider",
      body: messageBody,
    });
    expect(postAttempts).toBe(1);
  });

  it("rejects immediately (no retry) on non-5xx status", async () => {
    let postAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/event")) return { ok: true, body: sseStream([]) };
        postAttempts++;
        return {
          ok: false,
          status: 400,
          headers: { get: () => "" },
          text: async () => "bad request",
        };
      })
    );

    await expect(
      streamOpencodeReply({ sessionId: "s", port: 4096, password: "pw", text: "hi", onChunk: () => {} })
    ).rejects.toMatchObject({ name: "OpenCodeError", status: 400, category: "http" });
    expect(postAttempts).toBe(1);
  });

  it("retries a 5xx once on a fresh session and reports the recycled session id", async () => {
    let eventCalls = 0;
    let sessionCreates = 0;
    const recycled: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init && init.method) || "GET";
        if (url.endsWith("/event")) {
          eventCalls++;
          const secondAttempt = eventCalls >= 2;
          const sid = secondAttempt ? "s2" : "s";
          const frames = secondAttempt
            ? [{ type: "session.status", properties: { sessionID: sid, status: { type: "idle" } } }]
            : [];
          return { ok: true, body: sseStream(frames) };
        }
        if (method === "POST" && url.endsWith("/session")) {
          sessionCreates++;
          return { ok: true, body: null, json: async () => ({ id: "s2" }) };
        }
        if (method === "POST" && url.includes("/message")) {
          if (url.includes("/s/message")) {
            return {
              ok: false,
              status: 500,
              headers: { get: () => "text/plain" },
              text: async () => "provider connection failed",
            };
          }
          return { ok: true, body: null };
        }
        return { ok: true, body: null };
      })
    );

    const result = await streamOpencodeReply({
      sessionId: "s",
      port: 4096,
      password: "pw",
      text: "hi",
      workspaceDir: "/vault",
      onChunk: () => {},
      onSessionRecycled: (sid) => recycled.push(sid),
    });

    expect(sessionCreates).toBe(1);
    expect(recycled).toEqual(["s2"]);
    expect(result).toBe("");
  });
});

describe("verifyOpencodeModelCapability — OpenChamber gateway pre-validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function providersResponse(arrayOfModels: boolean, providerID = "google") {
    return [
      {
        id: providerID,
        models: arrayOfModels
          ? [{ id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" }, { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }]
          : { "gemini-2.0-flash": {}, "gemini-2.5-pro": {} },
      },
      { id: "ollama", models: [{ id: "hermes3:8b" }] },
    ];
  }

  it("hard-misses when the model is absent from an array-of-objects models list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => providersResponse(true) }))
    );
    const res = await verifyOpencodeModelCapability({ port: 4096, password: "pw", providerID: "google", modelID: "nonexistent-model" });
    expect(res).toEqual({ known: true, ok: false });
  });

  it("passes when the model is present in an array-of-objects models list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => providersResponse(true) }))
    );
    const res = await verifyOpencodeModelCapability({ port: 4096, password: "pw", providerID: "google", modelID: "gemini-2.5-pro" });
    expect(res).toEqual({ known: true, ok: true });
  });

  it("handles a dict-shaped models registry too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => providersResponse(false) }))
    );
    const hit = await verifyOpencodeModelCapability({ port: 4096, password: null, providerID: "google", modelID: "gemini-2.0-flash" });
    const miss = await verifyOpencodeModelCapability({ port: 4096, password: null, providerID: "google", modelID: "nope" });
    expect(hit).toEqual({ known: true, ok: true });
    expect(miss).toEqual({ known: true, ok: false });
  });

  it("reports unknown (never blocks) when the provider is absent from the list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => providersResponse(true) }))
    );
    const res = await verifyOpencodeModelCapability({ port: 4096, password: "pw", providerID: "unknown-provider", modelID: "x" });
    expect(res).toEqual({ known: false, ok: true });
  });

  it("reports unknown on a non-OK response and on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    const httpErr = await verifyOpencodeModelCapability({ port: 4096, password: "pw", providerID: "google", modelID: "x" });
    expect(httpErr).toEqual({ known: false, ok: true });

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const netErr = await verifyOpencodeModelCapability({ port: 4096, password: "pw", providerID: "google", modelID: "x" });
    expect(netErr).toEqual({ known: false, ok: true });
  });

  it("unwraps the { providers: [...] } envelope returned live on opencode 1.18.30", async () => {
    const envelope = {
      providers: [
        { id: "google", models: { "gemini-2.0-flash": {}, "gemini-2.5-pro": {} } },
        { id: "ollama", models: [{ id: "hermes3:8b" }] },
      ],
      default: { providerID: "google", modelID: "gemini-2.0-flash" },
      connected: ["google"],
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => envelope })));
    const hit = await verifyOpencodeModelCapability({ port: 4096, password: "pw", providerID: "google", modelID: "gemini-2.0-flash" });
    const miss = await verifyOpencodeModelCapability({ port: 4096, password: "pw", providerID: "google", modelID: "not-a-real-model" });
    expect(hit).toEqual({ known: true, ok: true });
    expect(miss).toEqual({ known: true, ok: false });
  });

  it("reports unknown when the response is not a provider array under either shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ up: true }) })));
    const res = await verifyOpencodeModelCapability({ port: 4096, password: "pw", providerID: "google", modelID: "x" });
    expect(res).toEqual({ known: false, ok: true });
  });
});

describe("createOpencodeSession — empty body first (verified on 1.18.30, body fields → BadRequest)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a session with an empty body and no workspaceDir when none is given", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        expect(url).toContain("/session");
        bodies.push(String(init?.body ?? ""));
        return { ok: true, json: async () => ({ id: "s-empty" }) };
      })
    );
    const id = await createOpencodeSession({ port: 4096, password: "pw" });
    expect(id).toBe("s-empty");
    expect(bodies).toEqual([JSON.stringify({})]);
  });

  it("falls back to the workspaceDir body for older serve builds that reject an empty body", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ""));
        const first = bodies.length === 1;
        return first
          ? { ok: false, status: 400 }
          : { ok: true, json: async () => ({ id: "s-legacy" }) };
      })
    );
    const id = await createOpencodeSession({ port: 4096, password: "pw", workspaceDir: "C:\\vault" });
    expect(id).toBe("s-legacy");
    expect(bodies).toEqual([JSON.stringify({}), JSON.stringify({ workspaceDir: "C:\\vault" })]);
  });
});

describe("rehydrateOpencodeSession — GET /session/:id/message transcript restore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps message parts to { id, role, text } transcript entries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: "m1", role: "user", parts: [{ type: "text", text: "Explain entropy" }] },
          { id: "m2", role: "assistant", parts: [{ type: "reasoning", text: "First, define the system." }, { type: "text", text: "Entropy is S = k ln W." }] },
        ],
      }))
    );
    const history = await rehydrateOpencodeSession({ port: 4096, password: "pw", sessionId: "sess-1" });
    expect(history).toEqual([
      { id: "m1", role: "user", text: "Explain entropy" },
      { id: "m2", role: "assistant", text: "First, define the system.Entropy is S = k ln W." },
    ]);
  });

  it("returns an empty transcript on non-OK responses and network failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    expect(await rehydrateOpencodeSession({ port: 4096, password: "pw", sessionId: "s1" })).toEqual([]);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    expect(await rehydrateOpencodeSession({ port: 4096, password: "pw", sessionId: "s1" })).toEqual([]);
  });
});

describe("routeModelPreCheck — routing decision after a pre-check", () => {
  it("routes a hard miss to BYOK when fallback is enabled", () => {
    expect(routeModelPreCheck({ known: true, ok: false }, true)).toBe("byok");
  });

  it("routes a hard miss to error when fallback is disabled", () => {
    expect(routeModelPreCheck({ known: true, ok: false }, false)).toBe("error");
  });

  it("always streams on confirmed-ok and on unknown checks", () => {
    expect(routeModelPreCheck({ known: true, ok: true }, false)).toBe("stream");
    expect(routeModelPreCheck({ known: false, ok: true }, false)).toBe("stream");
    expect(routeModelPreCheck({ known: false, ok: true }, true)).toBe("stream");
  });
});