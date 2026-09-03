import { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "../stores/useStore";
import ReactMarkdown from "react-markdown";
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types matching OpenCode's HTTP API response shapes.
//
// Verified against a live `opencode serve` instance (v1.18.16) rather than
// assumed from docs — the actual wire shapes differ from the OpenAPI-adjacent
// names one might guess:
//   - the event type is "message.part.updated", not "part.updated"
//   - a message's metadata arrives as `properties.info`, not `properties.message`
//   - tool calls are `{ type: "tool", tool: <name>, callID, state: {...} }`,
//     not a `toolInvocation` field
//   - a message never carries its own `parts` array; parts stream in
//     separately, correlated back to a message via `part.messageID`
// ---------------------------------------------------------------------------

interface OpenCodeToolState {
  status: "pending" | "running" | "completed" | "error";
  input?: Record<string, unknown>;
  output?: string;
  title?: string;
  error?: string;
}

interface OpenCodePart {
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

interface OpenCodeMessage {
  id: string;
  role: "user" | "assistant";
  parts: OpenCodePart[];
}

interface OpenCodeSSEEvent {
  type: string;
  properties?: {
    sessionID?: string;
    info?: OpenCodeMessageInfo;
    part?: OpenCodePart;
    status?: { type: string };
  };
}

// Platform-specific install commands (spec: no npm install -g, use winget/curl)
const INSTALL_INSTRUCTIONS = {
  windows: "winget install OpenCode.OpenCode",
  other: "curl -fsSL https://opencode.ai/install | bash",
};

function getPlatformInstallCmd(): string {
  if (navigator.userAgent.toLowerCase().includes("windows")) {
    return INSTALL_INSTRUCTIONS.windows;
  }
  return INSTALL_INSTRUCTIONS.other;
}

export default function OpenCodeView() {
  const settings = useStore((s) => s.settings);
  const opencodeInstalled = useStore((s) => s.opencodeInstalled);
  const opencodeServerPid = useStore((s) => s.opencodeServerPid);
  const opencodeServerPassword = useStore((s) => s.opencodeServerPassword);
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const checkOpencodeInstalled = useStore((s) => s.checkOpencodeInstalled);
  const startOpencodeServer = useStore((s) => s.startOpencodeServer);
  const stopOpencodeServer = useStore((s) => s.stopOpencodeServer);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<OpenCodeMessage[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [serverStatus, setServerStatus] = useState<"starting" | "ready" | "error">("starting");
  const [toolActivity, setToolActivity] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  // messageID -> role, populated from every message.updated event (including the
  // user's own echoed message) so message.part.updated events know whose part it
  // is. We already show the user's own message optimistically in handleSend, so
  // parts belonging to a "user" role message are tracked here but never rendered.
  const messageRolesRef = useRef<Map<string, "user" | "assistant">>(new Map());

  const baseUrl = `http://localhost:${settings.opencodePort}`;

  const authHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opencodeServerPassword) {
      headers["Authorization"] = `Basic ${btoa(`opencode:${opencodeServerPassword}`)}`;
    }
    return headers;
  }, [opencodeServerPassword]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolActivity]);

  useEffect(() => {
    checkOpencodeInstalled();
  }, [checkOpencodeInstalled]);

  useEffect(() => {
    if (opencodeInstalled && settings.opencodeAutoStart && opencodeServerPid === null) {
      startOpencodeServer();
    }
    return () => {
      if (opencodeServerPid !== null) {
        stopOpencodeServer();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opencodeInstalled]);

  useEffect(() => {
    if (opencodeServerPid === null) {
      setServerStatus("starting");
      return;
    }
    let retries = 0;
    const maxRetries = 20;
    const tryConnect = async () => {
      try {
        const res = await fetch(`${baseUrl}/session`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ workspaceDir: currentFolderPath || "." }),
        });
        if (res.ok) {
          const data = await res.json();
          setSessionId(data.id ?? data.sessionID ?? null);
          setServerStatus("ready");
          return true;
        }
      } catch { /* server not ready yet */ }
      return false;
    };
    const poll = setInterval(async () => {
      const connected = await tryConnect();
      if (connected) {
        clearInterval(poll);
      } else {
        retries++;
        if (retries >= maxRetries) { clearInterval(poll); setServerStatus("error"); }
      }
    }, 500);
    return () => clearInterval(poll);
  }, [opencodeServerPid, authHeaders, baseUrl, currentFolderPath]);

  // OpenCode's /event stream requires HTTP Basic Auth (confirmed against a live
  // `opencode serve` instance: a `?password=` query param gets a 401). The native
  // browser EventSource API cannot send an Authorization header, so we read the
  // SSE stream manually via fetch + a ReadableStream reader instead.
  useEffect(() => {
    if (!sessionId || serverStatus !== "ready") return;
    let cancelled = false;

    const handleEvent = (raw: string) => {
      try {
        const event: OpenCodeSSEEvent = JSON.parse(raw);

        if (event.type === "message.updated" && event.properties?.info) {
          const info = event.properties.info;
          messageRolesRef.current.set(info.id, info.role);
          if (info.role === "assistant") {
            setMessages((prev) =>
              prev.some((m) => m.id === info.id) ? prev : [...prev, { id: info.id, role: "assistant", parts: [] }]
            );
          }
          return;
        }

        if (event.type === "message.part.updated" && event.properties?.part?.messageID) {
          const part = event.properties.part;
          const messageID = part.messageID as string;
          const role = messageRolesRef.current.get(messageID);
          if (role === "user") return; // already shown optimistically in handleSend

          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === messageID);
            if (idx < 0) {
              return [...prev, { id: messageID, role: "assistant", parts: [part] }];
            }
            const msg = prev[idx];
            const partIdx = msg.parts.findIndex((p) => p.id === part.id);
            const parts = partIdx >= 0
              ? msg.parts.map((p, i) => (i === partIdx ? part : p))
              : [...msg.parts, part];
            const next = [...prev];
            next[idx] = { ...msg, parts };
            return next;
          });

          if (part.type === "tool" && part.tool) {
            const status = part.state?.status ?? "pending";
            const summary = `🔧 ${part.tool} · ${status}`;
            setToolActivity((prev) => [...prev.slice(-19), summary]);
            const fileEditTools = ["write", "edit", "patch", "delete"];
            if (
              currentFolderPath &&
              status === "completed" &&
              fileEditTools.some((t) => part.tool!.toLowerCase().includes(t))
            ) {
              invoke("reindex_vault", { vaultRoot: currentFolderPath }).catch(() => {});
            }
          }
        }
      } catch { /* ignore malformed SSE frames */ }
    };

    const connect = async () => {
      const controller = new AbortController();
      sseAbortRef.current = controller;
      try {
        const res = await fetch(`${baseUrl}/event`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE connect failed: ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data:")) handleEvent(line.slice(5).trim());
          }
        }
      } catch (err) {
        if (!cancelled) console.warn("[OpenCode SSE] Connection lost:", err);
      }
      if (!cancelled) setTimeout(connect, 2000);
    };
    connect();

    return () => {
      cancelled = true;
      sseAbortRef.current?.abort();
      sseAbortRef.current = null;
    };
  }, [sessionId, serverStatus, baseUrl, authHeaders, currentFolderPath]);

  const handleSend = async () => {
    if (!inputVal.trim() || !sessionId || isSending) return;
    const text = inputVal.trim();
    setInputVal("");
    setIsSending(true);
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", parts: [{ type: "text", text }] }]);
    try {
      await fetch(`${baseUrl}/session/${sessionId}/message`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ parts: [{ type: "text", text }] }),
      });
    } catch (err) {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", parts: [{ type: "text", text: `⚠️ Failed to send message: ${String(err)}` }] }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const renderParts = (parts: OpenCodePart[]) =>
    parts.map((p, i) => {
      if (p.type === "text" && p.text) {
        return (
          <div key={i} className="w-full text-xs text-text/90 leading-relaxed markdown-preview">
            <ReactMarkdown>{p.text}</ReactMarkdown>
          </div>
        );
      }
      if (p.type === "tool" && p.tool) {
        const status = p.state?.status ?? "pending";
        const arrow = status === "completed" ? "←" : status === "error" ? "⚠" : "→";
        return (
          <div key={i} className="my-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] font-mono text-amber-300">
            <span className="text-amber-400 font-semibold">{arrow} {p.tool}</span>
            <span className="ml-1.5 text-amber-200/70">
              {status === "error" ? p.state?.error : status === "completed" ? p.state?.output?.slice(0, 120) : JSON.stringify(p.state?.input ?? {}).slice(0, 120)}
            </span>
          </div>
        );
      }
      return null;
    });

  if (!opencodeInstalled) {
    const installCmd = getPlatformInstallCmd();
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-4">
        <div className="h-12 w-12 rounded-full border border-amber-500/40 bg-amber-500/10 flex items-center justify-center">
          <span className="text-2xl">🤖</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-text">OpenCode Not Found</p>
          <p className="text-[11px] text-muted mt-1 max-w-[260px]">
            Install OpenCode to enable the agentic coding mode. It supports all your existing BYOK API keys.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <div className="rounded border border-border bg-bg/60 px-3 py-2 font-mono text-[11px] text-accent text-left select-all">{installCmd}</div>
          <button onClick={() => navigator.clipboard.writeText(installCmd)} className="mt-1.5 w-full rounded border border-border/60 bg-bg/40 px-2 py-1 text-[10px] text-muted hover:text-white cursor-pointer transition-colors">Copy install command</button>
        </div>
        <button onClick={() => checkOpencodeInstalled()} className="rounded border border-border bg-card px-3 py-1.5 text-xs text-text hover:text-white cursor-pointer transition-colors">↻ Recheck Installation</button>
        <p className="text-[10px] text-muted">After installing, click "Recheck" or reopen the OpenCode Agent tab.</p>
      </div>
    );
  }

  if (opencodeServerPid === null || serverStatus === "starting") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
        <div className="h-10 w-10 rounded-full border border-accent/40 bg-accent/10 flex items-center justify-center">
          <span className="text-lg animate-spin">⚙️</span>
        </div>
        <p className="text-xs font-semibold text-text">Starting OpenCode Server...</p>
        <p className="text-[11px] text-muted">Launching opencode serve on port {settings.opencodePort}</p>
        {opencodeServerPid === null && (
          <button onClick={() => startOpencodeServer()} className="mt-2 rounded border border-border bg-card px-3 py-1.5 text-xs text-text hover:text-white cursor-pointer transition-colors">▶ Start Server Manually</button>
        )}
      </div>
    );
  }

  if (serverStatus === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
        <p className="text-xs font-semibold text-red-400">⚠️ Could not connect to OpenCode server</p>
        <p className="text-[11px] text-muted max-w-[240px]">The server started (PID: {opencodeServerPid}) but did not respond on port {settings.opencodePort}. Check that no other process is using that port.</p>
        <button onClick={async () => { await stopOpencodeServer(); await startOpencodeServer(); }} className="rounded border border-border bg-card px-3 py-1.5 text-xs text-text hover:text-white cursor-pointer transition-colors">↻ Restart Server</button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/30 px-3.5 py-1.5 text-[10px] text-muted bg-bg/30">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm" />
        <span>OpenCode Agent</span>
        <span className="text-border">·</span>
        <span>port {settings.opencodePort}</span>
        <span className="text-border">·</span>
        <span className="font-mono truncate max-w-[140px]">{currentFolderPath?.split(/[/\\]/).pop() ?? "no workspace"}</span>
        <button onClick={() => stopOpencodeServer()} className="ml-auto text-muted hover:text-red-400 cursor-pointer transition-colors" title="Stop OpenCode server">■ Stop</button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
        {messages.length === 0 && toolActivity.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 text-muted select-none">
            <span className="text-3xl mb-3">🤖</span>
            <p className="text-xs font-semibold text-text">OpenCode Agent Ready</p>
            <p className="text-[11px] text-muted mt-1 max-w-[220px]">Ask the agent to write, edit, or refactor code. It can read and modify files in your workspace directly.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
            {msg.role === "user" ? (
              <div className="max-w-[85%] rounded-lg bg-accent px-3 py-2 text-xs text-white shadow-sm leading-relaxed">{msg.parts.find((p) => p.type === "text")?.text ?? ""}</div>
            ) : (
              <div className="w-full">{renderParts(msg.parts)}</div>
            )}
          </div>
        ))}
        {toolActivity.length > 0 && (
          <div className="rounded border border-border/40 bg-bg/30 px-2 py-1.5 text-[10px] text-muted font-mono space-y-0.5">
            <div className="text-[9px] text-muted/60 uppercase tracking-wide mb-1">Agent Activity</div>
            {toolActivity.map((line, i) => (<div key={i} className="truncate">{line}</div>))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-3 pt-0">
        <div className="flex flex-col rounded-xl border border-border/80 bg-bg/60 p-2.5 shadow-inner focus-within:border-accent/80 transition-colors">
          <textarea ref={textareaRef} rows={2} value={inputVal} onChange={(e) => setInputVal(e.target.value)} onKeyDown={handleKeyDown} disabled={isSending} placeholder={isSending ? "Agent working..." : "Ask OpenCode to write, edit, or explain code..."} className="w-full resize-none bg-transparent text-xs text-text placeholder:text-muted/60 outline-none leading-relaxed" />
          <div className="mt-2 flex items-center justify-between pt-1 border-t border-border/30">
            <div className="text-[10px] text-muted/60">Workspace tools: file edit · git · shell · LSP</div>
            <button onClick={handleSend} disabled={!inputVal.trim() || isSending} className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${inputVal.trim() && !isSending ? "bg-accent text-white shadow-sm hover:bg-accent-hover cursor-pointer scale-100" : "bg-border/40 text-muted cursor-not-allowed opacity-50"}`} title="Send to OpenCode agent">
              <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
